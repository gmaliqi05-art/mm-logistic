import type { ReactNode } from 'react';
import { useCompliance } from '../../hooks/useCompliance';
import type { ComplianceDomain } from '../../lib/complianceEngine';
import { getRule, isCountry, supportsExport } from '../../lib/complianceEngine';

interface BaseProps {
  children: ReactNode;
  fallback?: ReactNode;
}

interface CountryGateProps extends BaseProps {
  country: string | string[];
}

interface RuleGateProps extends BaseProps {
  domain: ComplianceDomain;
  ruleKey: string;
}

interface ExportGateProps extends BaseProps {
  exportKey: string;
}

export function CountryGate({ country, children, fallback = null }: CountryGateProps) {
  const { ctx, loading } = useCompliance();
  if (loading) return null;
  const codes = Array.isArray(country) ? country : [country];
  return isCountry(ctx, ...codes) ? <>{children}</> : <>{fallback}</>;
}

export function RuleGate({ domain, ruleKey, children, fallback = null }: RuleGateProps) {
  const { ctx, loading } = useCompliance();
  if (loading) return null;
  return getRule(ctx, domain, ruleKey) ? <>{children}</> : <>{fallback}</>;
}

export function ExportGate({ exportKey, children, fallback = null }: ExportGateProps) {
  const { ctx, loading } = useCompliance();
  if (loading) return null;
  return supportsExport(ctx, exportKey) ? <>{children}</> : <>{fallback}</>;
}
