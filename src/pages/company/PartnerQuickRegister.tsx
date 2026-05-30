import { useState } from 'react';
import { Loader2, Save, UserPlus, X } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useTranslation } from '../../i18n';

export interface QuickPartner {
  id: string;
  name: string;
  address: string | null;
  city: string | null;
  postal_code: string | null;
  country: string | null;
  contact_type: 'customer' | 'supplier' | 'both';
}

interface Props {
  companyId: string;
  defaultType?: 'customer' | 'supplier' | 'both';
  initialName?: string;
  onClose: () => void;
  onCreated: (partner: QuickPartner) => void;
}

export default function PartnerQuickRegister({ companyId, defaultType = 'customer', initialName = '', onClose, onCreated }: Props) {
  const { t } = useTranslation();
  const [name, setName] = useState(initialName);
  const [contactType, setContactType] = useState<'customer' | 'supplier' | 'both'>(defaultType);
  const [vat, setVat] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [city, setCity] = useState('');
  const [postalCode, setPostalCode] = useState('');
  const [country, setCountry] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    if (!name.trim()) {
      setError(t('companyAdmin.partnerQuickRegister.errCompanyNameRequired'));
      return;
    }
    try {
      setSaving(true);
      setError(null);
      const { data, error: iErr } = await supabase
        .from('acc_contacts')
        .insert({
          company_id: companyId,
          name: name.trim(),
          contact_type: contactType,
          vat_number: vat.trim() || null,
          email: email.trim() || null,
          phone: phone.trim() || null,
          address: address.trim() || null,
          city: city.trim() || null,
          postal_code: postalCode.trim() || null,
          country: country.trim() || null,
          is_active: true,
        })
        .select('id, name, address, city, postal_code, country, contact_type')
        .single();
      if (iErr) throw iErr;
      onCreated(data as QuickPartner);
      onClose();
    } catch (e: any) {
      setError(e?.message ?? t('companyAdmin.partnerQuickRegister.errRegistrationFailed'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[60] bg-black/50 flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="w-full sm:max-w-xl bg-white sm:rounded-2xl rounded-t-2xl shadow-xl max-h-[95vh] overflow-y-auto">
        <div className="flex items-start justify-between p-4 border-b border-gray-100">
          <div>
            <h3 className="text-base font-semibold text-gray-900 flex items-center gap-2">
              <UserPlus className="w-5 h-5 text-teal-600" />{t('common.regjistroKompaniTeRe')}</h3>
            <p className="text-xs text-gray-500 mt-0.5">{t('common.kompaniaDoRuhetDheDoPerdoret')}</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-4 space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label className="block sm:col-span-2">
              <span className="text-xs font-medium text-gray-700">{t('common.emriIKompanise2')}</span>
              <input value={name} onChange={(e) => setName(e.target.value)} className="mt-1 w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500" />
            </label>
            <label className="block">
              <span className="text-xs font-medium text-gray-700">Tipi</span>
              <select value={contactType} onChange={(e) => setContactType(e.target.value as any)} className="mt-1 w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500">
                <option value="customer">{t('common.klient')}</option>
                <option value="supplier">Furnitor</option>
                <option value="both">Te dyja</option>
              </select>
            </label>
            <label className="block">
              <span className="text-xs font-medium text-gray-700">VAT / NIPT</span>
              <input value={vat} onChange={(e) => setVat(e.target.value)} className="mt-1 w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500" />
            </label>
            <label className="block">
              <span className="text-xs font-medium text-gray-700">{t('common.email')}</span>
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="mt-1 w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500" />
            </label>
            <label className="block">
              <span className="text-xs font-medium text-gray-700">Telefon</span>
              <input value={phone} onChange={(e) => setPhone(e.target.value)} className="mt-1 w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500" />
            </label>
            <label className="block sm:col-span-2">
              <span className="text-xs font-medium text-gray-700">{t('common.address')}</span>
              <input value={address} onChange={(e) => setAddress(e.target.value)} className="mt-1 w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500" />
            </label>
            <label className="block">
              <span className="text-xs font-medium text-gray-700">Qyteti</span>
              <input value={city} onChange={(e) => setCity(e.target.value)} className="mt-1 w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500" />
            </label>
            <label className="block">
              <span className="text-xs font-medium text-gray-700">Kodi Postar</span>
              <input value={postalCode} onChange={(e) => setPostalCode(e.target.value)} className="mt-1 w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500" />
            </label>
            <label className="block sm:col-span-2">
              <span className="text-xs font-medium text-gray-700">Shteti</span>
              <input value={country} onChange={(e) => setCountry(e.target.value)} className="mt-1 w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500" />
            </label>
          </div>
          {error && (
            <p className="text-sm text-red-600">{error}</p>
          )}
        </div>

        <div className="sticky bottom-0 bg-white p-3 border-t border-gray-100 flex justify-end gap-2 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          <button onClick={onClose} className="px-3 py-2 rounded-lg border border-gray-200 text-sm text-gray-700 hover:bg-gray-50">{t('common.close')}</button>
          <button onClick={save} disabled={saving} className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-teal-600 text-white text-sm font-semibold hover:bg-teal-700 disabled:opacity-60">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            Regjistro
          </button>
        </div>
      </div>
    </div>
  );
}
