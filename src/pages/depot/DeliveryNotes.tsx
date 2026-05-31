import { useState, useEffect } from 'react';
import {
  FileText,
  Search,
  Truck,
  MapPin,
  Package,
  CheckCircle2,
  Send,
  Clock,
  AlertTriangle,
  Layers,
  Wrench,
  ArrowUpRight,
  ArrowDownLeft,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { PageSkeleton } from '../../components/ui/Skeleton';
import { useAuth } from '../../contexts/AuthContext';
import { useTranslation } from '../../i18n';
import type { DeliveryNote } from '../../types';

const statusIcons: Record<string, typeof CheckCircle2> = {
  draft: FileText,
  sent: Send,
  in_transit: Truck,
  delivered: CheckCircle2,
  confirmed: CheckCircle2,
};

const statusStyles: Record<string, { bg: string; text: string; label: string }> = {
  draft: { bg: 'bg-gray-100', text: 'text-gray-700', label: 'Draft' },
  sent: { bg: 'bg-blue-100', text: 'text-blue-700', label: 'Derguar' },
  in_transit: { bg: 'bg-amber-100', text: 'text-amber-700', label: 'Ne tranzit' },
  delivered: { bg: 'bg-green-100', text: 'text-green-700', label: 'Dorezuar' },
  confirmed: { bg: 'bg-teal-100', text: 'text-teal-700', label: 'Konfirmuar' },
};

type DeliveryItemSummary = {
  intended_action: 'stock' | 'sorting' | 'repair';
  quantity: number;
};

type SortingBatchRef = { id: string; status: string; source_delivery_note_id: string };

type DeliveryNoteWithRels = DeliveryNote & {
  driver?: { full_name: string } | null;
  depot?: { name: string } | null;
  items?: DeliveryItemSummary[];
};

export default function DepotDeliveryNotes() {
  const { profile } = useAuth();
  const { t } = useTranslation();
  const [notes, setNotes] = useState<DeliveryNoteWithRels[]>([]);
  const [batchesByNote, setBatchesByNote] = useState<Record<string, SortingBatchRef>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  useEffect(() => {
    if (profile?.company_id) fetchNotes();
  }, [profile?.company_id]);

  async function fetchNotes() {
    try {
      setLoading(true);
      setError(null);
      const { data, error: err } = await supabase
        .from('delivery_notes')
        .select('*, driver:profiles!delivery_notes_assigned_driver_id_fkey(full_name), stock_confirmer:profiles!delivery_notes_stock_confirmed_by_fkey(full_name), depot:depots!delivery_notes_assigned_depot_id_fkey(name), items:delivery_note_items(intended_action, quantity)')
        .eq('company_id', profile!.company_id!)
        .neq('status', 'draft')
        .neq('status', 'cancelled')
        .or('type.eq.pickup,assigned_depot_id.not.is.null')
        .order('created_at', { ascending: false })
        .limit(100);
      if (err) throw err;
      const rows = (data as any) ?? [];
      setNotes(rows);

      const noteIds = rows.map((r: any) => r.id);
      if (noteIds.length > 0) {
        const { data: batchRows } = await supabase
          .from('pallet_sorting_batches')
          .select('id, status, source_delivery_note_id')
          .in('source_delivery_note_id', noteIds);
        const map: Record<string, SortingBatchRef> = {};
        for (const b of (batchRows as SortingBatchRef[] | null) ?? []) {
          if (b.source_delivery_note_id) map[b.source_delivery_note_id] = b;
        }
        setBatchesByNote(map);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  const filtered = notes.filter((n) => {
    if (statusFilter && n.status !== statusFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      if (
        !n.note_number.toLowerCase().includes(q) &&
        !n.delivery_address?.toLowerCase().includes(q) &&
        !n.pickup_address?.toLowerCase().includes(q) &&
        !(n as any).partner_name?.toLowerCase().includes(q) &&
        !n.driver?.full_name?.toLowerCase().includes(q)
      ) {
        return false;
      }
    }
    return true;
  });

  if (loading) {
    return <PageSkeleton rows={8} cols={5} />;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Fletedergesat</h1>
        <p className="text-gray-500 mt-1 text-sm">{t('common.pamjeInformativeShikoniKushKaCilen')}</p>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-center gap-3">
          <AlertTriangle className="w-5 h-5 text-red-500" />
          <p className="text-red-700 text-sm">{error}</p>
        </div>
      )}

      <div className="bg-white rounded-xl shadow-sm border border-gray-100">
        <div className="p-4 border-b border-gray-100">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                placeholder={t('common.searchNumberDriverAddressPartner')}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent text-sm"
              />
            </div>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent text-sm"
            >
              <option value="">{t('common.allStatuses')}</option>
              {Object.entries(statusStyles).filter(([k]) => k !== 'draft').map(([k, s]) => (
                <option key={k} value={k}>{s.label}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="divide-y divide-gray-50">
          {filtered.length === 0 ? (
            <div className="p-12 text-center">
              <FileText className="w-10 h-10 text-gray-200 mx-auto mb-3" />
              <p className="text-sm text-gray-400">{t('common.nukKaFletedergesaAktive')}</p>
            </div>
          ) : (
            filtered.map((n) => {
              const cfg = statusStyles[n.status] ?? statusStyles.draft;
              const StatusIcon = statusIcons[n.status] ?? FileText;
              return (
                <div key={n.id} className="p-4 hover:bg-gray-50/50">
                  <div className="flex items-start gap-3">
                    <div className={`p-2 rounded-lg flex-shrink-0 ${cfg.bg}`}>
                      <StatusIcon className={`w-4 h-4 ${cfg.text}`} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-semibold text-gray-900">{n.note_number}</span>
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium ${cfg.bg} ${cfg.text}`}>
                          {cfg.label}
                        </span>
                        {n.type === 'pickup' ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-orange-100 text-orange-700">
                            <ArrowDownLeft className="w-3 h-3" /> {t('depot.deliveryNotes.pickupBadge')}
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-blue-100 text-blue-700">
                            <ArrowUpRight className="w-3 h-3" /> {t('depot.deliveryNotes.deliveryBadge')}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-3 mt-1 text-xs text-gray-600 flex-wrap">
                        <span className="flex items-center gap-1">
                          <Truck className="w-3 h-3" />
                          {n.driver?.full_name ?? 'I pacaktuar'}
                        </span>
                        {(n as { stock_confirmer?: { full_name?: string } }).stock_confirmer?.full_name && (
                          <span className="flex items-center gap-1 text-emerald-700">
                            Konfirmuar nga: {(n as { stock_confirmer?: { full_name?: string } }).stock_confirmer?.full_name}
                          </span>
                        )}
                        {n.depot?.name && (
                          <span className="flex items-center gap-1">
                            <MapPin className="w-3 h-3" />
                            {n.depot.name}
                          </span>
                        )}
                        {(n as any).partner_name && (
                          <span className="flex items-center gap-1">
                            <Package className="w-3 h-3" />
                            {(n as any).partner_name}
                          </span>
                        )}
                      </div>
                      {(n.delivery_address || n.pickup_address) && (
                        <p className="text-xs text-gray-500 mt-1 truncate">
                          {n.type === 'pickup' ? n.pickup_address : n.delivery_address}
                        </p>
                      )}
                      {(() => {
                        const items = n.items ?? [];
                        const totals = items.reduce(
                          (acc, it) => {
                            const action = it.intended_action ?? 'stock';
                            acc[action] = (acc[action] ?? 0) + (it.quantity ?? 0);
                            return acc;
                          },
                          { stock: 0, sorting: 0, repair: 0 } as Record<string, number>,
                        );
                        const batch = batchesByNote[n.id];
                        return (
                          <div className="flex items-center gap-2 flex-wrap mt-2">
                            {totals.stock > 0 && (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-green-50 text-green-700 border border-green-100">
                                <Package className="w-3 h-3" /> Stok: {totals.stock}
                              </span>
                            )}
                            {totals.sorting > 0 && (
                              <Link
                                to={batch ? `/depot/sorting?batch=${batch.id}` : '/depot/sorting'}
                                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-teal-50 text-teal-700 border border-teal-100 hover:bg-teal-100"
                              >
                                <Layers className="w-3 h-3" /> Sortire: {totals.sorting}
                              </Link>
                            )}
                            {totals.repair > 0 && (
                              <Link
                                to="/depot/repairs"
                                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-red-50 text-red-700 border border-red-100 hover:bg-red-100"
                              >
                                <Wrench className="w-3 h-3" /> Defekt: {totals.repair}
                              </Link>
                            )}
                          </div>
                        );
                      })()}
                    </div>
                    <div className="text-right flex-shrink-0 text-[11px]">
                      <p className="text-gray-500">{new Date(n.created_at).toLocaleDateString()}</p>
                      {(n as any).delivered_at && (
                        <p className="text-teal-600 font-semibold flex items-center gap-1 justify-end mt-1">
                          <Clock className="w-3 h-3" />
                          {new Date((n as any).delivered_at).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
