import { useEffect, useState } from 'react';
import { Sparkles, Save, CheckCircle, Loader2, AlertTriangle } from 'lucide-react';
import { supabase } from '../../lib/supabase';

/**
 * Super-admin panel to configure the AI assistant (Anthropic API key, model,
 * on/off). Talks to the `ai-config` edge function, which stores the key
 * service-side (write-only — the key is never returned to the browser). The
 * `ai-agent` function reads it from there.
 */
export default function AiAssistantConfig() {
  const [configured, setConfigured] = useState(false);
  const [model, setModel] = useState('claude-haiku-4-5-20251001');
  const [enabled, setEnabled] = useState(true);
  const [apiKey, setApiKey] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { void load(); }, []);

  async function load() {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('ai-config', { method: 'GET' });
      if (!error && data) {
        setConfigured(!!data.configured);
        if (data.model) setModel(data.model);
        setEnabled(data.enabled !== false);
      }
    } finally {
      setLoading(false);
    }
  }

  async function save() {
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      const body: Record<string, unknown> = { model, enabled };
      if (apiKey.trim()) body.api_key = apiKey.trim();
      const { data, error } = await supabase.functions.invoke('ai-config', { body });
      if (error || !data) {
        setError('Ruajtja dështoi. Provoni përsëri.');
      } else {
        setConfigured(!!data.configured);
        setApiKey('');
        setSaved(true);
        setTimeout(() => setSaved(false), 3000);
      }
    } catch {
      setError('Ruajtja dështoi. Provoni përsëri.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-5 space-y-4">
      <div className="flex items-center gap-2">
        <div className="w-9 h-9 rounded-lg bg-teal-100 flex items-center justify-center"><Sparkles className="w-5 h-5 text-teal-700" /></div>
        <div>
          <h3 className="text-base font-semibold text-slate-900">Asistenti AI (Anthropic)</h3>
          <p className="text-xs text-slate-500">Menaxheri bisedues për kompanitë dhe depot.</p>
        </div>
        <span className={`ml-auto text-xs font-medium px-2.5 py-1 rounded-full ${configured ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
          {loading ? '…' : configured ? 'I konfiguruar' : 'Pa çelës'}
        </span>
      </div>

      <label className="block text-sm">
        <span className="text-slate-600">Anthropic API Key</span>
        <input
          type="password"
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
          placeholder={configured ? '•••••••• (lëre bosh për ta ruajtur atë ekzistues)' : 'sk-ant-...'}
          className="mt-1 w-full border border-slate-200 rounded-lg px-3 py-2 font-mono text-xs"
        />
        <span className="text-[11px] text-slate-400">Çelësi ruhet i sigurt në server dhe nuk kthehet kurrë te shfletuesi. Merre nga console.anthropic.com → API Keys.</span>
      </label>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <label className="block text-sm">
          <span className="text-slate-600">Modeli</span>
          <input value={model} onChange={(e) => setModel(e.target.value)} className="mt-1 w-full border border-slate-200 rounded-lg px-3 py-2 font-mono text-xs" />
        </label>
        <label className="flex items-center gap-2 text-sm mt-6 sm:mt-7">
          <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} className="w-4 h-4 accent-teal-600" />
          <span className="text-slate-700">Aktiv (i ndezur)</span>
        </label>
      </div>

      <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-2.5 flex gap-2">
        <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
        <span>Për tani aktiv për përdoruesit demo (testim). Në lansim do të jetë veçori me pagesë ekstra për përdoruesit e abonuar.</span>
      </div>

      {error && <div className="text-sm text-rose-700 bg-rose-50 border border-rose-200 rounded-lg p-2">{error}</div>}

      <div className="flex items-center gap-3">
        <button onClick={() => void save()} disabled={saving} className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-teal-600 text-white text-sm font-medium hover:bg-teal-700 disabled:opacity-50">
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} Ruaj
        </button>
        {saved && <span className="inline-flex items-center gap-1 text-sm text-emerald-600"><CheckCircle className="w-4 h-4" /> U ruajt</span>}
      </div>
    </div>
  );
}
