import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  ArrowDownLeft,
  ArrowUpRight,
  ArrowLeft,
  Building2,
  ExternalLink,
  Hash,
  Handshake,
  Loader2,
  Mail,
  MapPin,
  Package,
  Phone,
  Warehouse,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';

interface Partner {
  id: string;
  name: string;
  contact_type: 'customer' | 'supplier' | 'both';
  email: string | null;
  phone: string | null;
  vat_number: string | null;
  address: string | null;
  city: string | null;
  postal_code: string | null;
  country: string | null;
  website: string | null;
  notes: string | null;
}

interface FlowRow {
  id: string;
  direction: 'in' | 'out' | 'carrier_in' | 'carrier_out' | 'custody_in' | 'custody_out';
  quantity: number;
  event_date: string;
  delivery_note_id: string | null;
  category_id: string | null;
  category_product_id: string | null;
  category?: { name: string } | null;
  category_product?: { name: string } | null;
  delivery_note?: { note_number: string; type: string; status: string } | null;
}

const DIRECTION_META: Record<FlowRow['direction'], { label: string; tone: string; icon: typeof ArrowDownLeft }> = {
  in: { label: 'Hyrje', tone: 'bg-emerald-50 text-emerald-700 border-emerald-200', icon: ArrowDownLeft },
  out: { label: 'Dalje', tone: 'bg-rose-50 text-rose-700 border-rose-200', icon: ArrowUpRight },
  carrier_in: { label: 'Transport', tone: 'bg-slate-50 text-slate-700 border-slate-200', icon: Handshake },
  carrier_out: { label: 'Transport', tone: 'bg-slate-50 text-slate-700 border-slate-200', icon: Handshake },
  custody_in: { label: 'Ruajtje (hyr)', tone: 'bg-amber-50 text-amber-700 border-amber-200', icon: Warehouse },
  custody_out: { label: 'Ruajtje (dal)', tone: 'bg-sky-50 text-sky-700 border-sky-200', icon: Warehouse },
};

const TYPE_LABEL: Record<Partner['contact_type'], string> = {
  customer: 'Klient',
  supplier: 'Furnitor',
  both: 'Klient dhe Furnitor',
};

const TYPE_TONE: Record<Partner['contact_type'], string> = {
  customer: 'bg-teal-50 text-teal-700 border-teal-200',
  supplier: 'bg-blue-50 text-blue-700 border-blue-200',
  both: 'bg-slate-50 text-slate-700 border-slate-200',
};

export default function PartnerDetail() {
  const { id } = useParams<{ id: string }>();
  const { profile } = useAuth();
  const [partner, setPartner] = useState<Partner | null>(null);
  const [rows, setRows] = useState<FlowRow[]>([]);
  const [invoiceSummary, setInvoiceSummary] = useState<{ overdueCount: number; overdueTotal: number; openCount: number; openTotal: number; currency: string }>(
    { overdueCount: 0, overdueTotal: 0, openCount: 0, openTotal: 0, currency: 'EUR' }
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id || !profile?.company_id) return;
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const { data: p, error: pErr } = await supabase
          .from('acc_contacts')
          .select('id,name,contact_type,email,phone,vat_number,address,city,postal_code,country,website,notes')
          .eq('id', id!)
          .eq('company_id', profile!.company_id)
          .maybeSingle();
        if (pErr) throw pErr;
        if (!p) {
          setError('Partneri nuk u gjet');
          setLoading(false);
          return;
        }
        if (cancelled) return;
        setPartner(p as Partner);

        const { data: flows, error: fErr } = await supabase
          .from('partner_flow_events')
          .select(
            'id, direction, quantity, event_date, delivery_note_id, category_id, category_product_id, category:product_categories(name), category_product:category_products(name), delivery_note:delivery_notes(note_number,type,status)',
          )
          .eq('company_id', profile!.company_id)
          .eq('partner_contact_id', id!)
          .order('event_date', { ascending: false });
        if (fErr) throw fErr;
        if (!cancelled) setRows((flows ?? []) as unknown as FlowRow[]);

        // Pull this partner's open and overdue invoices so the page surfaces
        // their credit standing without making the admin open the accounting
        // module to look it up.
        const { data: invoices } = await supabase
          .from('acc_invoices')
          .select('total, currency, status')
          .eq('company_id', profile!.company_id)
          .eq('contact_id', id!)
          .in('status', ['sent', 'overdue', 'partial']);
        if (!cancelled) {
          let overdueCount = 0, overdueTotal = 0, openCount = 0, openTotal = 0;
          let currency = 'EUR';
          for (const inv of (invoices ?? []) as Array<{ total: number; currency: string; status: string }>) {
            currency = inv.currency || currency;
            const amount = Number(inv.total) || 0;
            if (inv.status === 'overdue') { overdueCount++; overdueTotal += amount; }
            else { openCount++; openTotal += amount; }
          }
          setInvoiceSummary({ overdueCount, overdueTotal, openCount, openTotal, currency });
        }
      } catch (err: any) {
        if (!cancelled) setError(err.message || 'Gabim gjate ngarkimit');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [id, profile?.company_id]);

  const totals = useMemo(() => {
    const acc = { in: 0, out: 0, carrier: 0, custody: 0, documents: new Set<string>() };
    for (const r of rows) {
      if (r.direction === 'in') acc.in += r.quantity;
      else if (r.direction === 'out') acc.out += r.quantity;
      else if (r.direction.startsWith('carrier')) acc.carrier += r.quantity;
      else acc.custody += r.quantity;
      if (r.delivery_note_id) acc.documents.add(r.delivery_note_id);
    }
    return { ...acc, documents: acc.documents.size };
  }, [rows]);

  const byProduct = useMemo(() => {
    const map = new Map<string, { key: string; category: string; product: string; in: number; out: number; carrier: number; custody: number }>();
    for (const r of rows) {
      const key = `${r.category_id ?? 'x'}:${r.category_product_id ?? 'x'}`;
      const cur = map.get(key) ?? {
        key,
        category: r.category?.name ?? '—',
        product: r.category_product?.name ?? '—',
        in: 0,
        out: 0,
        carrier: 0,
        custody: 0,
      };
      if (r.direction === 'in') cur.in += r.quantity;
      else if (r.direction === 'out') cur.out += r.quantity;
      else if (r.direction.startsWith('carrier')) cur.carrier += r.quantity;
      else cur.custody += r.quantity;
      map.set(key, cur);
    }
    return Array.from(map.values()).sort((a, b) => b.in + b.out - (a.in + a.out));
  }, [rows]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20 text-gray-500">
        <Loader2 className="w-6 h-6 animate-spin" />
      </div>
    );
  }

  if (error || !partner) {
    return (
      <div className="space-y-4">
        <Link to="/company/partners" className="inline-flex items-center gap-1 text-sm text-teal-700 hover:text-teal-900">
          <ArrowLeft className="w-4 h-4" /> Kthehu tek partneret
        </Link>
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error ?? 'Partneri nuk u gjet'}</div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <Link to="/company/partners" className="inline-flex items-center gap-1 text-sm text-slate-600 hover:text-teal-700">
          <ArrowLeft className="w-4 h-4" /> Partneret
        </Link>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="flex items-start gap-3 min-w-0">
            <div className="w-12 h-12 rounded-xl bg-teal-50 border border-teal-100 flex items-center justify-center flex-shrink-0">
              <Building2 className="w-6 h-6 text-teal-700" />
            </div>
            <div className="min-w-0">
              <h1 className="text-xl lg:text-2xl font-bold text-slate-900 truncate">{partner.name}</h1>
              <span className={`mt-1 inline-flex px-2 py-0.5 rounded-full text-xs font-semibold border ${TYPE_TONE[partner.contact_type]}`}>
                {TYPE_LABEL[partner.contact_type]}
              </span>
            </div>
          </div>
        </div>

        <dl className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm text-slate-600">
          {partner.vat_number && (
            <InfoLine icon={Hash} label={`VAT: ${partner.vat_number}`} />
          )}
          {partner.email && <InfoLine icon={Mail} label={partner.email} />}
          {partner.phone && <InfoLine icon={Phone} label={partner.phone} />}
          {(partner.address || partner.city || partner.country) && (
            <InfoLine icon={MapPin} label={[partner.address, partner.postal_code, partner.city, partner.country].filter(Boolean).join(', ')} />
          )}
        </dl>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <Kpi label="Hyrje (copa)" value={totals.in} tone="emerald" icon={ArrowDownLeft} />
        <Kpi label="Dalje (copa)" value={totals.out} tone="rose" icon={ArrowUpRight} />
        <Kpi label="Transport (copa)" value={totals.carrier} tone="slate" icon={Handshake} />
        <Kpi label="Ruajtje (copa)" value={totals.custody} tone="amber" icon={Warehouse} />
        <Kpi label="Dokumente" value={totals.documents} tone="sky" icon={Package} />
      </div>

      {(invoiceSummary.openCount > 0 || invoiceSummary.overdueCount > 0) && (
        <section className={`rounded-2xl border p-4 ${
          invoiceSummary.overdueCount > 0
            ? 'border-red-200 bg-red-50'
            : 'border-slate-200 bg-white'
        }`}>
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div>
              <h2 className={`text-sm font-semibold ${invoiceSummary.overdueCount > 0 ? 'text-red-900' : 'text-slate-900'}`}>
                Statusi i faturave
              </h2>
              <p className={`text-xs mt-0.5 ${invoiceSummary.overdueCount > 0 ? 'text-red-700' : 'text-slate-500'}`}>
                Permbledhje e faturave aktive dhe te vonuara me kete partner
              </p>
            </div>
            <Link
              to="/company/invoices"
              className={`text-xs font-medium ${invoiceSummary.overdueCount > 0 ? 'text-red-700 hover:text-red-900' : 'text-teal-600 hover:text-teal-700'}`}
            >
              Shiko te gjitha →
            </Link>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
            <div className={`rounded-lg p-3 ${invoiceSummary.overdueCount > 0 ? 'bg-white border border-red-200' : 'bg-slate-50'}`}>
              <p className="text-xs text-slate-500 uppercase tracking-wide">Te hapura</p>
              <p className="text-base font-bold text-slate-900 mt-0.5">
                {invoiceSummary.openTotal.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {invoiceSummary.currency}
              </p>
              <p className="text-xs text-slate-500 mt-0.5">{invoiceSummary.openCount} fatura</p>
            </div>
            <div className={`rounded-lg p-3 ${invoiceSummary.overdueCount > 0 ? 'bg-red-100 border border-red-300' : 'bg-slate-50'}`}>
              <p className={`text-xs uppercase tracking-wide ${invoiceSummary.overdueCount > 0 ? 'text-red-700' : 'text-slate-500'}`}>Te vonuara</p>
              <p className={`text-base font-bold mt-0.5 ${invoiceSummary.overdueCount > 0 ? 'text-red-900' : 'text-slate-900'}`}>
                {invoiceSummary.overdueTotal.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {invoiceSummary.currency}
              </p>
              <p className={`text-xs mt-0.5 ${invoiceSummary.overdueCount > 0 ? 'text-red-700' : 'text-slate-500'}`}>{invoiceSummary.overdueCount} fatura</p>
            </div>
          </div>
        </section>
      )}

      <section className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
        <div className="px-5 py-3 border-b border-slate-100">
          <h2 className="text-sm font-semibold text-slate-900">Permbledhje sipas produktit</h2>
          <p className="text-xs text-slate-500">Totali i levizjeve per cdo produkt me kete partner</p>
        </div>
        {byProduct.length === 0 ? (
          <div className="p-8 text-center text-sm text-slate-500">
            <Package className="w-8 h-8 mx-auto mb-2 text-slate-300" />
            Asnje levizje per kete partner
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[680px]">
              <thead className="bg-slate-50 border-b border-slate-200 text-[11px] uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-2 text-left">Kategori</th>
                  <th className="px-4 py-2 text-left">Produkti</th>
                  <th className="px-4 py-2 text-right">Hyrje</th>
                  <th className="px-4 py-2 text-right">Dalje</th>
                  <th className="px-4 py-2 text-right">Transport</th>
                  <th className="px-4 py-2 text-right">Ruajtje</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {byProduct.map((p) => (
                  <tr key={p.key} className="hover:bg-slate-50">
                    <td className="px-4 py-2 text-slate-700">{p.category}</td>
                    <td className="px-4 py-2 font-medium text-slate-900">{p.product}</td>
                    <td className="px-4 py-2 text-right text-emerald-700">{p.in.toLocaleString()}</td>
                    <td className="px-4 py-2 text-right text-rose-700">{p.out.toLocaleString()}</td>
                    <td className="px-4 py-2 text-right text-slate-700">{p.carrier.toLocaleString()}</td>
                    <td className="px-4 py-2 text-right text-amber-700">{p.custody.toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
        <div className="px-5 py-3 border-b border-slate-100">
          <h2 className="text-sm font-semibold text-slate-900">Historiku i levizjeve</h2>
          <p className="text-xs text-slate-500">Cdo rresht i lidhur me nje fletedergese</p>
        </div>
        {rows.length === 0 ? (
          <div className="p-8 text-center text-sm text-slate-500">
            <Package className="w-8 h-8 mx-auto mb-2 text-slate-300" />
            Nuk ka levizje per kete partner
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[780px]">
              <thead className="bg-slate-50 border-b border-slate-200 text-[11px] uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-2 text-left whitespace-nowrap">Data</th>
                  <th className="px-4 py-2 text-left">Dokumenti</th>
                  <th className="px-4 py-2 text-left">Drejtimi</th>
                  <th className="px-4 py-2 text-left">Kategori</th>
                  <th className="px-4 py-2 text-left">Produkti</th>
                  <th className="px-4 py-2 text-right">Sasia</th>
                  <th className="px-4 py-2 text-right" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map((r) => {
                  const meta = DIRECTION_META[r.direction];
                  const Icon = meta.icon;
                  return (
                    <tr key={r.id} className="hover:bg-slate-50">
                      <td className="px-4 py-2 text-slate-700 whitespace-nowrap">
                        {new Date(r.event_date).toLocaleDateString()}
                      </td>
                      <td className="px-4 py-2 text-slate-600 whitespace-nowrap">{r.delivery_note?.note_number ?? '—'}</td>
                      <td className="px-4 py-2 whitespace-nowrap">
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] border ${meta.tone}`}>
                          <Icon className="w-3 h-3" />
                          {meta.label}
                        </span>
                      </td>
                      <td className="px-4 py-2 text-slate-700 whitespace-nowrap">{r.category?.name ?? '—'}</td>
                      <td className="px-4 py-2 text-slate-800 font-medium whitespace-nowrap">{r.category_product?.name ?? '—'}</td>
                      <td className="px-4 py-2 text-right font-semibold text-slate-900">{r.quantity.toLocaleString()}</td>
                      <td className="px-4 py-2 text-right">
                        {r.delivery_note_id && (
                          <Link
                            to={`/company/delivery-notes?open=${r.delivery_note_id}`}
                            className="inline-flex items-center gap-1 text-xs font-medium text-teal-700 hover:text-teal-900"
                          >
                            Shiko
                            <ExternalLink className="w-3.5 h-3.5" />
                          </Link>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

function InfoLine({ icon: Icon, label }: { icon: typeof Mail; label: string }) {
  return (
    <div className="flex items-center gap-2">
      <Icon className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
      <span className="truncate">{label}</span>
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
  tone: 'emerald' | 'rose' | 'slate' | 'amber' | 'sky';
  icon: typeof ArrowDownLeft;
}) {
  const toneMap: Record<string, string> = {
    emerald: 'bg-emerald-50 text-emerald-700 border-emerald-100',
    rose: 'bg-rose-50 text-rose-700 border-rose-100',
    slate: 'bg-slate-50 text-slate-700 border-slate-200',
    amber: 'bg-amber-50 text-amber-700 border-amber-100',
    sky: 'bg-sky-50 text-sky-700 border-sky-100',
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
