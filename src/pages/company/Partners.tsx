import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Building2,
  Plus,
  Search,
  X,
  Loader2,
  Mail,
  Phone,
  MapPin,
  Hash,
  Save,
  Pencil,
  Trash2,
  UserPlus,
  FileText,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { useTranslation } from '../../i18n';

export type PartnerType = 'customer' | 'supplier' | 'both';

export interface Partner {
  id: string;
  contact_number?: string | null;
  name: string;
  contact_type: PartnerType;
  address: string | null;
  city: string | null;
  postal_code: string | null;
  country: string | null;
  vat_number: string | null;
  email: string | null;
  phone: string | null;
  website: string | null;
  notes: string | null;
  is_active: boolean;
}

interface PartnerForm {
  name: string;
  contact_type: PartnerType;
  address: string;
  city: string;
  postal_code: string;
  country: string;
  vat_number: string;
  email: string;
  phone: string;
  website: string;
  notes: string;
}

const emptyForm: PartnerForm = {
  name: '',
  contact_type: 'customer',
  address: '',
  city: '',
  postal_code: '',
  country: '',
  vat_number: '',
  email: '',
  phone: '',
  website: '',
  notes: '',
};

const typeLabel: Record<PartnerType, string> = {
  customer: 'Klient',
  supplier: 'Furnitor',
  both: 'Te dyja',
};

const typeBadgeCls: Record<PartnerType, string> = {
  customer: 'bg-emerald-100 text-emerald-700',
  supplier: 'bg-blue-100 text-blue-700',
  both: 'bg-amber-100 text-amber-700',
};

export default function CompanyPartners() {
  const { profile } = useAuth();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [partners, setPartners] = useState<Partner[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [filterType, setFilterType] = useState<'' | PartnerType>('');
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<PartnerForm>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    if (profile?.company_id) fetchPartners();
  }, [profile?.company_id]);

  async function fetchPartners() {
    if (!profile?.company_id) return;
    try {
      setLoading(true);
      setError(null);
      const { data, error: qErr } = await supabase
        .from('acc_contacts')
        .select('id, contact_number, name, contact_type, address, city, postal_code, country, vat_number, email, phone, website, notes, is_active')
        .eq('company_id', profile.company_id)
        .eq('is_active', true)
        .order('name');
      if (qErr) throw qErr;
      setPartners((data ?? []) as Partner[]);
    } catch (e) {
      setError((e as Error)?.message ?? t('companyAdmin.partners.errUploadFailed'));
    } finally {
      setLoading(false);
    }
  }

  function openCreate() {
    setEditingId(null);
    setForm(emptyForm);
    setShowForm(true);
  }

  function openEdit(p: Partner) {
    setEditingId(p.id);
    setForm({
      name: p.name,
      contact_type: p.contact_type,
      address: p.address ?? '',
      city: p.city ?? '',
      postal_code: p.postal_code ?? '',
      country: p.country ?? '',
      vat_number: p.vat_number ?? '',
      email: p.email ?? '',
      phone: p.phone ?? '',
      website: p.website ?? '',
      notes: p.notes ?? '',
    });
    setShowForm(true);
  }

  async function save() {
    if (!profile?.company_id) return;
    if (!form.name.trim()) {
      setError(t('companyAdmin.partners.errCompanyNameRequired'));
      return;
    }
    try {
      setSaving(true);
      setError(null);
      const payload = {
        company_id: profile.company_id,
        name: form.name.trim(),
        contact_type: form.contact_type,
        address: form.address.trim() || null,
        city: form.city.trim() || null,
        postal_code: form.postal_code.trim() || null,
        country: form.country.trim() || null,
        vat_number: form.vat_number.trim() || null,
        email: form.email.trim() || null,
        phone: form.phone.trim() || null,
        website: form.website.trim() || null,
        notes: form.notes.trim() || null,
        is_active: true,
      };
      if (editingId) {
        const { error: uErr } = await supabase.from('acc_contacts').update(payload).eq('id', editingId);
        if (uErr) throw uErr;
      } else {
        const { error: iErr } = await supabase.from('acc_contacts').insert(payload);
        if (iErr) throw iErr;
      }
      setShowForm(false);
      setForm(emptyForm);
      setEditingId(null);
      await fetchPartners();
    } catch (e) {
      setError((e as Error)?.message ?? t('companyAdmin.partners.errSaveFailed'));
    } finally {
      setSaving(false);
    }
  }

  async function deletePartner(p: Partner) {
    if (!profile?.company_id) return;
    const ok = window.confirm(t('companyAdmin.partners.deleteConfirm').replace('{name}', p.name));
    if (!ok) return;
    try {
      setDeletingId(p.id);
      setError(null);
      const { error: dErr } = await supabase
        .from('acc_contacts')
        .update({ is_active: false })
        .eq('id', p.id)
        .eq('company_id', profile.company_id);
      if (dErr) throw dErr;
      setPartners((prev) => prev.filter((x) => x.id !== p.id));
    } catch (e) {
      setError((e as Error)?.message ?? 'Nuk u arrit te fshihet partneri.');
    } finally {
      setDeletingId(null);
    }
  }

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return partners.filter((p) => {
      if (filterType && p.contact_type !== filterType) return false;
      if (!q) return true;
      return (
        p.name.toLowerCase().includes(q) ||
        (p.contact_number ?? '').toLowerCase().includes(q) ||
        (p.email ?? '').toLowerCase().includes(q) ||
        (p.phone ?? '').toLowerCase().includes(q) ||
        (p.city ?? '').toLowerCase().includes(q) ||
        (p.vat_number ?? '').toLowerCase().includes(q)
      );
    });
  }, [partners, search, filterType]);

  return (
    <div className="p-4 sm:p-6 space-y-5">
      <header className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Building2 className="w-6 h-6 text-teal-600" />{t('common.kompanitePartnere')}</h1>
          <p className="text-sm text-gray-500 mt-0.5">{t('common.klientetDheFurnitoretERegjistruarQe')}</p>
        </div>
        <button
          onClick={openCreate}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-teal-600 text-white text-sm font-semibold hover:bg-teal-700 shadow-sm"
        >
          <Plus className="w-4 h-4" />{t('common.regjistroKompaniTeRe')}</button>
      </header>

      <div className="flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t('companyAdmin.partners.searchPlaceholder')}
            className="w-full pl-9 pr-3 py-2.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500"
          />
        </div>
        <select
          value={filterType}
          onChange={(e) => setFilterType(e.target.value as '' | PartnerType)}
          className="px-3 py-2.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500"
        >
          <option value="">{t('common.all')}</option>
          <option value="customer">{t('common.klient')}</option>
          <option value="supplier">Furnitor</option>
          <option value="both">Te dyja</option>
        </select>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-red-700 text-sm">{error}</div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-16 text-gray-500">
          <Loader2 className="w-6 h-6 animate-spin" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-xl border border-dashed border-gray-200 bg-white p-10 text-center">
          <Building2 className="w-10 h-10 mx-auto text-gray-300" />
          <p className="mt-3 text-gray-700 font-medium">{t('common.asnjeKompaniERegjistruar')}</p>
          <p className="text-sm text-gray-500">{t('common.klikoniRegjistroKompaniTeRePer')}</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          {filtered.map((p) => (
            <article
              key={p.id}
              onClick={() => navigate(`/company/partners/${p.id}`)}
              className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm hover:shadow-md hover:border-teal-300 transition-all cursor-pointer"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="font-semibold text-gray-900 truncate">{p.name}</h3>
                  <div className="mt-1 flex items-center gap-1.5 flex-wrap">
                    {p.contact_number && (
                      <span className="inline-flex px-1.5 py-0.5 rounded text-[10px] font-mono font-semibold text-teal-700 bg-teal-50 border border-teal-100">
                        {p.contact_number}
                      </span>
                    )}
                    <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-semibold ${typeBadgeCls[p.contact_type]}`}>
                      {typeLabel[p.contact_type]}
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-1.5 flex-shrink-0" onClick={(e) => e.stopPropagation()}>
                  <Link
                    to={`/company/partners/${p.id}`}
                    className="p-1.5 rounded-md border border-gray-200 text-gray-600 hover:bg-teal-50 hover:text-teal-700 hover:border-teal-200 transition-colors"
                    title="Kartela"
                  >
                    <FileText className="w-4 h-4" />
                  </Link>
                  <button
                    onClick={() => openEdit(p)}
                    className="p-1.5 rounded-md border border-gray-200 text-gray-600 hover:bg-gray-50 hover:text-teal-700 hover:border-teal-200 transition-colors"
                    title="Modifiko"
                  >
                    <Pencil className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => deletePartner(p)}
                    disabled={deletingId === p.id}
                    className="p-1.5 rounded-md border border-gray-200 text-gray-500 hover:bg-red-50 hover:text-red-600 hover:border-red-200 transition-colors disabled:opacity-50"
                    title={t('common.delete')}
                  >
                    {deletingId === p.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                  </button>
                </div>
              </div>
              <dl className="mt-3 space-y-1.5 text-xs text-gray-600">
                {p.vat_number && (
                  <div className="flex items-center gap-1.5">
                    <Hash className="w-3.5 h-3.5 text-gray-400" />
                    <span>VAT: {p.vat_number}</span>
                  </div>
                )}
                {p.email && (
                  <div className="flex items-center gap-1.5 truncate">
                    <Mail className="w-3.5 h-3.5 text-gray-400" />
                    <span className="truncate">{p.email}</span>
                  </div>
                )}
                {p.phone && (
                  <div className="flex items-center gap-1.5">
                    <Phone className="w-3.5 h-3.5 text-gray-400" />
                    <span>{p.phone}</span>
                  </div>
                )}
                {(p.city || p.country) && (
                  <div className="flex items-center gap-1.5 truncate">
                    <MapPin className="w-3.5 h-3.5 text-gray-400" />
                    <span className="truncate">{[p.address, p.city, p.country].filter(Boolean).join(', ')}</span>
                  </div>
                )}
              </dl>
            </article>
          ))}
        </div>
      )}

      {showForm && (
        <PartnerFormModal
          form={form}
          setForm={setForm}
          onClose={() => { setShowForm(false); setEditingId(null); setForm(emptyForm); }}
          onSave={save}
          saving={saving}
          editing={!!editingId}
        />
      )}
    </div>
  );
}

interface ModalProps {
  form: PartnerForm;
  setForm: (f: PartnerForm) => void;
  onClose: () => void;
  onSave: () => void;
  saving: boolean;
  editing: boolean;
}

type VatResult =
  | { valid: true; name?: string; address?: string; source: 'format' | 'vies' }
  | { valid: false; reason: string }
  | null;

export function PartnerFormModal({ form, setForm, onClose, onSave, saving, editing }: ModalProps) {
  const { t } = useTranslation();
  const [vatChecking, setVatChecking] = useState(false);
  const [vatResult, setVatResult] = useState<VatResult>(null);

  async function checkVat() {
    const v = form.vat_number.trim();
    if (v.length < 4) {
      setVatResult({ valid: false, reason: 'too_short' });
      return;
    }
    setVatChecking(true);
    setVatResult(null);
    try {
      const { data, error: fnErr } = await supabase.functions.invoke('validate-vat-number', {
        body: { vat: v },
      });
      if (fnErr) throw fnErr;
      if (data?.valid) {
        setVatResult({ valid: true, name: data.name, address: data.address, source: data.source ?? 'vies' });
      } else {
        setVatResult({ valid: false, reason: data?.reason ?? 'invalid' });
      }
    } catch {
      setVatResult({ valid: false, reason: 'network' });
    } finally {
      setVatChecking(false);
    }
  }

  function applyVatLookup() {
    if (vatResult && vatResult.valid) {
      setForm({
        ...form,
        name: !form.name.trim() && vatResult.name ? vatResult.name : form.name,
        address: !form.address.trim() && vatResult.address ? vatResult.address : form.address,
      });
    }
  }

  return (
    <div className="fixed inset-0 z-modal bg-black/50 flex items-end sm:items-center justify-center p-0 sm:p-4 modal-safe-top">
      <div className="w-full sm:max-w-2xl bg-white sm:rounded-2xl rounded-t-2xl shadow-xl modal-panel flex flex-col">
        <div className="flex items-start justify-between p-5 border-b border-gray-100 bg-white sm:rounded-t-2xl flex-shrink-0 sticky top-0 z-10">
          <div className="min-w-0">
            <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
              <UserPlus className="w-5 h-5 text-teal-600 flex-shrink-0" />
              <span className="truncate">{editing ? t('common.editCompany') : t('common.regjistroKompaniTeRe')}</span>
            </h2>
            <p className="text-sm text-gray-500 mt-0.5">{t('common.informacioniDoPerdoretNeFletedergesaFletmarrje')}</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 flex-shrink-0 ml-2" aria-label={t('companyAdmin.partners.closeLabel')}>
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 space-y-4 modal-body-scroll flex-1">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="Emri i Kompanise *">
              <input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="input"
                placeholder={t('companyAdmin.partners.namePlaceholder')}
              />
            </Field>
            <Field label="Tipi *">
              <select
                value={form.contact_type}
                onChange={(e) => setForm({ ...form, contact_type: e.target.value as PartnerType })}
                className="input"
              >
                <option value="customer">{t('common.klient')}</option>
                <option value="supplier">Furnitor</option>
                <option value="both">Te dyja</option>
              </select>
            </Field>
            <Field label="Numri TVSH / VAT">
              <div className="flex gap-2">
                <input
                  value={form.vat_number}
                  onChange={(e) => { setForm({ ...form, vat_number: e.target.value }); setVatResult(null); }}
                  className="input flex-1"
                  placeholder={t('companyAdmin.partners.vatPlaceholder')}
                />
                <button
                  type="button"
                  onClick={checkVat}
                  disabled={vatChecking || !form.vat_number.trim()}
                  className="px-3 py-2 rounded-lg text-sm font-medium bg-teal-600 text-white hover:bg-teal-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors whitespace-nowrap"
                >
                  {vatChecking ? '...' : 'Verifiko'}
                </button>
              </div>
              {vatResult && vatResult.valid && (
                <div className="mt-2 text-xs rounded-lg border border-emerald-200 bg-emerald-50 text-emerald-800 p-2 space-y-1">
                  <div className="font-medium">
                    {vatResult.source === 'vies' ? '✓ VIES e konfirmoi' : '✓ Format i vlefshem'}
                  </div>
                  {vatResult.name && <div>Emri: {vatResult.name}</div>}
                  {vatResult.address && <div>Adresa: {vatResult.address}</div>}
                  {(vatResult.name || vatResult.address) && (
                    <button
                      type="button"
                      onClick={applyVatLookup}
                      className="text-emerald-700 hover:text-emerald-900 underline text-xs"
                    >
                      Mbushe formen me keto vlera
                    </button>
                  )}
                </div>
              )}
              {vatResult && !vatResult.valid && (
                <div className="mt-2 text-xs rounded-lg border border-amber-200 bg-amber-50 text-amber-800 p-2">
                  {vatResult.reason === 'too_short' && 'Numri eshte shume i shkurter.'}
                  {vatResult.reason === 'invalid_format' && 'Format i pavlefshem per shtetin e zgjedhur.'}
                  {vatResult.reason === 'unknown_country' && 'Shtet i panjohur. Kontrollo prefiksin.'}
                  {vatResult.reason === 'invalid' && 'VIES nuk e konfirmoi kete numer VAT.'}
                  {vatResult.reason === 'network' && 'Nuk u arrit te verifikohej (rrjeti).'}
                </div>
              )}
            </Field>
            <Field label="Email">
              <input
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                className="input"
                placeholder={t('common.emailExampleAlias')}
              />
            </Field>
            <Field label="Telefon">
              <input
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
                className="input"
              />
            </Field>
            <Field label="Website">
              <input
                value={form.website}
                onChange={(e) => setForm({ ...form, website: e.target.value })}
                className="input"
                placeholder="https://"
              />
            </Field>
            <Field label="Adresa" className="sm:col-span-2">
              <input
                value={form.address}
                onChange={(e) => setForm({ ...form, address: e.target.value })}
                className="input"
              />
            </Field>
            <Field label="Qyteti">
              <input
                value={form.city}
                onChange={(e) => setForm({ ...form, city: e.target.value })}
                className="input"
              />
            </Field>
            <Field label="Kodi Postar">
              <input
                value={form.postal_code}
                onChange={(e) => setForm({ ...form, postal_code: e.target.value })}
                className="input"
              />
            </Field>
            <Field label="Shteti" className="sm:col-span-2">
              <input
                value={form.country}
                onChange={(e) => setForm({ ...form, country: e.target.value })}
                className="input"
              />
            </Field>
            <Field label="Shenime" className="sm:col-span-2">
              <textarea
                rows={3}
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                className="input"
              />
            </Field>
          </div>
        </div>

        <div className="modal-footer border-t border-gray-100 flex justify-end gap-2 px-4 pt-3 flex-shrink-0">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg border border-gray-200 text-sm text-gray-700 hover:bg-gray-50"
          >
            {t('companyAdmin.partners.closeLabel')}
          </button>
          <button
            onClick={onSave}
            disabled={saving}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-teal-600 text-white text-sm font-semibold hover:bg-teal-700 disabled:opacity-60"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            {editing ? t('common.saveChanges') : t('common.register')}
          </button>
        </div>
      </div>

      <style>{`.input{width:100%;padding:.55rem .75rem;border:1px solid #e5e7eb;border-radius:.5rem;font-size:.875rem;outline:none}
        .input:focus{border-color:transparent;box-shadow:0 0 0 2px #14b8a6}`}</style>
    </div>
  );
}

function Field({ label, children, className = '' }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <label className={`block ${className}`}>
      <span className="text-sm font-medium text-gray-700">{label}</span>
      <div className="mt-1">{children}</div>
    </label>
  );
}
