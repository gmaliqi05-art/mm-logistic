import { Link } from 'react-router-dom';
import {
  ArrowRight,
  Building2,
  Truck,
  Warehouse,
  BarChart3,
  ShieldCheck,
  UserPlus,
} from 'lucide-react';
import { useTranslation } from '../../i18n';
import LanguageSwitcher from '../LanguageSwitcher';
import { usePlatformSettings } from '../../hooks/usePlatformSettings';

const FEATURES = [
  { icon: Building2, titleKey: 'home.app.feat1Title', descKey: 'home.app.feat1Desc' },
  { icon: Truck, titleKey: 'home.app.feat2Title', descKey: 'home.app.feat2Desc' },
  { icon: Warehouse, titleKey: 'home.app.feat3Title', descKey: 'home.app.feat3Desc' },
  { icon: BarChart3, titleKey: 'home.app.feat4Title', descKey: 'home.app.feat4Desc' },
  { icon: ShieldCheck, titleKey: 'home.app.feat5Title', descKey: 'home.app.feat5Desc' },
] as const;

interface Props {
  onSecretClick: () => void;
}

export default function HomeAppView({ onSecretClick }: Props) {
  const { t } = useTranslation();
  const { settings } = usePlatformSettings();
  const platformName = settings.name || 'MM Logistic';

  return (
    <div className="min-h-screen bg-slate-950 text-white flex flex-col">
      {/* Navbar */}
      <nav className="flex items-center justify-between px-5 pt-3 pb-2">
        <div className="w-8" />
        <span className="text-xs font-semibold text-slate-400 tracking-wide">{platformName}</span>
        <LanguageSwitcher variant="header" />
      </nav>

      {/* Logo + Branding */}
      <div className="pt-6 pb-2 flex flex-col items-center px-6">
        <div onClick={onSecretClick} className="cursor-pointer">
          {settings.logo ? (
            <img src={settings.logo} alt={platformName} className="h-20 w-20 rounded-2xl object-contain" />
          ) : (
            <div className="h-20 w-20 rounded-2xl bg-gradient-to-br from-teal-500 to-teal-700 flex items-center justify-center">
              <span className="text-2xl font-black text-white">MM</span>
            </div>
          )}
        </div>
        <h1 className="mt-3 text-xl font-black tracking-tight">
          MM <span className="text-teal-400">LOGISTIC</span>
        </h1>
        <p className="text-[10px] tracking-[0.25em] text-slate-500 uppercase mt-0.5">{t('common.appSlogan')}</p>
      </div>

      {/* Title + Subtitle */}
      <div className="px-8 mt-6 text-center">
        <h2 className="text-[17px] font-extrabold leading-snug">
          {t('home.app.title1')}{' '}
          <span className="text-teal-400">{t('home.app.titleHighlight')}</span>{' '}
          {t('home.app.title2')}
        </h2>
        <p className="mt-3 text-[12px] text-slate-500 leading-relaxed max-w-xs mx-auto">
          {t('home.app.subtitle')}
        </p>
      </div>

      {/* Login Button (above truck image) */}
      <div className="mt-6 px-6">
        <Link
          to="/login"
          className="flex items-center justify-between w-full px-5 py-3 rounded-xl bg-teal-600 hover:bg-teal-500 text-white font-bold text-[15px] transition-all shadow-lg shadow-teal-600/20"
        >
          <span>{t('home.app.login')}</span>
          <ArrowRight className="h-4 w-4" />
        </Link>
      </div>

      {/* Hero Image */}
      <div className="mt-5 px-4">
        <div className="relative rounded-2xl overflow-hidden">
          <img
            src="/homepage/hero-mobile.webp"
            alt=""
            className="w-full h-44 object-cover"
            loading="eager"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/20 to-transparent" />
        </div>
      </div>

      {/* Feature Cards */}
      <div className="mt-4 px-4">
        <div className="grid grid-cols-5 gap-1.5">
          {FEATURES.map((feat, i) => (
            <div key={i} className="flex flex-col items-center text-center py-3 px-1 rounded-xl bg-white/[0.04] border border-white/[0.08]">
              <div className="w-11 h-11 rounded-full bg-teal-500/10 border border-teal-500/20 flex items-center justify-center mb-2">
                <feat.icon className="h-5 w-5 text-teal-400" />
              </div>
              <span className="text-[9px] font-bold text-white leading-tight px-0.5">{t(feat.titleKey)}</span>
              <span className="text-[8px] text-slate-500 leading-tight mt-0.5 px-0.5">{t(feat.descKey)}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Register Button */}
      <div className="mt-5 px-6">
        <Link
          to="/register"
          className="flex items-center justify-between w-full px-5 py-3 rounded-xl bg-white/[0.04] border border-white/[0.12] hover:bg-white/[0.08] text-white font-bold text-[15px] transition-all"
        >
          <div className="flex items-center gap-3">
            <UserPlus className="h-4 w-4 text-slate-400" />
            <span>{t('home.app.register')}</span>
          </div>
          <ArrowRight className="h-4 w-4 text-slate-400" />
        </Link>
      </div>

      {/* Website link */}
      <div className="mt-5 text-center">
        <a
          href="https://www.mm-logistic.eu"
          target="_blank"
          rel="noopener noreferrer"
          className="text-sm text-teal-400 hover:text-teal-300 transition-colors"
        >
          mm-logistic.eu
        </a>
      </div>

      {/* Minimal Footer */}
      <div className="mt-auto pt-8 pb-8 px-6 text-center">
        <div className="flex items-center justify-center gap-2 text-[11px] text-slate-600 mb-1">
          <ShieldCheck className="h-3.5 w-3.5" />
          <span>{t('home.app.dataSafe')}</span>
        </div>
        <p className="text-[10px] text-slate-700">
          &copy; {new Date().getFullYear()} {platformName}. {t('home.app.rights')}
        </p>
        <p className="text-[10px] text-slate-700 mt-1">
          {t('home.app.createdBy')}{' '}
          <Link to="/legal/impressum" className="text-slate-500 hover:text-slate-300 transition-colors">
            Mar Group
          </Link>
        </p>
      </div>
    </div>
  );
}
