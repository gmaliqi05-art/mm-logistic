import {
  FileText,
  Image,
  FileSpreadsheet,
  File,
  AlertCircle,
  Clock,
  Eye,
  CheckCircle2,
  PenLine,
  Send,
  User,
  Download,
} from 'lucide-react';
import { useTranslation } from '../../i18n';
import type { Document, DocumentRecipient } from '../../types';

function useDocumentConfigs() {
  const { t } = useTranslation();

  const typeConfig: Record<string, { label: string; icon: typeof FileText; color: string }> = {
    delivery_note: { label: t('company.documents.docTypes.delivery_note'), icon: FileText, color: 'text-blue-600 bg-blue-50' },
    invoice: { label: t('company.documents.docTypes.invoice'), icon: FileSpreadsheet, color: 'text-emerald-600 bg-emerald-50' },
    report: { label: t('company.documents.docTypes.report'), icon: FileText, color: 'text-amber-600 bg-amber-50' },
    photo: { label: t('company.documents.docTypes.photo'), icon: Image, color: 'text-cyan-600 bg-cyan-50' },
    contract: { label: t('company.documents.docTypes.contract'), icon: FileText, color: 'text-rose-600 bg-rose-50' },
    other: { label: t('company.documents.docTypes.other'), icon: File, color: 'text-gray-600 bg-gray-50' },
  };

  const priorityConfig: Record<string, { label: string; color: string }> = {
    normal: { label: t('common.normal'), color: 'text-gray-500 bg-gray-100' },
    urgent: { label: t('common.urgent'), color: 'text-red-600 bg-red-50 border border-red-200' },
  };

  const statusConfig: Record<string, { label: string; icon: typeof Clock; color: string }> = {
    sent: { label: t('company.documents.docStatuses.sent'), icon: Send, color: 'text-blue-600 bg-blue-50' },
    delivered: { label: t('company.documents.docStatuses.delivered'), icon: CheckCircle2, color: 'text-teal-600 bg-teal-50' },
    viewed: { label: t('company.documents.docStatuses.viewed'), icon: Eye, color: 'text-amber-600 bg-amber-50' },
    signed: { label: t('company.documents.docStatuses.signed'), icon: PenLine, color: 'text-emerald-600 bg-emerald-50' },
    completed: { label: t('company.documents.docStatuses.completed'), icon: CheckCircle2, color: 'text-green-700 bg-green-50' },
  };

  return { typeConfig, priorityConfig, statusConfig };
}

interface DocumentCardProps {
  doc: Document;
  recipients?: DocumentRecipient[];
  onClick: () => void;
  showSender?: boolean;
}

export function getStatusConfig(status: string) {
  const statusConfig: Record<string, { label: string; icon: typeof Clock; color: string }> = {
    sent: { label: 'Derguar', icon: Send, color: 'text-blue-600 bg-blue-50' },
    delivered: { label: 'Pranuar', icon: CheckCircle2, color: 'text-teal-600 bg-teal-50' },
    viewed: { label: 'Pare', icon: Eye, color: 'text-amber-600 bg-amber-50' },
    signed: { label: 'Nenshkruar', icon: PenLine, color: 'text-emerald-600 bg-emerald-50' },
    completed: { label: 'Perfunduar', icon: CheckCircle2, color: 'text-green-700 bg-green-50' },
  };
  return statusConfig[status] || statusConfig.sent;
}

export function getTypeConfig(type: string) {
  const typeConfig: Record<string, { label: string; icon: typeof FileText; color: string }> = {
    delivery_note: { label: 'Fletedergese', icon: FileText, color: 'text-blue-600 bg-blue-50' },
    invoice: { label: 'Fature', icon: FileSpreadsheet, color: 'text-emerald-600 bg-emerald-50' },
    report: { label: 'Raport', icon: FileText, color: 'text-amber-600 bg-amber-50' },
    photo: { label: 'Foto', icon: Image, color: 'text-cyan-600 bg-cyan-50' },
    contract: { label: 'Kontrate', icon: FileText, color: 'text-rose-600 bg-rose-50' },
    other: { label: 'Tjeter', icon: File, color: 'text-gray-600 bg-gray-50' },
  };
  return typeConfig[type] || typeConfig.other;
}

export function getPriorityConfig(priority: string) {
  const priorityConfig: Record<string, { label: string; color: string }> = {
    normal: { label: 'Normal', color: 'text-gray-500 bg-gray-100' },
    urgent: { label: 'Urgjent', color: 'text-red-600 bg-red-50 border border-red-200' },
  };
  return priorityConfig[priority] || priorityConfig.normal;
}

function formatDate(dateStr: string) {
  const d = new Date(dateStr);
  return d.toLocaleDateString(undefined, { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function formatTime(dateStr: string) {
  const d = new Date(dateStr);
  return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}

export function formatFileSize(bytes: number) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

function getFileExtension(fileName: string) {
  return fileName.split('.').pop()?.toUpperCase() || 'FILE';
}

function isImageFile(fileName: string) {
  const ext = fileName.split('.').pop()?.toLowerCase() || '';
  return ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'bmp'].includes(ext);
}

export default function DocumentCard({ doc, recipients, onClick, showSender = false }: DocumentCardProps) {
  const { typeConfig, priorityConfig, statusConfig } = useDocumentConfigs();

  const type = typeConfig[doc.document_type] || typeConfig.other;
  const priority = priorityConfig[doc.priority] || priorityConfig.normal;
  const TypeIcon = type.icon;

  const overallStatus = recipients?.length
    ? (() => {
        const statuses = recipients.map((r) => r.status);
        if (statuses.every((s) => s === 'completed')) return 'completed';
        if (statuses.every((s) => s === 'signed' || s === 'completed')) return 'signed';
        if (statuses.some((s) => s === 'viewed')) return 'viewed';
        if (statuses.some((s) => s === 'delivered')) return 'delivered';
        return 'sent';
      })()
    : 'sent';

  const st = statusConfig[overallStatus] || statusConfig.sent;
  const StatusIcon = st.icon;

  return (
    <button
      onClick={onClick}
      className="w-full bg-white border border-gray-200 rounded-xl p-4 hover:border-teal-300 hover:shadow-md transition-all duration-200 text-left group"
    >
      <div className="flex items-start gap-3">
        <div className={`p-2.5 rounded-xl ${type.color} flex-shrink-0`}>
          {isImageFile(doc.file_name) && doc.file_url ? (
            <Image className="w-5 h-5" />
          ) : (
            <TypeIcon className="w-5 h-5" />
          )}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <h3 className="text-sm font-semibold text-gray-900 truncate group-hover:text-teal-700 transition-colors">
              {doc.title}
            </h3>
            {doc.priority === 'urgent' && (
              <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${priority.color}`}>
                <AlertCircle className="w-3 h-3" />
                {priority.label}
              </span>
            )}
          </div>

          {doc.description && (
            <p className="text-xs text-gray-500 truncate mb-1.5">{doc.description}</p>
          )}

          <div className="flex items-center gap-3 flex-wrap">
            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${type.color}`}>
              {type.label}
            </span>
            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${st.color}`}>
              <StatusIcon className="w-3 h-3" />
              {st.label}
            </span>
            {doc.file_name && (
              <span className="text-xs text-gray-400">
                {getFileExtension(doc.file_name)} {doc.file_size > 0 && `- ${formatFileSize(doc.file_size)}`}
              </span>
            )}
          </div>

          <div className="flex items-center justify-between mt-2">
            <div className="flex items-center gap-2">
              {showSender && doc.sender && (
                <div className="flex items-center gap-1.5">
                  <div className="w-5 h-5 rounded-full bg-teal-100 flex items-center justify-center overflow-hidden">
                    {doc.sender.avatar_url ? (
                      <img src={doc.sender.avatar_url} alt="" className="w-5 h-5 rounded-full object-cover" />
                    ) : (
                      <User className="w-3 h-3 text-teal-600" />
                    )}
                  </div>
                  <span className="text-xs text-gray-500">{doc.sender.full_name}</span>
                </div>
              )}
              {recipients && recipients.length > 0 && !showSender && (
                <div className="flex items-center gap-1">
                  <div className="flex -space-x-1.5">
                    {recipients.slice(0, 3).map((r) => (
                      <div key={r.id} className="w-5 h-5 rounded-full bg-teal-100 flex items-center justify-center ring-2 ring-white overflow-hidden">
                        {r.recipient?.avatar_url ? (
                          <img src={r.recipient.avatar_url} alt="" className="w-5 h-5 rounded-full object-cover" />
                        ) : (
                          <User className="w-3 h-3 text-teal-600" />
                        )}
                      </div>
                    ))}
                  </div>
                  {recipients.length > 3 && (
                    <span className="text-xs text-gray-400 ml-1">+{recipients.length - 3}</span>
                  )}
                </div>
              )}
            </div>
            <div className="flex items-center gap-1 text-xs text-gray-400">
              <Clock className="w-3 h-3" />
              {formatDate(doc.created_at)} {formatTime(doc.created_at)}
            </div>
          </div>
        </div>
      </div>
    </button>
  );
}

export function DocumentPreview({ fileUrl, fileName }: { fileUrl: string; fileName: string }) {
  if (isImageFile(fileName)) {
    return (
      <div className="rounded-xl overflow-hidden border border-gray-200 bg-gray-50">
        <img
          src={fileUrl}
          alt={fileName}
          className="max-w-full max-h-96 object-contain mx-auto"
        />
      </div>
    );
  }

  const ext = fileName.split('.').pop()?.toLowerCase() || '';
  if (ext === 'pdf') {
    return (
      <div className="rounded-xl overflow-hidden border border-gray-200 bg-gray-50">
        <iframe src={fileUrl} className="w-full h-96" title={fileName} />
      </div>
    );
  }

  return (
    <a
      href={fileUrl}
      target="_blank"
      rel="noopener noreferrer"
      className="flex items-center gap-3 p-4 bg-gray-50 border border-gray-200 rounded-xl hover:bg-gray-100 transition-colors"
    >
      <File className="w-8 h-8 text-gray-400" />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-gray-900 truncate">{fileName}</p>
        <p className="text-xs text-gray-500">{getFileExtension(fileName)}</p>
      </div>
      <Download className="w-5 h-5 text-gray-400" />
    </a>
  );
}
