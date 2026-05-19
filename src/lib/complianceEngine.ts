import { supabase } from './supabase';

export type ComplianceDomain = 'accounting' | 'tax' | 'invoicing' | 'logistics';

export interface ComplianceRule {
  country_code: string;
  domain: ComplianceDomain;
  rule_key: string;
  config: Record<string, unknown>;
  description: string;
}

export interface CompanyComplianceContext {
  country_code: string | null;
  country_name: string | null;
  rules: ComplianceRule[];
}

const emptyContext: CompanyComplianceContext = {
  country_code: null,
  country_name: null,
  rules: [],
};

const contextCache = new Map<string, Promise<CompanyComplianceContext>>();

type Listener = () => void;
const listeners = new Map<string, Set<Listener>>();
const globalListeners = new Set<Listener>();

export function subscribeCompliance(companyId: string, listener: Listener): () => void {
  let set = listeners.get(companyId);
  if (!set) {
    set = new Set();
    listeners.set(companyId, set);
  }
  set.add(listener);
  return () => {
    const s = listeners.get(companyId);
    s?.delete(listener);
    if (s && s.size === 0) listeners.delete(companyId);
  };
}

function notify(companyId?: string) {
  if (companyId) listeners.get(companyId)?.forEach((l) => l());
  else listeners.forEach((set) => set.forEach((l) => l()));
  globalListeners.forEach((l) => l());
}

export function clearComplianceCache(companyId?: string) {
  if (companyId) contextCache.delete(companyId);
  else contextCache.clear();
  notify(companyId);
}

export async function loadCompanyCompliance(
  companyId: string,
): Promise<CompanyComplianceContext> {
  const cached = contextCache.get(companyId);
  if (cached) return cached;

  const p = (async () => {
    const { data: company, error: cErr } = await supabase
      .from('companies')
      .select('country_id, country, countries:country_id(code, name)')
      .eq('id', companyId)
      .maybeSingle();

    if (cErr || !company) {
      contextCache.delete(companyId);
      return emptyContext;
    }

    const raw = company as {
      country?: string | null;
      countries?:
        | { code: string; name: string }
        | { code: string; name: string }[]
        | null;
    };
    const linked = Array.isArray(raw.countries) ? raw.countries[0] ?? null : raw.countries ?? null;
    const rawCode = linked?.code ?? raw.country ?? null;
    const code = rawCode ? rawCode.toUpperCase() : null;
    const name = linked?.name ?? null;

    if (!code) return { ...emptyContext };

    const { data: rules, error: rErr } = await supabase
      .from('country_compliance_rules')
      .select('country_code, domain, rule_key, config, description')
      .ilike('country_code', code);

    if (rErr) return { country_code: code, country_name: name, rules: [] };

    return {
      country_code: code,
      country_name: name,
      rules: (rules ?? []) as ComplianceRule[],
    };
  })();

  contextCache.set(companyId, p);
  return p;
}

export function getRule(
  ctx: CompanyComplianceContext,
  domain: ComplianceDomain,
  ruleKey: string,
): ComplianceRule | null {
  return (
    ctx.rules.find((r) => r.domain === domain && r.rule_key === ruleKey) ?? null
  );
}

export function getConfig<T = Record<string, unknown>>(
  ctx: CompanyComplianceContext,
  domain: ComplianceDomain,
  ruleKey: string,
): T | null {
  const rule = getRule(ctx, domain, ruleKey);
  return (rule?.config as T) ?? null;
}

export interface VatIdRule {
  pattern: string;
  label: string;
}

export interface CurrencyRule {
  code: string;
  symbol: string;
}

export interface ChartOfAccountsRule {
  code: string;
  name: string;
}

export interface DriverHoursRule {
  daily_max: number;
  weekly_max: number;
  biweekly_max?: number;
  rest_daily_min: number;
  law: string;
}

export interface TaxAuthorityRule {
  name: string;
  exports: string[];
}

export function vatStandardRate(ctx: CompanyComplianceContext): number | null {
  const cfg = getConfig<{ rate: number }>(ctx, 'tax', 'vat_standard');
  return cfg?.rate ?? null;
}

export function vatReducedRate(ctx: CompanyComplianceContext): number | null {
  const cfg = getConfig<{ rate: number }>(ctx, 'tax', 'vat_reduced');
  return cfg?.rate ?? null;
}

export function currency(ctx: CompanyComplianceContext): CurrencyRule {
  return (
    getConfig<CurrencyRule>(ctx, 'invoicing', 'currency') ?? {
      code: 'EUR',
      symbol: '€',
    }
  );
}

export function chartOfAccounts(
  ctx: CompanyComplianceContext,
): ChartOfAccountsRule | null {
  return getConfig<ChartOfAccountsRule>(ctx, 'accounting', 'chart_of_accounts');
}

export function driverHours(
  ctx: CompanyComplianceContext,
): DriverHoursRule | null {
  return getConfig<DriverHoursRule>(ctx, 'logistics', 'driver_hours');
}

export function taxAuthority(
  ctx: CompanyComplianceContext,
): TaxAuthorityRule | null {
  return getConfig<TaxAuthorityRule>(ctx, 'tax', 'authority');
}

export function validateVatId(
  ctx: CompanyComplianceContext,
  value: string,
): { ok: boolean; label: string | null } {
  const rule = getConfig<VatIdRule>(ctx, 'tax', 'vat_id_regex');
  if (!rule) return { ok: true, label: null };
  try {
    const re = new RegExp(rule.pattern);
    return { ok: re.test(value.trim()), label: rule.label };
  } catch {
    return { ok: true, label: rule.label };
  }
}

export function supportsExport(
  ctx: CompanyComplianceContext,
  exportKey: string,
): boolean {
  const auth = taxAuthority(ctx);
  return Boolean(auth?.exports?.includes(exportKey));
}

export function isCountry(
  ctx: CompanyComplianceContext,
  ...codes: string[]
): boolean {
  if (!ctx.country_code) return false;
  return codes.map((c) => c.toUpperCase()).includes(ctx.country_code);
}
