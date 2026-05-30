import { useState, useEffect, useMemo } from 'react';
import { Plus, CreditCard as Edit2, X, AlertTriangle, Loader2, Search, Users, ToggleLeft, ToggleRight, Mail, Phone, MapPin, Globe, CreditCard, Calendar, Tag } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { PageSkeleton } from '../../components/ui/Skeleton';
import EmptyState from '../../components/ui/EmptyState';
import { useTranslation } from '../../i18n';
import type { AccContact, AccContactType } from '../../types/accounting';
import ClientPricesModal from '../../components/accounting/ClientPricesModal';

interface ContactForm {
  name: string;
  contact_type: AccContactType;
  address: string;
  city: string;
  postal_code: string;
  country: string;
  vat_number: string;
  tax_number: string;
  email: string;
  phone: string;
  website: string;
  iban: string;
  bic: string;
  bank_name: string;
  payment_days: number;
  notes: string;
}

const emptyForm: ContactForm = {
  name: '',
  contact_type: 'customer',
  address: '',
  city: '',
  postal_code: '',
  country: '',
  vat_number: '',
  tax_number: '',
  email: '',
  phone: '',
  website: '',
  iban: '',
  bic: '',
  bank_name: '',
  payment_days: 30,
  notes: '',
};

type FilterType = 'all' | AccContactType;

function typeBadge(type: AccContactType) {
  const map: Record<AccContactType, { bg: string; label: string }> = {
    customer: { bg: 'bg-emerald-100 text-emerald-700', label: 'Klient' },
    supplier: { bg: 'bg-blue-100 text-blue-700', label: 'Furnitor' },
    both: { bg: 'bg-amber-100 text-amber-700', label: 'Të dyja' },
  };
  const badge = map[type];
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${badge.bg}`}>
      {badge.label}
    </span>
  );
}

export default function Contacts() {
  const { profile } = useAuth();
  const { t } = useTranslation();
  const [contacts, setContacts] = useState<AccContact[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<ContactForm>(emptyForm);
  const [saving, setSaving] = useState(false);

  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState<FilterType>('all');
  const [showActive, setShowActive] = useState(true);
  const [pricesContactId, setPricesContactId] = useState<string | null>(null);
  const [pricesContactName, setPricesContactName] = useState('');

  useEffect(() => {
    if (profile?.company_id) fetchContacts();
  }, [profile?.company_id]);

  const filteredContacts = useMemo(() => {
    return contacts.filter((c) => {
      if (c.is_active !== showActive) return false;
      if (filterType !== 'all' && c.contact_type !== filterType) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const haystack = `${c.name} ${c.email} ${c.phone} ${c.city} ${c.country} ${c.vat_number}`.toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
  }, [contacts, searchQuery, filterType, showActive]);

  async function fetchContacts() {
    try {
      setLoading(true);
      setError(null);
      const { data, error: err } = await supabase
        .from('acc_contacts')
        .select('*')
        .eq('company_id', profile!.company_id!)
        .order('name', { ascending: true });

      if (err) throw err;
      setContacts(data ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.errorLoading'));
    } finally {
      setLoading(false);
    }
  }

  async function handleSave() {
    if (!form.name.trim()) return;
    try {
      setSaving(true);
      setError(null);

      if (editingId) {
        const { error: err } = await supabase
          .from('acc_contacts')
          .update({
            name: form.name,
            contact_type: form.contact_type,
            address: form.address,
            city: form.city,
            postal_code: form.postal_code,
            country: form.country,
            vat_number: form.vat_number,
            tax_number: form.tax_number,
            email: form.email,
            phone: form.phone,
            website: form.website,
            iban: form.iban,
            bic: form.bic,
            bank_name: form.bank_name,
            payment_days: form.payment_days,
            notes: form.notes,
          })
          .eq('id', editingId);
        if (err) throw err;
      } else {
        const { error: err } = await supabase.from('acc_contacts').insert({
          company_id: profile!.company_id!,
          name: form.name,
          contact_type: form.contact_type,
          address: form.address,
          city: form.city,
          postal_code: form.postal_code,
          country: form.country,
          vat_number: form.vat_number,
          tax_number: form.tax_number,
          email: form.email,
          phone: form.phone,
          website: form.website,
          iban: form.iban,
          bic: form.bic,
          bank_name: form.bank_name,
          payment_days: form.payment_days,
          notes: form.notes,
        });
        if (err) throw err;
      }

      setShowModal(false);
      setEditingId(null);
      setForm(emptyForm);
      await fetchContacts();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.errorSaving'));
    } finally {
      setSaving(false);
    }
  }

  async function handleToggleActive(contact: AccContact) {
    try {
      setError(null);
      const { error: err } = await supabase
        .from('acc_contacts')
        .update({ is_active: !contact.is_active })
        .eq('id', contact.id);
      if (err) throw err;
      await fetchContacts();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.error'));
    }
  }

  function openEdit(contact: AccContact) {
    setEditingId(contact.id);
    setForm({
      name: contact.name,
      contact_type: contact.contact_type,
      address: contact.address,
      city: contact.city,
      postal_code: contact.postal_code,
      country: contact.country,
      vat_number: contact.vat_number,
      tax_number: contact.tax_number,
      email: contact.email,
      phone: contact.phone,
      website: contact.website,
      iban: contact.iban,
      bic: contact.bic,
      bank_name: contact.bank_name,
      payment_days: contact.payment_days,
      notes: contact.notes,
    });
    setShowModal(true);
  }

  function openAdd() {
    setEditingId(null);
    setForm(emptyForm);
    setShowModal(true);
  }

  function updateForm(field: keyof ContactForm, value: string | number) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  if (loading) {
    return <PageSkeleton showStats={false} rows={10} cols={5} />;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Kontaktet</h1>
          <p className="text-gray-500 mt-1">Menaxhoni klientet, furnitoret dhe kontaktet e biznesit</p>
        </div>
        <button
          onClick={openAdd}
          className="inline-flex items-center gap-2 px-4 py-2.5 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors font-medium"
        >
          <Plus className="w-4 h-4" />
          Shto Kontakt
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

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={t('common.kerkoKontakte')}
              className="w-full pl-10 pr-4 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent text-sm"
            />
          </div>
          <select
            value={filterType}
            onChange={(e) => setFilterType(e.target.value as FilterType)}
            className="px-4 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent text-sm bg-white"
          >
            <option value="all">{t('common.teGjitheLlojet')}</option>
            <option value="customer">{t('common.klient')}</option>
            <option value="supplier">Furnitor</option>
            <option value="both">{t('common.teDyja')}</option>
          </select>
          <button
            onClick={() => setShowActive(!showActive)}
            className={`inline-flex items-center gap-2 px-4 py-2.5 rounded-lg border text-sm font-medium transition-colors ${
              showActive
                ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                : 'border-gray-200 bg-gray-50 text-gray-600'
            }`}
          >
            {showActive ? <ToggleRight className="w-4 h-4" /> : <ToggleLeft className="w-4 h-4" />}
            {showActive ? 'Aktiv' : 'Joaktiv'}
          </button>
        </div>
      </div>

      {filteredContacts.length === 0 ? (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100">
          <EmptyState
            icon={Users}
            title={t('accounting.contacts.noContacts') || 'Nuk u gjet asnjë kontakt'}
            hint={t('accounting.contacts.noContactsHint') || 'Shtoni kontaktin e parë për të filluar'}
            action={{
              label: t('accounting.contacts.addContact') || 'Shto kontakt',
              onClick: openAdd,
              icon: Plus,
            }}
          />
        </div>
      ) : (
        <>
          <div className="hidden lg:block bg-white rounded-xl shadow-sm border border-gray-100">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-100">
                    <th className="text-left px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">{t('common.name')}</th>
                    <th className="text-left px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">{t('common.type')}</th>
                    <th className="text-left px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">{t('common.email')}</th>
                    <th className="text-left px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Telefon</th>
                    <th className="text-left px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Qyteti</th>
                    <th className="text-left px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Shteti</th>
                    <th className="text-left px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">{t('common.ditePagese')}</th>
                    <th className="text-right px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Veprime</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {filteredContacts.map((contact) => (
                    <tr key={contact.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-lg bg-emerald-100 flex items-center justify-center">
                            <Users className="w-4 h-4 text-emerald-600" />
                          </div>
                          <span className="text-sm font-medium text-gray-900">{contact.name}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4">{typeBadge(contact.contact_type)}</td>
                      <td className="px-6 py-4 text-sm text-gray-600">{contact.email || '-'}</td>
                      <td className="px-6 py-4 text-sm text-gray-600">{contact.phone || '-'}</td>
                      <td className="px-6 py-4 text-sm text-gray-600">{contact.city || '-'}</td>
                      <td className="px-6 py-4 text-sm text-gray-600">{contact.country || '-'}</td>
                      <td className="px-6 py-4 text-sm text-gray-600">{contact.payment_days}</td>
                      <td className="px-6 py-4">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={() => openEdit(contact)}
                            className="p-2 text-gray-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors"
                          >
                            <Edit2 className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleToggleActive(contact)}
                            className={`p-2 rounded-lg transition-colors ${
                              contact.is_active
                                ? 'text-emerald-500 hover:text-red-600 hover:bg-red-50'
                                : 'text-gray-400 hover:text-emerald-600 hover:bg-emerald-50'
                            }`}
                          >
                            {contact.is_active ? (
                              <ToggleRight className="w-4 h-4" />
                            ) : (
                              <ToggleLeft className="w-4 h-4" />
                            )}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="lg:hidden space-y-3">
            {filteredContacts.map((contact) => (
              <div key={contact.id} className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-emerald-100 flex items-center justify-center">
                      <Users className="w-5 h-5 text-emerald-600" />
                    </div>
                    <div>
                      <h3 className="text-sm font-semibold text-gray-900">{contact.name}</h3>
                      <div className="mt-1">{typeBadge(contact.contact_type)}</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => { setPricesContactId(contact.id); setPricesContactName(contact.name); }}
                      title={t('common.cmimeTePersonalizuara')}
                      className="p-2 text-gray-400 hover:text-amber-600 hover:bg-amber-50 rounded-lg transition-colors"
                    >
                      <Tag className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => openEdit(contact)}
                      className="p-2 text-gray-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors"
                    >
                      <Edit2 className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => handleToggleActive(contact)}
                      className={`p-2 rounded-lg transition-colors ${
                        contact.is_active
                          ? 'text-emerald-500 hover:text-red-600 hover:bg-red-50'
                          : 'text-gray-400 hover:text-emerald-600 hover:bg-emerald-50'
                      }`}
                    >
                      {contact.is_active ? (
                        <ToggleRight className="w-4 h-4" />
                      ) : (
                        <ToggleLeft className="w-4 h-4" />
                      )}
                    </button>
                  </div>
                </div>
                <div className="space-y-1.5 text-sm text-gray-600">
                  {contact.email && (
                    <div className="flex items-center gap-2">
                      <Mail className="w-3.5 h-3.5 text-gray-400" />
                      <span>{contact.email}</span>
                    </div>
                  )}
                  {contact.phone && (
                    <div className="flex items-center gap-2">
                      <Phone className="w-3.5 h-3.5 text-gray-400" />
                      <span>{contact.phone}</span>
                    </div>
                  )}
                  {(contact.city || contact.country) && (
                    <div className="flex items-center gap-2">
                      <MapPin className="w-3.5 h-3.5 text-gray-400" />
                      <span>{[contact.city, contact.country].filter(Boolean).join(', ')}</span>
                    </div>
                  )}
                  <div className="flex items-center gap-2">
                    <Calendar className="w-3.5 h-3.5 text-gray-400" />
                    <span>{contact.payment_days} ditë pagese</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-black/50" onClick={() => setShowModal(false)} />
          <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between p-6 border-b border-gray-100">
              <h2 className="text-lg font-semibold text-gray-900">
                {editingId ? 'Ndrysho Kontaktin' : 'Shto Kontakt'}
              </h2>
              <button
                onClick={() => setShowModal(false)}
                className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-5 overflow-y-auto flex-1">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="sm:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">Emri *</label>
                  <input
                    type="text"
                    value={form.name}
                    onChange={(e) => updateForm('name', e.target.value)}
                    className="w-full px-3 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent text-sm"
                    placeholder="Emri i kontaktit"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">{t('common.contactType')}</label>
                  <select
                    value={form.contact_type}
                    onChange={(e) => updateForm('contact_type', e.target.value)}
                    className="w-full px-3 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent text-sm bg-white"
                  >
                    <option value="customer">{t('common.klient')}</option>
                    <option value="supplier">Furnitor</option>
                    <option value="both">{t('common.teDyja')}</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">{t('common.ditePagese')}</label>
                  <input
                    type="number"
                    min={0}
                    value={form.payment_days}
                    onChange={(e) => updateForm('payment_days', parseInt(e.target.value) || 0)}
                    className="w-full px-3 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent text-sm"
                  />
                </div>
              </div>

              <div className="border-t border-gray-100 pt-4">
                <h3 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
                  <MapPin className="w-4 h-4" />{t('common.address')}</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="sm:col-span-2">
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">{t('common.address')}</label>
                    <input
                      type="text"
                      value={form.address}
                      onChange={(e) => updateForm('address', e.target.value)}
                      className="w-full px-3 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent text-sm"
                      placeholder="Rruga, numri"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">Qyteti</label>
                    <input
                      type="text"
                      value={form.city}
                      onChange={(e) => updateForm('city', e.target.value)}
                      className="w-full px-3 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent text-sm"
                      placeholder="Qyteti"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">Kodi postar</label>
                    <input
                      type="text"
                      value={form.postal_code}
                      onChange={(e) => updateForm('postal_code', e.target.value)}
                      className="w-full px-3 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent text-sm"
                      placeholder="Kodi postar"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">Shteti</label>
                    <input
                      type="text"
                      value={form.country}
                      onChange={(e) => updateForm('country', e.target.value)}
                      className="w-full px-3 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent text-sm"
                      placeholder="Shteti"
                    />
                  </div>
                </div>
              </div>

              <div className="border-t border-gray-100 pt-4">
                <h3 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
                  <Globe className="w-4 h-4" />
                  Kontakti
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">{t('common.email')}</label>
                    <input
                      type="email"
                      value={form.email}
                      onChange={(e) => updateForm('email', e.target.value)}
                      className="w-full px-3 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent text-sm"
                      placeholder="email@shembull.com"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">Telefon</label>
                    <input
                      type="tel"
                      value={form.phone}
                      onChange={(e) => updateForm('phone', e.target.value)}
                      className="w-full px-3 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent text-sm"
                      placeholder="+383 ..."
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">Website</label>
                    <input
                      type="url"
                      value={form.website}
                      onChange={(e) => updateForm('website', e.target.value)}
                      className="w-full px-3 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent text-sm"
                      placeholder="https://..."
                    />
                  </div>
                </div>
              </div>

              <div className="border-t border-gray-100 pt-4">
                <h3 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
                  <CreditCard className="w-4 h-4" />{t('common.teDhenaTatimoreDheBankare')}</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">Nr. TVSH</label>
                    <input
                      type="text"
                      value={form.vat_number}
                      onChange={(e) => updateForm('vat_number', e.target.value)}
                      className="w-full px-3 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent text-sm"
                      placeholder="Nr. TVSH"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">Nr. tatimor</label>
                    <input
                      type="text"
                      value={form.tax_number}
                      onChange={(e) => updateForm('tax_number', e.target.value)}
                      className="w-full px-3 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent text-sm"
                      placeholder="Nr. tatimor"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">IBAN</label>
                    <input
                      type="text"
                      value={form.iban}
                      onChange={(e) => updateForm('iban', e.target.value)}
                      className="w-full px-3 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent text-sm"
                      placeholder="IBAN"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">BIC</label>
                    <input
                      type="text"
                      value={form.bic}
                      onChange={(e) => updateForm('bic', e.target.value)}
                      className="w-full px-3 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent text-sm"
                      placeholder="BIC / SWIFT"
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">{t('common.emriIBankes')}</label>
                    <input
                      type="text"
                      value={form.bank_name}
                      onChange={(e) => updateForm('bank_name', e.target.value)}
                      className="w-full px-3 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent text-sm"
                      placeholder={t('common.emriIBankes')}
                    />
                  </div>
                </div>
              </div>

              <div className="border-t border-gray-100 pt-4">
                <label className="block text-sm font-medium text-gray-700 mb-1.5">{t('common.shenime')}</label>
                <textarea
                  value={form.notes}
                  onChange={(e) => updateForm('notes', e.target.value)}
                  rows={3}
                  className="w-full px-3 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent text-sm resize-none"
                  placeholder={t('common.shenimeShtese')}
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 p-6 border-t border-gray-100">
              <button
                onClick={() => setShowModal(false)}
                className="px-4 py-2.5 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
              >{t('common.cancel')}</button>
              <button
                onClick={handleSave}
                disabled={saving || !form.name.trim()}
                className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {saving && <Loader2 className="w-4 h-4 animate-spin" />}
                {editingId ? 'Ruaj Ndryshimet' : 'Shto Kontakt'}
              </button>
            </div>
          </div>
        </div>
      )}

      {pricesContactId && profile?.company_id && (
        <ClientPricesModal
          contactId={pricesContactId}
          contactName={pricesContactName}
          companyId={profile.company_id}
          onClose={() => setPricesContactId(null)}
        />
      )}
    </div>
  );
}
