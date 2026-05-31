import { useState, useEffect, useRef, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  FileText,
  Plus,
  Search,
  Eye,
  X,
  AlertTriangle,
  Loader2,
  Send,
  MapPin,
  Minus,
  Package,
  Camera,
  Upload,
  File,
  Trash2,
  ArrowUpRight,
  ArrowDownLeft,
  ChevronDown,
  Building2,
  Layers,
  Truck,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { useSubscription } from '../../contexts/SubscriptionContext';
import { useTranslation } from '../../i18n';
import DocumentScanner from '../../components/scanner/DocumentScanner';
import type { DeliveryNote, DeliveryNoteItem, Profile, Depot, ProductCategory } from '../../types';
import { createNotificationAndPush } from '../../utils/pushNotifications';
import PartnerQuickRegister from './PartnerQuickRegister';
import OurRoleSelector, { type OurRole } from '../../components/delivery/OurRoleSelector';
import { type ThreePartyData } from '../../components/delivery/ThreePartyForm';
import { useDriverComplianceMap } from '../../hooks/useDriverComplianceMap';
import { notifyUsers } from '../../utils/notifications';

function emptyThreeParty(): ThreePartyData {
  return {
    consignor: { contact_id: null, name: '', vat: '', address: '', city: '', country: '' },
    carrier: { contact_id: null, name: '', vat: '', address: '', city: '', country: '' },
    consignee: { contact_id: null, name: '', vat: '', address: '', city: '', country: '' },
    carrier_vehicle_plate: '',
    goods_owner_contact_id: null,
  };
}

function mapRoleToType(role: OurRole): 'pickup' | 'delivery' {
  if (role === 'consignor' || role === 'custodian_out' || role === 'internal_transfer' || role === 'carrier') return 'delivery';
  return 'pickup';
}

interface NoteItemForm {
  category_id: string;
  product_id: string;
  quantity: number;
  condition: string;
  notes: string;
  intended_action: 'stock' | 'sorting' | 'repair';
}

interface CompanyProduct {
  id: string;
  name: string;
  category_id: string | null;
}

interface NoteForm {
  type: 'pickup' | 'delivery';
  note_number: string;
  assigned_driver_id: string;
  assigned_depot_id: string;
  partner_id: string;
  partner_name: string;
  delivery_address: string;
  pickup_address: string;
  reference_number: string;
  scheduled_pickup_date: string;
  scheduled_pickup_time: string;
  scheduled_delivery_date: string;
  scheduled_delivery_time: string;
  notes: string;
  items: NoteItemForm[];
  attachment_url: string;
  pallet_type: string;
}

interface Contact {
  id: string;
  name: string;
  address: string | null;
  city: string | null;
  postal_code: string | null;
  country: string | null;
  contact_type: 'customer' | 'supplier' | 'both';
}

const emptyItem: NoteItemForm = { category_id: '', product_id: '', quantity: 1, condition: 'good', notes: '', intended_action: 'stock' };

function todayLocalDate() {
  const d = new Date();
  const off = d.getTimezoneOffset();
  const local = new Date(d.getTime() - off * 60000);
  return local.toISOString().slice(0, 10);
}

function combineDateTime(date: string, time: string): string | null {
  if (!date) return null;
  const t = time && /^\d{2}:\d{2}$/.test(time) ? time : '00:00';
  const local = new Date(`${date}T${t}:00`);
  if (Number.isNaN(local.getTime())) return null;
  return local.toISOString();
}

const emptyForm: NoteForm = {
  type: 'delivery',
  note_number: '',
  assigned_driver_id: '',
  assigned_depot_id: '',
  partner_id: '',
  partner_name: '',
  delivery_address: '',
  pickup_address: '',
  reference_number: '',
  scheduled_pickup_date: '',
  scheduled_pickup_time: '',
  scheduled_delivery_date: '',
  scheduled_delivery_time: '',
  notes: '',
  items: [{ ...emptyItem }],
  attachment_url: '',
  pallet_type: 'EPAL',
};

function CollapsibleHeader({ label, icon, isOpen, onToggle }: { label: string; icon: React.ReactNode; isOpen: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className="w-full flex items-center gap-2 px-3 py-2.5 rounded-lg border border-gray-200 bg-gray-50 hover:bg-gray-100 transition-colors text-left"
    >
      <span className="text-gray-500">{icon}</span>
      <span className="flex-1 text-sm font-medium text-gray-700">{label}</span>
      <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
    </button>
  );
}

export default function CompanyDeliveryNotes() {
  const { profile } = useAuth();
  const { logAudit } = useSubscription();
  const { t } = useTranslation();
  const { warnings: driverComplianceWarnings } = useDriverComplianceMap(profile?.company_id);
  const [notes, setNotes] = useState<DeliveryNote[]>([]);
  const [drivers, setDrivers] = useState<Profile[]>([]);
  const [depots, setDepots] = useState<Depot[]>([]);
  const [categories, setCategories] = useState<ProductCategory[]>([]);
  const [products, setProducts] = useState<CompanyProduct[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [tabType, setTabType] = useState<'delivery' | 'pickup'>('delivery');
  const [searchParams, setSearchParams] = useSearchParams();
  const initialScope = useMemo(() => {
    const s = searchParams.get('scope');
    if (s === 'uninvoiced' || s === 'review' || s === 'invoiced') return s;
    return 'all';
  }, []);
  const [tabScope, setTabScope] = useState<'all' | 'review' | 'invoiced' | 'uninvoiced'>(initialScope);
  const [sortByPartner, setSortByPartner] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterDriver, setFilterDriver] = useState('');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [form, setForm] = useState<NoteForm>({ ...emptyForm });
  const [ourRole, setOurRole] = useState<OurRole>('consignor');
  const [threePartyData, setThreePartyData] = useState<ThreePartyData>(emptyThreeParty());
  const [saving, setSaving] = useState(false);
  const [selectedNote, setSelectedNote] = useState<DeliveryNote | null>(null);
  const [noteItems, setNoteItems] = useState<DeliveryNoteItem[]>([]);
  const [showDetail, setShowDetail] = useState(false);
  const [sendingId, setSendingId] = useState<string | null>(null);
  const [reassigning, setReassigning] = useState(false);
  const [showScanner, setShowScanner] = useState(false);
  const [uploadingAttachment, setUploadingAttachment] = useState(false);
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({});
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleteConfirmInput, setDeleteConfirmInput] = useState('');
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [removingItemId, setRemovingItemId] = useState<string | null>(null);
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const statusConfig: Record<string, { label: string; className: string }> = {
    draft: { label: t('company.deliveryNotes.draft'), className: 'bg-gray-100 text-gray-700' },
    sent: { label: t('company.deliveryNotes.sent'), className: 'bg-blue-100 text-blue-700' },
    in_transit: { label: t('company.deliveryNotes.inTransit'), className: 'bg-amber-100 text-amber-700' },
    delivered: { label: t('company.deliveryNotes.delivered'), className: 'bg-green-100 text-green-700' },
    confirmed: { label: t('company.deliveryNotes.confirmed'), className: 'bg-teal-100 text-teal-700' },
  };

  const typeConfig: Record<string, { label: string; className: string }> = {
    pickup: { label: t('company.deliveryNotes.pickup'), className: 'bg-orange-100 text-orange-700' },
    delivery: { label: t('company.deliveryNotes.delivery'), className: 'bg-blue-100 text-blue-700' },
  };

  useEffect(() => {
    if (profile?.company_id) fetchAll();
  }, [profile?.company_id]);

  async function fetchAll() {
    try {
      setLoading(true);
      setError(null);
      const companyId = profile!.company_id!;

      const [notesRes, driversRes, depotsRes, catsRes, contactsRes, productsRes] = await Promise.all([
        supabase
          .from('delivery_notes')
          .select('*, driver:profiles!delivery_notes_assigned_driver_id_fkey(id, full_name), depot:depots!delivery_notes_assigned_depot_id_fkey(id, name), creator:profiles!delivery_notes_created_by_fkey(full_name)')
          .eq('company_id', companyId)
          .neq('status', 'cancelled')
          .order('created_at', { ascending: false }),
        supabase
          .from('profiles')
          .select('*')
          .eq('company_id', companyId)
          .eq('role', 'driver')
          .eq('is_active', true),
        supabase.from('depots').select('*').eq('company_id', companyId).eq('is_active', true),
        supabase.from('product_categories').select('*').eq('company_id', companyId),
        supabase.from('acc_contacts').select('id, name, address, city, postal_code, country, contact_type').eq('company_id', companyId).eq('is_active', true).order('name'),
        supabase.from('category_products').select('id, name, category_id').eq('company_id', companyId).eq('is_active', true).order('name'),
      ]);

      if (notesRes.error) throw notesRes.error;
      if (driversRes.error) throw driversRes.error;
      if (depotsRes.error) throw depotsRes.error;
      if (catsRes.error) throw catsRes.error;

      setNotes(notesRes.data ?? []);
      setDrivers(driversRes.data ?? []);
      setDepots(depotsRes.data ?? []);
      setCategories(catsRes.data ?? []);
      setContacts((contactsRes.data ?? []) as Contact[]);
      setProducts((productsRes.data ?? []) as CompanyProduct[]);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.errorLoading'));
    } finally {
      setLoading(false);
    }
  }

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      setUploadingAttachment(true);
      const companyId = profile!.company_id!;
      const fileName = `${companyId}/${Date.now()}_${file.name}`;

      const { error: uploadErr } = await supabase.storage
        .from('attachments')
        .upload(fileName, file);

      if (uploadErr) throw uploadErr;

      const { data: urlData } = supabase.storage
        .from('attachments')
        .getPublicUrl(fileName);

      setForm({ ...form, attachment_url: urlData.publicUrl });
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.errorUploading'));
    } finally {
      setUploadingAttachment(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }

  function handleScanComplete(url: string) {
    setForm({ ...form, attachment_url: url });
    setShowScanner(false);
  }

  function removeAttachment() {
    setForm({ ...form, attachment_url: '' });
  }

  async function handleCreate() {
    const trimmedTitle = form.note_number.trim();

    if (!trimmedTitle) {
      setError(t('companyAdmin.deliveryNotes.errOrderTitle'));
      return;
    }

    const isQuickDraft = form.items.length === 0;

    if (isQuickDraft && !form.assigned_driver_id) {
      setError(
        'Per te krijuar porosi te shpejte, duhet te caktoni nje shofer. ' +
        'Shoferi do ta plotesoje porosine me skanim te dokumentit fizik.'
      );
      return;
    }

    try {
      setSaving(true);
      const companyId = profile!.company_id!;
      const noteNumber = trimmedTitle;

      if (!isQuickDraft && form.type === 'delivery' && form.items.length > 0) {
        const validationItems = form.items
          .filter((item) => item.category_id)
          .map((item) => ({
            category_id: item.category_id,
            category_product_id: item.product_id || null,
            quantity: item.quantity,
            condition: item.condition,
          }));

        const { data: validation, error: vErr } = await supabase.functions.invoke(
          'validate-delivery-action',
          {
            body: {
              action: 'create',
              type: 'delivery',
              items: validationItems,
              company_id: companyId,
            },
          }
        );

        if (vErr || !validation?.valid) {
          const blockerMsg = (validation?.blockers || ['Validimi deshtoi']).join('\n');
          setError(blockerMsg);
          setSaving(false);
          return;
        }

        if (validation.warnings?.length > 0) {
          const proceed = confirm(`Paralajmerime:\n${validation.warnings.join('\n')}\n\nVazhdo?`);
          if (!proceed) {
            setSaving(false);
            return;
          }
        }
      }

      const { data: noteData, error: noteErr } = await supabase
        .from('delivery_notes')
        .insert({
          company_id: companyId,
          created_by: profile!.id,
          assigned_driver_id: form.assigned_driver_id || null,
          assigned_depot_id: form.assigned_depot_id || null,
          note_number: noteNumber,
          type: form.type,
          status: isQuickDraft ? 'sent' : 'draft',
          is_quick_draft: isQuickDraft,
          our_role: ourRole,
          consignor_contact_id: threePartyData.consignor.contact_id || null,
          consignor_name: threePartyData.consignor.name || null,
          consignor_vat: threePartyData.consignor.vat || null,
          consignor_address: threePartyData.consignor.address || null,
          consignor_city: threePartyData.consignor.city || null,
          consignor_country: threePartyData.consignor.country || null,
          carrier_contact_id: threePartyData.carrier.contact_id || null,
          carrier_name: threePartyData.carrier.name || null,
          carrier_vat: threePartyData.carrier.vat || null,
          carrier_vehicle_plate: threePartyData.carrier_vehicle_plate || null,
          consignee_contact_id: threePartyData.consignee.contact_id || null,
          consignee_name: threePartyData.consignee.name || null,
          consignee_vat: threePartyData.consignee.vat || null,
          consignee_address: threePartyData.consignee.address || null,
          consignee_city: threePartyData.consignee.city || null,
          consignee_country: threePartyData.consignee.country || null,
          goods_owner_contact_id: threePartyData.goods_owner_contact_id || null,
          partner_id: form.partner_id || null,
          partner_name: form.partner_name || '',
          delivery_address: form.delivery_address,
          pickup_address: form.pickup_address,
          reference_number: form.reference_number || '',
          // The form only exposes one date input at a time (driven by
          // form.type), but both `scheduled_pickup_date` and
          // `scheduled_delivery_date` live in state — so when the user
          // switches type after typing, the stale date can still be
          // in the "other" field. Always store the picked date in
          // BOTH columns so the dashboard's today/tomorrow grouping
          // works regardless of which column it inspects.
          scheduled_pickup_at: form.type === 'pickup'
            ? combineDateTime(form.scheduled_pickup_date, form.scheduled_pickup_time)
            : combineDateTime(form.scheduled_delivery_date, form.scheduled_delivery_time),
          scheduled_pickup_time_set: form.type === 'pickup' ? !!form.scheduled_pickup_time : !!form.scheduled_delivery_time,
          scheduled_delivery_at: form.type === 'delivery'
            ? combineDateTime(form.scheduled_delivery_date, form.scheduled_delivery_time)
            : combineDateTime(form.scheduled_pickup_date, form.scheduled_pickup_time),
          scheduled_delivery_time_set: form.type === 'delivery' ? !!form.scheduled_delivery_time : !!form.scheduled_pickup_time,
          notes: form.notes,
          attachment_url: form.attachment_url || null,
          pallet_type: form.pallet_type || 'EPAL',
        })
        .select()
        .single();

      if (noteErr) throw noteErr;

      const itemsPayload = form.items
        .filter((item) => item.category_id)
        .map((item) => ({
          delivery_note_id: noteData.id,
          category_id: item.category_id,
          category_product_id: item.product_id || null,
          quantity: item.quantity,
          condition: item.condition,
          notes: item.notes,
          intended_action: item.intended_action,
        }));

      if (itemsPayload.length > 0) {
        const { error: itemsErr } = await supabase.from('delivery_note_items').insert(itemsPayload);
        if (itemsErr) throw itemsErr;
      }

      if (!isQuickDraft && form.assigned_driver_id) {
        const { error: sendErr } = await supabase
          .from('delivery_notes')
          .update({ status: 'sent', updated_at: new Date().toISOString() })
          .eq('id', noteData.id);
        if (sendErr) throw sendErr;
      }

      if (isQuickDraft && form.assigned_driver_id) {
        await createNotificationAndPush(
          form.assigned_driver_id,
          'delivery',
          t('notifications.templates.quickDraftAssigned.title'),
          t('notifications.templates.quickDraftAssigned.body').replace('{{noteNumber}}', trimmedTitle),
          `/driver/dashboard?note=${noteData.id}`
        );
      }

      await logAudit('create', 'delivery_note', noteData.id, { note_number: noteNumber, type: form.type });
      setShowCreateModal(false);
      setForm({ ...emptyForm });
      await fetchAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.errorSaving'));
    } finally {
      setSaving(false);
    }
  }

  async function openDetail(note: DeliveryNote) {
    setSelectedNote(note);
    setShowDetail(true);
    const { data } = await supabase
      .from('delivery_note_items')
      .select('*, category:product_categories(name), product:category_products(name)')
      .eq('delivery_note_id', note.id);
    setNoteItems(data ?? []);
  }

  async function updateStatus(noteId: string, newStatus: string) {
    try {
      const { error: err } = await supabase
        .from('delivery_notes')
        .update({ status: newStatus, updated_at: new Date().toISOString() })
        .eq('id', noteId);
      if (err) throw err;
      await fetchAll();
      if (selectedNote?.id === noteId) {
        setSelectedNote((prev) => (prev ? { ...prev, status: newStatus as any } : null));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.error'));
    }
  }

  async function reassignDriver(note: DeliveryNote, newDriverId: string) {
    const cleaned = newDriverId || null;
    const oldDriverId = note.assigned_driver_id ?? null;
    if (cleaned === oldDriverId) return;
    try {
      setReassigning(true);
      setError(null);
      const { data, error: err } = await supabase
        .from('delivery_notes')
        .update({ assigned_driver_id: cleaned, updated_at: new Date().toISOString() })
        .eq('id', note.id)
        .select('*, driver:profiles!delivery_notes_assigned_driver_id_fkey(full_name), depot:depots(name), creator:profiles!delivery_notes_created_by_fkey(full_name)')
        .maybeSingle();
      if (err) throw err;
      if (data) setSelectedNote(data as any);

      // Notify both sides of the reassignment. Skip if the note was never
      // dispatched (draft) — that's just routine editing, not a hand-off.
      const isLive = note.status !== 'draft';
      if (isLive) {
        if (oldDriverId && oldDriverId !== profile?.id) {
          await notifyUsers({
            userIds: [oldDriverId],
            type: 'delivery',
            titleKey: 'notifications.templates.deliveryReassignedFrom.title',
            messageKey: 'notifications.templates.deliveryReassignedFrom.body',
            params: { number: note.note_number },
            referenceId: note.id,
            fallbackTitle: 'Dergesa u kaloi tjeter',
            fallbackMessage: `Dergesa ${note.note_number} u rikalkulua nga ti tek nje shofer tjeter.`,
          });
        }
        if (cleaned && cleaned !== profile?.id) {
          await notifyUsers({
            userIds: [cleaned],
            type: 'delivery',
            titleKey: 'notifications.templates.deliveryAssigned.title',
            messageKey: 'notifications.templates.deliveryAssigned.body',
            params: { number: note.note_number },
            referenceId: note.id,
            fallbackTitle: 'Dergese e re per ty',
            fallbackMessage: `Te eshte caktuar dergesa ${note.note_number}.`,
          });
        }
      }

      await fetchAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.error'));
    } finally {
      setReassigning(false);
    }
  }

  async function sendToDriver(note: DeliveryNote) {
    if (!note.assigned_driver_id) {
      setError(t('company.deliveryNotes.noDriver'));
      return;
    }
    try {
      setSendingId(note.id);
      const { error: updateErr } = await supabase
        .from('delivery_notes')
        .update({ status: 'sent', updated_at: new Date().toISOString() })
        .eq('id', note.id);
      if (updateErr) throw updateErr;

      await createNotificationAndPush(
        note.assigned_driver_id,
        'delivery',
        t('company.deliveryNotes.newNote'),
        `${t('company.deliveryNotes.assignedNote')} ${note.note_number}`,
        '/driver/delivery-notes'
      );

      await fetchAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.error'));
    } finally {
      setSendingId(null);
    }
  }

  const DELETABLE_STATUSES = ['draft', 'sent', 'pending_company_review', 'cancelled'];

  function canDeleteNote(note: DeliveryNote | null): boolean {
    if (!note) return false;
    return DELETABLE_STATUSES.includes(note.status);
  }

  async function removeItemFromNote(itemId: string, noteId: string) {
    if (!confirm(t('company.deliveryNotes.removeItemConfirm'))) return;
    try {
      setRemovingItemId(itemId);
      const { error: rpcErr } = await supabase.rpc('remove_delivery_note_item', { p_item_id: itemId });
      if (rpcErr) throw rpcErr;
      const { data } = await supabase
        .from('delivery_note_items')
        .select('*, category:product_categories(name), product:category_products(name)')
        .eq('delivery_note_id', noteId)
        .order('created_at');
      setNoteItems((data as any) ?? []);
      await fetchAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.error'));
    } finally {
      setRemovingItemId(null);
    }
  }

  async function deleteNote(note: DeliveryNote) {
    if (!canDeleteNote(note)) {
      setError(t('company.deliveryNotes.deleteBlockedStock'));
      return;
    }
    try {
      setDeletingId(note.id);
      const { error: itemsErr } = await supabase
        .from('delivery_note_items')
        .delete()
        .eq('delivery_note_id', note.id);
      if (itemsErr) throw itemsErr;
      const { error: noteErr } = await supabase
        .from('delivery_notes')
        .delete()
        .eq('id', note.id);
      if (noteErr) throw noteErr;
      setShowDeleteConfirm(false);
      setDeleteConfirmInput('');
      setShowDetail(false);
      setSelectedNote(null);
      await fetchAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.error'));
    } finally {
      setDeletingId(null);
    }
  }

  const CANCELLABLE_STATUSES = ['sent', 'in_transit', 'pending_company_review', 'pending_stock_confirmation', 'delivered'];

  async function cancelNote(note: DeliveryNote) {
    try {
      setCancellingId(note.id);
      const { error: err } = await supabase
        .from('delivery_notes')
        .update({ status: 'cancelled', cancelled_at: new Date().toISOString(), cancelled_by: profile!.id })
        .eq('id', note.id);
      if (err) throw err;
      setShowDetail(false);
      setSelectedNote(null);
      await fetchAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.error'));
    } finally {
      setCancellingId(null);
    }
  }

  function addItem() {
    setForm({ ...form, items: [...form.items, { ...emptyItem }] });
  }

  function removeItem(index: number) {
    if (form.items.length <= 1) return;
    setForm({ ...form, items: form.items.filter((_, i) => i !== index) });
  }

  function updateItem(index: number, field: keyof NoteItemForm, value: string | number) {
    setForm((prev) => {
      const updated = [...prev.items];
      updated[index] = { ...updated[index], [field]: value };
      return { ...prev, items: updated };
    });
  }

  const filtered = notes.filter((n) => {
    if (n.type !== tabType) return false;
    if (tabScope === 'review' && !['pending_company_review', 'pending_stock_confirmation'].includes(n.status)) return false;
    if (tabScope === 'invoiced' && !(n as any).acc_invoice_id) return false;
    if (tabScope === 'uninvoiced' && ((n as any).acc_invoice_id || !['delivered', 'confirmed'].includes(n.status))) return false;
    if (filterStatus && n.status !== filterStatus) return false;
    if (filterDriver && n.assigned_driver_id !== filterDriver) return false;
    if (search) {
      const q = search.toLowerCase();
      const driverName = (n.driver as any)?.full_name?.toLowerCase() ?? '';
      const depotName = (n.depot as any)?.name?.toLowerCase() ?? '';
      const partnerName = ((n as any).partner_name || '').toLowerCase();
      if (
        !n.note_number.toLowerCase().includes(q) &&
        !driverName.includes(q) &&
        !depotName.includes(q) &&
        !partnerName.includes(q)
      ) {
        return false;
      }
    }
    return true;
  });

  const displayed = sortByPartner
    ? [...filtered].sort((a, b) => ((a as any).partner_name || '').localeCompare((b as any).partner_name || ''))
    : filtered;

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-teal-600" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{t('company.deliveryNotes.title')}</h1>
          <p className="text-gray-500 mt-1">{t('company.deliveryNotes.subtitle')}</p>
        </div>
        <button
          onClick={() => {
            const defaultDate = todayLocalDate();
            setForm({
              ...emptyForm,
              type: tabType,
              assigned_depot_id: depots.length === 1 ? depots[0].id : '',
              scheduled_delivery_date: tabType === 'delivery' ? defaultDate : '',
              scheduled_pickup_date: tabType === 'pickup' ? defaultDate : '',
            });
            setShowCreateModal(true);
          }}
          className="inline-flex items-center gap-2 px-4 py-2.5 bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition-colors font-medium"
        >
          <Plus className="w-4 h-4" />
          {t('company.deliveryNotes.createNote')}
        </button>
      </div>

      <div className="inline-flex bg-gray-100 rounded-lg p-1 gap-1">
        <button
          onClick={() => setTabType('delivery')}
          className={`px-5 py-2 rounded-md text-sm font-medium transition-colors inline-flex items-center gap-2 ${
            tabType === 'delivery' ? 'bg-white text-emerald-700 shadow-sm' : 'text-gray-600 hover:text-gray-900'
          }`}
        >
          <ArrowUpRight className="w-4 h-4" />
          {t('company.deliveryNotes.tabDelivery')}
        </button>
        <button
          onClick={() => setTabType('pickup')}
          className={`px-5 py-2 rounded-md text-sm font-medium transition-colors inline-flex items-center gap-2 ${
            tabType === 'pickup' ? 'bg-white text-blue-700 shadow-sm' : 'text-gray-600 hover:text-gray-900'
          }`}
        >
          <ArrowDownLeft className="w-4 h-4" />
          {t('company.deliveryNotes.tabPickup')}
        </button>
      </div>

      <div className="flex flex-wrap gap-2">
        {([
          { key: 'all', label: 'Te gjitha' },
          { key: 'uninvoiced', label: 'Pa fature' },
          { key: 'review', label: t('common.forReview') },
          { key: 'invoiced', label: 'Te faturuara' },
        ] as const).map((s) => (
          <button
            key={s.key}
            onClick={() => { setTabScope(s.key); if (searchParams.has('scope')) { searchParams.delete('scope'); setSearchParams(searchParams, { replace: true }); } }}
            className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-colors ${
              tabScope === s.key
                ? 'bg-teal-600 text-white'
                : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'
            }`}
          >
            {s.label}
          </button>
        ))}
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-center gap-3">
          <AlertTriangle className="w-5 h-5 text-red-500 flex-shrink-0" />
          <p className="text-red-700 text-sm">{error}</p>
          <button onClick={() => setError(null)} className="ml-auto text-red-500 hover:text-red-700">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      <div className="bg-white rounded-xl shadow-sm border border-gray-100">
        <div className="p-4 border-b border-gray-100">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                placeholder={t('company.deliveryNotes.searchPlaceholder')}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent text-sm"
              />
            </div>
            <div className="flex gap-2">
              <select
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value)}
                className="px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent text-sm"
              >
                <option value="">{t('company.deliveryNotes.allStatuses')}</option>
                {Object.entries(statusConfig).map(([key, cfg]) => (
                  <option key={key} value={key}>{cfg.label}</option>
                ))}
              </select>
              <select
                value={filterDriver}
                onChange={(e) => setFilterDriver(e.target.value)}
                className="px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent text-sm"
              >
                <option value="">{t('company.deliveryNotes.allDrivers')}</option>
                {drivers.map((d) => (
                  <option key={d.id} value={d.id}>{d.full_name}</option>
                ))}
              </select>
              <button
                onClick={() => setSortByPartner((v) => !v)}
                className={`px-3 py-2 rounded-lg text-sm font-medium border transition-colors ${
                  sortByPartner
                    ? 'bg-teal-600 text-white border-teal-600'
                    : 'bg-white text-gray-700 border-gray-200 hover:bg-gray-50'
                }`}
                title={t('common.renditSipasKompanisePartnere')}
              >
                Sipas Partnerit
              </button>
            </div>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-100">
                <th className="text-left px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">{t('company.deliveryNotes.noteNumber')}</th>
                <th className="text-left px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Partneri</th>
                <th className="text-left px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">{t('company.deliveryNotes.type')}</th>
                <th className="text-left px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">{t('common.status')}</th>
                <th className="text-left px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider hidden md:table-cell">{t('company.deliveryNotes.driver')}</th>
                <th className="text-left px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider hidden lg:table-cell">{t('company.deliveryNotes.depot')}</th>
                <th className="text-left px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider hidden xl:table-cell">{t('common.address')}</th>
                <th className="text-left px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider hidden lg:table-cell">{t('common.date')}</th>
                <th className="text-right px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">{t('common.actions')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {displayed.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-6 py-12 text-center text-gray-400">
                    <FileText className="w-10 h-10 mx-auto mb-3 text-gray-300" />
                    {t('company.deliveryNotes.noNotes')}
                  </td>
                </tr>
              ) : (
                displayed.map((note) => (
                  <tr key={note.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-6 py-4 text-sm font-medium text-gray-900">
                      <div className="flex items-center gap-2">
                        {(note as any).document_number || note.note_number}
                        {(note as any).document_number && (note as any).document_number !== note.note_number && (
                          <span className="text-xs text-gray-400" title="Titull i porosise">({note.note_number})</span>
                        )}
                        {(note as any).attachment_url && (
                          <a
                            href={(note as any).attachment_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            className="text-teal-600 hover:text-teal-800"
                            title="Shiko dokumentin"
                          >
                            <File className="w-3.5 h-3.5" />
                          </a>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-700 max-w-[180px]">
                      <div className="font-medium truncate">{(note as any).partner_name || '-'}</div>
                      <div className="text-xs text-gray-500 truncate">
                        {note.type === 'delivery' ? note.delivery_address : note.pickup_address || ''}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${typeConfig[note.type]?.className ?? ''}`}>
                        {typeConfig[note.type]?.label ?? note.type}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${statusConfig[note.status]?.className ?? ''}`}>
                        {statusConfig[note.status]?.label ?? note.status}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-600 hidden md:table-cell">
                      {(note.driver as any)?.full_name ?? '-'}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-600 hidden lg:table-cell">
                      {(note.depot as any)?.name ?? '-'}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-600 hidden xl:table-cell max-w-[200px] truncate">
                      {note.type === 'delivery' ? note.delivery_address : note.pickup_address || '-'}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-500 hidden lg:table-cell">
                      {new Date(note.created_at).toLocaleDateString()}
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => openDetail(note)}
                          className="p-2 text-gray-400 hover:text-teal-600 hover:bg-teal-50 rounded-lg transition-colors"
                          title={t('common.view')}
                        >
                          <Eye className="w-4 h-4" />
                        </button>
                        {note.status === 'draft' && note.assigned_driver_id && (
                          <button
                            onClick={() => sendToDriver(note)}
                            disabled={sendingId === note.id}
                            className="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors disabled:opacity-50"
                            title={t('company.deliveryNotes.sendToDriver')}
                          >
                            {sendingId === note.id ? (
                              <Loader2 className="w-4 h-4 animate-spin" />
                            ) : (
                              <Send className="w-4 h-4" />
                            )}
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-black/50" onClick={() => setShowCreateModal(false)} />
          <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-6 border-b border-gray-100 sticky top-0 bg-white rounded-t-2xl z-10">
              <h2 className="text-lg font-semibold text-gray-900">{t('company.deliveryNotes.createNote')}</h2>
              <button
                onClick={() => setShowCreateModal(false)}
                className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              {/* Derguesi - always visible, auto-filled with our company */}
              <div className="flex items-center gap-3 px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-lg">
                <Building2 className="w-4 h-4 text-slate-500 flex-shrink-0" />
                <div>
                  <span className="text-[10px] uppercase tracking-wider text-slate-400 font-medium">{t('common.derguesiKompaniaJone')}</span>
                  <p className="text-sm font-semibold text-slate-800">{(profile as any)?.company?.name || '—'}</p>
                </div>
              </div>

              {/* Essential fields: Driver, Depot */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">{t('company.deliveryNotes.driver')}</label>
                  <select
                    value={form.assigned_driver_id}
                    onChange={(e) => setForm({ ...form, assigned_driver_id: e.target.value })}
                    className="w-full px-3 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent text-sm"
                  >
                    <option value="">{t('company.deliveryNotes.selectDriver')}</option>
                    {drivers.map((d) => {
                      const w = driverComplianceWarnings[d.id];
                      const suffix = w ? (w.hasExpired ? ' • ⚠️' : ' • !') : '';
                      return (
                        <option key={d.id} value={d.id}>{d.full_name}{suffix}</option>
                      );
                    })}
                  </select>
                  {form.assigned_driver_id && driverComplianceWarnings[form.assigned_driver_id] && (
                    <div className={`mt-2 text-xs rounded-lg border p-2 ${
                      driverComplianceWarnings[form.assigned_driver_id].hasExpired
                        ? 'border-red-200 bg-red-50 text-red-800'
                        : 'border-amber-200 bg-amber-50 text-amber-800'
                    }`}>
                      <div className="font-semibold mb-1">
                        {driverComplianceWarnings[form.assigned_driver_id].hasExpired
                          ? 'Shoferi ka dokumente te skaduara'
                          : 'Dokumentet skadojne shpejt'}
                      </div>
                      <ul className="list-disc list-inside space-y-0.5">
                        {driverComplianceWarnings[form.assigned_driver_id].items.slice(0, 5).map((line, i) => (
                          <li key={i}>{line}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">{t('company.deliveryNotes.depot')}</label>
                  <select
                    value={form.assigned_depot_id}
                    onChange={(e) => setForm({ ...form, assigned_depot_id: e.target.value })}
                    className="w-full px-3 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent text-sm"
                  >
                    <option value="">{t('company.deliveryNotes.selectDepot')}</option>
                    {depots.map((d) => (
                      <option key={d.id} value={d.id}>{d.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Titull / Identifikim - always visible */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  Titull / Identifikim
                  <span className="text-red-500 ml-1">*</span>
                </label>
                <input
                  type="text"
                  value={form.note_number}
                  onChange={(e) => setForm({ ...form, note_number: e.target.value })}
                  className="w-full px-3 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent text-sm"
                  placeholder="p.sh. Emer kompanie, emer personi, numer reference, etj."
                />
                <p className="mt-1 text-xs text-gray-500">{t('common.vetemPerIdentifikimNgaShoferiNuk')}</p>
              </div>

              {/* Data dhe Ora - always visible */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">{t('common.date')}</label>
                  <input
                    type="date"
                    value={form.type === 'pickup' ? form.scheduled_pickup_date : form.scheduled_delivery_date}
                    onChange={(e) => setForm({
                      ...form,
                      ...(form.type === 'pickup'
                        ? { scheduled_pickup_date: e.target.value }
                        : { scheduled_delivery_date: e.target.value }),
                    })}
                    className="w-full px-3 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent text-sm"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">
                    Ora <span className="text-gray-400 font-normal">(opsionale)</span>
                  </label>
                  <input
                    type="time"
                    value={form.type === 'pickup' ? form.scheduled_pickup_time : form.scheduled_delivery_time}
                    onChange={(e) => setForm({
                      ...form,
                      ...(form.type === 'pickup'
                        ? { scheduled_pickup_time: e.target.value }
                        : { scheduled_delivery_time: e.target.value }),
                    })}
                    className="w-full px-3 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent text-sm"
                  />
                </div>
              </div>

              {/* Shenime - always visible */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">{t('company.deliveryNotes.notes')}</label>
                <textarea
                  value={form.notes}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                  rows={2}
                  className="w-full px-3 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent text-sm resize-none"
                  placeholder={t('company.deliveryNotes.notesPlaceholder')}
                />
              </div>

              {/* --- COLLAPSIBLE SECTIONS --- */}

              {/* Spedicioni (Carrier) */}
              <CollapsibleHeader
                label="Spedicioni (Carrier)"
                icon={<Truck className="w-4 h-4" />}
                isOpen={!!openSections.carrier}
                onToggle={() => setOpenSections((s) => ({ ...s, carrier: !s.carrier }))}
              />
              {openSections.carrier && (
                <div className="pl-2 border-l-2 border-slate-200 space-y-3">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">{t('threeParty.carrier.name')}</label>
                    <input
                      type="text"
                      value={threePartyData.carrier.name}
                      onChange={(e) => setThreePartyData({ ...threePartyData, carrier: { ...threePartyData.carrier, name: e.target.value } })}
                      className="w-full px-3 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent text-sm"
                      placeholder={t('threeParty.carrier.name')}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">{t('threeParty.vehiclePlate')}</label>
                    <input
                      type="text"
                      value={threePartyData.carrier_vehicle_plate}
                      onChange={(e) => setThreePartyData({ ...threePartyData, carrier_vehicle_plate: e.target.value })}
                      className="w-full px-3 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent text-sm"
                      placeholder={t('threeParty.vehiclePlate')}
                    />
                  </div>
                </div>
              )}

              {/* Marresi (Consignee) */}
              <CollapsibleHeader
                label="Marresi (Consignee)"
                icon={<MapPin className="w-4 h-4" />}
                isOpen={!!openSections.consignee}
                onToggle={() => setOpenSections((s) => ({ ...s, consignee: !s.consignee }))}
              />
              {openSections.consignee && (
                <div className="pl-2 border-l-2 border-slate-200 space-y-3">
                  {form.type === 'delivery' && (
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1.5">{t('company.deliveryNotes.deliveryAddress')}</label>
                      <input
                        type="text"
                        value={form.delivery_address}
                        onChange={(e) => setForm({ ...form, delivery_address: e.target.value })}
                        className="w-full px-3 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent text-sm"
                        placeholder={t('company.deliveryNotes.deliveryAddressPlaceholder')}
                      />
                    </div>
                  )}
                  {form.type === 'pickup' && (
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1.5">{t('company.deliveryNotes.pickupAddress')}</label>
                      <input
                        type="text"
                        value={form.pickup_address}
                        onChange={(e) => setForm({ ...form, pickup_address: e.target.value })}
                        className="w-full px-3 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent text-sm"
                        placeholder={t('company.deliveryNotes.pickupAddressPlaceholder')}
                      />
                    </div>
                  )}
                  {form.type === 'pickup' && (
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1.5">{t('companyAdmin.deliveryNotes.referenceNumberLabel')}</label>
                      <input
                        type="text"
                        value={form.reference_number}
                        onChange={(e) => setForm({ ...form, reference_number: e.target.value })}
                        className="w-full px-3 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent text-sm"
                        placeholder={t('common.egRef20260012GivenByPickupCompany')}
                      />
                      <p className="mt-1 text-xs text-orange-700">{t('common.shoferiETregonKeteNumerKur')}</p>
                    </div>
                  )}
                </div>
              )}

              {/* Kompania Partnere */}
              <CollapsibleHeader
                label="Kompania Partnere (Klient/Furnitor)"
                icon={<Building2 className="w-4 h-4" />}
                isOpen={!!openSections.partner}
                onToggle={() => setOpenSections((s) => ({ ...s, partner: !s.partner }))}
              />
              {openSections.partner && (
                <div className="pl-2 border-l-2 border-slate-200">
                  <PartnerSearchField
                    contacts={contacts}
                    form={form}
                    setForm={setForm}
                    onCreated={(c) => {
                      setContacts((prev) => [...prev, c].sort((a, b) => a.name.localeCompare(b.name)));
                      const addr = [c.address, [c.postal_code, c.city].filter(Boolean).join(' '), c.country].filter(Boolean).join(', ');
                      setForm({
                        ...form,
                        partner_id: c.id,
                        partner_name: c.name,
                        delivery_address: form.type === 'delivery' ? addr : form.delivery_address,
                        pickup_address: form.type === 'pickup' ? addr : form.pickup_address,
                      });
                    }}
                  />
                </div>
              )}

              {/* Roli juaj ne kete dorezim */}
              <CollapsibleHeader
                label="Roli juaj ne kete dorezim"
                icon={<Package className="w-4 h-4" />}
                isOpen={!!openSections.role}
                onToggle={() => setOpenSections((s) => ({ ...s, role: !s.role }))}
              />
              {openSections.role && (
                <div className="pl-2 border-l-2 border-slate-200">
                  <OurRoleSelector
                    value={ourRole}
                    onChange={(role) => {
                      setOurRole(role);
                      setForm((f) => ({ ...f, type: mapRoleToType(role) }));
                    }}
                  />
                </div>
              )}

              {/* Dokument / Foto */}
              <CollapsibleHeader
                label="Dokument / Foto"
                icon={<File className="w-4 h-4" />}
                isOpen={!!openSections.document}
                onToggle={() => setOpenSections((s) => ({ ...s, document: !s.document }))}
              />
              {openSections.document && (
                <div className="pl-2 border-l-2 border-slate-200">
                  {form.attachment_url ? (
                    <div className="flex items-center gap-2 p-3 bg-gray-50 rounded-lg border border-gray-200">
                      <File className="w-5 h-5 text-teal-600 flex-shrink-0" />
                      <span className="text-sm text-gray-700 flex-1 truncate">Dokument i bashkangjitur</span>
                      <button
                        onClick={removeAttachment}
                        className="p-1.5 text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                        title="Hiq dokumentin"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ) : (
                    <div className="flex gap-2">
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept="image/*,application/pdf"
                        onChange={handleFileUpload}
                        className="hidden"
                      />
                      <button
                        onClick={() => fileInputRef.current?.click()}
                        disabled={uploadingAttachment}
                        className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 border-2 border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50 text-sm font-medium"
                      >
                        {uploadingAttachment ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <Upload className="w-4 h-4" />
                        )}
                        Ngarko Dokument
                      </button>
                      <button
                        onClick={() => setShowScanner(true)}
                        className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 border-2 border-teal-500 text-teal-700 bg-teal-50 rounded-lg hover:bg-teal-100 transition-colors text-sm font-medium"
                      >
                        <Camera className="w-4 h-4" />{t('common.skanoDokument')}</button>
                    </div>
                  )}
                </div>
              )}

              {/* Artikujt */}
              <CollapsibleHeader
                label={t('company.deliveryNotes.items')}
                icon={<Package className="w-4 h-4" />}
                isOpen={!!openSections.items}
                onToggle={() => setOpenSections((s) => ({ ...s, items: !s.items }))}
              />
              {openSections.items && (
                <div className="pl-2 border-l-2 border-slate-200 space-y-3">
                  <div className="flex justify-end">
                    <button
                      onClick={addItem}
                      className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-teal-700 bg-teal-50 rounded-lg hover:bg-teal-100 transition-colors"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      {t('company.deliveryNotes.addItem')}
                    </button>
                  </div>
                  <div className="space-y-3">
                    {form.items.map((item, index) => (
                      <ItemRow
                        key={index}
                        item={item}
                        categories={categories}
                        products={products}
                        onChange={(field, value) => updateItem(index, field, value)}
                        onRemove={() => removeItem(index)}
                        canRemove={form.items.length > 1}
                        t={t}
                      />
                    ))}
                  </div>
                </div>
              )}

              {/* Shkembim paletash */}
              <CollapsibleHeader
                label="Shkembim paletash"
                icon={<Layers className="w-4 h-4" />}
                isOpen={!!openSections.pallets}
                onToggle={() => setOpenSections((s) => ({ ...s, pallets: !s.pallets }))}
              />
              {openSections.pallets && (
                <div className="pl-2 border-l-2 border-slate-200">
                  <div className="border border-teal-100 bg-teal-50/50 rounded-lg p-3 space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-semibold text-teal-900">{t('common.type')}</span>
                      <select
                        value={form.pallet_type}
                        onChange={(e) => setForm({ ...form, pallet_type: e.target.value })}
                        className="px-2 py-1 text-xs border border-teal-200 rounded bg-white"
                      >
                        <option value="EPAL">EPAL</option>
                        <option value="UIC">UIC</option>
                        <option value="CHEP">CHEP</option>
                        <option value="Disposable">Disposable</option>
                      </select>
                    </div>
                    <div className="flex items-center justify-between rounded-md bg-white border border-teal-200 px-3 py-2">
                      <span className="text-xs text-gray-600">{t('common.totalVleresimLive')}</span>
                      <span className="text-sm font-bold text-teal-900">
                        {form.items
                          .filter((i) => i.category_id)
                          .reduce((s, i) => s + (Number(i.quantity) || 0), 0)}{' '}
                        paleta
                      </span>
                    </div>
                    <p className="text-[11px] text-teal-800">{t('common.regjistriIPaletaveAzhurnohetAutomatikishtKur')}</p>
                  </div>
                </div>
              )}
            </div>

            <div className="flex items-center justify-end gap-3 p-4 sm:p-6 border-t border-gray-100 sticky bottom-0 bg-white rounded-b-2xl pb-[max(1rem,env(safe-area-inset-bottom))]">
              <button
                onClick={() => setShowCreateModal(false)}
                className="px-4 py-2.5 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
              >
                {t('common.cancel')}
              </button>
              <button
                onClick={handleCreate}
                disabled={saving}
                className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-white bg-teal-600 rounded-lg hover:bg-teal-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {saving && <Loader2 className="w-4 h-4 animate-spin" />}
                {t('company.deliveryNotes.createNote')}
              </button>
            </div>
          </div>
        </div>
      )}

      {showDetail && selectedNote && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <div className="fixed inset-0 bg-black/50" onClick={() => setShowDetail(false)} />
          <div className="relative bg-white w-full max-w-lg shadow-xl overflow-y-auto">
            <div className="flex items-center justify-between p-6 border-b border-gray-100 sticky top-0 bg-white z-10">
              <div>
                <h2 className="text-lg font-semibold text-gray-900">{(selectedNote as any).document_number || selectedNote.note_number}</h2>
                {(selectedNote as any).document_number && (selectedNote as any).document_number !== selectedNote.note_number && (
                  <p className="text-xs text-gray-400 mt-0.5">Porosi: {selectedNote.note_number}</p>
                )}
                <div className="flex items-center gap-2 mt-1">
                  <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${typeConfig[selectedNote.type]?.className ?? ''}`}>
                    {typeConfig[selectedNote.type]?.label ?? selectedNote.type}
                  </span>
                  <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${statusConfig[selectedNote.status]?.className ?? ''}`}>
                    {statusConfig[selectedNote.status]?.label ?? selectedNote.status}
                  </span>
                </div>
              </div>
              <button
                onClick={() => setShowDetail(false)}
                className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-6">
              <div>
                <label className="block text-xs font-medium text-gray-500 uppercase tracking-wider mb-2">{t('company.deliveryNotes.changeStatus')}</label>
                <select
                  value={selectedNote.status}
                  onChange={(e) => updateStatus(selectedNote.id, e.target.value)}
                  className="w-full px-3 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent text-sm"
                >
                  {Object.entries(statusConfig).map(([key, cfg]) => (
                    <option key={key} value={key}>{cfg.label}</option>
                  ))}
                </select>
              </div>

              {selectedNote.status === 'draft' && selectedNote.assigned_driver_id && (
                <button
                  onClick={() => sendToDriver(selectedNote)}
                  disabled={sendingId === selectedNote.id}
                  className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
                >
                  {sendingId === selectedNote.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                  {t('company.deliveryNotes.sendToDriver')}
                </button>
              )}

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <div className="flex items-center justify-between">
                    <p className="text-xs text-gray-500 uppercase tracking-wider">{t('company.deliveryNotes.driver')}</p>
                    {reassigning && <Loader2 className="w-3 h-3 animate-spin text-gray-400" />}
                  </div>
                  {selectedNote.status === 'delivered' || selectedNote.status === 'completed' || selectedNote.status === 'confirmed' || selectedNote.status === 'cancelled' ? (
                    <p className="text-sm font-medium text-gray-900 mt-1">{(selectedNote.driver as any)?.full_name ?? '-'}</p>
                  ) : (
                    <select
                      value={selectedNote.assigned_driver_id ?? ''}
                      disabled={reassigning}
                      onChange={(e) => reassignDriver(selectedNote, e.target.value)}
                      className="mt-1 w-full px-2 py-1.5 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                    >
                      <option value="">{t('common.dashNoDriverSpaces')}</option>
                      {drivers.map((d) => (
                        <option key={d.id} value={d.id}>{d.full_name}</option>
                      ))}
                    </select>
                  )}
                </div>
                <div>
                  <p className="text-xs text-gray-500 uppercase tracking-wider">{t('company.deliveryNotes.depot')}</p>
                  <p className="text-sm font-medium text-gray-900 mt-1">{(selectedNote.depot as any)?.name ?? '-'}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500 uppercase tracking-wider">{t('company.deliveryNotes.creator')}</p>
                  <p className="text-sm font-medium text-gray-900 mt-1">{(selectedNote.creator as any)?.full_name ?? '-'}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500 uppercase tracking-wider">{t('common.date')}</p>
                  <p className="text-sm font-medium text-gray-900 mt-1">{new Date(selectedNote.created_at).toLocaleDateString()}</p>
                </div>
              </div>

              {(selectedNote as any).partner_name && (
                <div className="p-3 bg-teal-50 border border-teal-200 rounded-lg">
                  <p className="text-xs text-teal-700 uppercase tracking-wider">{t('common.kompaniaPartnere')}</p>
                  <p className="text-sm font-semibold text-teal-900 mt-1">{(selectedNote as any).partner_name}</p>
                </div>
              )}

              {selectedNote.type === 'pickup' && (selectedNote as any).reference_number && (
                <div className="p-3 bg-orange-50 border border-orange-200 rounded-lg">
                  <p className="text-xs text-orange-700 uppercase tracking-wider">{t('common.numriIReferences')}</p>
                  <p className="text-base font-bold text-orange-900 tracking-wider mt-1">{(selectedNote as any).reference_number}</p>
                </div>
              )}

              {((selectedNote as any).scheduled_pickup_at || (selectedNote as any).scheduled_delivery_at) && (
                <div className="grid grid-cols-2 gap-3 text-xs">
                  {(selectedNote as any).scheduled_pickup_at && (
                    <div className="p-2.5 bg-gray-50 rounded-lg">
                      <p className="text-gray-500 uppercase tracking-wider">
                        {(selectedNote as any).scheduled_pickup_time_set ? t('companyAdmin.deliveryNotes.pickupTime') : t('companyAdmin.deliveryNotes.pickupDate')}
                      </p>
                      <p className="text-gray-800 font-medium mt-0.5">
                        {(selectedNote as any).scheduled_pickup_time_set
                          ? new Date((selectedNote as any).scheduled_pickup_at).toLocaleString()
                          : new Date((selectedNote as any).scheduled_pickup_at).toLocaleDateString()}
                      </p>
                    </div>
                  )}
                  {(selectedNote as any).scheduled_delivery_at && (
                    <div className="p-2.5 bg-gray-50 rounded-lg">
                      <p className="text-gray-500 uppercase tracking-wider">
                        {(selectedNote as any).scheduled_delivery_time_set ? t('companyAdmin.deliveryNotes.deliveryTime') : t('companyAdmin.deliveryNotes.deliveryDate')}
                      </p>
                      <p className="text-gray-800 font-medium mt-0.5">
                        {(selectedNote as any).scheduled_delivery_time_set
                          ? new Date((selectedNote as any).scheduled_delivery_at).toLocaleString()
                          : new Date((selectedNote as any).scheduled_delivery_at).toLocaleDateString()}
                      </p>
                    </div>
                  )}
                </div>
              )}

              {(selectedNote as any).delivered_at && (
                <div className="p-3 bg-green-50 border border-green-200 rounded-lg">
                  <p className="text-xs text-green-700 uppercase tracking-wider">Dorezuar me</p>
                  <p className="text-sm font-semibold text-green-900 mt-1">{new Date((selectedNote as any).delivered_at).toLocaleString()}</p>
                </div>
              )}

              {(selectedNote.delivery_address || selectedNote.pickup_address) && (
                <div className="space-y-3">
                  {selectedNote.delivery_address && (
                    <div className="flex items-start gap-2 p-3 bg-gray-50 rounded-lg">
                      <MapPin className="w-4 h-4 text-teal-600 mt-0.5 flex-shrink-0" />
                      <div>
                        <p className="text-xs text-gray-500">{t('company.deliveryNotes.deliveryAddress')}</p>
                        <p className="text-sm text-gray-900">{selectedNote.delivery_address}</p>
                      </div>
                    </div>
                  )}
                  {selectedNote.pickup_address && (
                    <div className="flex items-start gap-2 p-3 bg-gray-50 rounded-lg">
                      <MapPin className="w-4 h-4 text-orange-600 mt-0.5 flex-shrink-0" />
                      <div>
                        <p className="text-xs text-gray-500">{t('company.deliveryNotes.pickupAddress')}</p>
                        <p className="text-sm text-gray-900">{selectedNote.pickup_address}</p>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {selectedNote.notes && (
                <div>
                  <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">{t('company.deliveryNotes.notes')}</p>
                  <p className="text-sm text-gray-700 bg-gray-50 rounded-lg p-3">{selectedNote.notes}</p>
                </div>
              )}

              {(() => {
                const scanUrl = (selectedNote as any).scanned_photo_url as string | null;
                const attachUrl = selectedNote.attachment_url;
                const docs = [
                  scanUrl ? { url: scanUrl, label: 'Skanim nga shoferi' } : null,
                  attachUrl && attachUrl !== scanUrl ? { url: attachUrl, label: 'Bashkelidhur' } : null,
                ].filter(Boolean) as { url: string; label: string }[];
                if (docs.length === 0) return null;
                return (
                  <div>
                    <p className="text-xs text-gray-500 uppercase tracking-wider mb-2">Dokumenti origjinal</p>
                    <div className="space-y-2">
                      {docs.map((d) => {
                        const isImage = /\.(jpg|jpeg|png|webp|gif)(\?|$)/i.test(d.url);
                        const isPdf = /\.pdf(\?|$)/i.test(d.url);
                        return (
                          <div key={d.url} className="rounded-lg border border-teal-200 bg-teal-50 overflow-hidden">
                            {isImage ? (
                              <a href={d.url} target="_blank" rel="noopener noreferrer" className="block">
                                <img src={d.url} alt={d.label} className="w-full max-h-72 object-contain bg-white" />
                              </a>
                            ) : (
                              <a
                                href={d.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex items-center gap-2 p-4 bg-white hover:bg-teal-50 transition-colors"
                              >
                                <File className="w-6 h-6 text-teal-600 flex-shrink-0" />
                                <span className="text-sm font-medium text-teal-700">
                                  {isPdf ? 'Shiko PDF' : 'Shiko dokumentin'}
                                </span>
                              </a>
                            )}
                            <div className="flex items-center justify-between px-3 py-2 bg-white border-t border-teal-100">
                              <span className="text-xs font-semibold text-teal-700">{d.label}</span>
                              <a
                                href={d.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-xs font-semibold text-teal-600 hover:text-teal-700"
                              >
                                Hap origjinalin
                              </a>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })()}

              <div>
                <p className="text-xs text-gray-500 uppercase tracking-wider mb-3">{t('company.deliveryNotes.items')} ({noteItems.length})</p>
                {noteItems.length === 0 ? (
                  <div className="text-center py-6">
                    <Package className="w-8 h-8 text-gray-300 mx-auto mb-2" />
                    <p className="text-sm text-gray-400">{t('company.deliveryNotes.noItems')}</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {noteItems.map((item) => (
                      <div key={item.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                        <div>
                          <p className="text-sm font-medium text-gray-900">{(item as any).product?.name ?? (item.category as any)?.name ?? '-'}</p>
                          {(item as any).product?.name && (item.category as any)?.name && (
                            <p className="text-[11px] text-gray-500 mt-0.5">{(item.category as any).name}</p>
                          )}
                          {item.notes && <p className="text-xs text-gray-500 mt-0.5">{item.notes}</p>}
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-semibold text-gray-900">{item.quantity}</span>
                          <span
                            className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                              item.condition === 'good'
                                ? 'bg-green-100 text-green-700'
                                : item.condition === 'damaged'
                                ? 'bg-red-100 text-red-700'
                                : 'bg-gray-100 text-gray-700'
                            }`}
                          >
                            {item.condition === 'good' ? t('company.stock.good') : item.condition === 'damaged' ? t('company.stock.damaged') : item.condition}
                          </span>
                          <button
                            onClick={() => removeItemFromNote(item.id, selectedNote.id)}
                            disabled={removingItemId === item.id}
                            title={t('company.deliveryNotes.removeItem')}
                            className="p-1.5 text-red-500 hover:text-red-700 hover:bg-red-50 rounded-md transition-colors disabled:opacity-50"
                          >
                            {removingItemId === item.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {selectedNote.type === 'delivery' && ['confirmed', 'completed'].includes(selectedNote.status) && (
                <div className="mt-4">
                  <button
                    onClick={() => {
                      if ((selectedNote as any).acc_invoice_id) {
                        window.location.href = `/company/invoices/${(selectedNote as any).acc_invoice_id}/print`;
                      } else {
                        window.location.href = `/company/invoices/new?delivery_note_id=${selectedNote.id}`;
                      }
                    }}
                    className={`w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium rounded-lg transition-colors ${
                      (selectedNote as any).acc_invoice_id
                        ? 'text-teal-800 bg-teal-50 border border-teal-200 hover:bg-teal-100'
                        : 'text-white bg-sky-600 hover:bg-sky-700'
                    }`}
                  >
                    <FileText className="w-4 h-4" />
                    {(selectedNote as any).acc_invoice_id ? 'Shiko faturen' : t('common.createInvoice')}
                  </button>
                </div>
              )}

              {CANCELLABLE_STATUSES.includes(selectedNote.status) && (
                <div className="mt-4">
                  <button
                    onClick={() => cancelNote(selectedNote)}
                    disabled={cancellingId === selectedNote.id}
                    className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium text-red-700 bg-red-50 border border-red-200 rounded-lg hover:bg-red-100 transition-colors disabled:opacity-50"
                  >
                    {cancellingId === selectedNote.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <X className="w-4 h-4" />}
                    Anulo porosin
                  </button>
                </div>
              )}

              {canDeleteNote(selectedNote) && (
                <div className="mt-4 pt-4 border-t border-red-100">
                  <p className="text-xs font-semibold text-red-700 uppercase tracking-wider mb-2">
                    {t('company.deliveryNotes.dangerZone')}
                  </p>
                  {!showDeleteConfirm ? (
                    <button
                      onClick={() => {
                        setDeleteConfirmInput('');
                        setShowDeleteConfirm(true);
                      }}
                      className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium text-red-700 bg-red-50 border border-red-200 rounded-lg hover:bg-red-100 transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                      {t('company.deliveryNotes.delete')}
                    </button>
                  ) : (
                    <div className="p-3 bg-red-50 border border-red-200 rounded-lg space-y-3">
                      <div>
                        <p className="text-sm font-semibold text-red-900">
                          {t('company.deliveryNotes.deleteConfirmTitle')}
                        </p>
                        <p className="text-xs text-red-700 mt-1">
                          {t('company.deliveryNotes.deleteConfirmBody').replace('{number}', selectedNote.note_number)}
                        </p>
                      </div>
                      <input
                        type="text"
                        value={deleteConfirmInput}
                        onChange={(e) => setDeleteConfirmInput(e.target.value)}
                        placeholder={selectedNote.note_number}
                        className="w-full px-3 py-2 text-sm border border-red-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500"
                      />
                      <div className="flex gap-2">
                        <button
                          onClick={() => {
                            setShowDeleteConfirm(false);
                            setDeleteConfirmInput('');
                          }}
                          disabled={deletingId === selectedNote.id}
                          className="flex-1 px-3 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50"
                        >
                          {t('common.cancel')}
                        </button>
                        <button
                          onClick={() => deleteNote(selectedNote)}
                          disabled={deleteConfirmInput !== selectedNote.note_number || deletingId === selectedNote.id}
                          className="flex-1 inline-flex items-center justify-center gap-2 px-3 py-2 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700 transition-colors disabled:opacity-50"
                        >
                          {deletingId === selectedNote.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                          {t('company.deliveryNotes.delete')}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {showScanner && (
        <DocumentScanner
          onClose={() => setShowScanner(false)}
          onScanComplete={handleScanComplete}
        />
      )}
    </div>
  );
}

interface ItemRowProps {
  item: NoteItemForm;
  categories: ProductCategory[];
  products: CompanyProduct[];
  onChange: (field: keyof NoteItemForm, value: string | number) => void;
  onRemove: () => void;
  canRemove: boolean;
  t: (key: string) => string;
}

function ItemRow({ item, categories, products, onChange, onRemove, canRemove, t }: ItemRowProps) {
  const [catQuery, setCatQuery] = useState('');
  const [catOpen, setCatOpen] = useState(false);
  const catRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (catRef.current && !catRef.current.contains(e.target as Node)) setCatOpen(false);
    }
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  const selectedCategory = categories.find((c) => c.id === item.category_id) || null;
  const filteredCategories = categories.filter((c) =>
    !catQuery.trim() || c.name.toLowerCase().includes(catQuery.trim().toLowerCase())
  );
  const productsForCategory = item.category_id
    ? products.filter((p) => p.category_id === item.category_id)
    : [];

  function pickCategory(id: string) {
    onChange('category_id', id);
    onChange('product_id', '');
    setCatOpen(false);
    setCatQuery('');
  }

  return (
    <div className="flex items-start gap-2 p-3 bg-gray-50 rounded-lg">
      <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-2">
        <div ref={catRef} className="relative lg:col-span-2">
          <button
            type="button"
            onClick={() => setCatOpen((o) => !o)}
            className="w-full text-left px-2 py-2 border border-gray-200 bg-white rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent truncate"
          >
            {selectedCategory ? selectedCategory.name : `${t('company.stock.category')}...`}
          </button>
          {catOpen && (
            <div className="absolute z-20 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg max-h-60 overflow-y-auto">
              <div className="p-2 sticky top-0 bg-white border-b border-gray-100">
                <input
                  autoFocus
                  value={catQuery}
                  onChange={(e) => setCatQuery(e.target.value)}
                  placeholder={t('company.deliveryNotes.categorySearchPlaceholder')}
                  className="w-full px-2 py-1.5 border border-gray-200 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                />
              </div>
              {filteredCategories.length === 0 ? (
                <div className="p-3 text-sm text-gray-500">—</div>
              ) : (
                <ul>
                  {filteredCategories.map((c) => (
                    <li key={c.id}>
                      <button
                        type="button"
                        onClick={() => pickCategory(c.id)}
                        className={`w-full text-left px-3 py-2 text-sm hover:bg-teal-50 ${
                          c.id === item.category_id ? 'bg-teal-50 text-teal-700 font-medium' : ''
                        }`}
                      >
                        {c.name}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>

        <select
          value={item.product_id}
          onChange={(e) => onChange('product_id', e.target.value)}
          disabled={!item.category_id}
          className="px-2 py-2 border border-gray-200 bg-white rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent disabled:bg-gray-100 disabled:text-gray-400"
        >
          <option value="">{t('company.deliveryNotes.productPlaceholder')}</option>
          {productsForCategory.map((p) => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>

        <input
          type="number"
          min={1}
          value={item.quantity}
          onChange={(e) => onChange('quantity', parseInt(e.target.value) || 1)}
          className="px-2 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent"
          placeholder={t('company.deliveryNotes.quantityLabel')}
        />
        <select
          value={item.intended_action}
          onChange={(e) => {
            const v = e.target.value as 'stock' | 'sorting' | 'repair';
            onChange('intended_action', v);
            if (v === 'repair') onChange('condition', 'damaged');
            else if (v === 'sorting') onChange('condition', 'sorting');
            else onChange('condition', 'good');
          }}
          className="px-2 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent"
        >
          <option value="stock">{t('company.deliveryNotes.actionStock')}</option>
          <option value="sorting">{t('company.deliveryNotes.actionSorting')}</option>
          <option value="repair">{t('company.deliveryNotes.actionRepair')}</option>
        </select>
        <select
          value={item.condition}
          onChange={(e) => onChange('condition', e.target.value)}
          className="px-2 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent"
        >
          <option value="good">{t('company.stock.good')}</option>
          <option value="damaged">{t('company.stock.damaged')}</option>
        </select>
      </div>
      <button
        onClick={onRemove}
        disabled={!canRemove}
        className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-30 disabled:cursor-not-allowed mt-0.5"
      >
        <Minus className="w-4 h-4" />
      </button>
    </div>
  );
}

interface PartnerSearchFieldProps {
  contacts: Contact[];
  form: NoteForm;
  setForm: (f: NoteForm) => void;
  onCreated: (c: Contact) => void;
}

function PartnerSearchField({ contacts, form, setForm, onCreated }: PartnerSearchFieldProps) {
  const { profile } = useAuth();
  const { t } = useTranslation();
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [showRegister, setShowRegister] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  const allowedTypes = form.type === 'delivery'
    ? ['customer', 'both']
    : ['supplier', 'both'];

  const filtered = contacts.filter((c) => {
    if (!allowedTypes.includes(c.contact_type)) return false;
    if (!query.trim()) return true;
    return c.name.toLowerCase().includes(query.trim().toLowerCase());
  });

  function pick(c: Contact) {
    const addr = [c.address, [c.postal_code, c.city].filter(Boolean).join(' '), c.country].filter(Boolean).join(', ');
    setForm({
      ...form,
      partner_id: c.id,
      partner_name: c.name,
      delivery_address: form.type === 'delivery' ? addr : form.delivery_address,
      pickup_address: form.type === 'pickup' ? addr : form.pickup_address,
    });
    setQuery('');
    setOpen(false);
  }

  function clear() {
    setForm({ ...form, partner_id: '', partner_name: '' });
    setQuery('');
  }

  const selectedLabel = form.partner_id
    ? contacts.find((c) => c.id === form.partner_id)?.name ?? form.partner_name
    : '';

  return (
    <div ref={ref} className="relative">
      <label className="block text-sm font-medium text-gray-700 mb-1.5">{t('common.kompaniaPartnereKlientFurnitor')}</label>
      {form.partner_id ? (
        <div className="flex items-center justify-between gap-2 px-3 py-2.5 border border-teal-200 bg-teal-50 rounded-lg">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-teal-900 truncate">{selectedLabel}</p>
            <p className="text-[11px] text-teal-700">{t('common.adresaUPlotesuaAutomatikisht')}</p>
          </div>
          <button type="button" onClick={clear} className="text-xs text-teal-800 hover:underline shrink-0">{t('common.edit')}</button>
        </div>
      ) : (
        <>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              value={query}
              onFocus={() => setOpen(true)}
              onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
              placeholder={t('threeParty.searchPartner')}
              className="w-full pl-9 pr-3 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent text-sm"
            />
          </div>
          {open && (
            <div className="absolute z-30 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg max-h-72 overflow-y-auto">
              {filtered.length === 0 ? (
                <div className="p-3 text-sm text-gray-500">
                  {query.trim()
                    ? t('companyAdmin.deliveryNotes.noCompanyFound').replace('{query}', query.trim())
                    : t('companyAdmin.deliveryNotes.noCompanyRegistered')}
                </div>
              ) : (
                <ul>
                  {filtered.map((c) => (
                    <li key={c.id}>
                      <button
                        type="button"
                        onClick={() => pick(c)}
                        className="w-full text-left px-3 py-2 text-sm hover:bg-teal-50"
                      >
                        <span className="font-medium text-gray-900">{c.name}</span>
                        {(c.city || c.country) && (
                          <span className="ml-2 text-xs text-gray-500">
                            {[c.city, c.country].filter(Boolean).join(', ')}
                          </span>
                        )}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              <button
                type="button"
                onClick={() => { setShowRegister(true); setOpen(false); }}
                className="w-full flex items-center gap-2 px-3 py-2.5 border-t border-gray-100 bg-gray-50 text-sm font-semibold text-teal-700 hover:bg-teal-50"
              >
                <Plus className="w-4 h-4" />{t('common.regjistroKompaniTeRe')}</button>
            </div>
          )}
        </>
      )}
      {showRegister && profile?.company_id && (
        <PartnerQuickRegister
          companyId={profile.company_id}
          defaultType={form.type === 'delivery' ? 'customer' : 'supplier'}
          initialName={query.trim()}
          onClose={() => setShowRegister(false)}
          onCreated={(p) => { onCreated(p as Contact); }}
        />
      )}
    </div>
  );
}
