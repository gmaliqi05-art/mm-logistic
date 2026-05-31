import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "../../lib/supabase";
import { Mail, Search, Plus, CreditCard as Edit3, Send, Copy, Power, Loader2, Tag } from "lucide-react";
import TestSendDialog from "../../components/superadmin/email/TestSendDialog";
import { useTranslation } from "../../i18n";

interface Template {
  id: string;
  code: string;
  name: string;
  description: string;
  category: "transactional" | "marketing" | "system";
  is_active: boolean;
  is_system: boolean;
  updated_at: string;
}

const CATEGORY_BADGE: Record<string, string> = {
  transactional: "bg-teal-50 text-teal-700 border-teal-200",
  marketing: "bg-amber-50 text-amber-700 border-amber-200",
  system: "bg-slate-100 text-slate-700 border-slate-300",
};

const CATEGORY_LABEL: Record<string, string> = {
  transactional: "Transaksional",
  marketing: "Marketing",
  system: "Sistem",
};

export default function EmailTemplates() {
  const { t: tr } = useTranslation();
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<string>("all");
  const [testCode, setTestCode] = useState<string | null>(null);

  useEffect(() => {
    load();
  }, []);

  async function load() {
    setLoading(true);
    const { data } = await supabase
      .from("email_templates")
      .select("id, code, name, description, category, is_active, is_system, updated_at")
      .order("category")
      .order("name");
    setTemplates((data ?? []) as Template[]);
    setLoading(false);
  }

  async function toggleActive(t: Template) {
    await supabase.from("email_templates").update({ is_active: !t.is_active }).eq("id", t.id);
    load();
  }

  async function duplicate(t: Template) {
    const newCode = window.prompt(`Kodi i ri per kopjen e "${t.code}":`, `${t.code}_copy`);
    if (!newCode) return;
    const { data: orig } = await supabase.from("email_templates").select("*").eq("id", t.id).maybeSingle();
    if (!orig) return;
    const row = { ...orig };
    delete row.id;
    delete row.created_at;
    delete row.updated_at;
    row.code = newCode;
    row.name = `${orig.name} (kopje)`;
    row.is_system = false;
    row.category = "marketing";
    const { error } = await supabase.from("email_templates").insert(row);
    if (error) {
      alert(error.message);
      return;
    }
    load();
  }

  const filtered = templates.filter((t) => {
    if (category !== "all" && t.category !== category) return false;
    if (search) {
      const q = search.toLowerCase();
      if (!t.name.toLowerCase().includes(q) && !t.code.toLowerCase().includes(q)) return false;
    }
    return true;
  });

  return (
    <div className="p-4 lg:p-6">
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h1 className="flex items-center gap-2 text-xl font-bold text-slate-900 sm:text-2xl">
            <Mail className="h-6 w-6 text-teal-600" />{tr('common.templateTEEmailit')}</h1>
          <p className="mt-1 text-sm text-slate-500">{tr('common.editContentLanguagesAndEmailSending')}</p>
        </div>
        <Link
          to="/super-admin/email/templates/new"
          className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-teal-600 px-4 py-2 text-sm font-medium text-white hover:bg-teal-700 sm:w-auto"
        >
          <Plus className="h-4 w-4" />{tr('common.templateIRi')}</Link>
      </div>

      <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center">
        <div className="relative flex-1 min-w-0">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={tr('common.kerkoSipasEmritOseKodit')}
            className="w-full rounded-lg border border-slate-300 bg-white py-2 pl-9 pr-3 text-sm focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-100"
          />
        </div>
        <div className="-mx-1 flex gap-1 overflow-x-auto rounded-lg border border-slate-300 bg-white p-0.5 md:mx-0 md:flex-none">
          {(["all", "transactional", "marketing", "system"] as const).map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setCategory(c)}
              className={`whitespace-nowrap rounded px-3 py-1.5 text-xs font-medium transition-colors ${
                category === c ? "bg-teal-600 text-white" : "text-slate-600 hover:bg-slate-100"
              }`}
            >
              {c === "all" ? "Te gjitha" : CATEGORY_LABEL[c]}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center p-10">
          <Loader2 className="h-6 w-6 animate-spin text-teal-600" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-xl border border-slate-200 bg-white p-10 text-center text-sm text-slate-500 shadow-sm">{tr('common.nukUGjetTemplate')}</div>
      ) : (
        <>
          <div className="grid gap-3 xl:hidden">
            {filtered.map((t) => (
              <div key={t.id} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="font-medium text-slate-900">{t.name}</div>
                    {t.description && <div className="mt-0.5 text-xs text-slate-500">{t.description}</div>}
                  </div>
                  <span className={`inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium ${CATEGORY_BADGE[t.category]}`}>
                    <Tag className="h-3 w-3" />
                    {CATEGORY_LABEL[t.category]}
                  </span>
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <code className="rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-700 break-all">{t.code}</code>
                  <button
                    type="button"
                    onClick={() => toggleActive(t)}
                    className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${
                      t.is_active ? "bg-teal-100 text-teal-700" : "bg-slate-100 text-slate-500"
                    }`}
                  >
                    <Power className="h-3 w-3" />
                    {t.is_active ? "Aktiv" : "Joaktiv"}
                  </button>
                  <span className="text-xs text-slate-400">{new Date(t.updated_at).toLocaleDateString()}</span>
                </div>
                <div className="mt-3 flex flex-wrap justify-end gap-2 border-t border-slate-100 pt-3">
                  <Link
                    to={`/super-admin/email/templates/${t.code}`}
                    className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 hover:text-teal-600"
                  >
                    <Edit3 className="h-3.5 w-3.5" />
                    Edito
                  </Link>
                  <button
                    type="button"
                    onClick={() => setTestCode(t.code)}
                    className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 hover:text-teal-600"
                  >
                    <Send className="h-3.5 w-3.5" />
                    Test
                  </button>
                  <button
                    type="button"
                    onClick={() => duplicate(t)}
                    className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 hover:text-teal-600"
                  >
                    <Copy className="h-3.5 w-3.5" />
                    Dyfisho
                  </button>
                </div>
              </div>
            ))}
          </div>

          <div className="hidden overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm xl:block">
            <table className="w-full">
              <thead className="border-b border-slate-200 bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-3">{tr('common.name')}</th>
                  <th className="px-4 py-3">Kodi</th>
                  <th className="px-4 py-3">{tr('common.kategoria')}</th>
                  <th className="px-4 py-3">{tr('common.status')}</th>
                  <th className="px-4 py-3">{tr('common.updated')}</th>
                  <th className="px-4 py-3 text-right">Veprime</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm">
                {filtered.map((t) => (
                  <tr key={t.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3">
                      <div className="font-medium text-slate-900">{t.name}</div>
                      {t.description && <div className="mt-0.5 max-w-md truncate text-xs text-slate-500">{t.description}</div>}
                    </td>
                    <td className="px-4 py-3">
                      <code className="rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-700">{t.code}</code>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium ${CATEGORY_BADGE[t.category]}`}>
                        <Tag className="h-3 w-3" />
                        {CATEGORY_LABEL[t.category]}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <button
                        type="button"
                        onClick={() => toggleActive(t)}
                        className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${
                          t.is_active ? "bg-teal-100 text-teal-700" : "bg-slate-100 text-slate-500"
                        }`}
                      >
                        <Power className="h-3 w-3" />
                        {t.is_active ? "Aktiv" : "Joaktiv"}
                      </button>
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-500">
                      {new Date(t.updated_at).toLocaleString()}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-1">
                        <Link
                          to={`/super-admin/email/templates/${t.code}`}
                          className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100 hover:text-teal-600"
                          title="Edito"
                        >
                          <Edit3 className="h-4 w-4" />
                        </Link>
                        <button
                          type="button"
                          onClick={() => setTestCode(t.code)}
                          className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100 hover:text-teal-600"
                          title={tr('common.dergoTest')}
                        >
                          <Send className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => duplicate(t)}
                          className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100 hover:text-teal-600"
                          title="Dyfisho"
                        >
                          <Copy className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      <TestSendDialog
        open={!!testCode}
        onClose={() => setTestCode(null)}
        templateCode={testCode ?? ""}
      />
    </div>
  );
}
