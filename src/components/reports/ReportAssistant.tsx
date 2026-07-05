import { useState } from 'react';
import { Search, Sparkles } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { useTranslation } from '../../i18n';
import { isDamageLike } from '../../utils/epalClassification';
import type { StockCondition, Stock as StockType, StockMovement } from '../../types';
import { forecastStockRunouts } from '../../utils/stockForecast';
import { matchReportIntent, REPORT_INTENTS, type ReportIntentId } from '../../utils/reportIntents';

interface ReportResult {
  columns: string[];
  rows: (string | number)[][];
}

/**
 * Natural-language report assistant (template-based). The typed question is
 * matched to one of a fixed catalogue of read-only reports (reportIntents.ts);
 * the matched intent selects a predefined, parameterised Supabase query below.
 * There is no generated SQL, so the surface is injection-proof.
 */
export default function ReportAssistant() {
  const { profile } = useAuth();
  const { t } = useTranslation();
  const [question, setQuestion] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ReportResult | null>(null);
  const [matchedLabel, setMatchedLabel] = useState<string | null>(null);
  const [notUnderstood, setNotUnderstood] = useState(false);

  const companyId = profile?.company_id ?? '';

  async function runIntent(intentId: ReportIntentId): Promise<ReportResult> {
    switch (intentId) {
      case 'stock_overview': {
        const { data } = await supabase
          .from('stock')
          .select('quantity, depots(name)')
          .eq('company_id', companyId)
          .gt('quantity', 0);
        const byDepot = new Map<string, number>();
        for (const r of (data ?? []) as Array<{ quantity: number; depots: { name?: string } | null }>) {
          const name = r.depots?.name ?? '—';
          byDepot.set(name, (byDepot.get(name) ?? 0) + (r.quantity ?? 0));
        }
        return {
          columns: [t('company.reportAssistant.cols.depot'), t('company.reportAssistant.cols.quantity')],
          rows: [...byDepot.entries()].sort((a, b) => b[1] - a[1]),
        };
      }

      case 'damaged_stock': {
        const { data } = await supabase
          .from('stock')
          .select('quantity, condition, depots(name), category_products(name)')
          .eq('company_id', companyId)
          .gt('quantity', 0);
        const rows = ((data ?? []) as Array<{ quantity: number; condition: string; depots: { name?: string } | null; category_products: { name?: string } | null }>)
          .filter((r) => isDamageLike(r.condition as StockCondition))
          .map((r) => [r.depots?.name ?? '—', r.category_products?.name ?? '—', r.quantity ?? 0] as (string | number)[])
          .sort((a, b) => Number(b[2]) - Number(a[2]));
        return {
          columns: [t('company.reportAssistant.cols.depot'), t('company.reportAssistant.cols.product'), t('company.reportAssistant.cols.quantity')],
          rows,
        };
      }

      case 'stock_runout': {
        const since = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();
        const [stockRes, mvRes, depotRes, catRes] = await Promise.all([
          supabase.from('stock').select('id, company_id, depot_id, category_id, category_product_id, quantity, condition, updated_at, created_at').eq('company_id', companyId).gt('quantity', 0),
          supabase.from('stock_movements').select('depot_id, category_id, category_product_id, movement_type, quantity, created_at').eq('company_id', companyId).gte('created_at', since).limit(10000),
          supabase.from('depots').select('id, name').eq('company_id', companyId),
          supabase.from('product_categories').select('id, name').eq('company_id', companyId),
        ]);
        const depotName = new Map<string, string>(((depotRes.data ?? []) as Array<{ id: string; name: string }>).map((d) => [d.id, d.name]));
        const catName = new Map<string, string>(((catRes.data ?? []) as Array<{ id: string; name: string }>).map((c) => [c.id, c.name]));
        const forecasts = forecastStockRunouts((stockRes.data ?? []) as StockType[], (mvRes.data ?? []) as StockMovement[], { asOf: new Date().toISOString() })
          .filter((f) => f.severity === 'critical' || f.severity === 'warning');
        return {
          columns: [t('company.reportAssistant.cols.depot'), t('company.reportAssistant.cols.category'), t('company.reportAssistant.cols.daysLeft'), t('company.reportAssistant.cols.quantity')],
          rows: forecasts.map((f) => [depotName.get(f.depot_id) ?? '—', catName.get(f.category_id) ?? '—', f.daysToRunout ?? '—', f.currentQuantity]),
        };
      }

      case 'unpaid_invoices':
      case 'overdue_invoices': {
        const statuses = intentId === 'overdue_invoices' ? ['overdue'] : ['sent', 'partial', 'overdue'];
        const { data } = await supabase
          .from('acc_invoices')
          .select('invoice_number, total, currency, due_date, status, acc_contacts(name)')
          .eq('company_id', companyId)
          .in('status', statuses)
          .order('due_date', { ascending: true, nullsFirst: false });
        const rows = ((data ?? []) as Array<{ invoice_number: string; total: number; currency: string; due_date: string | null; status: string; acc_contacts: { name?: string } | null }>)
          .map((r) => [
            r.invoice_number ?? '—',
            r.acc_contacts?.name ?? '—',
            `${Number(r.total ?? 0).toFixed(2)} ${r.currency ?? ''}`.trim(),
            r.due_date ?? '—',
          ] as (string | number)[]);
        return {
          columns: [
            t('company.reportAssistant.cols.invoice'),
            t('company.reportAssistant.cols.partner'),
            t('company.reportAssistant.cols.amount'),
            t('company.reportAssistant.cols.dueDate'),
          ],
          rows,
        };
      }

      case 'pallet_debtors': {
        const { data } = await supabase
          .from('pallet_accounts')
          .select('current_balance, pallet_type, acc_contacts(name)')
          .eq('company_id', companyId)
          .gt('current_balance', 0)
          .order('current_balance', { ascending: false });
        const rows = ((data ?? []) as Array<{ current_balance: number; pallet_type: string; acc_contacts: { name?: string } | null }>)
          .map((r) => [r.acc_contacts?.name ?? '—', r.pallet_type ?? '—', r.current_balance ?? 0] as (string | number)[]);
        return {
          columns: [t('company.reportAssistant.cols.partner'), t('company.reportAssistant.cols.palletType'), t('company.reportAssistant.cols.balance')],
          rows,
        };
      }

      case 'overdue_deliveries': {
        const nowIso = new Date().toISOString();
        const { data } = await supabase
          .from('delivery_notes')
          .select('note_number, type, partner_name, scheduled_delivery_at, scheduled_pickup_at')
          .eq('company_id', companyId)
          .in('status', ['sent', 'in_transit', 'pending_company_review', 'pending_stock_confirmation', 'delivered'])
          .or(`and(type.eq.delivery,scheduled_delivery_at.lt.${nowIso}),and(type.eq.pickup,scheduled_pickup_at.lt.${nowIso})`)
          .limit(200);
        const rows = ((data ?? []) as Array<{ note_number: string; type: string; partner_name: string; scheduled_delivery_at: string | null; scheduled_pickup_at: string | null }>)
          .map((r) => {
            const sched = r.type === 'pickup' ? r.scheduled_pickup_at : r.scheduled_delivery_at;
            const days = sched ? Math.floor((Date.parse(nowIso) - Date.parse(sched)) / 86_400_000) : 0;
            return [r.note_number ?? '—', r.partner_name || '—', sched ? sched.slice(0, 10) : '—', days] as (string | number)[];
          })
          .sort((a, b) => Number(b[3]) - Number(a[3]));
        return {
          columns: [t('company.reportAssistant.cols.note'), t('company.reportAssistant.cols.partner'), t('company.reportAssistant.cols.scheduled'), t('company.reportAssistant.cols.overdueBy')],
          rows,
        };
      }

      case 'top_partners': {
        const { data } = await supabase
          .from('delivery_notes')
          .select('partner_name, pallets_delivered')
          .eq('company_id', companyId)
          .not('partner_name', 'is', null)
          .limit(5000);
        const agg = new Map<string, { notes: number; pallets: number }>();
        for (const r of (data ?? []) as Array<{ partner_name: string; pallets_delivered: number | null }>) {
          const name = r.partner_name || '—';
          const cur = agg.get(name) ?? { notes: 0, pallets: 0 };
          cur.notes += 1;
          cur.pallets += r.pallets_delivered ?? 0;
          agg.set(name, cur);
        }
        const rows = [...agg.entries()]
          .map(([name, v]) => [name, v.notes, v.pallets] as (string | number)[])
          .sort((a, b) => Number(b[2]) - Number(a[2]) || Number(b[1]) - Number(a[1]));
        return {
          columns: [t('company.reportAssistant.cols.partner'), t('company.reportAssistant.cols.deliveries'), t('company.reportAssistant.cols.quantity')],
          rows,
        };
      }
    }
  }

  async function ask(qOverride?: string) {
    const q = (qOverride ?? question).trim();
    if (!q || !companyId) return;
    if (qOverride) setQuestion(qOverride);
    const match = matchReportIntent(q);
    setResult(null);
    setMatchedLabel(null);
    setNotUnderstood(false);
    if (!match) {
      setNotUnderstood(true);
      return;
    }
    setLoading(true);
    try {
      const intent = REPORT_INTENTS.find((i) => i.id === match.intentId)!;
      setMatchedLabel(t(intent.labelKey));
      setResult(await runIntent(match.intentId));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-4 space-y-3">
      <div className="flex items-center gap-2">
        <Sparkles className="w-5 h-5 text-teal-600" />
        <h2 className="text-sm font-semibold text-slate-900">{t('company.reportAssistant.title')}</h2>
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          void ask();
        }}
        className="flex items-center gap-2 border border-slate-200 rounded-lg px-3 py-2"
      >
        <Search className="w-4 h-4 text-slate-400 flex-shrink-0" />
        <input
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder={t('company.reportAssistant.placeholder')}
          className="flex-1 text-sm outline-none"
        />
        <button type="submit" className="text-sm font-medium text-white bg-teal-600 hover:bg-teal-700 rounded-md px-3 py-1">
          {t('company.reportAssistant.ask')}
        </button>
      </form>

      <div className="flex flex-wrap gap-1.5">
        {REPORT_INTENTS.map((intent) => (
          <button
            key={intent.id}
            type="button"
            onClick={() => void ask(intent.keywords[0])}
            className="text-[11px] px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 hover:bg-slate-200"
          >
            {t(intent.labelKey)}
          </button>
        ))}
      </div>

      {loading && <div className="text-sm text-slate-500">{t('company.reportAssistant.loading')}</div>}

      {notUnderstood && (
        <div className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-3">
          {t('company.reportAssistant.notUnderstood')}
        </div>
      )}

      {!loading && result && (
        <div>
          {matchedLabel && (
            <div className="text-xs text-slate-500 mb-2">
              {t('company.reportAssistant.showing')}: <span className="font-medium text-slate-700">{matchedLabel}</span>
            </div>
          )}
          {result.rows.length === 0 ? (
            <div className="text-sm text-slate-500">{t('company.reportAssistant.noResults')}</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-slate-500 border-b border-slate-200">
                    {result.columns.map((c) => (
                      <th key={c} className="py-1.5 pr-4 font-medium">{c}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {result.rows.slice(0, 50).map((row, i) => (
                    <tr key={i} className="border-b border-slate-50">
                      {row.map((cell, j) => (
                        <td key={j} className="py-1.5 pr-4 text-slate-700">{cell}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
