import { AlertTriangle, ExternalLink } from 'lucide-react';
import { lucidStatus, type LucidInput } from '../../utils/lucid';
import { useTranslation } from '../../i18n';

interface LucidWarningBannerProps extends LucidInput {
  /** When set, replaces the default "open settings" CTA with this href. */
  ctaHref?: string;
  /** Optional className to layout the banner in a page. */
  className?: string;
}

/**
 * Warning banner shown to DE companies that have not completed their
 * LUCID / VerpackG registration. Silent for non-DE companies and for
 * fully-registered DE companies. The warning text is matched to the
 * exact status (missing / invalid_format / missing_date) so the
 * operator can fix the right field in the company settings.
 *
 * Background:
 *   §34 VerpackG fines up to €200,000 per violation for distributors
 *   that place packaging on the German market without ZSVR
 *   registration. Pool participants are exempted from system
 *   participation under §12 but NOT from registration itself.
 */
export default function LucidWarningBanner({
  country,
  lucid_registration_number,
  lucid_registered_at,
  ctaHref,
  className,
}: LucidWarningBannerProps) {
  const { t } = useTranslation();
  const status = lucidStatus({ country, lucid_registration_number, lucid_registered_at });

  if (status === 'not_applicable' || status === 'ok') return null;

  const messageKey =
    status === 'missing'
      ? 'compliance.lucid.warning.missing'
      : status === 'invalid_format'
        ? 'compliance.lucid.warning.invalidFormat'
        : 'compliance.lucid.warning.missingDate';

  return (
    <div
      className={`bg-amber-50 border border-amber-300 rounded-lg p-4 ${className ?? ''}`}
      role="alert"
    >
      <div className="flex items-start gap-3">
        <AlertTriangle className="w-5 h-5 text-amber-600 mt-0.5 flex-shrink-0" />
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-semibold text-amber-900">
            {t('compliance.lucid.warning.title')}
          </h3>
          <p className="mt-1 text-sm text-amber-800">{t(messageKey)}</p>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            {ctaHref && (
              <a
                href={ctaHref}
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-amber-900 hover:text-amber-950 underline"
              >
                {t('compliance.lucid.warning.cta')}
              </a>
            )}
            <a
              href="https://lucid.verpackungsregister.org/"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-xs text-amber-800 hover:text-amber-900"
            >
              <ExternalLink className="w-3 h-3" />
              {t('compliance.lucid.warning.openLucid')}
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
