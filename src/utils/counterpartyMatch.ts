import { supabase } from '../lib/supabase';

export type FlowRole =
  | 'sender'
  | 'receiver'
  | 'carrier_only'
  | 'custodian_in'
  | 'custodian_out'
  | 'internal_transfer';

export interface CounterpartySnapshot {
  name?: string | null;
  vat?: string | null;
  email?: string | null;
  phone?: string | null;
  address?: string | null;
  order_number?: string | null;
}

export interface CounterpartyMatch {
  companyId: string | null;
  contactId: string | null;
  matchedField: 'vat' | 'email' | 'phone' | 'name' | null;
  display: string;
}

const normalizePhone = (v?: string | null) => (v ?? '').replace(/[^0-9]/g, '');

export async function matchCounterparty(
  snapshot: CounterpartySnapshot,
  ownCompanyId: string,
): Promise<CounterpartyMatch> {
  const { name, vat, email, phone } = snapshot;
  const normPhone = normalizePhone(phone);

  if (vat && vat.trim().length > 3) {
    const { data } = await supabase
      .from('companies')
      .select('id, name')
      .ilike('vat_number', vat.trim())
      .neq('id', ownCompanyId)
      .maybeSingle();
    if (data) return { companyId: data.id, contactId: null, matchedField: 'vat', display: data.name };
  }
  if (email && email.includes('@')) {
    const { data } = await supabase
      .from('companies')
      .select('id, name')
      .ilike('email', email.trim())
      .neq('id', ownCompanyId)
      .maybeSingle();
    if (data) return { companyId: data.id, contactId: null, matchedField: 'email', display: data.name };
  }
  if (normPhone.length >= 6) {
    const { data } = await supabase
      .from('companies')
      .select('id, name, phone')
      .neq('id', ownCompanyId)
      .limit(25);
    const hit = (data ?? []).find((c: { phone?: string | null }) => normalizePhone(c.phone) === normPhone);
    if (hit) return { companyId: hit.id, contactId: null, matchedField: 'phone', display: hit.name };
  }
  if (name && name.trim().length > 3) {
    const { data } = await supabase
      .from('companies')
      .select('id, name')
      .ilike('name', name.trim())
      .neq('id', ownCompanyId)
      .maybeSingle();
    if (data) return { companyId: data.id, contactId: null, matchedField: 'name', display: data.name };
  }

  if (vat && vat.trim().length > 3) {
    const { data } = await supabase
      .from('acc_contacts')
      .select('id, name')
      .eq('company_id', ownCompanyId)
      .ilike('vat_number', vat.trim())
      .maybeSingle();
    if (data) return { companyId: null, contactId: data.id, matchedField: 'vat', display: data.name };
  }
  if (name && name.trim().length > 2) {
    const { data } = await supabase
      .from('acc_contacts')
      .select('id, name')
      .eq('company_id', ownCompanyId)
      .ilike('name', name.trim())
      .maybeSingle();
    if (data) return { companyId: null, contactId: data.id, matchedField: 'name', display: data.name };
  }

  return { companyId: null, contactId: null, matchedField: null, display: name ?? '' };
}

export function deriveFlowRole(params: {
  ownVat?: string | null;
  ownName?: string | null;
  senderSnapshot: CounterpartySnapshot;
  receiverSnapshot: CounterpartySnapshot;
  goodsOwnerIsOwn: boolean;
  goodsOwnerIsPartnerHeld: boolean;
}): FlowRole {
  const { ownVat, ownName, senderSnapshot, receiverSnapshot, goodsOwnerIsOwn, goodsOwnerIsPartnerHeld } = params;
  const own = (v?: string | null) => (v ?? '').trim().toLowerCase();
  const weAreSender =
    (ownVat && own(senderSnapshot.vat) === own(ownVat)) ||
    (ownName && own(senderSnapshot.name) === own(ownName));
  const weAreReceiver =
    (ownVat && own(receiverSnapshot.vat) === own(ownVat)) ||
    (ownName && own(receiverSnapshot.name) === own(ownName));

  if (weAreSender && weAreReceiver) return 'internal_transfer';
  if (weAreReceiver) return goodsOwnerIsOwn ? 'receiver' : 'custodian_in';
  if (weAreSender) return goodsOwnerIsOwn ? 'sender' : 'custodian_out';
  if (goodsOwnerIsPartnerHeld) return 'custodian_out';
  return 'carrier_only';
}

export const FLOW_ROLE_META: Record<FlowRole, { label: string; tone: string; touchesStock: boolean; description: string }> = {
  sender: {
    label: 'Derguesi (stoku yne)',
    tone: 'bg-rose-50 text-rose-700 border-rose-200',
    touchesStock: true,
    description: 'Malli del nga stoku i kompanise sone',
  },
  receiver: {
    label: 'Marresi (stoku yne)',
    tone: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    touchesStock: true,
    description: 'Malli hyn ne stokun e kompanise sone',
  },
  carrier_only: {
    label: 'Vetem transport',
    tone: 'bg-slate-50 text-slate-700 border-slate-200',
    touchesStock: false,
    description: 'Nuk prek stokun tone; raportohet tek partneret',
  },
  custodian_in: {
    label: 'Ruajtje ne depo (malli i partnerit)',
    tone: 'bg-amber-50 text-amber-700 border-amber-200',
    touchesStock: true,
    description: 'Malli hyn ne depo por pronesia mbetet e partnerit',
  },
  custodian_out: {
    label: 'Dergim per partner (nga stok i ruajtur ose i ri)',
    tone: 'bg-sky-50 text-sky-700 border-sky-200',
    touchesStock: true,
    description: 'Dergim per llogari te partnerit; stok i ruajtur ose i vecante',
  },
  internal_transfer: {
    label: 'Transfer mes depove tona',
    tone: 'bg-teal-50 text-teal-700 border-teal-200',
    touchesStock: true,
    description: 'Levizje e brendshme mes dy depove tona',
  },
};
