import { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  ShieldCheck,
  Truck,
  Warehouse,
  FileSearch,
  TrendingUp,
  TrendingDown,
  Clock,
  Building2,
  Printer,
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../lib/supabase';

type Severity = 'critical' | 'high' | 'medium' | 'low' | 'info';
type Domain = 'company' | 'driver' | 'depot';

interface Finding {
  id: string;
  domain: Domain;
  title: string;
  detail: string;
  severity: Severity;
  count: number;
  recommendation: string;
  timeline: '0-30 days' | '30-90 days' | '90-180 days';
}

interface KPI {
  label: string;
  value: string;
  hint?: string;
  trend?: 'up' | 'down' | 'flat';
}

const severityMeta: Record<Severity, { label: string; dot: string; chip: string; ring: string }> = {
  critical: { label: 'Critical', dot: 'bg-red-500', chip: 'bg-red-50 text-red-700 border-red-200', ring: 'ring-red-200' },
  high: { label: 'High', dot: 'bg-orange-500', chip: 'bg-orange-50 text-orange-700 border-orange-200', ring: 'ring-orange-200' },
  medium: { label: 'Medium', dot: 'bg-amber-500', chip: 'bg-amber-50 text-amber-700 border-amber-200', ring: 'ring-amber-200' },
  low: { label: 'Low', dot: 'bg-sky-500', chip: 'bg-sky-50 text-sky-700 border-sky-200', ring: 'ring-sky-200' },
  info: { label: 'Info', dot: 'bg-gray-400', chip: 'bg-gray-50 text-gray-700 border-gray-200', ring: 'ring-gray-200' },
};

const domainMeta: Record<Domain, { label: string; icon: typeof Building2; color: string }> = {
  company: { label: 'Company Operations', icon: Building2, color: 'text-teal-700' },
  driver: { label: 'Driver Management', icon: Truck, color: 'text-emerald-700' },
  depot: { label: 'Warehouse & Depot', icon: Warehouse, color: 'text-amber-700' },
};

function daysFromNow(date: string | null | undefined): number | null {
  if (!date) return null;
  const t = new Date(date).getTime();
  if (Number.isNaN(t)) return null;
  return Math.floor((t - Date.now()) / (1000 * 60 * 60 * 24));
}

export default function CompanyAuditReport() {
  const { profile } = useAuth();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [domainFilter, setDomainFilter] = useState<Domain | 'all'>('all');
  const [severityFilter, setSeverityFilter] = useState<Severity | 'all'>('all');
  const [findings, setFindings] = useState<Finding[]>([]);
  const [kpis, setKpis] = useState<{ company: KPI[]; driver: KPI[]; depot: KPI[] }>({
    company: [],
    driver: [],
    depot: [],
  });
  const [generatedAt, setGeneratedAt] = useState<Date>(new Date());

  useEffect(() => {
    if (!profile?.company_id) return;
    runAudit(profile.company_id);
  }, [profile?.company_id]);

  async function runAudit(companyId: string) {
    setLoading(true);
    setError(null);
    try {
      const now = new Date();
      const ninetyDaysAgo = new Date(now.getTime() - 90 * 24 * 3600 * 1000).toISOString();

      const [
        driversRes,
        licensesRes,
        medicalRes,
        qualsRes,
        vehiclesRes,
        inspectionsRes,
        insuranceRes,
        taxesRes,
        deliveryRes,
        invoicesRes,
        stockRes,
        alertsRes,
        shiftRes,
        remindersRes,
      ] = await Promise.all([
        supabase.from('profiles').select('id, full_name, is_active, auto_tracking_enabled').eq('company_id', companyId).eq('role', 'driver'),
        supabase.from('driver_licenses').select('driver_id, expiry_date').eq('company_id', companyId),
        supabase.from('driver_medical').select('driver_id, expiry_date').eq('company_id', companyId),
        supabase.from('driver_qualifications').select('driver_id, qualification_type, expiry_date').eq('company_id', companyId),
        supabase.from('vehicles').select('id, license_plate, status').eq('company_id', companyId),
        supabase.from('vehicle_inspections').select('vehicle_id, expiry_date').eq('company_id', companyId),
        supabase.from('vehicle_insurance').select('vehicle_id, end_date').eq('company_id', companyId),
        supabase.from('vehicle_taxes').select('vehicle_id, due_date, paid_at').eq('company_id', companyId),
        supabase
          .from('delivery_notes')
          .select('id, status, scheduled_delivery_at, delivered_at, stock_posted, scanned_photo_url, attachment_url, created_at')
          .eq('company_id', companyId)
          .gte('created_at', ninetyDaysAgo),
        supabase
          .from('acc_invoices')
          .select('id, status, due_date, total, invoice_type')
          .eq('company_id', companyId),
        supabase.from('stock').select('id, quantity').eq('company_id', companyId),
        supabase.from('stock_alerts').select('id, is_active, last_triggered_at').eq('company_id', companyId).eq('is_active', true),
        supabase
          .from('shift_sessions')
          .select('id, driver_id, started_at, ended_at, total_duration_min')
          .eq('company_id', companyId)
          .gte('started_at', ninetyDaysAgo),
        supabase.from('compliance_reminders').select('entity_type, compliance_type, expiry_date').eq('company_id', companyId),
      ]);

      if (driversRes.error) throw driversRes.error;
      const drivers = driversRes.data ?? [];
      const licenses = licensesRes.data ?? [];
      const medical = medicalRes.data ?? [];
      const quals = qualsRes.data ?? [];
      const vehicles = vehiclesRes.data ?? [];
      const inspections = inspectionsRes.data ?? [];
      const insurance = insuranceRes.data ?? [];
      const taxes = taxesRes.data ?? [];
      const delivery = deliveryRes.data ?? [];
      const invoices = invoicesRes.data ?? [];
      const stock = stockRes.data ?? [];
      const alerts = alertsRes.data ?? [];
      const shifts = shiftRes.data ?? [];
      const reminders = remindersRes.data ?? [];

      const findings: Finding[] = [];

      const driverIds = new Set(drivers.filter((d) => d.is_active !== false).map((d) => d.id));
      const driversWithLicense = new Set(licenses.map((l) => l.driver_id));
      const driversWithMedical = new Set(medical.map((m) => m.driver_id));
      const missingLicense = [...driverIds].filter((id) => !driversWithLicense.has(id)).length;
      const expiredLicenses = licenses.filter((l) => {
        const d = daysFromNow(l.expiry_date);
        return d !== null && d < 0 && driverIds.has(l.driver_id);
      }).length;
      const soonExpiringLicenses = licenses.filter((l) => {
        const d = daysFromNow(l.expiry_date);
        return d !== null && d >= 0 && d <= 30 && driverIds.has(l.driver_id);
      }).length;
      const missingMedical = [...driverIds].filter((id) => !driversWithMedical.has(id)).length;
      const expiredMedical = medical.filter((m) => {
        const d = daysFromNow(m.expiry_date);
        return d !== null && d < 0 && driverIds.has(m.driver_id);
      }).length;
      const expiredQuals = quals.filter((q) => {
        const d = daysFromNow(q.expiry_date);
        return d !== null && d < 0 && driverIds.has(q.driver_id);
      }).length;
      const trackingOff = drivers.filter((d) => d.is_active !== false && d.auto_tracking_enabled === false).length;

      if (expiredLicenses > 0) {
        findings.push({
          id: 'drv-license-expired',
          domain: 'driver',
          severity: 'critical',
          count: expiredLicenses,
          title: 'Drivers with expired driving licenses',
          detail: `${expiredLicenses} active driver(s) have a license past its expiry date. Operating a vehicle with an invalid license is a statutory violation.`,
          recommendation: 'Suspend dispatch for affected drivers until renewal is recorded. Enforce a blocking rule at route assignment.',
          timeline: '0-30 days',
        });
      }
      if (missingLicense > 0) {
        findings.push({
          id: 'drv-license-missing',
          domain: 'driver',
          severity: 'high',
          count: missingLicense,
          title: 'Active drivers without a recorded license',
          detail: `${missingLicense} active driver profile(s) have no license on file. Unable to verify road legality.`,
          recommendation: 'Collect license scans within 14 days and upload via the compliance module.',
          timeline: '0-30 days',
        });
      }
      if (soonExpiringLicenses > 0) {
        findings.push({
          id: 'drv-license-soon',
          domain: 'driver',
          severity: 'medium',
          count: soonExpiringLicenses,
          title: 'Licenses expiring within 30 days',
          detail: `${soonExpiringLicenses} license(s) are due to expire within 30 days.`,
          recommendation: 'Schedule renewals and notify drivers through the notification center.',
          timeline: '0-30 days',
        });
      }
      if (expiredMedical > 0 || missingMedical > 0) {
        findings.push({
          id: 'drv-medical',
          domain: 'driver',
          severity: expiredMedical > 0 ? 'high' : 'medium',
          count: expiredMedical + missingMedical,
          title: 'Missing or expired driver medical exams',
          detail: `${expiredMedical} expired and ${missingMedical} missing medical certificates across active drivers.`,
          recommendation: 'Book medical exams and block drivers without valid medicals from long-haul routes.',
          timeline: '0-30 days',
        });
      }
      if (expiredQuals > 0) {
        findings.push({
          id: 'drv-qual-expired',
          domain: 'driver',
          severity: 'high',
          count: expiredQuals,
          title: 'Expired professional qualifications (CPC / ADR)',
          detail: `${expiredQuals} professional qualification(s) have lapsed. EU Directive 2003/59/EC requires valid CPC for professional driving.`,
          recommendation: 'Enroll drivers in refresher training modules (35 hours CPC).',
          timeline: '30-90 days',
        });
      }
      if (trackingOff > 0) {
        findings.push({
          id: 'drv-tracking-off',
          domain: 'driver',
          severity: 'medium',
          count: trackingOff,
          title: 'Drivers with GPS auto-tracking disabled',
          detail: `${trackingOff} active driver(s) have disabled automatic location tracking during shifts.`,
          recommendation: 'Enforce tracking policy at shift start; require justification for manual pauses.',
          timeline: '0-30 days',
        });
      }

      const shortShifts = shifts.filter((s) => (s.total_duration_min ?? 0) > 0 && (s.total_duration_min ?? 0) < 30).length;
      const overlongShifts = shifts.filter((s) => (s.total_duration_min ?? 0) > 9 * 60).length;
      if (overlongShifts > 0) {
        findings.push({
          id: 'drv-hos-limit',
          domain: 'driver',
          severity: 'high',
          count: overlongShifts,
          title: 'Shifts exceeding 9h driving window',
          detail: `${overlongShifts} shift session(s) ran longer than 9 hours. EU 561/2006 caps daily driving at 9h (10h twice per week).`,
          recommendation: 'Review tachograph records, add breaks, and raise alerts when daily driving approaches the legal limit.',
          timeline: '30-90 days',
        });
      }
      if (shortShifts > 0) {
        findings.push({
          id: 'drv-hos-short',
          domain: 'driver',
          severity: 'low',
          count: shortShifts,
          title: 'Unusually short shift sessions',
          detail: `${shortShifts} session(s) under 30 minutes — possibly incomplete tracking.`,
          recommendation: 'Review data quality and educate drivers on shift start/end procedures.',
          timeline: '90-180 days',
        });
      }

      const expiredInspections = inspections.filter((i) => {
        const d = daysFromNow(i.expiry_date);
        return d !== null && d < 0;
      }).length;
      const expiredInsurance = insurance.filter((i) => {
        const d = daysFromNow(i.end_date);
        return d !== null && d < 0;
      }).length;
      const unpaidTaxes = taxes.filter((t) => {
        const d = daysFromNow(t.due_date);
        return !t.paid_at && d !== null && d < 0;
      }).length;

      if (expiredInspections > 0) {
        findings.push({
          id: 'veh-inspection-expired',
          domain: 'company',
          severity: 'critical',
          count: expiredInspections,
          title: 'Vehicles with expired technical inspection',
          detail: `${expiredInspections} vehicle(s) past technical inspection (TUV/ITP) expiry.`,
          recommendation: 'Park affected vehicles; schedule inspections before next dispatch.',
          timeline: '0-30 days',
        });
      }
      if (expiredInsurance > 0) {
        findings.push({
          id: 'veh-insurance-expired',
          domain: 'company',
          severity: 'critical',
          count: expiredInsurance,
          title: 'Vehicles with expired insurance',
          detail: `${expiredInsurance} vehicle(s) have lapsed insurance coverage.`,
          recommendation: 'Renew policies immediately; suspend operation of uninsured vehicles.',
          timeline: '0-30 days',
        });
      }
      if (unpaidTaxes > 0) {
        findings.push({
          id: 'veh-tax-unpaid',
          domain: 'company',
          severity: 'medium',
          count: unpaidTaxes,
          title: 'Overdue vehicle taxes',
          detail: `${unpaidTaxes} vehicle tax record(s) are past due and unpaid.`,
          recommendation: 'Clear outstanding balances and set automated reminders.',
          timeline: '30-90 days',
        });
      }

      const overdueInvoices = invoices.filter((i) => {
        if (i.status === 'paid' || i.status === 'cancelled') return false;
        const d = daysFromNow(i.due_date);
        return d !== null && d < 0;
      });
      const overdueAmount = overdueInvoices.reduce((sum, i) => sum + Number(i.total ?? 0), 0);
      if (overdueInvoices.length > 0) {
        findings.push({
          id: 'fin-overdue-invoices',
          domain: 'company',
          severity: overdueAmount > 10000 ? 'high' : 'medium',
          count: overdueInvoices.length,
          title: 'Overdue receivables',
          detail: `${overdueInvoices.length} unpaid invoice(s) past due (total ${overdueAmount.toFixed(2)}).`,
          recommendation: 'Trigger dunning workflow; apply late-payment fees per contract.',
          timeline: '0-30 days',
        });
      }

      const upcomingCompliance = reminders.filter((r) => {
        const d = daysFromNow(r.expiry_date);
        return d !== null && d >= 0 && d <= 30;
      }).length;
      if (upcomingCompliance > 0) {
        findings.push({
          id: 'comp-upcoming',
          domain: 'company',
          severity: 'low',
          count: upcomingCompliance,
          title: 'Upcoming compliance deadlines (30 days)',
          detail: `${upcomingCompliance} compliance item(s) are due within 30 days across fleet and drivers.`,
          recommendation: 'Pre-schedule renewal tasks and assign responsible owners.',
          timeline: '0-30 days',
        });
      }

      const unscannedDeliveries = delivery.filter((d) => d.status === 'delivered' && !d.scanned_photo_url && !d.attachment_url).length;
      const unpostedStock = delivery.filter((d) => d.status === 'delivered' && d.stock_posted === false).length;
      const lateDeliveries = delivery.filter((d) => {
        if (!d.scheduled_delivery_at || !d.delivered_at) return false;
        return new Date(d.delivered_at).getTime() > new Date(d.scheduled_delivery_at).getTime() + 60 * 60 * 1000;
      }).length;
      const onTimeDeliveries = delivery.filter((d) => {
        if (!d.scheduled_delivery_at || !d.delivered_at) return false;
        return new Date(d.delivered_at).getTime() <= new Date(d.scheduled_delivery_at).getTime() + 60 * 60 * 1000;
      }).length;
      const otpBase = onTimeDeliveries + lateDeliveries;
      const otpPct = otpBase > 0 ? (onTimeDeliveries / otpBase) * 100 : null;

      if (unscannedDeliveries > 0) {
        findings.push({
          id: 'dep-scan-missing',
          domain: 'depot',
          severity: 'high',
          count: unscannedDeliveries,
          title: 'Delivered notes without attached scan/proof',
          detail: `${unscannedDeliveries} closed delivery note(s) are missing a scanned document or proof image.`,
          recommendation: 'Enforce mandatory scan attachment before closing delivery notes.',
          timeline: '0-30 days',
        });
      }
      if (unpostedStock > 0) {
        findings.push({
          id: 'dep-stock-unposted',
          domain: 'depot',
          severity: 'high',
          count: unpostedStock,
          title: 'Delivered notes not posted to stock',
          detail: `${unpostedStock} delivery note(s) marked as delivered but not reconciled against stock movements.`,
          recommendation: 'Run stock reconciliation and resolve posting errors in the queue.',
          timeline: '0-30 days',
        });
      }
      if (otpPct !== null && otpPct < 90) {
        findings.push({
          id: 'dep-otp',
          domain: 'depot',
          severity: otpPct < 75 ? 'high' : 'medium',
          count: lateDeliveries,
          title: 'On-time delivery rate below target',
          detail: `Current on-time rate is ${otpPct.toFixed(1)}% over the last 90 days. ${lateDeliveries} deliveries missed the 1-hour window.`,
          recommendation: 'Review dispatch planning, buffer times and chronic late routes.',
          timeline: '30-90 days',
        });
      }

      const zeroStock = stock.filter((s) => Number(s.quantity ?? 0) <= 0).length;
      if (zeroStock > 0) {
        findings.push({
          id: 'dep-zero-stock',
          domain: 'depot',
          severity: 'low',
          count: zeroStock,
          title: 'SKUs at zero or negative stock',
          detail: `${zeroStock} stock line(s) at 0 or below. Potential stock-outs or posting anomalies.`,
          recommendation: 'Investigate negatives, recount and run cycle-count for affected locations.',
          timeline: '30-90 days',
        });
      }
      if (alerts.length > 0) {
        findings.push({
          id: 'dep-alerts',
          domain: 'depot',
          severity: 'medium',
          count: alerts.length,
          title: 'Active stock alerts triggered',
          detail: `${alerts.length} stock alert rule(s) currently active.`,
          recommendation: 'Review alert rules; replenish low-stock SKUs.',
          timeline: '30-90 days',
        });
      }

      setFindings(findings);
      setKpis({
        company: [
          { label: 'Active vehicles', value: String(vehicles.length), hint: 'Fleet size' },
          { label: 'Overdue receivables', value: overdueInvoices.length.toString(), hint: `${overdueAmount.toFixed(0)} open` },
          { label: 'Compliance items ≤ 30d', value: String(upcomingCompliance), hint: 'Due soon' },
        ],
        driver: [
          { label: 'Active drivers', value: String(driverIds.size) },
          { label: 'Expired licenses', value: String(expiredLicenses), trend: expiredLicenses > 0 ? 'down' : 'flat' },
          { label: 'Shifts over 9h', value: String(overlongShifts), hint: 'last 90 days' },
        ],
        depot: [
          { label: 'On-time delivery', value: otpPct === null ? '—' : `${otpPct.toFixed(0)}%`, trend: otpPct !== null && otpPct >= 90 ? 'up' : 'down' },
          { label: 'Scan-missing notes', value: String(unscannedDeliveries) },
          { label: 'Stock lines', value: String(stock.length) },
        ],
      });
      setGeneratedAt(new Date());
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Failed to run audit';
      setError(msg);
    } finally {
      setLoading(false);
    }
  }

  const filtered = useMemo(() => {
    return findings.filter((f) => {
      if (domainFilter !== 'all' && f.domain !== domainFilter) return false;
      if (severityFilter !== 'all' && f.severity !== severityFilter) return false;
      return true;
    });
  }, [findings, domainFilter, severityFilter]);

  const counts = useMemo(() => {
    const bySev: Record<Severity, number> = { critical: 0, high: 0, medium: 0, low: 0, info: 0 };
    for (const f of findings) bySev[f.severity] += 1;
    return bySev;
  }, [findings]);

  const riskScore = useMemo(() => {
    const weight: Record<Severity, number> = { critical: 25, high: 12, medium: 5, low: 2, info: 0 };
    const raw = findings.reduce((sum, f) => sum + weight[f.severity], 0);
    return Math.min(100, raw);
  }, [findings]);

  function riskBand(score: number) {
    if (score >= 60) return { label: 'Elevated', color: 'bg-red-500 text-white' };
    if (score >= 30) return { label: 'Moderate', color: 'bg-amber-500 text-white' };
    if (score >= 10) return { label: 'Controlled', color: 'bg-sky-500 text-white' };
    return { label: 'Healthy', color: 'bg-emerald-500 text-white' };
  }

  const band = riskBand(riskScore);

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <header className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-gray-500 font-semibold">
            <FileSearch className="w-3.5 h-3.5" />
            Operational Audit
          </div>
          <h1 className="text-2xl font-bold text-gray-900 mt-1">Comprehensive Audit Report</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Generated {generatedAt.toLocaleString()} · Company, Driver, and Depot findings
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => profile?.company_id && runAudit(profile.company_id)}
            className="px-3 py-2 rounded-lg bg-teal-600 text-white text-sm font-semibold hover:bg-teal-700 transition-colors"
          >
            {loading ? 'Auditing…' : 'Re-run audit'}
          </button>
          <button
            onClick={() => window.print()}
            className="px-3 py-2 rounded-lg border border-gray-300 text-gray-700 text-sm font-semibold hover:bg-gray-50 inline-flex items-center gap-1.5"
          >
            <Printer className="w-4 h-4" />
            Print
          </button>
        </div>
      </header>

      {error && (
        <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">{error}</div>
      )}

      <section className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 bg-white rounded-2xl border border-gray-200 p-5">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-xs uppercase tracking-wider text-gray-500 font-semibold">Executive summary</div>
              <h2 className="text-lg font-bold text-gray-900 mt-1">Risk posture</h2>
            </div>
            <span className={`px-3 py-1 rounded-full text-xs font-bold ${band.color}`}>{band.label}</span>
          </div>
          <div className="mt-4">
            <div className="h-2.5 w-full rounded-full bg-gray-100 overflow-hidden">
              <div
                className={`h-full ${riskScore >= 60 ? 'bg-red-500' : riskScore >= 30 ? 'bg-amber-500' : riskScore >= 10 ? 'bg-sky-500' : 'bg-emerald-500'}`}
                style={{ width: `${Math.max(4, riskScore)}%` }}
              />
            </div>
            <div className="flex justify-between mt-1.5 text-[11px] text-gray-500">
              <span>0</span>
              <span>Risk score: {riskScore}/100</span>
              <span>100</span>
            </div>
          </div>
          <div className="grid grid-cols-4 gap-2 mt-5">
            {(['critical', 'high', 'medium', 'low'] as Severity[]).map((s) => (
              <div key={s} className="rounded-xl border border-gray-200 p-3 text-center">
                <div className={`inline-block w-2 h-2 rounded-full ${severityMeta[s].dot} mb-1.5`} />
                <div className="text-lg font-bold text-gray-900 leading-none">{counts[s]}</div>
                <div className="text-[11px] text-gray-500 mt-1">{severityMeta[s].label}</div>
              </div>
            ))}
          </div>
        </div>
        <div className="bg-white rounded-2xl border border-gray-200 p-5">
          <div className="text-xs uppercase tracking-wider text-gray-500 font-semibold">Standards</div>
          <h2 className="text-lg font-bold text-gray-900 mt-1">Coverage</h2>
          <ul className="mt-3 space-y-2 text-sm">
            <li className="flex items-start gap-2">
              <ShieldCheck className="w-4 h-4 text-emerald-600 mt-0.5" />
              <span className="text-gray-700">ISO 9001: documented procedures & records</span>
            </li>
            <li className="flex items-start gap-2">
              <ShieldCheck className="w-4 h-4 text-emerald-600 mt-0.5" />
              <span className="text-gray-700">EU 561/2006: driver hours of service</span>
            </li>
            <li className="flex items-start gap-2">
              <ShieldCheck className="w-4 h-4 text-emerald-600 mt-0.5" />
              <span className="text-gray-700">EU 2003/59/EC: CPC training</span>
            </li>
            <li className="flex items-start gap-2">
              <ShieldCheck className="w-4 h-4 text-emerald-600 mt-0.5" />
              <span className="text-gray-700">GDPR: tracking & personal data</span>
            </li>
          </ul>
        </div>
      </section>

      <section className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {(['company', 'driver', 'depot'] as Domain[]).map((d) => {
          const meta = domainMeta[d];
          const Icon = meta.icon;
          return (
            <div key={d} className="bg-white rounded-2xl border border-gray-200 p-5">
              <div className="flex items-center gap-2">
                <Icon className={`w-5 h-5 ${meta.color}`} />
                <h3 className="font-semibold text-gray-900">{meta.label}</h3>
              </div>
              <dl className="mt-4 space-y-2.5">
                {kpis[d].map((k) => (
                  <div key={k.label} className="flex items-center justify-between gap-3">
                    <dt className="text-sm text-gray-600">{k.label}</dt>
                    <dd className="text-sm font-semibold text-gray-900 flex items-center gap-1">
                      {k.trend === 'up' && <TrendingUp className="w-3.5 h-3.5 text-emerald-500" />}
                      {k.trend === 'down' && <TrendingDown className="w-3.5 h-3.5 text-red-500" />}
                      {k.value}
                    </dd>
                  </div>
                ))}
              </dl>
            </div>
          );
        })}
      </section>

      <section className="bg-white rounded-2xl border border-gray-200 p-5">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <div className="text-xs uppercase tracking-wider text-gray-500 font-semibold">Detailed findings</div>
            <h2 className="text-lg font-bold text-gray-900 mt-1">{filtered.length} item(s)</h2>
          </div>
          <div className="flex flex-wrap gap-2">
            <select
              value={domainFilter}
              onChange={(e) => setDomainFilter(e.target.value as Domain | 'all')}
              className="px-3 py-1.5 rounded-lg border border-gray-300 text-sm bg-white"
            >
              <option value="all">All domains</option>
              <option value="company">Company</option>
              <option value="driver">Driver</option>
              <option value="depot">Depot</option>
            </select>
            <select
              value={severityFilter}
              onChange={(e) => setSeverityFilter(e.target.value as Severity | 'all')}
              className="px-3 py-1.5 rounded-lg border border-gray-300 text-sm bg-white"
            >
              <option value="all">All severities</option>
              <option value="critical">Critical</option>
              <option value="high">High</option>
              <option value="medium">Medium</option>
              <option value="low">Low</option>
            </select>
          </div>
        </div>

        <div className="mt-4 space-y-3">
          {loading && (
            <div className="py-10 text-center text-sm text-gray-500">Running audit queries…</div>
          )}
          {!loading && filtered.length === 0 && (
            <div className="py-10 text-center">
              <CheckCircle2 className="w-10 h-10 text-emerald-500 mx-auto" />
              <p className="mt-2 text-sm text-gray-600">No findings match the current filters. Your operation is in good standing.</p>
            </div>
          )}
          {filtered.map((f) => {
            const meta = severityMeta[f.severity];
            const dMeta = domainMeta[f.domain];
            const DIcon = dMeta.icon;
            return (
              <article
                key={f.id}
                className={`rounded-xl border bg-white p-4 ${meta.chip.replace('bg-', 'border-l-4 border-l-').split(' ')[0]} border-gray-200`}
              >
                <div className="flex flex-wrap items-start gap-3">
                  <div className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-semibold border ${meta.chip}`}>
                    <span className={`w-1.5 h-1.5 rounded-full ${meta.dot}`} />
                    {meta.label}
                  </div>
                  <div className="inline-flex items-center gap-1 text-[11px] font-medium text-gray-600">
                    <DIcon className="w-3.5 h-3.5" />
                    {dMeta.label}
                  </div>
                  <div className="inline-flex items-center gap-1 text-[11px] font-medium text-gray-600">
                    <Clock className="w-3.5 h-3.5" />
                    {f.timeline}
                  </div>
                  <div className="ml-auto text-xs text-gray-500">#{f.count}</div>
                </div>
                <h3 className="font-semibold text-gray-900 mt-2">{f.title}</h3>
                <p className="text-sm text-gray-600 mt-1">{f.detail}</p>
                <div className="mt-3 rounded-lg bg-gray-50 border border-gray-100 p-3 text-sm">
                  <div className="text-[11px] uppercase tracking-wider text-gray-500 font-semibold mb-1">Recommendation</div>
                  <p className="text-gray-700">{f.recommendation}</p>
                </div>
              </article>
            );
          })}
        </div>
      </section>

      <section className="bg-white rounded-2xl border border-gray-200 p-5">
        <div className="text-xs uppercase tracking-wider text-gray-500 font-semibold">Implementation roadmap</div>
        <h2 className="text-lg font-bold text-gray-900 mt-1">Prioritized action plan</h2>
        <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-4">
          {(['0-30 days', '30-90 days', '90-180 days'] as const).map((window) => {
            const items = findings.filter((f) => f.timeline === window);
            return (
              <div key={window} className="rounded-xl border border-gray-200 p-4">
                <div className="flex items-center justify-between">
                  <div className="font-semibold text-gray-900 text-sm">{window}</div>
                  <span className="text-xs text-gray-500">{items.length}</span>
                </div>
                <ul className="mt-2 space-y-2">
                  {items.length === 0 && (
                    <li className="text-xs text-gray-500">No items scheduled.</li>
                  )}
                  {items.map((f) => {
                    const meta = severityMeta[f.severity];
                    return (
                      <li key={f.id} className="text-sm text-gray-700 flex items-start gap-2">
                        <span className={`mt-1.5 w-1.5 h-1.5 rounded-full flex-shrink-0 ${meta.dot}`} />
                        <span>{f.title}</span>
                      </li>
                    );
                  })}
                </ul>
              </div>
            );
          })}
        </div>
      </section>

      <section className="bg-white rounded-2xl border border-gray-200 p-5">
        <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-gray-500 font-semibold">
          <AlertTriangle className="w-3.5 h-3.5" />
          Methodology
        </div>
        <p className="text-sm text-gray-600 mt-2">
          Findings are derived from live operational data in Supabase. Severity weights: critical=25, high=12, medium=5, low=2.
          Sampling window is 90 days for delivery and shift metrics; compliance checks use current expiry dates. The risk score is
          capped at 100 and binned into Healthy / Controlled / Moderate / Elevated.
        </p>
      </section>
    </div>
  );
}
