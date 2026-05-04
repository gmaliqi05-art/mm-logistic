import { useState, useEffect, useCallback } from 'react';
import {
  Loader2,
  AlertTriangle,
  X,
  Building2,
  Hash,
  Settings,
  Save,
  CheckCircle2,
  Globe,
  Lock,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { useTranslation } from '../../i18n';
import type { AccBankAccount, AccCurrency } from '../../types/accounting';
import { ACC_CURRENCIES } from '../../types/accounting';
import { CitySelect, PostalCodeSelect, emptyLocationSelection } from '../../components/location/LocationSelector';
import type { LocationSelection } from '../../types/location';
import { clearComplianceCache } from '../../lib/complianceEngine';
import PushNotificationSettings from '../../components/PushNotificationSettings';

interface CompanyForm {
  name: string;
  address: string;
  city: string;
  postal_code: string;
  country: string;
  vat_number: string;
  tax_number: string;
  commercial_register: string;
  legal_form: string;
  registration_court: string;
}

interface InvoiceSequence {
  id: string;
  prefix: string;
  current_number: number;
  year: number;
}

const emptyCompanyForm: CompanyForm = {
  name: '',
  address: '',
  city: '',
  postal_code: '',
  country: '',
  vat_number: '',
  tax_number: '',
  commercial_register: '',
  legal_form: '',
  registration_court: '',
};

export default function AccSettings() {
  const { profile } = useAuth();
  const { t } = useTranslation();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [companyForm, setCompanyForm] = useState<CompanyForm>(emptyCompanyForm);
  const [location, setLocation] = useState<LocationSelection>(emptyLocationSelection);
  const [sequences, setSequences] = useState<InvoiceSequence[]>([]);
  const [bankAccounts, setBankAccounts] = useState<AccBankAccount[]>([]);

  const [defaultCurrency, setDefaultCurrency] = useState<AccCurrency>(() => {
    return (localStorage.getItem('acc_default_currency') as AccCurrency) || 'EUR';
  });
  const [defaultPaymentDays, setDefaultPaymentDays] = useState<number>(() => {
    return parseInt(localStorage.getItem('acc_default_payment_days') || '14', 10);
  });
  const [defaultBankAccountId, setDefaultBankAccountId] = useState<string>(() => {
    return localStorage.getItem('acc_default_bank_account') || '';
  });

  const hydrateLocationFromText = useCallback(
    async (countryText: string, cityText: string, postalText: string) => {
      if (!countryText) {
        setLocation(emptyLocationSelection);
        return;
      }
      const { data: countries } = await supabase
        .from('countries')
        .select('id, name, code, flag_emoji, region')
        .or(`code.ilike.${countryText},name.ilike.${countryText}`)
        .limit(1);
      const country = countries?.[0] ?? null;
      if (!country) {
        setLocation(emptyLocationSelection);
        return;
      }
      let city = null;
      if (cityText) {
        const { data: cities } = await supabase
          .from('cities')
          .select('id, country_id, name, admin_area')
          .eq('country_id', country.id)
          .ilike('name', cityText)
          .limit(1);
        city = cities?.[0] ?? null;
      }
      let postalCode = null;
      if (postalText && city) {
        const { data: postals } = await supabase
          .from('postal_codes')
          .select('id, city_id, code, area_name')
          .eq('city_id', city.id)
          .eq('code', postalText)
          .limit(1);
        postalCode = postals?.[0] ?? null;
      }
      setLocation({ country, city, postalCode });
    },
    [],
  );

  const fetchData = useCallback(async () => {
    if (!profile?.company_id) return;
    try {
      setLoading(true);
      setError(null);
      const companyId = profile.company_id;

      const [companyRes, seqRes, bankRes] = await Promise.all([
        supabase
          .from('companies')
          .select('name, address, city, postal_code, country, vat_number, tax_number, commercial_register, legal_form, registration_court')
          .eq('id', companyId)
          .single(),
        supabase
          .from('acc_invoice_sequences')
          .select('id, prefix, current_number, year')
          .eq('company_id', companyId)
          .order('prefix'),
        supabase
          .from('acc_bank_accounts')
          .select('*')
          .eq('company_id', companyId)
          .eq('is_active', true)
          .order('name'),
      ]);

      if (companyRes.error) throw companyRes.error;
      if (seqRes.error) throw seqRes.error;
      if (bankRes.error) throw bankRes.error;

      if (companyRes.data) {
        setCompanyForm({
          name: companyRes.data.name || '',
          address: companyRes.data.address || '',
          city: companyRes.data.city || '',
          postal_code: companyRes.data.postal_code || '',
          country: companyRes.data.country || '',
          vat_number: companyRes.data.vat_number || '',
          tax_number: companyRes.data.tax_number || '',
          commercial_register: companyRes.data.commercial_register || '',
          legal_form: companyRes.data.legal_form || '',
          registration_court: companyRes.data.registration_court || '',
        });

        await hydrateLocationFromText(
          companyRes.data.country || '',
          companyRes.data.city || '',
          companyRes.data.postal_code || '',
        );
      }

      setSequences(seqRes.data ?? []);
      setBankAccounts(bankRes.data ?? []);
    } catch (err: any) {
      setError(err.message || t('common.errorLoading'));
    } finally {
      setLoading(false);
    }
  }, [profile?.company_id]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleSaveCompany = async () => {
    if (!profile?.company_id) return;
    try {
      setSaving(true);
      setError(null);
      setSuccess(null);

      const cityName = location.city?.name ?? companyForm.city;
      const postalCode = location.postalCode?.code ?? companyForm.postal_code;

      const { error: updateErr } = await supabase
        .from('companies')
        .update({
          name: companyForm.name.trim(),
          address: companyForm.address.trim(),
          city: cityName,
          postal_code: postalCode,
          vat_number: companyForm.vat_number.trim(),
          tax_number: companyForm.tax_number.trim(),
          commercial_register: companyForm.commercial_register.trim(),
          legal_form: companyForm.legal_form.trim(),
          registration_court: companyForm.registration_court.trim(),
        })
        .eq('id', profile.company_id);

      if (updateErr) throw updateErr;

      setCompanyForm({
        ...companyForm,
        city: cityName,
        postal_code: postalCode,
      });

      clearComplianceCache(profile.company_id);

      setSuccess('Te dhenat e kompanise u ruajten me sukses');
      setTimeout(() => setSuccess(null), 3000);
    } catch (err: any) {
      setError(err.message || 'Gabim gjate ruajtjes');
    } finally {
      setSaving(false);
    }
  };

  const handleCurrencyChange = (value: AccCurrency) => {
    setDefaultCurrency(value);
    localStorage.setItem('acc_default_currency', value);
  };

  const handlePaymentDaysChange = (value: number) => {
    setDefaultPaymentDays(value);
    localStorage.setItem('acc_default_payment_days', String(value));
  };

  const handleBankAccountChange = (value: string) => {
    setDefaultBankAccountId(value);
    localStorage.setItem('acc_default_bank_account', value);
  };

  const formatSequenceNumber = (seq: InvoiceSequence) => {
    const padded = String(seq.current_number + 1).padStart(4, '0');
    return `${seq.prefix}-${seq.year}-${padded}`;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-12 h-12 text-emerald-600 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Konfigurimet e Kontabilitetit</h1>
        <p className="text-gray-500 mt-1">Menaxho te dhenat e kompanise dhe preferencat</p>
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

      {success && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-4 flex items-center gap-3">
          <CheckCircle2 className="w-5 h-5 text-emerald-500 flex-shrink-0" />
          <p className="text-emerald-700 text-sm">{success}</p>
          <button onClick={() => setSuccess(null)} className="ml-auto text-emerald-500 hover:text-emerald-700">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      <div className="bg-white rounded-xl border border-gray-200">
        <div className="px-6 py-4 border-b border-gray-100 flex items-center gap-3">
          <div className="bg-teal-100 p-2 rounded-lg">
            <Settings className="w-5 h-5 text-teal-600" />
          </div>
          <div>
            <h2 className="text-base font-semibold text-gray-900">Njoftimet</h2>
            <p className="text-xs text-gray-500">Aktivizo njoftimet push ne browser dhe PWA</p>
          </div>
        </div>
        <div className="p-6">
          <PushNotificationSettings />
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200">
        <div className="px-6 py-4 border-b border-gray-100 flex items-center gap-3">
          <div className="bg-emerald-100 p-2 rounded-lg">
            <Building2 className="w-5 h-5 text-emerald-600" />
          </div>
          <div>
            <h2 className="text-base font-semibold text-gray-900">Te Dhenat e Kompanise</h2>
            <p className="text-xs text-gray-500">Informacioni qe shfaqet ne fatura dhe dokumente</p>
          </div>
        </div>
        <div className="p-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="sm:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">Emri i Kompanise</label>
              <input
                type="text"
                value={companyForm.name}
                onChange={(e) => setCompanyForm({ ...companyForm, name: e.target.value })}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent text-sm"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">Adresa</label>
              <input
                type="text"
                value={companyForm.address}
                onChange={(e) => setCompanyForm({ ...companyForm, address: e.target.value })}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent text-sm"
              />
            </div>
            <div className="sm:col-span-2">
              <div className="flex items-start gap-2 mb-2 p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-800">
                <Lock className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="font-medium mb-0.5">Shteti eshte i kyçur sipas regjistrimit</p>
                  <p>
                    Shteti percakton ligjet e kontabilitetit (TVSH, plani i llogarive, autoriteti tatimor, monedha)
                    dhe nuk mund te ndryshohet ketu. Per ta ndryshuar, kontaktoni Super Adminin. Qyteti, kodi postar dhe
                    adresa mund te perditesohen lirisht.
                  </p>
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-medium text-gray-600">Shteti</label>
                  <div className="w-full flex items-center gap-2 px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-700">
                    {location.country ? (
                      <>
                        <span className="text-lg leading-none">{location.country.flag_emoji}</span>
                        <span className="truncate font-medium">{location.country.name}</span>
                        <span className="text-xs text-gray-400 font-mono ml-auto">{location.country.code}</span>
                      </>
                    ) : (
                      <span className="flex items-center gap-2 text-gray-400">
                        <Globe className="w-4 h-4" />
                        Nuk eshte caktuar
                      </span>
                    )}
                  </div>
                </div>
                <CitySelect
                  countryId={location.country?.id ?? null}
                  value={location.city}
                  onChange={(city) => setLocation({ ...location, city, postalCode: null })}
                  required
                  label="Qyteti"
                />
                <PostalCodeSelect
                  cityId={location.city?.id ?? null}
                  value={location.postalCode}
                  onChange={(postalCode) => setLocation({ ...location, postalCode })}
                  required
                  label="Kodi Postar"
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Numri i TVSH-se</label>
              <input
                type="text"
                value={companyForm.vat_number}
                onChange={(e) => setCompanyForm({ ...companyForm, vat_number: e.target.value })}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent text-sm"
                placeholder="p.sh. XK123456789"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Numri Fiskal</label>
              <input
                type="text"
                value={companyForm.tax_number}
                onChange={(e) => setCompanyForm({ ...companyForm, tax_number: e.target.value })}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Regjistri Tregtar</label>
              <input
                type="text"
                value={companyForm.commercial_register}
                onChange={(e) => setCompanyForm({ ...companyForm, commercial_register: e.target.value })}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Forma Juridike</label>
              <input
                type="text"
                value={companyForm.legal_form}
                onChange={(e) => setCompanyForm({ ...companyForm, legal_form: e.target.value })}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent text-sm"
                placeholder="p.sh. SH.P.K., N.T.P."
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Gjykata e Regjistrimit</label>
              <input
                type="text"
                value={companyForm.registration_court}
                onChange={(e) => setCompanyForm({ ...companyForm, registration_court: e.target.value })}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent text-sm"
              />
            </div>
          </div>
          <div className="mt-6 flex justify-end">
            <button
              onClick={handleSaveCompany}
              disabled={saving}
              className="inline-flex items-center gap-2 px-6 py-2.5 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors font-medium text-sm disabled:opacity-50"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              Ruaj Ndryshimet
            </button>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200">
        <div className="px-6 py-4 border-b border-gray-100 flex items-center gap-3">
          <div className="bg-blue-100 p-2 rounded-lg">
            <Hash className="w-5 h-5 text-blue-600" />
          </div>
          <div>
            <h2 className="text-base font-semibold text-gray-900">Sekuencat e Faturave</h2>
            <p className="text-xs text-gray-500">Numrat e rradhes per dokumente te ndryshme</p>
          </div>
        </div>
        <div className="p-6">
          {sequences.length === 0 ? (
            <p className="text-sm text-gray-500">Asnje sekuence e konfiguruar.</p>
          ) : (
            <div className="space-y-3">
              {sequences.map((seq) => (
                <div
                  key={seq.id}
                  className="flex items-center justify-between p-4 bg-gray-50 rounded-lg border border-gray-100"
                >
                  <div className="flex items-center gap-3">
                    <span className="inline-flex items-center justify-center w-10 h-10 rounded-lg bg-white border border-gray-200 text-sm font-bold text-gray-700">
                      {seq.prefix}
                    </span>
                    <div>
                      <p className="text-sm font-medium text-gray-900">
                        Prefiksi: {seq.prefix}
                      </p>
                      <p className="text-xs text-gray-500">
                        Viti: {seq.year} &middot; Numri aktual: {seq.current_number}
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-gray-500">Fatura e radhes</p>
                    <p className="text-sm font-semibold text-emerald-600">
                      {formatSequenceNumber(seq)}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200">
        <div className="px-6 py-4 border-b border-gray-100 flex items-center gap-3">
          <div className="bg-amber-100 p-2 rounded-lg">
            <Settings className="w-5 h-5 text-amber-600" />
          </div>
          <div>
            <h2 className="text-base font-semibold text-gray-900">Preferencat e Parazgjedhura</h2>
            <p className="text-xs text-gray-500">Vlerat standarde per dokumente te reja</p>
          </div>
        </div>
        <div className="p-6">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Monedha e Parazgjedhur</label>
              <select
                value={defaultCurrency}
                onChange={(e) => handleCurrencyChange(e.target.value as AccCurrency)}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent text-sm"
              >
                {ACC_CURRENCIES.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Dite Pagese (parazgjedhur)</label>
              <input
                type="number"
                value={defaultPaymentDays}
                onChange={(e) => handlePaymentDaysChange(parseInt(e.target.value, 10) || 0)}
                min={0}
                max={365}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Llogaria Bankare e Parazgjedhur</label>
              <select
                value={defaultBankAccountId}
                onChange={(e) => handleBankAccountChange(e.target.value)}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent text-sm"
              >
                <option value="">Asnjera</option>
                {bankAccounts.map((ba) => (
                  <option key={ba.id} value={ba.id}>
                    {ba.name} ({ba.iban})
                  </option>
                ))}
              </select>
            </div>
          </div>
          <p className="mt-3 text-xs text-gray-400">
            Keto preferenca ruhen ne pajisjen tuaj dhe aplikohen automatikisht kur krijoni dokumente te reja.
          </p>
        </div>
      </div>
    </div>
  );
}
