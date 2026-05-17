import { useState, useEffect } from 'react';
import { Outlet, NavLink, useLocation, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard,
  Warehouse,
  Truck,
  Package,
  Tags,
  FileText,
  BarChart3,
  MessageSquare,
  FolderOpen,
  LogOut,
  Menu,
  X,
  Crown,
  ClipboardList,
  AlertCircle,
  Download,
  Settings,
  Calculator,
  FileCheck2,
  Headphones,
  MoreHorizontal,
  Building2,
  MapPin,
  Wrench,
  ShieldCheck,
  Key,
  Layers,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { useSubscription } from '../contexts/SubscriptionContext';
import { useTranslation } from '../i18n';
import SupportChatWidget from '../components/support/SupportChatWidget';
import NotificationDropdown from '../components/NotificationDropdown';
import SubscriptionBanner from '../components/subscription/SubscriptionBanner';
import LanguageSwitcher from '../components/LanguageSwitcher';
import { usePendingReviewCounts } from '../hooks/usePendingReviewCounts';

const allNavItems = [
  { to: '/company', icon: LayoutDashboard, labelKey: 'nav.dashboard', end: true, premium: false, bottomNav: true },
  { to: '/company/invoices', icon: FileCheck2, labelKey: 'nav.invoices', end: false, premium: false, bottomNav: false },
  { to: '/company/delivery-notes', icon: FileText, labelKey: 'nav.deliveryNotes', end: false, premium: false, bottomNav: true },
  { to: '/company/review', icon: ClipboardList, labelKey: 'nav.review', end: false, premium: false, bottomNav: false, badgeKey: 'review' as const },
  { to: '/company/overdue', icon: AlertCircle, labelKey: 'nav.overdue', end: false, premium: false, bottomNav: false },
  { to: '/company/partners', icon: Building2, labelKey: 'nav.partners', end: false, premium: false, bottomNav: false },
  { to: '/company/partner-flows', icon: Building2, labelKey: 'nav.partnerFlows', end: false, premium: false, bottomNav: false },
  { to: '/company/pallet-accounts', icon: Package, labelKey: 'nav.palletAccounts', end: false, premium: false, bottomNav: false },
  { to: '/company/live-map', icon: MapPin, labelKey: 'nav.liveMap', end: false, premium: false, bottomNav: false },
  { to: '/company/fleet-reports', icon: BarChart3, labelKey: 'nav.fleetReports', end: false, premium: false, bottomNav: false },
  { to: '/company/stock', icon: Package, labelKey: 'nav.stock', end: false, premium: false, bottomNav: true },
  { to: '/company/chat', icon: MessageSquare, labelKey: 'nav.chat', end: false, premium: false, bottomNav: true },
  { to: '/company/depots', icon: Warehouse, labelKey: 'nav.depots', end: false, premium: false, bottomNav: false },
  { to: '/company/sorting-reports', icon: Layers, labelKey: 'nav.sortingReports', end: false, premium: false, bottomNav: false },
  { to: '/company/repair-reports', icon: Wrench, labelKey: 'nav.repairReports', end: false, premium: false, bottomNav: false },
  { to: '/company/worker-repair-stats', icon: BarChart3, labelKey: 'nav.workerRepairStats', end: false, premium: false, bottomNav: false },
  { to: '/company/drivers', icon: Truck, labelKey: 'nav.drivers', end: false, premium: false, bottomNav: false },
  { to: '/company/automjetet', icon: Truck, labelKey: 'nav.automjetet', end: false, premium: false, bottomNav: false },
  { to: '/company/compliance', icon: ShieldCheck, labelKey: 'nav.compliance', end: false, premium: false, bottomNav: false },
  { to: '/company/categories', icon: Tags, labelKey: 'nav.categories', end: false, premium: false, bottomNav: false },
  { to: '/company/documents', icon: FolderOpen, labelKey: 'nav.documents', end: false, premium: false, bottomNav: false },
  { to: '/company/reports', icon: BarChart3, labelKey: 'nav.reports', end: false, premium: false, bottomNav: false },
  { to: '/company/audit-log', icon: ClipboardList, labelKey: 'nav.auditLog', end: false, premium: true, bottomNav: false },
  { to: '/company/audit-report', icon: FileCheck2, labelKey: 'nav.auditReport', end: false, premium: false, bottomNav: false },
  { to: '/company/stock-alerts', icon: AlertCircle, labelKey: 'nav.stockAlerts', end: false, premium: true, bottomNav: false },
  { to: '/company/data-export', icon: Download, labelKey: 'nav.dataExport', end: false, premium: true, bottomNav: false },
  { to: '/company/financial-summary', icon: Calculator, labelKey: 'nav.financialSummary', end: false, premium: false, bottomNav: false },
  { to: '/logistics', icon: Truck, labelKey: 'nav.logistics', end: false, premium: false, bottomNav: false },
  { to: '/company/settings', icon: Settings, labelKey: 'nav.settings', end: false, premium: false, bottomNav: false },
  { to: '/company/settings/api-webhooks', icon: Key, labelKey: 'nav.apiWebhooks', end: false, premium: false, bottomNav: false },
];

const bottomNavItems = allNavItems.filter(i => i.bottomNav);

export default function CompanyAdminLayout() {
  const { profile, signOut } = useAuth();
  const { planTier, accountingEnabled } = useSubscription();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const reviewCounts = usePendingReviewCounts(profile?.company_id);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [supportOpen, setSupportOpen] = useState(false);
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
    } catch { /* ignore */ }
  }

  const isMoreActive = !bottomNavItems.some(
    item => item.end
      ? location.pathname === item.to
      : location.pathname.startsWith(item.to) && item.to !== '/company'
  ) && location.pathname !== '/company';

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col lg:flex-row">
      {/* Desktop Sidebar */}
      <aside className="hidden lg:flex print:!hidden w-64 flex-col bg-teal-900 text-white fixed inset-y-0 left-0 z-40">
        <div className="px-4 py-3 border-b border-teal-800">
          <p className="text-[11px] uppercase tracking-wider text-teal-400 font-semibold mb-2">{t(`roles.${profile?.role ?? ''}`)}</p>
          <div className="flex items-center gap-3">
            {companyLogo && (
              <img src={companyLogo} alt={companyName} className="w-9 h-9 rounded object-cover flex-shrink-0" />
            )}
            <h1 className="text-lg font-bold whitespace-nowrap truncate">{companyName}</h1>
          </div>
        </div>

        <nav className="flex-1 py-3 space-y-0.5 px-2 overflow-y-auto">
          {allNavItems.map((item) => {
            const isPremiumLocked = item.premium && planTier !== 'premium';
            const badgeCount = (item as any).badgeKey === 'review' ? reviewCounts.total : 0;
            return (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) =>
                  `flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all duration-200
                  ${isActive
                    ? 'bg-teal-700 text-white font-medium'
                    : isPremiumLocked
                    ? 'text-teal-400/60 hover:bg-teal-800/50 hover:text-teal-300'
                    : 'text-teal-200 hover:bg-teal-800 hover:text-white'
                  }`
                }
              >
                <item.icon className="w-5 h-5 flex-shrink-0" />
                <span className="flex-1 whitespace-nowrap">{t(item.labelKey)}</span>
                {badgeCount > 0 && (
                  <span className="inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 text-[10px] font-bold rounded-full bg-red-500 text-white">
                    {badgeCount}
                  </span>
                )}
                {item.premium && (
                  <Crown className={`w-3.5 h-3.5 flex-shrink-0 ${isPremiumLocked ? 'text-amber-400/60' : 'text-amber-400'}`} />
                )}
              </NavLink>
            );
          })}
          <button
            onClick={() => setSupportOpen(true)}
            className="flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all duration-200 w-full text-teal-200 hover:bg-teal-800 hover:text-white"
          >
            <Headphones className="w-5 h-5 flex-shrink-0" />
            <span className="whitespace-nowrap">{t('support.title')}</span>
          </button>

          <button
            onClick={() => navigate(accountingEnabled ? '/accounting' : '/company/accounting-upgrade')}
            className={`mt-2 flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all duration-200 w-full ${
              accountingEnabled
                ? 'text-teal-200 hover:bg-teal-800 hover:text-white'
                : 'bg-gradient-to-r from-emerald-500/20 to-teal-500/10 text-teal-100 hover:from-emerald-500/30 border border-teal-500/40'
            }`}
          >
            <Calculator className="w-5 h-5 flex-shrink-0" />
            <span className="flex-1 whitespace-nowrap text-left">{t('nav.accounting')}</span>
            {accountingEnabled ? (
              <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-bold bg-emerald-500/30 text-emerald-100">LIVE</span>
            ) : (
              <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[9px] font-bold bg-amber-400/90 text-amber-900">
                <Crown className="w-2.5 h-2.5" /> -50%
              </span>
            )}
          </button>
        </nav>

        <div className="px-2 py-2 border-t border-teal-800/50">
          <button
            onClick={signOut}
            className="flex items-center gap-3 w-full px-3 py-2.5 rounded-lg text-teal-200 hover:bg-teal-800 hover:text-white transition-colors"
          >
            <LogOut className="w-5 h-5 flex-shrink-0" />
            <span>{t('common.logout')}</span>
          </button>
        </div>
      </aside>

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0 lg:ml-64 print:!ml-0">
        <SubscriptionBanner />

        {/* Mobile Header */}
        <header className="h-14 bg-white border-b border-gray-200 flex items-center justify-between px-4 sticky top-0 z-[800] lg:h-16 lg:px-6 print:hidden">
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

        <main className="flex-1 p-4 lg:p-6 pb-safe-nav overflow-auto print:p-0">
          <Outlet />
        </main>

        <footer className="hidden lg:block print:!hidden border-t border-gray-200 bg-white px-6 py-3 text-center">
          <p className="text-gray-400 text-xs">
            {t('common.createdBy')} <span className="text-gray-500 font-medium">MarGroup</span>
          </p>
        </footer>
      </div>

      {/* Mobile Bottom Navigation */}
      <nav className="lg:hidden print:hidden fixed bottom-0 left-0 right-0 z-[900] bg-white border-t border-gray-200 safe-area-bottom">
        <div className="flex items-center justify-around h-16 px-1">
          {bottomNavItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                `flex flex-col items-center justify-center gap-0.5 flex-1 py-1.5 rounded-lg transition-colors min-w-0
                ${isActive
                  ? 'text-teal-600'
                  : 'text-gray-400 active:text-gray-600'
                }`
              }
            >
              <item.icon className="w-5 h-5 flex-shrink-0" />
              <span className="text-[10px] font-medium leading-tight max-w-full px-0.5 text-center line-clamp-2 break-words">{t(item.labelKey)}</span>
            </NavLink>
          ))}
          <button
            onClick={() => setMobileMenuOpen(true)}
            className={`flex flex-col items-center justify-center gap-0.5 flex-1 py-1.5 rounded-lg transition-colors min-w-0
              ${isMoreActive ? 'text-teal-600' : 'text-gray-400 active:text-gray-600'}`}
          >
            <MoreHorizontal className="w-5 h-5" />
            <span className="text-[10px] font-medium leading-tight">Menu</span>
          </button>
        </div>
      </nav>

      {/* Mobile Full-Screen Menu */}
      {mobileMenuOpen && (
        <div className="lg:hidden fixed inset-0 z-[1000] bg-white animate-in slide-in-from-bottom duration-200 modal-fullscreen">
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
              <div className="w-10 h-10 rounded-full bg-teal-600 flex items-center justify-center text-white font-bold text-sm">
                {profile?.full_name?.charAt(0) ?? 'U'}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-gray-900 truncate">{profile?.full_name ?? ''}</p>
                <p className="text-xs text-gray-500">{t(`roles.${profile?.role ?? ''}`)}</p>
              </div>
            </div>
          </div>

          <div className="overflow-y-auto flex-1 p-3" style={{ maxHeight: 'calc(100vh - 180px)' }}>
            <div className="grid grid-cols-3 gap-2">
              {allNavItems.map((item) => {
                const isPremiumLocked = item.premium && planTier !== 'premium';
                const isActive = item.end
                  ? location.pathname === item.to
                  : location.pathname.startsWith(item.to);
                const badgeCount = (item as any).badgeKey === 'review' ? reviewCounts.total : 0;
                return (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    end={item.end}
                    onClick={() => setMobileMenuOpen(false)}
                    className={`relative flex flex-col items-center gap-2 p-4 rounded-xl transition-all duration-150 active:scale-95
                      ${isActive
                        ? 'bg-teal-50 text-teal-700 ring-1 ring-teal-200'
                        : isPremiumLocked
                        ? 'bg-gray-50 text-gray-400'
                        : 'bg-gray-50 text-gray-600 active:bg-gray-100'
                      }`}
                  >
                    <item.icon className="w-6 h-6" />
                    <span className="text-xs font-medium text-center leading-tight">{t(item.labelKey)}</span>
                    {item.premium && (
                      <Crown className={`w-3 h-3 ${isPremiumLocked ? 'text-amber-400/60' : 'text-amber-400'}`} />
                    )}
                    {badgeCount > 0 && (
                      <span className="absolute top-2 right-2 inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 text-[10px] font-bold rounded-full bg-red-500 text-white">
                        {badgeCount}
                      </span>
                    )}
                  </NavLink>
                );
              })}
              <button
                onClick={() => { setSupportOpen(true); setMobileMenuOpen(false); }}
                className="flex flex-col items-center gap-2 p-4 rounded-xl bg-gray-50 text-gray-600 active:bg-gray-100 transition-all duration-150 active:scale-95"
              >
                <Headphones className="w-6 h-6" />
                <span className="text-xs font-medium text-center leading-tight">{t('support.title')}</span>
              </button>
              <button
                onClick={() => {
                  setMobileMenuOpen(false);
                  navigate(accountingEnabled ? '/accounting' : '/company/accounting-upgrade');
                }}
                className={`relative flex flex-col items-center gap-2 p-4 rounded-xl transition-all duration-150 active:scale-95 ${
                  accountingEnabled ? 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200' : 'bg-amber-50 text-amber-800 ring-1 ring-amber-200'
                }`}
              >
                <Calculator className="w-6 h-6" />
                <span className="text-xs font-medium text-center leading-tight">{t('nav.accounting')}</span>
                {!accountingEnabled && (
                  <span className="absolute top-2 right-2 inline-flex items-center gap-0.5 px-1 py-0.5 rounded text-[9px] font-bold bg-amber-500 text-white">
                    -50%
                  </span>
                )}
              </button>
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

      <SupportChatWidget externalOpen={supportOpen} onExternalClose={() => setSupportOpen(false)} />
    </div>
  );
}
