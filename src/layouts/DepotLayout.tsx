import { useState, useEffect } from 'react';
import { Outlet, NavLink, useLocation } from 'react-router-dom';
import {
  LayoutDashboard,
  Package,
  ArrowLeftRight,
  ArrowDownCircle,
  Layers,
  Wrench,
  MessageSquare,
  FolderOpen,
  LogOut,
  Menu,
  X,
  FileText,
  BarChart3,
  Truck,
  Calendar,
  Clock,
  Settings,
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  BookOpen,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useTranslation } from '../i18n';
import { useCompanyBranding } from '../hooks/useCompanyBranding';
import NotificationDropdown from '../components/NotificationDropdown';
import LanguageSwitcher from '../components/LanguageSwitcher';
import DeletionBanner from '../components/DeletionBanner';

import type { Feature } from '../types';
import { useSubscription } from '../contexts/SubscriptionContext';

type WorkerCategory = 'depoist' | 'reparature';

type NavLeaf = {
  kind?: 'leaf';
  to: string;
  icon: typeof LayoutDashboard;
  labelKey: string;
  end: boolean;
  bottomNav: boolean;
  categories?: WorkerCategory[];
  feature?: Feature;
};

type NavGroup = {
  kind: 'group';
  groupKey: string;
  labelKey: string;
  icon: typeof LayoutDashboard;
  categories?: WorkerCategory[];
  feature?: Feature;
  items: NavLeaf[];
};

type NavEntry = NavLeaf | NavGroup;

const navEntries: NavEntry[] = [
  { to: '/depot', icon: LayoutDashboard, labelKey: 'nav.dashboard', end: true, bottomNav: true },
  { to: '/depot/stock', icon: Package, labelKey: 'nav.stock', end: false, bottomNav: false, categories: ['depoist'] },
  { to: '/depot/trailers', icon: Truck, labelKey: 'nav.trailers', end: false, bottomNav: true, categories: ['depoist'] },
  { to: '/depot/receiving', icon: ArrowLeftRight, labelKey: 'nav.receiving', end: false, bottomNav: true, categories: ['depoist'] },
  { to: '/depot/outgoing', icon: ArrowDownCircle, labelKey: 'nav.outgoing', end: false, bottomNav: true, categories: ['depoist'] },
  { to: '/depot/sorting', icon: Layers, labelKey: 'nav.sorting', end: false, bottomNav: false, categories: ['depoist'], feature: 'sorting' },
  { to: '/depot/delivery-notes', icon: FileText, labelKey: 'nav.deliveryNotes', end: false, bottomNav: false, categories: ['depoist'] },

  {
    kind: 'group', groupKey: 'repairs', icon: Wrench, labelKey: 'nav.groupRepairs', categories: ['depoist'], feature: 'repairs',
    items: [
      { to: '/depot/repairs', icon: Wrench, labelKey: 'nav.repairs', end: false, bottomNav: false, categories: ['depoist'], feature: 'repairs' },
      { to: '/depot/repair-workers', icon: Wrench, labelKey: 'nav.repairWorkers', end: false, bottomNav: false, categories: ['depoist'], feature: 'repairs' },
      { to: '/depot/damage', icon: AlertTriangle, labelKey: 'nav.damage', end: false, bottomNav: false, categories: ['depoist'], feature: 'repairs' },
    ],
  },

  { to: '/depot/reports', icon: BarChart3, labelKey: 'nav.reports', end: false, bottomNav: false, categories: ['depoist'] },
  { to: '/depot/chat', icon: MessageSquare, labelKey: 'nav.chat', end: false, bottomNav: true },
  { to: '/depot/documents', icon: FolderOpen, labelKey: 'nav.documents', end: false, bottomNav: false },

  {
    kind: 'group', groupKey: 'hr', icon: Calendar, labelKey: 'nav.groupHr', feature: 'hr',
    items: [
      { to: '/depot/leave', icon: Calendar, labelKey: 'nav.hrLeave', end: false, bottomNav: false, feature: 'hr' },
      { to: '/depot/attendance', icon: Clock, labelKey: 'nav.hrAttendance', end: false, bottomNav: false, feature: 'hr' },
      { to: '/depot/work-hours', icon: Clock, labelKey: 'nav.workHours', end: false, bottomNav: false, feature: 'hr' },
    ],
  },

  { to: '/depot/settings', icon: Settings, labelKey: 'nav.settings', end: false, bottomNav: false },
  { to: '/depot/manual', icon: BookOpen, labelKey: 'nav.manual', end: false, bottomNav: false },
];

function leafVisible(
  item: NavLeaf,
  cat: WorkerCategory | null | undefined,
  hasFeature: (f: Feature) => boolean,
): boolean {
  if (item.feature && !hasFeature(item.feature)) return false;
  if (!item.categories) return true;
  if (!cat) return true;
  return item.categories.includes(cat);
}

function entryVisible(
  entry: NavEntry,
  cat: WorkerCategory | null | undefined,
  hasFeature: (f: Feature) => boolean,
): boolean {
  if (entry.kind === 'group') {
    if (entry.feature && !hasFeature(entry.feature)) return false;
    if (entry.categories && cat && !entry.categories.includes(cat)) return false;
    return entry.items.some((it) => leafVisible(it, cat, hasFeature));
  }
  return leafVisible(entry, cat, hasFeature);
}

function isGroupActive(group: NavGroup, pathname: string): boolean {
  return group.items.some((it) =>
    it.end ? pathname === it.to : pathname.startsWith(it.to) && it.to !== '/depot'
  );
}

export default function DepotLayout() {
  const { profile, signOut } = useAuth();
  const { t } = useTranslation();
  const { canAccess } = useSubscription();
  const { name: brandName, logo: brandLogo } = useCompanyBranding();
  const location = useLocation();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    setMobileMenuOpen(false);
  }, [location.pathname]);

  const roleLabel = t(`roles.${profile?.role ?? ''}`);
  const workerCategory = profile?.worker_category as WorkerCategory | null | undefined;
  const visibleEntries = navEntries.filter((e) => entryVisible(e, workerCategory, canAccess));
  const navItems = visibleEntries.flatMap((e) =>
    e.kind === 'group' ? e.items.filter((it) => leafVisible(it, workerCategory, canAccess)) : [e]
  );
  const bottomNavItems = navItems.filter((i) => i.bottomNav);

  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>(() => {
    let stored: Record<string, boolean> = {};
    try {
      const raw = typeof window !== 'undefined' ? window.localStorage.getItem('mml.depotNav.openGroups') : null;
      if (raw) stored = JSON.parse(raw);
    } catch { /* ignore */ }
    const initial: Record<string, boolean> = {};
    for (const e of navEntries) {
      if (e.kind === 'group') {
        initial[e.groupKey] = stored[e.groupKey] ?? isGroupActive(e, location.pathname);
      }
    }
    return initial;
  });
  function toggleGroup(key: string) {
    setOpenGroups((prev) => {
      const next = { ...prev, [key]: !prev[key] };
      try { window.localStorage.setItem('mml.depotNav.openGroups', JSON.stringify(next)); } catch { /* ignore */ }
      return next;
    });
  }
  useEffect(() => {
    setOpenGroups((prev) => {
      let changed = false;
      const next = { ...prev };
      for (const e of navEntries) {
        if (e.kind === 'group' && isGroupActive(e, location.pathname) && !next[e.groupKey]) {
          next[e.groupKey] = true;
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [location.pathname]);

  function renderLeaf(item: NavLeaf) {
    return (
      <NavLink
        key={item.to}
        to={item.to}
        end={item.end}
        className={({ isActive }) =>
          `flex items-center gap-3 px-3 py-2 rounded-lg transition-all duration-200 text-sm
          ${isActive ? 'bg-teal-700 text-white font-medium' : 'text-teal-200 hover:bg-teal-800 hover:text-white'}`
        }
      >
        <item.icon className="w-4 h-4 flex-shrink-0" />
        <span className="whitespace-nowrap">{t(item.labelKey)}</span>
      </NavLink>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col lg:flex-row">
      {/* Desktop Sidebar */}
      <aside className="hidden lg:flex w-64 flex-col bg-teal-900 text-white fixed inset-y-0 left-0 z-40">
        <div className="flex items-center gap-2.5 h-16 px-4 border-b border-teal-800">
          {brandLogo && (
            <img src={brandLogo} alt={brandName} className="w-8 h-8 rounded object-cover flex-shrink-0" />
          )}
          <h1 className="text-lg font-bold whitespace-nowrap truncate">{brandName}</h1>
        </div>

        <div className="px-4 py-4 border-b border-teal-800">
          <p className="text-sm font-semibold truncate">{profile?.full_name ?? ''}</p>
          <p className="text-xs text-teal-300 truncate">{roleLabel}</p>
        </div>

        <nav className="flex-1 py-3 space-y-0.5 px-2 overflow-y-auto">
          {visibleEntries.map((entry) => {
            if (entry.kind === 'group') {
              const isOpen = !!openGroups[entry.groupKey];
              const containsActive = isGroupActive(entry, location.pathname);
              const childLeaves = entry.items.filter((it) => leafVisible(it, workerCategory, canAccess));
              return (
                <div key={entry.groupKey} className="pt-1">
                  <button
                    type="button"
                    onClick={() => toggleGroup(entry.groupKey)}
                    className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg transition-colors ${
                      containsActive ? 'text-white' : 'text-teal-300'
                    } hover:bg-teal-800/60`}
                  >
                    <entry.icon className="w-4 h-4 flex-shrink-0 opacity-80" />
                    <span className="flex-1 text-left text-[11px] uppercase tracking-wider font-semibold">
                      {t(entry.labelKey)}
                    </span>
                    {isOpen ? <ChevronDown className="w-4 h-4 opacity-60" /> : <ChevronRight className="w-4 h-4 opacity-60" />}
                  </button>
                  {isOpen && (
                    <div className="mt-0.5 ml-2 pl-2 border-l border-teal-800/60 space-y-0.5">
                      {childLeaves.map((it) => renderLeaf(it))}
                    </div>
                  )}
                </div>
              );
            }
            return renderLeaf(entry);
          })}
        </nav>

        <div className="px-2 pb-2">
          <LanguageSwitcher variant="minimal" />
        </div>

        <div className="p-4 border-t border-teal-800">
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
      <div className="flex-1 flex flex-col min-w-0 lg:ml-64">
        {/* Header */}
        <header className="h-14 bg-white border-b border-gray-200 flex items-center justify-between px-4 sticky top-0 z-30 lg:h-16 lg:px-6">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setMobileMenuOpen(true)}
              className="lg:hidden p-1.5 -ml-1.5 rounded-lg text-gray-600 hover:bg-gray-100 active:bg-gray-200 transition-colors"
            >
              <Menu className="w-5 h-5" />
            </button>
            <div className="flex items-center gap-2 lg:hidden">
              {brandLogo && (
                <img src={brandLogo} alt={brandName} className="w-7 h-7 rounded object-cover" />
              )}
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

        <DeletionBanner />
        <main className="flex-1 p-4 lg:p-6 pb-safe-nav overflow-auto">
          <Outlet />
        </main>

        <footer className="hidden lg:block border-t border-gray-200 bg-white px-6 py-3 text-center">
          <p className="text-gray-400 text-xs">
            {t('common.createdBy')} <span className="text-gray-500 font-medium">MarGroup</span>
          </p>
        </footer>
      </div>

      {/* Mobile Bottom Navigation */}
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
                  ? 'text-teal-600'
                  : 'text-gray-400 active:text-gray-600'
                }`
              }
            >
              <item.icon className="w-5 h-5 flex-shrink-0" />
              <span className="text-[10px] font-medium leading-tight max-w-full px-0.5 text-center line-clamp-2 break-words">{t(item.labelKey)}</span>
            </NavLink>
          ))}
        </div>
      </nav>

      {/* Mobile Menu Overlay */}
      {mobileMenuOpen && (
        <div className="lg:hidden fixed inset-0 z-[950] bg-white flex flex-col modal-fullscreen">
          <div className="flex items-center justify-between h-14 px-4 border-b border-gray-100 flex-shrink-0">
            <div className="flex items-center gap-2">
              {brandLogo && (
                <img src={brandLogo} alt={brandName} className="w-7 h-7 rounded object-cover" />
              )}
              <span className="font-semibold text-gray-900">{brandName}</span>
            </div>
            <button
              onClick={() => setMobileMenuOpen(false)}
              className="p-2 rounded-lg text-gray-500 hover:bg-gray-100 active:bg-gray-200"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="p-4 border-b border-gray-100 bg-gray-50 flex-shrink-0">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-teal-600 flex items-center justify-center text-white font-bold text-sm">
                {profile?.full_name?.charAt(0) ?? 'U'}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-gray-900 truncate">{profile?.full_name ?? ''}</p>
                <p className="text-xs text-gray-500">{roleLabel}</p>
              </div>
            </div>
          </div>

          <nav className="flex-1 overflow-y-auto overscroll-contain p-4 space-y-2">
            {navItems.map((item) => {
              const isActive = item.end
                ? location.pathname === item.to
                : location.pathname.startsWith(item.to);
              return (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.end}
                  onClick={() => setMobileMenuOpen(false)}
                  className={`flex items-center gap-3 p-4 rounded-xl transition-all active:scale-[0.98]
                    ${isActive
                      ? 'bg-teal-50 text-teal-700 ring-1 ring-teal-200'
                      : 'bg-gray-50 text-gray-600 active:bg-gray-100'
                    }`}
                >
                  <item.icon className="w-5 h-5" />
                  <span className="text-sm font-medium">{t(item.labelKey)}</span>
                </NavLink>
              );
            })}
          </nav>

          <div className="flex-shrink-0 p-4 border-t border-gray-100 bg-white pb-[max(1rem,env(safe-area-inset-bottom))]">
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
