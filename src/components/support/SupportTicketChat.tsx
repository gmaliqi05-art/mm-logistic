import { useState, useEffect, useRef } from 'react';
import {
  ArrowLeft,
  Send,
  Loader2,
  User,
  Bot,
  CheckCircle,
  AlertCircle,
  Shield,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { useTranslation } from '../../i18n';

interface TicketInfo {
  id: string;
  user_id: string;
  subject: string;
  status: string;
  created_at: string;
  user?: { full_name: string; email: string; role: string };
  company?: { name: string } | null;
}

interface Message {
  id: string;
  sender_type: 'user' | 'auto' | 'admin';
  sender_id: string | null;
  message: string;
  created_at: string;
  sender?: { full_name: string } | null;
}

export default function SupportTicketChat({
  ticket,
  onBack,
  onStatusChange,
}: {
  ticket: TicketInfo;
  onBack: () => void;
  onStatusChange: (status: string) => void;
}) {
  const { profile } = useAuth();
  const { t } = useTranslation();
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetchMessages();
  }, [ticket.id]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  async function fetchMessages() {
    setLoading(true);
    const { data } = await supabase
      .from('support_messages')
      .select('*, sender:profiles!support_messages_sender_id_fkey(full_name)')
      .eq('ticket_id', ticket.id)
      .order('created_at', { ascending: true });
    setMessages(data ?? []);
    setLoading(false);
  }

  async function sendAdminReply() {
    if (!newMessage.trim() || sending) return;
    const text = newMessage.trim();
    setNewMessage('');
    setSending(true);

    try {
      const { data: msg } = await supabase
        .from('support_messages')
        .insert({
          ticket_id: ticket.id,
          sender_type: 'admin',
          sender_id: profile!.id,
          message: text,
        })
        .select('*, sender:profiles!support_messages_sender_id_fkey(full_name)')
        .single();

      if (msg) setMessages((prev) => [...prev, msg]);

      if (ticket.status === 'open') {
        await supabase
          .from('support_tickets')
          .update({ status: 'in_progress', updated_at: new Date().toISOString() })
          .eq('id', ticket.id);
        onStatusChange('in_progress');
      }
    } catch (err) {
      console.error(err);
    } finally {
      setSending(false);
    }
  }

  async function updateStatus(newStatus: string) {
    await supabase
      .from('support_tickets')
      .update({ status: newStatus, updated_at: new Date().toISOString() })
      .eq('id', ticket.id);
    onStatusChange(newStatus);
  }

  function formatTime(dateStr: string) {
    const d = new Date(dateStr);
    return d.toLocaleString(undefined, {
      day: '2-digit',
      month: '2-digit',
      year: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  const statusConfig: Record<string, { label: string; color: string }> = {
    open: { label: t('support.open'), color: 'bg-blue-100 text-blue-700' },
    in_progress: { label: t('support.inProgress'), color: 'bg-amber-100 text-amber-700' },
    resolved: { label: t('support.resolved'), color: 'bg-green-100 text-green-700' },
    closed: { label: t('support.closed'), color: 'bg-gray-100 text-gray-600' },
  };

  const roleLabels: Record<string, string> = {
    company_admin: t('roles.company_admin'),
    depot_worker: t('roles.depot_worker'),
    driver: t('roles.driver'),
  };

  const sc = statusConfig[ticket.status] || statusConfig.open;

  return (
    <div className="h-[calc(100vh-8rem)] flex flex-col">
      <div className="flex items-center gap-4 mb-4">
        <button
          onClick={onBack}
          className="p-2 hover:bg-gray-100 rounded-xl transition-colors"
        >
          <ArrowLeft className="w-5 h-5 text-gray-600" />
        </button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h1 className="text-lg font-bold text-gray-900 truncate">{ticket.subject}</h1>
            <span className={`text-xs px-2.5 py-0.5 rounded-full font-medium ${sc.color}`}>{sc.label}</span>
          </div>
          <div className="flex items-center gap-3 text-xs text-gray-500 mt-0.5">
            <span className="flex items-center gap-1">
              <User className="w-3 h-3" />
              {ticket.user?.full_name} ({ticket.user?.email})
            </span>
            {ticket.user?.role && (
              <span className="bg-gray-100 px-2 py-0.5 rounded-full">{roleLabels[ticket.user.role] || ticket.user.role}</span>
            )}
            {ticket.company?.name && <span>{ticket.company.name}</span>}
          </div>
        </div>

        <div className="flex gap-2">
          {ticket.status !== 'resolved' && (
            <button
              onClick={() => updateStatus('resolved')}
              className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium bg-green-50 text-green-700 rounded-lg hover:bg-green-100 transition-colors"
            >
              <CheckCircle className="w-3.5 h-3.5" />
              {t('support.resolveTicket')}
            </button>
          )}
          {ticket.status === 'resolved' && (
            <button
              onClick={() => updateStatus('open')}
              className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium bg-blue-50 text-blue-700 rounded-lg hover:bg-blue-100 transition-colors"
            >
              <AlertCircle className="w-3.5 h-3.5" />
              {t('support.reopenTicket')}
            </button>
          )}
          {ticket.status !== 'closed' && (
            <button
              onClick={() => updateStatus('closed')}
              className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium bg-gray-100 text-gray-600 rounded-lg hover:bg-gray-200 transition-colors"
            >
              {t('support.closeTicket')}
            </button>
          )}
        </div>
      </div>

      <div className="flex-1 bg-white rounded-xl border border-gray-200 flex flex-col min-h-0 overflow-hidden">
        <div className="flex-1 overflow-y-auto p-4 bg-gray-50/50">
          {loading ? (
            <div className="flex items-center justify-center h-full">
              <Loader2 className="w-6 h-6 animate-spin text-teal-600" />
            </div>
          ) : messages.length === 0 ? (
            <div className="flex items-center justify-center h-full text-center">
              <div>
                <AlertCircle className="w-10 h-10 text-gray-200 mx-auto mb-2" />
                <p className="text-sm text-gray-400">{t('chat.noMessages')}</p>
              </div>
            </div>
          ) : (
            messages.map((msg) => (
              <div
                key={msg.id}
                className={`flex gap-3 mb-4 ${msg.sender_type === 'admin' ? 'flex-row-reverse' : ''}`}
              >
                <div
                  className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 mt-1 ${
                    msg.sender_type === 'user'
                      ? 'bg-gray-200'
                      : msg.sender_type === 'admin'
                      ? 'bg-teal-600'
                      : 'bg-teal-100'
                  }`}
                >
                  {msg.sender_type === 'user' ? (
                    <User className="w-4 h-4 text-gray-600" />
                  ) : msg.sender_type === 'admin' ? (
                    <Shield className="w-4 h-4 text-white" />
                  ) : (
                    <Bot className="w-4 h-4 text-teal-600" />
                  )}
                </div>

                <div className={`max-w-[70%] ${msg.sender_type === 'admin' ? 'text-right' : ''}`}>
                  <div className="flex items-center gap-2 mb-1">
                    <span className={`text-xs font-medium ${
                      msg.sender_type === 'admin' ? 'text-teal-700' : msg.sender_type === 'auto' ? 'text-teal-600' : 'text-gray-600'
                    }`}>
                      {msg.sender_type === 'user' ? ticket.user?.full_name : msg.sender_type === 'admin' ? (msg.sender?.full_name || 'Admin') : t('support.autoReply')}
                    </span>
                    <span className="text-xs text-gray-400">{formatTime(msg.created_at)}</span>
                  </div>
                  <div
                    className={`rounded-2xl px-4 py-3 inline-block text-left ${
                      msg.sender_type === 'admin'
                        ? 'bg-teal-600 text-white rounded-tr-md'
                        : msg.sender_type === 'auto'
                        ? 'bg-teal-50 border border-teal-100 rounded-tl-md'
                        : 'bg-white border border-gray-200 rounded-tl-md shadow-sm'
                    }`}
                  >
                    <p className={`text-sm leading-relaxed ${msg.sender_type === 'admin' ? 'text-white' : 'text-gray-700'}`}>
                      {msg.message}
                    </p>
                  </div>
                </div>
              </div>
            ))
          )}
          <div ref={messagesEndRef} />
        </div>

        {ticket.status !== 'closed' && (
          <div className="p-4 border-t border-gray-100 bg-white">
            <div className="flex items-center gap-2">
              <input
                ref={inputRef}
                type="text"
                value={newMessage}
                onChange={(e) => setNewMessage(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    sendAdminReply();
                  }
                }}
                placeholder={t('support.messagePlaceholder')}
                className="flex-1 px-4 py-3 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent"
              />
              <button
                onClick={sendAdminReply}
                disabled={!newMessage.trim() || sending}
                className="px-4 py-3 bg-teal-600 text-white rounded-xl hover:bg-teal-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                <span className="text-sm font-medium hidden sm:inline">{t('support.sendMessage')}</span>
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
