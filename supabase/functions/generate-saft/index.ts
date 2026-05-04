import { createClient } from "npm:@supabase/supabase-js@2";
import { checkRateLimit, getClientIp, rateLimitResponse } from "../_shared/rateLimit.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface Payload {
  company_id: string;
  country_code: "RO" | "PL";
  date_from: string;
  date_to: string;
  module?: "master" | "movements" | "invoices" | "all";
}

function esc(v: unknown): string {
  if (v === null || v === undefined) return "";
  return String(v)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
function money(n: number): string {
  return (Math.round(Number(n) * 100) / 100).toFixed(2);
}

async function loadCompanyData(
  supabase: ReturnType<typeof createClient>,
  companyId: string,
  dateFrom: string,
  dateTo: string,
) {
  const [company, contacts, invoices, coa] = await Promise.all([
    supabase.from("companies").select("*").eq("id", companyId).maybeSingle(),
    supabase.from("acc_contacts").select("*").eq("company_id", companyId),
    supabase.from("acc_invoices").select("*, items:acc_invoice_items(*), contact:acc_contacts(*)")
      .eq("company_id", companyId).gte("invoice_date", dateFrom).lte("invoice_date", dateTo),
    supabase.from("acc_chart_of_accounts").select("*").eq("company_id", companyId),
  ]);
  return {
    company: company.data,
    contacts: contacts.data ?? [],
    invoices: invoices.data ?? [],
    coa: coa.data ?? [],
  };
}

function buildSaftRomania(data: {
  company: Record<string, unknown> | null;
  contacts: Array<Record<string, unknown>>;
  invoices: Array<Record<string, unknown>>;
  coa: Array<Record<string, unknown>>;
  dateFrom: string;
  dateTo: string;
}): string {
  const { company, contacts, invoices, coa, dateFrom, dateTo } = data;
  const saftCfg = (company?.saft_config ?? {}) as Record<string, string>;
  const taxOfficeCode = saftCfg.tax_office ?? "";
  const legalRep = saftCfg.legal_representative ?? "";

  const accountsXml = coa.map((a) => `
    <Account>
      <AccountID>${esc(a.account_code)}</AccountID>
      <AccountDescription>${esc(a.name)}</AccountDescription>
      <StandardAccountID>${esc(a.account_code)}</StandardAccountID>
      <AccountType>${esc(a.account_type)}</AccountType>
      <OpeningDebitBalance>0.00</OpeningDebitBalance>
      <OpeningCreditBalance>0.00</OpeningCreditBalance>
      <ClosingDebitBalance>0.00</ClosingDebitBalance>
      <ClosingCreditBalance>0.00</ClosingCreditBalance>
    </Account>`).join("");

  const customersXml = contacts.filter((c) => c.contact_type === "customer" || c.contact_type === "both")
    .map((c) => `
    <Customer>
      <CustomerID>${esc(c.id)}</CustomerID>
      <AccountID>4111</AccountID>
      <CustomerTaxID>${esc(c.vat_number ?? "")}</CustomerTaxID>
      <CompanyName>${esc(c.name)}</CompanyName>
      <BillingAddress>
        <StreetName>${esc(c.address ?? "")}</StreetName>
        <City>${esc(c.city ?? "")}</City>
        <PostalCode>${esc(c.postal_code ?? "")}</PostalCode>
        <Country>${esc(c.country ?? "RO")}</Country>
      </BillingAddress>
    </Customer>`).join("");

  const suppliersXml = contacts.filter((c) => c.contact_type === "supplier" || c.contact_type === "both")
    .map((c) => `
    <Supplier>
      <SupplierID>${esc(c.id)}</SupplierID>
      <AccountID>401</AccountID>
      <SupplierTaxID>${esc(c.vat_number ?? "")}</SupplierTaxID>
      <CompanyName>${esc(c.name)}</CompanyName>
      <BillingAddress>
        <StreetName>${esc(c.address ?? "")}</StreetName>
        <City>${esc(c.city ?? "")}</City>
        <PostalCode>${esc(c.postal_code ?? "")}</PostalCode>
        <Country>${esc(c.country ?? "RO")}</Country>
      </BillingAddress>
    </Supplier>`).join("");

  const invoicesXml = invoices.map((inv) => {
    const items = ((inv.items as Array<Record<string, unknown>>) ?? []).map((it, idx) => `
      <Line>
        <LineNumber>${idx + 1}</LineNumber>
        <Description>${esc(it.description)}</Description>
        <InvoicedQuantity>${money(Number(it.quantity ?? 0))}</InvoicedQuantity>
        <UnitOfMeasure>${esc(it.unit_code ?? it.unit ?? "EA")}</UnitOfMeasure>
        <UnitPrice>${money(Number(it.unit_price ?? 0))}</UnitPrice>
        <CreditAmount><Amount>${money(Number(it.line_total ?? 0))}</Amount></CreditAmount>
        <Tax>
          <TaxType>VAT</TaxType>
          <TaxCode>${Number(it.vat_rate ?? 0) === 0 ? "SDD" : "STD"}</TaxCode>
          <TaxPercentage>${money(Number(it.vat_rate ?? 0))}</TaxPercentage>
        </Tax>
      </Line>`).join("");
    return `
    <Invoice>
      <InvoiceNo>${esc(inv.invoice_number)}</InvoiceNo>
      <InvoiceDate>${esc(inv.invoice_date)}</InvoiceDate>
      <InvoiceType>380</InvoiceType>
      <CustomerID>${esc((inv.contact as { id?: string })?.id ?? inv.contact_id)}</CustomerID>
      ${items}
      <DocumentTotals>
        <TaxPayable>${money(Number(inv.vat_amount ?? 0))}</TaxPayable>
        <NetTotal>${money(Number(inv.subtotal ?? 0))}</NetTotal>
        <GrossTotal>${money(Number(inv.total ?? 0))}</GrossTotal>
      </DocumentTotals>
    </Invoice>`;
  }).join("");

  return `<?xml version="1.0" encoding="UTF-8"?>
<AuditFile xmlns="mfp:anaf:dgti:d406:declaratie:v1">
  <Header>
    <AuditFileVersion>2.4.8</AuditFileVersion>
    <AuditFileCountry>RO</AuditFileCountry>
    <AuditFileDateCreated>${new Date().toISOString().slice(0, 10)}</AuditFileDateCreated>
    <SoftwareCompanyName>MM Logistic</SoftwareCompanyName>
    <Company>
      <RegistrationNumber>${esc(company?.vat_number ?? "")}</RegistrationNumber>
      <Name>${esc(company?.name ?? "")}</Name>
      <Address>
        <StreetName>${esc(company?.address ?? "")}</StreetName>
        <City>${esc(company?.city ?? "")}</City>
        <PostalCode>${esc(company?.postal_code ?? "")}</PostalCode>
        <Country>RO</Country>
      </Address>
      <TaxOfficeCode>${esc(taxOfficeCode)}</TaxOfficeCode>
      <Contact>${esc(legalRep)}</Contact>
    </Company>
    <SelectionCriteria>
      <PeriodStart>${esc(dateFrom)}</PeriodStart>
      <PeriodEnd>${esc(dateTo)}</PeriodEnd>
    </SelectionCriteria>
    <DefaultCurrencyCode>RON</DefaultCurrencyCode>
  </Header>
  <MasterFiles>
    <GeneralLedgerAccounts>${accountsXml}</GeneralLedgerAccounts>
    <Customers>${customersXml}</Customers>
    <Suppliers>${suppliersXml}</Suppliers>
  </MasterFiles>
  <SourceDocuments>
    <SalesInvoices>${invoicesXml}</SalesInvoices>
  </SourceDocuments>
</AuditFile>`;
}

function buildSaftPoland(data: {
  company: Record<string, unknown> | null;
  contacts: Array<Record<string, unknown>>;
  invoices: Array<Record<string, unknown>>;
  dateFrom: string;
  dateTo: string;
}): string {
  const { company, invoices, dateFrom, dateTo } = data;

  const rows = invoices.map((inv, idx) => `
    <SprzedazWiersz typ="G">
      <LpSprzedazy>${idx + 1}</LpSprzedazy>
      <NrKontrahenta>${esc((inv.contact as { vat_number?: string })?.vat_number ?? "brak")}</NrKontrahenta>
      <NazwaKontrahenta>${esc((inv.contact as { name?: string })?.name ?? "")}</NazwaKontrahenta>
      <AdresKontrahenta>${esc((inv.contact as { address?: string })?.address ?? "")}</AdresKontrahenta>
      <DowodSprzedazy>${esc(inv.invoice_number)}</DowodSprzedazy>
      <DataWystawienia>${esc(inv.invoice_date)}</DataWystawienia>
      <DataSprzedazy>${esc(inv.delivery_date ?? inv.invoice_date)}</DataSprzedazy>
      <K_19>${money(Number(inv.subtotal ?? 0))}</K_19>
      <K_20>${money(Number(inv.vat_amount ?? 0))}</K_20>
    </SprzedazWiersz>`).join("");

  const totalNet = invoices.reduce((s, i) => s + Number(i.subtotal ?? 0), 0);
  const totalVat = invoices.reduce((s, i) => s + Number(i.vat_amount ?? 0), 0);

  return `<?xml version="1.0" encoding="UTF-8"?>
<JPK xmlns="http://jpk.mf.gov.pl/wzor/2022/02/17/02171/">
  <Naglowek>
    <KodFormularza kodSystemowy="JPK_V7M (1)" wersjaSchemy="1-2E">JPK_VAT</KodFormularza>
    <WariantFormularza>2</WariantFormularza>
    <DataWytworzeniaJPK>${new Date().toISOString()}</DataWytworzeniaJPK>
    <DataOd>${esc(dateFrom)}</DataOd>
    <DataDo>${esc(dateTo)}</DataDo>
    <KodUrzedu>${esc((company?.saft_config as Record<string, string>)?.tax_office ?? "")}</KodUrzedu>
    <Cel>1</Cel>
  </Naglowek>
  <Podmiot1>
    <OsobaNiefizyczna>
      <NIP>${esc(company?.vat_number ?? "")}</NIP>
      <PelnaNazwa>${esc(company?.name ?? "")}</PelnaNazwa>
    </OsobaNiefizyczna>
  </Podmiot1>
  <Ewidencja>
    ${rows}
    <SprzedazCtrl>
      <LiczbaWierszySprzedazy>${invoices.length}</LiczbaWierszySprzedazy>
      <PodatekNalezny>${money(totalVat)}</PodatekNalezny>
    </SprzedazCtrl>
  </Ewidencja>
  <Deklaracja>
    <Pozycje>
      <P_38>${money(totalVat)}</P_38>
      <P_51>${money(totalNet)}</P_51>
    </Pozycje>
  </Deklaracja>
</JPK>`;
}

function validateXmlStructure(xml: string, country: "RO" | "PL"): string[] {
  const errors: string[] = [];
  if (!xml.startsWith("<?xml")) errors.push("Missing XML declaration");
  const rootTag = country === "RO" ? "<AuditFile" : "<JPK";
  if (!xml.includes(rootTag)) errors.push(`Missing root element for ${country} SAF-T`);
  const openTags = (xml.match(/<[A-Za-z][A-Za-z0-9_:]*\b[^\/]*?>/g) || []).length;
  const closeTags = (xml.match(/<\/[A-Za-z][A-Za-z0-9_:]*>/g) || []).length;
  const selfClosing = (xml.match(/<[^>]+\/>/g) || []).length;
  if (openTags - selfClosing !== closeTags) errors.push("Unbalanced tags");
  return errors;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const ip = getClientIp(req);
    const rl = await checkRateLimit(`generate-saft:ip=${ip}`, 5, 60_000);
    if (!rl.allowed) return rateLimitResponse(rl, corsHeaders);

    const { company_id, country_code, date_from, date_to }: Payload = await req.json();
    if (!company_id || !country_code || !date_from || !date_to) {
      throw new Error("company_id, country_code, date_from, date_to required");
    }
    if (country_code !== "RO" && country_code !== "PL") {
      throw new Error("Only RO and PL are supported");
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const data = await loadCompanyData(supabase, company_id, date_from, date_to);
    const xml = country_code === "RO"
      ? buildSaftRomania({ ...data, dateFrom: date_from, dateTo: date_to })
      : buildSaftPoland({ ...data, dateFrom: date_from, dateTo: date_to });

    const errors = validateXmlStructure(xml, country_code);

    const period = `${date_from}_${date_to}`;
    const path = `${company_id}/saft/${country_code}_${period}.xml`;
    await supabase.storage.from("acc-documents").upload(
      path,
      new Blob([xml], { type: "application/xml" }),
      { upsert: true },
    );
    const { data: signed } = await supabase.storage
      .from("acc-documents").createSignedUrl(path, 3600);

    return new Response(JSON.stringify({
      xml,
      download_url: signed?.signedUrl ?? null,
      validation: { status: errors.length === 0 ? "valid" : "invalid", errors },
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
