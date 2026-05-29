import { useEffect, useState } from 'react';
import { Key, Webhook as WebhookIcon, Plus, Loader2, Copy, Trash2, AlertTriangle, X, CheckCircle2, ShieldCheck } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { useTranslation } from '../../i18n';

type Tab = 'keys' | 'webhooks' | 'docs';

interface ApiKey {
  id: string;
  name: string;
  key_prefix: string;
  scopes: string[];
  created_at: string;
  last_used_at: string | null;
  revoked_at: string | null;
}

interface Webhook {
  id: string;
  url: string;
  events: string[];
  is_active: boolean;
  failure_count: number;
  last_delivery_at: string | null;
  created_at: string;
}

const EVENT_OPTIONS = [
  'invoice.created',
  'invoice.paid',
  'delivery.completed',
  'stock.low',
  'partner.added',
];

export default function ApiWebhooks() {
  const { profile } = useAuth();
  const { t } = useTranslation();
  const [tab, setTab] = useState<Tab>('keys');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [hooks, setHooks] = useState<Webhook[]>([]);
  const [newKeyName, setNewKeyName] = useState('');
  const [revealKey, setRevealKey] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const [hookUrl, setHookUrl] = useState('');
  const [hookEvents, setHookEvents] = useState<string[]>(['invoice.created']);
  const [hookSecret, setHookSecret] = useState('');

  useEffect(() => {
    if (profile?.company_id) fetchAll();
  }, [profile?.company_id]);

  async function fetchAll() {
    try {
      setLoading(true);
      setError(null);
      const [kRes, wRes] = await Promise.all([
        supabase
          .from('company_api_keys')
          .select('*')
          .eq('company_id', profile!.company_id!)
          .order('created_at', { ascending: false }),
        supabase
          .from('webhooks')
          .select('*')
          .eq('company_id', profile!.company_id!)
          .order('created_at', { ascending: false }),
      ]);
      if (kRes.error) throw kRes.error;
      if (wRes.error) throw wRes.error;
      setKeys(kRes.data ?? []);
      setHooks(wRes.data ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gabim');
    } finally {
      setLoading(false);
    }
  }

  async function createKey() {
    if (!newKeyName.trim()) return;
    try {
      setCreating(true);
      setError(null);
      const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/create-api-key`;
      const { data: session } = await supabase.auth.getSession();
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${session.session?.access_token}`,
          apikey: import.meta.env.VITE_SUPABASE_ANON_KEY as string,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ name: newKeyName.trim(), scopes: ['read'] }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error || 'Failed');
      setRevealKey(json.api_key);
      setNewKeyName('');
      await fetchAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gabim');
    } finally {
      setCreating(false);
    }
  }

  async function revokeKey(id: string) {
    if (!confirm(t('common.revokeApiKeyConfirm'))) return;
    await supabase.from('company_api_keys').update({ revoked_at: new Date().toISOString() }).eq('id', id);
    await fetchAll();
  }

  async function createWebhook() {
    if (!hookUrl.trim() || hookEvents.length === 0) return;
    const secret = hookSecret.trim() || ('whs_' + Math.random().toString(36).slice(2, 14));
    const { error: err } = await supabase.from('webhooks').insert({
      company_id: profile!.company_id!,
      url: hookUrl.trim(),
      events: hookEvents,
      secret,
      is_active: true,
    });
    if (err) {
      setError(err.message);
      return;
    }
    setHookUrl('');
    setHookSecret('');
    setHookEvents(['invoice.created']);
    await fetchAll();
  }

  async function toggleWebhook(id: string, active: boolean) {
    await supabase.from('webhooks').update({ is_active: !active }).eq('id', id);
    await fetchAll();
  }

  async function deleteWebhook(id: string) {
    if (!confirm(t('common.deleteWebhookConfirm'))) return;
    await supabase.from('webhooks').delete().eq('id', id);
    await fetchAll();
  }

  const apiBase = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/api-v1`;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
          <Key className="w-6 h-6 text-emerald-600" />
          API & Webhooks
        </h1>
        <p className="text-gray-500 text-sm mt-1">Menaxho celesat e API-t publike dhe webhooks per integrime me sisteme te jashtme.</p>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-center gap-3">
          <AlertTriangle className="w-5 h-5 text-red-500" />
          <p className="text-red-700 text-sm flex-1">{error}</p>
          <button onClick={() => setError(null)}><X className="w-4 h-4" /></button>
        </div>
      )}

      <div className="flex gap-2 border-b border-gray-200">
        {(['keys', 'webhooks', 'docs'] as Tab[]).map((k) => (
          <button
            key={k}
            onClick={() => setTab(k)}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px ${
              tab === k ? 'text-emerald-700 border-emerald-600' : 'text-gray-500 border-transparent hover:text-gray-700'
            }`}
          >
            {k === 'keys' ? 'Celesat API' : k === 'webhooks' ? 'Webhooks' : 'Dokumentimi'}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-8 h-8 text-emerald-600 animate-spin" />
        </div>
      ) : tab === 'keys' ? (
        <div className="space-y-6">
          <div className="bg-white border border-gray-100 rounded-xl p-5">
            <h2 className="font-semibold text-gray-900 mb-3">{t('common.createNewKey')}</h2>
            <div className="flex gap-2">
              <input
                value={newKeyName}
                onChange={(e) => setNewKeyName(e.target.value)}
                placeholder="p.sh. Integrim Zapier"
                className="flex-1 px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
              <button
                onClick={createKey}
                disabled={creating || !newKeyName.trim()}
                className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:opacity-50 text-sm font-medium"
              >
                {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                Krijo celes
              </button>
            </div>
            {revealKey && (
              <div className="mt-4 bg-amber-50 border border-amber-200 rounded-lg p-4">
                <div className="text-sm font-semibold text-amber-900 flex items-center gap-2 mb-2">
                  <ShieldCheck className="w-4 h-4" />
                  Ruaj kete celes tani. Nuk do te tregohet me asnjehere.
                </div>
                <div className="flex items-center gap-2">
                  <code className="flex-1 bg-white border border-amber-300 rounded px-3 py-2 text-xs font-mono break-all">{revealKey}</code>
                  <button
                    onClick={() => { navigator.clipboard.writeText(revealKey); }}
                    className="p-2 bg-white border border-amber-300 rounded hover:bg-amber-100"
                  >
                    <Copy className="w-4 h-4" />
                  </button>
                  <button onClick={() => setRevealKey(null)} className="p-2 text-amber-700"><X className="w-4 h-4" /></button>
                </div>
              </div>
            )}
          </div>

          <div className="bg-white border border-gray-100 rounded-xl overflow-hidden">
            {keys.length === 0 ? (
              <div className="p-10 text-center text-gray-500 text-sm">Asnje celes i krijuar.</div>
            ) : (
              <table className="w-full">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Emri</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Prefix</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Perdor fund.</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Statusi</th>
                    <th className="px-4 py-3"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {keys.map((k) => (
                    <tr key={k.id}>
                      <td className="px-4 py-3 text-sm font-medium text-gray-900">{k.name || '(pa emer)'}</td>
                      <td className="px-4 py-3 text-xs font-mono text-gray-600">{k.key_prefix}…</td>
                      <td className="px-4 py-3 text-xs text-gray-500">{k.last_used_at ? new Date(k.last_used_at).toLocaleString('de-DE') : 'asnjehere'}</td>
                      <td className="px-4 py-3">
                        {k.revoked_at ? (
                          <span className="text-xs px-2 py-0.5 rounded-full bg-red-100 text-red-700">revokuar</span>
                        ) : (
                          <span className="text-xs px-2 py-0.5 rounded-full bg-green-100 text-green-700">aktiv</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {!k.revoked_at && (
                          <button onClick={() => revokeKey(k.id)} className="text-red-600 hover:text-red-700 text-xs inline-flex items-center gap-1">
                            <Trash2 className="w-3.5 h-3.5" /> Revoke
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      ) : tab === 'webhooks' ? (
        <div className="space-y-6">
          <div className="bg-white border border-gray-100 rounded-xl p-5">
            <h2 className="font-semibold text-gray-900 mb-3 flex items-center gap-2">
              <WebhookIcon className="w-4 h-4 text-emerald-600" />
              Shto webhook
            </h2>
            <div className="space-y-3">
              <input
                value={hookUrl}
                onChange={(e) => setHookUrl(e.target.value)}
                placeholder="https://yourapp.com/webhooks/mm"
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
              <input
                value={hookSecret}
                onChange={(e) => setHookSecret(e.target.value)}
                placeholder={t('common.webhookSecretPlaceholder')}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm font-mono focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
              <div className="flex flex-wrap gap-2">
                {EVENT_OPTIONS.map((ev) => {
                  const active = hookEvents.includes(ev);
                  return (
                    <button
                      key={ev}
                      onClick={() => setHookEvents((prev) => active ? prev.filter((e) => e !== ev) : [...prev, ev])}
                      className={`px-3 py-1 text-xs rounded-full border transition-colors ${
                        active ? 'bg-emerald-600 text-white border-emerald-600' : 'bg-white text-gray-700 border-gray-200 hover:bg-gray-50'
                      }`}
                    >
                      {ev}
                    </button>
                  );
                })}
              </div>
              <button
                onClick={createWebhook}
                disabled={!hookUrl.trim() || hookEvents.length === 0}
                className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:opacity-50 text-sm font-medium"
              >
                <Plus className="w-4 h-4" />
                Ruaj webhook
              </button>
            </div>
          </div>

          <div className="bg-white border border-gray-100 rounded-xl overflow-hidden">
            {hooks.length === 0 ? (
              <div className="p-10 text-center text-gray-500 text-sm">Asnje webhook i konfiguruar.</div>
            ) : (
              <table className="w-full">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">URL</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Events</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Statusi</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Dest. fund.</th>
                    <th className="px-4 py-3"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {hooks.map((w) => (
                    <tr key={w.id}>
                      <td className="px-4 py-3 text-xs font-mono text-gray-700 max-w-xs truncate">{w.url}</td>
                      <td className="px-4 py-3 text-xs text-gray-600">{w.events.join(', ')}</td>
                      <td className="px-4 py-3">
                        <button
                          onClick={() => toggleWebhook(w.id, w.is_active)}
                          className={`text-xs px-2 py-0.5 rounded-full ${
                            w.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-200 text-gray-600'
                          }`}
                        >
                          {w.is_active ? 'aktiv' : 'fjetur'}
                        </button>
                        {w.failure_count > 0 && (
                          <span className="ml-2 text-xs text-red-600">#{w.failure_count} deshtime</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-500">{w.last_delivery_at ? new Date(w.last_delivery_at).toLocaleString('de-DE') : '-'}</td>
                      <td className="px-4 py-3 text-right">
                        <button onClick={() => deleteWebhook(w.id)} className="text-red-600 text-xs inline-flex items-center gap-1">
                          <Trash2 className="w-3.5 h-3.5" /> Fshi
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      ) : (
        <div className="bg-white border border-gray-100 rounded-xl p-6 space-y-4 text-sm text-gray-700">
          <h2 className="font-semibold text-gray-900 text-lg flex items-center gap-2">
            <CheckCircle2 className="w-5 h-5 text-emerald-600" />
            Perdorim i shpejte
          </h2>
          <p>Autentifiko me header <code className="bg-gray-100 px-1.5 py-0.5 rounded">Authorization: Bearer sk_live_…</code></p>
          <div>
            <div className="text-xs font-semibold text-gray-500 uppercase mb-2">Endpoints</div>
            <ul className="list-disc pl-5 space-y-1">
              <li><code>GET {apiBase}/invoices</code></li>
              <li><code>GET {apiBase}/delivery-notes</code></li>
              <li><code>GET {apiBase}/stock</code></li>
              <li><code>GET {apiBase}/partners</code></li>
              <li><code>GET {apiBase}/transactions</code></li>
              <li><code>GET {apiBase}/openapi.json</code></li>
            </ul>
          </div>
          <div>
            <div className="text-xs font-semibold text-gray-500 uppercase mb-2">Webhook payload</div>
            <pre className="bg-gray-50 border border-gray-200 rounded p-3 text-xs font-mono overflow-x-auto">{`{
  "event": "invoice.paid",
  "data": { "id": "...", "invoice_number": "...", "total": 123.45 },
  "timestamp": "2026-05-04T12:00:00Z"
}`}</pre>
            <p className="mt-2 text-xs text-gray-500">Secili request mban header <code>X-Webhook-Signature: sha256=&lt;hmac&gt;</code>, ku HMAC llogaritet me secret-in tend dhe body raw.</p>
          </div>
        </div>
      )}
    </div>
  );
}
