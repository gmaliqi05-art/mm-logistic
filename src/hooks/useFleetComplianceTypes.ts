import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { useTranslation, type Language } from '../i18n';

export type FleetComplianceCategory = 'vehicle' | 'driver';

export interface FleetComplianceType {
  type_key: string;
  label: string;
  is_mandatory: boolean;
  sort_order: number;
}

interface CacheKey {
  country: string;
  category: FleetComplianceCategory;
  lang: Language;
}

const cache = new Map<string, FleetComplianceType[]>();
const cacheKey = (k: CacheKey) => `${k.country}:${k.category}:${k.lang}`;

interface State {
  types: FleetComplianceType[];
  byKey: Record<string, FleetComplianceType>;
  labelOf: (key: string) => string;
  loading: boolean;
  countryCode: string | null;
}

export function useFleetComplianceTypes(category: FleetComplianceCategory): State {
  const { profile } = useAuth();
  const { language } = useTranslation();
  const companyId = profile?.company_id ?? null;
  const [types, setTypes] = useState<FleetComplianceType[]>([]);
  const [loading, setLoading] = useState<boolean>(Boolean(companyId));
  const [countryCode, setCountryCode] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (!companyId) {
      setTypes([]);
      setLoading(false);
      return;
    }
    (async () => {
      setLoading(true);
      const { data: company } = await supabase
        .from('companies')
        .select('country')
        .eq('id', companyId)
        .maybeSingle();
      const code = (company?.country ?? '').toUpperCase() || null;
      if (!cancelled) setCountryCode(code);
      if (!code) {
        if (!cancelled) {
          setTypes([]);
          setLoading(false);
        }
        return;
      }
      const ck = cacheKey({ country: code, category, lang: language });
      const cached = cache.get(ck);
      if (cached) {
        if (!cancelled) {
          setTypes(cached);
          setLoading(false);
        }
        return;
      }
      const labelCol = `label_${language}`;
      const { data } = await supabase
        .from('country_fleet_compliance_types')
        .select(`type_key, is_mandatory, sort_order, label_sq, label_en, label_de, label_fr`)
        .eq('country_code', code)
        .eq('category', category)
        .order('sort_order', { ascending: true });
      const rows = (data ?? []) as Array<Record<string, unknown>>;
      const list: FleetComplianceType[] = rows.map((r) => ({
        type_key: String(r.type_key),
        label: String(r[labelCol] || r.label_en || r.type_key),
        is_mandatory: Boolean(r.is_mandatory),
        sort_order: Number(r.sort_order ?? 0),
      }));
      cache.set(ck, list);
      if (!cancelled) {
        setTypes(list);
        setLoading(false);
      }
    })().catch(() => {
      if (!cancelled) setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [companyId, category, language]);

  const byKey: Record<string, FleetComplianceType> = {};
  for (const t of types) byKey[t.type_key] = t;
  const labelOf = (key: string) => byKey[key]?.label ?? key;

  return { types, byKey, labelOf, loading, countryCode };
}
