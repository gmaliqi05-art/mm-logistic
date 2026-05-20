import { useState, useEffect } from 'react';
import { Loader2, AlertTriangle, Search, CheckCircle2, XCircle, Clock, Filter, Mail, ChevronDown, ChevronUp } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { useTranslation } from '../../i18n';

interface Delivery {
  id: string;
  recipient_email: string;
  template_code: string;
  subject: string;
  status: string;
  locale: string;
  created_at: string;
  sent_at: string | null;
  error: string | null;
  provider_id: string | null;
}

const STATUS_CONFIG: Record<string, { icon: React.ReactNode; cls: string; label: string }> = {
  sent: { icon: <CheckCircle2 className="w-3.5 h-3.5" />, cls: 'text-emerald-600 bg-emerald-50', label: 'Derguar' },
  failed: { icon: <XCircle className="w-3.5 h-3.5" />, cls: 'text-red-600 bg-red-50', label: 'Deshtuar' },
  queued: { icon: <Clock className="w-3.5 h-3.5" />, cls: 'text-amber-600 bg-amber-50', label: 'Ne radhe' },
  skipped: { icon: <XCircle className="w-3.5 h-3.5" />, cls: 'text-gray-500 bg-gray-50', label: 'Kapercyer' },
};

export default function EmailLog() {
  const { profile } = useAuth();
  const { t } = useTranslation();
  const [deliveries, setDeliveries] = useState<Delivery[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const PAGE_SIZE = 25;

  useEffect(() => {
    if (profile?.company_id) fetchDeliveries();
  }, [profile?.company_id, statusFilter, page]);

  async function fetchDeliveries() {
    setLoading(true);
    let query = supabase
      .from('email_deliveries')
      .select('id, recipient_email, template_code, subject, status, locale, created_at, sent_at, error, provider_id')
      .eq('company_id', profile!.company_id!)
      .order('created_at', { ascending: false })
      .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);

    if (statusFilter !== 'all') {
      query = query.eq('status', statusFilter);
    }

    const { data, error: err } = await query;

    if (err) {
      setError(err.message);
    } else {
      setDeliveries((data ?? []) as Delivery[]);
    }
    setLoading(false);
  }

  const filtered = search.trim()
    ? deliveries.filter(d =>
        `${d.recipient_email} ${d.template_code} ${d.subject}`.toLowerCase().includes(search.toLowerCase())
      )
    : deliveries;

  function formatDate(d: string) {
    return new Date(d).toLocaleString('de-DE', {
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });
  }

  if (loading && deliveries.length === 0) {
    return (
      <div className="flex items-center justify-center h-48">
        <Loader2 className="w-8 h-8 text-teal-600 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700 flex items-center gap-2">
          <AlertTriangle className="w-4 h-4" /> {error}
        </div>
      )}

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full sm:w-64 pl-9 pr-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
              placeholder={t('common.searchPlaceholder')}
            />
          </div>
          <div className="relative">
            <Filter className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <select
              value={statusFilter}
              onChange={(e) => { setStatusFilter(e.target.value); setPage(0); }}
              className="pl-9 pr-3 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-teal-500"
            >
              <option value="all">Te gjitha</option>
              <option value="sent">Te derguara</option>
              <option value="failed">Te deshtuara</option>
              <option value="queued">Ne radhe</option>
            </select>
          </div>
        </div>

        <div className="flex items-center gap-2 text-sm text-gray-500">
          <Mail className="w-4 h-4" />
          <span>{filtered.length} email-e</span>
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="text-center py-16">
          <Mail className="w-12 h-12 mx-auto text-gray-300 mb-3" />
          <p className="text-sm text-gray-500">Nuk ka email te derguara akoma</p>
          <p className="text-xs text-gray-400 mt-1">Email-et qe dergoni klienteve do te shfaqen ketu</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50">
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-600 uppercase">Destinatari</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-600 uppercase">Template</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-600 uppercase">Statusi</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-600 uppercase">Data</th>
                  <th className="px-4 py-3 w-10"></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((d) => {
                  const cfg = STATUS_CONFIG[d.status] ?? STATUS_CONFIG.queued;
                  const isExpanded = expandedId === d.id;

                  return (
                    <tr key={d.id} className="border-b border-gray-50 last:border-0">
                      <td className="px-4 py-3">
                        <span className="text-gray-900 font-medium">{d.recipient_email}</span>
                      </td>
                      <td className="px-4 py-3">
                        <span className="font-mono text-xs text-gray-600 bg-gray-100 px-2 py-0.5 rounded">{d.template_code}</span>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium ${cfg.cls}`}>
                          {cfg.icon} {cfg.label}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-500">{formatDate(d.created_at)}</td>
                      <td className="px-4 py-3">
                        <button
                          onClick={() => setExpandedId(isExpanded ? null : d.id)}
                          className="p-1 text-gray-400 hover:text-gray-600 rounded"
                        >
                          {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Expanded detail */}
          {expandedId && (() => {
            const d = filtered.find(x => x.id === expandedId);
            if (!d) return null;
            return (
              <div className="px-4 py-4 bg-gray-50 border-t border-gray-200">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                  <div>
                    <span className="font-medium text-gray-600">Subject:</span>
                    <span className="ml-2 text-gray-900">{d.subject}</span>
                  </div>
                  <div>
                    <span className="font-medium text-gray-600">Gjuha:</span>
                    <span className="ml-2 text-gray-900">{d.locale?.toUpperCase()}</span>
                  </div>
                  {d.sent_at && (
                    <div>
                      <span className="font-medium text-gray-600">Derguar me:</span>
                      <span className="ml-2 text-gray-900">{formatDate(d.sent_at)}</span>
                    </div>
                  )}
                  {d.provider_id && (
                    <div>
                      <span className="font-medium text-gray-600">Provider ID:</span>
                      <span className="ml-2 font-mono text-gray-700">{d.provider_id}</span>
                    </div>
                  )}
                  {d.error && (
                    <div className="sm:col-span-2">
                      <span className="font-medium text-red-600">Gabimi:</span>
                      <span className="ml-2 text-red-700">{d.error}</span>
                    </div>
                  )}
                </div>
              </div>
            );
          })()}
        </div>
      )}

      {/* Pagination */}
      {deliveries.length >= PAGE_SIZE && (
        <div className="flex items-center justify-center gap-3">
          <button
            onClick={() => setPage(p => Math.max(0, p - 1))}
            disabled={page === 0}
            className="px-3 py-2 text-sm border border-gray-200 rounded-lg disabled:opacity-40 hover:bg-gray-50"
          >
            Para
          </button>
          <span className="text-xs text-gray-500">Faqja {page + 1}</span>
          <button
            onClick={() => setPage(p => p + 1)}
            disabled={deliveries.length < PAGE_SIZE}
            className="px-3 py-2 text-sm border border-gray-200 rounded-lg disabled:opacity-40 hover:bg-gray-50"
          >
            Tjetra
          </button>
        </div>
      )}
    </div>
  );
}
