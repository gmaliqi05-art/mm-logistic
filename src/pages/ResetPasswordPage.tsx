import { useState, useRef, useEffect } from 'react';
import { Link, useSearchParams, useNavigate } from 'react-router-dom';
import { Lock, ArrowLeft, Loader2, CheckCircle2, Shield, Eye, EyeOff, RefreshCw } from 'lucide-react';
import { useTranslation } from '../i18n';
import { usePlatformSettings } from '../hooks/usePlatformSettings';

export default function ResetPasswordPage() {
  const { t, locale } = useTranslation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { settings } = usePlatformSettings();

  const prefilledCode = searchParams.get('code') || '';
  const prefilledEmail = searchParams.get('email') || '';

  const [step, setStep] = useState<'code' | 'password' | 'success'>(
    prefilledCode.length === 6 ? 'password' : 'code'
  );
  const [digits, setDigits] = useState<string[]>(
    prefilledCode.length === 6 ? prefilledCode.split('') : ['', '', '', '', '', '']
  );
  const [email] = useState(prefilledEmail);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [resendCooldown, setResendCooldown] = useState(0);

  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  useEffect(() => {
    if (resendCooldown > 0) {
      const timer = setTimeout(() => setResendCooldown(resendCooldown - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [resendCooldown]);

  useEffect(() => {
    if (step === 'code' && inputRefs.current[0]) {
      inputRefs.current[0]?.focus();
    }
  }, [step]);

  function handleDigitChange(index: number, value: string) {
    if (value.length > 1) {
      // Handle paste into a single input
      const pasted = value.replace(/\D/g, '').slice(0, 6);
      if (pasted.length >= 6) {
        const newDigits = pasted.split('').slice(0, 6);
        setDigits(newDigits);
        inputRefs.current[5]?.focus();
        return;
      }
    }

    const digit = value.replace(/\D/g, '').slice(-1);
    const newDigits = [...digits];
    newDigits[index] = digit;
    setDigits(newDigits);

    if (digit && index < 5) {
      inputRefs.current[index + 1]?.focus();
    }
  }

  function handleKeyDown(index: number, e: React.KeyboardEvent) {
    if (e.key === 'Backspace' && !digits[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  }

  function handlePaste(e: React.ClipboardEvent) {
    e.preventDefault();
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
    if (pasted.length === 6) {
      setDigits(pasted.split(''));
      inputRefs.current[5]?.focus();
    }
  }

  function handleCodeSubmit(e: React.FormEvent) {
    e.preventDefault();
    const code = digits.join('');
    if (code.length !== 6) return;
    setError('');
    setStep('password');
  }

  async function handlePasswordSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');

    if (newPassword.length < 6) {
      setError(t('resetPassword.passwordTooShort'));
      return;
    }
    if (newPassword !== confirmPassword) {
      setError(t('resetPassword.passwordMismatch'));
      return;
    }

    setLoading(true);
    try {
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/verify-reset-code`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
          },
          body: JSON.stringify({
            email,
            code: digits.join(''),
            newPassword,
          }),
        }
      );

      const data = await res.json();

      if (data.success) {
        setStep('success');
      } else {
        if (data.error === 'code_expired') {
          setError(t('resetPassword.codeExpired'));
          setStep('code');
        } else if (data.error === 'invalid_code') {
          setError(t('resetPassword.invalidCode'));
          setStep('code');
        } else {
          setError(data.message || t('common.errorOccurred'));
        }
      }
    } catch {
      setError(t('common.errorOccurred'));
    } finally {
      setLoading(false);
    }
  }

  async function handleResend() {
    if (resendCooldown > 0 || !email) return;
    setResendCooldown(60);
    try {
      await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/request-password-reset`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
          },
          body: JSON.stringify({ email, locale }),
        }
      );
    } catch { /* silent */ }
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
          {step === 'code' && (
            <div className="p-8">
              <h1 className="text-2xl font-bold text-slate-800 mb-2">
                {t('resetPassword.enterCodeTitle')}
              </h1>
              <p className="text-slate-500 text-sm mb-8">
                {t('resetPassword.enterCodeSubtitle')}
              </p>

              <form onSubmit={handleCodeSubmit} className="space-y-6">
                <div className="flex justify-center gap-2.5" onPaste={handlePaste}>
                  {digits.map((digit, i) => (
                    <input
                      key={i}
                      ref={(el) => { inputRefs.current[i] = el; }}
                      type="text"
                      inputMode="numeric"
                      maxLength={6}
                      value={digit}
                      onChange={(e) => handleDigitChange(i, e.target.value)}
                      onKeyDown={(e) => handleKeyDown(i, e)}
                      className="w-12 h-14 text-center text-xl font-bold border-2 border-slate-200 rounded-xl focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20 transition-all"
                    />
                  ))}
                </div>

                {error && (
                  <div className="text-red-600 text-sm bg-red-50 border border-red-200 rounded-lg p-3 text-center">
                    {error}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={digits.join('').length !== 6}
                  className="w-full py-3 bg-teal-600 text-white font-semibold rounded-xl hover:bg-teal-700 transition-all shadow-lg shadow-teal-600/25 disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  {t('resetPassword.verifyCode')}
                </button>

                <div className="text-center">
                  <button
                    type="button"
                    onClick={handleResend}
                    disabled={resendCooldown > 0}
                    className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-teal-600 transition-colors disabled:opacity-50"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    {resendCooldown > 0
                      ? `${t('resetPassword.resendIn')} ${resendCooldown}s`
                      : t('resetPassword.resendCode')
                    }
                  </button>
                </div>
              </form>

              <div className="mt-6 text-center">
                <Link
                  to="/forgot-password"
                  className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-teal-600 transition-colors"
                >
                  <ArrowLeft className="w-4 h-4" />
                  {t('resetPassword.backToEmail')}
                </Link>
              </div>
            </div>
          )}

          {step === 'password' && (
            <div className="p-8">
              <h1 className="text-2xl font-bold text-slate-800 mb-2">
                {t('resetPassword.newPasswordTitle')}
              </h1>
              <p className="text-slate-500 text-sm mb-8">
                {t('resetPassword.newPasswordSubtitle')}
              </p>

              <form onSubmit={handlePasswordSubmit} className="space-y-5">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">
                    {t('resetPassword.newPassword')}
                  </label>
                  <div className="relative">
                    <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4.5 h-4.5 text-slate-400" />
                    <input
                      type={showPassword ? 'text' : 'password'}
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      placeholder="••••••••"
                      className="w-full pl-11 pr-11 py-3 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 transition-all"
                      required
                      minLength={6}
                      autoFocus
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">
                    {t('resetPassword.confirmPassword')}
                  </label>
                  <div className="relative">
                    <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4.5 h-4.5 text-slate-400" />
                    <input
                      type={showPassword ? 'text' : 'password'}
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      placeholder="••••••••"
                      className="w-full pl-11 pr-4 py-3 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 transition-all"
                      required
                      minLength={6}
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
                  disabled={loading || !newPassword || !confirmPassword}
                  className="w-full py-3 bg-teal-600 text-white font-semibold rounded-xl hover:bg-teal-700 transition-all shadow-lg shadow-teal-600/25 disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {loading ? (
                    <Loader2 className="w-5 h-5 animate-spin" />
                  ) : (
                    <>
                      <Lock className="w-4 h-4" />
                      {t('resetPassword.setNewPassword')}
                    </>
                  )}
                </button>
              </form>

              <div className="mt-6 text-center">
                <button
                  onClick={() => { setStep('code'); setError(''); }}
                  className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-teal-600 transition-colors"
                >
                  <ArrowLeft className="w-4 h-4" />
                  {t('resetPassword.backToCode')}
                </button>
              </div>
            </div>
          )}

          {step === 'success' && (
            <div className="p-8 text-center">
              <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-green-50 mb-5">
                <CheckCircle2 className="w-8 h-8 text-green-600" />
              </div>
              <h2 className="text-xl font-bold text-slate-800 mb-2">
                {t('resetPassword.successTitle')}
              </h2>
              <p className="text-slate-500 text-sm mb-6">
                {t('resetPassword.successMessage')}
              </p>
              <button
                onClick={() => navigate('/login')}
                className="w-full py-3 bg-teal-600 text-white font-semibold rounded-xl hover:bg-teal-700 transition-all shadow-lg shadow-teal-600/25"
              >
                {t('resetPassword.goToLogin')}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
