import { useState, useEffect } from 'react';
import { Link, useSearchParams, useNavigate } from 'react-router-dom';
import { useTranslation } from '../i18n';
import LanguageSwitcher from '../components/LanguageSwitcher';
import {
  Package,
  Building2,
  User,
  Mail,
  Lock,
  Phone,
  Eye,
  EyeOff,
  ArrowRight,
  ArrowLeft,
  Check,
  Loader2,
  AlertCircle,
  CreditCard,
  Zap,
  Star,
  Shield,
  CheckCircle,
  Truck,
  Calculator,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { usePlatformSettings } from '../hooks/usePlatformSettings';
import type { SubscriptionPlan } from '../types';
import type { City, Country, PostalCode } from '../types/location';
import { CountrySelect, CitySelect } from '../components/location/LocationSelector';
import {
  getRegistrationProfile,
  type CountryRegistrationProfile,
} from '../lib/registrationFields';

const planIcons: Record<string, typeof Zap> = {
  free_trial: Zap,
  standard: Star,
  premium: Shield,
  acc_free_trial: Zap,
  acc_standard: Star,
  acc_premium: Shield,
};

type BusinessType = 'logistics' | 'accounting' | 'both';

export default function RegisterPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { settings: platformSettings } = usePlatformSettings();
  const initialType = (searchParams.get('type') === 'accounting' ? 'accounting' : 'logistics') as BusinessType;
  const [businessType, setBusinessType] = useState<BusinessType>(initialType);
  const [currentStep, setCurrentStep] = useState(0);
  const [plans, setPlans] = useState<SubscriptionPlan[]>([]);
  const [selectedPlan, setSelectedPlan] = useState<string>(
    searchParams.get('plan') || (initialType === 'accounting' ? 'acc_free_trial' : 'free_trial')
  );
  const [loading, setLoading] = useState(false);
  const [plansLoading, setPlansLoading] = useState(true);
  const [error, setError] = useState('');

  const [form, setForm] = useState({
    companyName: '',
    companyEmail: '',
    companyPhone: '',
    companyAddress: '',
    country: '',
    city: '',
    postalCode: '',
    website: '',
    vatNumber: '',
    taxNumber: '',
    commercialRegister: '',
    legalForm: '',
    registrationCourt: '',
    adminName: '',
    adminPassword: '',
    confirmPassword: '',
  });
  const [location, setLocation] = useState<{
    country: Country | null;
    city: City | null;
    postalCode: PostalCode | null;
  }>({ country: null, city: null, postalCode: null });
  const [showPassword, setShowPassword] = useState(false);

  const profile = getRegistrationProfile(location.country?.code);

  const steps = [
    { label: t('auth.stepInfo'), icon: Building2 },
    { label: t('auth.stepPlan'), icon: Star },
    { label: t('auth.stepPayment'), icon: CreditCard },
    { label: t('auth.stepDone'), icon: CheckCircle },
  ];

  useEffect(() => {
    fetchPlans();
  }, []);

  async function fetchPlans() {
    const { data } = await supabase
      .from('subscription_plans')
      .select('*')
      .eq('is_active', true)
      .order('sort_order');
    setPlans(data ?? []);
    setPlansLoading(false);
  }

  function updateForm(key: string, value: string) {
    setForm((prev) => ({ ...prev, [key]: value }));
    setError('');
  }

  function handleCountryChange(country: Country | null) {
    setLocation({ country, city: null, postalCode: null });
    setForm((prev) => ({
      ...prev,
      country: country?.code ?? '',
      city: '',
      postalCode: '',
      vatNumber: '',
      taxNumber: '',
      commercialRegister: '',
      registrationCourt: '',
      legalForm: '',
    }));
    setError('');
  }

  async function handleCityChange(city: City | null) {
    setLocation((prev) => ({ ...prev, city, postalCode: null }));
    setForm((prev) => ({ ...prev, city: city?.name ?? '', postalCode: '' }));
    if (!city) return;
    const { data } = await supabase
      .from('postal_codes')
      .select('id, city_id, code, area_name')
      .eq('city_id', city.id)
      .order('code')
      .limit(1);
    const first = data?.[0];
    if (first) {
      setLocation((prev) =>
        prev.city?.id === city.id ? { ...prev, postalCode: first as PostalCode } : prev,
      );
      setForm((prev) => ({ ...prev, postalCode: first.code }));
    }
  }

  async function handlePostalCodeLookup(rawCode: string) {
    const code = rawCode.trim();
    setForm((prev) => ({ ...prev, postalCode: code }));
    if (!location.country || code.length < 2) return;
    const { data } = await supabase
      .from('postal_codes')
      .select('id, city_id, code, area_name, cities!inner(id, country_id, name, admin_area)')
      .eq('code', code)
      .eq('cities.country_id', location.country.id)
      .limit(1);
    const hit = data?.[0] as (PostalCode & { cities: City }) | undefined;
    if (hit) {
      const city = hit.cities;
      const postalCode: PostalCode = {
        id: hit.id,
        city_id: hit.city_id,
        code: hit.code,
        area_name: hit.area_name,
      };
      setLocation((prev) => ({ ...prev, city, postalCode }));
      setForm((prev) => ({ ...prev, city: city.name, postalCode: postalCode.code }));
    }
  }

  function validateStep0() {
    if (!form.companyName.trim()) return t('auth.requiredFields');
    if (!form.companyEmail.trim()) return t('auth.requiredFields');
    if (!form.adminName.trim()) return t('auth.requiredFields');
    if (!form.adminPassword.trim()) return t('auth.requiredFields');
    if (form.adminPassword.length < 8) return t('auth.passwordError');
    if (form.adminPassword !== form.confirmPassword) return t('auth.passwordMismatch');
    if (!location.country) return t('auth.selectCountry');
    for (const f of profile.fields) {
      if (!f.required) continue;
      const value = (form[f.key] || '').toString().trim();
      if (!value) return t('auth.fieldRequired').replace('{field}', f.label).replace('{country}', location.country?.name || '');
    }
    return null;
  }

  function handleNext() {
    if (currentStep === 0) {
      const err = validateStep0();
      if (err) {
        setError(err);
        return;
      }
    }
    setError('');

    if (currentStep === 1 && (selectedPlan === 'free_trial' || selectedPlan === 'acc_free_trial')) {
      handleRegister();
      return;
    }

    if (currentStep === 2) {
      handlePaidRegister();
      return;
    }

    setCurrentStep((prev) => Math.min(prev + 1, steps.length - 1));
  }

  function handleBack() {
    setError('');
    setCurrentStep((prev) => Math.max(prev - 1, 0));
  }

  async function handleRegister() {
    setLoading(true);
    setError('');

    try {
      const apiUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/register-company`;
      const res = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
        },
        body: JSON.stringify({
          companyName: form.companyName,
          companyEmail: form.companyEmail,
          companyPhone: form.companyPhone,
          companyAddress: form.companyAddress,
          country: form.country,
          city: form.city,
          postalCode: form.postalCode,
          website: form.website,
          vatNumber: form.vatNumber,
          taxNumber: form.taxNumber,
          commercialRegister: form.commercialRegister,
          legalForm: form.legalForm,
          registrationCourt: form.registrationCourt,
          adminName: form.adminName,
          adminEmail: form.companyEmail,
          adminPassword: form.adminPassword,
          planName: selectedPlan,
          businessType: businessType === 'both' ? 'logistics' : businessType,
          accountingEnabled: businessType === 'both',
        }),
      });

      const data = await res.json();
      if (!data.success) throw new Error(data.error);

      setCurrentStep(3);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Gabim gjate regjistrimit';
      setError(message);
      if (currentStep > 1) setCurrentStep((selectedPlan === 'free_trial' || selectedPlan === 'acc_free_trial') ? 1 : 2);
    } finally {
      setLoading(false);
    }
  }

  async function handlePaidRegister() {
    setLoading(true);
    setError('');

    try {
      // First register the company (creates account with trial status)
      const apiUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/register-company`;
      const res = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
        },
        body: JSON.stringify({
          companyName: form.companyName,
          companyEmail: form.companyEmail,
          companyPhone: form.companyPhone,
          companyAddress: form.companyAddress,
          country: form.country,
          city: form.city,
          postalCode: form.postalCode,
          website: form.website,
          vatNumber: form.vatNumber,
          taxNumber: form.taxNumber,
          commercialRegister: form.commercialRegister,
          legalForm: form.legalForm,
          registrationCourt: form.registrationCourt,
          adminName: form.adminName,
          adminEmail: form.companyEmail,
          adminPassword: form.adminPassword,
          planName: selectedPlan,
          businessType: businessType === 'both' ? 'logistics' : businessType,
          accountingEnabled: businessType === 'both',
        }),
      });

      const data = await res.json();
      if (!data.success) throw new Error(data.error);

      // Now sign in to get a session token for Stripe checkout
      const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
        email: form.companyEmail,
        password: form.adminPassword,
      });

      if (signInError || !signInData.session) {
        // Registration succeeded but couldn't sign in for payment - show pending payment
        navigate('/payment-pending');
        return;
      }

      // Find the plan to get its ID
      const selectedPlanObj = plans.find((p) => p.name === selectedPlan);
      if (!selectedPlanObj?.stripe_price_id) {
        // Plan has no Stripe price configured - show pending payment page
        navigate('/payment-pending');
        return;
      }

      // Create Stripe checkout session
      const checkoutUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/stripe-checkout`;
      const checkoutRes = await fetch(checkoutUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${signInData.session.access_token}`,
          'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
        },
        body: JSON.stringify({
          planId: selectedPlanObj.id,
          successUrl: `${window.location.origin}/payment-success`,
          cancelUrl: `${window.location.origin}/payment-pending`,
          isUpgrade: false,
        }),
      });

      const checkoutData = await checkoutRes.json();

      if (checkoutData.url) {
        window.location.href = checkoutData.url;
        return;
      }

      // If Stripe checkout creation fails, redirect to pending payment page
      navigate('/payment-pending');
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Gabim gjate regjistrimit';
      setError(message);
      setCurrentStep(2);
    } finally {
      setLoading(false);
    }
  }

  const filteredPlans = plans.filter((p) => {
    const type = (p as SubscriptionPlan & { product_type?: string }).product_type || 'logistics';
    if (businessType === 'both') return type === 'logistics';
    return type === businessType;
  });
  const currentPlan = plans.find((p) => p.name === selectedPlan);

  const accountingAddonPlan = businessType === 'both'
    ? plans.find((p) => p.product_type === 'accounting' && p.is_addon && p.price_addon_monthly != null)
    : null;

  function switchBusinessType(type: BusinessType) {
    setBusinessType(type);
    if (type === 'accounting') setSelectedPlan('acc_free_trial');
    else setSelectedPlan('free_trial');
  }

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <div className="bg-white border-b border-slate-200 sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2.5 group">
            {platformSettings.logo ? (
              <img
                src={platformSettings.logo}
                alt={platformSettings.name}
                className="w-9 h-9 rounded-xl object-contain"
              />
            ) : (
              <div className="p-2 bg-teal-600 rounded-xl">
                <Package className="h-5 w-5 text-white" />
              </div>
            )}
            <span className="text-lg font-bold text-slate-800">{platformSettings.name}</span>
          </Link>
          <div className="flex items-center gap-4">
            <LanguageSwitcher />
            <Link
              to="/login"
              className="text-sm text-slate-500 hover:text-teal-600 transition-colors"
            >
              {t('auth.haveAccount')}
            </Link>
          </div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto w-full px-4 sm:px-6 py-8">
        <div className="flex items-center justify-center mb-10">
          {steps.map((step, idx) => (
            <div key={step.label} className="flex items-center">
              <div className="flex flex-col items-center">
                <div
                  className={`w-10 h-10 rounded-full flex items-center justify-center transition-all duration-300 ${
                    idx < currentStep
                      ? 'bg-teal-600 text-white'
                      : idx === currentStep
                      ? 'bg-teal-600 text-white ring-4 ring-teal-100'
                      : 'bg-slate-200 text-slate-400'
                  }`}
                >
                  {idx < currentStep ? (
                    <Check className="w-5 h-5" />
                  ) : (
                    <step.icon className="w-5 h-5" />
                  )}
                </div>
                <span
                  className={`mt-2 text-xs font-medium hidden sm:block ${
                    idx <= currentStep ? 'text-teal-700' : 'text-slate-400'
                  }`}
                >
                  {step.label}
                </span>
              </div>
              {idx < steps.length - 1 && (
                <div
                  className={`w-12 sm:w-20 h-0.5 mx-2 transition-all duration-300 ${
                    idx < currentStep ? 'bg-teal-600' : 'bg-slate-200'
                  }`}
                />
              )}
            </div>
          ))}
        </div>

        {error && (
          <div className="mb-6 flex items-center gap-3 p-4 rounded-xl bg-red-50 border border-red-200">
            <AlertCircle className="h-5 w-5 text-red-500 flex-shrink-0" />
            <p className="text-sm text-red-700">{error}</p>
          </div>
        )}

        {currentStep === 0 && (
          <>
            <BusinessTypeSelector businessType={businessType} onChange={switchBusinessType} />
            <StepInfo
              form={form}
              updateForm={updateForm}
              showPassword={showPassword}
              setShowPassword={setShowPassword}
              businessType={businessType}
              t={t}
              location={location}
              profile={profile}
              onCountryChange={handleCountryChange}
              onCityChange={handleCityChange}
              onPostalCodeLookup={handlePostalCodeLookup}
            />
          </>
        )}

        {currentStep === 1 && (
          <StepPlan
            plans={filteredPlans}
            plansLoading={plansLoading}
            selectedPlan={selectedPlan}
            setSelectedPlan={setSelectedPlan}
            businessType={businessType}
            accountingAddonPlan={accountingAddonPlan}
            t={t}
          />
        )}

        {currentStep === 2 && (
          <StepPayment currentPlan={currentPlan} t={t} />
        )}

        {currentStep === 3 && (
          <StepSuccess adminEmail={form.companyEmail} navigate={navigate} t={t} />
        )}

        {currentStep < 3 && (
          <div className="mt-8 flex items-center justify-between">
            <button
              onClick={handleBack}
              disabled={currentStep === 0}
              className="flex items-center gap-2 px-6 py-3 rounded-xl text-slate-600 hover:bg-slate-100 transition-colors disabled:opacity-0 disabled:pointer-events-none font-medium"
            >
              <ArrowLeft className="w-4 h-4" />
              {t('common.back')}
            </button>

            <button
              onClick={handleNext}
              disabled={loading}
              className="flex items-center gap-2 px-8 py-3.5 rounded-xl bg-teal-600 text-white font-semibold hover:bg-teal-700 transition-all duration-200 shadow-lg shadow-teal-600/25 disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {loading ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  {t('common.processing')}
                </>
              ) : currentStep === 1 && (selectedPlan === 'free_trial' || selectedPlan === 'acc_free_trial') ? (
                <>
                  {t('auth.registerFreeButton')}
                  <Check className="w-5 h-5" />
                </>
              ) : currentStep === 2 ? (
                <>
                  {t('auth.finishRegistration')}
                  <Check className="w-5 h-5" />
                </>
              ) : (
                <>
                  {t('common.continue')}
                  <ArrowRight className="w-5 h-5" />
                </>
              )}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function BusinessTypeSelector({ businessType, onChange }: { businessType: BusinessType; onChange: (t: BusinessType) => void }) {
  const options: { type: BusinessType; icon: typeof Truck; title: string; desc: string }[] = [
    {
      type: 'logistics',
      icon: Truck,
      title: 'Logjistike & Transport',
      desc: 'Depo, shofere, fletedergesa, stok, chat, raporte.',
    },
    {
      type: 'accounting',
      icon: Calculator,
      title: 'Vetem Kontabilitet',
      desc: 'Fatura, DATEV, XRechnung/ZUGFeRD, raporte TVSH.',
    },
    {
      type: 'both',
      icon: Building2,
      title: 'Te dyja - Paketa e Plote',
      desc: 'Logjistike + Kontabilitet ne nje platforme te vetme me cmim te reduktuar.',
    },
  ];

  return (
    <div className="mb-8">
      <h2 className="text-center text-lg font-bold text-slate-800 mb-1">Zgjidhni llojin e biznesit</h2>
      <p className="text-center text-sm text-slate-500 mb-5">Mund ta ndryshoni planin me vone nga cilesimet</p>
      <div className="grid sm:grid-cols-3 gap-4 max-w-4xl mx-auto">
        {options.map(({ type, icon: Icon, title, desc }) => {
          const isActive = businessType === type;
          return (
            <button
              key={type}
              type="button"
              onClick={() => onChange(type)}
              className={`text-left p-5 rounded-2xl border-2 transition-all ${
                isActive
                  ? 'border-teal-500 bg-teal-50/50 shadow-md'
                  : 'border-slate-200 bg-white hover:border-slate-300'
              }`}
            >
              <div className="flex items-center gap-3 mb-2">
                <div className={`p-2.5 rounded-xl ${isActive ? 'bg-teal-100' : 'bg-slate-100'}`}>
                  <Icon className={`h-5 w-5 ${isActive ? 'text-teal-600' : 'text-slate-500'}`} />
                </div>
                <h3 className="font-bold text-slate-800 text-sm">{title}</h3>
                {isActive && (
                  <span className="ml-auto inline-flex w-5 h-5 rounded-full bg-teal-500 items-center justify-center flex-shrink-0">
                    <Check className="w-3 h-3 text-white" />
                  </span>
                )}
              </div>
              <p className="text-sm text-slate-500">{desc}</p>
              {type === 'both' && isActive && (
                <div className="mt-3 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2">
                  <p className="text-xs text-emerald-700 font-medium">Cmimi i kontabilitetit me ulje deri ne 50%</p>
                </div>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function StepInfo({
  form,
  updateForm,
  showPassword,
  setShowPassword,
  businessType,
  t,
  location,
  profile,
  onCountryChange,
  onCityChange,
  onPostalCodeLookup,
}: {
  form: Record<string, string>;
  updateForm: (key: string, value: string) => void;
  showPassword: boolean;
  setShowPassword: (v: boolean) => void;
  businessType: BusinessType;
  t: (key: string) => string;
  location: { country: Country | null; city: City | null; postalCode: PostalCode | null };
  profile: CountryRegistrationProfile;
  onCountryChange: (country: Country | null) => void;
  onCityChange: (city: City | null) => void;
  onPostalCodeLookup: (code: string) => void;
}) {
  const adminLabel = businessType === 'accounting' ? 'Informacione Kontabilisti' : t('auth.adminInfo');
  const showLegalSection = profile.fields.length > 0;
  const legalFields = profile.fields.filter((f) => f.key !== 'legalForm');
  const hasLegalForm = profile.fields.some((f) => f.key === 'legalForm');
  const legalFormSpec = profile.fields.find((f) => f.key === 'legalForm');
  return (
    <div className="space-y-8">
      <div className="grid md:grid-cols-2 gap-8">
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 sm:p-8">
          <div className="flex items-center gap-3 mb-6">
            <div className="p-2.5 bg-teal-50 rounded-xl">
              <Building2 className="h-5 w-5 text-teal-600" />
            </div>
            <h2 className="text-lg font-bold text-slate-800">{t('auth.companyInfo')}</h2>
          </div>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">
                {t('auth.companyName')} *
              </label>
              <input
                type="text"
                value={form.companyName}
                onChange={(e) => updateForm('companyName', e.target.value)}
                placeholder={t('auth.companyNamePlaceholder')}
                autoComplete="organization"
                className="w-full px-4 py-3 text-base sm:text-sm rounded-xl border border-slate-300 bg-white text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-teal-500 transition-all"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">
                {t('auth.companyEmail')} *
              </label>
              <div className="relative">
                <Mail className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                <input
                  type="email"
                  value={form.companyEmail}
                  onChange={(e) => updateForm('companyEmail', e.target.value)}
                  placeholder="info@mm-logistic.eu"
                  autoCapitalize="none"
                  autoCorrect="off"
                  autoComplete="email"
                  inputMode="email"
                  className="w-full pl-11 pr-4 py-3 text-base sm:text-sm rounded-xl border border-slate-300 bg-white text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-teal-500 transition-all"
                />
              </div>
              <p className="mt-1 text-xs text-slate-400">{t('auth.companyEmailHint')}</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">{t('common.phone')}</label>
              <div className="relative">
                <Phone className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                <input
                  type="text"
                  value={form.companyPhone}
                  onChange={(e) => updateForm('companyPhone', e.target.value)}
                  placeholder="+49 xxx xxxx xxxx"
                  className="w-full pl-11 pr-4 py-3 rounded-xl border border-slate-300 bg-white text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-teal-500 transition-all"
                />
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Shteti *</label>
                <CountrySelect
                  value={location.country}
                  onChange={onCountryChange}
                  placeholder="Zgjidh shtetin"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Qyteti</label>
                <CitySelect
                  countryId={location.country?.id ?? null}
                  value={location.city}
                  onChange={onCityChange}
                  placeholder={location.country ? 'Zgjidh qytetin' : 'Zgjidh shtetin së pari'}
                />
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Kodi Postar</label>
                <input
                  type="text"
                  value={form.postalCode}
                  onChange={(e) => onPostalCodeLookup(e.target.value)}
                  placeholder={location.country ? 'Shkruaj kodin postar' : 'Zgjidh shtetin së pari'}
                  disabled={!location.country}
                  className="w-full px-4 py-2.5 rounded-xl border border-slate-300 bg-white text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-teal-500 transition-all disabled:bg-slate-100 disabled:text-slate-400"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Adresa</label>
                <input
                  type="text"
                  value={form.companyAddress}
                  onChange={(e) => updateForm('companyAddress', e.target.value)}
                  placeholder="Rruga, numri"
                  className="w-full px-4 py-3 rounded-xl border border-slate-300 bg-white text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-teal-500 transition-all"
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Website</label>
              <input
                type="text"
                value={form.website}
                onChange={(e) => updateForm('website', e.target.value)}
                placeholder="https://www.kompania.de"
                className="w-full px-4 py-3 rounded-xl border border-slate-300 bg-white text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-teal-500 transition-all"
              />
            </div>
          </div>
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 sm:p-8">
          <div className="flex items-center gap-3 mb-6">
            <div className="p-2.5 bg-teal-50 rounded-xl">
              <User className="h-5 w-5 text-teal-600" />
            </div>
            <h2 className="text-lg font-bold text-slate-800">{adminLabel}</h2>
          </div>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">
                {t('auth.adminName')} *
              </label>
              <div className="relative">
                <User className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                <input
                  type="text"
                  value={form.adminName}
                  onChange={(e) => updateForm('adminName', e.target.value)}
                  placeholder={t('auth.adminNamePlaceholder')}
                  className="w-full pl-11 pr-4 py-3 rounded-xl border border-slate-300 bg-white text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-teal-500 transition-all"
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">
                {t('common.password')} *
              </label>
              <div className="relative">
                <Lock className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={form.adminPassword}
                  onChange={(e) => updateForm('adminPassword', e.target.value)}
                  placeholder={t('auth.minChars')}
                  autoCapitalize="none"
                  autoCorrect="off"
                  autoComplete="new-password"
                  className="w-full pl-11 pr-12 py-3 text-base sm:text-sm rounded-xl border border-slate-300 bg-white text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-teal-500 transition-all"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">
                {t('common.confirmPassword')} *
              </label>
              <div className="relative">
                <Lock className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={form.confirmPassword}
                  onChange={(e) => updateForm('confirmPassword', e.target.value)}
                  placeholder={t('auth.repeatPassword')}
                  autoCapitalize="none"
                  autoCorrect="off"
                  autoComplete="new-password"
                  className="w-full pl-11 pr-4 py-3 text-base sm:text-sm rounded-xl border border-slate-300 bg-white text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-teal-500 transition-all"
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      {showLegalSection && (
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 sm:p-8">
          <div className="flex items-center gap-3 mb-6">
            <div className="p-2.5 bg-amber-50 rounded-xl">
              <Shield className="h-5 w-5 text-amber-600" />
            </div>
            <div className="flex-1">
              <h2 className="text-lg font-bold text-slate-800">Informacione Ligjore dhe Tatimore</h2>
              <p className="text-sm text-slate-500 mt-0.5">
                {location.country
                  ? `${location.country.flag_emoji} Fushat e kërkuara për ${location.country.name}`
                  : 'Zgjidh shtetin për të parë fushat e kërkuara'}
              </p>
            </div>
          </div>
          {!location.country ? (
            <div className="p-6 rounded-xl bg-slate-50 border border-dashed border-slate-300 text-center">
              <p className="text-sm text-slate-500">
                Zgjidh shtetin më lart për të shfaqur fushat e duhura ligjore dhe tatimore për juridiksionin tuaj.
              </p>
            </div>
          ) : (
            <>
              <div className="grid md:grid-cols-2 gap-4">
                {legalFields.map((spec) => (
                  <div key={spec.key} className={legalFields.length % 2 === 1 && spec === legalFields[legalFields.length - 1] ? 'md:col-span-2' : ''}>
                    <label className="block text-sm font-medium text-slate-700 mb-1.5">
                      {spec.label}
                      {spec.required && <span className="text-amber-600 ml-1">*</span>}
                    </label>
                    <input
                      type="text"
                      value={form[spec.key] || ''}
                      onChange={(e) => updateForm(spec.key, e.target.value)}
                      placeholder={spec.placeholder ?? ''}
                      className="w-full px-4 py-3 rounded-xl border border-slate-300 bg-white text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-teal-500 transition-all"
                    />
                    {spec.hint && <p className="mt-1 text-xs text-slate-400">{spec.hint}</p>}
                  </div>
                ))}
                {hasLegalForm && legalFormSpec && (
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1.5">
                      {legalFormSpec.label}
                      {legalFormSpec.required && <span className="text-amber-600 ml-1">*</span>}
                    </label>
                    <select
                      value={form.legalForm}
                      onChange={(e) => updateForm('legalForm', e.target.value)}
                      className="w-full px-4 py-3 rounded-xl border border-slate-300 bg-white text-slate-800 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-teal-500 transition-all"
                    >
                      <option value="">Zgjidh formën ligjore</option>
                      {profile.legalForms.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </div>
              {profile.note && (
                <div className="mt-4 p-4 rounded-xl bg-amber-50 border border-amber-200">
                  <p className="text-sm text-amber-700">
                    <strong>Shënim:</strong> {profile.note}
                  </p>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

function StepPlan({
  plans,
  plansLoading,
  selectedPlan,
  setSelectedPlan,
  businessType,
  accountingAddonPlan,
  t,
}: {
  plans: SubscriptionPlan[];
  plansLoading: boolean;
  selectedPlan: string;
  setSelectedPlan: (v: string) => void;
  businessType: BusinessType;
  accountingAddonPlan: SubscriptionPlan | null | undefined;
  t: (key: string) => string;
}) {
  if (plansLoading) {
    return (
      <div className="flex items-center justify-center h-48">
        <Loader2 className="h-8 w-8 animate-spin text-teal-600" />
      </div>
    );
  }

  const selected = plans.find((p) => p.name === selectedPlan);
  const addonPrice = accountingAddonPlan?.price_addon_monthly ?? 0;
  const showPackageTotal = businessType === 'both' && selected && Number(selected.price_monthly) > 0;

  return (
    <div>
      <div className="text-center mb-8">
        <h2 className="text-2xl font-bold text-slate-800">{t('auth.choosePlan')}</h2>
        <p className="mt-2 text-slate-500">
          {businessType === 'both'
            ? 'Zgjidhni planin e logjistikes - Kontabiliteti perfshihet automatikisht'
            : t('auth.changePlanAnytime')}
        </p>
      </div>

      <div className="grid md:grid-cols-3 gap-6">
        {plans.map((plan) => {
          const IconComp = planIcons[plan.name] || Star;
          const isSelected = selectedPlan === plan.name;
          const isPopular = plan.name === 'standard' || plan.name === 'acc_standard';

          return (
            <button
              key={plan.id}
              onClick={() => setSelectedPlan(plan.name)}
              className={`relative text-left rounded-2xl p-6 transition-all duration-300 ${
                isSelected
                  ? 'ring-2 ring-teal-500 bg-teal-50/50 shadow-lg'
                  : 'bg-white border border-slate-200 hover:border-teal-300 hover:shadow-md'
              }`}
            >
              {isPopular && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                  <span className="bg-teal-500 text-white text-xs font-bold px-3 py-1 rounded-full">
                    {t('common.recommended')}
                  </span>
                </div>
              )}

              <div className="flex items-center justify-between mb-4">
                <div className={`p-2.5 rounded-xl ${isSelected ? 'bg-teal-100' : 'bg-slate-100'}`}>
                  <IconComp className={`h-5 w-5 ${isSelected ? 'text-teal-600' : 'text-slate-500'}`} />
                </div>
                <div
                  className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all ${
                    isSelected ? 'border-teal-500 bg-teal-500' : 'border-slate-300'
                  }`}
                >
                  {isSelected && <Check className="w-3 h-3 text-white" />}
                </div>
              </div>

              <h3 className="text-lg font-bold text-slate-800">{plan.display_name}</h3>
              <p className="text-sm text-slate-500 mt-1">{plan.description}</p>

              <div className="mt-4 mb-5">
                <span className="text-3xl font-extrabold text-slate-900">
                  {plan.price_monthly === 0 ? t('common.free') : `${plan.price_monthly}\u20AC`}
                </span>
                {plan.price_monthly > 0 && (
                  <span className="text-sm text-slate-500">/{t('common.month')}</span>
                )}
              </div>

              <ul className="space-y-2">
                {(plan.features as string[]).map((feature) => (
                  <li key={feature} className="flex items-start gap-2">
                    <Check className="h-4 w-4 text-teal-500 mt-0.5 flex-shrink-0" />
                    <span className="text-sm text-slate-600">{feature}</span>
                  </li>
                ))}
              </ul>
            </button>
          );
        })}
      </div>

      {showPackageTotal && addonPrice > 0 && (
        <div className="mt-6 bg-gradient-to-r from-teal-50 to-emerald-50 border border-teal-200 rounded-2xl p-5">
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div>
              <h3 className="text-sm font-bold text-teal-800 mb-1">Paketa e Plote: Logjistike + Kontabilitet</h3>
              <div className="flex items-center gap-3 text-sm text-teal-700">
                <span>{selected.display_name}: {selected.price_monthly}&euro;</span>
                <span className="text-teal-400">+</span>
                <span>Kontabilitet: {addonPrice}&euro;</span>
              </div>
            </div>
            <div className="text-right">
              <p className="text-xs text-teal-600 font-medium">Totali mujor</p>
              <p className="text-2xl font-extrabold text-teal-900">
                {(Number(selected.price_monthly) + addonPrice).toFixed(2)}&euro;
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function StepPayment({ currentPlan, t }: { currentPlan?: SubscriptionPlan; t: (key: string) => string }) {
  return (
    <div className="max-w-lg mx-auto">
      <div className="text-center mb-8">
        <h2 className="text-2xl font-bold text-slate-800">{t('auth.paymentMethod')}</h2>
        <p className="mt-2 text-slate-500">
          {t('auth.plan')}: <span className="font-semibold text-teal-600">{currentPlan?.display_name}</span>
          {' - '}
          <span className="font-bold">{currentPlan?.price_monthly}\u20AC/{t('common.month')}</span>
        </p>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 sm:p-8">
        <div className="space-y-4">
          <div className="w-full flex items-center gap-4 p-4 rounded-xl border-2 border-teal-500 bg-teal-50/50">
            <div className="p-2.5 bg-teal-100 rounded-xl">
              <CreditCard className="h-5 w-5 text-teal-600" />
            </div>
            <div className="text-left flex-1">
              <p className="text-sm font-semibold text-slate-800">{t('auth.securePayment')}</p>
              <p className="text-xs text-slate-500">Visa, Mastercard, Amex, SEPA, PayPal</p>
            </div>
            <div className="w-5 h-5 rounded-full border-2 border-teal-500 bg-teal-500 flex items-center justify-center">
              <Check className="w-3 h-3 text-white" />
            </div>
          </div>
        </div>

        <div className="mt-6 p-4 rounded-xl bg-teal-50 border border-teal-200">
          <div className="flex items-start gap-3">
            <Shield className="w-5 h-5 text-teal-600 flex-shrink-0 mt-0.5" />
            <p className="text-sm text-teal-700">
              {t('auth.stripeRedirectNotice')}
            </p>
          </div>
        </div>

        <div className="mt-6 pt-6 border-t border-slate-100">
          <div className="flex items-center justify-between text-sm">
            <span className="text-slate-500">{t('auth.plan')}</span>
            <span className="font-medium text-slate-800">{currentPlan?.display_name}</span>
          </div>
          <div className="flex items-center justify-between text-sm mt-2">
            <span className="text-slate-500">{t('auth.monthlyPrice')}</span>
            <span className="font-bold text-slate-900">{currentPlan?.price_monthly}\u20AC</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function StepSuccess({
  adminEmail,
  navigate,
  t,
}: {
  adminEmail: string;
  navigate: (path: string) => void;
  t: (key: string) => string;
}) {
  return (
    <div className="max-w-lg mx-auto text-center">
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-8 sm:p-12">
        <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-teal-100 mb-6">
          <CheckCircle className="h-6 w-6 text-teal-600" />
        </div>

        <h2 className="text-2xl font-bold text-slate-800">{t('auth.welcomeTitle')}</h2>
        <p className="mt-3 text-slate-500 leading-relaxed">
          {t('auth.welcomeMessage')}{' '}
          <span className="font-medium text-slate-700">{adminEmail}</span>.
        </p>

        <div className="mt-8 p-4 rounded-xl bg-teal-50 border border-teal-200">
          <p className="text-sm text-teal-700">
            {t('auth.canLoginNow')}
          </p>
        </div>

        <button
          onClick={() => navigate('/login')}
          className="mt-8 inline-flex items-center gap-2 px-10 py-4 rounded-xl bg-teal-600 text-white font-semibold text-lg hover:bg-teal-700 transition-all duration-300 shadow-xl shadow-teal-600/25"
        >
          {t('auth.enterPlatform')}
          <ArrowRight className="h-5 w-5" />
        </button>
      </div>
    </div>
  );
}
