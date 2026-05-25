import { useState, useEffect } from 'react';
import {
  AlertTriangle, Trash2, Download, Loader2, ShieldAlert, X,
  UserX, FileText, Package, Truck, CreditCard, Database,
  CheckCircle2, Clock, XCircle, Eye, EyeOff, ArrowLeft,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { useTranslation } from '../i18n';

type Step = 'info' | 'confirm' | 'password' | 'success';

export default function AccountDeletion() {
  const { profile, signOut } = useAuth();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [step, setStep] = useState<Step>('info');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [reason, setReason] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [scheduledDate, setScheduledDate] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [exportDone, setExportDone] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [pendingDeletion, setPendingDeletion] = useState<string | null>(null);

  const isAdmin = profile?.role === 'company_admin';

  useEffect(() => {
    checkPendingDeletion();
  }, [profile]);

  async function checkPendingDeletion() {
    if (!profile) return;

    if (isAdmin && profile.company_id) {
      const { data } = await supabase
        .from('companies')
        .select('deletion_scheduled_for')
        .eq('id', profile.company_id)
        .maybeSingle();
      if (data?.deletion_scheduled_for) {
        setPendingDeletion(data.deletion_scheduled_for);
      }
    } else {
      const { data } = await supabase
        .from('profiles')
        .select('deletion_scheduled_for')
        .eq('id', profile.id)
        .maybeSingle();
      if (data?.deletion_scheduled_for) {
        setPendingDeletion(data.deletion_scheduled_for);
      }
    }
  }

  async function handleExportData() {
    setExporting(true);
    setError(null);
    try {
      const apiUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/export-account-data`;
      const { data: { session } } = await supabase.auth.getSession();
      const resp = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session?.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({}),
      });

      if (!resp.ok) {
        const err = await resp.json().catch(() => ({}));
        throw new Error(err.error || t('accountDeletion.errorExportFailed'));
      }

      const blob = await resp.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `account_data_export_${new Date().toISOString().split('T')[0]}.zip`;
      a.click();
      URL.revokeObjectURL(url);
      setExportDone(true);
    } catch (e: any) {
      setError(e.message || t('accountDeletion.errorExport'));
    } finally {
      setExporting(false);
    }
  }

  async function handleRequestDeletion() {
    setLoading(true);
    setError(null);
    try {
      const apiUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/request-account-deletion`;
      const { data: { session } } = await supabase.auth.getSession();
      const resp = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session?.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ password, reason }),
      });

      const result = await resp.json();
      if (!resp.ok) {
        throw new Error(result.error || t('accountDeletion.errorRequestFailed'));
      }

      setScheduledDate(result.scheduled_for);
      setStep('success');
    } catch (e: any) {
      setError(e.message || t('accountDeletion.errorUnexpected'));
    } finally {
      setLoading(false);
    }
  }

  async function handleCancelDeletion() {
    setCancelling(true);
    setError(null);
    try {
      const apiUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/cancel-account-deletion`;
      const { data: { session } } = await supabase.auth.getSession();
      const resp = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session?.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({}),
      });

      const result = await resp.json();
      if (!resp.ok) {
        throw new Error(result.error || t('accountDeletion.errorCancelFailed'));
      }

      setPendingDeletion(null);
    } catch (e: any) {
      setError(e.message || t('common.error'));
    } finally {
      setCancelling(false);
    }
  }

  function formatDate(d: string) {
    return new Date(d).toLocaleDateString('de-DE', {
      day: '2-digit', month: '2-digit', year: 'numeric',
    });
  }

  function daysRemaining(d: string) {
    const diff = new Date(d).getTime() - Date.now();
    return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
  }

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4">
      <div className="max-w-2xl mx-auto space-y-6">
        {/* Back button */}
        <button
          onClick={() => navigate(-1)}
          className="inline-flex items-center gap-2 text-sm text-gray-600 hover:text-gray-900 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          {t('common.back')}
        </button>

        {/* Header */}
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 bg-red-100 rounded-xl flex items-center justify-center flex-shrink-0">
            <UserX className="w-6 h-6 text-red-600" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{t('accountDeletion.title')}</h1>
            <p className="text-sm text-gray-500 mt-1">
              {t('accountDeletion.subtitle')}
            </p>
          </div>
        </div>

        {/* Pending deletion banner */}
        {pendingDeletion && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-5 space-y-4">
            <div className="flex items-start gap-3">
              <Clock className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
              <div>
                <h3 className="text-sm font-bold text-amber-900">
                  {t('accountDeletion.pendingTitle')}
                </h3>
                <p className="text-sm text-amber-800 mt-1">
                  {t('accountDeletion.pendingBodyPrefix')} <strong>{formatDate(pendingDeletion)}</strong> ({daysRemaining(pendingDeletion)} {t('accountDeletion.daysRemaining')}).
                  {' '}{t('accountDeletion.pendingBodySuffix')}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3 ml-8">
              <button
                onClick={handleCancelDeletion}
                disabled={cancelling}
                className="inline-flex items-center gap-2 px-4 py-2.5 bg-white border border-amber-300 text-amber-800 rounded-lg hover:bg-amber-100 font-medium text-sm transition-colors"
              >
                {cancelling ? <Loader2 className="w-4 h-4 animate-spin" /> : <XCircle className="w-4 h-4" />}
                {t('accountDeletion.cancelDeletion')}
              </button>
              <button
                onClick={handleExportData}
                disabled={exporting}
                className="inline-flex items-center gap-2 px-4 py-2.5 bg-white border border-gray-200 text-gray-700 rounded-lg hover:bg-gray-50 font-medium text-sm transition-colors"
              >
                {exporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                {t('accountDeletion.exportShort')}
              </button>
            </div>
          </div>
        )}

        {/* Main content - only show if no pending deletion */}
        {!pendingDeletion && (
          <>
            {step === 'info' && (
              <div className="space-y-5">
                {/* Warning box */}
                <div className="bg-red-50 border border-red-200 rounded-xl p-5">
                  <div className="flex gap-3">
                    <ShieldAlert className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
                    <div>
                      <p className="text-sm font-bold text-red-900">{t('accountDeletion.warningTitle')}</p>
                      <p className="text-sm text-red-800 mt-1">
                        {t('accountDeletion.warningBody')}
                      </p>
                    </div>
                  </div>
                </div>

                {/* What gets deleted */}
                <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
                  <h3 className="text-base font-semibold text-gray-900">{t('accountDeletion.whatGetsDeletedTitle')}</h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <DeleteItem icon={UserX} label={t('accountDeletion.itemProfile')} />
                    <DeleteItem icon={CreditCard} label={t('accountDeletion.itemInvoices')} />
                    <DeleteItem icon={FileText} label={t('accountDeletion.itemDeliveries')} />
                    <DeleteItem icon={Package} label={t('accountDeletion.itemStock')} />
                    <DeleteItem icon={Database} label={t('accountDeletion.itemDocuments')} />
                    {isAdmin && (
                      <DeleteItem icon={Truck} label={t('accountDeletion.itemEmployees')} highlight />
                    )}
                  </div>
                </div>

                {/* Admin cascade warning */}
                {isAdmin && (
                  <div className="bg-orange-50 border border-orange-200 rounded-xl p-5">
                    <div className="flex gap-3">
                      <AlertTriangle className="w-5 h-5 text-orange-600 flex-shrink-0 mt-0.5" />
                      <div>
                        <p className="text-sm font-bold text-orange-900">{t('accountDeletion.adminCascadeTitle')}</p>
                        <p className="text-sm text-orange-800 mt-1">
                          {t('accountDeletion.adminCascadeBody')}
                        </p>
                      </div>
                    </div>
                  </div>
                )}

                {/* How it works */}
                <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
                  <h3 className="text-base font-semibold text-gray-900">{t('accountDeletion.howItWorksTitle')}</h3>
                  <div className="space-y-3">
                    <ProcessStep num={1} text={t('accountDeletion.step1')} />
                    <ProcessStep num={2} text={t('accountDeletion.step2')} />
                    <ProcessStep num={3} text={t('accountDeletion.step3')} />
                  </div>
                </div>

                {/* Export recommendation */}
                <div className="bg-blue-50 border border-blue-200 rounded-xl p-5">
                  <div className="flex gap-3">
                    <Download className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
                    <div className="flex-1">
                      <p className="text-sm font-bold text-blue-900">{t('accountDeletion.exportTitle')}</p>
                      <p className="text-sm text-blue-800 mt-1">
                        {t('accountDeletion.exportBody')}
                      </p>
                      <button
                        onClick={handleExportData}
                        disabled={exporting}
                        className="inline-flex items-center gap-2 mt-3 px-4 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium text-sm transition-colors disabled:opacity-50"
                      >
                        {exporting ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : exportDone ? (
                          <CheckCircle2 className="w-4 h-4" />
                        ) : (
                          <Download className="w-4 h-4" />
                        )}
                        {exporting ? t('accountDeletion.exportingProgress') : exportDone ? t('accountDeletion.exportSuccess') : t('accountDeletion.exportButton')}
                      </button>
                    </div>
                  </div>
                </div>

                {/* Reason (optional) */}
                <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-3">
                  <label htmlFor="deletion-reason" className="block text-sm font-medium text-gray-700">
                    {t('accountDeletion.reasonLabel')}
                  </label>
                  <textarea
                    id="deletion-reason"
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    rows={3}
                    className="w-full px-4 py-3 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-red-500 resize-none"
                    placeholder={t('accountDeletion.reasonPlaceholder')}
                  />
                </div>

                {/* Delete button */}
                <div className="pt-2">
                  <button
                    onClick={() => setStep('confirm')}
                    className="w-full inline-flex items-center justify-center gap-2 px-6 py-3.5 bg-red-600 text-white rounded-xl hover:bg-red-700 font-semibold text-sm transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                    {t('accountDeletion.deleteButton')}
                  </button>
                </div>
              </div>
            )}

            {/* Step 2: Confirmation modal */}
            {step === 'confirm' && (
              <div className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-lg">
                <div className="px-6 py-5 bg-red-50 border-b border-red-100 flex items-center gap-3">
                  <AlertTriangle className="w-5 h-5 text-red-600" />
                  <h2 className="text-lg font-bold text-red-900">{t('accountDeletion.confirmTitle')}</h2>
                </div>
                <div className="p-6 space-y-4">
                  <p className="text-sm text-gray-700 leading-relaxed">
                    {isAdmin ? t('accountDeletion.confirmBodyAdmin') : t('accountDeletion.confirmBody')}
                  </p>
                  <p className="text-sm text-gray-700 leading-relaxed">
                    {t('accountDeletion.confirmBodyCancel')}
                  </p>

                  <div className="flex items-center gap-3 pt-3">
                    <button
                      onClick={() => setStep('info')}
                      className="flex-1 px-4 py-3 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 font-medium text-sm transition-colors"
                    >
                      {t('accountDeletion.confirmNo')}
                    </button>
                    <button
                      onClick={() => setStep('password')}
                      className="flex-1 px-4 py-3 bg-red-600 text-white rounded-lg hover:bg-red-700 font-medium text-sm transition-colors"
                    >
                      {t('accountDeletion.confirmYes')}
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Step 3: Password verification */}
            {step === 'password' && (
              <div className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-lg">
                <div className="px-6 py-5 bg-red-50 border-b border-red-100 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <ShieldAlert className="w-5 h-5 text-red-600" />
                    <h2 className="text-lg font-bold text-red-900">{t('accountDeletion.passwordTitle')}</h2>
                  </div>
                  <button
                    onClick={() => { setStep('info'); setError(null); }}
                    className="p-1 text-gray-400 hover:text-gray-600 rounded"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
                <div className="p-6 space-y-5">
                  <p className="text-sm text-gray-700">
                    {t('accountDeletion.passwordBody')}
                  </p>

                  {error && (
                    <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700 flex items-center gap-2">
                      <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                      {error}
                    </div>
                  )}

                  <div>
                    <label htmlFor="deletion-password" className="block text-xs font-medium text-gray-600 mb-1.5">
                      {t('accountDeletion.passwordLabel')}
                    </label>
                    <div className="relative">
                      <input
                        id="deletion-password"
                        type={showPassword ? 'text' : 'password'}
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        className="w-full px-4 py-3 pr-11 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-red-500"
                        placeholder={t('accountDeletion.passwordPlaceholder')}
                        autoFocus
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && password.trim()) handleRequestDeletion();
                        }}
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                      >
                        {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 pt-2">
                    <button
                      onClick={() => { setStep('info'); setError(null); setPassword(''); }}
                      className="flex-1 px-4 py-3 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 font-medium text-sm transition-colors"
                    >
                      {t('common.cancel')}
                    </button>
                    <button
                      onClick={handleRequestDeletion}
                      disabled={loading || !password.trim()}
                      className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-3 bg-red-600 text-white rounded-lg hover:bg-red-700 font-medium text-sm transition-colors disabled:opacity-50"
                    >
                      {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                      {t('accountDeletion.passwordConfirm')}
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Step 4: Success */}
            {step === 'success' && (
              <div className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-lg">
                <div className="px-6 py-5 bg-amber-50 border-b border-amber-100 flex items-center gap-3">
                  <Clock className="w-5 h-5 text-amber-600" />
                  <h2 className="text-lg font-bold text-amber-900">{t('accountDeletion.successTitle')}</h2>
                </div>
                <div className="p-6 space-y-4">
                  <div className="flex items-center gap-3 p-4 bg-amber-50 rounded-lg border border-amber-200">
                    <CheckCircle2 className="w-5 h-5 text-amber-600 flex-shrink-0" />
                    <p className="text-sm text-amber-900 font-medium">
                      {t('accountDeletion.successBodyPrefix')} {scheduledDate ? formatDate(scheduledDate) : t('accountDeletion.in30Days')}.
                    </p>
                  </div>

                  <p className="text-sm text-gray-600">
                    {t('accountDeletion.success30Days')}
                  </p>

                  <p className="text-sm text-gray-600">
                    {t('accountDeletion.successUsage')}
                  </p>

                  <div className="flex items-center gap-3 pt-3">
                    <button
                      onClick={() => navigate(-1)}
                      className="flex-1 px-4 py-3 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 font-medium text-sm transition-colors"
                    >
                      {t('accountDeletion.backToDashboard')}
                    </button>
                    <button
                      onClick={() => { signOut(); navigate('/login'); }}
                      className="flex-1 px-4 py-3 bg-gray-800 text-white rounded-lg hover:bg-gray-900 font-medium text-sm transition-colors"
                    >
                      {t('common.logout')}
                    </button>
                  </div>
                </div>
              </div>
            )}
          </>
        )}

        {/* Error display */}
        {error && step !== 'password' && (
          <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 flex-shrink-0" />
            {error}
          </div>
        )}

        {/* Legal note */}
        <div className="text-center text-xs text-gray-400 pt-4 pb-8">
          <p>{t('accountDeletion.legalLine1')}</p>
          <p>{t('accountDeletion.legalLine2')}</p>
        </div>
      </div>
    </div>
  );
}

function DeleteItem({ icon: Icon, label, highlight }: { icon: typeof UserX; label: string; highlight?: boolean }) {
  return (
    <div className={`flex items-center gap-3 p-3 rounded-lg border ${highlight ? 'bg-orange-50 border-orange-200' : 'bg-gray-50 border-gray-100'}`}>
      <Icon className={`w-4 h-4 flex-shrink-0 ${highlight ? 'text-orange-600' : 'text-gray-500'}`} />
      <span className={`text-sm ${highlight ? 'text-orange-800 font-medium' : 'text-gray-700'}`}>{label}</span>
    </div>
  );
}

function ProcessStep({ num, text }: { num: number; text: string }) {
  return (
    <div className="flex items-start gap-3">
      <div className="w-6 h-6 rounded-full bg-gray-200 flex items-center justify-center flex-shrink-0 mt-0.5">
        <span className="text-xs font-bold text-gray-600">{num}</span>
      </div>
      <p className="text-sm text-gray-700">{text}</p>
    </div>
  );
}
