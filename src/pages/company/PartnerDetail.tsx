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
import { useTranslation } from '../../i18n';

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
  const { t } = useTranslation();
  const tp = (k: string) => t(`companyAdmin.partners.detail.${k}`);
  const [partner, setPartner] = useState<Partner | null>(null);
  const [rows, setRows] = useState<FlowRow[]>([]);
  const [invoiceSummary, setInvoiceSummary] = useState<{ overdueCount: number; overdueTotal: number; openCount: number; openTotal: number; currency: string }>(
    { overdueCount: 0, overdueTotal: 0, openCount: 0, openTotal: 0, currency: 'EUR' }
  );
  const [palletBalances, setPalletBalances] = useState<Array<{ pallet_type: string; current_balance: number }>>([]);
  // Lifetime sales (invoices we issued TO this partner) and purchases (supplier
  // invoices they sent us) so the admin sees the full business relationship,
  // not just the open balance.
  const [lifetime, setLifetime] = useState<{
    salesPaid: number;
    salesTotal: number;
    salesCount: number;
    purchasesPaid: number;
    purchasesTotal: number;
    purchasesCount: number;
    currency: string;
  }>({
    salesPaid: 0, salesTotal: 0, salesCount: 0,
    purchasesPaid: 0, purchasesTotal: 0, purchasesCount: 0,
    currency: 'EUR',
  });
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
          setError(tp('notFound'));
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

        // Pallet account balances per pallet_type (EPAL etc.). Positive
        // balance = partner owes us; negative = we owe them.
        const { data: paBalances } = await supabase
          .from('pallet_accounts')
          .select('pallet_type, current_balance')
          .eq('company_id', profile!.company_id)
          .eq('partner_contact_id', id!);
        if (!cancelled) {
          setPalletBalances(((paBalances ?? []) as Array<{ pallet_type: string; current_balance: number }>).filter((r) => r.current_balance !== 0));
        }

        // Lifetime business with this partner — sales we billed (sales side)
        // and purchases we received (purchase side). Both filter out
        // cancelled rows; "paid" sums the closed total separately from the
        // grand total so the admin sees both volume and collection ratio.
        const [allSalesRes, allPurchasesRes] = await Promise.all([
          supabase
            .from('acc_invoices')
            .select('total, status, currency')
            .eq('company_id', profile!.company_id)
            .eq('contact_id', id!)
            .eq('invoice_type', 'invoice')
            .neq('status', 'cancelled')
            .neq('status', 'draft'),
          supabase
            .from('acc_purchases')
            .select('total, status, currency')
            .eq('company_id', profile!.company_id)
            .eq('contact_id', id!)
            .neq('status', 'cancelled')
            .neq('status', 'draft'),
        ]);
        if (!cancelled) {
          let salesPaid = 0, salesTotal = 0, salesCount = 0;
          let purchasesPaid = 0, purchasesTotal = 0, purchasesCount = 0;
          let currency = 'EUR';
          for (const inv of (allSalesRes.data ?? []) as Array<{ total: number; status: string; currency: string }>) {
            currency = inv.currency || currency;
            const amt = Number(inv.total) || 0;
            salesTotal += amt;
            salesCount++;
            if (inv.status === 'paid') salesPaid += amt;
          }
          for (const pu of (allPurchasesRes.data ?? []) as Array<{ total: number; status: string; currency: string }>) {
            const amt = Number(pu.total) || 0;
            purchasesTotal += amt;
            purchasesCount++;
            if (pu.status === 'paid') purchasesPaid += amt;
          }
          setLifetime({ salesPaid, salesTotal, salesCount, purchasesPaid, purchasesTotal, purchasesCount, currency });
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
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
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error ?? tp('notFound')}</div>
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
        <Kpi label={tp('kpiIn')} value={totals.in} tone="emerald" icon={ArrowDownLeft} />
        <Kpi label={tp('kpiOut')} value={totals.out} tone="rose" icon={ArrowUpRight} />
        <Kpi label={tp('kpiCarrier')} value={totals.carrier} tone="slate" icon={Handshake} />
        <Kpi label={tp('kpiCustody')} value={totals.custody} tone="amber" icon={Warehouse} />
        <Kpi label={tp('kpiDocuments')} value={totals.documents} tone="sky" icon={Package} />
      </div>

      {(lifetime.salesCount > 0 || lifetime.purchasesCount > 0) && (
        <section className="rounded-2xl border border-slate-200 bg-white p-4">
          <div className="flex items-start justify-between gap-3 flex-wrap mb-3">
            <div>
              <h2 className="text-sm font-semibold text-slate-900">{tp('businessVolumeTitle')}</h2>
              <p className="text-xs text-slate-500 mt-0.5">
                {tp('businessVolumeSubtitle')}
              </p>
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3">
              <p className="text-xs text-emerald-700 uppercase tracking-wide font-semibold">{tp('sales')}</p>
              <p className="text-lg font-bold text-emerald-900 mt-1">
                {lifetime.salesTotal.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {lifetime.currency}
              </p>
              <p className="text-xs text-emerald-800 mt-0.5">
                {lifetime.salesCount} {tp('invoicesUnit')} · {lifetime.salesPaid.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {lifetime.currency} {tp('paidLabel')}
                {lifetime.salesTotal > 0 && (
                  <> ({((lifetime.salesPaid / lifetime.salesTotal) * 100).toFixed(0)}%)</>
                )}
              </p>
            </div>
            <div className="rounded-lg border border-blue-200 bg-blue-50 p-3">
              <p className="text-xs text-blue-700 uppercase tracking-wide font-semibold">{tp('purchases')}</p>
              <p className="text-lg font-bold text-blue-900 mt-1">
                {lifetime.purchasesTotal.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {lifetime.currency}
              </p>
              <p className="text-xs text-blue-800 mt-0.5">
                {lifetime.purchasesCount} {tp('purchasesUnit')} · {lifetime.purchasesPaid.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {lifetime.currency} {tp('paidLabel')}
                {lifetime.purchasesTotal > 0 && (
                  <> ({((lifetime.purchasesPaid / lifetime.purchasesTotal) * 100).toFixed(0)}%)</>
                )}
              </p>
            </div>
          </div>
        </section>
      )}

      {palletBalances.length > 0 && (
        <section className="rounded-2xl border border-slate-200 bg-white p-4">
          <div className="flex items-start justify-between gap-3 flex-wrap mb-3">
            <div>
              <h2 className="text-sm font-semibold text-slate-900">{tp('palletAccountTitle')}</h2>
              <p className="text-xs text-slate-500 mt-0.5">
                {tp('palletAccountSubtitle')}
              </p>
            </div>
            <Link to="/company/pallet-accounts" className="text-xs font-medium text-teal-600 hover:text-teal-700">
              {tp('palletAccountsFullLink')} →
            </Link>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-sm">
            {palletBalances.map((b) => {
              const isOwed = b.current_balance > 0;
              const isDebt = b.current_balance < 0;
              return (
                <div
                  key={b.pallet_type}
                  className={`rounded-lg p-3 border ${
                    isDebt ? 'border-red-200 bg-red-50' : isOwed ? 'border-emerald-200 bg-emerald-50' : 'border-slate-200 bg-slate-50'
                  }`}
                >
                  <p className="text-[11px] text-slate-500 uppercase tracking-wide">{b.pallet_type}</p>
                  <p className={`text-base font-bold mt-0.5 ${isDebt ? 'text-red-900' : isOwed ? 'text-emerald-900' : 'text-slate-900'}`}>
                    {isOwed ? '+' : ''}{b.current_balance.toLocaleString()}
                  </p>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {(invoiceSummary.openCount > 0 || invoiceSummary.overdueCount > 0) && (
        <section className={`rounded-2xl border p-4 ${
          invoiceSummary.overdueCount > 0
            ? 'border-red-200 bg-red-50'
            : 'border-slate-200 bg-white'
        }`}>
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div>
              <h2 className={`text-sm font-semibold ${invoiceSummary.overdueCount > 0 ? 'text-red-900' : 'text-slate-900'}`}>
                {tp('invoiceStatusTitle')}
              </h2>
              <p className={`text-xs mt-0.5 ${invoiceSummary.overdueCount > 0 ? 'text-red-700' : 'text-slate-500'}`}>
                {tp('invoiceStatusSubtitle')}
              </p>
            </div>
            <Link
              to="/company/invoices"
              className={`text-xs font-medium ${invoiceSummary.overdueCount > 0 ? 'text-red-700 hover:text-red-900' : 'text-teal-600 hover:text-teal-700'}`}
            >
              {tp('viewAll')} →
            </Link>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
            <div className={`rounded-lg p-3 ${invoiceSummary.overdueCount > 0 ? 'bg-white border border-red-200' : 'bg-slate-50'}`}>
              <p className="text-xs text-slate-500 uppercase tracking-wide">{tp('openLabel')}</p>
              <p className="text-base font-bold text-slate-900 mt-0.5">
                {invoiceSummary.openTotal.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {invoiceSummary.currency}
              </p>
              <p className="text-xs text-slate-500 mt-0.5">{invoiceSummary.openCount} {tp('invoicesUnit')}</p>
            </div>
            <div className={`rounded-lg p-3 ${invoiceSummary.overdueCount > 0 ? 'bg-red-100 border border-red-300' : 'bg-slate-50'}`}>
              <p className={`text-xs uppercase tracking-wide ${invoiceSummary.overdueCount > 0 ? 'text-red-700' : 'text-slate-500'}`}>{tp('overdueLabel')}</p>
              <p className={`text-base font-bold mt-0.5 ${invoiceSummary.overdueCount > 0 ? 'text-red-900' : 'text-slate-900'}`}>
                {invoiceSummary.overdueTotal.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {invoiceSummary.currency}
              </p>
              <p className={`text-xs mt-0.5 ${invoiceSummary.overdueCount > 0 ? 'text-red-700' : 'text-slate-500'}`}>{invoiceSummary.overdueCount} {tp('invoicesUnit')}</p>
            </div>
          </div>
        </section>
      )}

      <section className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
        <div className="px-5 py-3 border-b border-slate-100">
          <h2 className="text-sm font-semibold text-slate-900">{tp('productSummaryTitle')}</h2>
          <p className="text-xs text-slate-500">{tp('productSummarySubtitle')}</p>
        </div>
        {byProduct.length === 0 ? (
          <div className="p-8 text-center text-sm text-slate-500">
            <Package className="w-8 h-8 mx-auto mb-2 text-slate-300" />
            {tp('noFlowsMsg')}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[680px]">
              <thead className="bg-slate-50 border-b border-slate-200 text-[11px] uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-2 text-left">{tp('thCategory')}</th>
                  <th className="px-4 py-2 text-left">{tp('thProduct')}</th>
                  <th className="px-4 py-2 text-right">{tp('thIn')}</th>
                  <th className="px-4 py-2 text-right">{tp('thOut')}</th>
                  <th className="px-4 py-2 text-right">{tp('thCarrier')}</th>
                  <th className="px-4 py-2 text-right">{tp('thCustody')}</th>
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
          <h2 className="text-sm font-semibold text-slate-900">{tp('movementHistoryTitle')}</h2>
          <p className="text-xs text-slate-500">{tp('movementHistorySubtitle')}</p>
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
