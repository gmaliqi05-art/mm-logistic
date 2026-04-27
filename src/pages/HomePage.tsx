import { useState, useEffect, useRef, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Package,
  Truck,
  BarChart3,
  MessageSquare,
  Warehouse,
  ArrowRight,
  Menu,
  X,
  Shield,
  ChevronUp,
  Check,
  Boxes,
  FileText,
  Receipt,
  Users,
  LineChart,
  Sparkles,
  Workflow,
  LogIn,
  Building2,
  PlayCircle,
  CircleDot,
  Briefcase,
  Calculator,
  type LucideIcon,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useTranslation } from '../i18n';
import LanguageSwitcher from '../components/LanguageSwitcher';
import { usePlatformSettings } from '../hooks/usePlatformSettings';
import {
  fetchActivePlans,
  getPlanIcon as getPlanIconShared,
  pickPopularPlan,
} from '../lib/subscriptionPlans';
import type { ProductType, SubscriptionPlan } from '../types';

interface BannerItem {
  id: string;
  section_type: string;
  title: string;
  subtitle: string;
  image_url: string;
  link_url: string;
  link_text: string;
}

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

const MODULE_KEYS = ['logistics', 'warehouse', 'inventory', 'accounting', 'documents', 'chat', 'reports', 'users'] as const;
const MODULE_ICONS: Record<(typeof MODULE_KEYS)[number], LucideIcon> = {
  logistics: Truck,
  warehouse: Warehouse,
  inventory: Boxes,
  accounting: Receipt,
  documents: FileText,
  chat: MessageSquare,
  reports: LineChart,
  users: Users,
};

const SOLUTION_KEYS = ['logistics', 'accounting', 'warehouse'] as const;
const SOLUTION_ICONS: Record<(typeof SOLUTION_KEYS)[number], LucideIcon> = {
  logistics: Truck,
  accounting: Receipt,
  warehouse: Warehouse,
};

const DIFFERENTIATOR_KEYS = ['allInOne', 'secure', 'flexible', 'teams'] as const;
const DIFFERENTIATOR_ICONS: Record<(typeof DIFFERENTIATOR_KEYS)[number], LucideIcon> = {
  allInOne: Sparkles,
  secure: Shield,
  flexible: Workflow,
  teams: Building2,
};

const PRODUCT_TAB_ICONS: Record<ProductType, LucideIcon> = {
  logistics: Briefcase,
  accounting: Calculator,
};

export default function HomePage() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [showScrollTop, setShowScrollTop] = useState(false);
  const [banners, setBanners] = useState<BannerItem[]>([]);
  const [logisticsPlans, setLogisticsPlans] = useState<PricingPlan[]>([]);
  const [accountingPlans, setAccountingPlans] = useState<PricingPlan[]>([]);
  const [pricingTab, setPricingTab] = useState<ProductType>('logistics');
  const [pricingLoading, setPricingLoading] = useState(true);
  const [pricingError, setPricingError] = useState<string | null>(null);
  const clickTimestamps = useRef<number[]>([]);
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { settings: platformSettings } = usePlatformSettings();

const stats = [
    { value: '500+', label: t('home.v2.stats.companies') },
    { value: '2,000+', label: t('home.v2.stats.users') },
    { value: '50,000+', label: t('home.v2.stats.transactions') },
    { value: '99.9%', label: t('home.v2.stats.uptime') },
  ];

  const handleSecretClick = useCallback(() => {
    const now = Date.now();
    clickTimestamps.current.push(now);
    clickTimestamps.current = clickTimestamps.current.filter((x) => now - x < 2000);
    if (clickTimestamps.current.length >= 3) {
      clickTimestamps.current = [];
      navigate('/sa-access');
    }
  }, [navigate]);

  useEffect(() => {
    async function loadBanners() {
      const { data } = await supabase
        .from('homepage_content')
        .select('id, section_type, title, subtitle, image_url, link_url, link_text')
        .eq('is_active', true)
        .in('section_type', ['banner', 'ad'])
        .order('sort_order');
      if (data && data.length > 0) setBanners(data);
    }
    loadBanners();
  }, []);

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
      period: plan.trial_days > 0 ? `${plan.trial_days} ${t('home.v2.plans.periodDays')}` : t('home.v2.plans.periodMonth'),
      description: plan.description || '',
      icon: getPlanIconShared(plan),
      features: Array.isArray(plan.features) ? plan.features : [],
      popular: plan.id === popularId,
      cta: getPlanCta(plan),
      productType: plan.product_type,
    });

    async function loadPricingPlans() {
      try {
        setPricingLoading(true);
        setPricingError(null);
        const [logistics, accounting] = await Promise.all([
          fetchActivePlans('logistics'),
          fetchActivePlans('accounting'),
        ]);
        if (cancelled) return;
        setLogisticsPlans(logistics.map((p) => toPricingPlan(p, pickPopularPlan(logistics))));
        setAccountingPlans(accounting.map((p) => toPricingPlan(p, pickPopularPlan(accounting))));
        if (logistics.length === 0 && accounting.length > 0) setPricingTab('accounting');
      } catch {
        if (!cancelled) setPricingError(t('home.v2.plans.error'));
      } finally {
        if (!cancelled) setPricingLoading(false);
      }
    }
    loadPricingPlans();
    return () => {
      cancelled = true;
    };
  }, [t]);

  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 20);
      setShowScrollTop(window.scrollY > 600);
    };
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const scrollToTop = () => window.scrollTo({ top: 0, behavior: 'smooth' });

  const heroBanner = banners[0];
  const platformName = platformSettings.name || 'Business Suite';

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 scroll-smooth">
      <nav
        className={`fixed top-0 inset-x-0 z-50 transition-all duration-300 ${
          scrolled ? 'bg-white/95 backdrop-blur-md shadow-sm border-b border-slate-100' : 'bg-transparent'
        }`}
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16 lg:h-20">
            <Link to="/" className="flex items-center gap-2.5">
              {platformSettings.logo ? (
                <img
                  src={platformSettings.logo}
                  alt={platformName}
                  onClick={handleSecretClick}
                  className="w-10 h-10 rounded-xl object-contain cursor-pointer"
                />
              ) : (
                <div
                  onClick={handleSecretClick}
                  className={`p-2 rounded-xl transition-all cursor-pointer ${
                    scrolled ? 'bg-teal-600 text-white shadow-sm' : 'bg-white/15 text-white backdrop-blur-sm'
                  }`}
                >
                  <Package className="h-6 w-6" />
                </div>
              )}
              <div className="flex flex-col leading-tight">
                <span
                  className={`text-base font-bold tracking-tight transition-colors ${
                    scrolled ? 'text-slate-900' : 'text-white'
                  }`}
                >
                  {platformName}
                </span>
                <span
                  className={`text-[11px] font-medium tracking-wider uppercase transition-colors ${
                    scrolled ? 'text-slate-400' : 'text-white/70'
                  }`}
                >
                  {t('home.v2.nav.businessSuite')}
                </span>
              </div>
            </Link>

            <div className="hidden lg:flex items-center gap-3">
              <LanguageSwitcher variant="header" />
              <Link
                to="/login"
                className={`inline-flex items-center px-5 py-2.5 rounded-lg text-sm font-semibold transition-all ${
                  scrolled
                    ? 'bg-teal-600 text-white hover:bg-teal-700 shadow-sm shadow-teal-600/30'
                    : 'bg-white/10 hover:bg-white/20 backdrop-blur-sm border border-white/20 text-white'
                }`}
              >
                {t('home.v2.nav.login')}
              </Link>
            </div>

            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className={`lg:hidden p-2 rounded-lg transition-colors ${
                scrolled ? 'text-slate-800 hover:bg-slate-100' : 'text-white hover:bg-white/10'
              }`}
              aria-label="Menu"
            >
              {mobileMenuOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
            </button>
          </div>
        </div>

        {mobileMenuOpen && (
          <div className="lg:hidden bg-white border-t border-slate-100 shadow-xl">
            <div className="px-4 py-4 space-y-1">
              <div className="flex flex-col gap-2">
                <Link
                  to="/login"
                  onClick={() => setMobileMenuOpen(false)}
                  className="px-4 py-3 text-center rounded-lg border border-slate-200 text-sm font-semibold text-slate-700"
                >
                  {t('home.v2.nav.login')}
                </Link>
                <Link
                  to="/register"
                  onClick={() => setMobileMenuOpen(false)}
                  className="px-4 py-3 text-center rounded-lg bg-teal-600 text-white text-sm font-semibold"
                >
                  {t('home.v2.nav.startFree')}
                </Link>
                <div className="pt-2">
                  <LanguageSwitcher variant="default" />
                </div>
              </div>
            </div>
          </div>
        )}
      </nav>

      {/* Hero */}
      <section
        id="platform"
        className="relative pt-32 pb-24 lg:pt-40 lg:pb-32 overflow-hidden bg-gradient-to-br from-slate-900 via-slate-900 to-teal-900 text-white"
      >
        <div className="absolute inset-0 opacity-20 pointer-events-none">
          <div className="absolute top-20 -left-24 w-96 h-96 bg-teal-500 rounded-full blur-3xl" />
          <div className="absolute bottom-0 right-0 w-96 h-96 bg-emerald-500 rounded-full blur-3xl" />
        </div>

        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            <div>
              <span className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/10 border border-white/15 text-sm font-medium backdrop-blur-sm">
                <CircleDot className="h-3.5 w-3.5 text-teal-300 animate-pulse" />
                {t('home.v2.hero.badge')}
              </span>
              <h1 className="mt-6 text-4xl sm:text-5xl lg:text-6xl font-extrabold leading-[1.05] tracking-tight">
                {t('home.v2.hero.title1')}<br />
                <span className="bg-gradient-to-r from-teal-300 to-emerald-300 bg-clip-text text-transparent">
                  {t('home.v2.hero.title2')}
                </span>
              </h1>
              <p className="mt-6 text-lg sm:text-xl text-slate-300 max-w-xl leading-relaxed">
                {t('home.v2.hero.subtitle')}
              </p>

              <div className="mt-10 flex flex-col sm:flex-row gap-3">
                <Link
                  to="/register"
                  className="inline-flex items-center justify-center gap-2 px-7 py-4 rounded-xl bg-teal-500 hover:bg-teal-400 text-white font-semibold shadow-lg shadow-teal-500/30 transition-all hover:scale-[1.02]"
                >
                  {t('home.v2.hero.ctaPrimary')}
                  <ArrowRight className="h-5 w-5" />
                </Link>
                <a
                  href="#modules"
                  className="inline-flex items-center justify-center gap-2 px-7 py-4 rounded-xl border border-white/20 text-white font-semibold hover:bg-white/10 transition-all"
                >
                  <PlayCircle className="h-5 w-5" />
                  {t('home.v2.hero.ctaSecondary')}
                </a>
              </div>

              <div className="mt-10 flex flex-wrap items-center gap-x-6 gap-y-3 text-sm text-slate-300">
                <div className="inline-flex items-center gap-2"><Check className="h-4 w-4 text-teal-300" /> {t('home.v2.hero.perk1')}</div>
                <div className="inline-flex items-center gap-2"><Check className="h-4 w-4 text-teal-300" /> {t('home.v2.hero.perk2')}</div>
                <div className="inline-flex items-center gap-2"><Check className="h-4 w-4 text-teal-300" /> {t('home.v2.hero.perk3')}</div>
              </div>
            </div>

            <div className="relative">
              <div className="relative rounded-3xl bg-white/5 border border-white/10 backdrop-blur-xl p-6 shadow-2xl">
                <div className="flex items-center gap-2 mb-4">
                  <div className="w-3 h-3 rounded-full bg-rose-400/80" />
                  <div className="w-3 h-3 rounded-full bg-amber-400/80" />
                  <div className="w-3 h-3 rounded-full bg-emerald-400/80" />
                  <span className="ml-3 text-xs text-slate-400">dashboard.{platformName.toLowerCase().replace(/\s+/g, '')}.com</span>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  {[
                    { label: t('home.v2.hero.metric1Label'), value: '148', trend: '+12%' },
                    { label: t('home.v2.hero.metric2Label'), value: '32.4k', trend: '+3.4%' },
                    { label: t('home.v2.hero.metric3Label'), value: 'EUR 84k', trend: '+8%' },
                    { label: t('home.v2.hero.metric4Label'), value: '26', trend: '100%' },
                  ].map((m) => (
                    <div key={m.label} className="rounded-2xl bg-slate-900/60 border border-white/5 p-4">
                      <div className="text-xs text-slate-400">{m.label}</div>
                      <div className="mt-1 text-2xl font-bold">{m.value}</div>
                      <div className="mt-1 text-xs text-emerald-300">{m.trend}</div>
                    </div>
                  ))}
                </div>
                <div className="mt-4 rounded-2xl bg-slate-900/60 border border-white/5 p-4">
                  <div className="flex items-center justify-between text-xs text-slate-400">
                    <span>{t('home.v2.hero.weeklyActivity')}</span>
                    <span className="text-teal-300">{t('home.v2.hero.live')}</span>
                  </div>
                  <div className="mt-3 flex items-end gap-1.5 h-24">
                    {[40, 62, 48, 80, 55, 92, 70].map((h, i) => (
                      <div
                        key={i}
                        className="flex-1 rounded-t-md bg-gradient-to-t from-teal-500/70 to-emerald-400/90"
                        style={{ height: `${h}%` }}
                      />
                    ))}
                  </div>
                </div>
              </div>
              <div className="absolute -bottom-6 -left-6 hidden sm:block rounded-2xl bg-white text-slate-800 shadow-xl p-4 w-60">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-xl bg-emerald-100 text-emerald-700">
                    <Check className="h-5 w-5" />
                  </div>
                  <div>
                    <div className="text-xs text-slate-500">{t('home.v2.hero.deliveryConfirmed')}</div>
                    <div className="text-sm font-semibold">#INV-20418</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {heroBanner && (
        <section className="bg-white border-b border-slate-100">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex flex-col sm:flex-row sm:items-center gap-3">
            <span className="inline-flex items-center gap-2 px-2.5 py-1 rounded-full bg-teal-50 text-teal-700 text-xs font-semibold">
              <Sparkles className="h-3.5 w-3.5" /> {t('home.v2.banner.news')}
            </span>
            <div className="flex-1">
              <span className="font-semibold text-slate-800">{heroBanner.title}</span>
              {heroBanner.subtitle && <span className="text-slate-500 ml-2">{heroBanner.subtitle}</span>}
            </div>
            {heroBanner.link_url && heroBanner.link_text && (
              <a
                href={heroBanner.link_url}
                className="inline-flex items-center gap-1 text-sm font-semibold text-teal-600 hover:text-teal-700"
              >
                {heroBanner.link_text}
                <ArrowRight className="h-4 w-4" />
              </a>
            )}
          </div>
        </section>
      )}

      {/* Stats */}
      <section className="py-16 bg-white border-b border-slate-100">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 grid grid-cols-2 lg:grid-cols-4 gap-8">
          {stats.map((s) => (
            <div key={s.label} className="text-center">
              <div className="text-3xl lg:text-4xl font-extrabold text-slate-900">{s.value}</div>
              <div className="mt-1 text-sm text-slate-500 font-medium">{s.label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* Modules */}
      <section id="modules" className="py-24 bg-slate-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-3xl">
            <span className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-teal-50 text-teal-700 text-sm font-medium">
              <Boxes className="h-4 w-4" /> {t('home.v2.modules.badge')}
            </span>
            <h2 className="mt-4 text-3xl sm:text-4xl font-bold text-slate-900">
              {t('home.v2.modules.title')} <span className="text-teal-600">{t('home.v2.modules.titleHighlight')}</span>
            </h2>
            <p className="mt-4 text-lg text-slate-600">{t('home.v2.modules.subtitle')}</p>
          </div>

          <div className="mt-12 grid sm:grid-cols-2 lg:grid-cols-4 gap-5">
            {MODULE_KEYS.map((k) => {
              const Icon = MODULE_ICONS[k];
              return (
                <div
                  key={k}
                  className="group relative rounded-2xl bg-white border border-slate-200 p-6 hover:border-teal-300 hover:shadow-lg transition-all duration-300"
                >
                  <div className="inline-flex p-3 rounded-xl bg-teal-50 text-teal-600 group-hover:bg-teal-600 group-hover:text-white transition-colors">
                    <Icon className="h-6 w-6" />
                  </div>
                  <div className="mt-4">
                    <span className="text-xs font-semibold tracking-wider uppercase text-slate-400">
                      {t(`home.v2.modules.items.${k}.tag`)}
                    </span>
                    <h3 className="mt-1 text-lg font-bold text-slate-900 group-hover:text-teal-700 transition-colors">
                      {t(`home.v2.modules.items.${k}.title`)}
                    </h3>
                    <p className="mt-2 text-sm text-slate-600 leading-relaxed">
                      {t(`home.v2.modules.items.${k}.description`)}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Solutions */}
      <section id="solutions" className="py-24 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-3xl mx-auto">
            <span className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-emerald-50 text-emerald-700 text-sm font-medium">
              <Workflow className="h-4 w-4" /> {t('home.v2.solutions.badge')}
            </span>
            <h2 className="mt-4 text-3xl sm:text-4xl font-bold text-slate-900">
              {t('home.v2.solutions.title')} <span className="text-emerald-600">{t('home.v2.solutions.titleHighlight')}</span>
            </h2>
            <p className="mt-4 text-lg text-slate-600">{t('home.v2.solutions.subtitle')}</p>
          </div>

          <div className="mt-14 grid md:grid-cols-3 gap-6">
            {SOLUTION_KEYS.map((k) => {
              const Icon = SOLUTION_ICONS[k];
              return (
                <div key={k} className="rounded-3xl p-8 bg-slate-50 border border-slate-100 hover:border-teal-200 hover:shadow-lg transition-all">
                  <div className="inline-flex p-3 rounded-2xl bg-white shadow-sm text-teal-600">
                    <Icon className="h-7 w-7" />
                  </div>
                  <h3 className="mt-5 text-xl font-bold text-slate-900">{t(`home.v2.solutions.items.${k}.title`)}</h3>
                  <p className="mt-2 text-slate-600 leading-relaxed">{t(`home.v2.solutions.items.${k}.description`)}</p>
                  <ul className="mt-5 space-y-2">
                    {(['b1', 'b2', 'b3'] as const).map((b) => (
                      <li key={b} className="flex items-start gap-2 text-sm text-slate-700">
                        <Check className="h-4 w-4 mt-0.5 text-teal-600 flex-shrink-0" />
                        {t(`home.v2.solutions.items.${k}.${b}`)}
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Why us */}
      <section className="py-24 bg-slate-900 text-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            <div>
              <span className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/10 text-sm font-medium">
                {t('home.v2.why.badgePrefix')} {platformName}
              </span>
              <h2 className="mt-4 text-3xl sm:text-4xl font-bold">
                {t('home.v2.why.title')} <span className="text-teal-300">{t('home.v2.why.titleHighlight')}</span>
              </h2>
              <p className="mt-4 text-lg text-slate-300">{t('home.v2.why.subtitle')}</p>
            </div>
            <div className="grid sm:grid-cols-2 gap-4">
              {DIFFERENTIATOR_KEYS.map((k) => {
                const Icon = DIFFERENTIATOR_ICONS[k];
                return (
                  <div key={k} className="rounded-2xl bg-white/5 border border-white/10 p-6 backdrop-blur-sm">
                    <div className="inline-flex p-2.5 rounded-xl bg-teal-500/20 text-teal-300">
                      <Icon className="h-5 w-5" />
                    </div>
                    <h3 className="mt-4 text-lg font-bold">{t(`home.v2.why.items.${k}.title`)}</h3>
                    <p className="mt-1 text-sm text-slate-300">{t(`home.v2.why.items.${k}.description`)}</p>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </section>

      {/* Plans */}
      <section id="plans" className="py-24 bg-slate-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-3xl mx-auto">
            <span className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-teal-50 text-teal-700 text-sm font-medium">
              <BarChart3 className="h-4 w-4" /> {t('home.v2.plans.badge')}
            </span>
            <h2 className="mt-4 text-3xl sm:text-4xl font-bold text-slate-900">
              {t('home.v2.plans.title')} <span className="text-teal-600">{t('home.v2.plans.titleHighlight')}</span>
            </h2>
            <p className="mt-4 text-lg text-slate-600">{t('home.v2.plans.subtitle')}</p>
          </div>

          <div className="flex justify-center mt-10 mb-12">
            <div className="inline-flex rounded-xl bg-white border border-slate-200 p-1 gap-1 shadow-sm">
              {(['logistics', 'accounting'] as ProductType[]).map((pt) => {
                const count = pt === 'logistics' ? logisticsPlans.length : accountingPlans.length;
                if (count === 0) return null;
                const Icon = PRODUCT_TAB_ICONS[pt];
                const active = pricingTab === pt;
                return (
                  <button
                    key={pt}
                    type="button"
                    onClick={() => setPricingTab(pt)}
                    className={`inline-flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-semibold transition-all ${
                      active ? 'bg-teal-600 text-white shadow-sm' : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    <Icon className="h-4 w-4" />
                    {t(`home.v2.productTypes.${pt}`)}
                  </button>
                );
              })}
            </div>
          </div>

          {pricingLoading ? (
            <div className="flex justify-center py-12">
              <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-teal-600" />
            </div>
          ) : pricingError ? (
            <p className="text-center text-rose-600">{pricingError}</p>
          ) : (() => {
            const activePlans = pricingTab === 'logistics' ? logisticsPlans : accountingPlans;
            if (activePlans.length === 0) {
              return <p className="text-center text-slate-500">{t('home.v2.plans.empty')}</p>;
            }
            const cols = activePlans.length >= 3 ? 'md:grid-cols-3' : activePlans.length === 2 ? 'md:grid-cols-2' : 'md:grid-cols-1';
            return (
              <div className={`grid ${cols} gap-6 max-w-5xl mx-auto items-stretch`}>
                {activePlans.map((plan) => (
                  <div
                    key={plan.id}
                    className={`relative rounded-2xl p-8 transition-all duration-300 ${
                      plan.popular
                        ? 'bg-slate-900 text-white shadow-2xl border-2 border-teal-500'
                        : 'bg-white border border-slate-200 hover:border-teal-300 hover:shadow-lg'
                    }`}
                  >
                    {plan.popular && (
                      <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                        <span className="bg-teal-500 text-white text-xs font-bold px-4 py-1.5 rounded-full uppercase tracking-wider">
                          {t('home.v2.plans.mostPopular')}
                        </span>
                      </div>
                    )}
                    <div className={`inline-flex p-3 rounded-xl mb-4 ${plan.popular ? 'bg-teal-500/20' : 'bg-teal-50'}`}>
                      <plan.icon className={`h-6 w-6 ${plan.popular ? 'text-teal-300' : 'text-teal-600'}`} />
                    </div>
                    <h3 className={`text-xl font-bold ${plan.popular ? 'text-white' : 'text-slate-900'}`}>{plan.name}</h3>
                    <p className={`mt-2 text-sm ${plan.popular ? 'text-slate-300' : 'text-slate-500'}`}>{plan.description}</p>
                    <div className="mt-6 mb-8 flex items-baseline gap-1">
                      <span className={`text-4xl font-extrabold ${plan.popular ? 'text-white' : 'text-slate-900'}`}>
                        {plan.price === 0 ? t('home.v2.plans.free') : `${plan.price}\u20AC`}
                      </span>
                      {plan.price > 0 && (
                        <span className={`text-sm ${plan.popular ? 'text-slate-400' : 'text-slate-500'}`}>/{plan.period}</span>
                      )}
                    </div>
                    <ul className="space-y-2.5 mb-8">
                      {plan.features.map((f) => (
                        <li key={f} className="flex items-start gap-2.5">
                          <Check className={`h-5 w-5 mt-0.5 flex-shrink-0 ${plan.popular ? 'text-teal-300' : 'text-teal-600'}`} />
                          <span className={`text-sm ${plan.popular ? 'text-slate-300' : 'text-slate-700'}`}>{f}</span>
                        </li>
                      ))}
                    </ul>
                    <Link
                      to={`/register?plan=${plan.slug}&type=${plan.productType}`}
                      className={`block w-full text-center py-3 rounded-xl font-semibold transition-all ${
                        plan.popular
                          ? 'bg-teal-500 text-white hover:bg-teal-400'
                          : 'bg-slate-900 text-white hover:bg-slate-800'
                      }`}
                    >
                      {plan.cta}
                    </Link>
                  </div>
                ))}
              </div>
            );
          })()}
        </div>
      </section>

      {/* Resources / CTA */}
      <section id="resources" className="py-24 bg-gradient-to-br from-teal-600 to-emerald-600 text-white relative overflow-hidden">
        <div className="absolute inset-0 opacity-20 pointer-events-none">
          <div className="absolute top-0 left-0 w-96 h-96 bg-white rounded-full blur-3xl -translate-x-1/2 -translate-y-1/2" />
          <div className="absolute bottom-0 right-0 w-96 h-96 bg-white rounded-full blur-3xl translate-x-1/2 translate-y-1/2" />
        </div>
        <div className="relative max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-3xl sm:text-5xl font-extrabold">{t('home.v2.cta.title')}</h2>
          <p className="mt-5 text-lg text-white/90 max-w-2xl mx-auto">{t('home.v2.cta.subtitle')}</p>
          <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-3">
            <Link
              to="/register"
              className="inline-flex items-center gap-2 px-8 py-4 rounded-xl bg-white text-teal-700 font-semibold hover:bg-slate-100 transition-all shadow-xl"
            >
              {t('home.v2.cta.primary')}
              <ArrowRight className="h-5 w-5" />
            </Link>
            <Link
              to="/login"
              className="inline-flex items-center gap-2 px-8 py-4 rounded-xl border-2 border-white/30 text-white font-semibold hover:bg-white/10 transition-all"
            >
              <LogIn className="h-5 w-5" />
              {t('home.v2.cta.secondary')}
            </Link>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-slate-950 text-slate-400">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-14 grid md:grid-cols-4 gap-10">
          <div className="md:col-span-2">
            <div className="flex items-center gap-2.5">
              {platformSettings.logo ? (
                <img src={platformSettings.logo} alt={platformName} className="w-9 h-9 rounded-lg object-contain" />
              ) : (
                <div className="p-2 rounded-lg bg-teal-600 text-white">
                  <Package className="h-5 w-5" />
                </div>
              )}
              <span className="text-lg font-bold text-white">{platformName}</span>
            </div>
            <p className="mt-4 text-sm max-w-sm">{t('home.v2.footer.description')}</p>
          </div>

          <div>
            <h4 className="text-white font-semibold mb-4">{t('home.v2.footer.platform')}</h4>
            <ul className="space-y-2 text-sm">
              <li><a href="#modules" className="hover:text-white transition-colors">{t('home.v2.footer.modulesLink')}</a></li>
              <li><a href="#solutions" className="hover:text-white transition-colors">{t('home.v2.footer.solutionsLink')}</a></li>
              <li><a href="#plans" className="hover:text-white transition-colors">{t('home.v2.footer.plansLink')}</a></li>
              <li><Link to="/login" className="hover:text-white transition-colors">{t('home.v2.footer.loginLink')}</Link></li>
            </ul>
          </div>

          <div>
            <h4 className="text-white font-semibold mb-4">{t('home.v2.footer.legal')}</h4>
            <ul className="space-y-2 text-sm">
              <li><Link to="/privacy" className="hover:text-white transition-colors">{t('home.v2.footer.privacy')}</Link></li>
              <li><Link to="/terms" className="hover:text-white transition-colors">{t('home.v2.footer.terms')}</Link></li>
            </ul>
          </div>
        </div>
        <div className="border-t border-slate-900">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-5 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs">
            <span>&copy; {new Date().getFullYear()} {platformName}. {t('home.v2.footer.rights')}</span>
            <LanguageSwitcher variant="minimal" />
          </div>
        </div>
      </footer>

      {showScrollTop && (
        <button
          onClick={scrollToTop}
          className="fixed bottom-6 right-6 z-40 p-3 rounded-full bg-teal-600 text-white shadow-lg shadow-teal-600/30 hover:bg-teal-700 transition-all"
          aria-label="Scroll to top"
        >
          <ChevronUp className="h-5 w-5" />
        </button>
      )}
    </div>
  );
}
