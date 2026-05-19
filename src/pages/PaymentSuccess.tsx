import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { CheckCircle, Loader2, ArrowRight } from 'lucide-react';
import { useTranslation } from '../i18n';

export default function PaymentSuccess() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { t } = useTranslation();
  const [verified, setVerified] = useState(false);
  const sessionId = searchParams.get('session_id');

  useEffect(() => {
    const timer = setTimeout(() => setVerified(true), 2000);
    return () => clearTimeout(timer);
  }, [sessionId]);

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-white rounded-2xl shadow-sm border border-slate-200 p-8 text-center">
        {!verified ? (
          <>
            <Loader2 className="w-12 h-12 text-teal-600 animate-spin mx-auto mb-4" />
            <h1 className="text-xl font-bold text-slate-800">{t('payment.verifying')}</h1>
            <p className="mt-2 text-slate-500 text-sm">{t('payment.pleaseWait')}</p>
          </>
        ) : (
          <>
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-teal-100 mb-6">
              <CheckCircle className="w-8 h-8 text-teal-600" />
            </div>
            <h1 className="text-2xl font-bold text-slate-800">{t('payment.successTitle')}</h1>
            <p className="mt-3 text-slate-500 leading-relaxed">
              {t('payment.successMessage')}
            </p>
            <button
              onClick={() => navigate('/login')}
              className="mt-8 inline-flex items-center gap-2 px-8 py-3.5 rounded-xl bg-teal-600 text-white font-semibold hover:bg-teal-700 transition-all shadow-lg shadow-teal-600/25"
            >
              {t('payment.goToLogin')}
              <ArrowRight className="w-4 h-4" />
            </button>
          </>
        )}
      </div>
    </div>
  );
}
