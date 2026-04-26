import { useState, useEffect } from 'react';
import { Outlet, NavLink, useLocation, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard,
  Users,
  Package,
  FileText,
  ShoppingCart,
  Warehouse,
  Truck,
  ArrowLeftRight,
  Receipt,
  Building2,
  BarChart3,
  Settings,
  Briefcase,
  ScanLine,
  LogOut,
  Menu,
  X,
  MoreHorizontal,
  ArrowLeft,
  Scale,
  Ship,
  BookOpen,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { useTranslation } from '../i18n';
import NotificationDropdown from '../components/NotificationDropdown';
import LanguageSwitcher from '../components/LanguageSwitcher';

const allNavItems = [
  { to: '/accounting', icon: LayoutDashboard, label: 'Dashboard', labelKey: 'nav.dashboard', end: true, bottomNav: true },
  { to: '/accounting/contacts', icon: Users, label: 'Kontaktet', labelKey: 'nav.contacts', end: false, bottomNav: true },
  { to: '/accounting/clients', icon: Building2, label: 'Kompanite / Faturat', labelKey: 'nav.clientInvoices', end: false, bottomNav: false },
  { to: '/accounting/products', icon: Package, label: 'Produktet', labelKey: 'nav.products', end: false, bottomNav: true },
  { to: '/accounting/invoices', icon: FileText, label: 'Faturat', labelKey: 'nav.invoices', end: false, bottomNav: true },
  { to: '/accounting/purchases', icon: ShoppingCart, label: 'Blerjet', labelKey: 'nav.purchases', end: false, bottomNav: false },
  { to: '/accounting/stock', icon: Warehouse, label: 'Stoku', labelKey: 'nav.stock', end: false, bottomNav: false },
  { to: '/accounting/deliveries', icon: Truck, label: 'Fletedergesat', labelKey: 'nav.deliveries', end: false, bottomNav: false },
  { to: '/accounting/transactions', icon: ArrowLeftRight, label: 'Transaksionet', labelKey: 'nav.transactions', end: false, bottomNav: false },
  { to: '/accounting/expenses', icon: Receipt, label: 'Shpenzimet', labelKey: 'nav.expenses', end: false, bottomNav: false },
  { to: '/accounting/bank-accounts', icon: Building2, label: 'Llogarite Bankare', labelKey: 'nav.bankAccounts', end: false, bottomNav: false },
  { to: '/accounting/assets', icon: Briefcase, label: 'Asetet Fikse', labelKey: 'nav.fixedAssets', end: false, bottomNav: false },
  { to: '/accounting/imports', icon: Ship, label: 'Importet', labelKey: 'nav.imports', end: false, bottomNav: false },
  { to: '/accounting/coa', icon: BookOpen, label: 'Plani i Llogarive', labelKey: 'nav.coa', end: false, bottomNav: false },
  { to: '/accounting/scans', icon: ScanLine, label: 'Skanimet', labelKey: 'nav.scans', end: false, bottomNav: false },
  { to: '/accounting/reports', icon: BarChart3, label: 'Raportet', labelKey: 'nav.reports', end: false, bottomNav: false },
  { to: '/accounting/financials', icon: Scale, label: 'Raportet Financiare', labelKey: 'nav.financials', end: false, bottomNav: false },
  { to: '/accounting/settings', icon: Settings, label: 'Cilesimet', labelKey: 'nav.settings', end: false, bottomNav: false },
];

const bottomNavItems = allNavItems.filter(i => i.bottomNav);

export default function AccountingLayout() {
  const { profile, signOut } = useAuth();
  const { t } = useTranslation();
  const location = useLocation();
  const navigate = useNavigate();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [companyLogo, setCompanyLogo] = useState<string>('');
  const [companyName, setCompanyName] = useState<string>('');

  useEffect(() => {
    if (profile?.company_id) fetchCompanyInfo();
  }, [profile?.company_id]);

  useEffect(() => {
    setMobileMenuOpen(false);
  }, [location.pathname]);

  async function fetchCompanyInfo() {
    try {
      const { data, error } = await supabase
        .from('companies')
        .select('name, logo_url')
        .eq('id', profile!.company_id!)
        .maybeSingle();
      if (error) return;
      if (data) {
        setCompanyName(data.name || '');
        setCompanyLogo(data.logo_url || '');
      }
    } catch {}
  }

  function getLabel(item: typeof allNavItems[0]) {
    const translated = t(item.labelKey);
    if (translated && translated !== item.labelKey) return translated;
    return item.label;
  }

  const isMoreActive = !bottomNavItems.some(
    item => item.end
      ? location.pathname === item.to
      : location.pathname.startsWith(item.to) && item.to !== '/accounting'
  ) && location.pathname !== '/accounting';

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col lg:flex-row">
      <aside className="hidden lg:flex w-64 flex-col bg-emerald-900 text-white fixed inset-y-0 left-0 z-40">
        <div className="flex items-center gap-3 h-16 px-4 border-b border-emerald-800">
          {companyLogo && (
            <img src={companyLogo} alt={companyName} className="w-8 h-8 rounded object-cover flex-shrink-0" />
          )}
          <h1 className="text-lg font-bold whitespace-nowrap truncate">{companyName}</h1>
        </div>

        <div className="px-4 py-4 border-b border-emerald-800">
          <p className="text-sm font-semibold truncate">{profile?.full_name ?? ''}</p>
          <p className="text-xs text-emerald-300 truncate">{t(`roles.${profile?.role ?? ''}`)}</p>
        </div>

        {profile?.role === 'company_admin' && (
          <div className="px-2 pt-3">
            <button
              onClick={() => navigate('/company')}
              className="flex items-center gap-2 px-3 py-2 rounded-lg text-emerald-200 hover:bg-emerald-800 hover:text-white transition-colors w-full text-sm"
            >
              <ArrowLeft className="w-4 h-4 flex-shrink-0" />
              <span>{t('nav.backToCompany') || 'Kthehu te Paneli'}</span>
            </button>
          </div>
        )}

        <nav className="flex-1 py-3 space-y-0.5 px-2 overflow-y-auto">
          {allNavItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all duration-200
                ${isActive
                  ? 'bg-emerald-700 text-white font-medium'
                  : 'text-emerald-200 hover:bg-emerald-800 hover:text-white'
                }`
              }
            >
              <item.icon className="w-5 h-5 flex-shrink-0" />
              <span className="flex-1 whitespace-nowrap">{getLabel(item)}</span>
            </NavLink>
          ))}
        </nav>

        <div className="px-2 pb-2">
          <LanguageSwitcher variant="minimal" />
        </div>

        <div className="p-4 border-t border-emerald-800">
          <button
            onClick={signOut}
            className="flex items-center gap-3 w-full px-3 py-2.5 rounded-lg text-emerald-200 hover:bg-emerald-800 hover:text-white transition-colors"
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
            <div className="flex items-center gap-2 lg:hidden">
              {companyLogo && (
                <img src={companyLogo} alt={companyName} className="w-7 h-7 rounded object-cover" />
              )}
              <span className="font-semibold text-gray-900 text-sm">{companyName}</span>
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

        <main className="flex-1 p-4 lg:p-6 pb-24 lg:pb-6 overflow-auto">
          <Outlet />
        </main>

        <footer className="hidden lg:block border-t border-gray-200 bg-white px-6 py-3 text-center">
          <p className="text-gray-400 text-xs">
            {t('common.createdBy')} <span className="text-gray-500 font-medium">MarGroup Germany</span>
          </p>
        </footer>
      </div>

      <nav className="lg:hidden fixed bottom-0 left-0 right-0 z-40 bg-white border-t border-gray-200 safe-area-bottom">
        <div className="flex items-center justify-around h-16 px-1">
          {bottomNavItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                `flex flex-col items-center justify-center gap-0.5 flex-1 py-1.5 rounded-lg transition-colors min-w-0
                ${isActive
                  ? 'text-emerald-600'
                  : 'text-gray-400 active:text-gray-600'
                }`
              }
            >
              <item.icon className="w-5 h-5" />
              <span className="text-[10px] font-medium leading-tight truncate max-w-full px-1">{getLabel(item)}</span>
            </NavLink>
          ))}
          <button
            onClick={() => setMobileMenuOpen(true)}
            className={`flex flex-col items-center justify-center gap-0.5 flex-1 py-1.5 rounded-lg transition-colors min-w-0
              ${isMoreActive ? 'text-emerald-600' : 'text-gray-400 active:text-gray-600'}`}
          >
            <MoreHorizontal className="w-5 h-5" />
            <span className="text-[10px] font-medium leading-tight">{t('nav.menu')}</span>
          </button>
        </div>
      </nav>

      {mobileMenuOpen && (
        <div className="lg:hidden fixed inset-0 z-50 bg-white animate-in slide-in-from-bottom duration-200">
          <div className="flex items-center justify-between h-14 px-4 border-b border-gray-100">
            <div className="flex items-center gap-3">
              {companyLogo && (
                <img src={companyLogo} alt={companyName} className="w-7 h-7 rounded object-cover" />
              )}
              <span className="font-semibold text-gray-900">{companyName}</span>
            </div>
            <button
              onClick={() => setMobileMenuOpen(false)}
              className="p-2 rounded-lg text-gray-500 hover:bg-gray-100 active:bg-gray-200"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="p-4 border-b border-gray-100 bg-gray-50">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-emerald-600 flex items-center justify-center text-white font-bold text-sm">
                {profile?.full_name?.charAt(0) ?? 'U'}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-gray-900 truncate">{profile?.full_name ?? ''}</p>
                <p className="text-xs text-gray-500">{t(`roles.${profile?.role ?? ''}`)}</p>
              </div>
            </div>
          </div>

          <div className="overflow-y-auto flex-1 p-3" style={{ maxHeight: 'calc(100vh - 180px)' }}>
            {profile?.role === 'company_admin' && (
              <button
                onClick={() => { navigate('/company'); setMobileMenuOpen(false); }}
                className="flex items-center gap-2 w-full mb-3 px-4 py-3 rounded-xl bg-emerald-50 text-emerald-700 font-medium text-sm active:bg-emerald-100 transition-colors"
              >
                <ArrowLeft className="w-4 h-4" />
                {t('nav.backToCompany') || 'Kthehu te Paneli'}
              </button>
            )}
            <div className="grid grid-cols-3 gap-2">
              {allNavItems.map((item) => {
                const isActive = item.end
                  ? location.pathname === item.to
                  : location.pathname.startsWith(item.to);
                return (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    end={item.end}
                    onClick={() => setMobileMenuOpen(false)}
                    className={`flex flex-col items-center gap-2 p-4 rounded-xl transition-all duration-150 active:scale-95
                      ${isActive
                        ? 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200'
                        : 'bg-gray-50 text-gray-600 active:bg-gray-100'
                      }`}
                  >
                    <item.icon className="w-6 h-6" />
                    <span className="text-xs font-medium text-center leading-tight">{getLabel(item)}</span>
                  </NavLink>
                );
              })}
            </div>
          </div>

          <div className="p-4 border-t border-gray-100">
            <div className="flex items-center gap-3 mb-3">
              <LanguageSwitcher variant="header" />
            </div>
            <button
              onClick={signOut}
              className="flex items-center justify-center gap-2 w-full px-4 py-3 rounded-xl bg-red-50 text-red-600 font-medium text-sm active:bg-red-100 transition-colors"
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
