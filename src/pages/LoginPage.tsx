import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useTranslation } from '../i18n';
import LanguageSwitcher from '../components/LanguageSwitcher';
import {
  Package,
  Mail,
  Lock,
  Eye,
  EyeOff,
  LogIn,
  Loader2,
  AlertCircle,
  ArrowLeft,
  Building2,
  Warehouse,
  Truck,
  Calculator,
} from 'lucide-react';
import type { UserRole } from '../types';
import { usePlatformSettings } from '../hooks/usePlatformSettings';

const demoAccounts = [
  {
    label: 'Company Admin',
    description: 'Menaxho kompanine',
    email: 'demo-admin@demo.com',
    password: 'demo123456',
    icon: Building2,
    color: 'bg-teal-50 text-teal-700 border-teal-200 hover:bg-teal-100',
    iconBg: 'bg-teal-100 text-teal-600',
  },
  {
    label: 'Depot Worker',
    description: 'Menaxho depon',
    email: 'demo-depot@demo.com',
    password: 'demo123456',
    icon: Warehouse,
    color: 'bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100',
    iconBg: 'bg-amber-100 text-amber-600',
  },
  {
    label: 'Driver',
    description: 'Shoferi i dergesave',
    email: 'demo-driver@demo.com',
    password: 'demo123456',
    icon: Truck,
    color: 'bg-sky-50 text-sky-700 border-sky-200 hover:bg-sky-100',
    iconBg: 'bg-sky-100 text-sky-600',
  },
  {
    label: 'Accountant',
    description: 'Kontabilist',
    email: 'accountant@demo.com',
    password: 'demo123456',
    icon: Calculator,
    color: 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100',
    iconBg: 'bg-emerald-100 text-emerald-600',
  },
];

const roleRedirectMap: Record<UserRole, string> = {
  super_admin: '/super-admin',
  company_admin: '/company',
  depot_worker: '/depot',
  driver: '/driver',
  accountant: '/accounting',
  logistics_admin: '/logistics',
};

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const clickTimestamps = useRef<number[]>([]);
  const submitButtonRef = useRef<HTMLButtonElement>(null);
  const { signIn, profile, session } = useAuth();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { settings: platformSettings } = usePlatformSettings();

  const handleSecretClick = useCallback(() => {
    const now = Date.now();
    clickTimestamps.current.push(now);
    clickTimestamps.current = clickTimestamps.current.filter((t) => now - t < 2000);
    if (clickTimestamps.current.length >= 3) {
      clickTimestamps.current = [];
      navigate('/sa-access');
    }
  }, [navigate]);

  useEffect(() => {
    if (session && profile) {
      const redirectPath = roleRedirectMap[profile.role] || '/';
      navigate(redirectPath, { replace: true });
    }
  }, [session, profile, navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    submitButtonRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });

    try {
      const { error: signInError } = await signIn(email, password);
      if (signInError) {
        setError(signInError);
        setLoading(false);
      }
    } catch {
      setError('Ndodhi nje gabim. Provoni perseri.');
      setLoading(false);
    }
  };

  const handleDemoLogin = async (demoEmail: string, demoPassword: string) => {
    setEmail(demoEmail);
    setPassword(demoPassword);
    setError('');
    setLoading(true);

    try {
      const { error: signInError } = await signIn(demoEmail, demoPassword);
      if (signInError) {
        setError(signInError);
        setLoading(false);
      }
    } catch {
      setError('Ndodhi nje gabim. Provoni perseri.');
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!loading) return;
    const timeout = setTimeout(() => {
      if (loading && !profile) {
        setLoading(false);
        setError('Sesioni nuk u ngarkua plotesisht. Provoni perseri.');
      }
    }, 8000);
    return () => clearTimeout(timeout);
  }, [loading, profile]);

  return (
    <div className="min-h-screen flex">
      <div className="hidden lg:flex lg:w-1/2 relative overflow-hidden">
        <img
          src="https://images.pexels.com/photos/1267338/pexels-photo-1267338.jpeg?auto=compress&cs=tinysrgb&w=1920"
          alt="Logistics warehouse"
          className="absolute inset-0 w-full h-full object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-br from-slate-900/95 via-slate-900/85 to-teal-900/80" />

        <div className="relative z-10 flex flex-col justify-between p-12 w-full">
          <Link to="/" className="flex items-center gap-3 group">
            {platformSettings.logo ? (
              <img
                src={platformSettings.logo}
                alt={platformSettings.name}
                className="w-12 h-12 rounded-xl object-contain"
              />
            ) : (
              <div className="p-2.5 bg-teal-600 rounded-xl shadow-lg shadow-teal-600/30">
                <Package className="h-7 w-7 text-white" />
              </div>
            )}
            <span className="text-xl font-bold text-white">{platformSettings.name}</span>
          </Link>

          <div className="max-w-md">
            <h1 className="text-4xl font-extrabold text-white leading-tight">
              {t('auth.loginSubtitle')}{' '}
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-teal-400 to-emerald-400">
                efikasitet maksimal
              </span>
            </h1>
            <p className="mt-6 text-lg text-slate-300 leading-relaxed">
              Platforma e plote per gjurmimin e dergesave, menaxhimin e stokut dhe
              komunikimin midis ekipeve ne kohe reale.
            </p>

            <div className="mt-10 grid grid-cols-2 gap-4">
              <div className="bg-white/5 backdrop-blur-sm rounded-xl p-4 border border-white/10">
                <div className="text-2xl font-bold text-white">500+</div>
                <div className="text-sm text-slate-400 mt-1">Kompani aktive</div>
              </div>
              <div className="bg-white/5 backdrop-blur-sm rounded-xl p-4 border border-white/10">
                <div className="text-2xl font-bold text-white">99.9%</div>
                <div className="text-sm text-slate-400 mt-1">Uptime garantuar</div>
              </div>
            </div>
          </div>

          <p className="text-slate-500 text-sm">
            &copy; {new Date().getFullYear()} {platformSettings.name}
          </p>
        </div>
      </div>

      <div className="w-full lg:w-1/2 flex items-center justify-center p-6 sm:p-8 bg-slate-50">
        <div className="w-full max-w-md">
          <div className="flex items-center justify-between mb-6">
            <div className="lg:hidden flex items-center gap-3">
              {platformSettings.logo ? (
                <img
                  src={platformSettings.logo}
                  alt={platformSettings.name}
                  className="w-10 h-10 rounded-xl object-contain"
                />
              ) : (
                <div className="p-2.5 bg-teal-600 rounded-xl">
                  <Package className="h-6 w-6 text-white" />
                </div>
              )}
              <span className="text-xl font-bold text-slate-800">{platformSettings.name}</span>
            </div>
            <div className="ml-auto">
              <LanguageSwitcher />
            </div>
          </div>

          <div className="mb-4">
            <Link
              to="/"
              aria-label={t('privacy.backToHome')}
              title={t('privacy.backToHome')}
              className="inline-flex items-center justify-center w-9 h-9 rounded-full text-slate-500 hover:text-teal-700 hover:bg-white transition-colors"
            >
              <ArrowLeft className="h-5 w-5" />
            </Link>
          </div>

          <div className="bg-white rounded-2xl shadow-xl shadow-slate-200/50 border border-slate-200/60 p-8">
            <div className="text-center mb-8">
              <h2 className="text-2xl font-bold text-slate-800">{t('auth.loginTitle')}</h2>
              <p className="mt-2 text-slate-500">{t('auth.loginSubtitle')}</p>
            </div>

            {error && (
              <div className="mb-6 flex items-center gap-3 p-4 rounded-xl bg-red-50 border border-red-200">
                <AlertCircle className="h-5 w-5 text-red-500 flex-shrink-0" />
                <p className="text-sm text-red-700">{error}</p>
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-5">
              <div>
                <label htmlFor="email" className="block text-sm font-medium text-slate-700 mb-2">
                  {t('common.email')}
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                    <Mail className="h-5 w-5 text-slate-400" />
                  </div>
                  <input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder={t('auth.emailPlaceholder')}
                    required
                    autoCapitalize="none"
                    autoCorrect="off"
                    autoComplete="email"
                    inputMode="email"
                    className="w-full pl-12 pr-4 py-3 text-base sm:text-sm rounded-xl border border-slate-300 bg-white text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-teal-500 transition-all"
                  />
                </div>
              </div>

              <div>
                <label htmlFor="password" className="block text-sm font-medium text-slate-700 mb-2">
                  {t('common.password')}
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                    <Lock className="h-5 w-5 text-slate-400" />
                  </div>
                  <input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder={t('auth.passwordPlaceholder')}
                    required
                    autoCapitalize="none"
                    autoCorrect="off"
                    autoComplete="current-password"
                    className="w-full pl-12 pr-12 py-3 text-base sm:text-sm rounded-xl border border-slate-300 bg-white text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-teal-500 transition-all"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute inset-y-0 right-0 pr-4 flex items-center text-slate-400 hover:text-slate-600 transition-colors"
                  >
                    {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                  </button>
                </div>
              </div>

              <button
                ref={submitButtonRef}
                type="submit"
                disabled={loading}
                className="w-full flex items-center justify-center gap-2 py-3.5 rounded-xl bg-teal-600 text-white font-semibold hover:bg-teal-700 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:ring-offset-2 disabled:opacity-60 disabled:cursor-not-allowed transition-all duration-200 shadow-lg shadow-teal-600/25"
              >
                {loading ? (
                  <>
                    <Loader2 className="h-5 w-5 animate-spin" />
                    {t('common.loading')}
                  </>
                ) : (
                  <>
                    <LogIn className="h-5 w-5" />
                    {t('auth.loginButton')}
                  </>
                )}
              </button>
            </form>
          </div>

          <div className="mt-6">
            <div className="relative mb-4">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-slate-200" />
              </div>
              <div className="relative flex justify-center text-xs">
                <span className="bg-slate-50 px-3 text-slate-400 font-medium uppercase tracking-wider">
                  Llogari Demo
                </span>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2.5">
              {demoAccounts.map((account) => (
                <button
                  key={account.email}
                  type="button"
                  disabled={loading}
                  onClick={() => handleDemoLogin(account.email, account.password)}
                  className={`flex items-center gap-2.5 p-3 rounded-xl border transition-all duration-200 text-left group disabled:opacity-50 disabled:cursor-not-allowed ${account.color}`}
                >
                  <div className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 transition-transform duration-200 group-hover:scale-110 ${account.iconBg}`}>
                    <account.icon className="w-4.5 h-4.5" />
                  </div>
                  <div className="min-w-0">
                    <div className="text-xs font-semibold leading-tight truncate">{account.label}</div>
                    <div className="text-[10px] opacity-70 leading-tight truncate mt-0.5">{account.description}</div>
                  </div>
                </button>
              ))}
            </div>
          </div>

          <div className="mt-5 text-center space-y-2">
            <p className="text-sm text-slate-500">
              {t('auth.noAccount')}{' '}
              <Link
                to="/register"
                className="text-teal-600 hover:text-teal-700 font-medium transition-colors"
              >
                {t('auth.registerFree')}
              </Link>
            </p>
            <div className="flex items-center justify-center gap-3 text-xs text-slate-400">
              <a href="/legal/privacy" target="_blank" rel="noopener noreferrer" className="hover:text-teal-600 transition-colors">
                {t('privacy.title')}
              </a>
            </div>
          </div>

          <div className="mt-8 text-center">
            <p className="text-slate-400 text-xs">
              {t('common.createdBy')}{' '}
              <span
                onClick={handleSecretClick}
                role="presentation"
                className="inline-block text-slate-500 font-medium cursor-default select-none px-3 py-1.5 -mx-3 -my-1.5 touch-manipulation"
              >
                MM Logistic
              </span>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
