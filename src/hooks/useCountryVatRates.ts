import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';

export interface VatRateOption {
  value: number;
  label: string;
  rate_type: string;
}

const FALLBACK: VatRateOption[] = [{ value: 0, label: '0%', rate_type: 'zero' }];

interface State {
  rates: VatRateOption[];
  standardRate: number;
  reducedRate: number | null;
  zeroRate: number;
  loading: boolean;
  countryCode: string | null;
}

const INITIAL: State = {
  rates: FALLBACK,
  standardRate: 0,
  reducedRate: null,
  zeroRate: 0,
  loading: true,
  countryCode: null,
};

const cache = new Map<string, VatRateOption[]>();

export function useCountryVatRates(): State {
  const { profile } = useAuth();
  const companyId = profile?.company_id ?? null;
  const [state, setState] = useState<State>(INITIAL);

  useEffect(() => {
    let cancelled = false;
    if (!companyId) {
      setState({ ...INITIAL, loading: false });
      return;
    }
    (async () => {
      setState((s) => ({ ...s, loading: true }));
      const { data: company } = await supabase
        .from('companies')
        .select('country')
        .eq('id', companyId)
        .maybeSingle();

      const code = (company?.country ?? '').toUpperCase() || null;
      if (!code) {
        if (!cancelled) setState({ ...INITIAL, loading: false });
        return;
      }

      const cached = cache.get(code);
      let rates = cached;
      if (!rates) {
        const today = new Date().toISOString().slice(0, 10);
        const { data } = await supabase
          .from('eu_vat_rates')
          .select('rate_type, rate, label, valid_from, valid_to')
          .eq('country_code', code)
          .lte('valid_from', today)
          .order('rate', { ascending: false });

        const rows = (data ?? []).filter(
          (r: { valid_to: string | null }) => !r.valid_to || r.valid_to >= today
        );

        const seen = new Set<string>();
        rates = [];
        for (const r of rows as { rate: number | string; label: string | null; rate_type: string }[]) {
          const rate = Number(r.rate);
          const key = `${r.rate_type}:${rate}`;
          if (seen.has(key)) continue;
          seen.add(key);
          rates.push({
            value: rate,
            label: r.label ?? `${rate}%`,
            rate_type: r.rate_type,
          });
        }
        if (rates.length === 0) rates = FALLBACK;
        cache.set(code, rates);
      }

      const std = rates.find((r) => r.rate_type === 'standard');
      const red = rates.find((r) => r.rate_type === 'reduced');
      const zero = rates.find((r) => r.rate_type === 'zero');

      if (!cancelled) {
        setState({
          rates,
          standardRate: std?.value ?? rates[0]?.value ?? 0,
          reducedRate: red?.value ?? null,
          zeroRate: zero?.value ?? 0,
          loading: false,
          countryCode: code,
        });
      }
    })().catch(() => {
      if (!cancelled) setState({ ...INITIAL, loading: false });
    });

    return () => {
      cancelled = true;
    };
  }, [companyId]);

  return state;
}
