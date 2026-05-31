import { useEffect, useState, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { CheckCircle, Loader2, ArrowRight, AlertTriangle } from 'lucide-react';
import { useTranslation } from '../i18n';
import { supabase } from '../lib/supabase';

export default function PaymentSuccess() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { t } = useTranslation();
  const [status, setStatus] = useState<'verifying' | 'success' | 'error'>('verifying');
  const [errorMsg, setErrorMsg] = useState('');
  const sessionId = searchParams.get('session_id');
  const calledRef = useRef(false);

  useEffect(() => {
    if (!sessionId) {
      setStatus('success');
      return;
    }

    if (calledRef.current) return;
    calledRef.current = true;

    let attempts = 0;
    const maxAttempts = 5;

    async function verifySession() {
      attempts++;
      try {
        const apiUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/verify-checkout-session`;
        const headers: Record<string, string> = {
          'Content-Type': 'application/json',
          'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
        };
        const { data: sessionData } = await supabase.auth.getSession();
        if (sessionData?.session?.access_token) {
          headers['Authorization'] = `Bearer ${sessionData.session.access_token}`;
        }
        const res = await fetch(apiUrl, {
          method: 'POST',
          headers,
          body: JSON.stringify({ sessionId }),
        });

        const data = await res.json();

        if (data.status === 'activated' || data.status === 'already_active') {
          setStatus('success');
          return;
        }

        if (data.status === 'not_paid' && attempts < maxAttempts) {
          setTimeout(verifySession, 3000);
          return;
        }

        if (!res.ok) {
          throw new Error(data.error || 'Verification failed');
        }

        setStatus('success');
      } catch (err) {
        if (attempts < maxAttempts) {
          setTimeout(verifySession, 3000);
          return;
        }
        setErrorMsg(err instanceof Error ? err.message : t('common.unknownError'));
        setStatus('error');
      }
    }

    verifySession();
  }, [sessionId]);

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-white rounded-2xl shadow-sm border border-slate-200 p-8 text-center">
        {status === 'verifying' && (
          <>
            <Loader2 className="w-12 h-12 text-teal-600 animate-spin mx-auto mb-4" />
            <h1 className="text-xl font-bold text-slate-800">{t('payment.verifying')}</h1>
            <p className="mt-2 text-slate-500 text-sm">{t('payment.pleaseWait')}</p>
          </>
        )}

        {status === 'success' && (
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

        {status === 'error' && (
          <>
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-amber-100 mb-6">
              <AlertTriangle className="w-8 h-8 text-amber-600" />
            </div>
            <h1 className="text-xl font-bold text-slate-800">{t('payment.successTitle')}</h1>
            <p className="mt-3 text-slate-500 leading-relaxed">
              {t('payment.successMessage')}
            </p>
            {errorMsg && (
              <p className="mt-2 text-xs text-slate-400">{errorMsg}</p>
            )}
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
