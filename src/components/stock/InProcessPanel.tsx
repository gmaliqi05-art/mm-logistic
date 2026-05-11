import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Layers, Wrench, ArrowRight, Loader2 } from 'lucide-react';
import { supabase } from '../../lib/supabase';

interface Props {
  companyId: string;
  depotId?: string;
  sortingPath?: string;
  repairPath?: string;
}

interface SortingBatch {
  id: string;
  reference_number_snapshot: string | null;
  total_received: number;
  status: string;
  created_at: string;
  source_item_id: string | null;
  source_delivery_note_id: string | null;
  category_id: string | null;
  depot?: { name: string } | null;
  category?: { name: string } | null;
}

interface RepairRow {
  id: string;
  quantity_in: number;
  quantity_repaired: number;
  quantity_scrapped: number;
  created_at: string;
  category?: { name: string } | null;
  depot?: { name: string } | null;
}

export default function InProcessPanel({
  companyId,
  depotId,
  sortingPath = '/depot/sorting',
  repairPath = '/depot/repairs',
}: Props) {
  const [batches, setBatches] = useState<SortingBatch[]>([]);
  const [repairs, setRepairs] = useState<RepairRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      const sortingQuery = supabase
        .from('pallet_sorting_batches')
        .select('id, reference_number_snapshot, total_received, status, created_at, source_item_id, source_delivery_note_id, category_id, depot:depots(name), category:product_categories(name)')
        .eq('company_id', companyId)
        .in('status', ['in_progress', 'pending'])
        .order('created_at', { ascending: false })
        .limit(10);
      if (depotId) sortingQuery.eq('depot_id', depotId);

      const repairQuery = supabase
        .from('depot_repairs')
        .select('id, quantity_in, quantity_repaired, quantity_scrapped, created_at, category:product_categories(name), depot:depots(name)')
        .eq('company_id', companyId)
        .order('created_at', { ascending: false })
        .limit(10);
      if (depotId) repairQuery.eq('depot_id', depotId);

      const [sRes, rRes] = await Promise.all([sortingQuery, repairQuery]);
      if (cancelled) return;
      const rawBatches = ((sRes.data as any) ?? []) as SortingBatch[];
      const seen = new Map<string, SortingBatch>();
      for (const b of rawBatches) {
        const key = b.source_item_id
          ?? `${b.source_delivery_note_id ?? 'x'}-${b.category_id ?? 'x'}-${b.total_received}-${b.reference_number_snapshot ?? ''}`;
        if (!seen.has(key)) seen.set(key, b);
      }
      setBatches(Array.from(seen.values()));
      const openRepairs = ((rRes.data as any) ?? []).filter(
        (r: RepairRow) => r.quantity_in - r.quantity_repaired - r.quantity_scrapped > 0,
      );
      setRepairs(openRepairs);
      setLoading(false);
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [companyId, depotId]);

  const sortingTotal = batches.reduce((s, b) => s + (b.total_received ?? 0), 0);
  const repairTotal = repairs.reduce((s, r) => s + (r.quantity_in - r.quantity_repaired - r.quantity_scrapped), 0);

  if (!loading && batches.length === 0 && repairs.length === 0) return null;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <ProcessCard
        icon={Layers}
        title="Ne sortim"
        tone="amber"
        totalLabel={`${sortingTotal.toLocaleString()} paleta ne ${batches.length} batch-e`}
        link={sortingPath}
        loading={loading}
      >
        {batches.slice(0, 5).map((b) => (
          <li key={b.id} className="py-1.5 border-b last:border-0 border-amber-100">
            <Link
              to={`${sortingPath}?batch=${b.id}`}
              className="flex items-center justify-between gap-3 text-xs hover:text-amber-900"
            >
              <span className="truncate text-slate-700">
                <span className="font-medium">{b.category?.name ?? 'Pa kategori'}</span>
                {b.depot?.name && <span className="text-slate-400"> · {b.depot.name}</span>}
                {b.reference_number_snapshot && <span className="text-slate-400"> · #{b.reference_number_snapshot}</span>}
              </span>
              <span className="text-amber-700 font-semibold whitespace-nowrap">{b.total_received}</span>
            </Link>
          </li>
        ))}
        {batches.length > 5 && (
          <li className="text-[11px] text-amber-700 pt-1">+ {batches.length - 5} te tjera...</li>
        )}
      </ProcessCard>

      <ProcessCard
        icon={Wrench}
        title="Ne reparature"
        tone="rose"
        totalLabel={`${repairTotal.toLocaleString()} paleta te mbetura ne ${repairs.length} raste`}
        link={repairPath}
        loading={loading}
      >
        {repairs.slice(0, 5).map((r) => {
          const remaining = r.quantity_in - r.quantity_repaired - r.quantity_scrapped;
          return (
            <li key={r.id} className="py-1.5 border-b last:border-0 border-rose-100">
              <Link
                to={`${repairPath}?repair=${r.id}`}
                className="flex items-center justify-between gap-3 text-xs hover:text-rose-900"
              >
                <span className="truncate text-slate-700">
                  <span className="font-medium">{r.category?.name ?? 'Pa kategori'}</span>
                  {r.depot?.name && <span className="text-slate-400"> · {r.depot.name}</span>}
                </span>
                <span className="text-rose-700 font-semibold whitespace-nowrap">{remaining}</span>
              </Link>
            </li>
          );
        })}
        {repairs.length > 5 && <li className="text-[11px] text-rose-700 pt-1">+ {repairs.length - 5} te tjera...</li>}
      </ProcessCard>
    </div>
  );
}

function ProcessCard({
  icon: Icon,
  title,
  tone,
  totalLabel,
  link,
  loading,
  children,
}: {
  icon: typeof Layers;
  title: string;
  tone: 'amber' | 'rose';
  totalLabel: string;
  link: string;
  loading: boolean;
  children: React.ReactNode;
}) {
  const toneMap: Record<string, { card: string; header: string; iconBox: string; accent: string }> = {
    amber: {
      card: 'border-amber-200 bg-gradient-to-br from-amber-50 to-white',
      header: 'text-amber-800',
      iconBox: 'bg-amber-100 text-amber-700',
      accent: 'text-amber-700 hover:text-amber-900',
    },
    rose: {
      card: 'border-rose-200 bg-gradient-to-br from-rose-50 to-white',
      header: 'text-rose-800',
      iconBox: 'bg-rose-100 text-rose-700',
      accent: 'text-rose-700 hover:text-rose-900',
    },
  };
  const c = toneMap[tone];
  return (
    <div className={`rounded-xl border ${c.card} p-4`}>
      <div className="flex items-center justify-between gap-3 mb-3">
        <div className="flex items-center gap-3">
          <span className={`w-9 h-9 rounded-lg ${c.iconBox} flex items-center justify-center`}>
            <Icon className="w-4 h-4" />
          </span>
          <div>
            <p className={`text-sm font-semibold ${c.header}`}>{title}</p>
            <p className="text-[11px] text-slate-500">{totalLabel}</p>
          </div>
        </div>
        <Link to={link} className={`inline-flex items-center gap-1 text-xs font-medium ${c.accent}`}>
          Shiko <ArrowRight className="w-3 h-3" />
        </Link>
      </div>
      {loading ? (
        <div className="flex items-center justify-center py-4">
          <Loader2 className="w-4 h-4 animate-spin text-slate-400" />
        </div>
      ) : (
        <ul className="divide-y-0">{children}</ul>
      )}
    </div>
  );
}
