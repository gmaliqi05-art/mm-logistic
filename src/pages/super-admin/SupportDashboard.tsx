import { useState, useEffect } from 'react';
import {
  MessageSquare,
  Search,
  Loader2,
  HelpCircle,
  AlertCircle,
  CheckCircle,
  Clock,
  User,
  ChevronRight,
  Filter,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useTranslation } from '../../i18n';
import SupportTicketChat from '../../components/support/SupportTicketChat';
import SupportFaqManager from '../../components/support/SupportFaqManager';

interface TicketWithUser {
  id: string;
  user_id: string;
  subject: string;
  status: string;
  created_at: string;
  updated_at: string;
  user?: { full_name: string; email: string; role: string; company_id: string | null };
  company?: { name: string } | null;
  message_count: number;
}

export default function SupportDashboard() {
  const { t } = useTranslation();

  const statusConfig: Record<string, { label: string; color: string; icon: typeof Clock }> = {
    open: { label: t('support.open'), color: 'bg-blue-100 text-blue-700', icon: AlertCircle },
    in_progress: { label: t('support.inProgress'), color: 'bg-amber-100 text-amber-700', icon: Clock },
    resolved: { label: t('support.resolved'), color: 'bg-green-100 text-green-700', icon: CheckCircle },
    closed: { label: t('support.closed'), color: 'bg-gray-100 text-gray-600', icon: CheckCircle },
  };

  const roleLabels: Record<string, string> = {
    company_admin: t('roles.company_admin'),
    depot_worker: t('roles.depot_worker'),
    driver: t('roles.driver'),
  };

  const [tab, setTab] = useState<'tickets' | 'faq'>('tickets');
  const [tickets, setTickets] = useState<TicketWithUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [selectedTicket, setSelectedTicket] = useState<TicketWithUser | null>(null);
  const [stats, setStats] = useState({ open: 0, in_progress: 0, resolved: 0, total: 0 });

  useEffect(() => {
    fetchTickets();
  }, []);

  async function fetchTickets() {
    setLoading(true);

    const { data: ticketsData } = await supabase
      .from('support_tickets')
      .select('*, user:profiles!support_tickets_user_id_fkey(full_name, email, role, company_id)')
      .order('updated_at', { ascending: false });

    const enriched: TicketWithUser[] = [];

    for (const ticket of ticketsData ?? []) {
      const { count } = await supabase
        .from('support_messages')
        .select('*', { count: 'exact', head: true })
        .eq('ticket_id', ticket.id);

      let company = null;
      if (ticket.user?.company_id) {
        const { data: c } = await supabase
          .from('companies')
          .select('name')
          .eq('id', ticket.user.company_id)
          .maybeSingle();
        company = c;
      }

      enriched.push({
        ...ticket,
        message_count: count ?? 0,
        company,
      });
    }

    setTickets(enriched);
    setStats({
      open: enriched.filter((t) => t.status === 'open').length,
      in_progress: enriched.filter((t) => t.status === 'in_progress').length,
      resolved: enriched.filter((t) => t.status === 'resolved').length,
      total: enriched.length,
    });
    setLoading(false);
  }

  const filteredTickets = tickets.filter((ticket) => {
    const matchesStatus = statusFilter === 'all' || ticket.status === statusFilter;
    const matchesSearch =
      !search ||
      ticket.subject.toLowerCase().includes(search.toLowerCase()) ||
      ticket.user?.full_name?.toLowerCase().includes(search.toLowerCase()) ||
      ticket.user?.email?.toLowerCase().includes(search.toLowerCase());
    return matchesStatus && matchesSearch;
  });

  function formatTime(dateStr: string) {
    const d = new Date(dateStr);
    const now = new Date();
    const diff = now.getTime() - d.getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return t('common.now');
    if (mins < 60) return `${mins}m ${t('common.ago')}`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ${t('common.ago')}`;
    return d.toLocaleDateString(undefined, { day: '2-digit', month: '2-digit', year: '2-digit' });
  }

  if (selectedTicket) {
    return (
      <SupportTicketChat
        ticket={selectedTicket}
        onBack={() => {
          setSelectedTicket(null);
          fetchTickets();
        }}
        onStatusChange={(newStatus) => {
          setSelectedTicket((prev) => (prev ? { ...prev, status: newStatus } : null));
          fetchTickets();
        }}
      />
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{t('superAdmin.support.title')}</h1>
          <p className="text-gray-500 mt-1">{t('superAdmin.support.subtitle')}</p>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {[
          { label: t('superAdmin.support.totalTickets'), value: stats.total, color: 'bg-gray-50 border-gray-200', text: 'text-gray-900' },
          { label: t('superAdmin.support.openTickets'), value: stats.open, color: 'bg-blue-50 border-blue-200', text: 'text-blue-700' },
          { label: t('superAdmin.support.inProgress'), value: stats.in_progress, color: 'bg-amber-50 border-amber-200', text: 'text-amber-700' },
          { label: t('superAdmin.support.resolved'), value: stats.resolved, color: 'bg-green-50 border-green-200', text: 'text-green-700' },
        ].map((s) => (
          <div key={s.label} className={`${s.color} border rounded-xl p-4`}>
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">{s.label}</p>
            <p className={`text-2xl font-bold mt-1 ${s.text}`}>{s.value}</p>
          </div>
        ))}
      </div>

      <div className="flex gap-1 mb-6 bg-gray-100 rounded-xl p-1">
        <button
          onClick={() => setTab('tickets')}
          className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-colors ${
            tab === 'tickets' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          <MessageSquare className="w-4 h-4" />
          {t('superAdmin.support.tickets')} ({stats.total})
        </button>
        <button
          onClick={() => setTab('faq')}
          className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-colors ${
            tab === 'faq' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          <HelpCircle className="w-4 h-4" />
          {t('superAdmin.support.faqs')}
        </button>
      </div>

      {tab === 'tickets' && (
        <>
          <div className="flex flex-col sm:flex-row gap-3 mb-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                placeholder={t('superAdmin.support.searchPlaceholder')}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent"
              />
            </div>
            <div className="relative">
              <Filter className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="pl-10 pr-8 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent appearance-none bg-white"
              >
                <option value="all">{t('common.all')}</option>
                <option value="open">{t('support.open')}</option>
                <option value="in_progress">{t('support.inProgress')}</option>
                <option value="resolved">{t('support.resolved')}</option>
                <option value="closed">{t('support.closed')}</option>
              </select>
            </div>
          </div>

          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            {loading ? (
              <div className="flex items-center justify-center h-48">
                <Loader2 className="w-6 h-6 animate-spin text-teal-600" />
              </div>
            ) : filteredTickets.length === 0 ? (
              <div className="p-12 text-center">
                <MessageSquare className="w-10 h-10 text-gray-200 mx-auto mb-3" />
                <p className="text-gray-400 text-sm">{t('superAdmin.support.noTickets')}</p>
              </div>
            ) : (
              <div className="divide-y divide-gray-100">
                {filteredTickets.map((ticket) => {
                  const sc = statusConfig[ticket.status] || statusConfig.open;
                  const StatusIcon = sc.icon;
                  return (
                    <button
                      key={ticket.id}
                      onClick={() => setSelectedTicket(ticket)}
                      className="w-full flex items-center gap-4 p-4 hover:bg-gray-50 transition-colors text-left"
                    >
                      <div className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 ${
                        ticket.status === 'open' ? 'bg-blue-100' : ticket.status === 'in_progress' ? 'bg-amber-100' : 'bg-green-100'
                      }`}>
                        <StatusIcon className={`w-5 h-5 ${
                          ticket.status === 'open' ? 'text-blue-600' : ticket.status === 'in_progress' ? 'text-amber-600' : 'text-green-600'
                        }`} />
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-0.5">
                          <p className="text-sm font-semibold text-gray-900 truncate">{ticket.subject}</p>
                          <span className={`text-xs px-2 py-0.5 rounded-full font-medium flex-shrink-0 ${sc.color}`}>{sc.label}</span>
                        </div>
                        <div className="flex items-center gap-3 text-xs text-gray-500">
                          <span className="flex items-center gap-1">
                            <User className="w-3 h-3" />
                            {ticket.user?.full_name}
                          </span>
                          {ticket.user?.role && (
                            <span className="bg-gray-100 px-2 py-0.5 rounded-full">{roleLabels[ticket.user.role] || ticket.user.role}</span>
                          )}
                          {ticket.company?.name && (
                            <span className="truncate max-w-[120px]">{ticket.company.name}</span>
                          )}
                          <span>{ticket.message_count} {t('common.messages')}</span>
                        </div>
                      </div>

                      <div className="text-right flex-shrink-0">
                        <p className="text-xs text-gray-400">{formatTime(ticket.updated_at)}</p>
                        <ChevronRight className="w-4 h-4 text-gray-300 mt-1 ml-auto" />
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </>
      )}

      {tab === 'faq' && <SupportFaqManager />}
    </div>
  );
}
