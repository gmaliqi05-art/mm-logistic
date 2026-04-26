import { useState, useEffect, useRef } from 'react';
import {
  Send,
  Inbox,
  Plus,
  Search,
  X,
  Loader2,
  AlertTriangle,
  User,
  Clock,
  FileText,
  ArrowLeft,
  Download,
  Upload,
  AlertCircle,
  ScanLine,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { useTranslation } from '../../i18n';
import type { Document, DocumentRecipient, Profile } from '../../types';
import DocumentCard, {
  DocumentPreview,
  getStatusConfig,
  getTypeConfig,
  formatFileSize,
} from '../../components/documents/DocumentCard';
import DocumentScanner from '../../components/scanner/DocumentScanner';
import type { PaperSize } from '../../utils/scanProcessor';
import { notifyMultipleUsers } from '../../utils/pushNotifications';

type Tab = 'sent' | 'received';

export default function CompanyDocuments() {
  const { profile } = useAuth();
  const { t } = useTranslation();
  const [tab, setTab] = useState<Tab>('sent');
  const [sentDocs, setSentDocs] = useState<(Document & { recipients?: (DocumentRecipient & { recipient?: Profile })[] })[]>([]);
  const [receivedDocs, setReceivedDocs] = useState<(Document & { recipientEntry?: DocumentRecipient })[]>([]);
  const [workers, setWorkers] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [filterType, setFilterType] = useState('');
  const [filterStatus, setFilterStatus] = useState('');

  const [showSendModal, setShowSendModal] = useState(false);
  const [sendTitle, setSendTitle] = useState('');
  const [sendDesc, setSendDesc] = useState('');
  const [sendType, setSendType] = useState('delivery_note');
  const [sendPriority, setSendPriority] = useState('normal');
  const [sendFile, setSendFile] = useState<File | null>(null);
  const [selectedRecipients, setSelectedRecipients] = useState<string[]>([]);
  const [sending, setSending] = useState(false);
  const [recipientSearch, setRecipientSearch] = useState('');

  const [selectedDoc, setSelectedDoc] = useState<(Document & { recipients?: (DocumentRecipient & { recipient?: Profile })[] }) | null>(null);
  const [showDetail, setShowDetail] = useState(false);

  const [showScanner, setShowScanner] = useState(false);
  const [scannedFileUrl, setScannedFileUrl] = useState<string | null>(null);
  const [scannedFileName, setScannedFileName] = useState<string | null>(null);
  const [scannedPaperSize, setScannedPaperSize] = useState<PaperSize | null>(null);

  const fileRef = useRef<HTMLInputElement>(null);

  const docTypeOptions = [
    { value: 'delivery_note', label: t('company.documents.docTypes.delivery_note') },
    { value: 'invoice', label: t('company.documents.docTypes.invoice') },
    { value: 'report', label: t('company.documents.docTypes.report') },
    { value: 'photo', label: t('company.documents.docTypes.photo') },
    { value: 'contract', label: t('company.documents.docTypes.contract') },
    { value: 'other', label: t('company.documents.docTypes.other') },
  ];

  useEffect(() => {
    if (profile?.company_id) {
      fetchAll();
    }
  }, [profile?.company_id]);

  async function fetchAll() {
    try {
      setLoading(true);
      setError(null);

      const [sentRes, recvRes, workersRes] = await Promise.all([
        supabase
          .from('documents')
          .select('*, sender:profiles!documents_sender_id_fkey(id, full_name, avatar_url, email, role)')
          .eq('company_id', profile!.company_id!)
          .eq('sender_id', profile!.id)
          .order('created_at', { ascending: false }),
        supabase
          .from('document_recipients')
          .select('*, document:documents(*, sender:profiles!documents_sender_id_fkey(id, full_name, avatar_url, email, role))')
          .eq('recipient_id', profile!.id)
          .order('created_at', { ascending: false }),
        supabase
          .from('profiles')
          .select('*')
          .eq('company_id', profile!.company_id!)
          .eq('is_active', true)
          .neq('id', profile!.id)
          .in('role', ['driver', 'depot_worker']),
      ]);

      if (sentRes.error) throw sentRes.error;
      if (recvRes.error) throw recvRes.error;

      const sentDocsData = sentRes.data ?? [];
      const enrichedSent = [];

      for (const doc of sentDocsData) {
        const { data: recs } = await supabase
          .from('document_recipients')
          .select('*, recipient:profiles!document_recipients_recipient_id_fkey(id, full_name, avatar_url, email, role)')
          .eq('document_id', doc.id);
        enrichedSent.push({ ...doc, recipients: recs ?? [] });
      }

      setSentDocs(enrichedSent);

      const recvDocsData = (recvRes.data ?? [])
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

      setReceivedDocs(recvDocsData);
      setWorkers(workersRes.data ?? []);
    } catch (err: any) {
      setError(err.message || t('common.errorLoading'));
    } finally {
      setLoading(false);
    }
  }

  async function handleSend() {
    const hasFile = sendFile || scannedFileUrl;
    if (!sendTitle.trim() || !hasFile || selectedRecipients.length === 0) return;

    try {
      setSending(true);
      setError(null);

      let fileUrl: string;
      let fileName: string;
      let fileSize: number;

      if (scannedFileUrl && !sendFile) {
        fileUrl = scannedFileUrl;
        fileName = scannedFileName || `scan_${Date.now()}.jpg`;
        fileSize = 0;
      } else if (sendFile) {
        const ext = sendFile.name.split('.').pop() || 'bin';
        const filePath = `documents/${profile!.company_id}/${Date.now()}.${ext}`;

        const { error: uploadErr } = await supabase.storage
          .from('attachments')
          .upload(filePath, sendFile);

        if (uploadErr) throw uploadErr;

        const { data: urlData } = supabase.storage.from('attachments').getPublicUrl(filePath);
        fileUrl = urlData.publicUrl;
        fileName = sendFile.name;
        fileSize = sendFile.size;
      } else {
        return;
      }

      const { data: docData, error: docErr } = await supabase
        .from('documents')
        .insert({
          company_id: profile!.company_id!,
          sender_id: profile!.id,
          title: sendTitle.trim(),
          description: sendDesc.trim(),
          document_type: sendType,
          file_url: fileUrl,
          file_name: fileName,
          file_size: fileSize,
          priority: sendPriority,
        })
        .select()
        .maybeSingle();

      if (docErr) throw docErr;

      const recipientRows = selectedRecipients.map((rid) => ({
        document_id: docData!.id,
        recipient_id: rid,
        status: 'sent',
      }));

      const { error: recErr } = await supabase
        .from('document_recipients')
        .insert(recipientRows);

      if (recErr) throw recErr;

      const notificationTitle = sendPriority === 'urgent' ? t('common.urgent') : t('company.documents.title');
      const notificationMessage = `${profile!.full_name} dërgoi: ${sendTitle.trim()}`;
      await notifyMultipleUsers(
        selectedRecipients,
        'document',
        notificationTitle,
        notificationMessage,
        '/documents'
      );

      resetSendForm();
      await fetchAll();
    } catch (err: any) {
      setError(err.message || t('common.errorSending'));
    } finally {
      setSending(false);
    }
  }

  function resetSendForm() {
    setShowSendModal(false);
    setSendTitle('');
    setSendDesc('');
    setSendType('delivery_note');
    setSendPriority('normal');
    setSendFile(null);
    setSelectedRecipients([]);
    setRecipientSearch('');
    setScannedFileUrl(null);
    setScannedFileName(null);
    setScannedPaperSize(null);
    if (fileRef.current) fileRef.current.value = '';
  }

  function handleScanComplete(url: string, paperSize: PaperSize, fileName: string) {
    setScannedFileUrl(url);
    setScannedFileName(fileName);
    setScannedPaperSize(paperSize);
    setSendTitle(paperSize !== 'Unknown' ? `${t('scanner.scannedDoc')} (${paperSize})` : t('scanner.scannedDoc'));
    setSendType('photo');
    setShowScanner(false);
    setShowSendModal(true);
  }

  function toggleRecipient(id: string) {
    setSelectedRecipients((prev) =>
      prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id]
    );
  }

  function selectAllWorkers() {
    const filteredWorkerIds = filteredWorkers.map((w) => w.id);
    const allSelected = filteredWorkerIds.every((id) => selectedRecipients.includes(id));
    if (allSelected) {
      setSelectedRecipients((prev) => prev.filter((id) => !filteredWorkerIds.includes(id)));
    } else {
      setSelectedRecipients((prev) => [...new Set([...prev, ...filteredWorkerIds])]);
    }
  }

  async function openDetail(doc: any) {
    setSelectedDoc(doc);
    setShowDetail(true);
  }

  async function markAsViewed(recipientEntry: DocumentRecipient) {
    if (recipientEntry.status !== 'sent' && recipientEntry.status !== 'delivered') return;
    await supabase
      .from('document_recipients')
      .update({ status: 'viewed', viewed_at: new Date().toISOString() })
      .eq('id', recipientEntry.id);
  }

  const filteredWorkers = workers.filter((w) => {
    if (!recipientSearch) return true;
    const q = recipientSearch.toLowerCase();
    return w.full_name.toLowerCase().includes(q) || w.email.toLowerCase().includes(q);
  });

  const displayDocs = tab === 'sent'
    ? sentDocs.filter((d) => {
        if (search && !d.title.toLowerCase().includes(search.toLowerCase())) return false;
        if (filterType && d.document_type !== filterType) return false;
        return true;
      })
    : receivedDocs.filter((d) => {
        if (search && !d.title.toLowerCase().includes(search.toLowerCase())) return false;
        if (filterType && d.document_type !== filterType) return false;
        if (filterStatus && (d as any).recipientEntry?.status !== filterStatus) return false;
        return true;
      });

  const sentCount = sentDocs.length;
  const unviewedCount = receivedDocs.filter((d) => {
    const s = (d as any).recipientEntry?.status;
    return s === 'sent' || s === 'delivered';
  }).length;

  return (
    <div className="min-h-[calc(100vh-8rem)]">
      <div className="mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{t('company.documents.title')}</h1>
          <p className="text-gray-500 mt-1">{t('company.documents.subtitle')}</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowScanner(true)}
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-teal-600 to-emerald-600 text-white rounded-lg hover:from-teal-700 hover:to-emerald-700 transition-all text-sm font-medium shadow-sm"
          >
            <ScanLine className="w-4 h-4" />
            {t('scanner.scanAndSend')}
          </button>
          <button
            onClick={() => setShowSendModal(true)}
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition-colors text-sm font-medium shadow-sm"
          >
            <Plus className="w-4 h-4" />
            {t('company.documents.sendDocument')}
          </button>
        </div>
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

      <div className="flex gap-2 mb-4 border-b border-gray-200">
        <button
          onClick={() => setTab('sent')}
          className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
            tab === 'sent'
              ? 'border-teal-600 text-teal-600'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          <Send className="w-4 h-4" />
          {t('company.documents.sentTab')}
          <span className="bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full text-xs">{sentCount}</span>
        </button>
        <button
          onClick={() => setTab('received')}
          className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
            tab === 'received'
              ? 'border-teal-600 text-teal-600'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          <Inbox className="w-4 h-4" />
          {t('company.documents.receivedTab')}
          {unviewedCount > 0 && (
            <span className="bg-red-500 text-white px-2 py-0.5 rounded-full text-xs">{unviewedCount}</span>
          )}
        </button>
      </div>

      <div className="flex flex-col sm:flex-row gap-3 mb-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder={t('company.documents.searchDocs')}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent text-sm"
          />
        </div>
        <select
          value={filterType}
          onChange={(e) => setFilterType(e.target.value)}
          className="px-3 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 text-sm text-gray-700"
        >
          <option value="">{t('common.allTypes')}</option>
          {docTypeOptions.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
        {tab === 'received' && (
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="px-3 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 text-sm text-gray-700"
          >
            <option value="">{t('common.allStatuses')}</option>
            <option value="sent">{t('company.documents.docStatuses.sent')}</option>
            <option value="delivered">{t('company.documents.docStatuses.delivered')}</option>
            <option value="viewed">{t('company.documents.docStatuses.viewed')}</option>
            <option value="signed">{t('company.documents.docStatuses.signed')}</option>
            <option value="completed">{t('company.documents.docStatuses.completed')}</option>
          </select>
        )}
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-48">
          <Loader2 className="w-8 h-8 animate-spin text-teal-600" />
        </div>
      ) : displayDocs.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-48 text-center">
          <FileText className="w-12 h-12 text-gray-300 mb-3" />
          <p className="text-gray-400 text-lg">
            {tab === 'sent' ? t('company.documents.noSentDocs') : t('company.documents.noReceivedDocs')}
          </p>
          {tab === 'sent' && (
            <button
              onClick={() => setShowSendModal(true)}
              className="mt-3 text-teal-600 hover:text-teal-700 text-sm font-medium"
            >
              {t('company.documents.sendFirst')}
            </button>
          )}
        </div>
      ) : (
        <div className="grid gap-3">
          {displayDocs.map((doc) => (
            <DocumentCard
              key={doc.id}
              doc={doc}
              recipients={tab === 'sent' ? (doc as any).recipients : undefined}
              onClick={() => {
                if (tab === 'received' && (doc as any).recipientEntry) {
                  markAsViewed((doc as any).recipientEntry);
                }
                openDetail(doc);
              }}
              showSender={tab === 'received'}
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
                  const tc = getTypeConfig(selectedDoc.document_type);
                  return (
                    <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium ${tc.color}`}>
                      <tc.icon className="w-3.5 h-3.5" />
                      {tc.label}
                    </span>
                  );
                })()}
                {selectedDoc.priority === 'urgent' && (
                  <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-medium text-red-600 bg-red-50 border border-red-200">
                    <AlertCircle className="w-3.5 h-3.5" />
                    {t('common.urgent')}
                  </span>
                )}
              </div>

              {selectedDoc.description && (
                <div>
                  <p className="text-sm text-gray-700">{selectedDoc.description}</p>
                </div>
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

              {(selectedDoc as any).recipients && (selectedDoc as any).recipients.length > 0 && (
                <div>
                  <p className="text-sm font-medium text-gray-700 mb-3">
                    {t('common.recipients')} ({(selectedDoc as any).recipients.length})
                  </p>
                  <div className="space-y-2">
                    {(selectedDoc as any).recipients.map((r: DocumentRecipient & { recipient?: Profile }) => {
                      const st = getStatusConfig(r.status);
                      return (
                        <div key={r.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-xl">
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-full bg-teal-100 flex items-center justify-center overflow-hidden">
                              {r.recipient?.avatar_url ? (
                                <img src={r.recipient.avatar_url} alt="" className="w-8 h-8 rounded-full object-cover" />
                              ) : (
                                <User className="w-4 h-4 text-teal-600" />
                              )}
                            </div>
                            <div>
                              <p className="text-sm font-medium text-gray-900">{r.recipient?.full_name}</p>
                              <p className="text-xs text-gray-500">
                                {r.recipient?.role === 'driver' ? t('roles.driver') : t('roles.depot_worker')}
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${st.color}`}>
                              <st.icon className="w-3 h-3" />
                              {st.label}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {(selectedDoc as any).recipientEntry?.signed_file_url && (
                <div>
                  <p className="text-sm font-medium text-gray-700 mb-2">{t('common.signedDocument')}</p>
                  <DocumentPreview
                    fileUrl={(selectedDoc as any).recipientEntry.signed_file_url}
                    fileName="signed-document"
                  />
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {showSendModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-black/50" onClick={() => resetSendForm()} />
          <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between p-6 border-b border-gray-100">
              <div className="flex items-center gap-2">
                <Send className="w-5 h-5 text-teal-600" />
                <h2 className="text-lg font-semibold text-gray-900">{t('company.documents.sendDocument')}</h2>
              </div>
              <button
                onClick={resetSendForm}
                className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-5">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">{t('company.documents.titleLabel')} *</label>
                <input
                  type="text"
                  value={sendTitle}
                  onChange={(e) => setSendTitle(e.target.value)}
                  className="w-full px-3 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent text-sm"
                  placeholder={t('company.documents.titlePlaceholder')}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">{t('company.documents.descriptionLabel')}</label>
                <textarea
                  value={sendDesc}
                  onChange={(e) => setSendDesc(e.target.value)}
                  rows={2}
                  className="w-full px-3 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent text-sm resize-none"
                  placeholder={t('company.documents.descriptionPlaceholder')}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">{t('company.documents.typeLabel')}</label>
                  <select
                    value={sendType}
                    onChange={(e) => setSendType(e.target.value)}
                    className="w-full px-3 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 text-sm"
                  >
                    {docTypeOptions.map((o) => (
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">{t('company.documents.priorityLabel')}</label>
                  <select
                    value={sendPriority}
                    onChange={(e) => setSendPriority(e.target.value)}
                    className="w-full px-3 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 text-sm"
                  >
                    <option value="normal">{t('common.normal')}</option>
                    <option value="urgent">{t('common.urgent')}</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">{t('company.documents.fileLabel')} *</label>
                <input
                  ref={fileRef}
                  type="file"
                  accept=".pdf,.doc,.docx,.xls,.xlsx,.jpg,.jpeg,.png,.gif,.webp,.txt,.csv,.zip"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) {
                      setSendFile(f);
                      setScannedFileUrl(null);
                      setScannedFileName(null);
                      setScannedPaperSize(null);
                    }
                  }}
                />
                {sendFile ? (
                  <div className="flex items-center gap-3 p-3 bg-teal-50 border border-teal-200 rounded-lg">
                    <FileText className="w-5 h-5 text-teal-600 flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-teal-900 truncate">{sendFile.name}</p>
                      <p className="text-xs text-teal-600">{formatFileSize(sendFile.size)}</p>
                    </div>
                    <button
                      onClick={() => {
                        setSendFile(null);
                        if (fileRef.current) fileRef.current.value = '';
                      }}
                      className="p-1 text-teal-500 hover:text-teal-700"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                ) : scannedFileUrl ? (
                  <div className="space-y-3">
                    <div className="rounded-xl overflow-hidden border border-teal-200 bg-teal-50/50">
                      <img src={scannedFileUrl} alt="" className="max-w-full max-h-48 object-contain mx-auto" />
                    </div>
                    <div className="flex items-center gap-3 p-3 bg-teal-50 border border-teal-200 rounded-lg">
                      <ScanLine className="w-5 h-5 text-teal-600 flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-teal-900 truncate">{scannedFileName}</p>
                        {scannedPaperSize && scannedPaperSize !== 'Unknown' && (
                          <p className="text-xs text-teal-600">{t('scanner.paperSize')}: {scannedPaperSize}</p>
                        )}
                      </div>
                      <button
                        onClick={() => {
                          setScannedFileUrl(null);
                          setScannedFileName(null);
                          setScannedPaperSize(null);
                        }}
                        className="p-1 text-teal-500 hover:text-teal-700"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-3">
                    <button
                      onClick={() => fileRef.current?.click()}
                      className="flex flex-col items-center justify-center gap-2 p-6 border-2 border-dashed border-gray-300 rounded-xl hover:border-teal-400 hover:bg-teal-50/50 transition-colors"
                    >
                      <Upload className="w-8 h-8 text-gray-400" />
                      <p className="text-sm text-gray-500">{t('company.documents.clickToUpload')}</p>
                      <p className="text-xs text-gray-400">{t('company.documents.fileTypes')}</p>
                    </button>
                    <button
                      onClick={() => { setShowSendModal(false); setShowScanner(true); }}
                      className="flex flex-col items-center justify-center gap-2 p-6 border-2 border-dashed border-teal-300 rounded-xl bg-teal-50/50 hover:bg-teal-50 transition-colors"
                    >
                      <ScanLine className="w-8 h-8 text-teal-600" />
                      <p className="text-sm text-teal-600 font-medium">{t('scanner.scanDocument')}</p>
                      <p className="text-xs text-teal-500">{t('scanner.detectSize')}</p>
                    </button>
                  </div>
                )}
              </div>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="block text-sm font-medium text-gray-700">
                    {t('company.documents.recipientsLabel')} * ({selectedRecipients.length} {t('company.documents.recipientsCount')})
                  </label>
                  <button
                    onClick={selectAllWorkers}
                    className="text-xs text-teal-600 hover:text-teal-700 font-medium"
                  >
                    {filteredWorkers.every((w) => selectedRecipients.includes(w.id)) ? t('common.deselectAll') : t('common.selectAll')}
                  </button>
                </div>
                <div className="relative mb-2">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input
                    type="text"
                    placeholder={t('common.searchWorkers')}
                    value={recipientSearch}
                    onChange={(e) => setRecipientSearch(e.target.value)}
                    className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent text-sm"
                  />
                </div>
                <div className="max-h-48 overflow-y-auto border border-gray-200 rounded-xl">
                  {filteredWorkers.length === 0 ? (
                    <p className="p-4 text-sm text-gray-400 text-center">{t('common.noWorkers')}</p>
                  ) : (
                    filteredWorkers.map((w) => {
                      const isSelected = selectedRecipients.includes(w.id);
                      return (
                        <button
                          key={w.id}
                          onClick={() => toggleRecipient(w.id)}
                          className={`w-full flex items-center gap-3 p-2.5 text-left transition-colors border-b border-gray-50 last:border-0 ${
                            isSelected ? 'bg-teal-50' : 'hover:bg-gray-50'
                          }`}
                        >
                          <div
                            className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-colors ${
                              isSelected ? 'border-teal-600 bg-teal-600' : 'border-gray-300'
                            }`}
                          >
                            {isSelected && (
                              <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                              </svg>
                            )}
                          </div>
                          <div className="w-7 h-7 rounded-full bg-teal-100 flex items-center justify-center overflow-hidden">
                            {w.avatar_url ? (
                              <img src={w.avatar_url} alt="" className="w-7 h-7 rounded-full object-cover" />
                            ) : (
                              <User className="w-3.5 h-3.5 text-teal-600" />
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-gray-900">{w.full_name}</p>
                            <p className="text-xs text-gray-500">
                              {w.role === 'driver' ? t('roles.driver') : t('roles.depot_worker')} - {w.email}
                            </p>
                          </div>
                        </button>
                      );
                    })
                  )}
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 p-6 border-t border-gray-100">
              <button
                onClick={resetSendForm}
                className="px-4 py-2.5 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
              >
                {t('common.cancel')}
              </button>
              <button
                onClick={handleSend}
                disabled={sending || !sendTitle.trim() || (!sendFile && !scannedFileUrl) || selectedRecipients.length === 0}
                className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-medium text-white bg-teal-600 rounded-lg hover:bg-teal-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {sending ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    {t('common.sending')}
                  </>
                ) : (
                  <>
                    <Send className="w-4 h-4" />
                    {t('common.send')}
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {showScanner && (
        <DocumentScanner
          onClose={() => setShowScanner(false)}
          onScanComplete={handleScanComplete}
        />
      )}
    </div>
  );
}
