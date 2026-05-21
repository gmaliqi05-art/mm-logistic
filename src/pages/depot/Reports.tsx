import { useEffect, useMemo, useState } from 'react';
import {
  Loader2,
  ArrowUpCircle,
  ArrowDownCircle,
  Wrench,
  Trash2,
  Layers,
  BarChart3,
  Package,
  Download,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';

type Tab = 'flow' | 'repair' | 'sorting' | 'damaged';

interface FlowRow {
  flow_date: string;
  movement_type: string;
  category_id: string | null;
  category_product_id: string | null;
  quantity: number;
  category_name?: string;
  product_name?: string;
  performer_name?: string;
  source_partner?: string;
}

interface RepairRow {
  repair_date: string;
  category_name: string | null;
  product_name: string | null;
  total_in: number;
  total_repaired: number;
  total_scrapped: number;
  worker_full_name: string | null;
  opened_by_full_name: string | null;
}

interface SortingRow {
  batch_id: string;
  batch_date: string;
  status: string;
  category_name: string | null;
  product_name: string | null;
  condition: string;
  quantity: number;
  created_by_full_name: string | null;
  completed_by_full_name: string | null;
}

interface DamagedRow {
  category_id: string;
  category_name: string | null;
  product_name: string | null;
  quantity: number;
}

interface DamageHistoryRow {
  id: string;
  created_at: string;
  quantity: number;
  product_name: string | null;
  condition_from: string;
  reason: string | null;
  reporter_full_name: string | null;
}

function isoDays(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

function fmtDate(d: string) {
  return new Date(d).toLocaleDateString(undefined, { day: '2-digit', month: '2-digit', year: '2-digit' });
}

function toCsv(rows: Record<string, unknown>[]): string {
  if (!rows.length) return '';
  const keys = Object.keys(rows[0]);
  const escape = (v: unknown) => {
    const s = v == null ? '' : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [keys.join(','), ...rows.map((r) => keys.map((k) => escape(r[k])).join(','))].join('\n');
}

function downloadCsv(filename: string, content: string) {
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export default function DepotReports() {
  const { profile } = useAuth();
  const [tab, setTab] = useState<Tab>('flow');
  const [days, setDays] = useState<number>(7);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [flow, setFlow] = useState<FlowRow[]>([]);
  const [repair, setRepair] = useState<RepairRow[]>([]);
  const [sorting, setSorting] = useState<SortingRow[]>([]);
  const [damaged, setDamaged] = useState<DamagedRow[]>([]);
  const [damageHistory, setDamageHistory] = useState<DamageHistoryRow[]>([]);

  useEffect(() => {
    if (!profile?.depot_id || !profile?.company_id) return;
    void load();
  }, [profile?.depot_id, profile?.company_id, days]);

  async function load() {
    try {
      setLoading(true);
      setError(null);
      const depotId = profile!.depot_id!;
      const companyId = profile!.company_id!;
      const since = isoDays(days);

      const [flowRes, flowLookup, prodLookup, performerLookup, repRes, sortRes, damRes, damHistRes] = await Promise.all([
        supabase
          .from('stock_movements')
          .select('created_at, movement_type, category_id, category_product_id, quantity, performed_by, source_partner')
          .eq('company_id', companyId)
          .eq('depot_id', depotId)
          .gte('created_at', since)
          .order('created_at', { ascending: false })
          .limit(200),
        supabase.from('product_categories').select('id, name').eq('company_id', companyId),
        supabase.from('category_products').select('id, name').eq('company_id', companyId),
        supabase.from('profiles').select('id, full_name').eq('company_id', companyId),
        supabase
          .from('v_depot_repair_productivity')
          .select('repair_date, category_name, product_name, total_in, total_repaired, total_scrapped, worker_full_name, opened_by_full_name')
          .eq('company_id', companyId)
          .eq('depot_id', depotId)
          .gte('repair_date', since.substring(0, 10))
          .order('repair_date', { ascending: false }),
        supabase
          .from('v_depot_sorting_outcomes')
          .select('batch_id, batch_date, status, category_name, product_name, condition, quantity, created_by_full_name, completed_by_full_name')
          .eq('company_id', companyId)
          .eq('depot_id', depotId)
          .gte('batch_date', since.substring(0, 10))
          .eq('status', 'completed')
          .order('batch_date', { ascending: false }),
        supabase
          .from('v_depot_stock_value')
          .select('category_id, category_name, product_name, quantity, condition')
          .eq('company_id', companyId)
          .eq('depot_id', depotId)
          .eq('condition', 'damaged'),
        supabase
          .from('stock_damage_reports')
          .select('id, created_at, quantity, product_name, condition_from, reason, reporter:profiles!stock_damage_reports_reported_by_fkey(full_name)')
          .eq('company_id', companyId)
          .eq('depot_id', depotId)
          .gte('created_at', since)
          .order('created_at', { ascending: false })
          .limit(200),
      ]);

      if (flowRes.error) throw flowRes.error;
      if (repRes.error) throw repRes.error;
      if (sortRes.error) throw sortRes.error;
      if (damRes.error) throw damRes.error;

      const catMap = new Map<string, string>();
      (flowLookup.data ?? []).forEach((c: { id: string; name: string }) => catMap.set(c.id, c.name));
      const prodMap = new Map<string, string>();
      (prodLookup.data ?? []).forEach((p: { id: string; name: string }) => prodMap.set(p.id, p.name));
      const perfMap = new Map<string, string>();
      (performerLookup.data ?? []).forEach((p: { id: string; full_name: string }) => perfMap.set(p.id, p.full_name));
      const flowEnriched = (flowRes.data ?? []).map((r: any) => ({
        flow_date: (r.created_at || '').substring(0, 10),
        movement_type: r.movement_type,
        category_id: r.category_id,
        category_product_id: r.category_product_id,
        quantity: r.quantity,
        category_name: r.category_id ? catMap.get(r.category_id) ?? '' : '',
        product_name: r.category_product_id ? prodMap.get(r.category_product_id) ?? '' : '',
        performer_name: r.performed_by ? perfMap.get(r.performed_by) ?? '' : '',
        source_partner: r.source_partner || '',
      })) as FlowRow[];

      setFlow(flowEnriched);
      setRepair(repRes.data ?? []);
      setSorting(sortRes.data ?? []);
      setDamaged((damRes.data ?? []).filter((r: DamagedRow) => (r.quantity ?? 0) > 0));
      setDamageHistory(((damHistRes.data as any[]) ?? []).map((r) => ({
        id: r.id,
        created_at: r.created_at,
        quantity: r.quantity,
        product_name: r.product_name,
        condition_from: r.condition_from,
        reason: r.reason,
        reporter_full_name: r.reporter?.full_name ?? null,
      })));
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  const flowSummary = useMemo(() => {
    const s = { entry: 0, exit: 0, repair: 0, scrap: 0, sort_in: 0 };
    for (const r of flow) {
      if (r.movement_type in s) (s as Record<string, number>)[r.movement_type] += r.quantity;
    }
    return s;
  }, [flow]);

  const dailyChart = useMemo(() => {
    const buckets = new Map<string, { entry: number; exit: number }>();
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const key = d.toISOString().substring(0, 10);
      buckets.set(key, { entry: 0, exit: 0 });
    }
    for (const r of flow) {
      const b = buckets.get(r.flow_date.substring(0, 10));
      if (!b) continue;
      if (r.movement_type === 'entry') b.entry += r.quantity;
      else if (r.movement_type === 'exit') b.exit += r.quantity;
    }
    return Array.from(buckets.entries()).map(([date, v]) => ({ date, ...v }));
  }, [flow, days]);

  const maxBar = Math.max(1, ...dailyChart.map((d) => Math.max(d.entry, d.exit)));

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-xl lg:text-2xl font-bold text-slate-900">Raporte Depo</h1>
          <p className="text-sm text-slate-500 mt-0.5">Hyrje / Dalje · Reparime · Sortime · Paleta te demtuara</p>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={days}
            onChange={(e) => setDays(parseInt(e.target.value, 10))}
            className="px-3 py-2 rounded-lg border border-slate-300 text-sm bg-white"
          >
            <option value={7}>7 dite</option>
            <option value={30}>30 dite</option>
            <option value={90}>90 dite</option>
            <option value={365}>1 vit</option>
          </select>
        </div>
      </div>

      {error && (
        <div className="bg-rose-50 border border-rose-200 rounded-xl p-3 text-sm text-rose-700">{error}</div>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <Kpi label="Hyrje" value={flowSummary.entry} icon={ArrowUpCircle} tone="emerald" />
        <Kpi label="Dalje" value={flowSummary.exit} icon={ArrowDownCircle} tone="rose" />
        <Kpi label="Reparime" value={flowSummary.repair} icon={Wrench} tone="amber" />
        <Kpi label="Scrap" value={flowSummary.scrap} icon={Trash2} tone="slate" />
        <Kpi label="Sortim (hyrje)" value={flowSummary.sort_in} icon={Layers} tone="teal" />
      </div>

      <div className="flex gap-1 p-1 bg-slate-100 rounded-lg w-fit overflow-x-auto">
        {([
          ['flow', 'Hyrje / Dalje', BarChart3],
          ['repair', 'Reparime', Wrench],
          ['sorting', 'Sortime', Layers],
          ['damaged', 'Defekt', Package],
        ] as Array<[Tab, string, typeof BarChart3]>).map(([key, label, Icon]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium whitespace-nowrap transition ${
              tab === key ? 'bg-white shadow-sm text-slate-900' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Icon className="w-3.5 h-3.5" />
            {label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-48">
          <Loader2 className="w-8 h-8 animate-spin text-teal-600" />
        </div>
      ) : (
        <>
          {tab === 'flow' && (
            <div className="bg-white rounded-xl border border-slate-200 p-4 space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="font-semibold text-slate-900 text-sm">Hyrje vs Dalje ({days} dite)</h2>
                <button
                  onClick={() => downloadCsv('depot-daily-flow.csv', toCsv(flow as unknown as Record<string, unknown>[]))}
                  className="inline-flex items-center gap-1.5 text-xs text-teal-700 hover:text-teal-900"
                >
                  <Download className="w-3.5 h-3.5" /> CSV
                </button>
              </div>
              <div className="flex items-end gap-1.5 h-40 overflow-x-auto">
                {dailyChart.map((d) => (
                  <div key={d.date} className="flex flex-col items-center gap-1 min-w-[34px]">
                    <div className="flex items-end gap-0.5 h-28">
                      <div
                        className="w-3 bg-emerald-500 rounded-t"
                        style={{ height: `${(d.entry / maxBar) * 100}%` }}
                        title={`Hyrje: ${d.entry}`}
                      />
                      <div
                        className="w-3 bg-rose-500 rounded-t"
                        style={{ height: `${(d.exit / maxBar) * 100}%` }}
                        title={`Dalje: ${d.exit}`}
                      />
                    </div>
                    <span className="text-[9px] text-slate-500">{d.date.substring(5)}</span>
                  </div>
                ))}
              </div>
              <Table
                headers={['Data', 'Lloji', 'Kategoria', 'Produkti', 'Sasi', 'Punetori', 'Nga kush']}
                rows={flow.slice(0, 60).map((r) => [
                  fmtDate(r.flow_date),
                  r.movement_type,
                  r.category_name || '—',
                  r.product_name || '—',
                  r.quantity,
                  r.performer_name || '—',
                  r.source_partner || '—',
                ])}
                empty="Asnje levizje"
              />
            </div>
          )}

          {tab === 'repair' && (
            <div className="bg-white rounded-xl border border-slate-200 p-4 space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="font-semibold text-slate-900 text-sm">Produktiviteti i reparimit</h2>
                <button
                  onClick={() => downloadCsv('depot-repairs.csv', toCsv(repair as unknown as Record<string, unknown>[]))}
                  className="inline-flex items-center gap-1.5 text-xs text-teal-700 hover:text-teal-900"
                >
                  <Download className="w-3.5 h-3.5" /> CSV
                </button>
              </div>
              <Table
                headers={['Data', 'Produkti', 'Reparator', 'Hapur nga', 'Hyri', 'Reparuar', 'Scrap']}
                rows={repair.map((r) => [
                  fmtDate(r.repair_date),
                  `${r.category_name ?? ''}${r.product_name ? ` · ${r.product_name}` : ''}`,
                  r.worker_full_name ?? '—',
                  r.opened_by_full_name ?? '—',
                  r.total_in,
                  r.total_repaired,
                  r.total_scrapped,
                ])}
                empty="Asnje reparim i raportuar"
              />
            </div>
          )}

          {tab === 'sorting' && (
            <div className="bg-white rounded-xl border border-slate-200 p-4 space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="font-semibold text-slate-900 text-sm">Rezultatet e sortimit</h2>
                <button
                  onClick={() => downloadCsv('depot-sorting.csv', toCsv(sorting as unknown as Record<string, unknown>[]))}
                  className="inline-flex items-center gap-1.5 text-xs text-teal-700 hover:text-teal-900"
                >
                  <Download className="w-3.5 h-3.5" /> CSV
                </button>
              </div>
              <Table
                headers={['Data', 'Kategoria', 'Produkti i ndare', 'Gjendja', 'Sasi', 'Sortuar nga', 'Statusi']}
                rows={sorting.map((r) => [
                  fmtDate(r.batch_date),
                  r.category_name ?? '—',
                  r.product_name ?? '—',
                  r.condition,
                  r.quantity,
                  r.completed_by_full_name ?? r.created_by_full_name ?? '—',
                  r.status,
                ])}
                empty="Asnje sortim"
              />
            </div>
          )}

          {tab === 'damaged' && (
            <div className="space-y-4">
              <div className="bg-white rounded-xl border border-slate-200 p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <h2 className="font-semibold text-slate-900 text-sm">Paleta te demtuara ne radhe</h2>
                  <button
                    onClick={() => downloadCsv('depot-damaged.csv', toCsv(damaged as unknown as Record<string, unknown>[]))}
                    className="inline-flex items-center gap-1.5 text-xs text-teal-700 hover:text-teal-900"
                  >
                    <Download className="w-3.5 h-3.5" /> CSV
                  </button>
                </div>
                <Table
                  headers={['Kategoria', 'Produkti', 'Sasi']}
                  rows={damaged.map((r) => [
                    r.category_name ?? '—',
                    r.product_name ?? '—',
                    r.quantity,
                  ])}
                  empty="Asnje palete e demtuar"
                />
              </div>

              <div className="bg-white rounded-xl border border-slate-200 p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <h2 className="font-semibold text-slate-900 text-sm">Historiku i raportimit te demtimeve</h2>
                  <button
                    onClick={() => downloadCsv('depot-damage-history.csv', toCsv(damageHistory as unknown as Record<string, unknown>[]))}
                    className="inline-flex items-center gap-1.5 text-xs text-teal-700 hover:text-teal-900"
                  >
                    <Download className="w-3.5 h-3.5" /> CSV
                  </button>
                </div>
                <Table
                  headers={['Data', 'Produkti', 'Gjendja burim', 'Sasi', 'Punetori', 'Arsyeja']}
                  rows={damageHistory.map((r) => [
                    fmtDate(r.created_at),
                    r.product_name ?? '—',
                    r.condition_from,
                    r.quantity,
                    r.reporter_full_name ?? '—',
                    r.reason ?? '—',
                  ])}
                  empty="Asnje raport demtimi ne kete periudhe"
                />
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function Kpi({
  label,
  value,
  icon: Icon,
  tone,
}: {
  label: string;
  value: number;
  icon: typeof ArrowUpCircle;
  tone: 'emerald' | 'rose' | 'amber' | 'slate' | 'teal';
}) {
  const toneMap: Record<string, string> = {
    emerald: 'bg-emerald-500',
    rose: 'bg-rose-500',
    amber: 'bg-amber-500',
    slate: 'bg-slate-500',
    teal: 'bg-teal-500',
  };
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-3.5">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-[10px] font-medium text-slate-500 uppercase tracking-wide">{label}</p>
          <p className="text-2xl font-bold text-slate-900 mt-1">{value.toLocaleString()}</p>
        </div>
        <div className={`${toneMap[tone]} p-2 rounded-lg`}>
          <Icon className="w-4 h-4 text-white" />
        </div>
      </div>
    </div>
  );
}

function Table({
  headers,
  rows,
  empty,
}: {
  headers: string[];
  rows: (string | number)[][];
  empty: string;
}) {
  if (rows.length === 0) {
    return (
      <div className="py-10 text-center text-sm text-slate-400">{empty}</div>
    );
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-[11px] uppercase tracking-wide text-slate-500 border-b border-slate-100">
            {headers.map((h) => (
              <th key={h} className="py-2 pr-3 font-medium">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-b border-slate-50">
              {r.map((c, j) => (
                <td key={j} className="py-2 pr-3 text-slate-700 whitespace-nowrap">
                  {c}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
