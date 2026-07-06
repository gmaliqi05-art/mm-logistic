import { createClient } from '@supabase/supabase-js';
import { Capacitor } from '@capacitor/core';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const supabaseMisconfigured = !supabaseUrl || !supabaseAnonKey;

if (supabaseMisconfigured) {
  const root = document.getElementById('root');
  if (root) {
    // Detect the most likely host so the instructions point to the right
    // place. Vercel deployments expose the host name via VITE_VERCEL or
    // simply by URL match; falling back to a generic message for local.
    const host = typeof window !== 'undefined' ? window.location.host : '';
    const isVercel = host.endsWith('.vercel.app') || host.endsWith('.vercel.dev');
    const isProdLike = !host.startsWith('localhost') && !host.startsWith('127.');

    const containerStyle = 'display:flex;align-items:flex-start;justify-content:center;min-height:100vh;font-family:system-ui;padding:2rem;background:#f8fafc';
    const cardStyle = 'max-width:560px;width:100%;background:#fff;border:1px solid #e2e8f0;border-radius:12px;padding:1.5rem 1.75rem;box-shadow:0 1px 3px rgba(0,0,0,.05)';
    const h1Style = 'font-size:1.25rem;font-weight:700;margin:0 0 .25rem;color:#0f172a';
    const subStyle = 'color:#475569;margin:0 0 1rem;font-size:.95rem';
    const olStyle = 'color:#334155;line-height:1.65;padding-left:1.25rem;margin:0 0 1rem';
    const codeStyle = 'background:#f1f5f9;padding:.1rem .35rem;border-radius:4px;font-size:.85em';
    const noteStyle = 'color:#64748b;font-size:.825rem;border-top:1px solid #e2e8f0;padding-top:.75rem;margin-top:1rem';

    let steps = '';
    if (isVercel) {
      steps =
        `<p style="${subStyle}">This Vercel deployment is missing the Supabase environment variables.</p>` +
        `<ol style="${olStyle}">` +
        `<li>Open the project in <a href="https://vercel.com/dashboard" target="_blank" rel="noreferrer" style="color:#0d9488">Vercel Dashboard</a> → <strong>Settings → Environment Variables</strong>.</li>` +
        `<li>Add <code style="${codeStyle}">VITE_SUPABASE_URL</code> and <code style="${codeStyle}">VITE_SUPABASE_ANON_KEY</code> for Production + Preview + Development.</li>` +
        `<li>Values come from <a href="https://supabase.com/dashboard" target="_blank" rel="noreferrer" style="color:#0d9488">Supabase Dashboard</a> → <strong>Project Settings → API</strong> (URL + anon public key).</li>` +
        `<li><strong>Redeploy</strong>: Deployments tab → latest → <code style="${codeStyle}">…</code> menu → <strong>Redeploy</strong>. Env vars only apply to new builds.</li>` +
        `</ol>`;
    } else if (isProdLike) {
      steps =
        `<p style="${subStyle}">The hosting environment is missing the Supabase configuration.</p>` +
        `<ol style="${olStyle}">` +
        `<li>Set <code style="${codeStyle}">VITE_SUPABASE_URL</code> and <code style="${codeStyle}">VITE_SUPABASE_ANON_KEY</code> on your host (Vercel / Netlify / Cloudflare Pages).</li>` +
        `<li>Values come from <a href="https://supabase.com/dashboard" target="_blank" rel="noreferrer" style="color:#0d9488">Supabase Dashboard</a> → <strong>Project Settings → API</strong>.</li>` +
        `<li>Trigger a new build so the variables are baked into the bundle.</li>` +
        `</ol>`;
    } else {
      steps =
        `<p style="${subStyle}">Local development needs a <code style="${codeStyle}">.env</code> file at the repo root.</p>` +
        `<ol style="${olStyle}">` +
        `<li>Copy <code style="${codeStyle}">.env.example</code> to <code style="${codeStyle}">.env</code>.</li>` +
        `<li>Fill in <code style="${codeStyle}">VITE_SUPABASE_URL</code> and <code style="${codeStyle}">VITE_SUPABASE_ANON_KEY</code> from <a href="https://supabase.com/dashboard" target="_blank" rel="noreferrer" style="color:#0d9488">Supabase Dashboard</a> → <strong>Project Settings → API</strong>.</li>` +
        `<li>Restart the dev server (<code style="${codeStyle}">npm run dev</code>).</li>` +
        `</ol>`;
    }

    root.innerHTML =
      `<div style="${containerStyle}"><div style="${cardStyle}">` +
      `<h1 style="${h1Style}">Configuration Error</h1>` +
      steps +
      `<p style="${noteStyle}">Host: <code style="${codeStyle}">${host || 'unknown'}</code></p>` +
      `</div></div>`;
  }
}

export const supabase = createClient(
  supabaseUrl || 'https://placeholder.supabase.co',
  supabaseAnonKey || 'placeholder',
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: !Capacitor.isNativePlatform(),
      storage: window.localStorage,
      storageKey: 'mm-logistic-auth',
    },
  },
);

/** Base URL for edge functions, e.g. `${base}/tts`. Empty if misconfigured. */
export const supabaseFunctionsBase = supabaseUrl ? `${supabaseUrl.replace(/\/$/, '')}/functions/v1` : '';

export async function edgeFnHeaders(): Promise<Record<string, string>> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token ?? supabaseAnonKey ?? '';
  return {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
    apikey: supabaseAnonKey ?? '',
  };
}
