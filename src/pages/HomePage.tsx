import { useState, useEffect, useRef, useCallback, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Package,
  Truck,
  BarChart3,
  MessageSquare,
  Warehouse,
  ArrowRight,
  Shield,
  ChevronUp,
  ChevronDown,
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
  Layers,
  type LucideIcon,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useTranslation } from '../i18n';
import LanguageSwitcher from '../components/LanguageSwitcher';
import PublicFooter from '../components/PublicFooter';
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

const HERO_PHOTOS = [
  {
    src: 'https://images.pexels.com/photos/4481260/pexels-photo-4481260.jpeg?auto=compress&cs=tinysrgb&w=800',
    label: 'Magazina & Paleta',
  },
  {
    src: 'https://images.pexels.com/photos/1267338/pexels-photo-1267338.jpeg?auto=compress&cs=tinysrgb&w=800',
    label: 'Logjistike',
  },
  {
    src: 'https://images.pexels.com/photos/210990/pexels-photo-210990.jpeg?auto=compress&cs=tinysrgb&w=800',
    label: 'Kontabilitet',
  },
  {
    src: 'https://images.pexels.com/photos/1427541/pexels-photo-1427541.jpeg?auto=compress&cs=tinysrgb&w=800',
    label: 'Transport',
  },
];

type AccordionKey = 'modules' | 'solutions' | 'why' | 'plans' | 'resources';

interface AccordionSectionProps {
  id: AccordionKey;
  open: AccordionKey | null;
  onToggle: (key: AccordionKey) => void;
  icon: LucideIcon;
  iconAccent: string;
  badge: string;
  title: string;
  subtitle: string;
  children: ReactNode;
}

function AccordionSection({ id, open, onToggle, icon: Icon, iconAccent, badge, title, subtitle, children }: AccordionSectionProps) {
  const isOpen = open === id;
  return (
    <section id={id} className="border-b border-slate-200 scroll-mt-24">
      <button
        type="button"
        onClick={() => onToggle(id)}
        aria-expanded={isOpen}
        aria-controls={`panel-${id}`}
        className="w-full flex items-center gap-4 px-4 sm:px-6 py-6 text-left hover:bg-slate-50 transition-colors group"
      >
        <span className={`inline-flex p-3 rounded-2xl ${iconAccent} flex-shrink-0`}>
          <Icon className="h-6 w-6" />
        </span>
        <span className="flex-1 min-w-0">
          <span className="block text-[11px] font-semibold tracking-wider uppercase text-slate-500">{badge}</span>
          <span className="block mt-0.5 text-lg sm:text-xl font-bold text-slate-900">{title}</span>
          <span className="block mt-0.5 text-sm text-slate-500 line-clamp-1">{subtitle}</span>
        </span>
        <span
          className={`flex-shrink-0 inline-flex items-center justify-center w-10 h-10 rounded-full bg-slate-100 text-slate-500 transition-all ${
            isOpen ? 'bg-teal-600 text-white rotate-180' : 'group-hover:bg-slate-200'
          }`}
        >
          <ChevronDown className="h-5 w-5" />
        </span>
      </button>
      <div
        id={`panel-${id}`}
        className={`grid transition-all duration-500 ease-in-out ${isOpen ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'}`}
      >
        <div className="overflow-hidden">
          <div className="px-4 sm:px-6 pb-10">{children}</div>
        </div>
      </div>
    </section>
  );
}

export default function HomePage() {
  const [scrolled, setScrolled] = useState(false);
  const [showScrollTop, setShowScrollTop] = useState(false);
  const [banners, setBanners] = useState<BannerItem[]>([]);
  const [logisticsPlans, setLogisticsPlans] = useState<PricingPlan[]>([]);
  const [accountingPlans, setAccountingPlans] = useState<PricingPlan[]>([]);
  const [pricingTab, setPricingTab] = useState<ProductType>('logistics');
  const [pricingLoading, setPricingLoading] = useState(true);
  const [pricingError, setPricingError] = useState<string | null>(null);
  const [openSection, setOpenSection] = useState<AccordionKey | null>(null);
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

  useEffect(() => {
    const opener = () => {
      const hash = window.location.hash.replace('#', '');
      if (['modules', 'solutions', 'why', 'plans', 'resources'].includes(hash)) {
        setOpenSection(hash as AccordionKey);
      }
    };
    opener();
    window.addEventListener('hashchange', opener);
    return () => window.removeEventListener('hashchange', opener);
  }, []);

  const scrollToTop = () => window.scrollTo({ top: 0, behavior: 'smooth' });

  const heroBanner = banners[0];
  const platformName = platformSettings.name || 'Business Suite';

  const toggleSection = (key: AccordionKey) => {
    setOpenSection((cur) => (cur === key ? null : key));
  };

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

            <div className="flex items-center gap-2 lg:gap-3">
              <LanguageSwitcher variant="header" />
              <Link
                to="/login"
                className={`inline-flex items-center px-3.5 py-2 lg:px-5 lg:py-2.5 rounded-lg text-sm font-semibold transition-all ${
                  scrolled
                    ? 'bg-teal-600 text-white hover:bg-teal-700 shadow-sm shadow-teal-600/30'
                    : 'bg-white/10 hover:bg-white/20 backdrop-blur-sm border border-white/20 text-white'
                }`}
              >
                {t('home.v2.nav.login')}
              </Link>
            </div>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section
        id="platform"
        className="relative pt-28 pb-20 lg:pt-36 lg:pb-28 overflow-hidden bg-gradient-to-br from-slate-900 via-slate-900 to-teal-900 text-white"
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

              <div className="mt-8 flex flex-col sm:flex-row gap-3">
                <Link
                  to="/register"
                  className="inline-flex items-center justify-center gap-2 px-7 py-4 rounded-xl bg-teal-500 hover:bg-teal-400 text-white font-semibold shadow-lg shadow-teal-500/30 transition-all hover:scale-[1.02]"
                >
                  {t('home.v2.hero.ctaPrimary')}
                  <ArrowRight className="h-5 w-5" />
                </Link>
                <button
                  type="button"
                  onClick={() => {
                    setOpenSection('modules');
                    document.getElementById('modules')?.scrollIntoView({ behavior: 'smooth' });
                  }}
                  className="inline-flex items-center justify-center gap-2 px-7 py-4 rounded-xl border border-white/20 text-white font-semibold hover:bg-white/10 transition-all"
                >
                  <PlayCircle className="h-5 w-5" />
                  {t('home.v2.hero.ctaSecondary')}
                </button>
              </div>

              <div className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-3 text-sm text-slate-300">
                <div className="inline-flex items-center gap-2"><Check className="h-4 w-4 text-teal-300" /> {t('home.v2.hero.perk1')}</div>
                <div className="inline-flex items-center gap-2"><Check className="h-4 w-4 text-teal-300" /> {t('home.v2.hero.perk2')}</div>
                <div className="inline-flex items-center gap-2"><Check className="h-4 w-4 text-teal-300" /> {t('home.v2.hero.perk3')}</div>
              </div>

              <div className="mt-10 grid grid-cols-4 gap-4 max-w-lg">
                {stats.map((s) => (
                  <div key={s.label} className="text-center">
                    <div className="text-xl sm:text-2xl font-extrabold text-white">{s.value}</div>
                    <div className="mt-0.5 text-[11px] text-slate-400 leading-tight">{s.label}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Photo collage */}
            <div className="relative">
              <div className="grid grid-cols-2 gap-3 sm:gap-4">
                {HERO_PHOTOS.map((photo, i) => (
                  <div
                    key={photo.src}
                    className={`relative rounded-2xl overflow-hidden border border-white/10 shadow-2xl group ${
                      i === 0 ? 'aspect-[4/5] translate-y-4' : ''
                    } ${i === 1 ? 'aspect-[4/5] -translate-y-2' : ''} ${i === 2 ? 'aspect-[4/5] -translate-y-2' : ''} ${
                      i === 3 ? 'aspect-[4/5] translate-y-4' : ''
                    }`}
                  >
                    <img
                      src={photo.src}
                      alt={photo.label}
                      loading="lazy"
                      className="absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition-transform duration-700"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-slate-950/90 via-slate-950/20 to-transparent" />
                    <span className="absolute bottom-3 left-3 right-3 text-xs sm:text-sm font-semibold tracking-wide">
                      {photo.label}
                    </span>
                  </div>
                ))}
              </div>
              <div className="absolute -bottom-4 -left-4 hidden sm:flex items-center gap-3 rounded-2xl bg-white text-slate-800 shadow-xl p-4 max-w-[260px]">
                <div className="p-2 rounded-xl bg-emerald-100 text-emerald-700 flex-shrink-0">
                  <Check className="h-5 w-5" />
                </div>
                <div className="leading-tight">
                  <div className="text-xs text-slate-500">{t('home.v2.hero.deliveryConfirmed')}</div>
                  <div className="text-sm font-semibold">#INV-20418</div>
                </div>
              </div>
              <div className="absolute -top-3 -right-3 hidden sm:flex items-center gap-2 rounded-full bg-teal-500 text-white text-xs font-semibold px-4 py-2 shadow-lg shadow-teal-500/40">
                <Sparkles className="h-3.5 w-3.5" />
                {t('home.v2.hero.live')}
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
              <a href={heroBanner.link_url} className="inline-flex items-center gap-1 text-sm font-semibold text-teal-600 hover:text-teal-700">
                {heroBanner.link_text}
                <ArrowRight className="h-4 w-4" />
              </a>
            )}
          </div>
        </section>
      )}

      {/* Accordion sections */}
      <section className="bg-white">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
          <div className="text-center mb-8">
            <span className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-teal-50 text-teal-700 text-sm font-medium">
              <Layers className="h-4 w-4" /> Permbajtja
            </span>
            <h2 className="mt-3 text-2xl sm:text-3xl font-bold text-slate-900">Eksploro platformen</h2>
            <p className="mt-2 text-slate-600 text-sm sm:text-base">Klikoni titullin per te hapur seksionin perkates.</p>
          </div>

          <div className="rounded-3xl bg-white border border-slate-200 shadow-sm overflow-hidden">
            <AccordionSection
              id="modules"
              open={openSection}
              onToggle={toggleSection}
              icon={Boxes}
              iconAccent="bg-teal-50 text-teal-600"
              badge={t('home.v2.modules.badge')}
              title={`${t('home.v2.modules.title')} ${t('home.v2.modules.titleHighlight')}`}
              subtitle={t('home.v2.modules.subtitle')}
            >
              <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {MODULE_KEYS.map((k) => {
                  const Icon = MODULE_ICONS[k];
                  return (
                    <div key={k} className="group rounded-2xl bg-slate-50 border border-slate-100 p-5 hover:border-teal-300 hover:bg-white hover:shadow-md transition-all">
                      <div className="inline-flex p-2.5 rounded-xl bg-white text-teal-600 group-hover:bg-teal-600 group-hover:text-white transition-colors">
                        <Icon className="h-5 w-5" />
                      </div>
                      <span className="mt-3 block text-[10px] font-semibold tracking-wider uppercase text-slate-400">
                        {t(`home.v2.modules.items.${k}.tag`)}
                      </span>
                      <h3 className="mt-1 text-base font-bold text-slate-900">{t(`home.v2.modules.items.${k}.title`)}</h3>
                      <p className="mt-1.5 text-sm text-slate-600 leading-relaxed">{t(`home.v2.modules.items.${k}.description`)}</p>
                    </div>
                  );
                })}
              </div>
            </AccordionSection>

            <AccordionSection
              id="solutions"
              open={openSection}
              onToggle={toggleSection}
              icon={Workflow}
              iconAccent="bg-emerald-50 text-emerald-600"
              badge={t('home.v2.solutions.badge')}
              title={`${t('home.v2.solutions.title')} ${t('home.v2.solutions.titleHighlight')}`}
              subtitle={t('home.v2.solutions.subtitle')}
            >
              <div className="grid md:grid-cols-3 gap-5">
                {SOLUTION_KEYS.map((k) => {
                  const Icon = SOLUTION_ICONS[k];
                  return (
                    <div key={k} className="rounded-2xl p-6 bg-slate-50 border border-slate-100 hover:border-teal-200 hover:shadow-md transition-all">
                      <div className="inline-flex p-2.5 rounded-xl bg-white shadow-sm text-teal-600">
                        <Icon className="h-6 w-6" />
                      </div>
                      <h3 className="mt-4 text-lg font-bold text-slate-900">{t(`home.v2.solutions.items.${k}.title`)}</h3>
                      <p className="mt-1.5 text-sm text-slate-600 leading-relaxed">{t(`home.v2.solutions.items.${k}.description`)}</p>
                      <ul className="mt-4 space-y-2">
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
            </AccordionSection>

            <AccordionSection
              id="why"
              open={openSection}
              onToggle={toggleSection}
              icon={Shield}
              iconAccent="bg-slate-100 text-slate-700"
              badge={`${t('home.v2.why.badgePrefix')} ${platformName}`}
              title={`${t('home.v2.why.title')} ${t('home.v2.why.titleHighlight')}`}
              subtitle={t('home.v2.why.subtitle')}
            >
              <div className="grid sm:grid-cols-2 gap-4">
                {DIFFERENTIATOR_KEYS.map((k) => {
                  const Icon = DIFFERENTIATOR_ICONS[k];
                  return (
                    <div key={k} className="rounded-2xl bg-slate-900 text-white p-5">
                      <div className="inline-flex p-2.5 rounded-xl bg-teal-500/20 text-teal-300">
                        <Icon className="h-5 w-5" />
                      </div>
                      <h3 className="mt-3 text-base font-bold">{t(`home.v2.why.items.${k}.title`)}</h3>
                      <p className="mt-1 text-sm text-slate-300">{t(`home.v2.why.items.${k}.description`)}</p>
                    </div>
                  );
                })}
              </div>
            </AccordionSection>

            <AccordionSection
              id="plans"
              open={openSection}
              onToggle={toggleSection}
              icon={BarChart3}
              iconAccent="bg-teal-50 text-teal-600"
              badge={t('home.v2.plans.badge')}
              title={`${t('home.v2.plans.title')} ${t('home.v2.plans.titleHighlight')}`}
              subtitle={t('home.v2.plans.subtitle')}
            >
              <div className="flex justify-center mb-8">
                <div className="inline-flex rounded-xl bg-slate-100 p-1 gap-1">
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
                          active ? 'bg-white text-teal-700 shadow-sm' : 'text-slate-600 hover:text-slate-900'
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
                  <div className={`grid ${cols} gap-5`}>
                    {activePlans.map((plan) => (
                      <div
                        key={plan.id}
                        className={`relative rounded-2xl p-6 transition-all ${
                          plan.popular
                            ? 'bg-slate-900 text-white shadow-2xl border-2 border-teal-500'
                            : 'bg-white border border-slate-200 hover:border-teal-300 hover:shadow-lg'
                        }`}
                      >
                        {plan.popular && (
                          <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                            <span className="bg-teal-500 text-white text-[10px] font-bold px-3 py-1 rounded-full uppercase tracking-wider">
                              {t('home.v2.plans.mostPopular')}
                            </span>
                          </div>
                        )}
                        <div className={`inline-flex p-2.5 rounded-xl mb-3 ${plan.popular ? 'bg-teal-500/20' : 'bg-teal-50'}`}>
                          <plan.icon className={`h-5 w-5 ${plan.popular ? 'text-teal-300' : 'text-teal-600'}`} />
                        </div>
                        <h3 className={`text-lg font-bold ${plan.popular ? 'text-white' : 'text-slate-900'}`}>{plan.name}</h3>
                        <p className={`mt-1 text-xs ${plan.popular ? 'text-slate-300' : 'text-slate-500'}`}>{plan.description}</p>
                        <div className="mt-4 mb-5 flex items-baseline gap-1">
                          <span className={`text-3xl font-extrabold ${plan.popular ? 'text-white' : 'text-slate-900'}`}>
                            {plan.price === 0 ? t('home.v2.plans.free') : `${plan.price}\u20AC`}
                          </span>
                          {plan.price > 0 && (
                            <span className={`text-xs ${plan.popular ? 'text-slate-400' : 'text-slate-500'}`}>/{plan.period}</span>
                          )}
                        </div>
                        <ul className="space-y-2 mb-5">
                          {plan.features.map((f) => (
                            <li key={f} className="flex items-start gap-2">
                              <Check className={`h-4 w-4 mt-0.5 flex-shrink-0 ${plan.popular ? 'text-teal-300' : 'text-teal-600'}`} />
                              <span className={`text-xs ${plan.popular ? 'text-slate-300' : 'text-slate-700'}`}>{f}</span>
                            </li>
                          ))}
                        </ul>
                        <Link
                          to={`/register?plan=${plan.slug}&type=${plan.productType}`}
                          className={`block w-full text-center py-2.5 rounded-xl text-sm font-semibold transition-all ${
                            plan.popular ? 'bg-teal-500 text-white hover:bg-teal-400' : 'bg-slate-900 text-white hover:bg-slate-800'
                          }`}
                        >
                          {plan.cta}
                        </Link>
                      </div>
                    ))}
                  </div>
                );
              })()}
            </AccordionSection>

            <AccordionSection
              id="resources"
              open={openSection}
              onToggle={toggleSection}
              icon={Sparkles}
              iconAccent="bg-amber-50 text-amber-600"
              badge="Burime"
              title={t('home.v2.cta.title')}
              subtitle={t('home.v2.cta.subtitle')}
            >
              <div className="rounded-2xl bg-gradient-to-br from-teal-600 to-emerald-600 text-white p-8 text-center">
                <h3 className="text-2xl sm:text-3xl font-extrabold">{t('home.v2.cta.title')}</h3>
                <p className="mt-3 text-white/90 max-w-xl mx-auto">{t('home.v2.cta.subtitle')}</p>
                <div className="mt-6 flex flex-col sm:flex-row items-center justify-center gap-3">
                  <Link
                    to="/register"
                    className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-white text-teal-700 font-semibold hover:bg-slate-100 transition-all shadow-lg"
                  >
                    {t('home.v2.cta.primary')}
                    <ArrowRight className="h-5 w-5" />
                  </Link>
                  <Link
                    to="/login"
                    className="inline-flex items-center gap-2 px-6 py-3 rounded-xl border-2 border-white/30 text-white font-semibold hover:bg-white/10 transition-all"
                  >
                    <LogIn className="h-5 w-5" />
                    {t('home.v2.cta.secondary')}
                  </Link>
                </div>
              </div>
            </AccordionSection>
          </div>
        </div>
      </section>

      <PublicFooter />

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
