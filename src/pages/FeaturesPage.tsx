import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowLeft,
  Package,
  Truck,
  Warehouse,
  ArrowRight,
  Shield,
  Check,
  Receipt,
  Building2,
  Calculator,
  ScanLine,
  Globe2,
  Lock,
  Zap,
  TrendingUp,
  Star,
  MapPin,
  Bell,
  Database,
  Cloud,
  GitBranch,
  Layers,
  CheckCircle2,
  Apple,
  Award,
  Heart,
  type LucideIcon,
} from 'lucide-react';
import { useTranslation } from '../i18n';
import { usePlatformSettings } from '../hooks/usePlatformSettings';
import {
  fetchActivePlans,
  getPlanIcon as getPlanIconShared,
  pickPopularPlan,
} from '../lib/subscriptionPlans';
import type { ProductType, SubscriptionPlan } from '../types';

interface PricingPlan {
  id: string;
  name: string;
  slug: string;
  price: number;
  period: string;
  description: string;
  icon: LucideIcon;
  features: string[];
  popular: boolean;
  cta: string;
  productType: ProductType;
}

const PRODUCT_TAB_ICONS: Record<ProductType, LucideIcon> = {
  logistics: Truck,
  accounting: Calculator,
};

const IMAGES = {
  warehouse: 'https://images.unsplash.com/photo-1553413077-190dd305871c?auto=format&fit=crop&w=1200&q=80',
  truck: 'https://images.unsplash.com/photo-1601584115197-04ecc0da31d5?auto=format&fit=crop&w=1200&q=80',
  office: 'https://images.unsplash.com/photo-1554224155-6726b3ff858f?auto=format&fit=crop&w=1200&q=80',
};

const CORE_MODULES = [
  { key: 'logistics', icon: Truck, color: 'teal', titleKey: 'home.v3.modules.logistics.title', descKey: 'home.v3.modules.logistics.desc', features: ['home.v3.modules.logistics.f1', 'home.v3.modules.logistics.f2', 'home.v3.modules.logistics.f3', 'home.v3.modules.logistics.f4'] },
  { key: 'warehouse', icon: Warehouse, color: 'emerald', titleKey: 'home.v3.modules.warehouse.title', descKey: 'home.v3.modules.warehouse.desc', features: ['home.v3.modules.warehouse.f1', 'home.v3.modules.warehouse.f2', 'home.v3.modules.warehouse.f3', 'home.v3.modules.warehouse.f4'] },
  { key: 'accounting', icon: Receipt, color: 'sky', titleKey: 'home.v3.modules.accounting.title', descKey: 'home.v3.modules.accounting.desc', features: ['home.v3.modules.accounting.f1', 'home.v3.modules.accounting.f2', 'home.v3.modules.accounting.f3', 'home.v3.modules.accounting.f4'] },
  { key: 'fleet', icon: MapPin, color: 'orange', titleKey: 'home.v3.modules.fleet.title', descKey: 'home.v3.modules.fleet.desc', features: ['home.v3.modules.fleet.f1', 'home.v3.modules.fleet.f2', 'home.v3.modules.fleet.f3', 'home.v3.modules.fleet.f4'] },
  { key: 'documents', icon: ScanLine, color: 'cyan', titleKey: 'home.v3.modules.documents.title', descKey: 'home.v3.modules.documents.desc', features: ['home.v3.modules.documents.f1', 'home.v3.modules.documents.f2', 'home.v3.modules.documents.f3', 'home.v3.modules.documents.f4'] },
  { key: 'reports', icon: TrendingUp, color: 'rose', titleKey: 'home.v3.modules.reports.title', descKey: 'home.v3.modules.reports.desc', features: ['home.v3.modules.reports.f1', 'home.v3.modules.reports.f2', 'home.v3.modules.reports.f3', 'home.v3.modules.reports.f4'] },
] as const;

const ROLE_TABS = [
  { key: 'company', icon: Building2, titleKey: 'home.v3.roles.company.title' },
  { key: 'accounting', icon: Calculator, titleKey: 'home.v3.roles.accounting.title' },
  { key: 'depot', icon: Warehouse, titleKey: 'home.v3.roles.depot.title' },
  { key: 'driver', icon: Truck, titleKey: 'home.v3.roles.driver.title' },
] as const;

const TRUST_BADGES = [
  { icon: Shield, key: 'rls' },
  { icon: Lock, key: 'gdpr' },
  { icon: Database, key: 'audit' },
  { icon: Cloud, key: 'backup' },
] as const;

const STANDARDS = [
  { icon: Award, key: 'gobd' },
  { icon: Lock, key: 'gdpr' },
  { icon: Globe2, key: 'eu' },
  { icon: Heart, key: 'multilang' },
] as const;

const COLOR_CLASSES: Record<string, { bg: string; text: string; hover: string }> = {
  teal: { bg: 'bg-teal-50', text: 'text-teal-600', hover: 'hover:border-teal-300' },
  emerald: { bg: 'bg-emerald-50', text: 'text-emerald-600', hover: 'hover:border-emerald-300' },
  sky: { bg: 'bg-sky-50', text: 'text-sky-600', hover: 'hover:border-sky-300' },
  orange: { bg: 'bg-orange-50', text: 'text-orange-600', hover: 'hover:border-orange-300' },
  cyan: { bg: 'bg-cyan-50', text: 'text-cyan-600', hover: 'hover:border-cyan-300' },
  rose: { bg: 'bg-rose-50', text: 'text-rose-600', hover: 'hover:border-rose-300' },
};

export default function FeaturesPage() {
  const { t } = useTranslation();
  const { settings: platformSettings } = usePlatformSettings();
  const [activeRoleTab, setActiveRoleTab] = useState<'company' | 'accounting' | 'depot' | 'driver'>('company');
  const [pricingTab, setPricingTab] = useState<ProductType>('logistics');
  const [logisticsPlans, setLogisticsPlans] = useState<PricingPlan[]>([]);
  const [accountingPlans, setAccountingPlans] = useState<PricingPlan[]>([]);
  const [pricingLoading, setPricingLoading] = useState(true);

  const platformName = platformSettings.name || 'MM Logistic';

  useEffect(() => {
    let cancelled = false;

    const getPlanCta = (plan: SubscriptionPlan) => {
      if (Number(plan.price_monthly) === 0 || plan.trial_days > 0) return t('home.pricingFreeCta');
      if (Number(plan.price_monthly) >= 50) return t('home.pricingPremiumCta');
      return t('home.pricingStandardCta');
    };

    const toPricingPlan = (plan: SubscriptionPlan, popularId: string | null): PricingPlan => ({
      id: plan.id,
      name: plan.display_name || plan.name,
      slug: plan.name,
      price: Number(plan.price_monthly),
      period: t('home.v2.plans.periodMonth'),
      description: plan.description || '',
      icon: getPlanIconShared(plan.name),
      features: Array.isArray(plan.features) ? (plan.features as string[]).slice(0, 6) : [],
      popular: plan.id === popularId,
      cta: getPlanCta(plan),
      productType: plan.product_type,
    });

    async function loadPlans() {
      setPricingLoading(true);
      try {
        const all = await fetchActivePlans();
        if (cancelled) return;
        const logistics = all.filter((p) => p.product_type === 'logistics');
        const accounting = all.filter((p) => p.product_type === 'accounting');
        const logPop = pickPopularPlan(logistics);
        const accPop = pickPopularPlan(accounting);
        setLogisticsPlans(logistics.map((p) => toPricingPlan(p, logPop?.id ?? null)));
        setAccountingPlans(accounting.map((p) => toPricingPlan(p, accPop?.id ?? null)));
      } catch {
        // silently fail
      } finally {
        if (!cancelled) setPricingLoading(false);
      }
    }
    loadPlans();
    return () => { cancelled = true; };
  }, [t]);

  const activePlans = pricingTab === 'logistics' ? logisticsPlans : accountingPlans;

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      {/* Back button header */}
      <div className="sticky top-0 z-50 bg-white border-b border-slate-200 px-4 py-3">
        <div className="max-w-7xl mx-auto flex items-center gap-4">
          <Link to="/" className="inline-flex items-center gap-2 px-3 py-2 text-sm font-medium text-slate-700 bg-slate-100 rounded-lg hover:bg-slate-200 transition-colors">
            <ArrowLeft className="w-4 h-4" />
            {t('common.back')}
          </Link>
          <span className="text-sm font-semibold text-slate-900">{t('home.minimal.footerFeatures')}</span>
        </div>
      </div>

      {/* Trust badges */}
      <section className="py-12 bg-white border-b border-slate-100">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <p className="text-sm font-semibold text-teal-700 uppercase tracking-wider mb-6">{t('home.v3.trust.label')}</p>
          <div className="flex flex-wrap justify-center gap-6">
            {STANDARDS.map((s) => (
              <div key={s.key} className="flex items-center gap-2 text-sm text-slate-600 font-medium">
                <s.icon className="h-5 w-5 text-teal-600" />
                {t(`home.v3.trust.${s.key}`)}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Platform Stats */}
      <section className="py-16 bg-slate-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-2xl sm:text-3xl font-extrabold text-slate-900">{t('home.v3.stats.title')}</h2>
          <div className="mt-10 grid grid-cols-2 sm:grid-cols-4 gap-6">
            {[
              { value: '6', label: t('home.v3.stats.modules') },
              { value: '5', label: t('home.v3.stats.roles') },
              { value: '4', label: t('home.v3.stats.languages') },
              { value: '99.9%', label: t('home.v3.stats.uptime') },
            ].map((s, i) => (
              <div key={i} className="p-6 rounded-2xl bg-white border border-slate-200">
                <div className="text-3xl font-black text-teal-600">{s.value}</div>
                <div className="mt-2 text-sm text-slate-600">{s.label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Showcases */}
      <section className="py-16 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-20">
          {/* Showcase 1 */}
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            <img src={IMAGES.warehouse} alt="" className="rounded-2xl shadow-lg object-cover h-64 lg:h-80 w-full" />
            <div>
              <span className="text-xs font-bold uppercase tracking-wider text-teal-600">{t('home.v3.showcase1.tag')}</span>
              <h3 className="mt-2 text-2xl font-bold text-slate-900">{t('home.v3.showcase1.title')}</h3>
              <p className="mt-3 text-slate-600 leading-relaxed">{t('home.v3.showcase1.body')}</p>
              <ul className="mt-4 space-y-2">
                {['b1', 'b2', 'b3', 'b4'].map((k) => (
                  <li key={k} className="flex items-start gap-2 text-sm text-slate-700">
                    <Check className="h-4 w-4 text-teal-500 mt-0.5 shrink-0" />
                    {t(`home.v3.showcase1.${k}`)}
                  </li>
                ))}
              </ul>
            </div>
          </div>

          {/* Showcase 2 */}
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            <div className="order-2 lg:order-1">
              <span className="text-xs font-bold uppercase tracking-wider text-sky-600">{t('home.v3.showcase2.tag')}</span>
              <h3 className="mt-2 text-2xl font-bold text-slate-900">{t('home.v3.showcase2.title')}</h3>
              <p className="mt-3 text-slate-600 leading-relaxed">{t('home.v3.showcase2.body')}</p>
              <ul className="mt-4 space-y-2">
                {['b1', 'b2', 'b3', 'b4'].map((k) => (
                  <li key={k} className="flex items-start gap-2 text-sm text-slate-700">
                    <Check className="h-4 w-4 text-sky-500 mt-0.5 shrink-0" />
                    {t(`home.v3.showcase2.${k}`)}
                  </li>
                ))}
              </ul>
            </div>
            <img src={IMAGES.office} alt="" className="rounded-2xl shadow-lg object-cover h-64 lg:h-80 w-full order-1 lg:order-2" />
          </div>

          {/* Showcase 3 */}
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            <img src={IMAGES.truck} alt="" className="rounded-2xl shadow-lg object-cover h-64 lg:h-80 w-full" />
            <div>
              <span className="text-xs font-bold uppercase tracking-wider text-orange-600">{t('home.v3.showcase3.tag')}</span>
              <h3 className="mt-2 text-2xl font-bold text-slate-900">{t('home.v3.showcase3.title')}</h3>
              <p className="mt-3 text-slate-600 leading-relaxed">{t('home.v3.showcase3.body')}</p>
              <ul className="mt-4 space-y-2">
                {['b1', 'b2', 'b3', 'b4'].map((k) => (
                  <li key={k} className="flex items-start gap-2 text-sm text-slate-700">
                    <Check className="h-4 w-4 text-orange-500 mt-0.5 shrink-0" />
                    {t(`home.v3.showcase3.${k}`)}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* Modules Grid */}
      <section id="modules" className="py-16 bg-slate-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <h2 className="text-2xl sm:text-3xl font-extrabold text-slate-900">
              {t('home.v3.modules.title')} <span className="text-teal-600">{t('home.v3.modules.titleHighlight')}</span>
            </h2>
            <p className="mt-3 text-slate-600 max-w-2xl mx-auto">{t('home.v3.modules.subtitle')}</p>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {CORE_MODULES.map((mod) => {
              const cc = COLOR_CLASSES[mod.color] || COLOR_CLASSES.teal;
              return (
                <div key={mod.key} className={`rounded-2xl bg-white border border-slate-200 p-6 transition-all hover:shadow-md ${cc.hover}`}>
                  <div className={`inline-flex p-3 rounded-xl ${cc.bg}`}>
                    <mod.icon className={`h-6 w-6 ${cc.text}`} />
                  </div>
                  <h3 className="mt-4 text-lg font-bold text-slate-900">{t(mod.titleKey)}</h3>
                  <p className="mt-2 text-sm text-slate-600">{t(mod.descKey)}</p>
                  <ul className="mt-3 space-y-1.5">
                    {mod.features.map((fk) => (
                      <li key={fk} className="flex items-center gap-2 text-xs text-slate-600">
                        <Check className={`h-3.5 w-3.5 ${cc.text} shrink-0`} />
                        {t(fk)}
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Roles */}
      <section id="roles" className="py-16 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-10">
            <h2 className="text-2xl sm:text-3xl font-extrabold text-slate-900">
              {t('home.v3.roles.title')} <span className="text-teal-600">{t('home.v3.roles.titleHighlight')}</span>
            </h2>
            <p className="mt-3 text-slate-600 max-w-2xl mx-auto">{t('home.v3.roles.subtitle')}</p>
          </div>
          <div className="flex flex-wrap justify-center gap-2 mb-8">
            {ROLE_TABS.map((tab) => (
              <button
                key={tab.key}
                onClick={() => setActiveRoleTab(tab.key as any)}
                className={`inline-flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-semibold transition-all ${
                  activeRoleTab === tab.key
                    ? 'bg-teal-600 text-white shadow-md'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                <tab.icon className="h-4 w-4" />
                {t(tab.titleKey)}
              </button>
            ))}
          </div>
          <div className="max-w-3xl mx-auto bg-slate-50 rounded-2xl border border-slate-200 p-8">
            <h3 className="text-xl font-bold text-slate-900">{t(`home.v3.roles.${activeRoleTab}.headline`)}</h3>
            <p className="mt-3 text-slate-600 leading-relaxed">{t(`home.v3.roles.${activeRoleTab}.body`)}</p>
            <ul className="mt-5 space-y-2">
              {['b1', 'b2', 'b3', 'b4', 'b5'].map((k) => (
                <li key={k} className="flex items-start gap-2 text-sm text-slate-700">
                  <CheckCircle2 className="h-4 w-4 text-teal-500 mt-0.5 shrink-0" />
                  {t(`home.v3.roles.${activeRoleTab}.${k}`)}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {/* Security */}
      <section id="security" className="py-16 bg-slate-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-10">
            <h2 className="text-2xl sm:text-3xl font-extrabold text-slate-900">{t('home.v3.security.title')}</h2>
            <p className="mt-3 text-slate-600 max-w-2xl mx-auto">{t('home.v3.security.subtitle')}</p>
          </div>
          <div className="grid sm:grid-cols-2 gap-6 max-w-4xl mx-auto">
            <div className="space-y-4">
              {TRUST_BADGES.map((b) => (
                <div key={b.key} className="flex items-center gap-3 p-4 rounded-xl bg-white border border-slate-200">
                  <div className="p-2 rounded-lg bg-teal-50">
                    <b.icon className="h-5 w-5 text-teal-600" />
                  </div>
                  <div>
                    <div className="text-sm font-semibold text-slate-900">{t(`home.v3.security.${b.key}.title`)}</div>
                    <div className="text-xs text-slate-500">{t(`home.v3.security.${b.key}.desc`)}</div>
                  </div>
                </div>
              ))}
            </div>
            <div className="space-y-4">
              {[
                { icon: Award, key: 'compliance1' },
                { icon: Layers, key: 'compliance2' },
                { icon: Globe2, key: 'compliance3' },
                { icon: GitBranch, key: 'compliance4' },
              ].map((s) => (
                <div key={s.key} className="flex items-center gap-3 p-4 rounded-xl bg-white border border-slate-200">
                  <div className="p-2 rounded-lg bg-emerald-50">
                    <s.icon className="h-5 w-5 text-emerald-600" />
                  </div>
                  <div>
                    <div className="text-sm font-semibold text-slate-900">{t(`home.v3.security.${s.key}.title`)}</div>
                    <div className="text-xs text-slate-500">{t(`home.v3.security.${s.key}.desc`)}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Mobile App */}
      <section id="mobile-app" className="py-16 bg-slate-900 text-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-3xl mx-auto text-center">
            <span className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/10 border border-white/15 text-sm font-medium">
              iOS &bull; Android &bull; PWA
            </span>
            <h2 className="mt-6 text-2xl sm:text-3xl font-extrabold">{t('home.v3.mobileApp.title1')} {t('home.v3.mobileApp.title2')}</h2>
            <p className="mt-4 text-slate-400 leading-relaxed">{t('home.v3.mobileApp.subtitle')}</p>
            <div className="mt-8 grid grid-cols-2 sm:grid-cols-4 gap-4">
              {[
                { icon: Zap, key: 'f1' },
                { icon: ScanLine, key: 'f2' },
                { icon: Bell, key: 'f3' },
                { icon: MapPin, key: 'f4' },
              ].map((f) => (
                <div key={f.key} className="p-4 rounded-xl bg-white/5 border border-white/10">
                  <f.icon className="h-5 w-5 text-teal-400 mx-auto" />
                  <div className="mt-2 text-xs text-slate-300">{t(`home.v3.mobileApp.${f.key}`)}</div>
                </div>
              ))}
            </div>
            <div className="mt-8 flex justify-center gap-3">
              <a href="#" className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-white/10 border border-white/20 hover:bg-white/20 transition text-sm text-white">
                <Apple className="h-4 w-4" /> App Store
              </a>
              <a href="#" className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-white/10 border border-white/20 hover:bg-white/20 transition text-sm text-white">
                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor"><path d="M3.609 1.814L13.792 12 3.61 22.186a.996.996 0 01-.61-.92V2.734a1 1 0 01.609-.92zm10.89 10.893l2.302 2.302-10.937 6.333 8.635-8.635zm3.199-3.198l2.807 1.626a1 1 0 010 1.73l-2.808 1.626L15.206 12l2.492-2.491zM5.864 2.658L16.8 8.99l-2.302 2.302-8.634-8.634z"/></svg>
                Google Play
              </a>
            </div>
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="py-16 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-10">
            <h2 className="text-2xl sm:text-3xl font-extrabold text-slate-900">{t('home.v3.pricing.title')}</h2>
            <p className="mt-3 text-slate-600">{t('home.v3.pricing.subtitle')}</p>
          </div>

          <div className="flex justify-center gap-2 mb-8">
            {(['logistics', 'accounting'] as ProductType[]).map((pt) => {
              const Icon = PRODUCT_TAB_ICONS[pt];
              return (
                <button
                  key={pt}
                  onClick={() => setPricingTab(pt)}
                  className={`inline-flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-semibold transition-all ${
                    pricingTab === pt ? 'bg-teal-600 text-white shadow-md' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  <Icon className="h-4 w-4" />
                  {t(`home.v3.pricing.tab_${pt}`)}
                </button>
              );
            })}
          </div>

          {pricingLoading ? (
            <div className="text-center text-slate-400 py-12">Loading...</div>
          ) : activePlans.length === 0 ? (
            <div className="text-center text-slate-400 py-12">{t('home.v3.pricing.empty')}</div>
          ) : (
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6 max-w-5xl mx-auto">
              {activePlans.map((plan) => (
                <div key={plan.id} className={`relative rounded-2xl bg-white border-2 p-6 transition-all hover:shadow-lg ${plan.popular ? 'border-teal-500 shadow-md' : 'border-slate-200'}`}>
                  {plan.popular && (
                    <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full bg-teal-600 text-white text-xs font-semibold flex items-center gap-1">
                      <Star className="h-3 w-3" /> {t('home.v3.pricing.popular')}
                    </div>
                  )}
                  <div className="p-3 rounded-xl bg-teal-50 inline-flex">
                    <plan.icon className="h-6 w-6 text-teal-600" />
                  </div>
                  <h3 className="mt-4 text-lg font-bold text-slate-900">{plan.name}</h3>
                  <p className="mt-1 text-sm text-slate-500">{plan.description}</p>
                  <div className="mt-4">
                    <span className="text-3xl font-black text-slate-900">{plan.price === 0 ? t('home.v3.pricing.free') : `€${plan.price}`}</span>
                    {plan.price > 0 && <span className="text-sm text-slate-500 ml-1">{plan.period}</span>}
                  </div>
                  <ul className="mt-4 space-y-2">
                    {plan.features.map((f, i) => (
                      <li key={i} className="flex items-start gap-2 text-sm text-slate-600">
                        <Check className="h-4 w-4 text-teal-500 mt-0.5 shrink-0" /> {f}
                      </li>
                    ))}
                  </ul>
                  <Link
                    to="/register"
                    className={`mt-6 w-full inline-flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-sm font-semibold transition-all ${
                      plan.popular
                        ? 'bg-teal-600 text-white hover:bg-teal-700 shadow-sm'
                        : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                    }`}
                  >
                    {plan.cta} <ArrowRight className="h-4 w-4" />
                  </Link>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* CTA */}
      <section className="py-12 bg-teal-600 text-white text-center">
        <div className="max-w-3xl mx-auto px-4">
          <h2 className="text-2xl sm:text-3xl font-extrabold">{t('home.v3.cta.title')}</h2>
          <div className="mt-6 flex flex-col sm:flex-row gap-3 justify-center">
            <Link to="/register" className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-white text-teal-700 font-semibold hover:bg-teal-50 transition-all">
              {t('home.v3.cta.primary')} <ArrowRight className="h-4 w-4" />
            </Link>
            <Link to="/login" className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl border border-white/40 hover:bg-white/10 font-semibold transition-all">
              {t('home.v3.cta.secondary')}
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
