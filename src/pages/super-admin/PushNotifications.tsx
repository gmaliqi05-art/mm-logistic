import { useEffect, useMemo, useState } from 'react';
import {
  Activity, Send, Layers, Shield, List, Settings2, Smartphone,
  Loader2, Plus, Save, Trash2, CheckCircle2, XCircle, Users,
  Megaphone, Clock, AlertCircle, Globe,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { useTranslation } from '../../i18n';
import { TableRowsSkeleton, CardListSkeleton } from '../../components/ui/Skeleton';

type Tab = 'overview' | 'compose' | 'templates' | 'channels' | 'permissions' | 'logs' | 'platform' | 'devices';

interface Channel {
  code: string;
  label: string;
  description: string;
  category: string;
  default_enabled: boolean;
  is_system: boolean;
  icon: string;
}

interface Template {
  id: string;
  channel_code: string;
  locale: string;
  title_template: string;
  body_template: string;
  variables: string[];
}

interface Permission {
  id: string;
  role: string;
  channel_code: string;
  can_send: boolean;
  can_receive: boolean;
}

interface QueueItem {
  id: string;
  channel_code: string;
  title: string;
  body: string;
  status: string;
  scheduled_at: string;
  sent_at: string | null;
  total_recipients: number;
  sent_count: number;
  failed_count: number;
  created_at: string;
}

interface Delivery {
  id: string;
  user_id: string;
  channel_code: string;
  platform: string;
  status: string;
  error_message: string | null;
  attempted_at: string;
}

interface PlatformSettings {
  vapid_public_key: string;
  vapid_subject: string;
  fcm_project_id: string;
  fcm_configured: boolean;
  apns_bundle_id: string;
  apns_team_id: string;
  apns_key_id: string;
  apns_configured: boolean;
}

const ROLES = ['super_admin', 'company_admin', 'logistics_admin', 'driver', 'depot_worker', 'accountant'];

export default function PushNotifications() {
  const { profile } = useAuth();
  const [tab, setTab] = useState<Tab>('overview');

  const tabs: { key: Tab; label: string; icon: typeof Activity }[] = [
    { key: 'overview', label: 'Overview', icon: Activity },
    { key: 'compose', label: 'Compose', icon: Send },
    { key: 'templates', label: 'Templates', icon: Layers },
    { key: 'channels', label: 'Channels', icon: Megaphone },
    { key: 'permissions', label: 'Permissions', icon: Shield },
    { key: 'logs', label: 'Logs', icon: List },
    { key: 'platform', label: 'Platform', icon: Settings2 },
    { key: 'devices', label: 'Devices', icon: Smartphone },
  ];

  if (profile?.role !== 'super_admin') {
    return <div className="p-6 text-center text-slate-600">Access denied</div>;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Push Notification Center</h1>
        <p className="text-sm text-slate-500 mt-1">
          Manage multi-platform push notifications across Web, Android (FCM), and iOS (APNs).
        </p>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="flex overflow-x-auto border-b border-slate-200 scrollbar-thin">
          {tabs.map((t) => {
            const Icon = t.icon;
            const active = tab === t.key;
            return (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={`flex items-center gap-2 px-4 py-3 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${
                  active
                    ? 'border-teal-600 text-teal-700 bg-teal-50'
                    : 'border-transparent text-slate-600 hover:text-slate-900 hover:bg-slate-50'
                }`}
              >
                <Icon className="w-4 h-4" />
                {t.label}
              </button>
            );
          })}
        </div>

        <div className="p-6">
          {tab === 'overview' && <OverviewTab />}
          {tab === 'compose' && <ComposeTab />}
          {tab === 'templates' && <TemplatesTab />}
          {tab === 'channels' && <ChannelsTab />}
          {tab === 'permissions' && <PermissionsTab />}
          {tab === 'logs' && <LogsTab />}
          {tab === 'platform' && <PlatformTab />}
          {tab === 'devices' && <DevicesTab />}
        </div>
      </div>
    </div>
  );
}

function OverviewTab() {
  const { t: tr } = useTranslation();
  const [stats, setStats] = useState({
    totalQueued: 0,
    sentToday: 0,
    failedToday: 0,
    activeWebSubs: 0,
    activeAndroidTokens: 0,
    activeIosTokens: 0,
    totalUsers: 0,
  });
  const [recent, setRecent] = useState<QueueItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void load();
  }, []);

  async function load() {
    setLoading(true);
    const todayIso = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    const [qCount, sentToday, failedToday, webSubs, droid, ios, users, recentQueue] = await Promise.all([
      supabase.from('notification_queue').select('id', { count: 'exact', head: true }).eq('status', 'queued'),
      supabase.from('notification_deliveries').select('id', { count: 'exact', head: true }).eq('status', 'sent').gte('attempted_at', todayIso),
      supabase.from('notification_deliveries').select('id', { count: 'exact', head: true }).eq('status', 'failed').gte('attempted_at', todayIso),
      supabase.from('push_subscriptions').select('id', { count: 'exact', head: true }).eq('is_active', true),
      supabase.from('device_tokens').select('id', { count: 'exact', head: true }).eq('is_active', true).eq('platform', 'android'),
      supabase.from('device_tokens').select('id', { count: 'exact', head: true }).eq('is_active', true).eq('platform', 'ios'),
      supabase.from('profiles').select('id', { count: 'exact', head: true }),
      supabase.from('notification_queue').select('*').order('created_at', { ascending: false }).limit(10),
    ]);

    setStats({
      totalQueued: qCount.count ?? 0,
      sentToday: sentToday.count ?? 0,
      failedToday: failedToday.count ?? 0,
      activeWebSubs: webSubs.count ?? 0,
      activeAndroidTokens: droid.count ?? 0,
      activeIosTokens: ios.count ?? 0,
      totalUsers: users.count ?? 0,
    });
    setRecent((recentQueue.data ?? []) as QueueItem[]);
    setLoading(false);
  }

  if (loading) return <CardListSkeleton count={3} />;

  const cards = [
    { label: 'Queued', value: stats.totalQueued, icon: Clock, color: 'text-amber-600', bg: 'bg-amber-50' },
    { label: 'Sent (24h)', value: stats.sentToday, icon: CheckCircle2, color: 'text-emerald-600', bg: 'bg-emerald-50' },
    { label: 'Failed (24h)', value: stats.failedToday, icon: XCircle, color: 'text-rose-600', bg: 'bg-rose-50' },
    { label: 'Total Users', value: stats.totalUsers, icon: Users, color: 'text-blue-600', bg: 'bg-blue-50' },
    { label: 'Web Subs', value: stats.activeWebSubs, icon: Globe, color: 'text-teal-600', bg: 'bg-teal-50' },
    { label: 'Android', value: stats.activeAndroidTokens, icon: Smartphone, color: 'text-green-600', bg: 'bg-green-50' },
    { label: 'iOS', value: stats.activeIosTokens, icon: Smartphone, color: 'text-slate-700', bg: 'bg-slate-100' },
  ];

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-7 gap-3">
        {cards.map((c) => {
          const Icon = c.icon;
          return (
            <div key={c.label} className="bg-white border border-slate-200 rounded-lg p-4">
              <div className={`w-9 h-9 rounded-lg ${c.bg} ${c.color} flex items-center justify-center mb-2`}>
                <Icon className="w-4 h-4" />
              </div>
              <p className="text-2xl font-bold text-slate-900">{c.value}</p>
              <p className="text-xs text-slate-500 mt-0.5">{c.label}</p>
            </div>
          );
        })}
      </div>

      <div>
        <h3 className="text-sm font-semibold text-slate-900 mb-3">Recent Queue Activity</h3>
        <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="text-left px-4 py-2 font-medium text-slate-600">Title</th>
                <th className="text-left px-4 py-2 font-medium text-slate-600">Channel</th>
                <th className="text-left px-4 py-2 font-medium text-slate-600">Status</th>
                <th className="text-right px-4 py-2 font-medium text-slate-600">Recipients</th>
                <th className="text-right px-4 py-2 font-medium text-slate-600">Sent / Failed</th>
                <th className="text-right px-4 py-2 font-medium text-slate-600">Scheduled</th>
              </tr>
            </thead>
            <tbody>
              {recent.map((r) => (
                <tr key={r.id} className="border-t border-slate-100">
                  <td className="px-4 py-2 text-slate-900 font-medium">{r.title}</td>
                  <td className="px-4 py-2 text-slate-600">{r.channel_code}</td>
                  <td className="px-4 py-2">
                    <StatusBadge status={r.status} />
                  </td>
                  <td className="px-4 py-2 text-right text-slate-700">{r.total_recipients}</td>
                  <td className="px-4 py-2 text-right text-slate-700">
                    <span className="text-emerald-600">{r.sent_count}</span>
                    {' / '}
                    <span className="text-rose-600">{r.failed_count}</span>
                  </td>
                  <td className="px-4 py-2 text-right text-slate-500 text-xs">
                    {new Date(r.scheduled_at).toLocaleString()}
                  </td>
                </tr>
              ))}
              {recent.length === 0 && (
                <tr><td colSpan={6} className="px-4 py-8 text-center text-slate-400">{tr('common.noNotificationsYet')}</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { bg: string; text: string }> = {
    queued: { bg: 'bg-amber-100', text: 'text-amber-700' },
    processing: { bg: 'bg-blue-100', text: 'text-blue-700' },
    sent: { bg: 'bg-emerald-100', text: 'text-emerald-700' },
    failed: { bg: 'bg-rose-100', text: 'text-rose-700' },
    cancelled: { bg: 'bg-slate-100', text: 'text-slate-700' },
    delivered: { bg: 'bg-emerald-100', text: 'text-emerald-700' },
    pending: { bg: 'bg-amber-100', text: 'text-amber-700' },
    clicked: { bg: 'bg-teal-100', text: 'text-teal-700' },
  };
  const s = map[status] ?? { bg: 'bg-slate-100', text: 'text-slate-700' };
  return <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${s.bg} ${s.text}`}>{status}</span>;
}

function ComposeTab() {
  const { t: tr } = useTranslation();
  const { profile } = useAuth();
  const [channels, setChannels] = useState<Channel[]>([]);
  const [channelCode, setChannelCode] = useState('system.broadcast');
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [url, setUrl] = useState('/');
  const [recipientType, setRecipientType] = useState<'all' | 'roles' | 'users'>('all');
  const [selectedRoles, setSelectedRoles] = useState<string[]>([]);
  const [userIdsInput, setUserIdsInput] = useState('');
  const [platforms, setPlatforms] = useState<string[]>(['web', 'android', 'ios']);
  const [scheduleNow, setScheduleNow] = useState(true);
  const [scheduledAt, setScheduledAt] = useState(new Date(Date.now() + 60 * 60 * 1000).toISOString().slice(0, 16));
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  useEffect(() => {
    void supabase.from('notification_channels').select('*').order('category').then((r) => {
      setChannels((r.data ?? []) as Channel[]);
    });
  }, []);

  async function handleSend() {
    setSubmitting(true);
    setResult(null);
    try {
      const when = scheduleNow ? new Date().toISOString() : new Date(scheduledAt).toISOString();
      const recipient_user_ids = recipientType === 'users'
        ? userIdsInput.split(/[,\s]+/).map((s) => s.trim()).filter(Boolean)
        : [];
      const recipient_roles = recipientType === 'roles' ? selectedRoles : (recipientType === 'all' ? ROLES : []);

      const { data, error } = await supabase.from('notification_queue').insert({
        channel_code: channelCode,
        title,
        body,
        data: { url },
        recipient_user_ids,
        recipient_roles,
        recipient_company_ids: [],
        target_platforms: platforms,
        scheduled_at: when,
        status: 'queued',
        created_by: profile?.id,
      }).select().maybeSingle();

      if (error) throw error;

      if (scheduleNow && data) {
        const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/dispatch-notification`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${(await supabase.auth.getSession()).data.session?.access_token}`,
            'Content-Type': 'application/json',
            'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
          },
          body: JSON.stringify({ queueId: data.id }),
        });
        const json = await res.json();
        setResult(`Dispatched. Total ${json.total_recipients ?? 0} recipients, ${json.sent ?? 0} sent, ${json.failed ?? 0} failed.`);
      } else {
        setResult('Queued for later delivery.');
      }
      setTitle('');
      setBody('');
    } catch (err) {
      setResult(`Error: ${err instanceof Error ? err.message : 'unknown'}`);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="grid lg:grid-cols-2 gap-6">
      <div className="space-y-4">
        <div>
          <label className="text-sm font-medium text-slate-700 block mb-1">Channel</label>
          <select
            value={channelCode}
            onChange={(e) => setChannelCode(e.target.value)}
            className="input-field"
          >
            {channels.map((c) => (
              <option key={c.code} value={c.code}>{c.label} ({c.code})</option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-sm font-medium text-slate-700 block mb-1">Title</label>
          <input value={title} onChange={(e) => setTitle(e.target.value)} className="input-field" maxLength={200} />
        </div>
        <div>
          <label className="text-sm font-medium text-slate-700 block mb-1">Body</label>
          <textarea value={body} onChange={(e) => setBody(e.target.value)} className="input-field min-h-[96px]" maxLength={1000} />
        </div>
        <div>
          <label className="text-sm font-medium text-slate-700 block mb-1">Deep link URL</label>
          <input value={url} onChange={(e) => setUrl(e.target.value)} className="input-field" placeholder="/company/deliveries" />
        </div>
        <div>
          <label className="text-sm font-medium text-slate-700 block mb-2">Platforms</label>
          <div className="flex gap-2 flex-wrap">
            {['web', 'android', 'ios'].map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => setPlatforms((prev) => prev.includes(p) ? prev.filter((x) => x !== p) : [...prev, p])}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium border ${
                  platforms.includes(p)
                    ? 'bg-teal-600 text-white border-teal-600'
                    : 'bg-white text-slate-700 border-slate-300'
                }`}
              >
                {p}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="space-y-4">
        <div>
          <label className="text-sm font-medium text-slate-700 block mb-1">Recipients</label>
          <div className="flex gap-2 mb-2">
            {(['all', 'roles', 'users'] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setRecipientType(m)}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium ${
                  recipientType === m
                    ? 'bg-teal-600 text-white'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
              >
                {m === 'all' ? 'Broadcast' : m === 'roles' ? 'By Role' : 'Specific Users'}
              </button>
            ))}
          </div>

          {recipientType === 'roles' && (
            <div className="flex gap-2 flex-wrap">
              {ROLES.map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => setSelectedRoles((prev) => prev.includes(r) ? prev.filter((x) => x !== r) : [...prev, r])}
                  className={`px-2.5 py-1 rounded text-xs border ${
                    selectedRoles.includes(r)
                      ? 'bg-teal-600 text-white border-teal-600'
                      : 'bg-white text-slate-700 border-slate-300'
                  }`}
                >
                  {r}
                </button>
              ))}
            </div>
          )}

          {recipientType === 'users' && (
            <textarea
              value={userIdsInput}
              onChange={(e) => setUserIdsInput(e.target.value)}
              placeholder={tr('common.commaOrNewlineSeparatedUserUuids')}
              className="input-field min-h-[80px]"
            />
          )}
        </div>

        <div>
          <label className="text-sm font-medium text-slate-700 block mb-1">Schedule</label>
          <div className="flex gap-3 items-center">
            <label className="flex items-center gap-2 text-sm">
              <input type="radio" checked={scheduleNow} onChange={() => setScheduleNow(true)} />
              Send now
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input type="radio" checked={!scheduleNow} onChange={() => setScheduleNow(false)} />
              Later
            </label>
            {!scheduleNow && (
              <input
                type="datetime-local"
                value={scheduledAt}
                onChange={(e) => setScheduledAt(e.target.value)}
                className="input-field flex-1"
              />
            )}
          </div>
        </div>

        <button
          onClick={handleSend}
          disabled={submitting || !title || !body}
          className="btn-primary w-full justify-center flex items-center gap-2"
        >
          {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
          {scheduleNow ? 'Send Now' : 'Schedule'}
        </button>

        {result && (
          <div className="p-3 rounded-lg text-sm bg-slate-50 border border-slate-200 text-slate-700">
            {result}
          </div>
        )}
      </div>
    </div>
  );
}

function ChannelsTab() {
  const { t: tr } = useTranslation();
  const [channels, setChannels] = useState<Channel[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<string | null>(null);
  const [form, setForm] = useState<Partial<Channel>>({});
  const [creating, setCreating] = useState(false);

  useEffect(() => { void load(); }, []);

  async function load() {
    setLoading(true);
    const { data } = await supabase.from('notification_channels').select('*').order('category');
    setChannels((data ?? []) as Channel[]);
    setLoading(false);
  }

  async function save() {
    if (!form.code || !form.label) return;
    if (creating) {
      await supabase.from('notification_channels').insert({
        code: form.code,
        label: form.label,
        description: form.description ?? '',
        category: form.category ?? 'system',
        default_enabled: form.default_enabled ?? true,
        is_system: false,
        icon: form.icon ?? 'Bell',
      });
    } else if (editing) {
      await supabase.from('notification_channels').update({
        label: form.label,
        description: form.description ?? '',
        category: form.category ?? 'system',
        default_enabled: form.default_enabled ?? true,
        icon: form.icon ?? 'Bell',
      }).eq('code', editing);
    }
    setEditing(null);
    setCreating(false);
    setForm({});
    await load();
  }

  async function remove(code: string) {
    if (!confirm(`Delete channel ${code}?`)) return;
    await supabase.from('notification_channels').delete().eq('code', code);
    await load();
  }

  if (loading) return <TableRowsSkeleton rows={5} cols={4} />;

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h3 className="text-sm font-semibold text-slate-900">{channels.length} channels</h3>
        <button
          onClick={() => { setCreating(true); setEditing(null); setForm({ default_enabled: true, category: 'system', icon: 'Bell' }); }}
          className="btn-primary flex items-center gap-2"
        >
          <Plus className="w-4 h-4" /> New Channel
        </button>
      </div>

      {(creating || editing) && (
        <div className="bg-slate-50 border border-slate-200 rounded-lg p-4 space-y-3">
          {creating && (
            <input
              placeholder={tr('common.channelCodeExamplePaymentSuccess')}
              value={form.code ?? ''}
              onChange={(e) => setForm((f) => ({ ...f, code: e.target.value }))}
              className="input-field"
            />
          )}
          <input placeholder="Label" value={form.label ?? ''} onChange={(e) => setForm((f) => ({ ...f, label: e.target.value }))} className="input-field" />
          <input placeholder="Description" value={form.description ?? ''} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} className="input-field" />
          <div className="grid grid-cols-2 gap-3">
            <input placeholder="Category" value={form.category ?? ''} onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))} className="input-field" />
            <input placeholder="Icon" value={form.icon ?? ''} onChange={(e) => setForm((f) => ({ ...f, icon: e.target.value }))} className="input-field" />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={form.default_enabled ?? true} onChange={(e) => setForm((f) => ({ ...f, default_enabled: e.target.checked }))} />
            Enabled by default
          </label>
          <div className="flex gap-2">
            <button onClick={save} className="btn-primary flex items-center gap-2"><Save className="w-4 h-4" /> Save</button>
            <button onClick={() => { setCreating(false); setEditing(null); setForm({}); }} className="btn-secondary">Cancel</button>
          </div>
        </div>
      )}

      <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 border-b border-slate-200">
            <tr>
              <th className="text-left px-4 py-2 font-medium text-slate-600">Code</th>
              <th className="text-left px-4 py-2 font-medium text-slate-600">Label</th>
              <th className="text-left px-4 py-2 font-medium text-slate-600">Category</th>
              <th className="text-left px-4 py-2 font-medium text-slate-600">Default</th>
              <th className="text-right px-4 py-2 font-medium text-slate-600">Actions</th>
            </tr>
          </thead>
          <tbody>
            {channels.map((c) => (
              <tr key={c.code} className="border-t border-slate-100">
                <td className="px-4 py-2 font-mono text-xs text-slate-700">{c.code}</td>
                <td className="px-4 py-2 text-slate-900">{c.label}</td>
                <td className="px-4 py-2 text-slate-600">{c.category}</td>
                <td className="px-4 py-2">
                  {c.default_enabled ? <CheckCircle2 className="w-4 h-4 text-emerald-600" /> : <XCircle className="w-4 h-4 text-slate-400" />}
                </td>
                <td className="px-4 py-2 text-right">
                  <div className="flex justify-end gap-2">
                    <button onClick={() => { setEditing(c.code); setCreating(false); setForm(c); }} className="text-teal-600 hover:underline text-xs">Edit</button>
                    {!c.is_system && (
                      <button onClick={() => remove(c.code)} className="text-rose-600 hover:underline text-xs">Delete</button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function TemplatesTab() {
  const { t: tr } = useTranslation();
  const [templates, setTemplates] = useState<Template[]>([]);
  const [channels, setChannels] = useState<Channel[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Template | null>(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState<Partial<Template>>({ locale: 'en' });

  useEffect(() => { void load(); }, []);

  async function load() {
    setLoading(true);
    const [t, c] = await Promise.all([
      supabase.from('notification_templates').select('*').order('channel_code'),
      supabase.from('notification_channels').select('*').order('code'),
    ]);
    setTemplates((t.data ?? []) as Template[]);
    setChannels((c.data ?? []) as Channel[]);
    setLoading(false);
  }

  async function save() {
    if (!form.channel_code || !form.title_template || !form.body_template) return;
    const vars = Array.from(new Set((form.title_template + ' ' + form.body_template).match(/\{\{(\w+)\}\}/g)?.map((v) => v.replace(/[{}]/g, '')) ?? []));
    if (creating) {
      await supabase.from('notification_templates').insert({
        channel_code: form.channel_code,
        locale: form.locale ?? 'en',
        title_template: form.title_template,
        body_template: form.body_template,
        variables: vars,
      });
    } else if (editing) {
      await supabase.from('notification_templates').update({
        title_template: form.title_template,
        body_template: form.body_template,
        variables: vars,
      }).eq('id', editing.id);
    }
    setEditing(null);
    setCreating(false);
    setForm({ locale: 'en' });
    await load();
  }

  async function remove(id: string) {
    if (!confirm(tr('common.deleteTemplateQ'))) return;
    await supabase.from('notification_templates').delete().eq('id', id);
    await load();
  }

  if (loading) return <TableRowsSkeleton rows={5} cols={4} />;

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h3 className="text-sm font-semibold text-slate-900">{templates.length} templates</h3>
        <button
          onClick={() => { setCreating(true); setEditing(null); setForm({ locale: 'en' }); }}
          className="btn-primary flex items-center gap-2"
        >
          <Plus className="w-4 h-4" /> New Template
        </button>
      </div>

      {(creating || editing) && (
        <div className="bg-slate-50 border border-slate-200 rounded-lg p-4 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <select
              value={form.channel_code ?? ''}
              onChange={(e) => setForm((f) => ({ ...f, channel_code: e.target.value }))}
              className="input-field"
              disabled={!creating}
            >
              <option value="">{tr('common.selectChannel')}</option>
              {channels.map((c) => <option key={c.code} value={c.code}>{c.label}</option>)}
            </select>
            <select
              value={form.locale ?? 'en'}
              onChange={(e) => setForm((f) => ({ ...f, locale: e.target.value }))}
              className="input-field"
              disabled={!creating}
            >
              {['en', 'sq', 'de', 'fr'].map((l) => <option key={l} value={l}>{l}</option>)}
            </select>
          </div>
          <input placeholder={tr('common.titleTemplateExample')} value={form.title_template ?? ''} onChange={(e) => setForm((f) => ({ ...f, title_template: e.target.value }))} className="input-field" />
          <textarea placeholder="Body template" value={form.body_template ?? ''} onChange={(e) => setForm((f) => ({ ...f, body_template: e.target.value }))} className="input-field min-h-[80px]" />
          <p className="text-xs text-slate-500">Use {`{{variable_name}}`} for placeholders. Variables will be auto-extracted on save.</p>
          <div className="flex gap-2">
            <button onClick={save} className="btn-primary flex items-center gap-2"><Save className="w-4 h-4" /> Save</button>
            <button onClick={() => { setCreating(false); setEditing(null); setForm({ locale: 'en' }); }} className="btn-secondary">Cancel</button>
          </div>
        </div>
      )}

      <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 border-b border-slate-200">
            <tr>
              <th className="text-left px-4 py-2 font-medium text-slate-600">Channel</th>
              <th className="text-left px-4 py-2 font-medium text-slate-600">Locale</th>
              <th className="text-left px-4 py-2 font-medium text-slate-600">Title</th>
              <th className="text-left px-4 py-2 font-medium text-slate-600">Body</th>
              <th className="text-right px-4 py-2 font-medium text-slate-600">Actions</th>
            </tr>
          </thead>
          <tbody>
            {templates.map((t) => (
              <tr key={t.id} className="border-t border-slate-100">
                <td className="px-4 py-2 font-mono text-xs text-slate-700">{t.channel_code}</td>
                <td className="px-4 py-2 uppercase text-slate-600 text-xs">{t.locale}</td>
                <td className="px-4 py-2 text-slate-900">{t.title_template}</td>
                <td className="px-4 py-2 text-slate-600 max-w-md truncate">{t.body_template}</td>
                <td className="px-4 py-2 text-right">
                  <div className="flex justify-end gap-2">
                    <button onClick={() => { setEditing(t); setCreating(false); setForm(t); }} className="text-teal-600 hover:underline text-xs">Edit</button>
                    <button onClick={() => remove(t.id)} className="text-rose-600 hover:underline text-xs">Delete</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function PermissionsTab() {
  const { t: tr } = useTranslation();
  const [channels, setChannels] = useState<Channel[]>([]);
  const [perms, setPerms] = useState<Permission[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => { void load(); }, []);

  async function load() {
    setLoading(true);
    const [c, p] = await Promise.all([
      supabase.from('notification_channels').select('*').order('category'),
      supabase.from('notification_permissions').select('*'),
    ]);
    setChannels((c.data ?? []) as Channel[]);
    setPerms((p.data ?? []) as Permission[]);
    setLoading(false);
  }

  const matrix = useMemo(() => {
    const m = new Map<string, Permission>();
    for (const p of perms) m.set(`${p.role}::${p.channel_code}`, p);
    return m;
  }, [perms]);

  async function toggle(role: string, channel_code: string, field: 'can_send' | 'can_receive') {
    const key = `${role}::${channel_code}`;
    const existing = matrix.get(key);
    setSaving(true);
    if (existing) {
      await supabase.from('notification_permissions').update({ [field]: !existing[field] }).eq('id', existing.id);
    } else {
      await supabase.from('notification_permissions').insert({
        role,
        channel_code,
        can_send: field === 'can_send',
        can_receive: field === 'can_receive',
      });
    }
    await load();
    setSaving(false);
  }

  if (loading) return <TableRowsSkeleton rows={5} cols={4} />;

  return (
    <div className="space-y-3">
      <p className="text-sm text-slate-600">{tr('common.toggleSendReceivePerRoleHint')}</p>
      {saving && <p className="text-xs text-teal-600">Saving...</p>}
      <div className="overflow-x-auto bg-white border border-slate-200 rounded-lg">
        <table className="w-full text-xs">
          <thead className="bg-slate-50 border-b border-slate-200">
            <tr>
              <th className="text-left px-3 py-2 font-medium text-slate-600 sticky left-0 bg-slate-50">Channel</th>
              {ROLES.map((r) => (
                <th key={r} className="px-2 py-2 font-medium text-slate-600 text-center whitespace-nowrap">{r.replace('_', ' ')}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {channels.map((c) => (
              <tr key={c.code} className="border-t border-slate-100">
                <td className="px-3 py-2 font-mono text-slate-700 sticky left-0 bg-white">{c.code}</td>
                {ROLES.map((r) => {
                  const p = matrix.get(`${r}::${c.code}`);
                  return (
                    <td key={r} className="px-2 py-2 text-center">
                      <div className="flex gap-1 justify-center">
                        <button
                          onClick={() => toggle(r, c.code, 'can_send')}
                          className={`w-6 h-6 rounded text-[10px] font-bold ${p?.can_send ? 'bg-teal-600 text-white' : 'bg-slate-100 text-slate-400'}`}
                          title="Can send"
                        >S</button>
                        <button
                          onClick={() => toggle(r, c.code, 'can_receive')}
                          className={`w-6 h-6 rounded text-[10px] font-bold ${p?.can_receive ? 'bg-emerald-600 text-white' : 'bg-slate-100 text-slate-400'}`}
                          title="Can receive"
                        >R</button>
                      </div>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function LogsTab() {
  const { t: tr } = useTranslation();
  const [deliveries, setDeliveries] = useState<Delivery[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<{ status: string; platform: string }>({ status: '', platform: '' });

  useEffect(() => { void load(); }, [filter]);

  async function load() {
    setLoading(true);
    let q = supabase.from('notification_deliveries').select('*').order('attempted_at', { ascending: false }).limit(200);
    if (filter.status) q = q.eq('status', filter.status);
    if (filter.platform) q = q.eq('platform', filter.platform);
    const { data } = await q;
    setDeliveries((data ?? []) as Delivery[]);
    setLoading(false);
  }

  return (
    <div className="space-y-3">
      <div className="flex gap-3 flex-wrap">
        <select value={filter.status} onChange={(e) => setFilter((f) => ({ ...f, status: e.target.value }))} className="input-field max-w-[160px]">
          <option value="">{tr('common.allStatuses')}</option>
          {['sent', 'failed', 'pending', 'clicked', 'delivered'].map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <select value={filter.platform} onChange={(e) => setFilter((f) => ({ ...f, platform: e.target.value }))} className="input-field max-w-[160px]">
          <option value="">{tr('common.allPlatforms')}</option>
          {['web', 'android', 'ios', 'inapp'].map((p) => <option key={p} value={p}>{p}</option>)}
        </select>
        <button onClick={load} className="btn-secondary">Refresh</button>
      </div>

      {loading ? <Loader2 className="w-6 h-6 animate-spin text-teal-600" /> : (
        <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="text-left px-4 py-2 font-medium text-slate-600">When</th>
                <th className="text-left px-4 py-2 font-medium text-slate-600">User</th>
                <th className="text-left px-4 py-2 font-medium text-slate-600">Channel</th>
                <th className="text-left px-4 py-2 font-medium text-slate-600">Platform</th>
                <th className="text-left px-4 py-2 font-medium text-slate-600">Status</th>
                <th className="text-left px-4 py-2 font-medium text-slate-600">Error</th>
              </tr>
            </thead>
            <tbody>
              {deliveries.map((d) => (
                <tr key={d.id} className="border-t border-slate-100">
                  <td className="px-4 py-2 text-slate-600 text-xs">{new Date(d.attempted_at).toLocaleString()}</td>
                  <td className="px-4 py-2 font-mono text-xs text-slate-600">{d.user_id.slice(0, 8)}...</td>
                  <td className="px-4 py-2 text-slate-700">{d.channel_code}</td>
                  <td className="px-4 py-2 text-slate-700">{d.platform}</td>
                  <td className="px-4 py-2"><StatusBadge status={d.status} /></td>
                  <td className="px-4 py-2 text-rose-600 text-xs max-w-xs truncate">{d.error_message ?? '—'}</td>
                </tr>
              ))}
              {deliveries.length === 0 && (
                <tr><td colSpan={6} className="px-4 py-8 text-center text-slate-400">{tr('common.noDeliveryLogs')}</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

interface ConfigStatus {
  web: { configured: boolean; vapid_public_key: boolean; vapid_private_key: boolean; vapid_subject: boolean };
  android: { configured: boolean; fcm_service_account_json: boolean };
  ios: { configured: boolean; apns_key_p8: boolean; apns_key_id: boolean; apns_team_id: boolean; apns_bundle_id: boolean };
  email: { configured: boolean; resend_api_key: boolean };
}

function PlatformTab() {
  const { t: tr } = useTranslation();
  const [settings, setSettings] = useState<PlatformSettings | null>(null);
  const [status, setStatus] = useState<ConfigStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => { void load(); }, []);

  async function load() {
    setLoading(true);
    const { data: { session } } = await supabase.auth.getSession();
    const [settingsRes, statusRes] = await Promise.all([
      supabase.from('push_platform_settings').select('*').eq('id', 1).maybeSingle(),
      fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/notification-config-status`, {
        headers: {
          'Authorization': `Bearer ${session?.access_token || ''}`,
          'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
        },
      }).then((r) => r.ok ? r.json() : null).catch(() => null),
    ]);
    setSettings(settingsRes.data as PlatformSettings);
    setStatus(statusRes as ConfigStatus | null);
    setLoading(false);
  }

  async function save() {
    if (!settings) return;
    setSaving(true);
    await supabase.from('push_platform_settings').update({
      vapid_public_key: settings.vapid_public_key,
      vapid_subject: settings.vapid_subject,
      fcm_project_id: settings.fcm_project_id,
      fcm_configured: settings.fcm_configured,
      apns_bundle_id: settings.apns_bundle_id,
      apns_team_id: settings.apns_team_id,
      apns_key_id: settings.apns_key_id,
      apns_configured: settings.apns_configured,
      updated_at: new Date().toISOString(),
    }).eq('id', 1);
    setSaving(false);
  }

  if (loading || !settings) return <CardListSkeleton count={2} />;

  return (
    <div className="space-y-6 max-w-2xl">
      {status && (
        <div className="bg-gradient-to-br from-slate-50 to-white border border-slate-200 rounded-xl p-4">
          <h3 className="text-sm font-semibold text-slate-900 mb-3">{tr('common.liveSecretStatus')}</h3>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <PlatformStatusCard
              label="Web Push"
              icon={<Globe className="w-4 h-4" />}
              configured={status.web.configured}
              details={[
                { key: 'VAPID_PUBLIC_KEY', ok: status.web.vapid_public_key },
                { key: 'VAPID_PRIVATE_KEY', ok: status.web.vapid_private_key },
                { key: 'VAPID_SUBJECT', ok: status.web.vapid_subject },
              ]}
            />
            <PlatformStatusCard
              label="Android FCM"
              icon={<Smartphone className="w-4 h-4" />}
              configured={status.android.configured}
              details={[
                { key: 'FCM_SERVICE_ACCOUNT_JSON', ok: status.android.fcm_service_account_json },
              ]}
            />
            <PlatformStatusCard
              label="iOS APNs"
              icon={<Smartphone className="w-4 h-4" />}
              configured={status.ios.configured}
              details={[
                { key: 'APNS_KEY_P8', ok: status.ios.apns_key_p8 },
                { key: 'APNS_KEY_ID', ok: status.ios.apns_key_id },
                { key: 'APNS_TEAM_ID', ok: status.ios.apns_team_id },
                { key: 'APNS_BUNDLE_ID', ok: status.ios.apns_bundle_id },
              ]}
            />
            <PlatformStatusCard
              label="Email (Resend)"
              icon={<AlertCircle className="w-4 h-4" />}
              configured={status.email.configured}
              details={[
                { key: 'RESEND_API_KEY', ok: status.email.resend_api_key },
              ]}
            />
          </div>
          <p className="text-xs text-slate-500 mt-3">
            Secrets are read live from Supabase Edge Function environment. Update in the secrets settings panel; changes take effect immediately.
          </p>
        </div>
      )}

      <section className="space-y-3">
        <div className="flex items-center gap-2">
          <Globe className="w-5 h-5 text-teal-600" />
          <h3 className="text-sm font-semibold text-slate-900">Web Push (VAPID)</h3>
        </div>
        <p className="text-xs text-slate-500">Private key must be configured as Supabase Edge Function secret <code className="px-1 bg-slate-100 rounded">VAPID_PRIVATE_KEY</code>.</p>
        <input
          placeholder="VAPID public key"
          value={settings.vapid_public_key}
          onChange={(e) => setSettings({ ...settings, vapid_public_key: e.target.value })}
          className="input-field font-mono text-xs"
        />
        <input
          placeholder="mailto: subject"
          value={settings.vapid_subject}
          onChange={(e) => setSettings({ ...settings, vapid_subject: e.target.value })}
          className="input-field"
        />
      </section>

      <section className="space-y-3">
        <div className="flex items-center gap-2 justify-between">
          <div className="flex items-center gap-2">
            <Smartphone className="w-5 h-5 text-green-600" />
            <h3 className="text-sm font-semibold text-slate-900">Android (FCM)</h3>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={settings.fcm_configured} onChange={(e) => setSettings({ ...settings, fcm_configured: e.target.checked })} />
            Enabled
          </label>
        </div>
        <p className="text-xs text-slate-500">{tr('common.uploadFirebaseServiceAccountJsonAsSecret')} <code className="px-1 bg-slate-100 rounded">FCM_SERVICE_ACCOUNT_JSON</code>.</p>
        <input
          placeholder="Firebase project ID"
          value={settings.fcm_project_id}
          onChange={(e) => setSettings({ ...settings, fcm_project_id: e.target.value })}
          className="input-field"
        />
      </section>

      <section className="space-y-3">
        <div className="flex items-center gap-2 justify-between">
          <div className="flex items-center gap-2">
            <Smartphone className="w-5 h-5 text-slate-700" />
            <h3 className="text-sm font-semibold text-slate-900">iOS (APNs)</h3>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={settings.apns_configured} onChange={(e) => setSettings({ ...settings, apns_configured: e.target.checked })} />
            Enabled
          </label>
        </div>
        <p className="text-xs text-slate-500">Set secrets <code className="px-1 bg-slate-100 rounded">APNS_KEY_P8</code>, <code className="px-1 bg-slate-100 rounded">APNS_KEY_ID</code>, <code className="px-1 bg-slate-100 rounded">APNS_TEAM_ID</code>, <code className="px-1 bg-slate-100 rounded">APNS_BUNDLE_ID</code>.</p>
        <div className="grid grid-cols-2 gap-3">
          <input placeholder="Bundle ID" value={settings.apns_bundle_id} onChange={(e) => setSettings({ ...settings, apns_bundle_id: e.target.value })} className="input-field" />
          <input placeholder="Team ID" value={settings.apns_team_id} onChange={(e) => setSettings({ ...settings, apns_team_id: e.target.value })} className="input-field" />
          <input placeholder="Key ID" value={settings.apns_key_id} onChange={(e) => setSettings({ ...settings, apns_key_id: e.target.value })} className="input-field col-span-2" />
        </div>
      </section>

      <button onClick={save} disabled={saving} className="btn-primary flex items-center gap-2">
        {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
        Save Settings
      </button>
    </div>
  );
}

function DevicesTab() {
  const { t: tr } = useTranslation();
  const [webSubs, setWebSubs] = useState<Array<{ id: string; user_id: string; device_name: string; user_agent: string; is_active: boolean; last_active_at: string }>>([]);
  const [deviceTokens, setDeviceTokens] = useState<Array<{ id: string; user_id: string; platform: string; device_model: string; app_version: string; is_active: boolean; last_active_at: string }>>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => { void load(); }, []);

  async function load() {
    setLoading(true);
    const [w, d] = await Promise.all([
      supabase.from('push_subscriptions').select('id,user_id,device_name,user_agent,is_active,last_active_at').order('last_active_at', { ascending: false }).limit(100),
      supabase.from('device_tokens').select('id,user_id,platform,device_model,app_version,is_active,last_active_at').order('last_active_at', { ascending: false }).limit(100),
    ]);
    setWebSubs((w.data ?? []) as typeof webSubs);
    setDeviceTokens((d.data ?? []) as typeof deviceTokens);
    setLoading(false);
  }

  async function deactivateWeb(id: string) {
    await supabase.from('push_subscriptions').update({ is_active: false }).eq('id', id);
    await load();
  }

  async function deactivateDevice(id: string) {
    await supabase.from('device_tokens').update({ is_active: false }).eq('id', id);
    await load();
  }

  if (loading) return <TableRowsSkeleton rows={5} cols={4} />;

  return (
    <div className="space-y-6">
      <section>
        <h3 className="text-sm font-semibold text-slate-900 mb-3 flex items-center gap-2">
          <Globe className="w-4 h-4 text-teal-600" /> Web Push Subscriptions ({webSubs.length})
        </h3>
        <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="text-left px-4 py-2 font-medium text-slate-600">User</th>
                <th className="text-left px-4 py-2 font-medium text-slate-600">Device</th>
                <th className="text-left px-4 py-2 font-medium text-slate-600">{tr('common.lastActive')}</th>
                <th className="text-left px-4 py-2 font-medium text-slate-600">Status</th>
                <th className="text-right px-4 py-2 font-medium text-slate-600">Actions</th>
              </tr>
            </thead>
            <tbody>
              {webSubs.map((s) => (
                <tr key={s.id} className="border-t border-slate-100">
                  <td className="px-4 py-2 font-mono text-xs text-slate-600">{s.user_id.slice(0, 8)}...</td>
                  <td className="px-4 py-2 text-slate-700 text-xs max-w-sm truncate">{s.device_name || s.user_agent?.slice(0, 60)}</td>
                  <td className="px-4 py-2 text-slate-500 text-xs">{s.last_active_at ? new Date(s.last_active_at).toLocaleString() : '—'}</td>
                  <td className="px-4 py-2">
                    {s.is_active ? <CheckCircle2 className="w-4 h-4 text-emerald-600" /> : <XCircle className="w-4 h-4 text-slate-400" />}
                  </td>
                  <td className="px-4 py-2 text-right">
                    {s.is_active && (
                      <button onClick={() => deactivateWeb(s.id)} className="text-rose-600 hover:underline text-xs flex items-center gap-1 ml-auto">
                        <Trash2 className="w-3 h-3" /> Deactivate
                      </button>
                    )}
                  </td>
                </tr>
              ))}
              {webSubs.length === 0 && <tr><td colSpan={5} className="px-4 py-6 text-center text-slate-400">{tr('common.noWebSubscriptions')}</td></tr>}
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <h3 className="text-sm font-semibold text-slate-900 mb-3 flex items-center gap-2">
          <Smartphone className="w-4 h-4 text-green-600" /> Native Device Tokens ({deviceTokens.length})
        </h3>
        <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="text-left px-4 py-2 font-medium text-slate-600">User</th>
                <th className="text-left px-4 py-2 font-medium text-slate-600">Platform</th>
                <th className="text-left px-4 py-2 font-medium text-slate-600">Device</th>
                <th className="text-left px-4 py-2 font-medium text-slate-600">App Version</th>
                <th className="text-left px-4 py-2 font-medium text-slate-600">Status</th>
                <th className="text-right px-4 py-2 font-medium text-slate-600">Actions</th>
              </tr>
            </thead>
            <tbody>
              {deviceTokens.map((t) => (
                <tr key={t.id} className="border-t border-slate-100">
                  <td className="px-4 py-2 font-mono text-xs text-slate-600">{t.user_id.slice(0, 8)}...</td>
                  <td className="px-4 py-2 text-slate-700 text-xs uppercase">{t.platform}</td>
                  <td className="px-4 py-2 text-slate-700 text-xs">{t.device_model || '—'}</td>
                  <td className="px-4 py-2 text-slate-600 text-xs">{t.app_version || '—'}</td>
                  <td className="px-4 py-2">
                    {t.is_active ? <CheckCircle2 className="w-4 h-4 text-emerald-600" /> : <XCircle className="w-4 h-4 text-slate-400" />}
                  </td>
                  <td className="px-4 py-2 text-right">
                    {t.is_active && (
                      <button onClick={() => deactivateDevice(t.id)} className="text-rose-600 hover:underline text-xs flex items-center gap-1 ml-auto">
                        <Trash2 className="w-3 h-3" /> Deactivate
                      </button>
                    )}
                  </td>
                </tr>
              ))}
              {deviceTokens.length === 0 && <tr><td colSpan={6} className="px-4 py-6 text-center text-slate-400">{tr('common.noNativeDeviceTokens')}</td></tr>}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function PlatformStatusCard({
  label, icon, configured, details,
}: {
  label: string;
  icon: React.ReactNode;
  configured: boolean;
  details: { key: string; ok: boolean }[];
}) {
  return (
    <div className={`rounded-lg border p-3 ${configured ? 'bg-emerald-50 border-emerald-200' : 'bg-amber-50 border-amber-200'}`}>
      <div className="flex items-center justify-between mb-2">
        <div className={`flex items-center gap-1.5 text-xs font-semibold ${configured ? 'text-emerald-800' : 'text-amber-800'}`}>
          {icon}
          {label}
        </div>
        {configured ? (
          <CheckCircle2 className="w-4 h-4 text-emerald-600" />
        ) : (
          <AlertCircle className="w-4 h-4 text-amber-600" />
        )}
      </div>
      <p className={`text-[10px] font-medium uppercase tracking-wide mb-1.5 ${configured ? 'text-emerald-700' : 'text-amber-700'}`}>
        {configured ? 'Ready' : 'Incomplete'}
      </p>
      <ul className="space-y-1">
        {details.map((d) => (
          <li key={d.key} className="flex items-center gap-1.5 text-[11px]">
            {d.ok ? (
              <CheckCircle2 className="w-3 h-3 text-emerald-600 flex-shrink-0" />
            ) : (
              <XCircle className="w-3 h-3 text-slate-400 flex-shrink-0" />
            )}
            <code className="text-slate-700 truncate">{d.key}</code>
          </li>
        ))}
      </ul>
    </div>
  );
}
