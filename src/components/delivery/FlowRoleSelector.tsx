import { useEffect, useState } from 'react';
import { CheckCircle2, Link2, Search, AlertCircle, Loader2 } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import {
  FLOW_ROLE_META,
  matchCounterparty,
  type FlowRole,
  type CounterpartySnapshot,
} from '../../utils/counterpartyMatch';

interface Props {
  ownCompanyId: string;
  noteId: string;
  initial: {
    flow_role?: FlowRole | null;
    counterparty_company_id?: string | null;
    counterparty_contact_id?: string | null;
    counterparty_name?: string | null;
    counterparty_vat?: string | null;
    counterparty_email?: string | null;
    counterparty_phone?: string | null;
  };
  onChanged?: () => void;
  disabled?: boolean;
}

const ROLES: FlowRole[] = ['sender', 'receiver', 'carrier_only', 'custodian_in', 'custodian_out', 'internal_transfer'];

export default function FlowRoleSelector({ ownCompanyId, noteId, initial, onChanged, disabled }: Props) {
  const [role, setRole] = useState<FlowRole>((initial.flow_role as FlowRole) ?? 'sender');
  const [snapshot, setSnapshot] = useState<CounterpartySnapshot>({
    name: initial.counterparty_name ?? '',
    vat: initial.counterparty_vat ?? '',
    email: initial.counterparty_email ?? '',
    phone: initial.counterparty_phone ?? '',
  });
  const [matchedCompanyId, setMatchedCompanyId] = useState<string | null>(initial.counterparty_company_id ?? null);
  const [matchedContactId, setMatchedContactId] = useState<string | null>(initial.counterparty_contact_id ?? null);
  const [matchLabel, setMatchLabel] = useState<string>('');
  const [searching, setSearching] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const identifier = snapshot.vat || snapshot.email || snapshot.phone || snapshot.name;
    if (!identifier || matchedCompanyId) return;
    const t = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await matchCounterparty(snapshot, ownCompanyId);
        if (cancelled) return;
        if (res.companyId) {
          setMatchedCompanyId(res.companyId);
          setMatchLabel(`${res.display} (kompani ne platforme)`);
        } else if (res.contactId) {
          setMatchedContactId(res.contactId);
          setMatchLabel(`${res.display} (partner i regjistruar)`);
        } else {
          setMatchLabel('');
        }
      } finally {
        setSearching(false);
      }
    }, 400);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [snapshot, ownCompanyId, matchedCompanyId]);

  async function save() {
    setSaving(true);
    setError(null);
    const { error: err } = await supabase
      .from('delivery_notes')
      .update({
        flow_role: role,
        counterparty_company_id: matchedCompanyId,
        counterparty_contact_id: matchedContactId,
        counterparty_name: snapshot.name || null,
        counterparty_vat: snapshot.vat || null,
        counterparty_email: snapshot.email || null,
        counterparty_phone: snapshot.phone || null,
      })
      .eq('id', noteId);
    setSaving(false);
    if (err) setError(err.message);
    else onChanged?.();
  }

  const meta = FLOW_ROLE_META[role];

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-4 space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold text-slate-900">Roli ne kete fletedokument</h3>
        <span className={`text-[11px] px-2 py-0.5 rounded-full border ${meta.tone}`}>
          {meta.touchesStock ? 'Prek stokun' : 'S\u0027prek stokun'}
        </span>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-3 gap-2">
        {ROLES.map((r) => {
          const m = FLOW_ROLE_META[r];
          const active = r === role;
          return (
            <button
              key={r}
              type="button"
              disabled={disabled}
              onClick={() => setRole(r)}
              className={`text-left px-3 py-2 rounded-lg border text-xs transition-colors ${
                active
                  ? `${m.tone} ring-2 ring-offset-1 ring-teal-500`
                  : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
              }`}
            >
              <div className="font-semibold">{m.label}</div>
              <div className="text-[10px] opacity-80 mt-0.5">{m.description}</div>
            </button>
          );
        })}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field label="Emri i pales tjeter" value={snapshot.name ?? ''} onChange={(v) => { setSnapshot({ ...snapshot, name: v }); setMatchedCompanyId(null); setMatchedContactId(null); }} />
        <Field label="Nr. TVSH" value={snapshot.vat ?? ''} onChange={(v) => { setSnapshot({ ...snapshot, vat: v }); setMatchedCompanyId(null); }} />
        <Field label="Email" value={snapshot.email ?? ''} onChange={(v) => { setSnapshot({ ...snapshot, email: v }); setMatchedCompanyId(null); }} />
        <Field label="Telefon" value={snapshot.phone ?? ''} onChange={(v) => { setSnapshot({ ...snapshot, phone: v }); setMatchedCompanyId(null); }} />
      </div>

      <div className="flex items-center gap-2 text-xs min-h-[22px]">
        {searching && (
          <span className="inline-flex items-center gap-1 text-slate-500">
            <Loader2 className="w-3.5 h-3.5 animate-spin" /> Po kerkohet pala tjeter...
          </span>
        )}
        {!searching && matchedCompanyId && (
          <span className="inline-flex items-center gap-1 text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-1 rounded-full">
            <CheckCircle2 className="w-3.5 h-3.5" /> {matchLabel}
          </span>
        )}
        {!searching && !matchedCompanyId && matchedContactId && (
          <span className="inline-flex items-center gap-1 text-sky-700 bg-sky-50 border border-sky-200 px-2 py-1 rounded-full">
            <Link2 className="w-3.5 h-3.5" /> {matchLabel}
          </span>
        )}
        {!searching && !matchedCompanyId && !matchedContactId && (snapshot.name || snapshot.vat) && (
          <span className="inline-flex items-center gap-1 text-slate-500">
            <Search className="w-3.5 h-3.5" /> Asnje perputhje; do te ruhet si snapshot
          </span>
        )}
      </div>

      {error && (
        <div className="flex items-center gap-2 text-xs text-rose-700 bg-rose-50 border border-rose-200 px-3 py-2 rounded-lg">
          <AlertCircle className="w-4 h-4" /> {error}
        </div>
      )}

      <div className="flex justify-end">
        <button
          type="button"
          disabled={disabled || saving}
          onClick={save}
          className="px-4 py-2 text-sm font-medium rounded-lg bg-teal-600 text-white hover:bg-teal-700 disabled:opacity-60 inline-flex items-center gap-2"
        >
          {saving && <Loader2 className="w-4 h-4 animate-spin" />} Ruaj rolin dhe palen
        </button>
      </div>
    </div>
  );
}

function Field({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="block">
      <span className="text-[11px] uppercase tracking-wide text-slate-500">{label}</span>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 w-full px-3 py-2 rounded-lg border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
      />
    </label>
  );
}
