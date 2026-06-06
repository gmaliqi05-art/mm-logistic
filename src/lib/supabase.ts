import { createClient } from '@supabase/supabase-js';
import { Capacitor } from '@capacitor/core';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const supabaseMisconfigured = !supabaseUrl || !supabaseAnonKey;

if (supabaseMisconfigured) {
  const root = document.getElementById('root');
  if (root) {
    root.innerHTML =
      '<div style="display:flex;align-items:center;justify-content:center;min-height:100vh;font-family:system-ui;padding:2rem;text-align:center">' +
      '<div><h1 style="font-size:1.25rem;font-weight:600;margin-bottom:.5rem">Configuration Error</h1>' +
      '<p style="color:#6b7280">Supabase environment variables are missing. ' +
      'Ensure <code>.env</code> contains <code>VITE_SUPABASE_URL</code> and <code>VITE_SUPABASE_ANON_KEY</code> before running <code>npm run build</code>.</p></div></div>';
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

export async function edgeFnHeaders(): Promise<Record<string, string>> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token ?? supabaseAnonKey ?? '';
  return {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
    apikey: supabaseAnonKey ?? '',
  };
}
