import { useEffect, useState } from 'react';
import {
  ClipboardList,
  Loader2,
  Truck,
  MapPin,
  Clock,
  X,
  AlertTriangle,
  UserCheck,
  Package,
  CheckCircle2,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { useTranslation } from '../../i18n';
import { notifyUsers } from '../../utils/notifications';

interface DeliveryNoteRow {
  id: string;
  note_number: string;
  created_at: string;
  delivery_address: string | null;
  status: string;
  assigned_depot_id: string | null;
  partner_name: string | null;
  depot?: { name: string } | null;
}

interface Driver {
  id: string;
  full_name: string;
  phone: string;
}

export default function LogisticsDispatch() {
  const { profile } = useAuth();
  const { t } = useTranslation();
  const [notes, setNotes] = useState<DeliveryNoteRow[]>([]);
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [assignTarget, setAssignTarget] = useState<DeliveryNoteRow | null>(null);
  const [assignDriverId, setAssignDriverId] = useState('');
  const [assignSubmitting, setAssignSubmitting] = useState(false);

  useEffect(() => {
    if (!profile?.company_id) return;
    load();

    const channel = supabase
      .channel(`logistics-dispatch-${profile.company_id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'delivery_notes', filter: `company_id=eq.${profile.company_id}` },
        () => load(),
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [profile?.company_id]);

  async function load() {
    try {
      setLoading(true);
      setError(null);
      const companyId = profile!.company_id!;

      const [notesRes, driversRes] = await Promise.all([
        supabase
          .from('delivery_notes')
          .select(
            'id, note_number, created_at, delivery_address, status, assigned_depot_id, partner_name, depot:depots!delivery_notes_assigned_depot_id_fkey(name)',
          )
          .eq('company_id', companyId)
          .in('status', ['draft', 'sent'])
          .is('assigned_driver_id', null)
          .order('created_at', { ascending: true }),
        supabase
          .from('profiles')
          .select('id, full_name, phone')
          .eq('company_id', companyId)
          .eq('role', 'driver')
          .eq('is_active', true)
          .order('full_name'),
      ]);

      if (notesRes.error) throw notesRes.error;
      if (driversRes.error) throw driversRes.error;
      setNotes((notesRes.data as unknown as DeliveryNoteRow[]) ?? []);
      setDrivers((driversRes.data as Driver[]) ?? []);
    } catch (err) {
      setError((err as Error).message || t('common.errorLoading'));
    } finally {
      setLoading(false);
    }
  }

  async function handleAssign() {
    if (!assignTarget || !assignDriverId || !profile) return;
    try {
      setAssignSubmitting(true);
      setError(null);

      const { error: dnErr } = await supabase
        .from('delivery_notes')
        .update({
          assigned_driver_id: assignDriverId,
          status: 'sent',
          dispatched_at: new Date().toISOString(),
        })
        .eq('id', assignTarget.id);
      if (dnErr) throw dnErr;

      // Tell the driver they've been dispatched. The dispatch list only shows
      // currently-unassigned deliveries (see load(): `.is('assigned_driver_id',
      // null)`) so there's no previous driver to notify. Skip if the actor
      // is the driver themselves.
      if (assignDriverId !== profile?.id) {
        await notifyUsers({
          userIds: [assignDriverId],
          type: 'delivery',
          titleKey: 'notifications.templates.deliveryAssigned.title',
          messageKey: 'notifications.templates.deliveryAssigned.body',
          params: { number: assignTarget.note_number ?? '' },
          referenceId: assignTarget.id,
          fallbackTitle: 'Dergese e re per ty',
          fallbackMessage: `Te eshte caktuar dergesa ${assignTarget.note_number ?? ''}.`,
        });
      }

      setAssignTarget(null);
      setAssignDriverId('');
      await load();
    } catch (err) {
      setError((err as Error).message || t('logistics.dispatch.assignError'));
    } finally {
      setAssignSubmitting(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-12 h-12 animate-spin text-teal-600" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">{t('logistics.dispatch.title')}</h1>
        <p className="text-gray-500 mt-1">{t('logistics.dispatch.subtitle')}</p>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-center gap-3">
          <AlertTriangle className="w-5 h-5 text-red-500 flex-shrink-0" />
          <p className="text-red-700 text-sm flex-1">{error}</p>
          <button onClick={() => setError(null)} className="text-red-500 hover:text-red-700">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {notes.length === 0 ? (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-16 text-center">
          <CheckCircle2 className="w-12 h-12 mx-auto mb-4 text-emerald-300" />
          <p className="text-gray-500 text-sm">{t('logistics.dispatch.emptyTitle')}</p>
          <p className="text-gray-400 text-xs mt-1">{t('logistics.dispatch.emptySubtitle')}</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {notes.map((n) => (
            <div
              key={n.id}
              className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden hover:shadow-md transition-shadow"
            >
              <div className="px-5 py-3 border-b border-gray-100 bg-amber-50/40 flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg bg-amber-100 text-amber-700 flex items-center justify-center">
                  <ClipboardList className="w-4 h-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-bold text-gray-900 truncate">{n.note_number}</p>
                </div>
                <span className="text-xs px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 font-medium">
                  {t('logistics.status.pending')}
                </span>
              </div>
              <div className="p-5 space-y-3">
                <div className="flex items-center gap-2 text-sm text-gray-700">
                  <Package className="w-4 h-4 text-gray-400 flex-shrink-0" />
                  <span className="font-medium truncate">{n.partner_name ?? '-'}</span>
                </div>
                {n.delivery_address && (
                  <div className="flex items-start gap-2 text-sm text-gray-600">
                    <MapPin className="w-4 h-4 text-gray-400 flex-shrink-0 mt-0.5" />
                    <span className="break-words">{n.delivery_address}</span>
                  </div>
                )}
                <div className="flex items-center justify-between text-xs text-gray-500">
                  <span className="inline-flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    {new Date(n.created_at).toLocaleDateString()}
                  </span>
                  {n.depot?.name && (
                    <span className="inline-flex items-center gap-1">
                      <Truck className="w-3 h-3" />
                      {n.depot.name}
                    </span>
                  )}
                </div>
              </div>
              <div className="px-5 py-3 border-t border-gray-100 bg-gray-50">
                <button
                  onClick={() => {
                    setAssignTarget(n);
                    setAssignDriverId(drivers[0]?.id ?? '');
                  }}
                  className="w-full inline-flex items-center justify-center gap-2 px-4 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition-colors text-sm font-medium"
                >
                  <UserCheck className="w-4 h-4" />
                  {t('logistics.dispatch.assignDriver')}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {assignTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="fixed inset-0 bg-black/50"
            onClick={() => !assignSubmitting && setAssignTarget(null)}
          />
          <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-md">
            <div className="p-6">
              <div className="flex items-center gap-3 mb-4">
                <div className="p-3 bg-teal-50 rounded-xl">
                  <UserCheck className="w-6 h-6 text-teal-600" />
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-gray-900">{t('logistics.dispatch.assignDriver')}</h3>
                  <p className="text-xs text-gray-500 mt-0.5">{assignTarget.note_number}</p>
                </div>
              </div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">{t('logistics.dispatch.driver')}</label>
              <select
                value={assignDriverId}
                onChange={(e) => setAssignDriverId(e.target.value)}
                className="w-full px-3 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 text-sm bg-white"
              >
                <option value="">{t('logistics.dispatch.selectDriver')}</option>
                {drivers.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.full_name}
                  </option>
                ))}
              </select>
              {drivers.length === 0 && (
                <p className="text-xs text-amber-600 mt-1">{t('logistics.dispatch.noActiveDrivers')}</p>
              )}
            </div>
            <div className="flex items-center justify-end gap-3 p-6 border-t border-gray-100 bg-gray-50 rounded-b-2xl">
              <button
                onClick={() => setAssignTarget(null)}
                disabled={assignSubmitting}
                className="px-4 py-2.5 text-sm font-medium text-gray-700 bg-white border border-gray-200 rounded-lg hover:bg-gray-100 disabled:opacity-50"
              >
                {t('common.cancel')}
              </button>
              <button
                onClick={handleAssign}
                disabled={assignSubmitting || !assignDriverId}
                className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-white bg-teal-600 rounded-lg hover:bg-teal-700 disabled:opacity-50"
              >
                {assignSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserCheck className="w-4 h-4" />}
                {t('common.assign')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
