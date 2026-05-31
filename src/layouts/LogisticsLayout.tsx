import { useState, useEffect } from 'react';
import { Outlet, NavLink, useLocation, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard,
  Truck,
  Users,
  ClipboardList,
  Map,
  LogOut,
  Menu,
  X,
  ArrowLeft,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useTranslation } from '../i18n';
import { useCompanyBranding } from '../hooks/useCompanyBranding';
import NotificationDropdown from '../components/NotificationDropdown';
import LanguageSwitcher from '../components/LanguageSwitcher';

export default function LogisticsLayout() {
  const { profile, signOut } = useAuth();
  const { t } = useTranslation();
  const navItems = [
    { to: '/logistics', icon: LayoutDashboard, label: t('nav.dashboard'), end: true },
    { to: '/logistics/dispatch', icon: ClipboardList, label: t('nav.dispatch'), end: false },
    { to: '/logistics/active', icon: Truck, label: t('nav.activeAssignments'), end: false },
    { to: '/logistics/live-map', icon: Map, label: t('nav.liveMap'), end: false },
    { to: '/logistics/drivers', icon: Users, label: t('nav.drivers'), end: false },
  ];
  const { name: brandName, logo: brandLogo } = useCompanyBranding();
  const location = useLocation();
  const navigate = useNavigate();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const isCompanyAdmin = profile?.role === 'company_admin';

  useEffect(() => {
    setMobileMenuOpen(false);
  }, [location.pathname]);

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col lg:flex-row">
      <aside className="hidden lg:flex w-64 flex-col bg-teal-900 text-white fixed inset-y-0 left-0 z-40">
        <div className="flex items-center gap-2.5 h-16 px-4 border-b border-teal-800">
          {brandLogo && (
            <img src={brandLogo} alt={brandName} className="w-8 h-8 rounded object-cover flex-shrink-0" />
          )}
          <h1 className="text-lg font-bold whitespace-nowrap truncate">{brandName}</h1>
        </div>

        <div className="px-4 py-4 border-b border-teal-800">
          <p className="text-sm font-semibold truncate">{profile?.full_name ?? ''}</p>
          <p className="text-xs text-teal-300 truncate">{t('roles.logistics_admin')}</p>
        </div>

        {isCompanyAdmin && (
          <div className="px-2 pt-3">
            <button
              onClick={() => navigate('/company')}
              className="flex items-center gap-3 w-full px-3 py-2.5 rounded-lg bg-teal-800/60 text-teal-50 hover:bg-teal-700 hover:text-white transition-colors font-medium"
            >
              <ArrowLeft className="w-5 h-5 flex-shrink-0" />
              <span className="whitespace-nowrap text-sm">{t('common.companyAdminLink')}</span>
            </button>
          </div>
        )}

        <nav className="flex-1 py-3 space-y-0.5 px-2 overflow-y-auto">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all duration-200
                ${
                  isActive
                    ? 'bg-teal-600 text-white font-medium'
                    : 'text-teal-100 hover:bg-teal-800 hover:text-white'
                }`
              }
            >
              <item.icon className="w-5 h-5 flex-shrink-0" />
              <span className="whitespace-nowrap">{item.label}</span>
            </NavLink>
          ))}
        </nav>

        <div className="px-2 pb-2">
          <LanguageSwitcher variant="minimal" />
        </div>

        <div className="p-4 border-t border-teal-800">
          <button
            onClick={signOut}
            className="flex items-center gap-3 w-full px-3 py-2.5 rounded-lg text-teal-100 hover:bg-teal-800 hover:text-white transition-colors"
          >
            <LogOut className="w-5 h-5 flex-shrink-0" />
            <span>{t('common.logout')}</span>
          </button>
        </div>
      </aside>

      <div className="flex-1 flex flex-col min-w-0 lg:ml-64">
        <header className="h-14 bg-white border-b border-gray-200 flex items-center justify-between px-4 sticky top-0 z-30 lg:h-16 lg:px-6">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setMobileMenuOpen(true)}
              className="lg:hidden p-1.5 -ml-1.5 rounded-lg text-gray-600 hover:bg-gray-100 active:bg-gray-200 transition-colors"
            >
              <Menu className="w-5 h-5" />
            </button>
            {isCompanyAdmin && (
              <button
                onClick={() => navigate('/company')}
                className="hidden lg:inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-teal-700 hover:bg-teal-50 transition-colors text-sm font-medium"
                title={t('common.backToCompanyAdmin')}
              >
                <ArrowLeft className="w-4 h-4" />
                <span>{t('common.companyAdminLink')}</span>
              </button>
            )}
            {isCompanyAdmin && (
              <button
                onClick={() => navigate('/company')}
                className="lg:hidden p-1.5 rounded-lg text-teal-700 hover:bg-teal-50 transition-colors"
                aria-label={t('common.companyAdminLink')}
                title={t('common.companyAdminLink')}
              >
                <ArrowLeft className="w-5 h-5" />
              </button>
            )}
            <div className="flex items-center gap-2 lg:hidden">
              {brandLogo && <img src={brandLogo} alt={brandName} className="w-7 h-7 rounded object-cover" />}
              <span className="font-semibold text-gray-900 text-sm">{brandName}</span>
            </div>
          </div>

          <div className="flex items-center gap-2 lg:gap-4">
            <LanguageSwitcher variant="header" />
            <NotificationDropdown />
            <button
              onClick={signOut}
              aria-label={t('common.logout')}
              title={t('common.logout')}
              className="flex p-2 rounded-lg text-gray-600 hover:bg-gray-100 active:bg-gray-200 transition-colors"
            >
              <LogOut className="w-5 h-5" />
            </button>
          </div>
        </header>

        <main className="flex-1 p-4 lg:p-6 pb-safe-nav overflow-auto">
          <Outlet />
        </main>

        <footer className="hidden lg:block border-t border-gray-200 bg-white px-6 py-3 text-center">
          <p className="text-gray-400 text-xs">
            {t('common.createdBy')} <span className="text-gray-500 font-medium">MarGroup</span>
          </p>
        </footer>
      </div>

      <nav className="lg:hidden fixed bottom-0 left-0 right-0 z-40 bg-white border-t border-gray-200 safe-area-bottom">
        <div className="flex items-center justify-around h-16 px-1">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                `flex flex-col items-center justify-center gap-0.5 flex-1 py-1.5 rounded-lg transition-colors min-w-0
                ${isActive ? 'text-teal-600' : 'text-gray-400 active:text-gray-600'}`
              }
            >
              <item.icon className="w-5 h-5 flex-shrink-0" />
              <span className="text-[10px] font-medium leading-tight max-w-full px-0.5 text-center line-clamp-2 break-words">{item.label}</span>
            </NavLink>
          ))}
        </div>
      </nav>

      {mobileMenuOpen && (
        <div className="lg:hidden fixed inset-0 z-50 bg-white modal-fullscreen">
          <div className="flex items-center justify-between h-14 px-4 border-b border-gray-100">
            <span className="font-semibold text-gray-900">{brandName}</span>
            <button
              onClick={() => setMobileMenuOpen(false)}
              className="p-2 rounded-lg text-gray-500 hover:bg-gray-100"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
          <div className="p-4 space-y-2">
            {isCompanyAdmin && (
              <button
                onClick={() => { setMobileMenuOpen(false); navigate('/company'); }}
                className="flex items-center gap-3 w-full p-4 rounded-xl bg-teal-50 text-teal-700 font-medium"
              >
                <ArrowLeft className="w-5 h-5" />
                <span className="text-sm">{t('common.companyAdminLink')}</span>
              </button>
            )}
            {navItems.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                onClick={() => setMobileMenuOpen(false)}
                className={({ isActive }) =>
                  `flex items-center gap-3 p-4 rounded-xl transition-all
                  ${isActive ? 'bg-teal-50 text-teal-700' : 'bg-gray-50 text-gray-600'}`
                }
              >
                <item.icon className="w-5 h-5" />
                <span className="text-sm font-medium">{item.label}</span>
              </NavLink>
            ))}
            <button
              onClick={signOut}
              className="flex items-center justify-center gap-2 w-full px-4 py-3 rounded-xl bg-red-50 text-red-600 font-medium text-sm mt-6"
            >
              <LogOut className="w-4 h-4" />
              {t('common.logout')}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
