import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowDownLeft, ArrowUpRight, Handshake, Warehouse, Package, Loader2, ExternalLink } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { useTranslation } from '../../i18n';

interface FlowRow {
  id: string;
  company_id: string;
  partner_company_id: string | null;
  partner_contact_id: string | null;
  delivery_note_id: string | null;
  direction: 'in' | 'out' | 'carrier_in' | 'carrier_out' | 'custody_in' | 'custody_out';
  role_of_partner: 'sender' | 'receiver' | 'owner' | null;
  category_id: string | null;
  category_product_id: string | null;
  quantity: number;
  event_date: string;
  notes: string | null;
  partner_company?: { id: string; name: string } | null;
  partner_contact?: { id: string; name: string } | null;
  category?: { id: string; name: string } | null;
  category_product?: { id: string; name: string } | null;
  delivery_note?: { note_number: string } | null;
}

const DIRECTION_META: Record<FlowRow['direction'], { label: string; tone: string; icon: typeof ArrowDownLeft }> = {
  in: { label: 'Hyrje ne stok', tone: 'bg-emerald-50 text-emerald-700 border-emerald-200', icon: ArrowDownLeft },
  out: { label: 'Dalje nga stoku', tone: 'bg-rose-50 text-rose-700 border-rose-200', icon: ArrowUpRight },
  carrier_in: { label: 'Transport (marr)', tone: 'bg-slate-50 text-slate-700 border-slate-200', icon: Handshake },
  carrier_out: { label: 'Transport (derguar)', tone: 'bg-slate-50 text-slate-700 border-slate-200', icon: Handshake },
  custody_in: { label: 'Ruajtje hyrese', tone: 'bg-amber-50 text-amber-700 border-amber-200', icon: Warehouse },
  custody_out: { label: 'Ruajtje dalese', tone: 'bg-sky-50 text-sky-700 border-sky-200', icon: Warehouse },
};

export default function PartnerFlows() {
  const { profile } = useAuth();
  const { t } = useTranslation();
  const [rows, setRows] = useState<FlowRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'stock' | 'carrier' | 'custody'>('all');
  const [view, setView] = useState<'by_event' | 'by_partner'>('by_partner');

  useEffect(() => {
    if (!profile?.company_id) return;
    let cancelled = false;
    async function load() {
      setLoading(true);
      const { data, error } = await supabase
        .from('partner_flow_events')
        .select(
          '*, partner_company:companies!partner_flow_events_partner_company_id_fkey(id,name), partner_contact:acc_contacts(id,name), category:product_categories(id,name), category_product:category_products(id,name), delivery_note:delivery_notes(note_number)',
        )
        .or(`company_id.eq.${profile!.company_id},partner_company_id.eq.${profile!.company_id}`)
        .order('event_date', { ascending: false })
        .limit(500);
      if (cancelled) return;
      if (!error) setRows((data ?? []) as FlowRow[]);
      setLoading(false);
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [profile?.company_id]);

  const filtered = useMemo(() => {
    if (filter === 'all') return rows;
    if (filter === 'stock') return rows.filter((r) => r.direction === 'in' || r.direction === 'out');
    if (filter === 'carrier') return rows.filter((r) => r.direction === 'carrier_in' || r.direction === 'carrier_out');
    return rows.filter((r) => r.direction === 'custody_in' || r.direction === 'custody_out');
  }, [rows, filter]);

  const totals = useMemo(() => {
    const acc = { in: 0, out: 0, carrier: 0, custody: 0 };
    for (const r of rows) {
      if (r.direction === 'in') acc.in += r.quantity;
      else if (r.direction === 'out') acc.out += r.quantity;
      else if (r.direction.startsWith('carrier')) acc.carrier += r.quantity;
      else acc.custody += r.quantity;
    }
    return acc;
  }, [rows]);

  const byPartner = useMemo(() => {
    const map = new Map<
      string,
      {
        id: string;
        kind: 'contact' | 'company';
        name: string;
        in: number;
        out: number;
        carrier: number;
        custody: number;
        total: number;
        lastDate: string;
      }
    >();
    for (const r of filtered) {
      const partnerId = r.partner_contact_id ?? r.partner_company_id;
      if (!partnerId) continue;
      const kind: 'contact' | 'company' = r.partner_contact_id ? 'contact' : 'company';
      const name = r.partner_contact?.name ?? r.partner_company?.name ?? '—';
      const cur = map.get(partnerId) ?? {
        id: partnerId,
        kind,
        name,
        in: 0,
        out: 0,
        carrier: 0,
        custody: 0,
        total: 0,
        lastDate: r.event_date,
      };
      if (r.direction === 'in') cur.in += r.quantity;
      else if (r.direction === 'out') cur.out += r.quantity;
      else if (r.direction.startsWith('carrier')) cur.carrier += r.quantity;
      else cur.custody += r.quantity;
      cur.total = cur.in + cur.out + cur.carrier + cur.custody;
      if (r.event_date > cur.lastDate) cur.lastDate = r.event_date;
      map.set(partnerId, cur);
    }
    return Array.from(map.values()).sort((a, b) => b.total - a.total);
  }, [filtered]);

  const TABS: Array<{ id: typeof filter; label: string }> = [
    { id: 'all', label: 'Te gjitha' },
    { id: 'stock', label: 'Hyrje / Dalje stoku' },
    { id: 'carrier', label: 'Vetem transport' },
    { id: 'custody', label: 'Ruajtje per partner' },
  ];

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl lg:text-2xl font-bold text-slate-900">Rrjedhat me partneret</h1>
        <p className="text-slate-500 text-sm mt-0.5">Raport i unifikuar i levizjeve sipas rolit ne cdo dokument</p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Kpi label="Hyrje (copa)" value={totals.in} tone="emerald" icon={ArrowDownLeft} />
        <Kpi label="Dalje (copa)" value={totals.out} tone="rose" icon={ArrowUpRight} />
        <Kpi label="Transport (copa)" value={totals.carrier} tone="slate" icon={Handshake} />
        <Kpi label="Ruajtje (copa)" value={totals.custody} tone="amber" icon={Warehouse} />
      </div>

      <div className="flex gap-2 flex-wrap">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setFilter(tab.id)}
            className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors ${
              filter === tab.id
                ? 'bg-teal-600 text-white border-teal-600'
                : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
            }`}
          >
            {tab.label}
          </button>
        ))}
        <div className="ml-auto inline-flex rounded-lg border border-slate-200 overflow-hidden">
          <button
            onClick={() => setView('by_partner')}
            className={`px-3 py-1.5 text-xs font-medium transition-colors ${
              view === 'by_partner' ? 'bg-slate-900 text-white' : 'bg-white text-slate-600 hover:bg-slate-50'
            }`}
          >
            Sipas partnerit
          </button>
          <button
            onClick={() => setView('by_event')}
            className={`px-3 py-1.5 text-xs font-medium transition-colors border-l border-slate-200 ${
              view === 'by_event' ? 'bg-slate-900 text-white' : 'bg-white text-slate-600 hover:bg-slate-50'
            }`}
          >
            Sipas levizjes
          </button>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        {loading ? (
          <div className="p-8 flex items-center justify-center">
            <Loader2 className="w-5 h-5 text-slate-400 animate-spin" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-8 text-center text-sm text-slate-500">
            <Package className="w-8 h-8 mx-auto mb-2 text-slate-300" />
            Asnje rrjedhe per kete filter
          </div>
        ) : view === 'by_partner' ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[720px]">
              <thead className="bg-slate-50 border-b border-slate-200 text-[11px] uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-2 text-left">{t('companyAdmin.partnerFlows.headers.partner')}</th>
                  <th className="px-4 py-2 text-right">{t('companyAdmin.partnerFlows.headers.inbound')}</th>
                  <th className="px-4 py-2 text-right">{t('companyAdmin.partnerFlows.headers.outbound')}</th>
                  <th className="px-4 py-2 text-right">{t('companyAdmin.partnerFlows.headers.transport')}</th>
                  <th className="px-4 py-2 text-right">{t('companyAdmin.partnerFlows.headers.custody')}</th>
                  <th className="px-4 py-2 text-left whitespace-nowrap">{t('companyAdmin.partnerFlows.headers.lastActivity')}</th>
                  <th className="px-4 py-2 text-right" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {byPartner.map((p) => (
                  <tr key={p.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3 font-medium text-slate-900">{p.name}</td>
                    <td className="px-4 py-3 text-right text-emerald-700">{p.in.toLocaleString()}</td>
                    <td className="px-4 py-3 text-right text-rose-700">{p.out.toLocaleString()}</td>
                    <td className="px-4 py-3 text-right text-slate-700">{p.carrier.toLocaleString()}</td>
                    <td className="px-4 py-3 text-right text-amber-700">{p.custody.toLocaleString()}</td>
                    <td className="px-4 py-3 text-slate-500 whitespace-nowrap">{new Date(p.lastDate).toLocaleDateString()}</td>
                    <td className="px-4 py-3 text-right">
                      {p.kind === 'contact' ? (
                        <Link
                          to={`/company/partners/${p.id}`}
                          className="inline-flex items-center gap-1 text-xs font-medium text-teal-700 hover:text-teal-900"
                        >
                          Kartela
                          <ExternalLink className="w-3.5 h-3.5" />
                        </Link>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[860px]">
              <thead className="bg-slate-50 border-b border-slate-200 text-[11px] uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-2 text-left whitespace-nowrap">Data</th>
                  <th className="px-4 py-2 text-left">Dokument</th>
                  <th className="px-4 py-2 text-left">Partneri</th>
                  <th className="px-4 py-2 text-left">Drejtimi</th>
                  <th className="px-4 py-2 text-left">Kategori</th>
                  <th className="px-4 py-2 text-left">Produkti</th>
                  <th className="px-4 py-2 text-right">Sasia</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.map((r) => {
                  const meta = DIRECTION_META[r.direction];
                  const Icon = meta.icon;
                  const partnerName = r.partner_company?.name ?? r.partner_contact?.name ?? '—';
                  const weAreOwner = r.company_id === profile?.company_id;
                  return (
                    <tr key={r.id} className="hover:bg-slate-50">
                      <td className="px-4 py-2 text-slate-700 whitespace-nowrap">
                        {new Date(r.event_date).toLocaleDateString()}
                      </td>
                      <td className="px-4 py-2 text-slate-600 whitespace-nowrap">{r.delivery_note?.note_number ?? '—'}</td>
                      <td className="px-4 py-2 text-slate-800 font-medium whitespace-nowrap">
                        {r.partner_contact_id ? (
                          <Link to={`/company/partners/${r.partner_contact_id}`} className="hover:text-teal-700">
                            {partnerName}
                          </Link>
                        ) : (
                          partnerName
                        )}
                        {!weAreOwner && (
                          <span className="ml-2 text-[10px] text-sky-700 bg-sky-50 border border-sky-200 px-1.5 py-0.5 rounded-full">
                            Nga partneri
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-2 whitespace-nowrap">
                        <span
                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] border ${meta.tone}`}
                        >
                          <Icon className="w-3 h-3" />
                          {meta.label}
                        </span>
                      </td>
                      <td className="px-4 py-2 text-slate-700 whitespace-nowrap">{r.category?.name ?? '—'}</td>
                      <td className="px-4 py-2 text-slate-700 whitespace-nowrap">{r.category_product?.name ?? '—'}</td>
                      <td className="px-4 py-2 text-right font-semibold text-slate-900">{r.quantity}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function Kpi({
  label,
  value,
  tone,
  icon: Icon,
}: {
  label: string;
  value: number;
  tone: 'emerald' | 'rose' | 'slate' | 'amber';
  icon: typeof ArrowDownLeft;
}) {
  const toneMap: Record<string, string> = {
    emerald: 'bg-emerald-50 text-emerald-700 border-emerald-100',
    rose: 'bg-rose-50 text-rose-700 border-rose-100',
    slate: 'bg-slate-50 text-slate-700 border-slate-200',
    amber: 'bg-amber-50 text-amber-700 border-amber-100',
  };
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-4">
      <div className={`inline-flex items-center justify-center w-8 h-8 rounded-lg border ${toneMap[tone]} mb-2`}>
        <Icon className="w-4 h-4" />
      </div>
      <div className="text-[11px] uppercase tracking-wide text-slate-500">{label}</div>
      <div className="text-lg font-bold text-slate-900 mt-0.5">{value.toLocaleString()}</div>
    </div>
  );
}
