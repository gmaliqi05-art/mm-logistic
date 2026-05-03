import { useEffect, useState } from "react";
import { supabase } from "../../../lib/supabase";
import { Users, Loader2 } from "lucide-react";

export interface AudienceFilter {
  roles?: string[];
  business_types?: string[];
  locales?: string[];
  company_ids?: string[];
  subscription_statuses?: string[];
  active_only?: boolean;
  marketing_opt_in_only?: boolean;
}

interface Props {
  value: AudienceFilter;
  onChange: (f: AudienceFilter) => void;
}

const ROLES = [
  { id: "company_admin", label: "Admin kompanie" },
  { id: "logistics_admin", label: "Admin logjistike" },
  { id: "accountant", label: "Kontabilist" },
  { id: "depot_worker", label: "Punetor depoje" },
  { id: "driver", label: "Shofer" },
  { id: "super_admin", label: "Super admin" },
];

const BUSINESS_TYPES = [
  { id: "logistics", label: "Logjistike" },
  { id: "accounting", label: "Kontabilitet" },
];

const LOCALES = [
  { id: "sq", label: "Shqip" },
  { id: "de", label: "Gjermanisht" },
  { id: "en", label: "Anglisht" },
];

const SUBSCRIPTION_STATUSES = [
  { id: "trial", label: "Trial" },
  { id: "active", label: "Aktiv" },
  { id: "cancelled", label: "Anulluar" },
  { id: "expired", label: "Skaduar" },
];

function CheckGroup({
  options, selected, onChange,
}: {
  options: { id: string; label: string }[];
  selected: string[];
  onChange: (v: string[]) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((o) => {
        const active = selected.includes(o.id);
        return (
          <button
            key={o.id}
            type="button"
            onClick={() => {
              if (active) onChange(selected.filter((s) => s !== o.id));
              else onChange([...selected, o.id]);
            }}
            className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
              active ? "border-teal-500 bg-teal-50 text-teal-700" : "border-slate-300 bg-white text-slate-600 hover:bg-slate-50"
            }`}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

export default function AudienceSelector({ value, onChange }: Props) {
  const [companies, setCompanies] = useState<{ id: string; name: string }[]>([]);
  const [search, setSearch] = useState("");
  const [count, setCount] = useState<number | null>(null);
  const [sample, setSample] = useState<{ id: string; email: string; locale: string }[]>([]);
  const [loadingCount, setLoadingCount] = useState(false);

  useEffect(() => {
    supabase.from("companies").select("id, name").order("name").then(({ data }) => {
      setCompanies(data ?? []);
    });
  }, []);

  async function calculateAudience() {
    setLoadingCount(true);
    try {
      const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/send-email-campaign`;
      const { data: session } = await supabase.auth.getSession();
      const token = session.session?.access_token ?? import.meta.env.VITE_SUPABASE_ANON_KEY;

      const { data: inserted } = await supabase
        .from("email_campaigns")
        .insert({ name: `__audience_probe_${Date.now()}`, status: "draft", audience_filter: value })
        .select("id")
        .maybeSingle();
      if (!inserted) return;

      const resp = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ campaign_id: inserted.id, audience_only: true }),
      });
      const j = await resp.json();
      setCount(j.count ?? 0);
      setSample(j.sample ?? []);
      await supabase.from("email_campaigns").delete().eq("id", inserted.id);
    } finally {
      setLoadingCount(false);
    }
  }

  const filteredCompanies = companies.filter((c) => c.name.toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="space-y-5">
      <div>
        <label className="mb-1.5 block text-xs font-medium text-slate-700">Rolet</label>
        <CheckGroup options={ROLES} selected={value.roles ?? []} onChange={(v) => onChange({ ...value, roles: v })} />
      </div>
      <div>
        <label className="mb-1.5 block text-xs font-medium text-slate-700">Lloji i biznesit</label>
        <CheckGroup options={BUSINESS_TYPES} selected={value.business_types ?? []} onChange={(v) => onChange({ ...value, business_types: v })} />
      </div>
      <div>
        <label className="mb-1.5 block text-xs font-medium text-slate-700">Gjuha e perdoruesit</label>
        <CheckGroup options={LOCALES} selected={value.locales ?? []} onChange={(v) => onChange({ ...value, locales: v })} />
      </div>
      <div>
        <label className="mb-1.5 block text-xs font-medium text-slate-700">Statusi i abonimit</label>
        <CheckGroup options={SUBSCRIPTION_STATUSES} selected={value.subscription_statuses ?? []} onChange={(v) => onChange({ ...value, subscription_statuses: v })} />
      </div>
      <div>
        <label className="mb-1.5 block text-xs font-medium text-slate-700">Kompani specifike (opsional)</label>
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Kerko kompani..."
          className="mb-2 w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-100"
        />
        <div className="max-h-40 overflow-y-auto rounded-lg border border-slate-200 bg-white">
          {filteredCompanies.length === 0 ? (
            <div className="p-3 text-xs text-slate-500">Pa kompani.</div>
          ) : (
            filteredCompanies.map((c) => {
              const selected = (value.company_ids ?? []).includes(c.id);
              return (
                <label key={c.id} className="flex cursor-pointer items-center gap-2 border-b border-slate-100 px-3 py-1.5 text-sm last:border-0 hover:bg-slate-50">
                  <input
                    type="checkbox"
                    checked={selected}
                    onChange={() => {
                      const list = value.company_ids ?? [];
                      onChange({ ...value, company_ids: selected ? list.filter((x) => x !== c.id) : [...list, c.id] });
                    }}
                    className="rounded border-slate-300 text-teal-600 focus:ring-teal-500"
                  />
                  <span className="text-slate-700">{c.name}</span>
                </label>
              );
            })
          )}
        </div>
        {value.company_ids && value.company_ids.length > 0 && (
          <div className="mt-1 text-xs text-slate-500">{value.company_ids.length} te zgjedhura</div>
        )}
      </div>
      <div className="space-y-2 rounded-lg bg-slate-50 p-3">
        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input
            type="checkbox"
            checked={value.active_only !== false}
            onChange={(e) => onChange({ ...value, active_only: e.target.checked })}
            className="rounded border-slate-300 text-teal-600 focus:ring-teal-500"
          />
          Vetem perdorues aktive
        </label>
        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input
            type="checkbox"
            checked={value.marketing_opt_in_only ?? false}
            onChange={(e) => onChange({ ...value, marketing_opt_in_only: e.target.checked })}
            className="rounded border-slate-300 text-teal-600 focus:ring-teal-500"
          />
          Vetem ata qe nuk kane cregjistruar marketingun
        </label>
      </div>
      <div className="border-t border-slate-200 pt-4">
        <button
          type="button"
          onClick={calculateAudience}
          disabled={loadingCount}
          className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
        >
          {loadingCount ? <Loader2 className="h-4 w-4 animate-spin" /> : <Users className="h-4 w-4" />}
          Llogarit audiencen
        </button>
        {count !== null && (
          <div className="mt-3 rounded-lg bg-teal-50 p-3 text-sm">
            <div className="font-semibold text-teal-900">{count} marres</div>
            {sample.length > 0 && (
              <div className="mt-2 max-h-32 overflow-y-auto text-xs text-teal-800">
                <div className="mb-1 font-medium">Shembull:</div>
                <ul className="space-y-0.5">
                  {sample.map((s) => (
                    <li key={s.id}>
                      <code>{s.email}</code> <span className="text-teal-600">({s.locale})</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
