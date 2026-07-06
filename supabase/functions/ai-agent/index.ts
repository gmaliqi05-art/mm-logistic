import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2";

/*
  Conversational assistant, role-scoped.

  TENANT ISOLATION IS ABSOLUTE: the caller's company_id, role and depot_id are
  read from their authenticated session (never from the client, never from the
  LLM) and are injected into every tool query. The LLM only supplies
  non-sensitive arguments (a partner name, a status); it never sees or controls
  company_id/depot_id and never receives another company's — or another depot's
  — data. No free-form SQL.

  Two tool sets by role:
    - company_admin / accountant / super_admin -> COMPANY_TOOLS (all roles:
      orders, partner statements, stock, invoices, pallet balances).
    - depot_worker -> DEPOT_TOOLS, additionally hard-scoped to the worker's own
      depot_id (their depot only: stock, incoming deliveries, tasks, damaged).

  Self-contained single file. Requires ANTHROPIC_API_KEY; returns 503 until set.
*/

const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const DEFAULT_MODEL = "claude-haiku-4-5-20251001";
const MAX_TOOL_ROUNDS = 6;
const ALLOWED_ROLES = ["company_admin", "accountant", "super_admin", "depot_worker"];

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey, apikey",
};

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

// deno-lint-ignore no-explicit-any
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Json = any;

interface Ctx { companyId: string; depotId: string | null }
interface Caller extends Ctx { userId: string; role: string; admin: SupabaseClient }

async function authenticate(req: Request): Promise<{ ok: true; caller: Caller } | { ok: false; res: Response }> {
  const url = Deno.env.get("SUPABASE_URL");
  const anon = Deno.env.get("SUPABASE_ANON_KEY");
  const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !anon || !service) return { ok: false, res: json(500, { error: "Server misconfigured" }) };

  const auth = req.headers.get("Authorization") || req.headers.get("authorization") || "";
  if (!auth.toLowerCase().startsWith("bearer ")) return { ok: false, res: json(401, { error: "Missing bearer token" }) };

  const userClient = createClient(url, anon, { global: { headers: { Authorization: auth } }, auth: { persistSession: false } });
  const { data: u, error: uErr } = await userClient.auth.getUser();
  if (uErr || !u?.user) return { ok: false, res: json(401, { error: "Invalid session" }) };

  const admin = createClient(url, service, { auth: { persistSession: false } });
  const { data: profile } = await admin.from("profiles").select("id, company_id, role, depot_id, is_active").eq("id", u.user.id).maybeSingle();
  if (!profile) return { ok: false, res: json(401, { error: "Profile not found" }) };
  if (profile.is_active !== true) return { ok: false, res: json(403, { error: "Account disabled" }) };
  if (!ALLOWED_ROLES.includes(profile.role)) return { ok: false, res: json(403, { error: `Role '${profile.role}' not permitted` }) };
  if (!profile.company_id) return { ok: false, res: json(400, { error: "No company for this account" }) };
  if (profile.role === "depot_worker" && !profile.depot_id) return { ok: false, res: json(400, { error: "No depot assigned to this worker" }) };

  return { ok: true, caller: { userId: u.user.id, companyId: profile.company_id, depotId: profile.depot_id ?? null, role: profile.role, admin } };
}

interface Tool {
  name: string;
  description: string;
  input_schema: Json;
  run: (admin: SupabaseClient, ctx: Ctx, input: Json) => Promise<Json>;
}

// ---- Company tools (all roles) --------------------------------------------
const COMPANY_TOOLS: Tool[] = [
  {
    name: "get_stock_summary",
    description: "Current stock on hand for this company, per product/class, condition and depot. Optional product/class name filter (e.g. 'Klasse A', 'euro').",
    input_schema: { type: "object", properties: { product: { type: "string" } } },
    run: async (admin, ctx, input) => {
      const { data } = await admin.from("stock")
        .select("quantity, condition, depots(name), category_products(name), product_categories(name)")
        .eq("company_id", ctx.companyId).gt("quantity", 0);
      let rows = (data ?? []).map((r: Json) => ({ product: r.category_products?.name ?? r.product_categories?.name ?? "—", depot: r.depots?.name ?? "—", condition: r.condition, quantity: r.quantity }));
      const f = String(input?.product ?? "").trim().toLowerCase();
      if (f) rows = rows.filter((r: Json) => r.product.toLowerCase().includes(f));
      return { rows };
    },
  },
  {
    name: "get_partner_overview",
    description: "A partner's account/statement (kartela): most recent orders, pallet balance (Palettenkonto), and open invoices. Use for 'the Kautex account', 'gjendja me kompanin X'.",
    input_schema: { type: "object", required: ["partner"], properties: { partner: { type: "string" } } },
    run: async (admin, ctx, input) => {
      const name = String(input?.partner ?? "").trim();
      if (!name) return { error: "partner name required" };
      const like = `%${name}%`;
      const [notesRes, palletRes, invRes] = await Promise.all([
        admin.from("delivery_notes").select("note_number, type, status, created_at, delivered_at, pallets_delivered, pallets_returned").eq("company_id", ctx.companyId).ilike("partner_name", like).order("created_at", { ascending: false }).limit(5),
        admin.from("pallet_accounts").select("current_balance, pallet_type, acc_contacts!inner(name)").eq("company_id", ctx.companyId).ilike("acc_contacts.name", like),
        admin.from("acc_invoices").select("invoice_number, total, currency, status, due_date, acc_contacts!inner(name)").eq("company_id", ctx.companyId).in("status", ["sent", "partial", "overdue"]).ilike("acc_contacts.name", like).order("due_date", { ascending: true }).limit(10),
      ]);
      return { partner: name, recent_orders: notesRes.data ?? [], pallet_balance: palletRes.data ?? [], open_invoices: invRes.data ?? [] };
    },
  },
  {
    name: "get_last_order",
    description: "The single most recent delivery note/order for a partner, including its line items.",
    input_schema: { type: "object", required: ["partner"], properties: { partner: { type: "string" } } },
    run: async (admin, ctx, input) => {
      const name = String(input?.partner ?? "").trim();
      const { data: notes } = await admin.from("delivery_notes").select("id, note_number, type, status, created_at, delivered_at").eq("company_id", ctx.companyId).ilike("partner_name", `%${name}%`).order("created_at", { ascending: false }).limit(1);
      const note = (notes ?? [])[0];
      if (!note) return { found: false, partner: name };
      const { data: items } = await admin.from("delivery_note_items").select("quantity, condition, category_products(name)").eq("delivery_note_id", note.id);
      return { found: true, order: note, items: (items ?? []).map((i: Json) => ({ product: i.category_products?.name ?? "—", condition: i.condition, quantity: i.quantity })) };
    },
  },
  {
    name: "get_open_invoices",
    description: "This company's unpaid or overdue invoices.",
    input_schema: { type: "object", properties: { only_overdue: { type: "boolean" } } },
    run: async (admin, ctx, input) => {
      const statuses = input?.only_overdue ? ["overdue"] : ["sent", "partial", "overdue"];
      const { data } = await admin.from("acc_invoices").select("invoice_number, total, currency, status, due_date, acc_contacts(name)").eq("company_id", ctx.companyId).in("status", statuses).order("due_date", { ascending: true }).limit(25);
      return { invoices: (data ?? []).map((r: Json) => ({ invoice: r.invoice_number, partner: r.acc_contacts?.name ?? "—", total: r.total, currency: r.currency, status: r.status, due_date: r.due_date })) };
    },
  },
  {
    name: "get_pallet_balances",
    description: "Partners who owe this company pallets (positive Palettenkonto balance), highest first.",
    input_schema: { type: "object", properties: {} },
    run: async (admin, ctx) => {
      const { data } = await admin.from("pallet_accounts").select("current_balance, pallet_type, acc_contacts(name)").eq("company_id", ctx.companyId).gt("current_balance", 0).order("current_balance", { ascending: false }).limit(25);
      return { debtors: (data ?? []).map((r: Json) => ({ partner: r.acc_contacts?.name ?? "—", pallet_type: r.pallet_type, balance: r.current_balance })) };
    },
  },
];

// ---- Depot tools (depot_worker) — hard-scoped to the worker's own depot ----
const DEPOT_TOOLS: Tool[] = [
  {
    name: "get_depot_stock",
    description: "Current stock on hand in THIS depot, per product/class and condition. Optional product/class name filter.",
    input_schema: { type: "object", properties: { product: { type: "string" } } },
    run: async (admin, ctx, input) => {
      const { data } = await admin.from("stock").select("quantity, condition, category_products(name), product_categories(name)").eq("company_id", ctx.companyId).eq("depot_id", ctx.depotId).gt("quantity", 0);
      let rows = (data ?? []).map((r: Json) => ({ product: r.category_products?.name ?? r.product_categories?.name ?? "—", condition: r.condition, quantity: r.quantity }));
      const f = String(input?.product ?? "").trim().toLowerCase();
      if (f) rows = rows.filter((r: Json) => r.product.toLowerCase().includes(f));
      return { rows };
    },
  },
  {
    name: "get_incoming_deliveries",
    description: "Delivery notes assigned to THIS depot that are still in progress or awaiting stock registration.",
    input_schema: { type: "object", properties: {} },
    run: async (admin, ctx) => {
      const { data } = await admin.from("delivery_notes").select("note_number, type, partner_name, status, created_at, stock_posted").eq("company_id", ctx.companyId).eq("assigned_depot_id", ctx.depotId).in("status", ["sent", "in_transit", "pending_company_review", "pending_stock_confirmation", "delivered"]).order("created_at", { ascending: false }).limit(15);
      return { incoming: (data ?? []).map((r: Json) => ({ note: r.note_number, partner: r.partner_name, type: r.type, status: r.status, registered: r.stock_posted === true, date: r.created_at })) };
    },
  },
  {
    name: "get_depot_tasks",
    description: "Open work in THIS depot: sorting batches in progress and repair jobs not yet finished.",
    input_schema: { type: "object", properties: {} },
    run: async (admin, ctx) => {
      const [sortRes, repRes] = await Promise.all([
        admin.from("pallet_sorting_batches").select("total_received, status, created_at").eq("company_id", ctx.companyId).eq("depot_id", ctx.depotId).eq("status", "in_progress").order("created_at", { ascending: false }).limit(20),
        admin.from("depot_repairs").select("quantity_in, quantity_repaired, quantity_scrapped, logged_at, category_products(name)").eq("company_id", ctx.companyId).eq("depot_id", ctx.depotId).order("logged_at", { ascending: false }).limit(50),
      ]);
      const repairsPending = (repRes.data ?? []).filter((r: Json) => (r.quantity_in ?? 0) > (r.quantity_repaired ?? 0) + (r.quantity_scrapped ?? 0))
        .map((r: Json) => ({ product: r.category_products?.name ?? "—", remaining: (r.quantity_in ?? 0) - (r.quantity_repaired ?? 0) - (r.quantity_scrapped ?? 0) }));
      return { sorting_in_progress: (sortRes.data ?? []).map((r: Json) => ({ quantity: r.total_received, since: r.created_at })), repairs_pending: repairsPending };
    },
  },
  {
    name: "get_damaged_stock",
    description: "Damaged (defekt) stock currently in THIS depot.",
    input_schema: { type: "object", properties: {} },
    run: async (admin, ctx) => {
      const { data } = await admin.from("stock").select("quantity, category_products(name)").eq("company_id", ctx.companyId).eq("depot_id", ctx.depotId).eq("condition", "damaged").gt("quantity", 0);
      return { damaged: (data ?? []).map((r: Json) => ({ product: r.category_products?.name ?? "—", quantity: r.quantity })) };
    },
  },
];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json(405, { error: "Method not allowed" });

  const authResult = await authenticate(req);
  if (!authResult.ok) return authResult.res;
  const { companyId, depotId, role, admin } = authResult.caller;

  // Config comes from the super-admin-managed ai_config table first, then env.
  const { data: cfg } = await admin.from("ai_config").select("anthropic_api_key, model, enabled").eq("id", true).maybeSingle();
  if (cfg && cfg.enabled === false) return json(503, { error: "AI assistant is disabled by the administrator." });
  const apiKey = (cfg?.anthropic_api_key && cfg.anthropic_api_key.length > 0) ? cfg.anthropic_api_key : Deno.env.get("ANTHROPIC_API_KEY");
  if (!apiKey) return json(503, { error: "AI assistant not configured. Set the Anthropic API key in Super Admin settings." });
  const model = (cfg?.model && cfg.model.length > 0) ? cfg.model : (Deno.env.get("ANTHROPIC_MODEL") || DEFAULT_MODEL);

  let body: Json;
  try { body = await req.json(); } catch { return json(400, { error: "Invalid JSON" }); }
  const messages: Json[] = Array.isArray(body?.messages) ? body.messages : [];
  if (messages.length === 0) return json(400, { error: "messages required" });

  const isDepot = role === "depot_worker";
  const tools = isDepot ? DEPOT_TOOLS : COMPANY_TOOLS;
  const ctx: Ctx = { companyId, depotId };

  const { data: company } = await admin.from("companies").select("name").eq("id", companyId).maybeSingle();
  const companyName = company?.name ?? "this company";
  let depotName = "";
  if (isDepot && depotId) {
    const { data: d } = await admin.from("depots").select("name").eq("id", depotId).maybeSingle();
    depotName = d?.name ?? "";
  }

  const system = isDepot
    ? `You are the depot assistant for the depot "${depotName}" at company "${companyName}". You ONLY help with operations in THIS depot: stock on hand, incoming deliveries, sorting/repair tasks, and damaged stock. All tool results are already restricted to this depot — never claim to access other depots, other companies, or company-wide finances. Reply in the SAME language as the user's latest message (Albanian, English, German or French). Be concise and concrete. Ask ONE short clarifying question if needed. If a request is outside this depot's scope (e.g. invoices, other depots), say it is not available here. Never invent data.`
    : `You are the MM Logistic assistant — a manager working INSIDE the platform for the company "${companyName}". You answer logistics, depot, fleet and accounting questions FOR THIS COMPANY ONLY. Use the tools to look up data; all tool results are already restricted to this company — never claim to access or compare other companies. Reply in the SAME language as the user's latest message (Albanian, English, German or French). Be concise and concrete: cite numbers, partner names and dates. If a request is ambiguous (e.g. which partner), ask ONE short clarifying question. If no tool covers the request, say so briefly. Never invent data.`;
  const plain = " IMPORTANT: reply in plain conversational text that will be READ ALOUD. Do NOT use any markdown or symbols: no asterisks (**), no bullet points, no headings, no backticks. Write short natural sentences.";
  const systemFinal = system + plain;

  const anthropicTools = tools.map((t) => ({ name: t.name, description: t.description, input_schema: t.input_schema }));
  const convo: Json[] = messages.map((m) => ({ role: m.role === "assistant" ? "assistant" : "user", content: m.content }));
  const collected: Json[] = [];

  try {
    for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
      const resp = await fetch(ANTHROPIC_URL, {
        method: "POST",
        headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01", "content-type": "application/json" },
        body: JSON.stringify({ model, max_tokens: 1024, system: systemFinal, tools: anthropicTools, messages: convo }),
      });
      if (!resp.ok) {
        console.error("anthropic error", resp.status, await resp.text());
        return json(502, { error: "AI service error", detail: resp.status });
      }
      const data = await resp.json();
      convo.push({ role: "assistant", content: data.content });

      if (data.stop_reason === "tool_use") {
        const toolResults: Json[] = [];
        for (const block of data.content) {
          if (block.type !== "tool_use") continue;
          const tool = tools.find((t) => t.name === block.name);
          let result: Json;
          try {
            result = tool ? await tool.run(admin, ctx, block.input) : { error: "unknown tool" };
          } catch (e) {
            result = { error: e instanceof Error ? e.message : "tool failed" };
          }
          collected.push({ tool: block.name, input: block.input, result });
          toolResults.push({ type: "tool_result", tool_use_id: block.id, content: JSON.stringify(result) });
        }
        convo.push({ role: "user", content: toolResults });
        continue;
      }

      const answer = (data.content ?? []).filter((b: Json) => b.type === "text").map((b: Json) => b.text).join("\n").trim();
      return json(200, { answer, data: collected });
    }
    return json(200, { answer: "…", data: collected });
  } catch (e) {
    console.error("ai-agent failure", e);
    return json(500, { error: "Assistant failed" });
  }
});
