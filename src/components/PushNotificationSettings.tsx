import { useState } from 'react';
import { Bell, BellOff, Loader2, CheckCircle, AlertCircle } from 'lucide-react';
import { usePushNotifications } from '../hooks/usePushNotifications';
import { useTranslation } from '../i18n';

export default function PushNotificationSettings() {
  const { t } = useTranslation();
  const {
    isSupported,
    isSubscribed,
    loading,
    permission,
    subscribe,
    unsubscribe,
  } = usePushNotifications();

  const [updating, setUpdating] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  async function handleToggle() {
    try {
      setUpdating(true);
      setMessage(null);

      if (isSubscribed) {
        const success = await unsubscribe();
        if (success) {
          setMessage({ type: 'success', text: 'Njoftimet u çaktivizuan me sukses' });
        } else {
          setMessage({ type: 'error', text: 'Gabim gjatë çaktivizimit të njoftimeve' });
        }
      } else {
        const success = await subscribe();
        if (success) {
          setMessage({ type: 'success', text: 'Njoftimet u aktivizuan me sukses' });
        } else {
          setMessage({ type: 'error', text: 'Gabim gjatë aktivizimit të njoftimeve' });
        }
      }
    } catch (_error) {
      setMessage({ type: 'error', text: 'Ndodhi një gabim' });
    } finally {
      setUpdating(false);
    }
  }

  if (!isSupported) {
    return (
      <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
        <div className="flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-yellow-500 flex-shrink-0 mt-0.5" />
          <div>
            <h3 className="text-sm font-semibold text-yellow-900 mb-1">
              Njoftimet Push nuk mbështeten
            </h3>
            <p className="text-sm text-yellow-700">
              Shfletuesi juaj nuk mbështet njoftimet push. Ju lutem përdorni një shfletues modern si Chrome, Firefox, Edge ose Safari.
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center p-4">
        <Loader2 className="w-5 h-5 animate-spin text-teal-600" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-lg border border-gray-200 p-4">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3 flex-1">
            <div className="p-2 bg-teal-50 rounded-lg">
              {isSubscribed ? (
                <Bell className="w-5 h-5 text-teal-600" />
              ) : (
                <BellOff className="w-5 h-5 text-gray-400" />
              )}
            </div>
            <div className="flex-1">
              <h3 className="text-sm font-semibold text-gray-900 mb-1">
                Njoftimet Push
              </h3>
              <p className="text-sm text-gray-500">
                {isSubscribed
                  ? 'Ju do të merrni njoftime për mesazhe, dokumente dhe fletëdërgesa të reja.'
                  : 'Aktivizoni njoftimet për të marrë njoftime në kohë reale.'}
              </p>
              {permission === 'denied' && (
                <p className="text-sm text-red-600 mt-2">
                  Lejet për njoftime janë refuzuar. Ju lutem aktivizoni lejet në cilësimet e shfletuesit tuaj.
                </p>
              )}
            </div>
          </div>

          <button
            onClick={handleToggle}
            disabled={updating || permission === 'denied'}
            className={`
              px-4 py-2 rounded-lg font-medium text-sm transition-colors
              ${isSubscribed
                ? 'bg-red-50 text-red-600 hover:bg-red-100 border border-red-200'
                : 'bg-teal-600 text-white hover:bg-teal-700'}
              disabled:opacity-50 disabled:cursor-not-allowed
              inline-flex items-center gap-2
            `}
          >
            {updating ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>{t('common.updatingDots')}</span>
              </>
            ) : (
              <>
                {isSubscribed ? (
                  <>
                    <BellOff className="w-4 h-4" />
                    <span>Çaktivizo</span>
                  </>
                ) : (
                  <>
                    <Bell className="w-4 h-4" />
                    <span>Aktivizo</span>
                  </>
                )}
              </>
            )}
          </button>
        </div>
      </div>

      {message && (
        <div
          className={`
            border rounded-lg p-4 flex items-start gap-3
            ${message.type === 'success'
              ? 'bg-green-50 border-green-200'
              : 'bg-red-50 border-red-200'}
          `}
        >
          {message.type === 'success' ? (
            <CheckCircle className="w-5 h-5 text-green-500 flex-shrink-0 mt-0.5" />
          ) : (
            <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
          )}
          <div className="flex-1">
            <p className={`text-sm ${message.type === 'success' ? 'text-green-700' : 'text-red-700'}`}>
              {message.text}
            </p>
          </div>
          <button
            onClick={() => setMessage(null)}
            className={message.type === 'success' ? 'text-green-500 hover:text-green-700' : 'text-red-500 hover:text-red-700'}
          >
            ×
          </button>
        </div>
      )}

      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <div className="flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-blue-500 flex-shrink-0 mt-0.5" />
          <div>
            <h3 className="text-sm font-semibold text-blue-900 mb-1">
              Si funksionojnë njoftimet push?
            </h3>
            <ul className="text-sm text-blue-700 space-y-1 list-disc list-inside">
              <li>{t('common.pushAppClosedHint')}</li>
              <li>{t('common.pushChatHint')}</li>
              <li>{t('common.pushDocsHint')}</li>
              <li>{t('common.pushDeliveriesHint')}</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
