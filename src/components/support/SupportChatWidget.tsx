import { useState, useEffect, useRef, useCallback } from 'react';
import {
  MessageSquare,
  Send,
  X,
  Loader2,
  User,
  ArrowLeft,
  Headphones,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { useTranslation } from '../../i18n';
import { matchFaq, type FaqEntry } from '../../utils/faqMatcher';
import { logger } from '../../utils/logger';

interface SupportMessage {
  id: string;
  sender_type: 'user' | 'auto' | 'admin';
  message: string;
  created_at: string;
  sender_name?: string;
}

interface Ticket {
  id: string;
  subject: string;
  status: string;
  created_at: string;
}

interface SupportChatWidgetProps {
  externalOpen?: boolean;
  onExternalClose?: () => void;
}

export default function SupportChatWidget({ externalOpen, onExternalClose }: SupportChatWidgetProps = {}) {
  const { profile } = useAuth();
  const { t } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);
  const [view, setView] = useState<'tickets' | 'chat'>('tickets');
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [activeTicket, setActiveTicket] = useState<Ticket | null>(null);
  const [messages, setMessages] = useState<SupportMessage[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [faqs, setFaqs] = useState<FaqEntry[]>([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (externalOpen) {
      setIsOpen(true);
    }
  }, [externalOpen]);

  function handleClose() {
    setIsOpen(false);
    onExternalClose?.();
  }

  useEffect(() => {
    if (isOpen && profile) {
      fetchTickets();
      fetchFaqs();
    }
  }, [isOpen, profile]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  async function fetchTickets() {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('support_tickets')
        .select('*')
        .eq('user_id', profile!.id)
        .order('updated_at', { ascending: false });

      if (error) {
        logger.error('Failed to fetch support tickets:', error);
        setTickets([]);
      } else {
        setTickets(data ?? []);
      }
    } catch (err) {
      logger.error('Unexpected error fetching tickets:', err);
      setTickets([]);
    }
    setLoading(false);
  }

  async function fetchFaqs() {
    try {
      const { data, error } = await supabase
        .from('support_faqs')
        .select('*')
        .eq('is_active', true)
        .order('priority', { ascending: false });

      if (error) {
        logger.error('Failed to fetch FAQs:', error);
        setFaqs([]);
      } else {
        setFaqs(data ?? []);
      }
    } catch (err) {
      logger.error('Unexpected error fetching FAQs:', err);
      setFaqs([]);
    }
  }

  async function fetchMessages(ticketId: string) {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('support_messages')
        .select('*, sender:profiles!support_messages_sender_id_fkey(full_name)')
        .eq('ticket_id', ticketId)
        .order('created_at', { ascending: true });

      if (error) {
        logger.error('Failed to fetch messages:', error);
        setMessages([]);
      } else {
        const mapped: SupportMessage[] = (data ?? []).map((m: any) => ({
          id: m.id,
          sender_type: m.sender_type,
          message: m.message,
          created_at: m.created_at,
          sender_name: m.sender?.full_name,
        }));
        setMessages(mapped);
      }
    } catch (err) {
      logger.error('Unexpected error fetching messages:', err);
      setMessages([]);
    }
    setLoading(false);
  }

  function openTicket(ticket: Ticket) {
    setActiveTicket(ticket);
    setView('chat');
    fetchMessages(ticket.id);
  }

  const sendMessage = useCallback(async () => {
    if (!newMessage.trim() || sending) return;
    const text = newMessage.trim();
    setNewMessage('');

    setSending(true);
    try {
      let ticketId = activeTicket?.id;

      if (!ticketId) {
        const subject = text.length > 60 ? text.slice(0, 57) + '...' : text;
        const { data: newTicket, error: tErr } = await supabase
          .from('support_tickets')
          .insert({ user_id: profile!.id, subject, status: 'open' })
          .select()
          .single();

        if (tErr) throw tErr;
        ticketId = newTicket.id;
        setActiveTicket(newTicket);
      }

      const userMsg: SupportMessage = {
        id: `temp-${Date.now()}`,
        sender_type: 'user',
        message: text,
        created_at: new Date().toISOString(),
        sender_name: profile!.full_name,
      };
      setMessages((prev) => [...prev, userMsg]);

      await supabase.from('support_messages').insert({
        ticket_id: ticketId,
        sender_type: 'user',
        sender_id: profile!.id,
        message: text,
      });

      const matched = matchFaq(text, faqs);
      if (matched) {
        const autoMsg: SupportMessage = {
          id: `auto-${Date.now()}`,
          sender_type: 'auto',
          message: matched.answer,
          created_at: new Date().toISOString(),
        };

        await new Promise((r) => setTimeout(r, 800));
        setMessages((prev) => [...prev, autoMsg]);

        await supabase.from('support_messages').insert({
          ticket_id: ticketId,
          sender_type: 'auto',
          message: matched.answer,
          faq_id: matched.id,
        });
      } else {
        const fallbackMsg: SupportMessage = {
          id: `auto-fallback-${Date.now()}`,
          sender_type: 'auto',
          message: t('support.noMatchReply'),
          created_at: new Date().toISOString(),
        };

        await new Promise((r) => setTimeout(r, 800));
        setMessages((prev) => [...prev, fallbackMsg]);

        await supabase.from('support_messages').insert({
          ticket_id: ticketId,
          sender_type: 'auto',
          message: fallbackMsg.message,
        });
      }

      fetchTickets();
    } catch (err) {
      logger.error('Failed to create support ticket', err);
    } finally {
      setSending(false);
    }
  }, [newMessage, sending, activeTicket, profile, faqs]);

  function startNewChat() {
    setActiveTicket(null);
    setMessages([]);
    setView('chat');
    setTimeout(() => inputRef.current?.focus(), 100);
  }

  function goBack() {
    setView('tickets');
    setActiveTicket(null);
    setMessages([]);
  }

  function formatTime(dateStr: string) {
    const d = new Date(dateStr);
    const now = new Date();
    const isToday = d.toDateString() === now.toDateString();
    if (isToday) return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
    return d.toLocaleDateString(undefined, { day: '2-digit', month: '2-digit', year: '2-digit' });
  }

  const statusLabels: Record<string, { label: string; color: string }> = {
    open: { label: t('support.open'), color: 'bg-blue-100 text-blue-700' },
    in_progress: { label: t('support.inProgress'), color: 'bg-amber-100 text-amber-700' },
    resolved: { label: t('support.resolved'), color: 'bg-green-100 text-green-700' },
    closed: { label: t('support.closed'), color: 'bg-gray-100 text-gray-600' },
  };

  if (!profile || profile.role === 'super_admin') return null;
  if (!isOpen) return null;

  return (
    <div className="fixed bottom-6 right-6 z-50 w-[380px] max-w-[calc(100vw-2rem)] h-[560px] max-h-[calc(100vh-8rem)] bg-white rounded-2xl shadow-2xl border border-gray-200 flex flex-col overflow-hidden animate-in">
          <div className="bg-teal-700 px-4 py-3 flex items-center gap-3">
            {view === 'chat' && (
              <button onClick={goBack} className="p-1 hover:bg-teal-600 rounded-lg transition-colors">
                <ArrowLeft className="w-5 h-5 text-white" />
              </button>
            )}
            <div className="flex items-center gap-2.5 flex-1">
              <div className="relative">
                <div className="w-9 h-9 rounded-full bg-teal-500/40 flex items-center justify-center">
                  <Headphones className="w-4.5 h-4.5 text-white" />
                </div>
                <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-green-400 rounded-full border-2 border-teal-700" />
              </div>
              <div>
                <p className="text-white text-sm font-semibold">
                  {view === 'chat' ? t('support.title') : t('support.widgetTitle')}
                </p>
                <p className="text-teal-200 text-xs flex items-center gap-1">
                  <span className="w-1.5 h-1.5 bg-green-400 rounded-full inline-block" />
                  {t('chat.online')}
                </p>
              </div>
            </div>
            <button onClick={handleClose} className="p-1 hover:bg-teal-600 rounded-lg transition-colors">
              <X className="w-5 h-5 text-white" />
            </button>
          </div>

          {view === 'tickets' && (
            <div className="flex-1 flex flex-col min-h-0">
              <div className="p-3 border-b border-gray-100">
                <button
                  onClick={startNewChat}
                  className="w-full flex items-center gap-3 px-4 py-3.5 bg-teal-50 rounded-xl hover:bg-teal-100 transition-colors text-left"
                >
                  <div className="w-10 h-10 rounded-full bg-teal-600 flex items-center justify-center flex-shrink-0">
                    <MessageSquare className="w-5 h-5 text-white" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-teal-800">{t('support.newTicket')}</p>
                    <p className="text-xs text-teal-600">{t('support.createFirst')}</p>
                  </div>
                </button>
              </div>

              {tickets.length > 0 && (
                <div className="px-3 pt-3 pb-1">
                  <p className="text-xs font-medium text-gray-400 uppercase tracking-wider">{t('support.yourTickets')}</p>
                </div>
              )}

              <div className="flex-1 overflow-y-auto">
                {loading ? (
                  <div className="flex items-center justify-center h-32">
                    <Loader2 className="w-5 h-5 animate-spin text-teal-600" />
                  </div>
                ) : tickets.length === 0 ? (
                  <div className="p-8 text-center">
                    <div className="w-14 h-14 rounded-full bg-teal-50 flex items-center justify-center mx-auto mb-3">
                      <Headphones className="w-7 h-7 text-teal-300" />
                    </div>
                    <p className="text-sm font-medium text-gray-500">{t('support.noTickets')}</p>
                    <p className="text-xs text-gray-400 mt-1 leading-relaxed">{t('support.createFirst')}</p>
                  </div>
                ) : (
                  <div className="divide-y divide-gray-50">
                    {tickets.map((ticket) => {
                      const s = statusLabels[ticket.status] || statusLabels.open;
                      return (
                        <button
                          key={ticket.id}
                          onClick={() => openTicket(ticket)}
                          className="w-full flex items-center gap-3 px-4 py-3 hover:bg-gray-50 transition-colors text-left"
                        >
                          <div className="w-9 h-9 rounded-full bg-teal-100 flex items-center justify-center flex-shrink-0">
                            <MessageSquare className="w-4 h-4 text-teal-600" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-gray-900 truncate">{ticket.subject}</p>
                            <div className="flex items-center gap-2 mt-0.5">
                              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${s.color}`}>{s.label}</span>
                              <span className="text-xs text-gray-400">{formatTime(ticket.created_at)}</span>
                            </div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          )}

          {view === 'chat' && (
            <>
              <div className="flex-1 overflow-y-auto p-3 bg-gray-50/50">
                {loading ? (
                  <div className="flex items-center justify-center h-full">
                    <Loader2 className="w-5 h-5 animate-spin text-teal-600" />
                  </div>
                ) : (
                  <>
                    {messages.length === 0 && !activeTicket && (
                      <div className="flex gap-2 mb-3">
                        <div className="w-7 h-7 rounded-full bg-teal-100 flex items-center justify-center flex-shrink-0 mt-1">
                          <Headphones className="w-3.5 h-3.5 text-teal-600" />
                        </div>
                        <div className="bg-white rounded-2xl rounded-tl-md px-4 py-3 shadow-sm border border-gray-100 max-w-[85%]">
                          <p className="text-sm text-gray-700 leading-relaxed">
                            {t('support.widgetTitle')}
                          </p>
                        </div>
                      </div>
                    )}

                    {messages.map((msg) => (
                      <div
                        key={msg.id}
                        className={`flex gap-2 mb-3 ${msg.sender_type === 'user' ? 'flex-row-reverse' : ''}`}
                      >
                        <div
                          className={`w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 mt-1 ${
                            msg.sender_type === 'user' ? 'bg-teal-600' : msg.sender_type === 'admin' ? 'bg-blue-500' : 'bg-teal-100'
                          }`}
                        >
                          {msg.sender_type === 'user' ? (
                            <User className="w-3.5 h-3.5 text-white" />
                          ) : (
                            <Headphones className={`w-3.5 h-3.5 ${msg.sender_type === 'admin' ? 'text-white' : 'text-teal-600'}`} />
                          )}
                        </div>
                        <div
                          className={`rounded-2xl px-4 py-3 max-w-[85%] ${
                            msg.sender_type === 'user'
                              ? 'bg-teal-600 text-white rounded-tr-md'
                              : msg.sender_type === 'admin'
                              ? 'bg-blue-50 border border-blue-100 rounded-tl-md'
                              : 'bg-white shadow-sm border border-gray-100 rounded-tl-md'
                          }`}
                        >
                          {msg.sender_type === 'admin' && msg.sender_name && (
                            <p className="text-xs font-medium text-blue-600 mb-1">{msg.sender_name}</p>
                          )}
                          <p className={`text-sm leading-relaxed ${msg.sender_type === 'user' ? 'text-white' : 'text-gray-700'}`}>
                            {msg.message}
                          </p>
                          <p className={`text-xs mt-1.5 ${msg.sender_type === 'user' ? 'text-teal-200' : 'text-gray-400'}`}>
                            {formatTime(msg.created_at)}
                          </p>
                        </div>
                      </div>
                    ))}

                    {sending && (
                      <div className="flex gap-2 mb-3">
                        <div className="w-7 h-7 rounded-full bg-teal-100 flex items-center justify-center flex-shrink-0 mt-1">
                          <Headphones className="w-3.5 h-3.5 text-teal-600" />
                        </div>
                        <div className="bg-white rounded-2xl rounded-tl-md px-4 py-3 shadow-sm border border-gray-100">
                          <p className="text-xs text-gray-400 mb-1.5">{t('common.processing')}</p>
                          <div className="flex gap-1.5">
                            <div className="w-2 h-2 rounded-full bg-teal-400 animate-bounce" style={{ animationDelay: '0ms' }} />
                            <div className="w-2 h-2 rounded-full bg-teal-400 animate-bounce" style={{ animationDelay: '150ms' }} />
                            <div className="w-2 h-2 rounded-full bg-teal-400 animate-bounce" style={{ animationDelay: '300ms' }} />
                          </div>
                        </div>
                      </div>
                    )}
                    <div ref={messagesEndRef} />
                  </>
                )}
              </div>

              <div className="p-3 border-t border-gray-100 bg-white">
                <div className="flex items-center gap-2">
                  <input
                    ref={inputRef}
                    type="text"
                    value={newMessage}
                    onChange={(e) => setNewMessage(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        sendMessage();
                      }
                    }}
                    placeholder={t('support.messagePlaceholder')}
                    className="flex-1 px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                  />
                  <button
                    onClick={sendMessage}
                    disabled={!newMessage.trim() || sending}
                    className="p-2.5 bg-teal-600 text-white rounded-xl hover:bg-teal-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <Send className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </>
          )}
    </div>
  );
}
