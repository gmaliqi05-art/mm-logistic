import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  FileSearch,
  ShoppingCart,
  Receipt,
  Briefcase,
  FileText,
  Truck,
  PackageCheck,
  CheckCircle2,
  Clock,
  AlertTriangle,
  ArrowRight,
  Loader2,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { useTranslation } from '../../i18n';

type ScanKind = 'purchase' | 'expense' | 'investment' | 'sale' | 'delivery_out' | 'delivery_in' | 'unknown';

interface ScanRow {
  id: string;
  status: string;
  detected_type: string | null;
  chosen_type: string | null;
  extracted_json: Record<string, unknown> | null;
  linked_entity_type: string | null;
  linked_entity_id: string | null;
  created_at: string;
  uploader?: { full_name: string | null } | null;
}

interface Props {
  role: 'company_admin' | 'accountant';
  refreshKey?: number;
}

const COMPANY_KINDS: ScanKind[] = ['delivery_out', 'delivery_in', 'purchase'];

const KIND_VISUAL: Record<ScanKind, { icon: typeof FileText; bg: string; color: string; key: string }> = {
  purchase: { icon: ShoppingCart, bg: 'bg-teal-100', color: 'text-teal-600', key: 'companyAdmin.scanner.kindPurchase' },
  expense: { icon: Receipt, bg: 'bg-amber-100', color: 'text-amber-600', key: 'companyAdmin.scanner.kindExpense' },
  investment: { icon: Briefcase, bg: 'bg-slate-100', color: 'text-slate-600', key: 'companyAdmin.scanner.kindInvestment' },
  sale: { icon: FileText, bg: 'bg-emerald-100', color: 'text-emerald-600', key: 'companyAdmin.scanner.kindSale' },
  delivery_out: { icon: Truck, bg: 'bg-emerald-100', color: 'text-emerald-600', key: 'companyAdmin.scanner.kindDeliveryOut' },
  delivery_in: { icon: PackageCheck, bg: 'bg-blue-100', color: 'text-blue-600', key: 'companyAdmin.scanner.kindDeliveryIn' },
  unknown: { icon: FileText, bg: 'bg-gray-100', color: 'text-gray-500', key: 'companyAdmin.scanner.kindUnknown' },
};

function destinationFor(kind: ScanKind, role: 'company_admin' | 'accountant'): string | null {
  if (role === 'company_admin') {
    if (kind === 'delivery_out' || kind === 'delivery_in') return '/company/delivery-notes';
    return null;
  }
  switch (kind) {
    case 'purchase': return '/accounting/purchases';
    case 'expense': return '/accounting/transactions';
    case 'investment': return '/accounting/assets';
    case 'sale': return '/accounting/invoices';
    case 'delivery_out':
    case 'delivery_in': return '/accounting/deliveries';
    default: return '/accounting/scans';
  }
}

export default function PendingScansPanel({ role, refreshKey = 0 }: Props) {
  const { profile } = useAuth();
  const { t } = useTranslation();
  const [rows, setRows] = useState<ScanRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!profile?.company_id) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      const since = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString();
      const { data } = await supabase
        .from('acc_scanned_documents')
        .select('id, status, detected_type, chosen_type, extracted_json, linked_entity_type, linked_entity_id, created_at, uploader:profiles!acc_scanned_documents_uploaded_by_fkey(full_name)')
        .eq('company_id', profile.company_id)
        .in('status', ['uploaded', 'parsed', 'saved'])
        .gte('created_at', since)
        .order('created_at', { ascending: false })
        .limit(8);
      if (cancelled) return;
      let list = (data as ScanRow[] | null) ?? [];
      if (role === 'company_admin') {
        list = list.filter((r) => COMPANY_KINDS.includes((r.chosen_type ?? r.detected_type ?? 'unknown') as ScanKind));
      }
      setRows(list);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [profile?.company_id, role, refreshKey]);

  if (loading) {
    return (
      <div className="bg-white rounded-xl border border-gray-100 p-6 flex items-center justify-center">
        <Loader2 className="w-5 h-5 animate-spin text-teal-600" />
      </div>
    );
  }

  if (rows.length === 0) {
    return null;
  }

  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-100 flex items-center gap-2">
        <FileSearch className="w-4 h-4 text-blue-600" />
        <div className="min-w-0">
          <h2 className="font-semibold text-gray-900 text-sm">{t('companyAdmin.scanner.pendingTitle')}</h2>
          <p className="text-[11px] text-gray-500 truncate">{t('companyAdmin.scanner.pendingSubtitle')}</p>
        </div>
        <span className="ml-auto text-[10px] font-semibold tracking-wide uppercase text-blue-700 bg-blue-50 rounded-full px-2 py-0.5">
          {rows.length}
        </span>
      </div>
      <div className="divide-y divide-gray-50">
        {rows.map((r) => {
          const kind = ((r.chosen_type ?? r.detected_type ?? 'unknown') as ScanKind);
          const visual = KIND_VISUAL[kind] ?? KIND_VISUAL.unknown;
          const Icon = visual.icon;
          const ex = (r.extracted_json ?? {}) as Record<string, unknown>;
          const partyName = (ex.supplier_name as string) || (ex.customer_name as string) || (ex.invoice_number as string) || '-';
          const total = typeof ex.total === 'number' ? ex.total : 0;
          const currency = (ex.currency as string) || 'EUR';
          const dest = destinationFor(kind, role);
          const StatusIcon = r.status === 'saved' ? CheckCircle2 : r.status === 'failed' ? AlertTriangle : Clock;
          const statusKey = r.status === 'saved'
            ? 'companyAdmin.scanner.statusSaved'
            : r.status === 'parsed'
              ? 'companyAdmin.scanner.statusParsed'
              : r.status === 'failed'
                ? 'companyAdmin.scanner.statusFailed'
                : 'companyAdmin.scanner.statusUploaded';
          const statusCls = r.status === 'saved'
            ? 'bg-emerald-50 text-emerald-700'
            : r.status === 'failed'
              ? 'bg-red-50 text-red-700'
              : r.status === 'parsed'
                ? 'bg-amber-50 text-amber-700'
                : 'bg-slate-100 text-slate-600';

          const Inner = (
            <div className="flex items-center gap-3 px-4 py-3">
              <div className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 ${visual.bg}`}>
                <Icon className={`w-4 h-4 ${visual.color}`} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-semibold text-gray-900 truncate">{partyName}</span>
                  <span className="text-[10px] font-medium uppercase tracking-wide text-gray-500 bg-gray-100 rounded px-1.5 py-0.5">
                    {t(visual.key)}
                  </span>
                </div>
                <div className="flex items-center gap-2 mt-0.5 text-[11px] text-gray-500">
                  {total > 0 && <span className="tabular-nums font-medium text-gray-700">{total.toFixed(2)} {currency}</span>}
                  <span className="truncate">
                    {r.uploader?.full_name ? `${t('companyAdmin.scanner.uploadedBy')}: ${r.uploader.full_name}` : ''}
                  </span>
                  <span className="ml-auto whitespace-nowrap">{new Date(r.created_at).toLocaleDateString()}</span>
                </div>
              </div>
              <span className={`hidden sm:inline-flex items-center gap-1 text-[10px] font-medium rounded px-2 py-0.5 ${statusCls}`}>
                <StatusIcon className={`w-3 h-3 ${r.status === 'uploaded' ? 'animate-pulse' : ''}`} />
                {t(statusKey)}
              </span>
              {dest && <ArrowRight className="w-4 h-4 text-gray-300 flex-shrink-0" />}
            </div>
          );

          return dest ? (
            <Link key={r.id} to={dest} className="block hover:bg-blue-50/40 transition-colors">
              {Inner}
            </Link>
          ) : (
            <div key={r.id} className="block">
              {Inner}
            </div>
          );
        })}
      </div>
    </div>
  );
}
