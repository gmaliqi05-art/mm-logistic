import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowRight,
  ChevronUp,
  ChevronDown,
  Package,
  Truck,
  Ship,
  Warehouse,
  Receipt,
  Cpu,
  RefreshCw,
  Eye,
  HeadphonesIcon,
  Menu,
  X,
  Apple,
  CheckCircle2,
  Mail,
  Phone,
  MapPin,
} from 'lucide-react';
import { useTranslation } from '../../i18n';
import LanguageSwitcher from '../../components/LanguageSwitcher';
import { usePlatformSettings } from '../../hooks/usePlatformSettings';

const HERO_FEATURES = [
  { icon: Package, titleKey: 'home.web.heroFeat1Title', descKey: 'home.web.heroFeat1Desc' },
  { icon: Truck, titleKey: 'home.web.heroFeat2Title', descKey: 'home.web.heroFeat2Desc' },
  { icon: Warehouse, titleKey: 'home.web.heroFeat3Title', descKey: 'home.web.heroFeat3Desc' },
  { icon: Receipt, titleKey: 'home.web.heroFeat4Title', descKey: 'home.web.heroFeat4Desc' },
] as const;

const WHY_US = [
  { icon: Cpu, titleKey: 'home.web.why1Title', descKey: 'home.web.why1Desc' },
  { icon: RefreshCw, titleKey: 'home.web.why2Title', descKey: 'home.web.why2Desc' },
  { icon: Eye, titleKey: 'home.web.why3Title', descKey: 'home.web.why3Desc' },
  { icon: HeadphonesIcon, titleKey: 'home.web.why4Title', descKey: 'home.web.why4Desc' },
] as const;

const NAV_LINKS = [
  { key: 'home', href: '#hero' },
  { key: 'about', href: '#about' },
  { key: 'platform', href: '#platform' },
  { key: 'features', href: '/features' },
  { key: 'contact', href: '#contact' },
] as const;

const TRUSTED_LOGOS: { name: string; sub?: string; style: string }[] = [
  { name: 'ATL', style: 'font-black italic tracking-tighter' },
  { name: 'BESI', sub: 'TRANSPORT', style: 'font-extrabold tracking-tight' },
  { name: 'ALB-TRANS', sub: 'AGJENSI DOGANORE', style: 'font-bold' },
  { name: 'ALBSIG', sub: 'GROUP', style: 'font-black tracking-wider' },
  { name: 'FLEETWAY', sub: 'SOLUTIONS', style: 'font-extrabold' },
  { name: 'EUROPA', sub: 'SERVICES', style: 'font-bold italic' },
];

interface Props {
  onSecretClick: () => void;
}

export default function HomeWebView({ onSecretClick }: Props) {
  const { t } = useTranslation();
  const { settings } = usePlatformSettings();
  const [scrolled, setScrolled] = useState(false);
  const [showScrollTop, setShowScrollTop] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [servicesOpen, setServicesOpen] = useState(false);

  const platformName = settings.name || 'MM Logistic';

  useEffect(() => {
    function onScroll() {
      setScrolled(window.scrollY > 8);
      setShowScrollTop(window.scrollY > 400);
    }
    window.addEventListener('scroll', onScroll);
    onScroll();
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const scrollToSection = (href: string) => {
    setMobileMenuOpen(false);
    if (href.startsWith('#')) {
      const el = document.querySelector(href);
      if (el) el.scrollIntoView({ behavior: 'smooth' });
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-white flex flex-col">
      {/* ========== NAVIGATION ========== */}
      <nav className={`fixed top-0 inset-x-0 z-50 transition-all duration-300 ${scrolled ? 'bg-slate-950/95 backdrop-blur-md border-b border-slate-800' : 'bg-transparent'}`}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16 lg:h-20">
            {/* Logo */}
            <Link to="/" className="flex items-center gap-2.5">
              {settings.logo ? (
                <img src={settings.logo} alt={platformName} onClick={onSecretClick} className="h-10 rounded-xl object-contain cursor-pointer" />
              ) : (
                <div onClick={onSecretClick} className="p-2 rounded-xl bg-white/10 text-white backdrop-blur-sm cursor-pointer">
                  <Ship className="h-6 w-6" />
                </div>
              )}
              <span className="font-bold text-lg tracking-tight">
                MM <span className="text-teal-400">LOGISTIC</span>
              </span>
            </Link>

            {/* Desktop Links */}
            <div className="hidden lg:flex items-center gap-1">
              {NAV_LINKS.map((link) => {
                if (link.key === 'about') {
                  return (
                    <div key={link.key} className="relative group">
                      <button
                        onClick={() => setServicesOpen(!servicesOpen)}
                        className="flex items-center gap-1 px-3 py-2 text-sm font-medium text-slate-300 hover:text-white transition-colors rounded-lg hover:bg-white/5"
                      >
                        {t(`home.web.nav.${link.key}`)}
                        <ChevronDown className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  );
                }
                if (link.href.startsWith('#')) {
                  return (
                    <button
                      key={link.key}
                      onClick={() => scrollToSection(link.href)}
                      className="px-3 py-2 text-sm font-medium text-slate-300 hover:text-white transition-colors rounded-lg hover:bg-white/5"
                    >
                      {t(`home.web.nav.${link.key}`)}
                    </button>
                  );
                }
                return (
                  <Link
                    key={link.key}
                    to={link.href}
                    className="px-3 py-2 text-sm font-medium text-slate-300 hover:text-white transition-colors rounded-lg hover:bg-white/5"
                  >
                    {t(`home.web.nav.${link.key}`)}
                  </Link>
                );
              })}
            </div>

            {/* Right side */}
            <div className="flex items-center gap-2 sm:gap-3">
              <LanguageSwitcher variant="header" />
              <Link
                to="/login"
                className="hidden sm:inline-flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-semibold bg-teal-600 hover:bg-teal-500 text-white transition-all shadow-lg shadow-teal-600/20"
              >
                {t('home.web.nav.login')}
                <ArrowRight className="h-4 w-4" />
              </Link>
              <button
                onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                className="lg:hidden p-2 rounded-lg text-slate-300 hover:text-white hover:bg-white/10 transition"
              >
                {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
              </button>
            </div>
          </div>
        </div>

        {/* Mobile Menu */}
        {mobileMenuOpen && (
          <div className="lg:hidden bg-slate-950/98 backdrop-blur-xl border-t border-slate-800">
            <div className="max-w-7xl mx-auto px-4 py-4 space-y-1">
              {NAV_LINKS.map((link) => (
                link.href.startsWith('#') ? (
                  <button
                    key={link.key}
                    onClick={() => scrollToSection(link.href)}
                    className="block w-full text-left px-4 py-3 text-sm font-medium text-slate-300 hover:text-white hover:bg-white/5 rounded-lg transition"
                  >
                    {t(`home.web.nav.${link.key}`)}
                  </button>
                ) : (
                  <Link
                    key={link.key}
                    to={link.href}
                    onClick={() => setMobileMenuOpen(false)}
                    className="block px-4 py-3 text-sm font-medium text-slate-300 hover:text-white hover:bg-white/5 rounded-lg transition"
                  >
                    {t(`home.web.nav.${link.key}`)}
                  </Link>
                )
              ))}
              <Link
                to="/login"
                className="block w-full text-center px-4 py-3 mt-2 rounded-lg bg-teal-600 text-white font-semibold text-sm"
              >
                {t('home.web.nav.login')}
              </Link>
            </div>
          </div>
        )}
      </nav>

      {/* ========== HERO ========== */}
      <section id="hero" className="relative min-h-screen flex items-center overflow-hidden">
        <div className="absolute inset-0">
          <img
            src="/homepage/hero-bg.webp"
            alt=""
            className="w-full h-full object-cover"
            loading="eager"
          />
          <div className="absolute inset-0 bg-gradient-to-r from-slate-950 via-slate-950/80 to-slate-950/40" />
          <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-transparent to-slate-950/60" />
        </div>

        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 w-full pt-32 pb-16">
          <div className="max-w-2xl">
            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold leading-[1.1] tracking-tight">
              <span className="italic">{t('home.web.heroTitle1')}</span>
              <span className="text-teal-400">.</span>
            </h1>
            <p className="mt-6 text-base sm:text-lg text-slate-300 leading-relaxed max-w-xl">
              {t('home.web.heroSubtitle')}
            </p>

            <div className="mt-8 flex flex-wrap gap-3">
              <Link
                to="/register"
                className="inline-flex items-center gap-2 px-6 py-3.5 rounded-lg bg-teal-600 hover:bg-teal-500 text-white font-semibold transition-all shadow-lg shadow-teal-600/20 hover:scale-[1.02]"
              >
                {t('home.web.heroCta1')}
                <ArrowRight className="h-4 w-4" />
              </Link>
              <Link
                to="/features"
                className="inline-flex items-center gap-2 px-6 py-3.5 rounded-lg bg-white/10 hover:bg-white/20 backdrop-blur-sm border border-white/20 text-white font-semibold transition-all"
              >
                {t('home.web.heroCta2')}
                <ArrowRight className="h-4 w-4" />
              </Link>
            </div>

            {/* App Download Badges */}
            {settings.appDownloadEnabled && (settings.playStoreUrl || settings.appStoreUrl) && (
              <div className="mt-8">
                <p className="text-xs text-slate-400 font-medium mb-3">{t('home.web.downloadApp')}:</p>
                <div className="flex gap-3">
                  {settings.playStoreUrl && (
                    <a href={settings.playStoreUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-black border border-slate-700 hover:border-slate-500 transition text-sm text-white">
                      <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor"><path d="M3.609 1.814L13.792 12 3.61 22.186a.996.996 0 01-.61-.92V2.734a1 1 0 01.609-.92zm10.89 10.893l2.302 2.302-10.937 6.333 8.635-8.635zm3.199-3.198l2.807 1.626a1 1 0 010 1.73l-2.808 1.626L15.206 12l2.492-2.491zM5.864 2.658L16.8 8.99l-2.302 2.302-8.634-8.634z" /></svg>
                      Google Play
                    </a>
                  )}
                  {settings.appStoreUrl && (
                    <a href={settings.appStoreUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-black border border-slate-700 hover:border-slate-500 transition text-sm text-white">
                      <Apple className="h-5 w-5" />
                      App Store
                    </a>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Feature Cards at bottom */}
          <div className="mt-16 grid grid-cols-2 lg:grid-cols-4 gap-3">
            {HERO_FEATURES.map((feat, i) => (
              <div key={i} className="flex items-start gap-3 p-4 rounded-xl bg-white/5 backdrop-blur-sm border border-white/10">
                <div className="w-10 h-10 rounded-lg bg-teal-500/15 border border-teal-500/25 flex items-center justify-center shrink-0">
                  <feat.icon className="h-5 w-5 text-teal-400" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white">{t(feat.titleKey)}</h3>
                  <p className="text-xs text-slate-400 mt-0.5 leading-relaxed">{t(feat.descKey)}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ========== TRUSTED COMPANIES ========== */}
      <section className="bg-slate-100 py-8">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500 mb-6">
            {t('home.web.trustedTitle')}
          </p>
          <div className="flex flex-wrap items-center gap-8 md:gap-12">
            {TRUSTED_LOGOS.map((logo, i) => (
              <div key={i} className="flex flex-col items-center opacity-40 hover:opacity-60 transition-opacity">
                <span className={`text-lg md:text-xl text-slate-800 ${logo.style}`}>{logo.name}</span>
                {logo.sub && <span className="text-[9px] tracking-widest text-slate-500 uppercase">{logo.sub}</span>}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ========== PLATFORM SHOWCASE ========== */}
      <section id="platform" className="bg-white py-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            {/* Text */}
            <div>
              <span className="text-xs font-bold uppercase tracking-[0.2em] text-teal-600">
                {t('home.web.showcaseLabel')}
              </span>
              <h2 className="mt-4 text-3xl sm:text-4xl font-extrabold text-slate-900 leading-tight">
                {t('home.web.showcaseTitle1')}<br />
                {t('home.web.showcaseTitle2')}<br />
                {t('home.web.showcaseTitle3')}
              </h2>
              <p className="mt-5 text-slate-600 leading-relaxed">
                {t('home.web.showcaseDesc')}
              </p>
              <ul className="mt-6 space-y-3">
                {(['check1', 'check2', 'check3', 'check4'] as const).map((k) => (
                  <li key={k} className="flex items-center gap-3 text-sm text-slate-700">
                    <CheckCircle2 className="h-5 w-5 text-teal-500 shrink-0" />
                    {t(`home.web.showcase.${k}`)}
                  </li>
                ))}
              </ul>
              <Link
                to="/features"
                className="inline-flex items-center gap-2 mt-8 px-6 py-3 rounded-lg bg-teal-600 hover:bg-teal-500 text-white font-semibold transition-all shadow-lg shadow-teal-600/20 hover:scale-[1.02]"
              >
                {t('home.web.showcaseCta')}
                <ArrowRight className="h-4 w-4" />
              </Link>
            </div>

            {/* Mockups */}
            <div className="relative">
              <img
                src="/homepage/dashboard-mockup.webp"
                alt="MM Logistic Dashboard"
                className="w-full rounded-xl shadow-2xl"
                loading="lazy"
              />
              <img
                src="/homepage/phone-mockup.webp"
                alt="MM Logistic App"
                className="absolute -bottom-8 -right-4 w-36 sm:w-44 rounded-xl shadow-2xl border-4 border-white"
                loading="lazy"
              />
            </div>
          </div>
        </div>
      </section>

      {/* ========== WHY MM LOGISTIC ========== */}
      <section id="about" className="bg-slate-50 py-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <h2 className="text-center text-xs font-bold uppercase tracking-[0.2em] text-slate-500 mb-10">
            {t('home.web.whyTitle')}
          </h2>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {WHY_US.map((item, i) => (
              <div key={i} className="text-center">
                <div className="inline-flex p-4 rounded-2xl bg-white border border-slate-200 shadow-sm mb-4">
                  <item.icon className="h-6 w-6 text-teal-600" />
                </div>
                <h3 className="text-sm font-bold text-slate-900">{t(item.titleKey)}</h3>
                <p className="mt-2 text-xs text-slate-500 leading-relaxed">{t(item.descKey)}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ========== APP DOWNLOAD CTA ========== */}
      <section className="relative py-16 overflow-hidden">
        <div className="absolute inset-0">
          <img
            src="/homepage/app-download-bg.webp"
            alt=""
            className="w-full h-full object-cover"
            loading="lazy"
          />
          <div className="absolute inset-0 bg-gradient-to-r from-slate-950/95 via-slate-950/80 to-slate-950/60" />
        </div>
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid lg:grid-cols-2 gap-10 items-center">
            <div>
              <h2 className="text-2xl sm:text-3xl font-extrabold text-white leading-tight">
                {t('home.web.appCtaTitle1')}<br />
                {t('home.web.appCtaTitle2')}
              </h2>
              <p className="mt-4 text-slate-300 text-sm leading-relaxed max-w-md">
                {t('home.web.appCtaDesc')}
              </p>
              {(settings.playStoreUrl || settings.appStoreUrl) && (
                <div className="mt-6 flex gap-3">
                  {settings.playStoreUrl && (
                    <a href={settings.playStoreUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 px-5 py-3 rounded-lg bg-black border border-slate-700 hover:border-slate-500 transition text-sm text-white font-medium">
                      <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor"><path d="M3.609 1.814L13.792 12 3.61 22.186a.996.996 0 01-.61-.92V2.734a1 1 0 01.609-.92zm10.89 10.893l2.302 2.302-10.937 6.333 8.635-8.635zm3.199-3.198l2.807 1.626a1 1 0 010 1.73l-2.808 1.626L15.206 12l2.492-2.491zM5.864 2.658L16.8 8.99l-2.302 2.302-8.634-8.634z" /></svg>
                      Google Play
                    </a>
                  )}
                  {settings.appStoreUrl && (
                    <a href={settings.appStoreUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 px-5 py-3 rounded-lg bg-black border border-slate-700 hover:border-slate-500 transition text-sm text-white font-medium">
                      <Apple className="h-5 w-5" />
                      App Store
                    </a>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* ========== FOOTER ========== */}
      <footer id="contact" className="bg-slate-950 border-t border-slate-800 pt-14 pb-6">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-8">
            {/* Branding */}
            <div className="col-span-2 sm:col-span-3 lg:col-span-1">
              <div className="flex items-center gap-2.5">
                {settings.logo ? (
                  <img src={settings.logo} alt={platformName} className="h-8 rounded-lg object-contain" />
                ) : (
                  <div className="p-1.5 rounded-lg bg-teal-600"><Ship className="h-4 w-4" /></div>
                )}
                <div>
                  <span className="font-bold text-white text-sm">MM LOGISTIC</span>
                  <p className="text-[9px] tracking-wider text-slate-500 uppercase">We care. We deliver</p>
                </div>
              </div>
              <p className="mt-3 text-xs text-slate-500 leading-relaxed">
                {t('home.web.footerDesc')}
              </p>
              {/* Social Icons */}
              <div className="mt-4 flex gap-2">
                {['facebook', 'linkedin', 'instagram'].map((social) => (
                  <div key={social} className="w-8 h-8 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center text-slate-400 hover:text-white hover:border-slate-600 transition cursor-pointer">
                    <SocialIcon name={social} />
                  </div>
                ))}
              </div>
            </div>

            {/* Quick Links */}
            <div>
              <h4 className="text-white font-semibold text-xs mb-3 uppercase tracking-wider">{t('home.web.footerQuickLinks')}</h4>
              <ul className="space-y-2 text-xs">
                <li><button onClick={() => scrollToSection('#hero')} className="text-slate-400 hover:text-white transition">{t('home.web.nav.home')}</button></li>
                <li><button onClick={() => scrollToSection('#about')} className="text-slate-400 hover:text-white transition">{t('home.web.nav.about')}</button></li>
                <li><button onClick={() => scrollToSection('#platform')} className="text-slate-400 hover:text-white transition">{t('home.web.nav.platform')}</button></li>
                <li><button onClick={() => scrollToSection('#contact')} className="text-slate-400 hover:text-white transition">{t('home.web.nav.contact')}</button></li>
              </ul>
            </div>

            {/* Platform */}
            <div>
              <h4 className="text-white font-semibold text-xs mb-3 uppercase tracking-wider">{t('home.web.footerPlatform')}</h4>
              <ul className="space-y-2 text-xs">
                <li><Link to="/features" className="text-slate-400 hover:text-white transition">{t('home.web.footerFeatures')}</Link></li>
                <li><Link to="/features#pricing" className="text-slate-400 hover:text-white transition">{t('home.web.footerPricing')}</Link></li>
                <li><Link to="/login" className="text-slate-400 hover:text-white transition">{t('home.web.footerLogin')}</Link></li>
              </ul>
            </div>

            {/* Legal */}
            <div>
              <h4 className="text-white font-semibold text-xs mb-3 uppercase tracking-wider">{t('home.web.footerLegal')}</h4>
              <ul className="space-y-2 text-xs">
                <li><Link to="/legal/impressum" className="text-slate-400 hover:text-white transition">{t('legal.nav.impressum')}</Link></li>
                <li><Link to="/legal/privacy" className="text-slate-400 hover:text-white transition">{t('legal.nav.privacy')}</Link></li>
                <li><Link to="/legal/terms" className="text-slate-400 hover:text-white transition">{t('legal.nav.terms')}</Link></li>
                <li><Link to="/legal/cookies" className="text-slate-400 hover:text-white transition">{t('legal.nav.cookies')}</Link></li>
                <li><Link to="/legal/dpa" className="text-slate-400 hover:text-white transition">{t('legal.nav.dpa')}</Link></li>
              </ul>
            </div>

            {/* Contact */}
            <div>
              <h4 className="text-white font-semibold text-xs mb-3 uppercase tracking-wider">{t('home.web.footerContact')}</h4>
              <ul className="space-y-3 text-xs">
                <li className="flex items-center gap-2 text-slate-400">
                  <Mail className="h-3.5 w-3.5 text-teal-500 shrink-0" />
                  <a href="mailto:info@mm-logistic.eu" className="hover:text-white transition">info@mm-logistic.eu</a>
                </li>
                <li className="flex items-center gap-2 text-slate-400">
                  <Phone className="h-3.5 w-3.5 text-teal-500 shrink-0" />
                  <a href="tel:+491728443861" className="hover:text-white transition">+49 172 844 38 61</a>
                </li>
                <li className="flex items-start gap-2 text-slate-400">
                  <MapPin className="h-3.5 w-3.5 text-teal-500 shrink-0 mt-0.5" />
                  <span>Pfadlistrasse 10, 79576 Weil am Rhein, Germany</span>
                </li>
              </ul>
            </div>
          </div>

          {/* Bottom bar */}
          <div className="mt-10 pt-6 border-t border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-3 text-[11px] text-slate-600">
            <span>&copy; {new Date().getFullYear()} {platformName}. {t('home.web.footerRights')}</span>
            <span>{t('home.web.footerBuiltBy')} <span className="text-slate-500 font-medium">Mar Group</span></span>
          </div>
        </div>
      </footer>

      {/* Scroll to top */}
      {showScrollTop && (
        <button
          onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
          className="fixed bottom-6 right-6 p-3 rounded-full bg-teal-600 text-white shadow-lg hover:bg-teal-700 transition-all z-50"
          aria-label="Scroll to top"
        >
          <ChevronUp className="h-5 w-5" />
        </button>
      )}
    </div>
  );
}

function SocialIcon({ name }: { name: string }) {
  switch (name) {
    case 'facebook':
      return (
        <svg className="h-3.5 w-3.5" fill="currentColor" viewBox="0 0 24 24"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" /></svg>
      );
    case 'linkedin':
      return (
        <svg className="h-3.5 w-3.5" fill="currentColor" viewBox="0 0 24 24"><path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" /></svg>
      );
    case 'instagram':
      return (
        <svg className="h-3.5 w-3.5" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z" /></svg>
      );
    default:
      return null;
  }
}
