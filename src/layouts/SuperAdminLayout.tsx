import { useState } from 'react';
import { Outlet, NavLink } from 'react-router-dom';
import {
  LayoutDashboard,
  Building2,
  Users,
  DollarSign,
  Settings,
  HelpCircle,
  Bell,
  LogOut,
  Menu,
  X,
  ChevronLeft,
  ChevronRight,
  Star,
  CreditCard,
  Globe,
  FileText,
  Link2,
  QrCode,
  Download,
  Search,
  MapPin,
  Smartphone,
  BookOpen,
  BellRing,
  Image as ImageIcon,
  Mail,
  Megaphone,
  ListChecks,
  SlidersHorizontal,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useTranslation } from '../i18n';
import { useNotifications } from '../hooks/useNotifications';
import { usePlatformSettings } from '../hooks/usePlatformSettings';
import LanguageSwitcher from '../components/LanguageSwitcher';

interface NavSection {
  titleKey?: string;
  items: { to: string; icon: typeof LayoutDashboard; labelKey: string; end: boolean; badgeKey?: string }[];
}

const navSections: NavSection[] = [
  {
    items: [
      { to: '/super-admin', icon: LayoutDashboard, labelKey: 'nav.dashboard', end: true },
      { to: '/super-admin/companies', icon: Building2, labelKey: 'nav.companies', end: false },
      { to: '/super-admin/plans', icon: Star, labelKey: 'nav.plans', end: false },
      { to: '/super-admin/reports', icon: DollarSign, labelKey: 'nav.revenue', end: false },
      { to: '/super-admin/payment-settings', icon: CreditCard, labelKey: 'nav.payments', end: false },
      { to: '/super-admin/users', icon: Users, labelKey: 'nav.users', end: false },
      { to: '/super-admin/chat', icon: HelpCircle, labelKey: 'nav.support', end: false },
    ],
  },
  {
    titleKey: 'nav.homepageCms',
    items: [
      { to: '/super-admin/homepage', icon: Globe, labelKey: 'nav.homepage', end: false },
      { to: '/super-admin/static-pages', icon: FileText, labelKey: 'nav.staticPages', end: false },
      { to: '/super-admin/footer-settings', icon: FileText, labelKey: 'nav.footerSettings', end: false },
      { to: '/super-admin/footer-links', icon: Link2, labelKey: 'nav.footerSocial', end: false, badgeKey: 'common.new' },
      { to: '/super-admin/metadata-seo', icon: Search, labelKey: 'nav.metadataSeo', end: false, badgeKey: 'common.new' },
      { to: '/super-admin/homepage-map', icon: MapPin, labelKey: 'nav.map', end: false },
    ],
  },
  {
    titleKey: 'nav.appTools',
    items: [
      { to: '/super-admin/qr-codes', icon: QrCode, labelKey: 'nav.qrCodes', end: false },
      { to: '/super-admin/app-download', icon: Download, labelKey: 'nav.appDownload', end: false, badgeKey: 'common.new' },
      { to: '/super-admin/pwa-settings', icon: Smartphone, labelKey: 'nav.pwaSettings', end: false },
      { to: '/super-admin/user-manual', icon: BookOpen, labelKey: 'nav.userManual', end: false },
      { to: '/super-admin/test-notifications', icon: BellRing, labelKey: 'nav.testNotifications', end: false },
      { to: '/super-admin/push-notifications', icon: Bell, labelKey: 'nav.pushNotifications', end: false, badgeKey: 'common.new' },
    ],
  },
  {
    titleKey: 'nav.email',
    items: [
      { to: '/super-admin/email/templates', icon: Mail, labelKey: 'nav.emailTemplates', end: false },
      { to: '/super-admin/email/campaigns', icon: Megaphone, labelKey: 'nav.emailCampaigns', end: false },
      { to: '/super-admin/email/log', icon: ListChecks, labelKey: 'nav.emailLog', end: false },
      { to: '/super-admin/email/settings', icon: SlidersHorizontal, labelKey: 'nav.emailSettings', end: false },
    ],
  },
  {
    items: [
      { to: '/super-admin/branding', icon: ImageIcon, labelKey: 'nav.branding', end: false, badgeKey: 'common.new' },
      { to: '/super-admin/settings', icon: Settings, labelKey: 'nav.settings', end: false },
    ],
  },
];

export default function SuperAdminLayout() {
  const { profile, signOut } = useAuth();
  const { t } = useTranslation();
  const { unreadCount: notificationCount } = useNotifications();
  const { settings: platformSettings } = usePlatformSettings();
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [mobileOpen, setMobileOpen] = useState(false);

  const roleLabel = t(`roles.${profile?.role ?? ''}`);

  return (
    <div className="min-h-screen bg-gray-50 flex">
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 lg:hidden modal-fullscreen"
          onClick={() => setMobileOpen(false)}
        />
      )}

      <aside
        className={`
          fixed inset-y-0 left-0 z-50 flex flex-col bg-teal-900 text-white
          transform transition-all duration-300 ease-in-out
          lg:relative lg:translate-x-0
          ${mobileOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
          ${sidebarOpen ? 'w-64' : 'w-20'}
        `}
      >
        <div className="flex items-center justify-between h-16 px-4 border-b border-teal-800">
          <div
            className={`
              overflow-hidden transition-all duration-300
              ${sidebarOpen ? 'w-full opacity-100' : 'w-0 opacity-0'}
            `}
          >
            <div className="flex items-center gap-2.5">
              {platformSettings.logo && (
                <img src={platformSettings.logo} alt={platformSettings.name} className="w-8 h-8 rounded object-contain flex-shrink-0" />
              )}
              <h1 className="text-lg font-bold whitespace-nowrap">{platformSettings.name}</h1>
            </div>
          </div>
          <button
            onClick={() => setMobileOpen(false)}
            className="lg:hidden p-1 rounded-md hover:bg-teal-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="hidden lg:block p-1 rounded-md hover:bg-teal-800 transition-colors"
          >
            {sidebarOpen ? (
              <ChevronLeft className="w-5 h-5" />
            ) : (
              <ChevronRight className="w-5 h-5" />
            )}
          </button>
        </div>

        <div
          className={`
            px-4 py-4 border-b border-teal-800 transition-all duration-300
            ${sidebarOpen ? 'opacity-100' : 'opacity-0 h-0 py-0 overflow-hidden lg:opacity-100 lg:h-auto lg:py-4'}
          `}
        >
          <p className="text-sm font-semibold truncate">{profile?.full_name ?? ''}</p>
          <p className="text-xs text-teal-300 truncate">{roleLabel}</p>
        </div>

        <nav className="flex-1 py-4 px-2 overflow-y-auto">
          {navSections.map((section, sIdx) => (
            <div key={sIdx} className={sIdx > 0 ? 'mt-4 pt-4 border-t border-teal-800' : ''}>
              {section.titleKey && sidebarOpen && (
                <p className="px-3 mb-2 text-[10px] font-bold text-teal-400 uppercase tracking-widest">{t(section.titleKey)}</p>
              )}
              <div className="space-y-0.5">
                {section.items.map((item) => (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    end={item.end}
                    onClick={() => setMobileOpen(false)}
                    className={({ isActive }) =>
                      `flex items-center gap-3 px-3 py-2 rounded-lg transition-all duration-200 group
                      ${isActive ? 'bg-teal-700 text-white font-medium' : 'text-teal-200 hover:bg-teal-800 hover:text-white'}
                      ${!sidebarOpen ? 'justify-center' : ''}`
                    }
                  >
                    <item.icon className="w-4.5 h-4.5 flex-shrink-0" style={{ width: '18px', height: '18px' }} />
                    <span className={`transition-all duration-300 whitespace-nowrap text-sm ${sidebarOpen ? 'opacity-100 w-auto' : 'opacity-0 w-0 overflow-hidden'}`}>
                      {t(item.labelKey)}
                    </span>
                    {item.badgeKey && sidebarOpen && (
                      <span className="ml-auto px-1.5 py-0.5 rounded text-[9px] font-bold bg-teal-500/30 text-teal-300">{t(item.badgeKey)}</span>
                    )}
                  </NavLink>
                ))}
              </div>
            </div>
          ))}
        </nav>

        <div className="px-2 pb-2">
          {sidebarOpen && <LanguageSwitcher variant="minimal" />}
        </div>

        <div className="p-4 border-t border-teal-800">
          <button
            onClick={signOut}
            className={`
              flex items-center gap-3 w-full px-3 py-2.5 rounded-lg
              text-teal-200 hover:bg-teal-800 hover:text-white transition-colors
              ${!sidebarOpen ? 'justify-center' : ''}
            `}
          >
            <LogOut className="w-5 h-5 flex-shrink-0" />
            <span
              className={`
                transition-all duration-300 whitespace-nowrap
                ${sidebarOpen ? 'opacity-100 w-auto' : 'opacity-0 w-0 overflow-hidden'}
              `}
            >
              {t('common.logout')}
            </span>
          </button>
        </div>
      </aside>

      <div className="flex-1 flex flex-col min-w-0">
        <header className="h-16 bg-white border-b border-gray-200 flex items-center justify-between px-4 lg:px-6 sticky top-0 z-30">
          <button
            onClick={() => setMobileOpen(true)}
            className="lg:hidden p-2 rounded-md text-gray-600 hover:bg-gray-100 transition-colors"
          >
            <Menu className="w-5 h-5" />
          </button>

          <div className="hidden lg:block" />

          <div className="flex items-center gap-4">
            <LanguageSwitcher variant="header" />
            <button className="relative p-2 rounded-md text-gray-600 hover:bg-gray-100 transition-colors">
              <Bell className="w-5 h-5" />
              {notificationCount > 0 && (
                <span className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 text-white text-xs rounded-full flex items-center justify-center">
                  {notificationCount}
                </span>
              )}
            </button>

            <div className="hidden sm:block text-right">
              <p className="text-sm font-medium text-gray-900">{profile?.full_name ?? ''}</p>
              <p className="text-xs text-gray-500">{roleLabel}</p>
            </div>

            <button
              onClick={signOut}
              className="p-2 rounded-md text-gray-600 hover:bg-gray-100 transition-colors"
            >
              <LogOut className="w-5 h-5" />
            </button>
          </div>
        </header>

        <main className="flex-1 p-4 lg:p-6 overflow-auto">
          <Outlet />
        </main>

        <footer className="border-t border-gray-200 bg-white px-4 lg:px-6 py-3 text-center">
          <p className="text-gray-400 text-xs">
            {t('common.createdBy')} <span className="text-gray-500 font-medium">MM Logistic</span>
          </p>
        </footer>
      </div>
    </div>
  );
}
