import { useState, useEffect, useRef, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Package, ChevronUp, Apple } from 'lucide-react';
import { useTranslation } from '../i18n';
import LanguageSwitcher from '../components/LanguageSwitcher';
import { usePlatformSettings } from '../hooks/usePlatformSettings';

export default function HomePage() {
  const [scrolled, setScrolled] = useState(false);
  const [showScrollTop, setShowScrollTop] = useState(false);
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
    function onScroll() {
      setScrolled(window.scrollY > 8);
      setShowScrollTop(window.scrollY > 400);
    }
    window.addEventListener('scroll', onScroll);
    onScroll();
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const platformName = platformSettings.name || 'MM Logistic';
  const logoUrl = platformSettings.logo || '/mm-logistic-logo.png';

  return (
    <div className="min-h-screen bg-slate-950 text-white flex flex-col">
      {/* NAV */}
      <nav className={`fixed top-0 inset-x-0 z-50 transition-all duration-300 ${scrolled ? 'bg-slate-950/95 backdrop-blur-md border-b border-slate-800' : 'bg-transparent'}`}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16 lg:h-20">
            <Link to="/" className="flex items-center gap-2.5">
              {platformSettings.logo ? (
                <img src={platformSettings.logo} alt={platformName} onClick={handleSecretClick} className="h-10 rounded-xl object-contain cursor-pointer" />
              ) : (
                <div onClick={handleSecretClick} className="p-2 rounded-xl bg-white/10 text-white backdrop-blur-sm cursor-pointer">
                  <Package className="h-6 w-6" />
                </div>
              )}
              <span className="font-bold text-lg tracking-tight">{platformName}</span>
            </Link>

            <div className="flex items-center gap-2 sm:gap-3">
              <LanguageSwitcher variant="header" />
              <Link to="/login" className="inline-flex items-center px-4 py-2 sm:px-5 sm:py-2.5 rounded-lg text-sm font-semibold bg-white/10 hover:bg-white/20 backdrop-blur-sm border border-white/20 text-white transition-all">
                {t('home.v3.nav.login')}
              </Link>
            </div>
          </div>
        </div>
      </nav>

      {/* HERO */}
      <section className="relative flex-1 flex items-center justify-center min-h-screen overflow-hidden">
        {/* Logo watermark background */}
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <img
            src={logoUrl}
            alt=""
            className="w-[320px] sm:w-[420px] lg:w-[520px] opacity-[0.04] select-none"
            draggable={false}
          />
        </div>

        {/* Subtle gradient overlays */}
        <div className="absolute inset-0 bg-gradient-to-b from-slate-950 via-slate-900/50 to-slate-950 pointer-events-none" />

        <div className="relative max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 text-center py-32">
          <Link
            to="/login"
            className="inline-flex items-center justify-center px-6 py-2.5 rounded-lg bg-white/10 hover:bg-white/20 backdrop-blur-sm border border-white/20 text-white font-semibold transition-all text-sm"
          >
            {t('home.minimal.login')}
          </Link>

          {/* Divider line */}
          <div className="mt-10 flex items-center gap-3 max-w-md mx-auto">
            <div className="flex-1 h-px bg-gradient-to-r from-transparent via-slate-700 to-transparent" />
            <div className="flex gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-teal-500/60" />
              <span className="w-1.5 h-1.5 rounded-full bg-slate-600" />
              <span className="w-1.5 h-1.5 rounded-full bg-slate-600" />
            </div>
            <div className="flex-1 h-px bg-gradient-to-r from-transparent via-slate-700 to-transparent" />
          </div>

          <h1 className="mt-10 text-3xl sm:text-4xl lg:text-5xl font-extrabold leading-[1.15] tracking-tight text-white">
            {t('home.minimal.title')}
          </h1>
          <p className="mt-5 text-base sm:text-lg text-slate-500 max-w-xl mx-auto leading-relaxed">
            {t('home.minimal.subtitle')}
          </p>

          <div className="mt-12">
            <Link
              to="/register"
              className="inline-flex items-center justify-center px-8 py-4 rounded-xl bg-teal-600 hover:bg-teal-500 text-white font-semibold shadow-lg shadow-teal-600/20 transition-all hover:scale-[1.02] text-base"
            >
              {t('home.minimal.register')}
            </Link>
          </div>
        </div>
      </section>

      {/* FOOTER */}
      <footer className="bg-slate-950 border-t border-slate-800 py-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-8">
            {/* Branding */}
            <div>
              <div className="flex items-center gap-2.5">
                {platformSettings.logo ? (
                  <img src={platformSettings.logo} alt={platformName} className="h-8 rounded-lg object-contain" />
                ) : (
                  <div className="p-1.5 rounded-lg bg-teal-600"><Package className="h-4 w-4" /></div>
                )}
                <span className="font-bold text-white">{platformName}</span>
              </div>
              <p className="mt-3 text-sm text-slate-500 leading-relaxed">
                {t('home.minimal.footerDesc')}
              </p>
            </div>

            {/* Platform */}
            <div>
              <h4 className="text-white font-semibold text-sm mb-3">{t('home.minimal.footerPlatform')}</h4>
              <ul className="space-y-2 text-sm">
                <li>
                  <a href="/features" target="_blank" rel="noopener noreferrer" className="text-slate-400 hover:text-white transition">
                    {t('home.minimal.footerFeatures')}
                  </a>
                </li>
                <li>
                  <a href="/features#pricing" target="_blank" rel="noopener noreferrer" className="text-slate-400 hover:text-white transition">
                    {t('home.minimal.footerPricing')}
                  </a>
                </li>
              </ul>
            </div>

            {/* Legal */}
            <div>
              <h4 className="text-white font-semibold text-sm mb-3">{t('home.v3.footer.legal')}</h4>
              <ul className="space-y-2 text-sm">
                <li><a href="/legal/impressum" target="_blank" rel="noopener noreferrer" className="text-slate-400 hover:text-white transition">{t('legal.nav.impressum')}</a></li>
                <li><a href="/legal/privacy" target="_blank" rel="noopener noreferrer" className="text-slate-400 hover:text-white transition">{t('legal.nav.privacy')}</a></li>
                <li><a href="/legal/terms" target="_blank" rel="noopener noreferrer" className="text-slate-400 hover:text-white transition">{t('legal.nav.terms')}</a></li>
                <li><a href="/legal/cookies" target="_blank" rel="noopener noreferrer" className="text-slate-400 hover:text-white transition">{t('legal.nav.cookies')}</a></li>
                <li><a href="/legal/dpa" target="_blank" rel="noopener noreferrer" className="text-slate-400 hover:text-white transition">{t('legal.nav.dpa')}</a></li>
              </ul>
            </div>

            {/* App Download */}
            <div>
              <h4 className="text-white font-semibold text-sm mb-3">{t('home.minimal.footerApp')}</h4>
              <div className="flex flex-col gap-2">
                <a
                  href="#"
                  className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 hover:border-slate-600 transition text-xs text-slate-300 hover:text-white"
                >
                  <Apple className="h-4 w-4" />
                  <span>App Store</span>
                </a>
                <a
                  href="#"
                  className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 hover:border-slate-600 transition text-xs text-slate-300 hover:text-white"
                >
                  <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor"><path d="M3.609 1.814L13.792 12 3.61 22.186a.996.996 0 01-.61-.92V2.734a1 1 0 01.609-.92zm10.89 10.893l2.302 2.302-10.937 6.333 8.635-8.635zm3.199-3.198l2.807 1.626a1 1 0 010 1.73l-2.808 1.626L15.206 12l2.492-2.491zM5.864 2.658L16.8 8.99l-2.302 2.302-8.634-8.634z"/></svg>
                  <span>Google Play</span>
                </a>
              </div>
            </div>
          </div>

          <div className="mt-10 pt-6 border-t border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-600">
            <span>&copy; {new Date().getFullYear()} {platformName}. {t('home.v3.footer.rights')}</span>
            <span>Sajti i krijuar nga <span className="text-slate-500 font-medium">Mar Group</span></span>
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
