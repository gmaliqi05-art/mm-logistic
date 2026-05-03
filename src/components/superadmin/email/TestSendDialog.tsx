import { useEffect, useState } from "react";
import { X, Send, Loader2, CheckCircle2, AlertCircle } from "lucide-react";
import { supabase } from "../../../lib/supabase";
import { useAuth } from "../../../contexts/AuthContext";

interface Props {
  open: boolean;
  onClose: () => void;
  templateCode: string;
  defaultLocale?: "sq" | "de" | "en";
  defaultData?: Record<string, unknown>;
}

export default function TestSendDialog({ open, onClose, templateCode, defaultLocale = "sq", defaultData = {} }: Props) {
  const { profile } = useAuth();
  const [email, setEmail] = useState("");
  const [locale, setLocale] = useState<"sq" | "de" | "en">(defaultLocale);
  const [dataJson, setDataJson] = useState("{}");
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);

  useEffect(() => {
    if (open) {
      setEmail(profile?.email || "");
      setLocale(defaultLocale);
      setDataJson(JSON.stringify(defaultData, null, 2));
      setResult(null);
    }
  }, [open, profile?.email, defaultLocale, JSON.stringify(defaultData)]);

  if (!open) return null;

  async function send() {
    setSending(true);
    setResult(null);
    try {
      let data: Record<string, unknown> = {};
      try {
        data = JSON.parse(dataJson || "{}");
      } catch {
        setResult({ ok: false, message: "JSON i pavlefshem." });
        setSending(false);
        return;
      }
      const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/send-email`;
      const { data: session } = await supabase.auth.getSession();
      const token = session.session?.access_token ?? import.meta.env.VITE_SUPABASE_ANON_KEY;
      const resp = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          template_code: templateCode,
          to: email,
          locale,
          data,
          test: true,
        }),
      });
      const j = await resp.json();
      if (resp.ok && j.ok) {
        setResult({ ok: true, message: `U dergua tek ${email}` });
      } else {
        setResult({ ok: false, message: j.error || "Dergimi deshtoi" });
      }
    } catch (e) {
      setResult({ ok: false, message: e instanceof Error ? e.message : String(e) });
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-sm" onClick={onClose}>
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl bg-white shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
          <div>
            <h3 className="text-base font-semibold text-slate-900">Dergo email test</h3>
            <p className="text-xs text-slate-500">Template: <code className="text-teal-700">{templateCode}</code></p>
          </div>
          <button type="button" onClick={onClose} className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="space-y-4 p-5">
          <div>
            <label className="mb-1.5 block text-xs font-medium text-slate-700">Adresa e marresit</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-100"
              placeholder="email@example.com"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium text-slate-700">Gjuha</label>
            <div className="flex gap-2">
              {(["sq", "de", "en"] as const).map((l) => (
                <button
                  key={l}
                  type="button"
                  onClick={() => setLocale(l)}
                  className={`flex-1 rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors ${
                    locale === l ? "border-teal-500 bg-teal-50 text-teal-700" : "border-slate-300 bg-white text-slate-600 hover:bg-slate-50"
                  }`}
                >
                  {l.toUpperCase()}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium text-slate-700">Te dhena shembull (JSON)</label>
            <textarea
              value={dataJson}
              onChange={(e) => setDataJson(e.target.value)}
              rows={6}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-xs focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-100"
            />
          </div>
          {result && (
            <div className={`flex items-start gap-2 rounded-lg p-3 text-sm ${result.ok ? "bg-teal-50 text-teal-800" : "bg-red-50 text-red-800"}`}>
              {result.ok ? <CheckCircle2 className="mt-0.5 h-4 w-4" /> : <AlertCircle className="mt-0.5 h-4 w-4" />}
              <span>{result.message}</span>
            </div>
          )}
        </div>
        <div className="flex justify-end gap-2 border-t border-slate-200 bg-slate-50 px-5 py-3">
          <button type="button" onClick={onClose} className="rounded-lg px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100">
            Mbyll
          </button>
          <button
            type="button"
            onClick={send}
            disabled={sending || !email}
            className="inline-flex items-center gap-2 rounded-lg bg-teal-600 px-4 py-2 text-sm font-medium text-white hover:bg-teal-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            Dergo
          </button>
        </div>
      </div>
    </div>
  );
}
