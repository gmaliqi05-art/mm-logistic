/**
 * GDPR / TTDSG cookie consent banner.
 *
 * Strictly necessary cookies (auth, language, consent) are always
 * active — those don't require consent under § 25 Abs 2 Nr 2 TTDSG.
 * Functional and analytics buckets default to off and can be toggled
 * in the "Customize" view.
 *
 * Persistence: writes `ep_consent` (the key documented in the
 * legal/cookies.ts policy) to localStorage as JSON. Other components
 * read it via `useCookieConsent()`.
 */

import { useEffect, useState } from 'react';
import { Cookie, Settings as SettingsIcon, X } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useTranslation } from '../i18n';

const STORAGE_KEY = 'ep_consent';
const CONSENT_VERSION = 1;

export interface CookieConsent {
  version: number;
  necessary: true;
  functional: boolean;
  analytics: boolean;
  marketing: boolean;
  decided_at: string;
}

function readConsent(): CookieConsent | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<CookieConsent>;
    if (parsed.version !== CONSENT_VERSION) return null;
    return parsed as CookieConsent;
  } catch {
    return null;
  }
}

function writeConsent(consent: Omit<CookieConsent, 'version' | 'necessary' | 'decided_at'>) {
  const full: CookieConsent = {
    version: CONSENT_VERSION,
    necessary: true,
    decided_at: new Date().toISOString(),
    ...consent,
  };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(full));
  window.dispatchEvent(new CustomEvent('cookie-consent-changed', { detail: full }));
}

export function useCookieConsent(): CookieConsent | null {
  const [consent, setConsent] = useState<CookieConsent | null>(() => readConsent());
  useEffect(() => {
    function handler(e: Event) {
      const detail = (e as CustomEvent<CookieConsent>).detail;
      setConsent(detail);
    }
    window.addEventListener('cookie-consent-changed', handler);
    return () => window.removeEventListener('cookie-consent-changed', handler);
  }, []);
  return consent;
}

export default function CookieConsentBanner() {
  const { t } = useTranslation();
  const [visible, setVisible] = useState(false);
  const [showCustomize, setShowCustomize] = useState(false);
  const [functional, setFunctional] = useState(true);
  const [analytics, setAnalytics] = useState(false);
  const [marketing, setMarketing] = useState(false);

  useEffect(() => {
    if (!readConsent()) {
      // Defer so it doesn't fight with the install prompt / push prompt.
      const t = setTimeout(() => setVisible(true), 800);
      return () => clearTimeout(t);
    }
  }, []);

  if (!visible) return null;

  const acceptAll = () => {
    writeConsent({ functional: true, analytics: true, marketing: true });
    setVisible(false);
  };
  const rejectNonEssential = () => {
    writeConsent({ functional: false, analytics: false, marketing: false });
    setVisible(false);
  };
  const saveChoices = () => {
    writeConsent({ functional, analytics, marketing });
    setVisible(false);
  };

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 px-4 pb-4 sm:pb-6 print:hidden">
      <div className="mx-auto max-w-4xl rounded-2xl bg-white shadow-2xl border border-slate-200 overflow-hidden">
        <div className="flex items-start gap-3 p-5 border-b border-slate-100">
          <div className="w-10 h-10 rounded-full bg-amber-100 text-amber-700 flex items-center justify-center flex-shrink-0">
            <Cookie className="w-5 h-5" />
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-sm font-bold text-slate-900 mb-1">
              {t('cookies.banner.title')}
            </h2>
            <p className="text-xs text-slate-600 leading-relaxed">
              {t('cookies.banner.intro')}{' '}
              <Link to="/legal/cookies" className="text-emerald-700 underline hover:text-emerald-900">
                {t('cookies.banner.learnMore')}
              </Link>
            </p>
          </div>
          <button
            onClick={rejectNonEssential}
            aria-label={t('common.close')}
            className="p-1.5 -mt-1 -mr-1 text-slate-400 hover:text-slate-700 rounded-lg hover:bg-slate-100"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {showCustomize && (
          <div className="px-5 py-4 space-y-3 bg-slate-50 border-b border-slate-100">
            <ToggleRow
              label={t('cookies.banner.necessary')}
              description={t('cookies.banner.necessaryDesc')}
              checked
              disabled
              onChange={() => {}}
            />
            <ToggleRow
              label={t('cookies.banner.functional')}
              description={t('cookies.banner.functionalDesc')}
              checked={functional}
              onChange={setFunctional}
            />
            <ToggleRow
              label={t('cookies.banner.analytics')}
              description={t('cookies.banner.analyticsDesc')}
              checked={analytics}
              onChange={setAnalytics}
            />
            <ToggleRow
              label={t('cookies.banner.marketing')}
              description={t('cookies.banner.marketingDesc')}
              checked={marketing}
              onChange={setMarketing}
            />
          </div>
        )}

        <div className="p-4 flex flex-col sm:flex-row gap-2 sm:items-center sm:justify-end">
          {!showCustomize ? (
            <>
              <button
                onClick={() => setShowCustomize(true)}
                className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg border border-slate-300 text-slate-700 text-sm font-medium hover:bg-slate-50"
              >
                <SettingsIcon className="w-4 h-4" />
                {t('cookies.banner.customize')}
              </button>
              <button
                onClick={rejectNonEssential}
                className="px-4 py-2 rounded-lg border border-slate-300 text-slate-700 text-sm font-medium hover:bg-slate-50"
              >
                {t('cookies.banner.rejectAll')}
              </button>
              <button
                onClick={acceptAll}
                className="px-4 py-2 rounded-lg bg-emerald-600 text-white text-sm font-semibold hover:bg-emerald-700"
              >
                {t('cookies.banner.acceptAll')}
              </button>
            </>
          ) : (
            <>
              <button
                onClick={() => setShowCustomize(false)}
                className="px-4 py-2 rounded-lg border border-slate-300 text-slate-700 text-sm font-medium hover:bg-slate-50"
              >
                {t('common.back')}
              </button>
              <button
                onClick={saveChoices}
                className="px-4 py-2 rounded-lg bg-emerald-600 text-white text-sm font-semibold hover:bg-emerald-700"
              >
                {t('cookies.banner.saveChoices')}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function ToggleRow({
  label,
  description,
  checked,
  disabled,
  onChange,
}: {
  label: string;
  description: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-start gap-3">
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={`mt-0.5 relative inline-flex h-5 w-9 flex-shrink-0 rounded-full transition-colors
          ${checked ? 'bg-emerald-600' : 'bg-slate-300'}
          ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
      >
        <span
          className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform
            ${checked ? 'translate-x-4' : 'translate-x-0.5'} mt-0.5`}
        />
      </button>
      <div className="flex-1 min-w-0">
        <div className="text-xs font-semibold text-slate-900">{label}</div>
        <div className="text-[11px] text-slate-600 leading-snug">{description}</div>
      </div>
    </div>
  );
}
