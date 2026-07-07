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
    - company_admin / accountant / super_admin -> COMPANY_TOOLS. Full access
      across every area of THIS company: stock, orders/deliveries, movements
      (who registered / which driver), partner statements, invoices, pallet
      balances, fleet, drivers, HR, and navigation to every company page.
    - depot_worker -> DEPOT_TOOLS, additionally hard-scoped to the worker's own
      depot_id. Everything the depot role can see: stock, incoming/outgoing
      deliveries, sorting & repair tasks, damaged stock, depot movements, and
      navigation to every depot page.

  Self-contained single file. Requires an Anthropic API key (ai_config table,
  managed in Super Admin, or ANTHROPIC_API_KEY env); returns 503 until set.
*/

const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const DEFAULT_MODEL = "claude-opus-4-8";
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

// Resolve a set of category_product_ids / depot_ids to display names in one
// round-trip each (used to make movement rows human-readable).
async function nameMaps(admin: SupabaseClient, companyId: string, productIds: string[], depotIds: string[]) {
  const products: Record<string, string> = {};
  const depots: Record<string, string> = {};
  const pIds = [...new Set(productIds.filter(Boolean))];
  const dIds = [...new Set(depotIds.filter(Boolean))];
  const [pRes, dRes] = await Promise.all([
    pIds.length ? admin.from("category_products").select("id, name").eq("company_id", companyId).in("id", pIds) : Promise.resolve({ data: [] }),
    dIds.length ? admin.from("depots").select("id, name").eq("company_id", companyId).in("id", dIds) : Promise.resolve({ data: [] }),
  ]);
  for (const r of (pRes.data ?? []) as Json[]) products[r.id] = r.name;
  for (const r of (dRes.data ?? []) as Json[]) depots[r.id] = r.name;
  return { products, depots };
}

// ---- Company tools (company_admin / accountant / super_admin) --------------
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
    name: "list_recent_orders",
    description: "Recent delivery notes/orders for this company, newest first. Optionally filter by type (delivery=outgoing, pickup=incoming), by status, or by partner name. Use for 'the last orders', 'incoming this week', 'pending orders'.",
    input_schema: { type: "object", properties: {
      type: { type: "string", enum: ["delivery", "pickup"] },
      status: { type: "string", description: "e.g. sent, in_transit, delivered, pending_company_review, cancelled" },
      partner: { type: "string" },
    } },
    run: async (admin, ctx, input) => {
      let q = admin.from("delivery_notes").select("note_number, type, partner_name, status, created_at, delivered_at, stock_posted").eq("company_id", ctx.companyId).order("created_at", { ascending: false }).limit(20);
      if (input?.type) q = q.eq("type", String(input.type));
      if (input?.status) q = q.eq("status", String(input.status));
      if (input?.partner) q = q.ilike("partner_name", `%${String(input.partner)}%`);
      const { data } = await q;
      return { orders: (data ?? []).map((r: Json) => ({ note: r.note_number, partner: r.partner_name, type: r.type, status: r.status, registered: r.stock_posted === true, date: r.created_at })) };
    },
  },
  {
    name: "get_recent_movements",
    description: "Recent stock movements (registrations) for this company: what came in/out, WHO registered it (the depot worker) and WHICH driver delivered/collected it. Use for 'who registered', 'which driver brought the Kautex pallets', 'last movements'.",
    input_schema: { type: "object", properties: {
      partner: { type: "string" },
      direction: { type: "string", enum: ["in", "out"], description: "in = received, out = shipped" },
    } },
    run: async (admin, ctx, input) => {
      let q = admin.from("v_company_movements").select("movement_type, quantity_delta, condition, category_product_id, depot_id, movement_date, performed_by_full_name, driver_full_name, source_partner, source_contact_name").eq("company_id", ctx.companyId).order("movement_date", { ascending: false }).limit(25);
      if (input?.direction === "in") q = q.gt("quantity_delta", 0);
      if (input?.direction === "out") q = q.lt("quantity_delta", 0);
      const { data } = await q;
      let rows = (data ?? []) as Json[];
      const p = String(input?.partner ?? "").trim().toLowerCase();
      if (p) rows = rows.filter((r) => `${r.source_partner ?? ""} ${r.source_contact_name ?? ""}`.toLowerCase().includes(p));
      const { products, depots } = await nameMaps(admin, ctx.companyId, rows.map((r) => r.category_product_id), rows.map((r) => r.depot_id));
      return { movements: rows.map((r) => ({
        type: r.movement_type,
        product: products[r.category_product_id] ?? "—",
        depot: depots[r.depot_id] ?? "—",
        condition: r.condition,
        quantity: r.quantity_delta,
        registered_by: r.performed_by_full_name ?? "—",
        driver: r.driver_full_name ?? "—",
        partner: r.source_contact_name ?? r.source_partner ?? "—",
        date: r.movement_date,
      })) };
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
  {
    name: "search_partners",
    description: "Look up this company's partners/contacts by name (or list them). Returns contact details.",
    input_schema: { type: "object", properties: { query: { type: "string" } } },
    run: async (admin, ctx, input) => {
      let q = admin.from("acc_contacts").select("name, contact_type, city, country, vat_number, email, phone").eq("company_id", ctx.companyId).eq("is_active", true).order("name", { ascending: true }).limit(25);
      const s = String(input?.query ?? "").trim();
      if (s) q = q.ilike("name", `%${s}%`);
      const { data } = await q;
      return { partners: data ?? [] };
    },
  },
  {
    name: "get_fleet_overview",
    description: "This company's fleet: vehicles (and trailers), the drivers, and any fleet/driver compliance documents expiring soon (TÜV, insurance, licences). Use for 'the fleet', 'which documents expire', 'how many trucks'.",
    input_schema: { type: "object", properties: {} },
    run: async (admin, ctx) => {
      const soon = new Date(); soon.setDate(soon.getDate() + 60);
      const [vehRes, drvRes, cmpRes] = await Promise.all([
        admin.from("vehicles").select("vehicle_type, brand, model, license_plate, status").eq("company_id", ctx.companyId).order("created_at", { ascending: false }).limit(50),
        admin.from("profiles").select("full_name, phone, is_active").eq("company_id", ctx.companyId).eq("role", "driver").limit(50),
        admin.from("compliance_reminders").select("entity_type, compliance_type, expiry_date").eq("company_id", ctx.companyId).lte("expiry_date", soon.toISOString().slice(0, 10)).order("expiry_date", { ascending: true }).limit(25),
      ]);
      return {
        vehicles: (vehRes.data ?? []).map((r: Json) => ({ type: r.vehicle_type, name: `${r.brand ?? ""} ${r.model ?? ""}`.trim(), plate: r.license_plate, status: r.status })),
        drivers: (drvRes.data ?? []).map((r: Json) => ({ name: r.full_name, phone: r.phone, active: r.is_active === true })),
        expiring_documents: (cmpRes.data ?? []).map((r: Json) => ({ entity: r.entity_type, document: r.compliance_type, expires: r.expiry_date })),
      };
    },
  },
  {
    name: "get_hr_overview",
    description: "HR snapshot for this company: pending leave requests awaiting approval and who is on leave today. Use for 'leave requests', 'who is off today', 'pending approvals'.",
    input_schema: { type: "object", properties: {} },
    run: async (admin, ctx) => {
      const today = new Date().toISOString().slice(0, 10);
      const [pendRes, offRes] = await Promise.all([
        admin.from("leave_requests").select("start_date, end_date, total_days, status, reason, profiles_private!user_id(full_name), leave_types(name_sq, name_en)").eq("company_id", ctx.companyId).eq("status", "pending").order("start_date", { ascending: true }).limit(25),
        admin.from("leave_requests").select("start_date, end_date, profiles_private!user_id(full_name), leave_types(name_sq, name_en)").eq("company_id", ctx.companyId).eq("status", "approved").lte("start_date", today).gte("end_date", today).limit(25),
      ]);
      return {
        pending_requests: (pendRes.data ?? []).map((r: Json) => ({ who: r.profiles_private?.full_name ?? "—", type: r.leave_types?.name_sq ?? r.leave_types?.name_en ?? "—", from: r.start_date, to: r.end_date, days: r.total_days })),
        on_leave_today: (offRes.data ?? []).map((r: Json) => ({ who: r.profiles_private?.full_name ?? "—", type: r.leave_types?.name_sq ?? r.leave_types?.name_en ?? "—", until: r.end_date })),
      };
    },
  },
  {
    name: "get_uninvoiced_deliveries",
    description: "Outgoing delivery notes that do NOT yet have an invoice, newest first. Optional partner filter. Use for 'which delivery notes are not invoiced yet', 'the last delivery for Kautex we have not invoiced'. Each item includes a delivery_note_id to pass to navigate_to page 'new_invoice' to open an invoice pre-filled from that delivery note.",
    input_schema: { type: "object", properties: { partner: { type: "string" } } },
    run: async (admin, ctx, input) => {
      let q = admin.from("delivery_notes").select("id, note_number, document_number, partner_name, delivered_at, created_at").eq("company_id", ctx.companyId).is("acc_invoice_id", null).eq("type", "delivery").order("created_at", { ascending: false }).limit(15);
      if (input?.partner) q = q.ilike("partner_name", `%${String(input.partner)}%`);
      const { data } = await q;
      return { uninvoiced: (data ?? []).map((r: Json) => ({ delivery_note_id: r.id, note: r.note_number ?? r.document_number ?? "—", partner: r.partner_name, date: r.delivered_at ?? r.created_at })) };
    },
  },
  {
    name: "get_driver_activity",
    description: "What a specific driver (BY NAME) has delivered or picked up — their delivery notes, newest first. Optional direction (delivery=outgoing, pickup=incoming). Use for 'which deliveries did driver Gentoni do', 'cili shofer solli mallin e Kautex'.",
    input_schema: { type: "object", required: ["driver"], properties: { driver: { type: "string" }, direction: { type: "string", enum: ["delivery", "pickup"] } } },
    run: async (admin, ctx, input) => {
      const name = String(input?.driver ?? "").trim();
      if (!name) return { error: "driver name required" };
      const { data: drivers } = await admin.from("profiles").select("id, full_name").eq("company_id", ctx.companyId).eq("role", "driver").ilike("full_name", `%${name}%`).limit(5);
      if (!drivers || drivers.length === 0) return { found: false, driver: name };
      const nameById: Record<string, string> = {};
      for (const d of drivers as Json[]) nameById[d.id] = d.full_name;
      let q = admin.from("delivery_notes").select("note_number, type, partner_name, status, delivered_at, created_at, assigned_driver_id").eq("company_id", ctx.companyId).in("assigned_driver_id", Object.keys(nameById)).order("created_at", { ascending: false }).limit(20);
      if (input?.direction) q = q.eq("type", String(input.direction));
      const { data } = await q;
      return { driver: Object.values(nameById).join(", "), activity: (data ?? []).map((r: Json) => ({ note: r.note_number, type: r.type, partner: r.partner_name, status: r.status, driver: nameById[r.assigned_driver_id] ?? "—", date: r.delivered_at ?? r.created_at })) };
    },
  },
  {
    name: "get_worker_stats",
    description: "Repair history and productivity for a specific depot worker BY NAME: total pallets repaired, total scrapped, number of jobs, and recent jobs. Use for 'sa paleta ka reparuar Idi', 'historiku i punetorit X', 'how many pallets did worker Y repair'.",
    input_schema: { type: "object", required: ["worker"], properties: { worker: { type: "string" } } },
    run: async (admin, ctx, input) => {
      const name = String(input?.worker ?? "").trim();
      if (!name) return { error: "worker name required" };
      const { data: workers } = await admin.from("profiles").select("id, full_name").eq("company_id", ctx.companyId).ilike("full_name", `%${name}%`).limit(5);
      if (!workers || workers.length === 0) return { found: false, worker: name };
      const ids = (workers as Json[]).map((w) => w.id);
      const { data: reps } = await admin.from("depot_repairs").select("worker_id, quantity_repaired, quantity_scrapped, logged_at, category_products(name)").eq("company_id", ctx.companyId).in("worker_id", ids).order("logged_at", { ascending: false }).limit(300);
      const stats = (workers as Json[]).map((w) => {
        const rows = ((reps ?? []) as Json[]).filter((r) => r.worker_id === w.id);
        return {
          worker: w.full_name,
          total_repaired: rows.reduce((s, r) => s + (r.quantity_repaired ?? 0), 0),
          total_scrapped: rows.reduce((s, r) => s + (r.quantity_scrapped ?? 0), 0),
          jobs: rows.length,
          recent: rows.slice(0, 5).map((r) => ({ product: r.category_products?.name ?? "—", repaired: r.quantity_repaired, scrapped: r.quantity_scrapped, date: r.logged_at })),
        };
      });
      return { workers: stats };
    },
  },
  {
    name: "navigate_to",
    description: "Open a page in the app for the user (they can then see or act on it). Use whenever the user asks to open/show a page, a partner's orders, or to start something new. 'deliveries' can be filtered by partner and by type (delivery=outgoing, pickup=incoming). 'new_order' opens the create-order form ready. 'new_invoice' opens the create-invoice form ready. You MUST call this tool to actually open anything — describing it in words does NOT open it.",
    input_schema: { type: "object", required: ["page"], properties: {
      page: { type: "string", enum: [
        "stock", "deliveries", "repairs", "sorting", "sorting_reports", "pallet_accounts", "partners", "partner_flows", "reports", "invoices", "new_order", "new_invoice",
        "fleet", "fleet_reports", "fleet_scans", "trailers", "drivers", "compliance", "live_map", "route_planner", "depots", "categories", "client_prices",
        "hr", "hr_requests", "attendance", "work_hours", "hr_reports", "hr_leave", "financials", "audit_log", "audit_report", "worker_repair_stats",
        "documents", "review", "overdue", "stock_alerts", "data_export", "chat", "email", "settings", "manual",
      ] },
      partner: { type: "string", description: "optional partner name (filters deliveries; also pre-fills the partner on a new order)" },
      order_type: { type: "string", enum: ["delivery", "pickup"], description: "delivery = outgoing, pickup = incoming" },
      driver: { type: "string", description: "optional driver name to pre-fill on a new order (new_order)" },
      title: { type: "string", description: "optional title/subject to pre-fill as the partner on a new order (new_order)" },
      items: { type: "array", description: "new_order: item lines to pre-fill — products by name with quantities (and optional condition good|damaged)", items: { type: "object", properties: { name: { type: "string" }, qty: { type: "number" }, condition: { type: "string", enum: ["good", "damaged"] } } } },
      delivery_note_id: { type: "string", description: "optional delivery note id to pre-fill a new invoice from (use with page new_invoice; get it from get_uninvoiced_deliveries)" },
    } },
    // deno-lint-ignore require-await
    run: async (_admin, _ctx, input) => {
      const map: Record<string, string> = {
        stock: "/company/stock", deliveries: "/company/delivery-notes", repairs: "/company/repair-reports",
        sorting: "/company/sorting", sorting_reports: "/company/sorting-reports", pallet_accounts: "/company/pallet-accounts",
        partners: "/company/partners", partner_flows: "/company/partner-flows",
        reports: "/company/reports", invoices: "/company/invoices", new_invoice: "/company/invoices/new", fleet: "/company/vehicles",
        fleet_reports: "/company/fleet-reports", fleet_scans: "/company/fleet-scans",
        trailers: "/company/trailers", drivers: "/company/drivers", compliance: "/company/compliance",
        live_map: "/company/live-map", route_planner: "/company/route-planner", depots: "/company/depots",
        categories: "/company/categories", client_prices: "/company/client-prices", hr: "/company/hr",
        hr_requests: "/company/hr/requests", attendance: "/company/hr/attendance", work_hours: "/company/hr/work-hours",
        hr_reports: "/company/hr/reports", hr_leave: "/company/hr/leave",
        financials: "/company/financial-summary", audit_log: "/company/audit-log", audit_report: "/company/audit-report",
        worker_repair_stats: "/company/worker-repair-stats",
        documents: "/company/documents", review: "/company/review", overdue: "/company/overdue",
        stock_alerts: "/company/stock-alerts", data_export: "/company/data-export", chat: "/company/chat",
        email: "/company/email/templates", settings: "/company/settings", manual: "/company/manual",
      };
      const page = String(input?.page ?? "");
      const q = new URLSearchParams();
      let path = map[page] ?? "";
      if (page === "new_order") { path = "/company/delivery-notes"; q.set("new", "1"); if (input?.order_type) q.set("type", String(input.order_type)); if (input?.partner) q.set("partner", String(input.partner)); if (input?.title) q.set("title", String(input.title)); if (input?.driver) q.set("driver", String(input.driver)); if (Array.isArray(input?.items) && input.items.length) { const items = input.items.map((it: Json) => ({ name: String(it?.name ?? ""), qty: Math.max(0, Math.floor(Number(it?.qty) || 0)), condition: it?.condition === "damaged" ? "damaged" : "good" })).filter((it: Json) => it.name); if (items.length) q.set("items", JSON.stringify(items)); } }
      else if (page === "new_invoice") { path = "/company/invoices/new"; if (input?.delivery_note_id) q.set("delivery_note_id", String(input.delivery_note_id)); }
      else if (page === "deliveries") { if (input?.partner) q.set("partner", String(input.partner)); if (input?.order_type) q.set("type", String(input.order_type)); }
      if (!path) return { error: "unknown page" };
      const qs = q.toString();
      return { navigate: qs ? `${path}?${qs}` : path, page };
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
    name: "list_depot_orders",
    description: "Orders/delivery notes for THIS depot, newest first. Optionally filter by type (delivery=outgoing, pickup=incoming), status or partner. Use for 'the last orders here', 'what did we ship today'.",
    input_schema: { type: "object", properties: {
      type: { type: "string", enum: ["delivery", "pickup"] },
      status: { type: "string" },
      partner: { type: "string" },
    } },
    run: async (admin, ctx, input) => {
      let q = admin.from("delivery_notes").select("note_number, type, partner_name, status, created_at, stock_posted").eq("company_id", ctx.companyId).eq("assigned_depot_id", ctx.depotId).order("created_at", { ascending: false }).limit(20);
      if (input?.type) q = q.eq("type", String(input.type));
      if (input?.status) q = q.eq("status", String(input.status));
      if (input?.partner) q = q.ilike("partner_name", `%${String(input.partner)}%`);
      const { data } = await q;
      return { orders: (data ?? []).map((r: Json) => ({ note: r.note_number, partner: r.partner_name, type: r.type, status: r.status, registered: r.stock_posted === true, date: r.created_at })) };
    },
  },
  {
    name: "get_depot_movements",
    description: "Recent stock movements in THIS depot: what was received/shipped, who registered it and which driver was involved. Use for 'who registered', 'last movements here'.",
    input_schema: { type: "object", properties: { direction: { type: "string", enum: ["in", "out"] } } },
    run: async (admin, ctx, input) => {
      let q = admin.from("v_company_movements").select("movement_type, quantity_delta, condition, category_product_id, movement_date, performed_by_full_name, driver_full_name, source_partner, source_contact_name").eq("company_id", ctx.companyId).eq("depot_id", ctx.depotId).order("movement_date", { ascending: false }).limit(25);
      if (input?.direction === "in") q = q.gt("quantity_delta", 0);
      if (input?.direction === "out") q = q.lt("quantity_delta", 0);
      const { data } = await q;
      const rows = (data ?? []) as Json[];
      const { products } = await nameMaps(admin, ctx.companyId, rows.map((r) => r.category_product_id), []);
      return { movements: rows.map((r) => ({ type: r.movement_type, product: products[r.category_product_id] ?? "—", condition: r.condition, quantity: r.quantity_delta, registered_by: r.performed_by_full_name ?? "—", driver: r.driver_full_name ?? "—", partner: r.source_contact_name ?? r.source_partner ?? "—", date: r.movement_date })) };
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
  {
    name: "get_worker_stats",
    description: "Repair history for a worker in THIS depot BY NAME: total pallets repaired, scrapped, jobs, and recent jobs. Use for 'sa paleta ka reparuar Idi', 'historiku i punetorit X'.",
    input_schema: { type: "object", required: ["worker"], properties: { worker: { type: "string" } } },
    run: async (admin, ctx, input) => {
      const name = String(input?.worker ?? "").trim();
      if (!name) return { error: "worker name required" };
      const { data: workers } = await admin.from("profiles").select("id, full_name").eq("company_id", ctx.companyId).eq("depot_id", ctx.depotId).ilike("full_name", `%${name}%`).limit(5);
      if (!workers || workers.length === 0) return { found: false, worker: name };
      const ids = (workers as Json[]).map((w) => w.id);
      const { data: reps } = await admin.from("depot_repairs").select("worker_id, quantity_repaired, quantity_scrapped, logged_at, category_products(name)").eq("company_id", ctx.companyId).eq("depot_id", ctx.depotId).in("worker_id", ids).order("logged_at", { ascending: false }).limit(300);
      const stats = (workers as Json[]).map((w) => {
        const rows = ((reps ?? []) as Json[]).filter((r) => r.worker_id === w.id);
        return {
          worker: w.full_name,
          total_repaired: rows.reduce((s, r) => s + (r.quantity_repaired ?? 0), 0),
          total_scrapped: rows.reduce((s, r) => s + (r.quantity_scrapped ?? 0), 0),
          jobs: rows.length,
          recent: rows.slice(0, 5).map((r) => ({ product: r.category_products?.name ?? "—", repaired: r.quantity_repaired, scrapped: r.quantity_scrapped, date: r.logged_at })),
        };
      });
      return { workers: stats };
    },
  },
  {
    name: "navigate_to",
    description: "Open a page in THIS depot's app for the user. Use whenever they ask to open/show a depot page or start receiving new goods. SORTING FILL: for page 'sorting' you can pre-fill the in-progress batch's quantities — pass a (Klasse A), b (Klasse B), c (Klasse C), d (Defekt) as numbers; the form opens with those numbers so the user can review and edit. Pass save=true ONLY when the user explicitly says to save/complete to stock (e.g. 'ruaj ne stok'). You MUST call this tool to actually open or fill anything.",
    input_schema: { type: "object", required: ["page"], properties: {
      page: { type: "string", enum: ["stock", "receiving", "outgoing", "sorting", "sorting_reports", "repairs", "repair_workers", "damage", "reports", "deliveries", "trailers", "documents", "attendance", "work_hours", "leave", "chat", "settings", "manual", "new_order"] },
      a: { type: "number", description: "Klasse A quantity (sorting shorthand)" },
      b: { type: "number", description: "Klasse B quantity (sorting shorthand)" },
      c: { type: "number", description: "Klasse C quantity (sorting shorthand)" },
      d: { type: "number", description: "Defekt quantity (sorting shorthand)" },
      items: { type: "array", description: "list of products by name with quantities — for sorting OR receiving (each batch/intake has different products). Optional condition 'good'|'damaged' per item.", items: { type: "object", properties: { name: { type: "string" }, qty: { type: "number" }, condition: { type: "string", enum: ["good", "damaged"] } } } },
      partner: { type: "string", description: "receiving: the source partner/supplier name" },
      repair: { type: "string", description: "repairs: the damaged product name to open the repair for" },
      repaired: { type: "number", description: "repairs: quantity repaired (pre-fills the modal)" },
      scrapped: { type: "number", description: "repairs: quantity scrapped (pre-fills the modal)" },
      save: { type: "boolean", description: "sorting/receiving: save/complete to stock (only when the user explicitly says to save)" },
    } },
    // deno-lint-ignore require-await
    run: async (_admin, _ctx, input) => {
      const map: Record<string, string> = {
        stock: "/depot/stock", receiving: "/depot/receiving", outgoing: "/depot/outgoing", sorting: "/depot/sorting",
        sorting_reports: "/depot/sorting", repairs: "/depot/repairs", repair_workers: "/depot/repair-workers", damage: "/depot/damage",
        reports: "/depot/reports", deliveries: "/depot/delivery-notes", trailers: "/depot/trailers", documents: "/depot/documents",
        attendance: "/depot/attendance", work_hours: "/depot/work-hours", leave: "/depot/leave", chat: "/depot/chat",
        settings: "/depot/settings", manual: "/depot/manual", new_order: "/depot/receiving",
      };
      const page = String(input?.page ?? "");
      const path = map[page];
      if (!path) return { error: "unknown page" };
      if (page === "sorting") {
        const q = new URLSearchParams();
        for (const k of ["a", "b", "c", "d"] as const) {
          if (input?.[k] !== undefined && input?.[k] !== null) q.set(k, String(Math.max(0, Math.floor(Number(input[k]) || 0))));
        }
        if (Array.isArray(input?.items) && input.items.length) {
          const items = input.items.map((it: Json) => ({ name: String(it?.name ?? ""), qty: Math.max(0, Math.floor(Number(it?.qty) || 0)) })).filter((it: Json) => it.name);
          if (items.length) q.set("items", JSON.stringify(items));
        }
        if (input?.save === true) q.set("save", "1");
        const qs = q.toString();
        return { navigate: qs ? `${path}?${qs}` : path, page };
      }
      if (page === "receiving") {
        const q = new URLSearchParams();
        if (Array.isArray(input?.items) && input.items.length) {
          const items = input.items.map((it: Json) => ({ name: String(it?.name ?? ""), qty: Math.max(0, Math.floor(Number(it?.qty) || 0)), condition: it?.condition === "damaged" ? "damaged" : "good" })).filter((it: Json) => it.name);
          if (items.length) q.set("items", JSON.stringify(items));
        }
        if (input?.partner) q.set("partner", String(input.partner));
        if (input?.save === true) q.set("save", "1");
        const qs = q.toString();
        return { navigate: qs ? `${path}?${qs}` : path, page };
      }
      if (page === "repairs") {
        const q = new URLSearchParams();
        if (input?.repair) q.set("repair", String(input.repair));
        if (input?.repaired !== undefined && input?.repaired !== null) q.set("repaired", String(Math.max(0, Math.floor(Number(input.repaired) || 0))));
        if (input?.scrapped !== undefined && input?.scrapped !== null) q.set("scrapped", String(Math.max(0, Math.floor(Number(input.scrapped) || 0))));
        const qs = q.toString();
        return { navigate: qs ? `${path}?${qs}` : path, page };
      }
      return { navigate: path, page };
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
    ? `You are the depot assistant for the depot "${depotName}" at company "${companyName}". You have FULL access to everything within this depot's privileges: stock on hand, incoming and outgoing deliveries/orders, stock movements (who registered them, which driver), sorting and repair tasks, damaged stock, and every depot page. All tool results are already restricted to THIS depot — never claim to access other depots, other companies, or company-wide finances. Reply in the SAME language as the user's latest message (Albanian, English, German or French). Be concise and concrete. Ask ONE short clarifying question only if truly needed. If a request is genuinely outside this depot's scope (e.g. company invoices, other depots), say it is not available here. Never invent data. SORTING: when the user dictates quantities, call navigate_to page 'sorting' so the numbers appear in the form; use a/b/c/d for simple Klasse A/B/C/Defekt, OR the items list [{name, qty}] for any named products (batches have different products each time). Tell them to review, and only pass save=true when they explicitly say to save/complete to stock. RECEIVING (pranim): when the user dictates an intake, call navigate_to page 'receiving' with items [{name, qty, condition}] and optional partner; the form fills for the user to review before saving. REPAIR (reparatur): call navigate_to page 'repairs' with repair=<product name> plus repaired and/or scrapped numbers; the repair opens pre-filled for the user to review and apply.`
    : `You are the MM Logistic manager assistant — working INSIDE the platform for the company "${companyName}". You have FULL access to everything for THIS company across every role and area: stock, orders and deliveries (incoming and outgoing), stock movements (who registered them and which driver), partner statements and pallet accounts, invoices and finances, fleet and drivers, compliance documents, and HR (leave, attendance). Use the tools to look up data; all tool results are already restricted to this company — never claim to access or compare other companies. Reply in the SAME language as the user's latest message (Albanian, English, German or French). Be concise and concrete: cite numbers, partner names and dates. If a request is ambiguous (e.g. which partner), ask ONE short clarifying question. If no tool covers the request, say so briefly. Never invent data.`;
  const plain = " ACTIONS: When the user asks to OPEN, SHOW, START or CREATE anything (a page, a partner's orders, a new order, a new invoice), you MUST actually call the navigate_to tool in this same turn. NEVER say you have opened, created or started something unless you have just called navigate_to for it — do not fake it. Call the tool first, then briefly confirm in words what you are opening (e.g. 'Po hap faturën e re'). For a new order you can pre-fill it: pass the partner (or title) and the driver name to navigate_to with page 'new_order'; the form opens ready and the user confirms and saves it — you never claim the order is created, only that you opened it prepared. INVOICING: to make an invoice from a delivery note, first call get_uninvoiced_deliveries (optionally by partner) to find delivery notes without an invoice. If the user asked for 'the last one' and there is a clear newest match, use it; if several are relevant, briefly list them and ASK which one. Then call navigate_to with page 'new_invoice' and that delivery_note_id — the invoice opens pre-filled from the delivery note for the user to confirm and save. SPELLING: voice input often mis-hears names. If a partner or driver name does not exactly match, use search_partners (for partners) to find the closest real name, and if you find a near match, CONFIRM it in your reply before or while acting (e.g. user said 'kautes' → 'A e ke fjalën për Kautex? Po e hap porosinë për Kautex.'). Never invent a name; prefer the closest existing one and confirm. You may look up data AND navigate in the same turn. IMPORTANT: reply in plain conversational text that will be READ ALOUD to the user. Speak naturally, warmly, like a helpful colleague talking, not like a report. Do NOT use any markdown or symbols: no asterisks, no bullet points, no headings, no backticks. Keep sentences short and natural.";
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
