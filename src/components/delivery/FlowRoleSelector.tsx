import { useEffect, useState } from 'react';
import { CheckCircle2, Link2, Search, AlertCircle, Loader2, UserPlus, ShieldAlert } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import {
  FLOW_ROLE_META,
  matchCounterparty,
  type FlowRole,
  type CounterpartySnapshot,
} from '../../utils/counterpartyMatch';
import { isOwnCompanyName } from '../../utils/companyName';

interface Props {
  ownCompanyId: string;
  noteId: string;
  noteType?: string;
  initial: {
    flow_role?: FlowRole | null;
    counterparty_company_id?: string | null;
    counterparty_contact_id?: string | null;
    counterparty_name?: string | null;
    counterparty_vat?: string | null;
    counterparty_email?: string | null;
    counterparty_phone?: string | null;
    auto_register_partner?: boolean | null;
    partner_id?: string | null;
  };
  onChanged?: () => void;
  onRoleChange?: (role: FlowRole) => void;
  disabled?: boolean;
}

const ROLES: FlowRole[] = ['sender', 'receiver', 'carrier_only', 'custodian_in', 'custodian_out', 'internal_transfer'];

function flowRoleToOurRole(role: FlowRole): string {
  switch (role) {
    case 'sender': return 'consignor';
    case 'receiver': return 'consignee';
    case 'carrier_only': return 'carrier';
    case 'custodian_in': return 'custodian_in';
    case 'custodian_out': return 'custodian_out';
    case 'internal_transfer': return 'internal_transfer';
    default: return 'unknown';
  }
}

export default function FlowRoleSelector({ ownCompanyId, noteId, noteType, initial, onChanged, onRoleChange, disabled }: Props) {
  const [role, setRoleState] = useState<FlowRole>((initial.flow_role as FlowRole) ?? 'sender');
  const setRole = (next: FlowRole) => {
    setRoleState(next);
    onRoleChange?.(next);
  };
  useEffect(() => {
    onRoleChange?.(role);
  }, []);
  const [snapshot, setSnapshot] = useState<CounterpartySnapshot>({
    name: initial.counterparty_name ?? '',
    vat: initial.counterparty_vat ?? '',
    email: initial.counterparty_email ?? '',
    phone: initial.counterparty_phone ?? '',
  });
  const [matchedCompanyId, setMatchedCompanyId] = useState<string | null>(initial.counterparty_company_id ?? null);
  const [matchedContactId, setMatchedContactId] = useState<string | null>(initial.counterparty_contact_id ?? initial.partner_id ?? null);
  const [matchLabel, setMatchLabel] = useState<string>('');
  const [searching, setSearching] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [autoRegister, setAutoRegister] = useState<boolean>(initial.auto_register_partner ?? true);
  const [ownCompanyName, setOwnCompanyName] = useState<string>('');
  const [ownCompanyVat, setOwnCompanyVat] = useState<string>('');

  useEffect(() => {
    let cancelled = false;
    async function loadOwn() {
      const { data } = await supabase
        .from('companies')
        .select('name, vat_number')
        .eq('id', ownCompanyId)
        .maybeSingle();
      if (cancelled) return;
      setOwnCompanyName((data?.name || '').trim());
      setOwnCompanyVat((data?.vat_number || '').trim());
    }
    void loadOwn();
    return () => {
      cancelled = true;
    };
  }, [ownCompanyId]);

  const partnerIsOwnCompany = isOwnCompanyName(
    snapshot.name,
    snapshot.vat,
    ownCompanyName,
    ownCompanyVat,
  );

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
    const payload: Record<string, any> = partnerIsOwnCompany
      ? {
          flow_role: 'internal_transfer' as FlowRole,
          our_role: 'internal_transfer',
          counterparty_company_id: null,
          counterparty_contact_id: null,
          counterparty_name: snapshot.name || null,
          counterparty_vat: snapshot.vat || null,
          counterparty_email: snapshot.email || null,
          counterparty_phone: snapshot.phone || null,
          partner_name: snapshot.name || null,
          partner_id: null,
          auto_register_partner: false,
        }
      : {
          flow_role: role,
          our_role: flowRoleToOurRole(role),
          counterparty_company_id: matchedCompanyId,
          counterparty_contact_id: matchedContactId,
          counterparty_name: snapshot.name || null,
          counterparty_vat: snapshot.vat || null,
          counterparty_email: snapshot.email || null,
          counterparty_phone: snapshot.phone || null,
          partner_name: snapshot.name || null,
          auto_register_partner: autoRegister && !matchedContactId,
        };
    if (!partnerIsOwnCompany && matchedContactId) {
      payload.partner_id = matchedContactId;
    }
    if (partnerIsOwnCompany) {
      setRoleState('internal_transfer' as FlowRole);
      onRoleChange?.('internal_transfer' as FlowRole);
    }
    const { error: err } = await supabase
      .from('delivery_notes')
      .update(payload)
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

      {partnerIsOwnCompany && (
        <div className="flex items-start gap-2 text-xs text-sky-800 bg-sky-50 border border-sky-200 px-3 py-2 rounded-lg">
          <ShieldAlert className="w-4 h-4 flex-shrink-0 mt-0.5" />
          <div>
            <div className="font-semibold">Transferte interne</div>
            <div>Pala perputhet me kompanine tuaj. Fletedokumenti do te ruhet si transferte interne — stoku perditesohet normalisht dhe nuk krijohet asnje partner.</div>
          </div>
        </div>
      )}

      {!partnerIsOwnCompany && !matchedContactId && !matchedCompanyId && snapshot.name && snapshot.name.trim().length > 2 && (
        <label className="flex items-start gap-2 text-xs bg-sky-50 border border-sky-200 rounded-lg px-3 py-2 cursor-pointer">
          <input
            type="checkbox"
            className="mt-0.5 w-4 h-4 accent-teal-600"
            checked={autoRegister}
            onChange={(e) => setAutoRegister(e.target.checked)}
            disabled={disabled}
          />
          <div className="flex-1">
            <div className="font-semibold text-sky-900 inline-flex items-center gap-1">
              <UserPlus className="w-3.5 h-3.5" /> Regjistroje si partner te ri
            </div>
            <div className="text-sky-800 mt-0.5">
              Ky partner nuk eshte ne listen tuaj. Kur te ruani dhe konfirmoni dergesen per stok, do te shtohet automatikisht ne {noteType === 'pickup' ? 'furnitoret' : 'klientet'}.
            </div>
          </div>
        </label>
      )}

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
