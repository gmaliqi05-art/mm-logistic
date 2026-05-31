import { useState } from 'react';
import {
  User,
  MapPin,
  FileText,
  Trash2,
  Copy,
  MoreVertical,
  Check,
  Ban,
} from 'lucide-react';
import { useTranslation } from '../../i18n';
import type { ChatMessage } from '../../types';

interface MessageBubbleProps {
  msg: ChatMessage & { is_deleted?: boolean };
  isOwn: boolean;
  onDelete: (msgId: string) => void;
  formatTime: (dateStr: string) => string;
}

export default function MessageBubble({ msg, isOwn, onDelete, formatTime }: MessageBubbleProps) {
  const [showMenu, setShowMenu] = useState(false);
  const [copied, setCopied] = useState(false);
  const { t } = useTranslation();
  const sender = msg.sender as any;

  function handleCopy() {
    if (msg.message) {
      navigator.clipboard.writeText(msg.message);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }
    setShowMenu(false);
  }

  function handleDelete() {
    onDelete(msg.id);
    setShowMenu(false);
  }

  if (msg.is_deleted) {
    return (
      <div key={msg.id} className={`flex ${isOwn ? 'justify-end' : 'justify-start'} mb-3`}>
        <div className={`flex items-end gap-2 max-w-[75%] ${isOwn ? 'flex-row-reverse' : ''}`}>
          {!isOwn && (
            <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center flex-shrink-0">
              {sender?.avatar_url ? (
                <img src={sender.avatar_url} alt="" className="w-8 h-8 rounded-full object-cover" />
              ) : (
                <User className="w-4 h-4 text-gray-400" />
              )}
            </div>
          )}
          <div>
            {!isOwn && (
              <p className="text-xs text-gray-500 mb-1 ml-1">{sender?.full_name ?? 'I panjohur'}</p>
            )}
            <div className="rounded-2xl px-4 py-2.5 bg-gray-100 border border-gray-200 border-dashed">
              <div className="flex items-center gap-1.5 text-gray-400">
                <Ban className="w-3.5 h-3.5" />
                <p className="text-sm italic">{t('common.messageDeleted')}</p>
              </div>
            </div>
            <p className={`text-xs mt-1 ${isOwn ? 'text-right' : 'text-left'} text-gray-400`}>
              {formatTime(msg.created_at)}
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div key={msg.id} className={`flex ${isOwn ? 'justify-end' : 'justify-start'} mb-3 group`}>
      <div className={`flex items-end gap-2 max-w-[75%] ${isOwn ? 'flex-row-reverse' : ''}`}>
        {!isOwn && (
          <div className="w-8 h-8 rounded-full bg-teal-100 flex items-center justify-center flex-shrink-0">
            {sender?.avatar_url ? (
              <img src={sender.avatar_url} alt="" className="w-8 h-8 rounded-full object-cover" />
            ) : (
              <User className="w-4 h-4 text-teal-600" />
            )}
          </div>
        )}
        <div className="relative">
          {!isOwn && (
            <p className="text-xs text-gray-500 mb-1 ml-1">{sender?.full_name ?? 'I panjohur'}</p>
          )}

          <div className="flex items-center gap-1">
            {isOwn && (
              <div className="relative">
                <button
                  onClick={() => setShowMenu(!showMenu)}
                  className="p-1 text-gray-300 hover:text-gray-500 rounded transition-colors opacity-0 group-hover:opacity-100"
                >
                  <MoreVertical className="w-4 h-4" />
                </button>
                {showMenu && (
                  <>
                    <div className="fixed inset-0 z-40" onClick={() => setShowMenu(false)} />
                    <div className="absolute right-0 top-6 z-50 bg-white rounded-xl shadow-lg border border-gray-200 py-1 w-40">
                      {msg.message && (
                        <button
                          onClick={handleCopy}
                          className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
                        >
                          {copied ? <Check className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4" />}
                          {copied ? 'U kopjua!' : 'Kopjo'}
                        </button>
                      )}
                      {!msg.id.startsWith('temp-') && (
                        <button
                          onClick={handleDelete}
                          className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-red-600 hover:bg-red-50 transition-colors"
                        >
                          <Trash2 className="w-4 h-4" />
                          {t('common.delete')}
                        </button>
                      )}
                    </div>
                  </>
                )}
              </div>
            )}

            <div
              className={`rounded-2xl px-4 py-2.5 ${
                isOwn ? 'bg-teal-600 text-white rounded-br-md' : 'bg-gray-100 text-gray-900 rounded-bl-md'
              }`}
            >
              {msg.message_type === 'photo' && msg.attachment_url && (
                <img
                  src={msg.attachment_url}
                  alt=""
                  className="max-w-full rounded-lg mb-2 max-h-60 object-cover cursor-pointer hover:opacity-90 transition-opacity"
                  onClick={() => window.open(msg.attachment_url!, '_blank')}
                />
              )}
              {msg.message_type === 'document' && msg.attachment_url && (
                <a
                  href={msg.attachment_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={`flex items-center gap-2 mb-1 ${isOwn ? 'text-teal-100 hover:text-white' : 'text-teal-700 hover:text-teal-800'}`}
                >
                  <FileText className="w-5 h-5 flex-shrink-0" />
                  <span className="text-sm underline truncate">{msg.message || 'Dokument'}</span>
                </a>
              )}
              {msg.message_type === 'address' && (
                <div className="flex items-center gap-1.5 mb-1">
                  <MapPin className={`w-4 h-4 ${isOwn ? 'text-teal-200' : 'text-teal-600'}`} />
                  <span className={`text-xs font-medium ${isOwn ? 'text-teal-200' : 'text-teal-600'}`}>{t('common.address')}</span>
                </div>
              )}
              {msg.message_type !== 'document' && msg.message && (
                <p className="text-sm whitespace-pre-wrap break-words">{msg.message}</p>
              )}
            </div>

            {!isOwn && (
              <div className="relative">
                <button
                  onClick={() => {
                    if (msg.message) {
                      navigator.clipboard.writeText(msg.message);
                      setCopied(true);
                      setTimeout(() => setCopied(false), 1500);
                    }
                  }}
                  className="p-1 text-gray-300 hover:text-gray-500 rounded transition-colors opacity-0 group-hover:opacity-100"
                  title="Kopjo"
                >
                  {copied ? <Check className="w-3.5 h-3.5 text-green-500" /> : <Copy className="w-3.5 h-3.5" />}
                </button>
              </div>
            )}
          </div>

          <p className={`text-xs mt-1 ${isOwn ? 'text-right' : 'text-left'} text-gray-400`}>
            {formatTime(msg.created_at)}
          </p>
        </div>
      </div>
    </div>
  );
}
