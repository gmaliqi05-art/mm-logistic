import { useEffect, useRef, useState } from "react";
import { supabase } from "../../../lib/supabase";
import { Loader2 } from "lucide-react";

interface Props {
  templateCode: string;
  locale: "sq" | "de" | "en";
  sampleData: Record<string, unknown>;
  debounceMs?: number;
}

export default function EmailPreviewPane({ templateCode, locale, sampleData, debounceMs = 500 }: Props) {
  const [html, setHtml] = useState<string>("");
  const [subject, setSubject] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    const h = setTimeout(async () => {
      setLoading(true);
      setError(null);
      try {
        const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/send-email`;
        const { data: session } = await supabase.auth.getSession();
        const token = session.session?.access_token ?? '';
        const resp = await fetch(url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            template_code: templateCode,
            locale,
            data: sampleData,
            preview: true,
          }),
        });
        const j = await resp.json();
        if (!resp.ok) throw new Error(j.error || "Preview failed");
        setHtml(j.html || "");
        setSubject(j.subject || "");
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setLoading(false);
      }
    }, debounceMs);
    return () => clearTimeout(h);
  }, [templateCode, locale, JSON.stringify(sampleData), debounceMs]);

  useEffect(() => {
    if (iframeRef.current && html) {
      const doc = iframeRef.current.contentDocument;
      if (doc) {
        doc.open();
        doc.write(html);
        doc.close();
      }
    }
  }, [html]);

  return (
    <div className="flex h-full flex-col overflow-hidden rounded-lg border border-slate-200 bg-slate-50">
      <div className="flex items-center justify-between gap-3 border-b border-slate-200 bg-white px-4 py-2.5">
        <div className="min-w-0 flex-1">
          <div className="truncate text-xs font-medium text-slate-500">Subject</div>
          <div className="truncate text-sm font-semibold text-slate-900">{subject || "—"}</div>
        </div>
        {loading && <Loader2 className="h-4 w-4 animate-spin text-teal-600" />}
      </div>
      {error ? (
        <div className="flex flex-1 items-center justify-center p-6 text-center text-sm text-red-600">{error}</div>
      ) : (
        <iframe
          ref={iframeRef}
          title="Email preview"
          className="h-full w-full flex-1 border-0 bg-white"
          sandbox="allow-same-origin"
        />
      )}
    </div>
  );
}
