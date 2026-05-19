import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Mail, ArrowLeft, Loader2, CheckCircle2, Shield } from 'lucide-react';
import { useTranslation } from '../i18n';
import { usePlatformSettings } from '../hooks/usePlatformSettings';

export default function ForgotPasswordPage() {
  const { t, locale } = useTranslation();
  const navigate = useNavigate();
  const { settings } = usePlatformSettings();
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim()) return;

    setLoading(true);
    setError('');

    try {
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/request-password-reset`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
          },
          body: JSON.stringify({ email: email.trim(), locale }),
        }
      );

      const data = await res.json();

      if (res.status === 429) {
        setError(t('resetPassword.tooManyRequests'));
        return;
      }

      if (data.success) {
        setSent(true);
      } else {
        setError(data.message || t('common.errorOccurred'));
      }
    } catch {
      setError(t('common.errorOccurred'));
    } finally {
      setLoading(false);
    }
  }

  function handleContinue() {
    navigate(`/reset-password?email=${encodeURIComponent(email.trim())}`);
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-teal-50/30 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          {settings.logo ? (
            <img src={settings.logo} alt={settings.name} className="h-12 mx-auto mb-4" />
          ) : (
            <div className="w-12 h-12 mx-auto mb-4 rounded-xl bg-teal-600 flex items-center justify-center">
              <Shield className="w-6 h-6 text-white" />
            </div>
          )}
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
          {!sent ? (
            <div className="p-8">
              <h1 className="text-2xl font-bold text-slate-800 mb-2">
                {t('resetPassword.forgotTitle')}
              </h1>
              <p className="text-slate-500 text-sm mb-8">
                {t('resetPassword.forgotSubtitle')}
              </p>

              <form onSubmit={handleSubmit} className="space-y-5">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">
                    {t('auth.email')}
                  </label>
                  <div className="relative">
                    <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4.5 h-4.5 text-slate-400" />
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder={t('auth.emailPlaceholder')}
                      className="w-full pl-11 pr-4 py-3 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 transition-all"
                      required
                      autoFocus
                    />
                  </div>
                </div>

                {error && (
                  <div className="text-red-600 text-sm bg-red-50 border border-red-200 rounded-lg p-3">
                    {error}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={loading || !email.trim()}
                  className="w-full py-3 bg-teal-600 text-white font-semibold rounded-xl hover:bg-teal-700 transition-all shadow-lg shadow-teal-600/25 disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {loading ? (
                    <Loader2 className="w-5 h-5 animate-spin" />
                  ) : (
                    <>
                      <Mail className="w-4 h-4" />
                      {t('resetPassword.sendCode')}
                    </>
                  )}
                </button>
              </form>

              <div className="mt-6 text-center">
                <Link
                  to="/login"
                  className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-teal-600 transition-colors"
                >
                  <ArrowLeft className="w-4 h-4" />
                  {t('resetPassword.backToLogin')}
                </Link>
              </div>
            </div>
          ) : (
            <div className="p-8 text-center">
              <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-teal-50 mb-5">
                <CheckCircle2 className="w-8 h-8 text-teal-600" />
              </div>
              <h2 className="text-xl font-bold text-slate-800 mb-2">
                {t('resetPassword.codeSent')}
              </h2>
              <p className="text-slate-500 text-sm mb-2">
                {t('resetPassword.codeSentTo')}
              </p>
              <p className="text-slate-800 font-medium text-sm mb-6">{email}</p>
              <p className="text-slate-400 text-xs mb-6">
                {t('resetPassword.checkSpam')}
              </p>

              <button
                onClick={handleContinue}
                className="w-full py-3 bg-teal-600 text-white font-semibold rounded-xl hover:bg-teal-700 transition-all shadow-lg shadow-teal-600/25 flex items-center justify-center gap-2"
              >
                {t('resetPassword.enterCode')}
              </button>

              <button
                onClick={() => { setSent(false); setError(''); }}
                className="mt-3 w-full py-2.5 text-sm text-slate-500 hover:text-slate-700 transition-colors"
              >
                {t('resetPassword.resendCode')}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
