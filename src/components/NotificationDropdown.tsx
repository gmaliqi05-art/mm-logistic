import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Bell,
  MessageSquare,
  FileText,
  Truck,
  Info,
  Check,
  CheckCheck,
  Loader2,
  X,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { useTranslation } from '../i18n';
import { useNotifications } from '../hooks/useNotifications';

interface Notification {
  id: string;
  type: string;
  title: string;
  message: string;
  is_read: boolean;
  created_at: string;
  reference_id: string | null;
  data?: {
    event?: string;
    note_type?: 'delivery' | 'pickup';
    note_number?: string;
    titleKey?: string;
    messageKey?: string;
    params?: Record<string, string | number>;
    action_url?: string;
  } | null;
}

const typeIcons: Record<string, typeof MessageSquare> = {
  chat: MessageSquare,
  document: FileText,
  delivery: Truck,
  delivery_note: Truck,
  stock: FileText,
  system: Info,
};

const typeColors: Record<string, string> = {
  chat: 'bg-teal-100 text-teal-600',
  document: 'bg-blue-100 text-blue-600',
  delivery: 'bg-amber-100 text-amber-600',
  delivery_note: 'bg-amber-100 text-amber-600',
  stock: 'bg-orange-100 text-orange-600',
  system: 'bg-gray-100 text-gray-600',
};

export default function NotificationDropdown() {
  const { profile } = useAuth();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { unreadCount, markAsRead, markAllAsRead } = useNotifications();
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    if (open && profile?.id) {
      fetchNotifications();
    }
  }, [open, profile?.id]);

  async function fetchNotifications() {
    setLoading(true);
    const { data, error } = await supabase
      .from('notifications')
      .select('*')
      .eq('user_id', profile!.id)
      .order('created_at', { ascending: false })
      .limit(20);

    if (!error) {
      setNotifications(data ?? []);
    }
    setLoading(false);
  }

  async function handleMarkRead(id: string) {
    await markAsRead(id);
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, is_read: true } : n))
    );
  }

  /**
   * Computes the destination route for a notification. Preference order:
   *   1. data.action_url written by the trigger / sender (most specific)
   *   2. reference_id + type derive a sensible page given the user's role
   *   3. null (no navigation)
   *
   * The role check is important because the same delivery_note id renders
   * on /company/delivery-notes/X for an admin but /driver for a driver.
   */
  function notificationDestination(n: Notification): string | null {
    if (n.data?.action_url) return n.data.action_url;
    if (!n.reference_id) return null;
    const role = profile?.role;
    if (n.type === 'delivery' || n.type === 'delivery_note' || n.type === 'assignment') {
      if (role === 'driver') return '/driver';
      if (role === 'depot_worker') return '/depot/delivery-notes';
      if (role === 'logistics_admin') return '/logistics/active';
      return '/company/delivery-notes';
    }
    if (n.type === 'chat') {
      if (role === 'driver') return '/driver/chat';
      if (role === 'depot_worker') return '/depot/chat';
      return '/company/chat';
    }
    if (n.type === 'document') {
      if (role === 'driver') return '/driver/documents';
      if (role === 'depot_worker') return '/depot/documents';
      return '/company/documents';
    }
    if (n.type === 'stock') {
      return role === 'depot_worker' ? '/depot/stock' : '/company/stock';
    }
    return null;
  }

  async function handleNotificationClick(n: Notification) {
    if (!n.is_read) await handleMarkRead(n.id);
    const dest = notificationDestination(n);
    setOpen(false);
    if (dest) navigate(dest);
  }

  async function handleMarkAllRead() {
    await markAllAsRead();
    setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
  }

  function translateNotif(n: Notification): { title: string; message: string } {
    if (n.data?.titleKey && n.data?.messageKey) {
      const params = n.data.params ?? {};
      const fill = (s: string) =>
        Object.entries(params).reduce(
          (acc, [k, v]) => acc.replace(new RegExp(`\\{${k}\\}`, 'g'), String(v)),
          s,
        );
      const tTitle = t(n.data.titleKey);
      const tMsg = t(n.data.messageKey);
      return {
        title: tTitle === n.data.titleKey ? n.title : fill(tTitle),
        message: tMsg === n.data.messageKey ? n.message : fill(tMsg),
      };
    }
    const event = n.data?.event;
    if (!event) return { title: n.title, message: n.message };
    const noteType = n.data?.note_type === 'pickup' ? 'pickup' : 'delivery';
    const typeLabel = t(`notifications.types.${noteType}`);
    const number = n.data?.note_number ?? '';
    const titleKey = `notifications.events.${event}.title`;
    const bodyKey = `notifications.events.${event}.body`;
    const tplTitle = t(titleKey);
    const tplBody = t(bodyKey);
    const fill = (s: string) => s
      .replace('{type}', typeLabel)
      .replace('{typeLower}', typeLabel.toLowerCase())
      .replace('{number}', number);
    return {
      title: tplTitle === titleKey ? n.title : fill(tplTitle),
      message: tplBody === bodyKey ? n.message : fill(tplBody),
    };
  }

  function formatTime(dateStr: string) {
    const d = new Date(dateStr);
    const now = new Date();
    const diff = now.getTime() - d.getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return t('common.now') || 'Tani';
    if (mins < 60) return `${mins} min`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h`;
    const days = Math.floor(hours / 24);
    if (days < 7) return `${days}d`;
    return d.toLocaleDateString(undefined, { day: '2-digit', month: '2-digit' });
  }

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setOpen(!open)}
        className="relative p-2 rounded-md text-gray-600 hover:bg-gray-100 transition-colors"
      >
        <Bell className="w-5 h-5" />
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 text-white text-xs rounded-full flex items-center justify-center font-medium">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-80 sm:w-96 bg-white rounded-xl shadow-2xl border border-gray-200 z-50 overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 bg-gray-50/80">
            <h3 className="text-sm font-semibold text-gray-900">
              {t('nav.notifications') || 'Njoftimet'}
            </h3>
            <div className="flex items-center gap-2">
              {unreadCount > 0 && (
                <button
                  onClick={handleMarkAllRead}
                  className="text-xs text-teal-600 hover:text-teal-700 font-medium flex items-center gap-1"
                >
                  <CheckCheck className="w-3.5 h-3.5" />
                  {t('common.markAllRead') || 'Lexo te gjitha'}
                </button>
              )}
              <button
                onClick={() => setOpen(false)}
                className="p-1 text-gray-400 hover:text-gray-600 rounded transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          <div className="max-h-80 overflow-y-auto">
            {loading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-5 h-5 animate-spin text-teal-600" />
              </div>
            ) : notifications.length === 0 ? (
              <div className="py-10 text-center">
                <Bell className="w-8 h-8 text-gray-200 mx-auto mb-2" />
                <p className="text-sm text-gray-400">
                  {t('common.noNotifications') || 'Nuk ka njoftime'}
                </p>
              </div>
            ) : (
              notifications.map((notif) => {
                const Icon = typeIcons[notif.type] || Info;
                const colorClass = typeColors[notif.type] || typeColors.system;
                const { title, message } = translateNotif(notif);
                const hasDestination = notificationDestination(notif) != null;
                return (
                  <div
                    key={notif.id}
                    onClick={hasDestination ? () => handleNotificationClick(notif) : undefined}
                    className={`flex items-start gap-3 px-4 py-3 border-b border-gray-50 transition-colors ${
                      !notif.is_read ? 'bg-teal-50/40' : 'hover:bg-gray-50'
                    } ${hasDestination ? 'cursor-pointer' : ''}`}
                  >
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5 ${colorClass}`}>
                      <Icon className="w-4 h-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <p className={`text-sm leading-tight ${!notif.is_read ? 'font-semibold text-gray-900' : 'font-medium text-gray-700'}`}>
                          {title}
                        </p>
                        <span className="text-xs text-gray-400 flex-shrink-0 mt-0.5">
                          {formatTime(notif.created_at)}
                        </span>
                      </div>
                      <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{message}</p>
                    </div>
                    {!notif.is_read && (
                      <button
                        onClick={(e) => { e.stopPropagation(); handleMarkRead(notif.id); }}
                        className="p-1 text-teal-500 hover:text-teal-700 hover:bg-teal-100 rounded transition-colors flex-shrink-0 mt-0.5"
                        title={t('common.markRead') || 'Lexo'}
                      >
                        <Check className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
