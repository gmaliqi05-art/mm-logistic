import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { expiryLevel } from '../lib/fleetCompliance';

export interface DriverComplianceWarning {
  /** Driver UUID. */
  driverId: string;
  /** At least one document is past its expiry date. */
  hasExpired: boolean;
  /** At least one document expires within 7 days. */
  hasCritical: boolean;
  /** Plain-language summary lines, e.g. "Patenta: skaduar 5 dite me pare". */
  items: string[];
}

const empty: Record<string, DriverComplianceWarning> = {};

/**
 * Fetches every license, qualification and medical exam for the given
 * company's drivers and returns a map keyed by driver_id with a small
 * status summary. Useful when a UI surface picks a driver (delivery-note
 * assignment, route planner, dispatch board) and wants to warn the
 * dispatcher before the assignment is saved.
 *
 * The hook does NOT re-fetch on its own — the parent passes a `version`
 * counter when it wants the data refreshed (after a save, for example).
 */
export function useDriverComplianceMap(
  companyId: string | null | undefined,
  version = 0,
): { warnings: Record<string, DriverComplianceWarning>; loading: boolean } {
  const [warnings, setWarnings] = useState<Record<string, DriverComplianceWarning>>(empty);
  const [loading, setLoading] = useState<boolean>(Boolean(companyId));

  useEffect(() => {
    let cancelled = false;
    if (!companyId) {
      setWarnings(empty);
      setLoading(false);
      return;
    }
    setLoading(true);
    (async () => {
      const [licRes, qualRes, medRes] = await Promise.all([
        supabase.from('driver_licenses')
          .select('driver_id, expiry_date, license_number')
          .eq('company_id', companyId),
        supabase.from('driver_qualifications')
          .select('driver_id, qualification_type, expiry_date')
          .eq('company_id', companyId),
        supabase.from('driver_medical')
          .select('driver_id, exam_type, expiry_date')
          .eq('company_id', companyId),
      ]);

      if (cancelled) return;

      const map: Record<string, DriverComplianceWarning> = {};

      const ingest = (driverId: string, label: string, dateStr: string | null | undefined) => {
        const level = expiryLevel(dateStr);
        if (level !== 'expired' && level !== 'critical') return;
        const cur = map[driverId] ?? { driverId, hasExpired: false, hasCritical: false, items: [] };
        if (level === 'expired') cur.hasExpired = true;
        else cur.hasCritical = true;
        cur.items.push(`${label}: ${level === 'expired' ? 'skaduar' : 'skadon shpejt'}`);
        map[driverId] = cur;
      };

      ((licRes.data ?? []) as { driver_id: string; expiry_date: string | null; license_number: string | null }[])
        .forEach((r) => ingest(r.driver_id, r.license_number ? `Patenta ${r.license_number}` : 'Patenta', r.expiry_date));
      ((qualRes.data ?? []) as { driver_id: string; qualification_type: string | null; expiry_date: string | null }[])
        .forEach((r) => ingest(r.driver_id, r.qualification_type ?? 'Kualifikim', r.expiry_date));
      ((medRes.data ?? []) as { driver_id: string; exam_type: string | null; expiry_date: string | null }[])
        .forEach((r) => ingest(r.driver_id, r.exam_type ? `Mjekesor ${r.exam_type}` : 'Mjekesor', r.expiry_date));

      setWarnings(map);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [companyId, version]);

  return { warnings, loading };
}
