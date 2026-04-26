import { useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import {
  loadCompanyCompliance,
  subscribeCompliance,
  type CompanyComplianceContext,
} from '../lib/complianceEngine';

const emptyContext: CompanyComplianceContext = {
  country_code: null,
  country_name: null,
  rules: [],
};

export function useCompliance() {
  const { profile } = useAuth();
  const companyId = profile?.company_id ?? null;
  const [ctx, setCtx] = useState<CompanyComplianceContext>(emptyContext);
  const [loading, setLoading] = useState<boolean>(Boolean(companyId));
  const [error, setError] = useState<string | null>(null);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    let cancelled = false;
    if (!companyId) {
      setCtx(emptyContext);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    loadCompanyCompliance(companyId)
      .then((c) => {
        if (!cancelled) setCtx(c);
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Failed to load compliance');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [companyId, version]);

  useEffect(() => {
    if (!companyId) return;
    return subscribeCompliance(companyId, () => setVersion((v) => v + 1));
  }, [companyId]);

  return { ctx, loading, error };
}
