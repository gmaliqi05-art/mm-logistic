import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Shield, ShieldCheck, ShieldOff, ArrowLeft, Loader2, KeyRound, CheckCircle2, AlertTriangle } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { useTranslation } from '../i18n';
import { logger } from '../utils/logger';

interface Factor {
  id: string;
  friendly_name: string | null;
  factor_type: string;
  status: string;
  created_at: string;
}

export default function SecuritySettings() {
  const { profile } = useAuth();
  const { t } = useTranslation();
  const [factors, setFactors] = useState<Factor[]>([]);
  const [loading, setLoading] = useState(true);
  const [enrolling, setEnrolling] = useState(false);
  const [enrollment, setEnrollment] = useState<{ factorId: string; qr: string; secret: string } | null>(null);
  const [verifyCode, setVerifyCode] = useState('');
  const [verifying, setVerifying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const refresh = async () => {
    setLoading(true);
    const { data, error: err } = await supabase.auth.mfa.listFactors();
    if (err) {
      logger.error('Failed to list MFA factors', { error: err });
      setError(err.message);
    } else {
      setFactors((data?.all ?? []) as Factor[]);
    }
    setLoading(false);
  };

  useEffect(() => {
    refresh();
  }, []);

  const startEnroll = async () => {
    setError(null);
    setSuccess(null);
    setEnrolling(true);
    const { data, error: err } = await supabase.auth.mfa.enroll({
      factorType: 'totp',
      friendlyName: `MM Logistic ${new Date().toISOString().slice(0, 10)}`,
    });
    setEnrolling(false);
    if (err || !data) {
      setError(err?.message || 'Failed to start enrollment');
      return;
    }
    setEnrollment({
      factorId: data.id,
      qr: data.totp.qr_code,
      secret: data.totp.secret,
    });
  };

  const verifyEnroll = async () => {
    if (!enrollment) return;
    setVerifying(true);
    setError(null);
    const challenge = await supabase.auth.mfa.challenge({ factorId: enrollment.factorId });
    if (challenge.error || !challenge.data) {
      setError(challenge.error?.message || 'Challenge failed');
      setVerifying(false);
      return;
    }
    const verify = await supabase.auth.mfa.verify({
      factorId: enrollment.factorId,
      challengeId: challenge.data.id,
      code: verifyCode,
    });
    setVerifying(false);
    if (verify.error) {
      setError(verify.error.message);
      return;
    }
    setEnrollment(null);
    setVerifyCode('');
    setSuccess(t('common.twoFactorEnabledSuccess'));
    await refresh();
  };

  const cancelEnroll = async () => {
    if (enrollment) {
      await supabase.auth.mfa.unenroll({ factorId: enrollment.factorId });
    }
    setEnrollment(null);
    setVerifyCode('');
    setError(null);
  };

  const removeFactor = async (factorId: string) => {
    if (!window.confirm(t('common.remove2faConfirm'))) return;
    setError(null);
    const { error: err } = await supabase.auth.mfa.unenroll({ factorId });
    if (err) {
      setError(err.message);
      return;
    }
    setSuccess('Authenticator removed.');
    await refresh();
  };

  const verifiedFactors = factors.filter((f) => f.status === 'verified');
  const hasMfa = verifiedFactors.length > 0;
  const enforcedRole = profile?.role === 'super_admin' || profile?.role === 'company_admin';

  return (
    <div className="min-h-screen bg-slate-50 py-10 px-4">
      <div className="max-w-3xl mx-auto">
        <Link to="/" className="inline-flex items-center gap-2 text-sm text-slate-600 hover:text-slate-900 mb-6">
          <ArrowLeft className="w-4 h-4" /> Back
        </Link>

        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="px-8 py-6 border-b border-slate-200 bg-gradient-to-br from-slate-900 to-slate-800">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-xl bg-white/10 flex items-center justify-center">
                <Shield className="w-6 h-6 text-white" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-white">Security</h1>
                <p className="text-sm text-slate-300">{t('common.protectAccountWith2fa')}</p>
              </div>
            </div>
          </div>

          <div className="p-8 space-y-6">
            {enforcedRole && !hasMfa && (
              <div className="flex items-start gap-3 p-4 rounded-xl bg-amber-50 border border-amber-200">
                <AlertTriangle className="w-5 h-5 text-amber-700 flex-shrink-0 mt-0.5" />
                <div className="text-sm text-amber-900">
                  <p className="font-semibold">{t('common.twoFactorRequiredForRole')}</p>
                  <p className="mt-1">{t('common.enableNowKeepAdminAccess')}</p>
                </div>
              </div>
            )}

            {error && (
              <div className="flex items-start gap-3 p-4 rounded-xl bg-red-50 border border-red-200 text-sm text-red-800">
                <AlertTriangle className="w-5 h-5 flex-shrink-0 mt-0.5" />
                <div>{error}</div>
              </div>
            )}
            {success && (
              <div className="flex items-start gap-3 p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-sm text-emerald-800">
                <CheckCircle2 className="w-5 h-5 flex-shrink-0 mt-0.5" />
                <div>{success}</div>
              </div>
            )}

            <section>
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h2 className="text-lg font-semibold text-slate-900">Authenticator app (TOTP)</h2>
                  <p className="text-sm text-slate-600 mt-1">{t('common.useAuthenticatorApps')}</p>
                </div>
                {hasMfa ? (
                  <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800">
                    <ShieldCheck className="w-3.5 h-3.5" /> Active
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-semibold bg-slate-200 text-slate-700">
                    <ShieldOff className="w-3.5 h-3.5" /> Disabled
                  </span>
                )}
              </div>

              {loading ? (
                <div className="flex items-center gap-2 text-sm text-slate-500">
                  <Loader2 className="w-4 h-4 animate-spin" /> Loading...
                </div>
              ) : enrollment ? (
                <div className="space-y-4 p-5 rounded-xl border border-slate-200 bg-slate-50">
                  <p className="text-sm text-slate-700">{t('common.scanQrAndEnterCode')}</p>
                  <div className="flex flex-col sm:flex-row gap-5 items-start">
                    <img src={enrollment.qr} alt="TOTP QR code" className="w-48 h-48 rounded-lg bg-white p-2 border border-slate-200" />
                    <div className="flex-1">
                      <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Secret (manual entry)</label>
                      <code className="block mt-1 text-xs font-mono bg-white border border-slate-200 rounded-md px-3 py-2 break-all">{enrollment.secret}</code>

                      <label className="block mt-4 text-sm font-medium text-slate-700">Verification code</label>
                      <input
                        value={verifyCode}
                        onChange={(e) => setVerifyCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                        placeholder="123456"
                        inputMode="numeric"
                        className="mt-1 w-full px-4 py-2.5 rounded-lg border border-slate-300 focus:ring-2 focus:ring-teal-500 focus:border-teal-500 tracking-[0.4em] text-center font-mono text-lg"
                      />
                      <div className="flex gap-2 mt-4">
                        <button
                          onClick={verifyEnroll}
                          disabled={verifyCode.length !== 6 || verifying}
                          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-teal-600 text-white font-semibold hover:bg-teal-700 disabled:opacity-50"
                        >
                          {verifying ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                          Verify & activate
                        </button>
                        <button
                          onClick={cancelEnroll}
                          className="px-4 py-2 rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-100"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              ) : hasMfa ? (
                <div className="space-y-3">
                  {verifiedFactors.map((f) => (
                    <div key={f.id} className="flex items-center justify-between p-4 rounded-xl border border-slate-200 bg-white">
                      <div>
                        <div className="flex items-center gap-2">
                          <KeyRound className="w-4 h-4 text-teal-600" />
                          <span className="font-medium text-slate-900">{f.friendly_name || 'Authenticator'}</span>
                        </div>
                        <div className="text-xs text-slate-500 mt-1">Added {new Date(f.created_at).toLocaleDateString()}</div>
                      </div>
                      <button
                        onClick={() => removeFactor(f.id)}
                        className="text-sm font-medium text-red-600 hover:text-red-700"
                      >
                        Remove
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <button
                  onClick={startEnroll}
                  disabled={enrolling}
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-teal-600 text-white font-semibold hover:bg-teal-700 disabled:opacity-50"
                >
                  {enrolling ? <Loader2 className="w-4 h-4 animate-spin" /> : <Shield className="w-4 h-4" />}
                  Enable 2FA
                </button>
              )}
            </section>
          </div>
        </div>
      </div>
    </div>
  );
}
