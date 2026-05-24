import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface Payload {
  bank_account_id: string;
  file_name: string;
  content: string;
  currency?: string;
}

interface ParsedLine {
  booking_date: string | null;
  value_date: string | null;
  amount: number;
  currency: string;
  counterparty_name: string;
  counterparty_iban: string;
  reference: string;
  end_to_end_id: string;
  description: string;
}

interface ParsedStatement {
  format: "camt053" | "mt940";
  statement_date: string | null;
  opening_balance: number;
  closing_balance: number;
  currency: string;
  lines: ParsedLine[];
}

function getTag(xml: string, tag: string): string {
  const m = xml.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`));
  return m ? m[1].trim() : "";
}

function getAllTags(xml: string, tag: string): string[] {
  const rx = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "g");
  const out: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = rx.exec(xml))) out.push(m[1]);
  return out;
}

function parseCamt053(xml: string): ParsedStatement {
  const stmt = getTag(xml, "Stmt") || xml;
  const currency = getTag(stmt, "Ccy") || "EUR";
  const statementDate = (getTag(stmt, "CreDtTm") || "").slice(0, 10) || null;

  let opening = 0;
  let closing = 0;
  const balBlocks = getAllTags(stmt, "Bal");
  for (const bal of balBlocks) {
    const code = getTag(bal, "Cd");
    const amt = parseFloat(getTag(bal, "Amt") || "0") || 0;
    const cdtDbt = getTag(bal, "CdtDbtInd");
    const signed = cdtDbt === "DBIT" ? -amt : amt;
    if (code === "OPBD" || code === "PRCD") opening = signed;
    if (code === "CLBD") closing = signed;
  }

  const lines: ParsedLine[] = [];
  for (const entry of getAllTags(stmt, "Ntry")) {
    const amount = parseFloat(getTag(entry, "Amt") || "0") || 0;
    const cdtDbt = getTag(entry, "CdtDbtInd");
    const signedAmount = cdtDbt === "DBIT" ? -amount : amount;
    const bookingDate = (getTag(entry, "BookgDt") || "").match(/\d{4}-\d{2}-\d{2}/)?.[0] ?? null;
    const valueDate = (getTag(entry, "ValDt") || "").match(/\d{4}-\d{2}-\d{2}/)?.[0] ?? null;

    const detail = getTag(entry, "NtryDtls") + getTag(entry, "TxDtls");
    const rmtInf = getTag(detail, "RmtInf") || getTag(entry, "AddtlNtryInf");
    const ustrd = getAllTags(rmtInf, "Ustrd").join(" ").trim();
    const endToEnd = getTag(detail, "EndToEndId");

    let counterpartyName = "";
    let counterpartyIban = "";
    const cdtr = getTag(detail, cdtDbt === "DBIT" ? "Cdtr" : "Dbtr");
    counterpartyName = getTag(cdtr, "Nm");
    const acct = getTag(detail, cdtDbt === "DBIT" ? "CdtrAcct" : "DbtrAcct");
    counterpartyIban = getTag(acct, "IBAN");

    lines.push({
      booking_date: bookingDate,
      value_date: valueDate,
      amount: signedAmount,
      currency,
      counterparty_name: counterpartyName,
      counterparty_iban: counterpartyIban,
      reference: ustrd,
      end_to_end_id: endToEnd,
      description: ustrd || endToEnd || counterpartyName,
    });
  }

  return { format: "camt053", statement_date: statementDate, opening_balance: opening, closing_balance: closing, currency, lines };
}

function parseMt940(text: string): ParsedStatement {
  const currency = (text.match(/:60F:[CD]\d{6}([A-Z]{3})/) || [])[1] || "EUR";
  const openingMatch = text.match(/:60F:([CD])\d{6}[A-Z]{3}([\d,.]+)/);
  const closingMatch = text.match(/:62F:([CD])\d{6}[A-Z]{3}([\d,.]+)/);
  const parseAmt = (s: string) => parseFloat(s.replace(",", ".")) || 0;
  const opening = openingMatch ? (openingMatch[1] === "D" ? -parseAmt(openingMatch[2]) : parseAmt(openingMatch[2])) : 0;
  const closing = closingMatch ? (closingMatch[1] === "D" ? -parseAmt(closingMatch[2]) : parseAmt(closingMatch[2])) : 0;

  const lines: ParsedLine[] = [];
  const rx = /:61:(\d{6})(?:\d{4})?([CD])R?([\d,.]+)N[A-Z0-9]{3}([^\r\n]*)[\r\n]+(?::86:([\s\S]*?)(?=(?::\d{2}[A-Z]?:|$)))?/g;
  let m: RegExpExecArray | null;
  while ((m = rx.exec(text))) {
    const yy = m[1].slice(0, 2);
    const mm = m[1].slice(2, 4);
    const dd = m[1].slice(4, 6);
    const year = Number(yy) >= 70 ? `19${yy}` : `20${yy}`;
    const bookingDate = `${year}-${mm}-${dd}`;
    const sign = m[2] === "D" ? -1 : 1;
    const amount = sign * parseAmt(m[3]);
    const desc = (m[5] || "").replace(/\s+/g, " ").trim();
    const endToEnd = (desc.match(/EREF\+([^ ]+)/) || [])[1] || "";
    const counterpartyIban = (desc.match(/([A-Z]{2}\d{2}[A-Z0-9]{10,30})/) || [])[1] || "";
    lines.push({
      booking_date: bookingDate,
      value_date: bookingDate,
      amount,
      currency,
      counterparty_name: "",
      counterparty_iban: counterpartyIban,
      reference: desc,
      end_to_end_id: endToEnd,
      description: desc,
    });
  }

  const dateMatch = text.match(/:60F:[CD](\d{6})/);
  let statementDate: string | null = null;
  if (dateMatch) {
    const yy = dateMatch[1].slice(0, 2);
    const mm = dateMatch[1].slice(2, 4);
    const dd = dateMatch[1].slice(4, 6);
    const year = Number(yy) >= 70 ? `19${yy}` : `20${yy}`;
    statementDate = `${year}-${mm}-${dd}`;
  }

  return { format: "mt940", statement_date: statementDate, opening_balance: opening, closing_balance: closing, currency, lines };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: corsHeaders });

  try {
    const auth = req.headers.get("Authorization") || "";
    if (!auth.startsWith("Bearer ")) throw new Error("Unauthorized");

    const userClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: auth } } },
    );
    const { data: userData } = await userClient.auth.getUser();
    if (!userData.user) throw new Error("Unauthorized");

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: profile } = await admin
      .from("profiles")
      .select("id, company_id, role")
      .eq("id", userData.user.id)
      .maybeSingle();
    if (!profile?.company_id) throw new Error("No company");
    if (!["company_admin", "accountant", "super_admin"].includes(profile.role)) {
      throw new Error("Not authorized");
    }

    const payload: Payload = await req.json();
    if (!payload.bank_account_id || !payload.content) throw new Error("Missing fields");

    const trimmed = payload.content.trim();
    const parsed: ParsedStatement = trimmed.startsWith("<")
      ? parseCamt053(trimmed)
      : parseMt940(trimmed);

    const { data: stmt, error: stmtErr } = await admin
      .from("acc_bank_statements")
      .insert({
        company_id: profile.company_id,
        bank_account_id: payload.bank_account_id,
        file_name: payload.file_name || "statement",
        format: parsed.format,
        statement_date: parsed.statement_date,
        opening_balance: parsed.opening_balance,
        closing_balance: parsed.closing_balance,
        currency: payload.currency || parsed.currency,
        raw_content: trimmed.slice(0, 500000),
        line_count: parsed.lines.length,
        imported_by: profile.id,
      })
      .select("id")
      .single();
    if (stmtErr || !stmt) throw new Error(stmtErr?.message || "Insert failed");

    if (parsed.lines.length > 0) {
      const linesPayload = parsed.lines.map((l) => ({
        statement_id: stmt.id,
        company_id: profile.company_id,
        bank_account_id: payload.bank_account_id,
        booking_date: l.booking_date,
        value_date: l.value_date,
        amount: l.amount,
        currency: l.currency || parsed.currency,
        counterparty_name: l.counterparty_name,
        counterparty_iban: l.counterparty_iban,
        reference: l.reference,
        end_to_end_id: l.end_to_end_id,
        description: l.description,
      }));
      const { error: linesErr } = await admin.from("acc_bank_statement_lines").insert(linesPayload);
      if (linesErr) throw new Error(linesErr.message);
    }

    const { data: matchCount } = await admin.rpc("suggest_bank_matches", { p_statement_id: stmt.id });

    return new Response(
      JSON.stringify({
        success: true,
        statement_id: stmt.id,
        line_count: parsed.lines.length,
        matches_suggested: matchCount ?? 0,
        format: parsed.format,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return new Response(
      JSON.stringify({ success: false, error: message }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
