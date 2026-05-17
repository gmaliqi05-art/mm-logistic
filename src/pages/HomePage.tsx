import { useState, useEffect, useRef, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Package,
  Truck,
  Warehouse,
  ArrowRight,
  Shield,
  ChevronUp,
  Check,
  Boxes,
  Receipt,
  Users,
  Sparkles,
  Workflow,
  Building2,
  PlayCircle,
  CircleDot,
  Briefcase,
  Calculator,
  ScanLine,
  Globe2,
  Lock,
  Zap,
  TrendingUp,
  ClipboardCheck,
  Smartphone,
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
  Target,
  Heart,
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

const PRODUCT_TAB_ICONS: Record<ProductType, LucideIcon> = {
  logistics: Briefcase,
  accounting: Calculator,
};

// IMAGES - using stable Unsplash URLs. You can replace with your branded photos later.
const IMAGES = {
  heroBg: 'https://images.unsplash.com/photo-1586528116311-ad8dd3c8310d?auto=format&fit=crop&w=1600&q=80',
  warehouse: 'https://images.unsplash.com/photo-1553413077-190dd305871c?auto=format&fit=crop&w=1200&q=80',
  truck: 'https://images.unsplash.com/photo-1601584115197-04ecc0da31d5?auto=format&fit=crop&w=1200&q=80',
  office: 'https://images.unsplash.com/photo-1554224155-6726b3ff858f?auto=format&fit=crop&w=1200&q=80',
  team: 'https://images.unsplash.com/photo-1521737711867-e3b97375f902?auto=format&fit=crop&w=1200&q=80',
  ctaBg: 'https://images.unsplash.com/photo-1517254797898-04edd251bfb3?auto=format&fit=crop&w=1600&q=80',
};

const CORE_MODULES = [
  { key: 'logistics', icon: Truck, color: 'teal', titleKey: 'home.v3.modules.logistics.title', descKey: 'home.v3.modules.logistics.desc', features: ['home.v3.modules.logistics.f1', 'home.v3.modules.logistics.f2', 'home.v3.modules.logistics.f3', 'home.v3.modules.logistics.f4'] },
  { key: 'warehouse', icon: Warehouse, color: 'emerald', titleKey: 'home.v3.modules.warehouse.title', descKey: 'home.v3.modules.warehouse.desc', features: ['home.v3.modules.warehouse.f1', 'home.v3.modules.warehouse.f2', 'home.v3.modules.warehouse.f3', 'home.v3.modules.warehouse.f4'] },
  { key: 'accounting', icon: Receipt, color: 'sky', titleKey: 'home.v3.modules.accounting.title', descKey: 'home.v3.modules.accounting.desc', features: ['home.v3.modules.accounting.f1', 'home.v3.modules.accounting.f2', 'home.v3.modules.accounting.f3', 'home.v3.modules.accounting.f4'] },
  { key: 'fleet', icon: MapPin, color: 'orange', titleKey: 'home.v3.modules.fleet.title', descKey: 'home.v3.modules.fleet.desc', features: ['home.v3.modules.fleet.f1', 'home.v3.modules.fleet.f2', 'home.v3.modules.fleet.f3', 'home.v3.modules.fleet.f4'] },
  { key: 'documents', icon: ScanLine, color: 'purple', titleKey: 'home.v3.modules.documents.title', descKey: 'home.v3.modules.documents.desc', features: ['home.v3.modules.documents.f1', 'home.v3.modules.documents.f2', 'home.v3.modules.documents.f3', 'home.v3.modules.documents.f4'] },
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

const COLOR_CLASSES: Record<string, { bg: string; text: string; hover: string; gradient: string }> = {
  teal: { bg: 'bg-teal-50', text: 'text-teal-600', hover: 'hover:border-teal-300', gradient: 'from-teal-500 to-emerald-500' },
  emerald: { bg: 'bg-emerald-50', text: 'text-emerald-600', hover: 'hover:border-emerald-300', gradient: 'from-emerald-500 to-green-500' },
  sky: { bg: 'bg-sky-50', text: 'text-sky-600', hover: 'hover:border-sky-300', gradient: 'from-sky-500 to-blue-500' },
  orange: { bg: 'bg-orange-50', text: 'text-orange-600', hover: 'hover:border-orange-300', gradient: 'from-orange-500 to-amber-500' },
  purple: { bg: 'bg-purple-50', text: 'text-purple-600', hover: 'hover:border-purple-300', gradient: 'from-purple-500 to-pink-500' },
  rose: { bg: 'bg-rose-50', text: 'text-rose-600', hover: 'hover:border-rose-300', gradient: 'from-rose-500 to-red-500' },
};

export default function HomePage() {
  const [scrolled, setScrolled] = useState(false);
  const [showScrollTop, setShowScrollTop] = useState(false);
  const [banners, setBanners] = useState<BannerItem[]>([]);
  const [logisticsPlans, setLogisticsPlans] = useState<PricingPlan[]>([]);
  const [accountingPlans, setAccountingPlans] = useState<PricingPlan[]>([]);
  const [pricingTab, setPricingTab] = useState<ProductType>('logistics');
  const [pricingLoading, setPricingLoading] = useState(true);
  const [pricingError, setPricingError] = useState<string | null>(null);
  const [activeRoleTab, setActiveRoleTab] = useState<'company' | 'accounting' | 'depot' | 'driver'>('company');
  const clickTimestamps = useRef<number[]>([]);
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { settings: platformSettings } = usePlatformSettings();

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
      setPricingError(null);
      try {
        const all = await fetchActivePlans();
        if (cancelled) return;
        const logistics = all.filter((p) => p.product_type === 'logistics');
        const accounting = all.filter((p) => p.product_type === 'accounting');
        const logPop = pickPopularPlan(logistics);
        const accPop = pickPopularPlan(accounting);
        setLogisticsPlans(logistics.map((p) => toPricingPlan(p, logPop?.id ?? null)));
        setAccountingPlans(accounting.map((p) => toPricingPlan(p, accPop?.id ?? null)));
      } catch (e: any) {
        if (!cancelled) setPricingError(e?.message || t('home.v2.plans.error'));
      } finally {
        if (!cancelled) setPricingLoading(false);
      }
    }
    loadPlans();
    return () => {
      cancelled = true;
    };
  }, [t]);

  useEffect(() => {
    function onScroll() {
      setScrolled(window.scrollY > 8);
      setShowScrollTop(window.scrollY > 400);
    }
    window.addEventListener('scroll', onScroll);
    onScroll();
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const platformName = platformSettings.name || 'MM Logistic';
  const heroBanner = banners.find((b) => b.section_type === 'banner');
  const activePlans = pricingTab === 'logistics' ? logisticsPlans : accountingPlans;

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 scroll-smooth">
      {/* ============ NAV ============ */}
      <nav className={`fixed top-0 inset-x-0 z-50 transition-all duration-300 ${scrolled ? 'bg-white/95 backdrop-blur-md shadow-sm border-b border-slate-100' : 'bg-transparent'}`}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16 lg:h-20">
            <Link to="/" className="flex items-center gap-2.5">
              {platformSettings.logo ? (
                <img src={platformSettings.logo} alt={platformName} onClick={handleSecretClick} className="h-10 rounded-xl object-contain cursor-pointer" />
              ) : (
                <div onClick={handleSecretClick} className={`p-2 rounded-xl transition-all cursor-pointer ${scrolled ? 'bg-teal-600 text-white shadow-sm' : 'bg-white/15 text-white backdrop-blur-sm'}`}>
                  <Package className="h-6 w-6" />
                </div>
              )}
            </Link>

            <div className="hidden lg:flex items-center gap-8">
              <a href="#modules" className={`text-sm font-medium transition ${scrolled ? 'text-slate-600 hover:text-slate-900' : 'text-white/80 hover:text-white'}`}>{t('home.v3.nav.modules')}</a>
              <a href="#roles" className={`text-sm font-medium transition ${scrolled ? 'text-slate-600 hover:text-slate-900' : 'text-white/80 hover:text-white'}`}>{t('home.v3.nav.roles')}</a>
              <a href="#mobile-app" className={`text-sm font-medium transition ${scrolled ? 'text-slate-600 hover:text-slate-900' : 'text-white/80 hover:text-white'}`}>{t('home.v3.nav.mobileApp')}</a>
              <a href="#security" className={`text-sm font-medium transition ${scrolled ? 'text-slate-600 hover:text-slate-900' : 'text-white/80 hover:text-white'}`}>{t('home.v3.nav.security')}</a>
              <a href="#pricing" className={`text-sm font-medium transition ${scrolled ? 'text-slate-600 hover:text-slate-900' : 'text-white/80 hover:text-white'}`}>{t('home.v3.nav.pricing')}</a>
            </div>

            <div className="flex items-center gap-2 sm:gap-3">
              <LanguageSwitcher variant="header" />
              <Link to="/login" className={`inline-flex items-center px-4 py-2 sm:px-5 sm:py-2.5 rounded-lg text-sm font-semibold transition-all ${scrolled ? 'bg-teal-600 text-white hover:bg-teal-700 shadow-sm shadow-teal-600/30' : 'bg-white/10 hover:bg-white/20 backdrop-blur-sm border border-white/20 text-white'}`}>
                {t('home.v3.nav.login')}
              </Link>
            </div>
          </div>
        </div>
      </nav>

      {/* ============ HERO with background image ============ */}
      <section id="platform" className="relative pt-32 pb-20 lg:pt-40 lg:pb-28 overflow-hidden text-white">
        {/* Background layers */}
        <div className="absolute inset-0 bg-gradient-to-br from-slate-900 via-slate-900 to-teal-900" />
        <div className="absolute inset-0 bg-cover bg-center opacity-20" style={{ backgroundImage: `url(${IMAGES.heroBg})` }} />
        <div className="absolute inset-0 bg-gradient-to-br from-slate-900/90 via-slate-900/80 to-teal-900/70" />
        <div className="absolute inset-0 opacity-30 pointer-events-none">
          <div className="absolute top-20 -left-24 w-96 h-96 bg-teal-500 rounded-full blur-3xl" />
          <div className="absolute bottom-0 right-0 w-96 h-96 bg-emerald-500 rounded-full blur-3xl" />
        </div>

        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            <div>
              <span className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/10 border border-white/15 text-sm font-medium backdrop-blur-sm">
                <CircleDot className="h-3.5 w-3.5 text-teal-300 animate-pulse" />
                {t('home.v3.hero.badge')}
              </span>
              <h1 className="mt-6 text-4xl sm:text-5xl lg:text-6xl font-extrabold leading-[1.05] tracking-tight">
                {t('home.v3.hero.title1')}<br />
                <span className="bg-gradient-to-r from-teal-300 to-emerald-300 bg-clip-text text-transparent">{t('home.v3.hero.title2')}</span>
              </h1>
              <p className="mt-6 text-lg sm:text-xl text-slate-300 max-w-xl leading-relaxed">{t('home.v3.hero.subtitle')}</p>

              <div className="mt-10 flex flex-col sm:flex-row gap-3">
                <Link to="/register" className="inline-flex items-center justify-center gap-2 px-7 py-4 rounded-xl bg-teal-500 hover:bg-teal-400 text-white font-semibold shadow-lg shadow-teal-500/30 transition-all hover:scale-[1.02]">
                  {t('home.v3.hero.ctaPrimary')}<ArrowRight className="h-5 w-5" />
                </Link>
                <a href="#modules" className="inline-flex items-center justify-center gap-2 px-7 py-4 rounded-xl border border-white/20 text-white font-semibold hover:bg-white/10 transition-all backdrop-blur-sm">
                  <PlayCircle className="h-5 w-5" />{t('home.v3.hero.ctaSecondary')}
                </a>
              </div>

              <div className="mt-10 flex flex-wrap items-center gap-x-6 gap-y-3 text-sm text-slate-300">
                <div className="inline-flex items-center gap-2"><Check className="h-4 w-4 text-teal-300" />{t('home.v3.hero.perk1')}</div>
                <div className="inline-flex items-center gap-2"><Check className="h-4 w-4 text-teal-300" />{t('home.v3.hero.perk2')}</div>
                <div className="inline-flex items-center gap-2"><Check className="h-4 w-4 text-teal-300" />{t('home.v3.hero.perk3')}</div>
              </div>
            </div>

            {/* Hero dashboard mockup */}
            <div className="relative">
              <div className="relative rounded-3xl bg-white/5 border border-white/10 backdrop-blur-xl p-4 sm:p-6 shadow-2xl">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full bg-rose-400/80" />
                    <div className="w-3 h-3 rounded-full bg-amber-400/80" />
                    <div className="w-3 h-3 rounded-full bg-emerald-400/80" />
                    <span className="ml-3 text-xs text-slate-400 hidden sm:inline">dashboard.{platformName.toLowerCase().replace(/\s+/g, '')}.com</span>
                  </div>
                  <span className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">{t('home.v3.hero.previewBadge')}</span>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-2xl bg-slate-900/60 border border-white/5 p-4">
                    <div className="flex items-center gap-2 text-xs text-slate-400"><Truck className="h-3.5 w-3.5" />{t('home.v3.hero.cardDeliveries')}</div>
                    <div className="mt-1 text-2xl font-bold">148</div>
                    <div className="mt-1 text-xs text-emerald-300">+12%</div>
                  </div>
                  <div className="rounded-2xl bg-slate-900/60 border border-white/5 p-4">
                    <div className="flex items-center gap-2 text-xs text-slate-400"><Warehouse className="h-3.5 w-3.5" />{t('home.v3.hero.cardStock')}</div>
                    <div className="mt-1 text-2xl font-bold">32.4k</div>
                    <div className="mt-1 text-xs text-emerald-300">+3.4%</div>
                  </div>
                  <div className="rounded-2xl bg-slate-900/60 border border-white/5 p-4">
                    <div className="flex items-center gap-2 text-xs text-slate-400"><Receipt className="h-3.5 w-3.5" />{t('home.v3.hero.cardRevenue')}</div>
                    <div className="mt-1 text-2xl font-bold">€84k</div>
                    <div className="mt-1 text-xs text-emerald-300">+8%</div>
                  </div>
                  <div className="rounded-2xl bg-slate-900/60 border border-white/5 p-4">
                    <div className="flex items-center gap-2 text-xs text-slate-400"><Users className="h-3.5 w-3.5" />{t('home.v3.hero.cardDrivers')}</div>
                    <div className="mt-1 text-2xl font-bold">26</div>
                    <div className="mt-1 text-xs text-emerald-300">100%</div>
                  </div>
                </div>

                <div className="mt-4 rounded-2xl bg-slate-900/60 border border-white/5 p-4">
                  <div className="flex items-center justify-between text-xs text-slate-400">
                    <span>{t('home.v3.hero.weeklyActivity')}</span>
                    <span className="inline-flex items-center gap-1.5 text-teal-300"><span className="h-1.5 w-1.5 rounded-full bg-teal-300 animate-pulse" />{t('home.v3.hero.live')}</span>
                  </div>
                  <div className="mt-3 flex items-end gap-1.5 h-24">
                    {[40, 62, 48, 80, 55, 92, 70].map((h, i) => (
                      <div key={i} className="flex-1 rounded-t-md bg-gradient-to-t from-teal-500/70 to-emerald-400/90" style={{ height: `${h}%` }} />
                    ))}
                  </div>
                </div>
              </div>
              <div className="absolute -bottom-6 -left-6 hidden sm:block rounded-2xl bg-white text-slate-800 shadow-xl p-4 w-64">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-xl bg-emerald-100 text-emerald-700"><CheckCircle2 className="h-5 w-5" /></div>
                  <div>
                    <div className="text-xs text-slate-500">{t('home.v3.hero.cmrBadge')}</div>
                    <div className="text-sm font-semibold">{t('home.v3.hero.cmrText')}</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ============ NEWS BANNER ============ */}
      {heroBanner && (
        <section className="bg-white border-b border-slate-100">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex flex-col sm:flex-row sm:items-center gap-3">
            <span className="inline-flex items-center gap-2 px-2.5 py-1 rounded-full bg-teal-50 text-teal-700 text-xs font-semibold">
              <Sparkles className="h-3.5 w-3.5" />{t('home.v3.banner.news')}
            </span>
            <div className="flex-1">
              <span className="font-semibold text-slate-800">{heroBanner.title}</span>
              {heroBanner.subtitle && <span className="text-slate-500 ml-2">{heroBanner.subtitle}</span>}
            </div>
            {heroBanner.link_url && heroBanner.link_text && (
              <a href={heroBanner.link_url} className="inline-flex items-center gap-1 text-sm font-semibold text-teal-600 hover:text-teal-700">
                {heroBanner.link_text}<ArrowRight className="h-4 w-4" />
              </a>
            )}
          </div>
        </section>
      )}

      {/* ============ TRUST STANDARDS BAND ============ */}
      <section className="py-12 bg-slate-50 border-b border-slate-100">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <p className="text-center text-xs uppercase tracking-widest text-slate-500 font-semibold mb-8">{t('home.v3.trust.label')}</p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {STANDARDS.map((s) => {
              const Ic = s.icon;
              return (
                <div key={s.key} className="flex items-center justify-center gap-3 px-4 py-3 rounded-xl bg-white border border-slate-200 shadow-sm">
                  <Ic className="h-5 w-5 text-teal-600 flex-shrink-0" />
                  <span className="text-sm font-semibold text-slate-700">{t(`home.v3.trust.${s.key}`)}</span>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ============ PLATFORM AT-A-GLANCE ============ */}
      <section className="py-16 bg-white border-b border-slate-100">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-10">
            <p className="text-sm font-semibold uppercase tracking-wider text-teal-600">{t('home.v3.stats.badge')}</p>
            <h2 className="mt-2 text-2xl sm:text-3xl font-bold text-slate-900">{t('home.v3.stats.title')}</h2>
          </div>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-8">
            {[
              { value: '6', label: t('home.v3.stats.modules'), icon: Boxes, suffix: '' },
              { value: '5', label: t('home.v3.stats.roles'), icon: Users, suffix: '' },
              { value: '4', label: t('home.v3.stats.languages'), icon: Globe2, suffix: '' },
              { value: '99.9', label: t('home.v3.stats.uptime'), icon: Zap, suffix: '%' },
            ].map((s) => {
              const Ic = s.icon;
              return (
                <div key={s.label} className="text-center">
                  <div className="inline-flex p-3 rounded-2xl bg-teal-50 text-teal-600 mb-3"><Ic className="h-6 w-6" /></div>
                  <div className="text-3xl lg:text-4xl font-extrabold text-slate-900">{s.value}{s.suffix}</div>
                  <div className="mt-1 text-sm text-slate-500 font-medium">{s.label}</div>
                </div>
              );
            })}
          </div>
          <p className="text-center mt-10 text-xs text-slate-400">{t('home.v3.stats.footnote')}</p>
        </div>
      </section>

      {/* ============ FEATURE SHOWCASE 1: Logistics (image LEFT) ============ */}
      <section className="py-20 lg:py-28 bg-slate-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            <div className="relative">
              <div className="absolute -inset-4 bg-gradient-to-tr from-teal-500/20 to-emerald-500/20 rounded-3xl blur-2xl" />
              <img src={IMAGES.warehouse} alt={t('home.v3.showcase1.alt')} loading="lazy" className="relative rounded-3xl shadow-2xl w-full h-[400px] lg:h-[500px] object-cover" />
              <div className="absolute -bottom-6 -right-6 hidden md:block bg-white rounded-2xl shadow-xl p-4 w-56 border border-slate-100">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-xl bg-teal-100 text-teal-700"><Truck className="h-5 w-5" /></div>
                  <div>
                    <div className="text-xs text-slate-500">{t('home.v3.showcase1.badge')}</div>
                    <div className="text-sm font-semibold text-slate-900">CMR 3-pale</div>
                  </div>
                </div>
              </div>
            </div>
            <div>
              <span className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-teal-50 text-teal-700 text-sm font-medium"><Truck className="h-4 w-4" />{t('home.v3.showcase1.tag')}</span>
              <h2 className="mt-4 text-3xl sm:text-4xl font-bold text-slate-900 leading-tight">{t('home.v3.showcase1.title')}</h2>
              <p className="mt-4 text-lg text-slate-600 leading-relaxed">{t('home.v3.showcase1.body')}</p>
              <ul className="mt-6 space-y-3">
                {['b1', 'b2', 'b3', 'b4'].map((b) => (
                  <li key={b} className="flex items-start gap-3">
                    <div className="mt-0.5 p-1 rounded-full bg-teal-100 text-teal-700 flex-shrink-0"><Check className="h-3.5 w-3.5" /></div>
                    <span className="text-slate-700">{t(`home.v3.showcase1.${b}`)}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* ============ FEATURE SHOWCASE 2: Accounting (image RIGHT) ============ */}
      <section className="py-20 lg:py-28 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            <div className="order-2 lg:order-1">
              <span className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-sky-50 text-sky-700 text-sm font-medium"><Calculator className="h-4 w-4" />{t('home.v3.showcase2.tag')}</span>
              <h2 className="mt-4 text-3xl sm:text-4xl font-bold text-slate-900 leading-tight">{t('home.v3.showcase2.title')}</h2>
              <p className="mt-4 text-lg text-slate-600 leading-relaxed">{t('home.v3.showcase2.body')}</p>
              <ul className="mt-6 space-y-3">
                {['b1', 'b2', 'b3', 'b4'].map((b) => (
                  <li key={b} className="flex items-start gap-3">
                    <div className="mt-0.5 p-1 rounded-full bg-sky-100 text-sky-700 flex-shrink-0"><Check className="h-3.5 w-3.5" /></div>
                    <span className="text-slate-700">{t(`home.v3.showcase2.${b}`)}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div className="relative order-1 lg:order-2">
              <div className="absolute -inset-4 bg-gradient-to-bl from-sky-500/20 to-blue-500/20 rounded-3xl blur-2xl" />
              <img src={IMAGES.office} alt={t('home.v3.showcase2.alt')} loading="lazy" className="relative rounded-3xl shadow-2xl w-full h-[400px] lg:h-[500px] object-cover" />
              <div className="absolute -bottom-6 -left-6 hidden md:block bg-white rounded-2xl shadow-xl p-4 w-56 border border-slate-100">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-xl bg-sky-100 text-sky-700"><Receipt className="h-5 w-5" /></div>
                  <div>
                    <div className="text-xs text-slate-500">{t('home.v3.showcase2.badge')}</div>
                    <div className="text-sm font-semibold text-slate-900">DATEV Export</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ============ FEATURE SHOWCASE 3: Fleet/Drivers ============ */}
      <section className="py-20 lg:py-28 bg-slate-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            <div className="relative">
              <div className="absolute -inset-4 bg-gradient-to-tr from-orange-500/20 to-amber-500/20 rounded-3xl blur-2xl" />
              <img src={IMAGES.truck} alt={t('home.v3.showcase3.alt')} loading="lazy" className="relative rounded-3xl shadow-2xl w-full h-[400px] lg:h-[500px] object-cover" />
              <div className="absolute -bottom-6 -right-6 hidden md:block bg-white rounded-2xl shadow-xl p-4 w-56 border border-slate-100">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-xl bg-orange-100 text-orange-700"><MapPin className="h-5 w-5" /></div>
                  <div>
                    <div className="text-xs text-slate-500">{t('home.v3.showcase3.badge')}</div>
                    <div className="text-sm font-semibold text-slate-900">GPS Live</div>
                  </div>
                </div>
              </div>
            </div>
            <div>
              <span className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-orange-50 text-orange-700 text-sm font-medium"><MapPin className="h-4 w-4" />{t('home.v3.showcase3.tag')}</span>
              <h2 className="mt-4 text-3xl sm:text-4xl font-bold text-slate-900 leading-tight">{t('home.v3.showcase3.title')}</h2>
              <p className="mt-4 text-lg text-slate-600 leading-relaxed">{t('home.v3.showcase3.body')}</p>
              <ul className="mt-6 space-y-3">
                {['b1', 'b2', 'b3', 'b4'].map((b) => (
                  <li key={b} className="flex items-start gap-3">
                    <div className="mt-0.5 p-1 rounded-full bg-orange-100 text-orange-700 flex-shrink-0"><Check className="h-3.5 w-3.5" /></div>
                    <span className="text-slate-700">{t(`home.v3.showcase3.${b}`)}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* ============ MODULES GRID ============ */}
      <section id="modules" className="py-24 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-3xl mx-auto mb-14">
            <span className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-teal-50 text-teal-700 text-sm font-medium"><Boxes className="h-4 w-4" />{t('home.v3.modules.badge')}</span>
            <h2 className="mt-4 text-3xl sm:text-4xl font-bold text-slate-900">
              {t('home.v3.modules.title')} <span className="text-teal-600">{t('home.v3.modules.titleHighlight')}</span>
            </h2>
            <p className="mt-4 text-lg text-slate-600">{t('home.v3.modules.subtitle')}</p>
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {CORE_MODULES.map((m) => {
              const Icon = m.icon;
              const c = COLOR_CLASSES[m.color];
              return (
                <div key={m.key} className={`group relative rounded-2xl bg-white border border-slate-200 p-6 ${c.hover} hover:shadow-xl transition-all duration-300`}>
                  <div className={`inline-flex p-3 rounded-xl bg-gradient-to-br ${c.gradient} text-white shadow-lg`}>
                    <Icon className="h-6 w-6" />
                  </div>
                  <h3 className="mt-4 text-lg font-bold text-slate-900">{t(m.titleKey)}</h3>
                  <p className="mt-2 text-sm text-slate-600 leading-relaxed">{t(m.descKey)}</p>
                  <ul className="mt-4 space-y-2">
                    {m.features.map((fk) => (
                      <li key={fk} className="flex items-start gap-2 text-sm text-slate-700">
                        <Check className={`h-4 w-4 ${c.text} mt-0.5 flex-shrink-0`} /><span>{t(fk)}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ============ ROLES TABS ============ */}
      <section id="roles" className="py-24 bg-slate-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-3xl mx-auto">
            <span className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-emerald-50 text-emerald-700 text-sm font-medium"><Layers className="h-4 w-4" />{t('home.v3.roles.badge')}</span>
            <h2 className="mt-4 text-3xl sm:text-4xl font-bold text-slate-900">
              {t('home.v3.roles.title')} <span className="text-emerald-600">{t('home.v3.roles.titleHighlight')}</span>
            </h2>
            <p className="mt-4 text-lg text-slate-600">{t('home.v3.roles.subtitle')}</p>
          </div>

          <div className="mt-10 flex flex-wrap justify-center gap-2 sm:gap-3">
            {ROLE_TABS.map((r) => {
              const Ic = r.icon;
              const active = activeRoleTab === r.key;
              return (
                <button key={r.key} onClick={() => setActiveRoleTab(r.key as typeof activeRoleTab)}
                  className={`inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold transition-all ${active ? 'bg-slate-900 text-white shadow-lg shadow-slate-900/20' : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'}`}>
                  <Ic className="h-4 w-4" />{t(r.titleKey)}
                </button>
              );
            })}
          </div>

          <div className="mt-12 rounded-3xl border border-slate-200 bg-white p-8 lg:p-12 shadow-lg">
            <div className="grid lg:grid-cols-2 gap-10 items-center">
              <div>
                <h3 className="text-2xl sm:text-3xl font-bold text-slate-900">{t(`home.v3.roles.${activeRoleTab}.headline`)}</h3>
                <p className="mt-3 text-slate-600 leading-relaxed">{t(`home.v3.roles.${activeRoleTab}.body`)}</p>
                <ul className="mt-6 space-y-3">
                  {['b1', 'b2', 'b3', 'b4', 'b5'].map((b) => (
                    <li key={b} className="flex items-start gap-3">
                      <div className="mt-0.5 p-1 rounded-full bg-teal-100 text-teal-700 flex-shrink-0"><Check className="h-3.5 w-3.5" /></div>
                      <span className="text-slate-700">{t(`home.v3.roles.${activeRoleTab}.${b}`)}</span>
                    </li>
                  ))}
                </ul>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-6">
                <div className="text-xs font-semibold uppercase tracking-wider text-slate-400">{t('home.v3.roles.dashboardPreview')}</div>
                <div className="mt-4 space-y-3">
                  {[1, 2, 3, 4].map((i) => (
                    <div key={i} className="flex items-center gap-3 rounded-xl bg-white p-3 shadow-sm border border-slate-100">
                      <div className="h-9 w-9 rounded-lg bg-gradient-to-br from-teal-400 to-emerald-500 flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-semibold text-slate-800 truncate">{t(`home.v3.roles.${activeRoleTab}.task${i}`)}</div>
                        <div className="text-xs text-slate-500 truncate">{t(`home.v3.roles.${activeRoleTab}.task${i}Sub`)}</div>
                      </div>
                      <div className="text-xs font-medium text-teal-600">→</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ============ WORKFLOW ============ */}
      <section className="py-24 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-3xl mx-auto">
            <span className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-sky-50 text-sky-700 text-sm font-medium"><Workflow className="h-4 w-4" />{t('home.v3.workflow.badge')}</span>
            <h2 className="mt-4 text-3xl sm:text-4xl font-bold text-slate-900">{t('home.v3.workflow.title')}</h2>
            <p className="mt-4 text-lg text-slate-600">{t('home.v3.workflow.subtitle')}</p>
          </div>

          <div className="mt-14 grid md:grid-cols-3 lg:grid-cols-5 gap-5">
            {[
              { n: '01', icon: ClipboardCheck, key: 'step1' },
              { n: '02', icon: Truck, key: 'step2' },
              { n: '03', icon: ScanLine, key: 'step3' },
              { n: '04', icon: Bell, key: 'step4' },
              { n: '05', icon: Receipt, key: 'step5' },
            ].map((s) => {
              const Ic = s.icon;
              return (
                <div key={s.key} className="relative rounded-2xl bg-white border border-slate-200 p-6 hover:shadow-lg transition">
                  <div className="text-xs font-bold text-teal-600">{s.n}</div>
                  <div className="mt-3 inline-flex p-2.5 rounded-xl bg-gradient-to-br from-teal-500 to-emerald-500 text-white"><Ic className="h-5 w-5" /></div>
                  <h3 className="mt-3 font-bold text-slate-900">{t(`home.v3.workflow.${s.key}.title`)}</h3>
                  <p className="mt-1.5 text-sm text-slate-600">{t(`home.v3.workflow.${s.key}.desc`)}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ============ MOBILE APP — iOS + ANDROID (HIGHLIGHT) ============ */}
      <section id="mobile-app" className="py-24 lg:py-32 bg-gradient-to-br from-slate-900 via-slate-900 to-teal-900 text-white relative overflow-hidden">
        <div className="absolute inset-0 opacity-20 pointer-events-none">
          <div className="absolute top-20 right-1/4 w-96 h-96 bg-teal-500 rounded-full blur-3xl" />
          <div className="absolute bottom-0 left-1/4 w-96 h-96 bg-emerald-500 rounded-full blur-3xl" />
        </div>

        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            <div>
              <span className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/10 border border-white/15 text-sm font-medium backdrop-blur-sm">
                <Smartphone className="h-4 w-4" />{t('home.v3.mobileApp.badge')}
              </span>
              <h2 className="mt-6 text-4xl sm:text-5xl font-extrabold leading-tight">
                {t('home.v3.mobileApp.title1')}<br />
                <span className="bg-gradient-to-r from-teal-300 to-emerald-300 bg-clip-text text-transparent">{t('home.v3.mobileApp.title2')}</span>
              </h2>
              <p className="mt-6 text-lg text-slate-300 leading-relaxed">{t('home.v3.mobileApp.subtitle')}</p>

              <ul className="mt-8 grid sm:grid-cols-2 gap-3">
                {['f1', 'f2', 'f3', 'f4'].map((f) => (
                  <li key={f} className="flex items-center gap-3">
                    <div className="p-1 rounded-full bg-emerald-500/20"><Check className="h-3.5 w-3.5 text-emerald-300" /></div>
                    <span className="text-sm text-slate-200">{t(`home.v3.mobileApp.${f}`)}</span>
                  </li>
                ))}
              </ul>

              {/* iOS + Android badges */}
              <div className="mt-10 flex flex-col sm:flex-row gap-3">
                <a href="#pricing" className="inline-flex items-center gap-3 px-5 py-3 rounded-xl bg-black hover:bg-slate-800 transition-all border border-white/20 shadow-lg">
                  <Apple className="h-7 w-7" />
                  <div className="text-left">
                    <div className="text-[10px] uppercase tracking-wider text-slate-400">{t('home.v3.mobileApp.iosTop')}</div>
                    <div className="text-base font-semibold">App Store</div>
                  </div>
                </a>
                <a href="#pricing" className="inline-flex items-center gap-3 px-5 py-3 rounded-xl bg-black hover:bg-slate-800 transition-all border border-white/20 shadow-lg">
                  <svg className="h-7 w-7" viewBox="0 0 24 24" fill="currentColor"><path d="M17.523 15.341l2.04-3.532a.49.49 0 00-.183-.67.493.493 0 00-.671.183l-2.066 3.578c-1.577-.72-3.345-1.118-5.243-1.118-1.898 0-3.667.4-5.243 1.118L4.09 11.322a.493.493 0 00-.67-.183.49.49 0 00-.184.67l2.04 3.532C2.65 17.013.96 19.747.66 22.99h22.68c-.302-3.243-1.99-5.977-5.817-7.65zM7.122 20.013a.93.93 0 11.001-1.86.93.93 0 010 1.86zm9.756 0a.93.93 0 11.001-1.86.93.93 0 010 1.86z"/></svg>
                  <div className="text-left">
                    <div className="text-[10px] uppercase tracking-wider text-slate-400">{t('home.v3.mobileApp.androidTop')}</div>
                    <div className="text-base font-semibold">Google Play</div>
                  </div>
                </a>
              </div>

              {/* PWA fallback */}
              <p className="mt-4 text-sm text-slate-400 inline-flex items-center gap-2">
                <Smartphone className="h-4 w-4 text-teal-300" />
                {t('home.v3.mobileApp.pwaNote')}
              </p>
            </div>

            {/* Phone mockup */}
            <div className="relative flex justify-center lg:justify-end">
              <div className="relative w-64 sm:w-72 h-[32rem] sm:h-[36rem] rounded-[3rem] border-[14px] border-slate-950 bg-slate-950 shadow-2xl overflow-hidden">
                {/* Notch */}
                <div className="absolute top-0 inset-x-0 h-7 bg-slate-950 flex items-center justify-center z-10">
                  <div className="w-20 h-1.5 rounded-full bg-slate-700" />
                </div>
                {/* Screen */}
                <div className="absolute inset-x-0 top-7 bottom-0 bg-gradient-to-b from-teal-600 to-emerald-700 p-4 text-white">
                  <div className="flex items-center justify-between mb-4 mt-2">
                    <Truck className="h-5 w-5" />
                    <div className="text-xs font-medium">{t('home.v3.mobileApp.appDashboard')}</div>
                    <Bell className="h-5 w-5" />
                  </div>
                  <div className="space-y-2.5 text-slate-800">
                    {[1, 2, 3, 4, 5].map((i) => (
                      <div key={i} className="rounded-xl bg-white p-3 shadow">
                        <div className="text-[10px] text-slate-500">CMR-{1000 + i}</div>
                        <div className="text-sm font-bold mt-0.5">{t('home.v3.mobileApp.deliveryItem')} #{i}</div>
                        <div className="flex items-center justify-between mt-1">
                          <div className="text-xs text-emerald-600 flex items-center gap-1">
                            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                            {t('home.v3.mobileApp.inTransit')}
                          </div>
                          <div className="text-xs text-slate-400">14:3{i}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
              {/* Floating badge */}
              <div className="absolute top-12 -left-2 sm:-left-12 bg-white rounded-2xl shadow-xl p-3 text-slate-900 w-44 hidden sm:block">
                <div className="flex items-center gap-2">
                  <div className="p-1.5 rounded-lg bg-emerald-100"><Bell className="h-4 w-4 text-emerald-700" /></div>
                  <div>
                    <div className="text-[10px] text-slate-500">{t('home.v3.mobileApp.notifBadge')}</div>
                    <div className="text-xs font-semibold">{t('home.v3.mobileApp.notifText')}</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ============ SECURITY & COMPLIANCE ============ */}
      <section id="security" className="py-24 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid lg:grid-cols-2 gap-14 items-center">
            <div>
              <span className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-rose-50 text-rose-700 text-sm font-medium"><Shield className="h-4 w-4" />{t('home.v3.security.badge')}</span>
              <h2 className="mt-4 text-3xl sm:text-4xl font-bold text-slate-900">
                {t('home.v3.security.title')} <span className="text-rose-600">{t('home.v3.security.titleHighlight')}</span>
              </h2>
              <p className="mt-4 text-lg text-slate-600 leading-relaxed">{t('home.v3.security.subtitle')}</p>

              <div className="mt-8 grid sm:grid-cols-2 gap-4">
                {TRUST_BADGES.map((b) => {
                  const Ic = b.icon;
                  return (
                    <div key={b.key} className="flex items-start gap-3 p-4 rounded-xl bg-slate-50 border border-slate-100">
                      <div className="p-2 rounded-lg bg-white shadow-sm flex-shrink-0"><Ic className="h-5 w-5 text-rose-600" /></div>
                      <div className="min-w-0">
                        <div className="font-semibold text-slate-900">{t(`home.v3.security.${b.key}.title`)}</div>
                        <div className="text-xs text-slate-500 mt-0.5">{t(`home.v3.security.${b.key}.desc`)}</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
            <div className="rounded-3xl bg-gradient-to-br from-slate-900 to-slate-800 p-8 text-white">
              <div className="space-y-5">
                {[
                  { icon: Lock, key: 'compliance1' },
                  { icon: Database, key: 'compliance2' },
                  { icon: Globe2, key: 'compliance3' },
                  { icon: GitBranch, key: 'compliance4' },
                ].map((c) => {
                  const Ic = c.icon;
                  return (
                    <div key={c.key} className="flex items-start gap-4">
                      <div className="p-2.5 rounded-xl bg-white/10 flex-shrink-0"><Ic className="h-5 w-5 text-teal-300" /></div>
                      <div className="min-w-0">
                        <div className="font-semibold">{t(`home.v3.security.${c.key}.title`)}</div>
                        <div className="text-sm text-slate-400 mt-0.5">{t(`home.v3.security.${c.key}.desc`)}</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ============ PRICING ============ */}
      <section id="pricing" className="py-24 bg-slate-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-3xl mx-auto">
            <span className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-amber-50 text-amber-700 text-sm font-medium"><Star className="h-4 w-4" />{t('home.v3.plans.badge')}</span>
            <h2 className="mt-4 text-3xl sm:text-4xl font-bold text-slate-900">
              {t('home.v3.plans.title')} <span className="text-amber-600">{t('home.v3.plans.titleHighlight')}</span>
            </h2>
            <p className="mt-4 text-lg text-slate-600">{t('home.v3.plans.subtitle')}</p>
          </div>

          <div className="mt-10 flex justify-center">
            <div className="inline-flex bg-white rounded-2xl p-1.5 shadow-sm border border-slate-200">
              {(['logistics', 'accounting'] as ProductType[]).map((p) => {
                const Ic = PRODUCT_TAB_ICONS[p];
                const active = pricingTab === p;
                return (
                  <button key={p} onClick={() => setPricingTab(p)} className={`inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold transition ${active ? 'bg-slate-900 text-white shadow' : 'text-slate-600 hover:text-slate-900'}`}>
                    <Ic className="h-4 w-4" />{t(`home.v2.productTypes.${p}`)}
                  </button>
                );
              })}
            </div>
          </div>

          {pricingError && <p className="mt-8 text-center text-rose-600">{pricingError}</p>}

          {pricingLoading ? (
            <div className="mt-12 text-center text-slate-500">{t('common.loading')}</div>
          ) : activePlans.length === 0 ? (
            <div className="mt-12 text-center text-slate-500">{t('home.v2.plans.empty')}</div>
          ) : (
            <div className="mt-12 grid md:grid-cols-2 lg:grid-cols-3 gap-6">
              {activePlans.map((p) => {
                const Ic = p.icon;
                return (
                  <div key={p.id} className={`relative rounded-2xl border p-6 transition-all ${p.popular ? 'border-amber-400 bg-white shadow-xl shadow-amber-200/50 scale-[1.02]' : 'border-slate-200 bg-white hover:border-slate-300 hover:shadow-md'}`}>
                    {p.popular && (
                      <span className="absolute -top-3 left-1/2 -translate-x-1/2 inline-flex items-center gap-1 px-3 py-1 rounded-full bg-amber-500 text-white text-xs font-bold">
                        <Star className="h-3 w-3" />{t('home.v2.plans.mostPopular')}
                      </span>
                    )}
                    <div className="inline-flex p-2.5 rounded-xl bg-slate-100 text-slate-700"><Ic className="h-5 w-5" /></div>
                    <h3 className="mt-4 text-xl font-bold text-slate-900">{p.name}</h3>
                    <p className="mt-1 text-sm text-slate-600 min-h-[40px]">{p.description}</p>
                    <div className="mt-5 flex items-baseline gap-1">
                      <span className="text-4xl font-extrabold text-slate-900">{p.price === 0 ? t('home.v2.plans.free') : `€${p.price.toFixed(0)}`}</span>
                      {p.price > 0 && <span className="text-slate-500">/{p.period}</span>}
                    </div>
                    <ul className="mt-6 space-y-2.5">
                      {p.features.map((f, i) => (
                        <li key={i} className="flex items-start gap-2 text-sm text-slate-700">
                          <Check className="h-4 w-4 text-teal-600 mt-0.5 flex-shrink-0" /><span>{f}</span>
                        </li>
                      ))}
                    </ul>
                    <Link to="/register" className={`mt-7 inline-flex items-center justify-center w-full gap-2 px-5 py-3 rounded-xl font-semibold transition ${p.popular ? 'bg-amber-500 text-white hover:bg-amber-600' : 'bg-slate-900 text-white hover:bg-slate-800'}`}>
                      {p.cta}<ArrowRight className="h-4 w-4" />
                    </Link>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </section>

      {/* ============ FINAL CTA with background image ============ */}
      <section className="py-24 lg:py-32 relative overflow-hidden text-white">
        <div className="absolute inset-0 bg-gradient-to-br from-slate-900 via-slate-900 to-teal-900" />
        <div className="absolute inset-0 bg-cover bg-center opacity-25" style={{ backgroundImage: `url(${IMAGES.ctaBg})` }} />
        <div className="absolute inset-0 bg-gradient-to-t from-slate-900 via-slate-900/80 to-slate-900/40" />
        
        <div className="relative max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/10 border border-white/15 text-sm font-medium backdrop-blur-sm">
            <Target className="h-4 w-4 text-teal-300" />
            {t('home.v3.cta.badge')}
          </div>
          <h2 className="mt-6 text-4xl sm:text-5xl lg:text-6xl font-extrabold tracking-tight leading-tight">{t('home.v3.cta.title')}</h2>
          <p className="mt-6 text-lg sm:text-xl text-slate-300 max-w-2xl mx-auto">{t('home.v3.cta.subtitle')}</p>
          <div className="mt-10 flex flex-col sm:flex-row gap-3 justify-center">
            <Link to="/register" className="inline-flex items-center justify-center gap-2 px-8 py-4 rounded-xl bg-teal-500 hover:bg-teal-400 text-white font-semibold shadow-lg shadow-teal-500/30 transition-all hover:scale-[1.02]">
              {t('home.v3.cta.primary')}<ArrowRight className="h-5 w-5" />
            </Link>
            <Link to="/login" className="inline-flex items-center justify-center gap-2 px-8 py-4 rounded-xl border border-white/20 hover:bg-white/10 text-white font-semibold transition-all backdrop-blur-sm">
              {t('home.v3.cta.secondary')}
            </Link>
          </div>
          <div className="mt-10 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-sm text-slate-400">
            <div className="inline-flex items-center gap-2"><Check className="h-4 w-4 text-teal-300" />{t('home.v3.cta.perk1')}</div>
            <div className="inline-flex items-center gap-2"><Check className="h-4 w-4 text-teal-300" />{t('home.v3.cta.perk2')}</div>
            <div className="inline-flex items-center gap-2"><Check className="h-4 w-4 text-teal-300" />{t('home.v3.cta.perk3')}</div>
          </div>
        </div>
      </section>

      {/* ============ FOOTER ============ */}
      <footer className="bg-slate-950 text-slate-400 py-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid md:grid-cols-4 gap-8">
            <div>
              <div className="flex items-center gap-2.5 text-white">
                <div className="p-2 rounded-xl bg-teal-600"><Package className="h-5 w-5" /></div>
                <span className="font-bold text-lg">{platformName}</span>
              </div>
              <p className="mt-4 text-sm leading-relaxed">{t('home.v3.footer.description')}</p>
              <div className="mt-6 flex gap-3">
                <div className="px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-800 text-xs">
                  <span className="text-slate-500">EU</span> <span className="text-white font-semibold">Hosted</span>
                </div>
                <div className="px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-800 text-xs">
                  <span className="text-slate-500">GoBD</span> <span className="text-white font-semibold">Ready</span>
                </div>
              </div>
            </div>
            <div>
              <h4 className="text-white font-semibold mb-3">{t('home.v3.footer.product')}</h4>
              <ul className="space-y-2 text-sm">
                <li><a href="#modules" className="hover:text-white transition">{t('home.v3.footer.modulesLink')}</a></li>
                <li><a href="#roles" className="hover:text-white transition">{t('home.v3.footer.rolesLink')}</a></li>
                <li><a href="#mobile-app" className="hover:text-white transition">{t('home.v3.footer.mobileLink')}</a></li>
                <li><a href="#pricing" className="hover:text-white transition">{t('home.v3.footer.pricingLink')}</a></li>
              </ul>
            </div>
            <div>
              <h4 className="text-white font-semibold mb-3">{t('home.v3.footer.company')}</h4>
              <ul className="space-y-2 text-sm">
                <li><a href="#security" className="hover:text-white transition">{t('home.v3.footer.securityLink')}</a></li>
                <li><Link to="/login" className="hover:text-white transition">{t('home.v3.footer.loginLink')}</Link></li>
              </ul>
            </div>
            <div>
              <h4 className="text-white font-semibold mb-3">{t('home.v3.footer.legal')}</h4>
              <ul className="space-y-2 text-sm">
                <li><Link to="/legal/impressum" className="hover:text-white transition">{t('legal.nav.impressum')}</Link></li>
                <li><Link to="/legal/privacy" className="hover:text-white transition">{t('legal.nav.privacy')}</Link></li>
                <li><Link to="/legal/terms" className="hover:text-white transition">{t('legal.nav.terms')}</Link></li>
                <li><Link to="/legal/cookies" className="hover:text-white transition">{t('legal.nav.cookies')}</Link></li>
                <li><Link to="/legal/dpa" className="hover:text-white transition">{t('legal.nav.dpa')}</Link></li>
                <li><Link to="/legal/subprocessors" className="hover:text-white transition">{t('legal.nav.subprocessors')}</Link></li>
                <li><Link to="/legal/aup" className="hover:text-white transition">{t('legal.nav.aup')}</Link></li>
                <li><Link to="/legal/refund" className="hover:text-white transition">{t('legal.nav.refund')}</Link></li>
              </ul>
            </div>
          </div>
          <div className="mt-12 pt-8 border-t border-slate-800 text-sm text-center">
            © {new Date().getFullYear()} {platformName}. {t('home.v3.footer.rights')}
          </div>
        </div>
      </footer>

      {showScrollTop && (
        <button onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })} className="fixed bottom-6 right-6 p-3 rounded-full bg-teal-600 text-white shadow-lg hover:bg-teal-700 transition-all z-50" aria-label="Scroll to top">
          <ChevronUp className="h-5 w-5" />
        </button>
      )}
    </div>
  );
}
