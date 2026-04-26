import { useState } from 'react';
import {
  Bell,
  Send,
  AlertTriangle,
  CheckCircle,
  Loader2,
  Smartphone,
  Monitor,
  Info,
  AlertCircle,
  BellRing,
} from 'lucide-react';
import { useTranslation } from '../../i18n';

type NotifType = 'info' | 'success' | 'warning' | 'error';

interface TestLog {
  id: string;
  type: NotifType;
  title: string;
  message: string;
  timestamp: string;
  status: 'sent' | 'failed';
}

export default function TestNotifications() {
  const { t } = useTranslation();

  const notifTypes: { value: NotifType; label: string; icon: typeof Info; color: string; bgColor: string }[] = [
    { value: 'info', label: t('superAdmin.notifications.info'), icon: Info, color: 'text-blue-600', bgColor: 'bg-blue-100' },
    { value: 'success', label: t('superAdmin.notifications.success'), icon: CheckCircle, color: 'text-green-600', bgColor: 'bg-green-100' },
    { value: 'warning', label: t('superAdmin.notifications.warning'), icon: AlertTriangle, color: 'text-amber-600', bgColor: 'bg-amber-100' },
    { value: 'error', label: t('superAdmin.notifications.errorType'), icon: AlertCircle, color: 'text-red-600', bgColor: 'bg-red-100' },
  ];

  const [notifType, setNotifType] = useState<NotifType>('info');
  const [title, setTitle] = useState(t('superAdmin.notifications.defaultTitle'));
  const [message, setMessage] = useState(t('superAdmin.notifications.defaultMessage'));
  const [sending, setSending] = useState(false);
  const [logs, setLogs] = useState<TestLog[]>([]);
  const [permissionStatus, setPermissionStatus] = useState<string>(
    typeof Notification !== 'undefined' ? Notification.permission : 'unsupported'
  );
  const [showBadge, setShowBadge] = useState(false);
  const [badgeCount, setBadgeCount] = useState(3);

  async function requestPermission() {
    if (typeof Notification === 'undefined') return;
    const result = await Notification.requestPermission();
    setPermissionStatus(result);
  }

  async function sendTestNotification() {
    if (!title.trim()) return;
    setSending(true);

    try {
      if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
        new Notification(title, {
          body: message,
          icon: '/vite.svg',
          tag: `test-${Date.now()}`,
        });
      }

      const log: TestLog = {
        id: crypto.randomUUID(),
        type: notifType,
        title: title.trim(),
        message: message.trim(),
        timestamp: new Date().toISOString(),
        status: 'sent',
      };
      setLogs((prev) => [log, ...prev]);
    } catch {
      const log: TestLog = {
        id: crypto.randomUUID(),
        type: notifType,
        title: title.trim(),
        message: message.trim(),
        timestamp: new Date().toISOString(),
        status: 'failed',
      };
      setLogs((prev) => [log, ...prev]);
    } finally {
      setSending(false);
    }
  }

  function toggleBadge() {
    setShowBadge(!showBadge);
    if ('setAppBadge' in navigator) {
      if (!showBadge) {
        (navigator as any).setAppBadge(badgeCount);
      } else {
        (navigator as any).clearAppBadge();
      }
    }
  }

  const permissionColor = permissionStatus === 'granted'
    ? 'bg-green-100 text-green-700'
    : permissionStatus === 'denied'
      ? 'bg-red-100 text-red-700'
      : 'bg-amber-100 text-amber-700';

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">{t('superAdmin.notifications.title')}</h1>
        <p className="text-gray-500 mt-1">{t('superAdmin.notifications.subtitle')}</p>
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-white rounded-xl shadow-sm border border-gray-100">
            <div className="p-6 border-b border-gray-100">
              <div className="flex items-center gap-2">
                <Bell className="w-5 h-5 text-teal-600" />
                <h2 className="text-lg font-semibold text-gray-900">{t('superAdmin.notifications.sendTest')}</h2>
              </div>
            </div>
            <div className="p-6 space-y-5">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">{t('superAdmin.notifications.notifType')}</label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {notifTypes.map((nt) => {
                    const Icon = nt.icon;
                    return (
                      <button
                        key={nt.value}
                        onClick={() => setNotifType(nt.value)}
                        className={`flex items-center gap-2 px-3 py-2.5 rounded-lg border-2 transition-all text-sm font-medium ${
                          notifType === nt.value
                            ? `border-teal-500 ${nt.bgColor} ${nt.color}`
                            : 'border-gray-200 text-gray-600 hover:border-gray-300'
                        }`}
                      >
                        <Icon className="w-4 h-4" />
                        {nt.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">{t('common.title')}</label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="w-full px-3 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent text-sm"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">{t('superAdmin.notifications.message')}</label>
                <textarea
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  rows={3}
                  className="w-full px-3 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent text-sm resize-none"
                />
              </div>

              <button
                onClick={sendTestNotification}
                disabled={sending || !title.trim()}
                className="inline-flex items-center gap-2 px-6 py-2.5 bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition-colors font-medium disabled:opacity-50"
              >
                {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                {sending ? t('common.sending') : t('superAdmin.notifications.sendNotif')}
              </button>
            </div>
          </div>

          <div className="bg-white rounded-xl shadow-sm border border-gray-100">
            <div className="p-6 border-b border-gray-100">
              <div className="flex items-center gap-2">
                <BellRing className="w-5 h-5 text-teal-600" />
                <h2 className="text-lg font-semibold text-gray-900">{t('superAdmin.notifications.badgeTesting')}</h2>
              </div>
            </div>
            <div className="p-6 space-y-4">
              <div className="flex items-center gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">{t('superAdmin.notifications.badgeNumber')}</label>
                  <input
                    type="number"
                    min="0"
                    max="99"
                    value={badgeCount}
                    onChange={(e) => setBadgeCount(Number(e.target.value))}
                    className="w-24 px-3 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent text-sm"
                  />
                </div>
                <div className="pt-6">
                  <button
                    onClick={toggleBadge}
                    className={`inline-flex items-center gap-2 px-4 py-2.5 rounded-lg font-medium text-sm transition-colors ${
                      showBadge ? 'bg-red-100 text-red-700 hover:bg-red-200' : 'bg-teal-100 text-teal-700 hover:bg-teal-200'
                    }`}
                  >
                    <Bell className="w-4 h-4" />
                    {showBadge ? t('superAdmin.notifications.hideBadge') : t('superAdmin.notifications.showBadge')}
                  </button>
                </div>
              </div>

              <div className="flex items-center gap-4 p-4 bg-gray-50 rounded-xl">
                <div className="relative">
                  <div className="w-12 h-12 bg-teal-600 rounded-xl flex items-center justify-center">
                    <Smartphone className="w-6 h-6 text-white" />
                  </div>
                  {showBadge && (
                    <span className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-red-500 text-white text-xs font-bold rounded-full flex items-center justify-center">
                      {badgeCount}
                    </span>
                  )}
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-900">{t('superAdmin.notifications.badgePreview')}</p>
                  <p className="text-xs text-gray-500">{showBadge ? `${badgeCount} ${t('superAdmin.notifications.unreadNotifs')}` : t('superAdmin.notifications.noBadge')}</p>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="space-y-6">
          <div className="bg-white rounded-xl shadow-sm border border-gray-100">
            <div className="p-6 border-b border-gray-100">
              <div className="flex items-center gap-2">
                <Monitor className="w-5 h-5 text-teal-600" />
                <h2 className="text-lg font-semibold text-gray-900">{t('superAdmin.notifications.statusTitle')}</h2>
              </div>
            </div>
            <div className="p-6 space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-700">{t('superAdmin.notifications.pushPermission')}</span>
                <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${permissionColor}`}>
                  {permissionStatus}
                </span>
              </div>
              {permissionStatus !== 'granted' && permissionStatus !== 'unsupported' && (
                <button
                  onClick={requestPermission}
                  className="w-full px-4 py-2.5 bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition-colors text-sm font-medium"
                >
                  {t('superAdmin.notifications.requestPermission')}
                </button>
              )}
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-700">Badge API</span>
                <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${'setAppBadge' in navigator ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                  {'setAppBadge' in navigator ? t('superAdmin.notifications.supported') : t('superAdmin.notifications.notSupported')}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-700">Service Worker</span>
                <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${'serviceWorker' in navigator ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                  {'serviceWorker' in navigator ? t('superAdmin.notifications.supported') : t('superAdmin.notifications.notSupported')}
                </span>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl shadow-sm border border-gray-100">
            <div className="p-6 border-b border-gray-100">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-gray-900">{t('superAdmin.notifications.testLog')}</h3>
                {logs.length > 0 && (
                  <button onClick={() => setLogs([])} className="text-xs text-gray-400 hover:text-gray-600">{t('superAdmin.notifications.clearLog')}</button>
                )}
              </div>
            </div>
            <div className="max-h-80 overflow-y-auto">
              {logs.length === 0 ? (
                <div className="p-6 text-center">
                  <Bell className="w-8 h-8 text-gray-300 mx-auto mb-2" />
                  <p className="text-xs text-gray-400">{t('superAdmin.notifications.noTests')}</p>
                </div>
              ) : (
                <div className="divide-y divide-gray-50">
                  {logs.map((log) => {
                    const nt = notifTypes.find((n) => n.value === log.type);
                    const Icon = nt?.icon || Info;
                    return (
                      <div key={log.id} className="p-3 flex items-start gap-2">
                        <div className={`p-1 rounded ${nt?.bgColor || 'bg-gray-100'}`}>
                          <Icon className={`w-3 h-3 ${nt?.color || 'text-gray-600'}`} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-medium text-gray-900 truncate">{log.title}</p>
                          <p className="text-xs text-gray-500 truncate">{log.message}</p>
                          <div className="flex items-center gap-2 mt-0.5">
                            <span className="text-xs text-gray-400">{new Date(log.timestamp).toLocaleTimeString()}</span>
                            <span className={`text-xs font-medium ${log.status === 'sent' ? 'text-green-600' : 'text-red-600'}`}>
                              {log.status === 'sent' ? t('superAdmin.notifications.sent') : t('superAdmin.notifications.failed')}
                            </span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
