import { useState, useEffect, useCallback } from 'react';
import { Plus, AlertTriangle, X, Loader2, Truck, Search, CreditCard as Edit3, Trash2, ChevronRight, FileText, Eye, ArrowUpRight, ArrowDownLeft, RefreshCw } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { PageSkeleton } from '../../components/ui/Skeleton';
import { useTranslation } from '../../i18n';
import DocumentPreviewModal from '../../components/accounting/DocumentPreviewModal';
import OurRoleSelector, { type OurRole } from '../../components/delivery/OurRoleSelector';
import ThreePartyForm, { type ThreePartyData } from '../../components/delivery/ThreePartyForm';

function emptyThreeParty(): ThreePartyData {
  return {
    consignor: { contact_id: null, name: '', vat: '', address: '', city: '', country: '' },
    carrier: { contact_id: null, name: '', vat: '', address: '', city: '', country: '' },
    consignee: { contact_id: null, name: '', vat: '', address: '', city: '', country: '' },
    carrier_vehicle_plate: '',
    goods_owner_contact_id: null,
  };
}
import type {
  AccDeliveryNote,
  AccDeliveryNoteStatus,
  AccDeliveryNoteKind,
} from '../../types/accounting';
import { UNITS } from '../../types/accounting';

interface NoteForm {
  contact_id: string;
  note_date: string;
  shipping_address: string;
  notes: string;
  invoice_id: string;
  kind: AccDeliveryNoteKind;
}

interface ItemForm {
  product_id: string;
  description: string;
  quantity: number;
  unit: string;
  image_url: string;
}

const emptyNoteForm: NoteForm = {
  contact_id: '',
  note_date: new Date().toISOString().split('T')[0],
  shipping_address: '',
  notes: '',
  invoice_id: '',
  kind: 'sale',
};

const kindStyles: Record<AccDeliveryNoteKind, string> = {
  sale: 'bg-emerald-100 text-emerald-700',
  purchase_receipt: 'bg-blue-100 text-blue-700',
  transfer: 'bg-fuchsia-100 text-fuchsia-700',
  return_in: 'bg-orange-100 text-orange-700',
  return_out: 'bg-red-100 text-red-700',
};

const KIND_VALUES: AccDeliveryNoteKind[] = ['sale', 'purchase_receipt', 'transfer', 'return_in', 'return_out'];

function kindIcon(kind: AccDeliveryNoteKind) {
  if (kind === 'sale' || kind === 'return_out') return ArrowUpRight;
  if (kind === 'purchase_receipt' || kind === 'return_in') return ArrowDownLeft;
  return RefreshCw;
}

const emptyItemForm: ItemForm = {
  product_id: '',
  description: '',
  quantity: 1,
  unit: 'pcs',
  image_url: '',
};

const statusOrder: AccDeliveryNoteStatus[] = ['draft', 'sent', 'in_transit', 'delivered', 'confirmed'];

const statusStyles: Record<AccDeliveryNoteStatus, string> = {
  draft: 'bg-gray-100 text-gray-700',
  sent: 'bg-blue-100 text-blue-700',
  in_transit: 'bg-amber-100 text-amber-700',
  delivered: 'bg-emerald-100 text-emerald-700',
  confirmed: 'bg-green-100 text-green-700',
};

const statusLabels: Record<AccDeliveryNoteStatus, string> = {
  draft: 'Draft',
  sent: 'Derguar',
  in_transit: 'Ne Tranzit',
  delivered: 'Dorezuar',
  confirmed: 'Konfirmuar',
};

export default function AccDeliveryNotes() {
  const { profile } = useAuth();
  const { t } = useTranslation();

  const [notes, setNotes] = useState<AccDeliveryNote[]>([]);
  const [contacts, setContacts] = useState<{ id: string; name: string; address: string; city: string; postal_code: string; country: string }[]>([]);
  const [invoices, setInvoices] = useState<{ id: string; invoice_number: string }[]>([]);
  const [products, setProducts] = useState<{ id: string; name: string; image_url: string; unit: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [searchQuery, setSearchQuery] = useState('');
  const [kindFilter, setKindFilter] = useState<AccDeliveryNoteKind | 'all'>('all');
  const [showModal, setShowModal] = useState(false);
  const [editingNote, setEditingNote] = useState<AccDeliveryNote | null>(null);
  const [previewNote, setPreviewNote] = useState<AccDeliveryNote | null>(null);
  const [form, setForm] = useState<NoteForm>(emptyNoteForm);
  const [items, setItems] = useState<ItemForm[]>([{ ...emptyItemForm }]);
  const [ourRole, setOurRole] = useState<OurRole>('consignor');
  const [threePartyData, setThreePartyData] = useState<ThreePartyData>(emptyThreeParty());

  useEffect(() => {
    if (profile?.company_id) fetchData();
  }, [profile?.company_id]);

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const companyId = profile!.company_id!;

      const [notesRes, contactsRes, invoicesRes, productsRes] = await Promise.all([
        supabase
          .from('acc_delivery_notes')
          .select('*, contact:acc_contacts(id, name), items:acc_delivery_note_items(*)')
          .eq('company_id', companyId)
          .order('created_at', { ascending: false }),
        supabase
          .from('acc_contacts')
          .select('id, name, address, city, postal_code, country')
          .eq('company_id', companyId)
          .eq('is_active', true)
          .order('name'),
        supabase
          .from('acc_invoices')
          .select('id, invoice_number')
          .eq('company_id', companyId)
          .order('created_at', { ascending: false }),
        supabase
          .from('acc_products')
          .select('id, name, image_url, unit')
          .eq('company_id', companyId)
          .eq('is_active', true)
          .order('name'),
      ]);

      if (notesRes.error) throw notesRes.error;
      if (contactsRes.error) throw contactsRes.error;
      if (invoicesRes.error) throw invoicesRes.error;
      if (productsRes.error) throw productsRes.error;

      setNotes(notesRes.data ?? []);
      setContacts(contactsRes.data ?? []);
      setInvoices(invoicesRes.data ?? []);
      setProducts(productsRes.data ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.errorLoading'));
    } finally {
      setLoading(false);
    }
  }, [profile?.company_id]);

  const filteredNotes = notes.filter((n) => {
    if (kindFilter !== 'all' && (n.kind || 'sale') !== kindFilter) return false;
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      n.note_number?.toLowerCase().includes(q) ||
      (n.contact as any)?.name?.toLowerCase().includes(q) ||
      n.shipping_address?.toLowerCase().includes(q)
    );
  });

  const openCreate = () => {
    setEditingNote(null);
    setForm(emptyNoteForm);
    setItems([{ ...emptyItemForm }]);
    setShowModal(true);
  };

  const openEdit = (note: AccDeliveryNote) => {
    setEditingNote(note);
    setForm({
      contact_id: note.contact_id || '',
      note_date: note.note_date,
      shipping_address: note.shipping_address || '',
      notes: note.notes || '',
      invoice_id: note.invoice_id || '',
      kind: (note.kind as AccDeliveryNoteKind) || 'sale',
    });
    const existingItems = (note.items || []).map((it) => ({
      product_id: it.product_id || '',
      description: it.description || '',
      quantity: it.quantity,
      unit: it.unit || 'pcs',
      image_url: it.image_url || '',
    }));
    setItems(existingItems.length > 0 ? existingItems : [{ ...emptyItemForm }]);
    setShowModal(true);
  };

  const handleContactChange = (contactId: string) => {
    setForm({ ...form, contact_id: contactId });
    const contact = contacts.find((c) => c.id === contactId);
    if (contact && !form.shipping_address) {
      const addr = [contact.address, contact.postal_code, contact.city, contact.country]
        .filter(Boolean)
        .join(', ');
      setForm((prev) => ({ ...prev, contact_id: contactId, shipping_address: addr }));
    }
  };

  const handleProductChange = (index: number, productId: string) => {
    const product = products.find((p) => p.id === productId);
    const updated = [...items];
    updated[index] = {
      ...updated[index],
      product_id: productId,
      description: product?.name || '',
      unit: product?.unit || 'pcs',
      image_url: product?.image_url || '',
    };
    setItems(updated);
  };

  const addItem = () => {
    setItems([...items, { ...emptyItemForm }]);
  };

  const removeItem = (index: number) => {
    if (items.length <= 1) return;
    setItems(items.filter((_, i) => i !== index));
  };

  const updateItem = (index: number, field: keyof ItemForm, value: string | number) => {
    const updated = [...items];
    updated[index] = { ...updated[index], [field]: value };
    setItems(updated);
  };

  const handleSave = async () => {
    if (!form.contact_id) {
      setError(t('accounting.deliveryNotes.customerRequired') || 'Klienti eshte i detyrueshem');
      return;
    }
    try {
      setSaving(true);
      setError(null);
      const companyId = profile!.company_id!;

      if (editingNote) {
        const { error: updateErr } = await supabase
          .from('acc_delivery_notes')
          .update({
            contact_id: form.contact_id || null,
            note_date: form.note_date,
            shipping_address: form.shipping_address.trim(),
            notes: form.notes.trim(),
            invoice_id: form.invoice_id || null,
            kind: form.kind,
          })
          .eq('id', editingNote.id);
        if (updateErr) throw updateErr;

        await supabase
          .from('acc_delivery_note_items')
          .delete()
          .eq('delivery_note_id', editingNote.id);

        const validItems = items.filter((it) => it.description.trim());
        if (validItems.length > 0) {
          const { error: itemsErr } = await supabase.from('acc_delivery_note_items').insert(
            validItems.map((it) => ({
              delivery_note_id: editingNote.id,
              product_id: it.product_id || null,
              description: it.description.trim(),
              quantity: Number(it.quantity),
              unit: it.unit,
              image_url: it.image_url,
            }))
          );
          if (itemsErr) throw itemsErr;
        }
      } else {
        const { data: numData, error: numErr } = await supabase.rpc('get_next_acc_number', {
          p_company_id: companyId,
          p_prefix: 'FL',
        });
        if (numErr) throw numErr;

        const { data: newNote, error: insertErr } = await supabase
          .from('acc_delivery_notes')
          .insert({
            company_id: companyId,
            created_by: profile!.id,
            contact_id: form.contact_id || null,
            note_number: numData,
            note_date: form.note_date,
            status: 'draft' as AccDeliveryNoteStatus,
            shipping_address: form.shipping_address.trim(),
            notes: form.notes.trim(),
            invoice_id: form.invoice_id || null,
            kind: form.kind,
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
          })
          .select()
          .single();
        if (insertErr) throw insertErr;

        const validItems = items.filter((it) => it.description.trim());
        if (validItems.length > 0 && newNote) {
          const { error: itemsErr } = await supabase.from('acc_delivery_note_items').insert(
            validItems.map((it) => ({
              delivery_note_id: newNote.id,
              product_id: it.product_id || null,
              description: it.description.trim(),
              quantity: Number(it.quantity),
              unit: it.unit,
              image_url: it.image_url,
            }))
          );
          if (itemsErr) throw itemsErr;
        }
      }

      setShowModal(false);
      setEditingNote(null);
      setForm(emptyNoteForm);
      setItems([{ ...emptyItemForm }]);
      await fetchData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gabim gjate ruajtjes');
    } finally {
      setSaving(false);
    }
  };

  const changeStatus = async (note: AccDeliveryNote, newStatus: AccDeliveryNoteStatus) => {
    try {
      setError(null);
      const { error: err } = await supabase
        .from('acc_delivery_notes')
        .update({ status: newStatus })
        .eq('id', note.id);
      if (err) throw err;
      await fetchData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gabim gjate ndryshimit te statusit');
    }
  };

  const getNextStatus = (current: AccDeliveryNoteStatus): AccDeliveryNoteStatus | null => {
    const idx = statusOrder.indexOf(current);
    if (idx < 0 || idx >= statusOrder.length - 1) return null;
    return statusOrder[idx + 1];
  };

  if (loading) {
    return <PageSkeleton rows={8} cols={6} />;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Fletedaljet</h1>
          <p className="text-gray-500 mt-1">Menaxho fletedaljet e dorezimit</p>
        </div>
        <button
          onClick={openCreate}
          className="inline-flex items-center gap-2 px-4 py-2.5 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors font-medium text-sm"
        >
          <Plus className="w-4 h-4" />
          Shto Fletedalje
        </button>
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

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 space-y-3">
        <div className="flex flex-col md:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={t('accounting.deliveryNotes.searchPlaceholder')}
              className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent text-sm"
            />
          </div>
          <select
            value={kindFilter}
            onChange={(e) => setKindFilter(e.target.value as AccDeliveryNoteKind | 'all')}
            className="px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 text-sm bg-white"
          >
            <option value="all">{t('accounting.deliveryNotes.allKinds')}</option>
            {KIND_VALUES.map((k) => (
              <option key={k} value={k}>{t(`accounting.deliveryNotes.kind.${k}`)}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-100">
                <th className="text-left px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Nr.</th>
                <th className="text-left px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">{t('accounting.deliveryNotes.kindLabel')}</th>
                <th className="text-left px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">{t('accounting.deliveryNotes.partner')}</th>
                <th className="text-left px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">{t('common.date')}</th>
                <th className="text-left px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">{t('common.status')}</th>
                <th className="text-left px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">{t('accounting.deliveryNotes.address')}</th>
                <th className="text-left px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">{t('accounting.deliveryNotes.invoice')}</th>
                <th className="text-right px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">{t('common.actions')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {filteredNotes.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-6 py-16 text-center">
                    <Truck className="w-12 h-12 mx-auto mb-4 text-gray-300" />
                    <p className="text-gray-500 font-medium">{t('accounting.deliveryNotes.empty')}</p>
                    <p className="text-gray-400 text-sm mt-1">{t('accounting.deliveryNotes.emptyHint')}</p>
                  </td>
                </tr>
              ) : (
                filteredNotes.map((note) => {
                  const nextStatus = getNextStatus(note.status);
                  const k: AccDeliveryNoteKind = (note.kind as AccDeliveryNoteKind) || 'sale';
                  const KIcon = kindIcon(k);
                  return (
                    <tr key={note.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-6 py-4">
                        <span className="text-sm font-medium text-gray-900">{note.note_number}</span>
                      </td>
                      <td className="px-6 py-4">
                        <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium ${kindStyles[k]}`}>
                          <KIcon className="w-3 h-3" />
                          {t(`accounting.deliveryNotes.kind.${k}`)}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-600">
                        {(note.contact as any)?.name || '-'}
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-600">
                        {new Date(note.note_date).toLocaleDateString('de-DE')}
                      </td>
                      <td className="px-6 py-4">
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${statusStyles[note.status]}`}>
                          {statusLabels[note.status]}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-600 truncate max-w-[200px]">
                        {note.shipping_address || '-'}
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-600">
                        {note.invoice_id ? (
                          <span className="inline-flex items-center gap-1 text-emerald-600">
                            <FileText className="w-3.5 h-3.5" />
                            {invoices.find((i) => i.id === note.invoice_id)?.invoice_number || 'Fature'}
                          </span>
                        ) : (
                          '-'
                        )}
                      </td>
                      <td className="px-6 py-4 text-right">
                        <div className="flex items-center justify-end gap-1">
                          {nextStatus && (
                            <button
                              onClick={() => changeStatus(note, nextStatus)}
                              className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-emerald-700 bg-emerald-50 rounded-lg hover:bg-emerald-100 transition-colors"
                            >
                              <ChevronRight className="w-3.5 h-3.5" />
                              {statusLabels[nextStatus]}
                            </button>
                          )}
                          <button
                            onClick={() => setPreviewNote(note)}
                            className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                            title="Preview"
                          >
                            <Eye className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => openEdit(note)}
                            className="p-1.5 text-gray-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors"
                            title="Ndrysho"
                          >
                            <Edit3 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {previewNote && (
        <DocumentPreviewModal
          title={`Fletedalje ${previewNote.note_number}`}
          subtitle="Fletedalja e dorezimit"
          statusLabel={statusLabels[previewNote.status]}
          statusClass={statusStyles[previewNote.status]}
          accentColor="emerald"
          fields={[
            { label: 'Klienti', value: (previewNote.contact as any)?.name },
            { label: 'Data', value: new Date(previewNote.note_date).toLocaleDateString('de-DE') },
            { label: 'Adresa e Dergimit', value: previewNote.shipping_address, highlight: true },
            { label: 'Fatura e Lidhur', value: invoices.find((i) => i.id === previewNote.invoice_id)?.invoice_number },
          ]}
          items={(previewNote.items || []).map((it: any) => ({
            description: it.description,
            quantity: it.quantity,
            unit: it.unit,
            image_url: it.image_url,
          }))}
          notes={previewNote.notes || undefined}
          onClose={() => setPreviewNote(null)}
          onPrint={() => window.print()}
        />
      )}

      {showModal && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <div className="flex items-center justify-center min-h-screen px-4 pt-4 pb-20">
            <div className="fixed inset-0 bg-black/50 transition-opacity" onClick={() => setShowModal(false)} />
            <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-3xl max-h-[90vh] overflow-y-auto">
              <div className="sticky top-0 bg-white border-b border-gray-100 px-6 py-4 rounded-t-2xl z-10">
                <div className="flex items-center justify-between">
                  <h2 className="text-lg font-semibold text-gray-900">
                    {editingNote ? `Ndrysho ${editingNote.note_number}` : 'Shto Fletedalje te Re'}
                  </h2>
                  <button
                    onClick={() => setShowModal(false)}
                    className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
              </div>

              <div className="p-6 space-y-6">
                <OurRoleSelector value={ourRole} onChange={setOurRole} />
                <ThreePartyForm
                  ourRole={ourRole}
                  ourCompanyName={(profile as any)?.company?.name || ''}
                  data={threePartyData}
                  onChange={setThreePartyData}
                  companyId={profile!.company_id!}
                />
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">{t('accounting.deliveryNotes.kindLabel')} *</label>
                  <select
                    value={form.kind}
                    onChange={(e) => setForm({ ...form, kind: e.target.value as AccDeliveryNoteKind })}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent text-sm"
                  >
                    {KIND_VALUES.map((k) => (
                      <option key={k} value={k}>{t(`accounting.deliveryNotes.kind.${k}`)}</option>
                    ))}
                  </select>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Klienti *</label>
                    <select
                      value={form.contact_id}
                      onChange={(e) => handleContactChange(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent text-sm"
                    >
                      <option value="">{t('common.selectClientInline')}</option>
                      {contacts.map((c) => (
                        <option key={c.id} value={c.id}>{c.name}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Data</label>
                    <input
                      type="date"
                      value={form.note_date}
                      onChange={(e) => setForm({ ...form, note_date: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent text-sm"
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="block text-sm font-medium text-gray-700 mb-1">Adresa e Dergimit</label>
                    <textarea
                      value={form.shipping_address}
                      onChange={(e) => setForm({ ...form, shipping_address: e.target.value })}
                      rows={2}
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent text-sm resize-none"
                      placeholder={t('common.fullDeliveryAddressPlaceholder')}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Fatura e Lidhur</label>
                    <select
                      value={form.invoice_id}
                      onChange={(e) => setForm({ ...form, invoice_id: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent text-sm"
                    >
                      <option value="">Pa fature</option>
                      {invoices.map((inv) => (
                        <option key={inv.id} value={inv.id}>{inv.invoice_number}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Shenime</label>
                    <input
                      type="text"
                      value={form.notes}
                      onChange={(e) => setForm({ ...form, notes: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent text-sm"
                      placeholder="Shenime shtese"
                    />
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-sm font-semibold text-gray-700">Artikujt</h3>
                    <button
                      onClick={addItem}
                      className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-emerald-700 bg-emerald-50 rounded-lg hover:bg-emerald-100 transition-colors"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      Shto Artikull
                    </button>
                  </div>
                  <div className="space-y-3">
                    {items.map((item, index) => (
                      <div key={index} className="bg-gray-50 rounded-xl p-4">
                        <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-start">
                          <div className="sm:col-span-4">
                            <label className="block text-xs font-medium text-gray-500 mb-1">Produkti</label>
                            <select
                              value={item.product_id}
                              onChange={(e) => handleProductChange(index, e.target.value)}
                              className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent text-sm bg-white"
                            >
                              <option value="">{t('common.selectProductInline')}</option>
                              {products.map((p) => (
                                <option key={p.id} value={p.id}>{p.name}</option>
                              ))}
                            </select>
                            {item.image_url && (
                              <div className="mt-2 flex items-center gap-2">
                                <img src={item.image_url} alt="" className="w-8 h-8 rounded object-cover" />
                              </div>
                            )}
                          </div>
                          <div className="sm:col-span-3">
                            <label className="block text-xs font-medium text-gray-500 mb-1">Pershkrimi</label>
                            <input
                              type="text"
                              value={item.description}
                              onChange={(e) => updateItem(index, 'description', e.target.value)}
                              className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent text-sm"
                              placeholder="Pershkrimi"
                            />
                          </div>
                          <div className="sm:col-span-2">
                            <label className="block text-xs font-medium text-gray-500 mb-1">Sasia</label>
                            <input
                              type="number"
                              value={item.quantity}
                              onChange={(e) => updateItem(index, 'quantity', parseFloat(e.target.value) || 0)}
                              min="0"
                              step="0.01"
                              className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent text-sm"
                            />
                          </div>
                          <div className="sm:col-span-2">
                            <label className="block text-xs font-medium text-gray-500 mb-1">Njesia</label>
                            <select
                              value={item.unit}
                              onChange={(e) => updateItem(index, 'unit', e.target.value)}
                              className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent text-sm bg-white"
                            >
                              {UNITS.map((u) => (
                                <option key={u.value} value={u.value}>{u.label}</option>
                              ))}
                            </select>
                          </div>
                          <div className="sm:col-span-1 flex items-end">
                            <button
                              onClick={() => removeItem(index)}
                              disabled={items.length <= 1}
                              className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-30 disabled:cursor-not-allowed mt-5"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <div className="sticky bottom-0 bg-white border-t border-gray-100 px-4 sm:px-6 py-3 sm:py-4 rounded-b-2xl flex items-center justify-end gap-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
                <button
                  onClick={() => setShowModal(false)}
                  className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
                >
                  Anulo
                </button>
                <button
                  onClick={handleSave}
                  disabled={saving || !form.contact_id}
                  className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 transition-colors disabled:opacity-50"
                >
                  {saving && <Loader2 className="w-4 h-4 animate-spin" />}
                  {editingNote ? 'Ruaj Ndryshimet' : 'Krijo Fletedaljen'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
