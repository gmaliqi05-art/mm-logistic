import { useEffect, useState } from 'react';
import { X, Truck, Warehouse, MapPin, User, Calendar, Package, Loader2, Save, AlertTriangle, FileText } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { useTranslation } from '../../i18n';
import type { DeliveryNote, DeliveryNoteItem, Profile, Depot } from '../../types';
import { notifyUsers } from '../../utils/notifications';

interface Props {
  noteId: string;
  onClose: () => void;
  onSaved?: () => void;
}

interface NoteFull extends DeliveryNote {
  items?: (DeliveryNoteItem & { category?: { name: string } | null })[];
}

const STATUS_STYLES: Record<string, string> = {
  draft: 'bg-gray-100 text-gray-700',
  sent: 'bg-blue-100 text-blue-700',
  in_transit: 'bg-amber-100 text-amber-700',
  delivered: 'bg-green-100 text-green-700',
  confirmed: 'bg-teal-100 text-teal-700',
  pending_company_review: 'bg-orange-100 text-orange-700',
  pending_stock_confirmation: 'bg-purple-100 text-purple-700',
  completed: 'bg-emerald-100 text-emerald-700',
  cancelled: 'bg-red-100 text-red-700',
};

export default function QuickNoteModal({ noteId, onClose, onSaved }: Props) {
  const { profile } = useAuth();
  const { t } = useTranslation();
  const [note, setNote] = useState<NoteFull | null>(null);
  const [drivers, setDrivers] = useState<Profile[]>([]);
  const [depots, setDepots] = useState<Depot[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({
    assigned_driver_id: '',
    assigned_depot_id: '',
    scheduled_delivery_at: '',
    scheduled_pickup_at: '',
    delivery_address: '',
    pickup_address: '',
    notes: '',
  });

  useEffect(() => {
    let active = true;
    async function load() {
      try {
        setLoading(true);
        setError(null);
        const [noteRes, driverRes, depotRes] = await Promise.all([
          supabase
            .from('delivery_notes')
            .select(
              '*, driver:profiles!delivery_notes_assigned_driver_id_fkey(id, full_name), depot:depots!delivery_notes_assigned_depot_id_fkey(id, name), items:delivery_note_items(*, category:product_categories(name))',
            )
            .eq('id', noteId)
            .maybeSingle(),
          supabase
            .from('profiles')
            .select('id, full_name')
            .eq('company_id', profile!.company_id!)
            .eq('role', 'driver')
            .eq('is_active', true)
            .order('full_name'),
          supabase
            .from('depots')
            .select('id, name')
            .eq('company_id', profile!.company_id!)
            .eq('is_active', true)
            .order('name'),
        ]);
        if (!active) return;
        if (noteRes.error) throw noteRes.error;
        const n = noteRes.data as NoteFull | null;
        if (!n) throw new Error(t('common.notFound') || 'Not found');
        setNote(n);
        setDrivers((driverRes.data ?? []) as Profile[]);
        setDepots((depotRes.data ?? []) as Depot[]);
        setForm({
          assigned_driver_id: n.assigned_driver_id ?? '',
          assigned_depot_id: n.assigned_depot_id ?? '',
          scheduled_delivery_at: n.scheduled_delivery_at ? toLocalInput(n.scheduled_delivery_at) : '',
          scheduled_pickup_at: n.scheduled_pickup_at ? toLocalInput(n.scheduled_pickup_at) : '',
          delivery_address: n.delivery_address ?? '',
          pickup_address: n.pickup_address ?? '',
          notes: n.notes ?? '',
        });
      } catch (e: unknown) {
        if (active) setError(e instanceof Error ? e.message : 'Error');
      } finally {
        if (active) setLoading(false);
      }
    }
    load();
    return () => {
      active = false;
    };
  }, [noteId, profile, t]);

  function toLocalInput(iso: string) {
    const d = new Date(iso);
    const off = d.getTimezoneOffset();
    const local = new Date(d.getTime() - off * 60000);
    return local.toISOString().slice(0, 16);
  }

  function fromLocalInput(s: string): string | null {
    if (!s) return null;
    const d = new Date(s);
    if (Number.isNaN(d.getTime())) return null;
    return d.toISOString();
  }

  async function handleSave() {
    if (!note) return;
    try {
      setSaving(true);
      setError(null);
      const update: Record<string, unknown> = {
        assigned_driver_id: form.assigned_driver_id || null,
        assigned_depot_id: form.assigned_depot_id || null,
        delivery_address: form.delivery_address,
        pickup_address: form.pickup_address,
        notes: form.notes,
        scheduled_delivery_at: fromLocalInput(form.scheduled_delivery_at),
        scheduled_pickup_at: fromLocalInput(form.scheduled_pickup_at),
      };
      const { error: upErr } = await supabase.from('delivery_notes').update(update).eq('id', note.id);
      if (upErr) throw upErr;

      if (form.assigned_driver_id && form.assigned_driver_id !== note.assigned_driver_id) {
        await notifyUsers({
          userIds: [form.assigned_driver_id],
          type: 'assignment',
          titleKey: 'notifications.templates.deliveryAssigned.title',
          messageKey: 'notifications.templates.deliveryAssigned.body',
          params: { number: note.note_number },
          referenceId: note.id,
          fallbackTitle: t('notifications.templates.deliveryAssigned.title') || 'Delivery assigned',
          fallbackMessage: `${note.note_number}`,
        });
      }

      setEditing(false);
      onSaved?.();
      const { data: refreshed } = await supabase
        .from('delivery_notes')
        .select(
          '*, driver:profiles!delivery_notes_assigned_driver_id_fkey(id, full_name), depot:depots!delivery_notes_assigned_depot_id_fkey(id, name), items:delivery_note_items(*, category:product_categories(name))',
        )
        .eq('id', note.id)
        .maybeSingle();
      if (refreshed) setNote(refreshed as NoteFull);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Error');
    } finally {
      setSaving(false);
    }
  }

  const canEdit = note && !['completed', 'confirmed', 'cancelled'].includes(note.status);
  const isPickup = note?.type === 'pickup';

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="bg-white w-full sm:max-w-2xl sm:rounded-2xl rounded-t-2xl shadow-2xl max-h-[92vh] flex flex-col">
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-gray-100">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className={`p-2 rounded-lg ${isPickup ? 'bg-orange-50' : 'bg-sky-50'}`}>
              {isPickup ? (
                <Package className={`w-5 h-5 ${isPickup ? 'text-orange-600' : 'text-sky-600'}`} />
              ) : (
                <Truck className="w-5 h-5 text-sky-600" />
              )}
            </div>
            <div className="min-w-0">
              <h2 className="font-bold text-gray-900 truncate">{note?.note_number || '...'}</h2>
              {note && (
                <span className={`inline-block mt-0.5 text-[10px] font-medium px-2 py-0.5 rounded-full ${STATUS_STYLES[note.status] || 'bg-gray-100 text-gray-700'}`}>
                  {t(`company.deliveryNotes.${note.status}`) || note.status}
                </span>
              )}
            </div>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-gray-100 transition-colors">
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-6 h-6 text-teal-600 animate-spin" />
            </div>
          ) : error ? (
            <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex items-start gap-2">
              <AlertTriangle className="w-5 h-5 text-red-500 flex-shrink-0" />
              <p className="text-sm text-red-700">{error}</p>
            </div>
          ) : note ? (
            <>
              {note.partner_name && (
                <InfoRow icon={User} label={t('company.deliveryNotes.partner') || 'Partner'} value={note.partner_name} />
              )}
              {note.reference_number && (
                <InfoRow icon={FileText} label={t('company.deliveryNotes.referenceNumber') || 'Reference'} value={note.reference_number} />
              )}

              {editing && canEdit ? (
                <div className="space-y-3 bg-teal-50/40 border border-teal-100 rounded-xl p-4">
                  <Field label={t('company.deliveryNotes.driver') || 'Driver'} icon={Truck}>
                    <select
                      value={form.assigned_driver_id}
                      onChange={(e) => setForm({ ...form, assigned_driver_id: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                    >
                      <option value="">-</option>
                      {drivers.map((d) => (
                        <option key={d.id} value={d.id}>
                          {d.full_name}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label={t('company.deliveryNotes.depot') || 'Depot'} icon={Warehouse}>
                    <select
                      value={form.assigned_depot_id}
                      onChange={(e) => setForm({ ...form, assigned_depot_id: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                    >
                      <option value="">-</option>
                      {depots.map((d) => (
                        <option key={d.id} value={d.id}>
                          {d.name}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field
                    label={
                      isPickup
                        ? t('company.deliveryNotes.scheduledPickup') || 'Scheduled pickup'
                        : t('company.deliveryNotes.scheduledDelivery') || 'Scheduled delivery'
                    }
                    icon={Calendar}
                  >
                    <input
                      type="datetime-local"
                      value={isPickup ? form.scheduled_pickup_at : form.scheduled_delivery_at}
                      onChange={(e) =>
                        setForm(
                          isPickup
                            ? { ...form, scheduled_pickup_at: e.target.value }
                            : { ...form, scheduled_delivery_at: e.target.value },
                        )
                      }
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                    />
                  </Field>
                  <Field
                    label={isPickup ? t('company.deliveryNotes.pickupAddress') || 'Pickup address' : t('company.deliveryNotes.deliveryAddress') || 'Delivery address'}
                    icon={MapPin}
                  >
                    <input
                      type="text"
                      value={isPickup ? form.pickup_address : form.delivery_address}
                      onChange={(e) =>
                        setForm(
                          isPickup
                            ? { ...form, pickup_address: e.target.value }
                            : { ...form, delivery_address: e.target.value },
                        )
                      }
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                    />
                  </Field>
                  <Field label={t('company.deliveryNotes.notes') || 'Notes'} icon={FileText}>
                    <textarea
                      rows={2}
                      value={form.notes}
                      onChange={(e) => setForm({ ...form, notes: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                    />
                  </Field>
                </div>
              ) : (
                <>
                  <InfoRow
                    icon={Truck}
                    label={t('company.deliveryNotes.driver') || 'Driver'}
                    value={note.driver?.full_name || '-'}
                  />
                  <InfoRow
                    icon={Warehouse}
                    label={t('company.deliveryNotes.depot') || 'Depot'}
                    value={note.depot?.name || '-'}
                  />
                  <InfoRow
                    icon={Calendar}
                    label={
                      isPickup
                        ? t('company.deliveryNotes.scheduledPickup') || 'Scheduled pickup'
                        : t('company.deliveryNotes.scheduledDelivery') || 'Scheduled delivery'
                    }
                    value={formatDateTime(isPickup ? note.scheduled_pickup_at : note.scheduled_delivery_at)}
                  />
                  <InfoRow
                    icon={MapPin}
                    label={
                      isPickup
                        ? t('company.deliveryNotes.pickupAddress') || 'Pickup address'
                        : t('company.deliveryNotes.deliveryAddress') || 'Delivery address'
                    }
                    value={(isPickup ? note.pickup_address : note.delivery_address) || '-'}
                  />
                  {note.notes && <InfoRow icon={FileText} label={t('company.deliveryNotes.notes') || 'Notes'} value={note.notes} />}
                </>
              )}

              {note.items && note.items.length > 0 && (
                <div className="bg-gray-50 rounded-xl p-3">
                  <p className="text-xs font-semibold text-gray-700 uppercase tracking-wide mb-2">
                    {t('company.deliveryNotes.items') || 'Items'} ({note.items.length})
                  </p>
                  <div className="space-y-1.5">
                    {note.items.map((it) => (
                      <div key={it.id} className="flex items-center justify-between text-sm bg-white rounded-lg px-3 py-2">
                        <span className="text-gray-700 truncate">{it.category?.name || '-'}</span>
                        <span className="font-semibold text-gray-900 tabular-nums">{it.quantity}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          ) : null}
        </div>

        {note && !loading && (
          <div className="px-5 py-3 border-t border-gray-100 flex items-center justify-end gap-2">
            {editing ? (
              <>
                <button
                  onClick={() => setEditing(false)}
                  disabled={saving}
                  className="px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
                >
                  {t('common.cancel')}
                </button>
                <button
                  onClick={handleSave}
                  disabled={saving}
                  className="inline-flex items-center gap-2 px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white text-sm font-semibold rounded-lg transition-colors disabled:opacity-60"
                >
                  {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                  {t('common.save')}
                </button>
              </>
            ) : (
              <>
                <button
                  onClick={onClose}
                  className="px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
                >
                  {t('common.close')}
                </button>
                {canEdit && (
                  <button
                    onClick={() => setEditing(true)}
                    className="px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white text-sm font-semibold rounded-lg transition-colors"
                  >
                    {t('common.edit')}
                  </button>
                )}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function InfoRow({ icon: Icon, label, value }: { icon: typeof Truck; label: string; value: string }) {
  return (
    <div className="flex items-start gap-3">
      <div className="p-1.5 rounded-lg bg-gray-50 flex-shrink-0">
        <Icon className="w-4 h-4 text-gray-500" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-[11px] font-medium text-gray-500 uppercase tracking-wide">{label}</p>
        <p className="text-sm text-gray-900 break-words">{value}</p>
      </div>
    </div>
  );
}

function Field({ icon: Icon, label, children }: { icon: typeof Truck; label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="flex items-center gap-1.5 text-[11px] font-semibold text-gray-600 uppercase tracking-wide mb-1">
        <Icon className="w-3.5 h-3.5" />
        {label}
      </span>
      {children}
    </label>
  );
}

function formatDateTime(iso?: string | null) {
  if (!iso) return '-';
  return new Date(iso).toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}
