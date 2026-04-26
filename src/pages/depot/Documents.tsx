import { useState, useEffect } from 'react';
import {
  Inbox,
  Search,
  X,
  Loader2,
  AlertTriangle,
  User,
  Clock,
  Download,
  ArrowLeft,
  AlertCircle,
  CheckCircle2,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { useTranslation } from '../../i18n';
import type { Document, DocumentRecipient } from '../../types';
import DocumentCard, {
  DocumentPreview,
  getStatusConfig,
  getTypeConfig,
  formatFileSize,
} from '../../components/documents/DocumentCard';

export default function DepotDocuments() {
  const { profile } = useAuth();
  const { t } = useTranslation();
  const [docs, setDocs] = useState<(Document & { recipientEntry?: DocumentRecipient })[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('');

  const [selectedDoc, setSelectedDoc] = useState<(Document & { recipientEntry?: DocumentRecipient }) | null>(null);
  const [showDetail, setShowDetail] = useState(false);

  useEffect(() => {
    if (profile?.id) fetchDocs();
  }, [profile?.id]);

  async function fetchDocs() {
    try {
      setLoading(true);
      setError(null);

      const { data, error: err } = await supabase
        .from('document_recipients')
        .select('*, document:documents(*, sender:profiles!documents_sender_id_fkey(id, full_name, avatar_url, email, role))')
        .eq('recipient_id', profile!.id)
        .order('created_at', { ascending: false });

      if (err) throw err;

      const docsData = (data ?? [])
        .filter((r: any) => r.document)
        .map((r: any) => ({
          ...r.document,
          recipientEntry: {
            id: r.id,
            document_id: r.document_id,
            recipient_id: r.recipient_id,
            status: r.status,
            viewed_at: r.viewed_at,
            signed_at: r.signed_at,
            signed_file_url: r.signed_file_url,
            notes: r.notes,
            created_at: r.created_at,
          },
        }));

      setDocs(docsData);
    } catch (err: any) {
      setError(err.message || t('common.errorLoading'));
    } finally {
      setLoading(false);
    }
  }

  async function markAsViewed(entry: DocumentRecipient) {
    if (entry.status !== 'sent' && entry.status !== 'delivered') return;
    try {
      const viewedAt = new Date().toISOString();
      const { error: err } = await supabase
        .from('document_recipients')
        .update({ status: 'viewed', viewed_at: viewedAt })
        .eq('id', entry.id);

      if (err) throw err;

      setDocs((prev) =>
        prev.map((d) =>
          (d as any).recipientEntry?.id === entry.id
            ? { ...d, recipientEntry: { ...entry, status: 'viewed' as const, viewed_at: viewedAt } }
            : d
        )
      );
    } catch (err: any) {
      setError(err.message || t('common.errorSaving'));
    }
  }

  async function confirmReceived(entry: DocumentRecipient) {
    try {
      const { error: err } = await supabase
        .from('document_recipients')
        .update({ status: 'completed' })
        .eq('id', entry.id);

      if (err) throw err;

      setDocs((prev) =>
        prev.map((d) =>
          (d as any).recipientEntry?.id === entry.id
            ? { ...d, recipientEntry: { ...entry, status: 'completed' as const } }
            : d
        )
      );

      if (selectedDoc?.recipientEntry?.id === entry.id) {
        setSelectedDoc((prev) =>
          prev ? { ...prev, recipientEntry: { ...entry, status: 'completed' as const } } : prev
        );
      }
    } catch (err: any) {
      setError(err.message || t('common.errorSaving'));
    }
  }

  const filteredDocs = docs.filter((d) => {
    if (search && !d.title.toLowerCase().includes(search.toLowerCase())) return false;
    if (filterStatus && (d as any).recipientEntry?.status !== filterStatus) return false;
    return true;
  });

  const unviewedCount = docs.filter((d) => {
    const s = (d as any).recipientEntry?.status;
    return s === 'sent' || s === 'delivered';
  }).length;

  return (
    <div className="min-h-[calc(100vh-8rem)]">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">{t('depot.documents.title')}</h1>
        <p className="text-gray-500 mt-1">
          {t('depot.documents.subtitle')}
          {unviewedCount > 0 && (
            <span className="ml-2 inline-flex items-center gap-1 px-2 py-0.5 bg-red-100 text-red-600 rounded-full text-xs font-medium">
              {unviewedCount} {t('common.new')}
            </span>
          )}
        </p>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-3 flex items-center gap-3 mb-4">
          <AlertTriangle className="w-4 h-4 text-red-500 flex-shrink-0" />
          <p className="text-red-700 text-sm flex-1">{error}</p>
          <button onClick={() => setError(null)} className="text-red-500 hover:text-red-700">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      <div className="flex flex-col sm:flex-row gap-3 mb-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder={t('common.search') + '...'}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent text-sm"
          />
        </div>
        <select
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value)}
          className="px-3 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 text-sm text-gray-700"
        >
          <option value="">{t('common.allStatuses')}</option>
          <option value="sent">{t('company.documents.docStatuses.sent')}</option>
          <option value="viewed">{t('company.documents.docStatuses.viewed')}</option>
          <option value="completed">{t('company.documents.docStatuses.completed')}</option>
        </select>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-48">
          <Loader2 className="w-8 h-8 animate-spin text-teal-600" />
        </div>
      ) : filteredDocs.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-48 text-center">
          <Inbox className="w-12 h-12 text-gray-300 mb-3" />
          <p className="text-gray-400 text-lg">{t('depot.documents.noDocuments')}</p>
        </div>
      ) : (
        <div className="grid gap-3">
          {filteredDocs.map((doc) => (
            <DocumentCard
              key={doc.id}
              doc={doc}
              onClick={() => {
                if ((doc as any).recipientEntry) {
                  markAsViewed((doc as any).recipientEntry);
                }
                setSelectedDoc(doc);
                setShowDetail(true);
              }}
              showSender
            />
          ))}
        </div>
      )}

      {showDetail && selectedDoc && (
        <div className="fixed inset-0 z-50 flex items-start justify-end">
          <div className="fixed inset-0 bg-black/50" onClick={() => setShowDetail(false)} />
          <div className="relative bg-white w-full max-w-lg h-full overflow-y-auto shadow-xl">
            <div className="sticky top-0 bg-white border-b border-gray-100 px-6 py-4 flex items-center gap-3 z-10">
              <button
                onClick={() => setShowDetail(false)}
                className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <ArrowLeft className="w-5 h-5" />
              </button>
              <h2 className="text-lg font-semibold text-gray-900 truncate">{selectedDoc.title}</h2>
            </div>

            <div className="p-6 space-y-6">
              <div className="flex items-center gap-3 flex-wrap">
                {(() => {
                  const tp = getTypeConfig(selectedDoc.document_type);
                  return (
                    <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium ${tp.color}`}>
                      <tp.icon className="w-3.5 h-3.5" />
                      {tp.label}
                    </span>
                  );
                })()}
                {selectedDoc.priority === 'urgent' && (
                  <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-medium text-red-600 bg-red-50 border border-red-200">
                    <AlertCircle className="w-3.5 h-3.5" />
                    {t('common.urgent')}
                  </span>
                )}
                {selectedDoc.recipientEntry && (() => {
                  const st = getStatusConfig(selectedDoc.recipientEntry.status);
                  return (
                    <span className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-medium ${st.color}`}>
                      <st.icon className="w-3.5 h-3.5" />
                      {st.label}
                    </span>
                  );
                })()}
              </div>

              {selectedDoc.description && (
                <p className="text-sm text-gray-700">{selectedDoc.description}</p>
              )}

              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-full bg-teal-100 flex items-center justify-center overflow-hidden">
                  {selectedDoc.sender?.avatar_url ? (
                    <img src={selectedDoc.sender.avatar_url} alt="" className="w-9 h-9 rounded-full object-cover" />
                  ) : (
                    <User className="w-4 h-4 text-teal-600" />
                  )}
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-900">{selectedDoc.sender?.full_name}</p>
                  <p className="text-xs text-gray-500 flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    {new Date(selectedDoc.created_at).toLocaleString()}
                  </p>
                </div>
              </div>

              {selectedDoc.file_url && (
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-sm font-medium text-gray-700">{t('common.file')}</p>
                    <a
                      href={selectedDoc.file_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 text-teal-600 hover:text-teal-700 text-sm"
                    >
                      <Download className="w-4 h-4" />
                      {t('common.download')}
                    </a>
                  </div>
                  <DocumentPreview fileUrl={selectedDoc.file_url} fileName={selectedDoc.file_name} />
                  {selectedDoc.file_name && (
                    <p className="text-xs text-gray-400 mt-1">
                      {selectedDoc.file_name} {selectedDoc.file_size > 0 && `(${formatFileSize(selectedDoc.file_size)})`}
                    </p>
                  )}
                </div>
              )}

              {selectedDoc.recipientEntry && selectedDoc.recipientEntry.status !== 'completed' && (
                <button
                  onClick={() => confirmReceived(selectedDoc.recipientEntry!)}
                  className="w-full inline-flex items-center justify-center gap-2 px-4 py-3 bg-emerald-600 text-white rounded-xl hover:bg-emerald-700 transition-colors text-sm font-medium"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  {t('depot.documents.confirmReceipt')}
                </button>
              )}

              {selectedDoc.recipientEntry?.status === 'completed' && (
                <div className="flex items-center gap-2 p-3 bg-emerald-50 border border-emerald-200 rounded-xl">
                  <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                  <p className="text-sm font-medium text-emerald-700">{t('company.documents.docStatuses.completed')}</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
