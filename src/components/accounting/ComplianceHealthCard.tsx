import { ShieldCheck, CalendarClock, Landmark, Globe as Globe2 } from 'lucide-react';
import { useCompliance } from '../../hooks/useCompliance';
import { useTranslation } from '../../i18n';
import type { Language } from '../../i18n';
import {
  chartOfAccounts,
  currency,
  taxAuthority,
  vatReducedRate,
  vatStandardRate,
} from '../../lib/complianceEngine';

const LOCALE_MAP: Record<Language, string> = {
  sq: 'sq-AL',
  en: 'en-GB',
  de: 'de-DE',
  fr: 'fr-FR',
};

function nextUstvaDeadline(today: Date): Date {
  const d = new Date(today.getFullYear(), today.getMonth(), 10);
  if (today.getDate() > 10) d.setMonth(d.getMonth() + 1);
  return d;
}

export default function ComplianceHealthCard() {
  const { ctx, loading } = useCompliance();
  const { t, language } = useTranslation();

  if (loading) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 p-5 animate-pulse h-40" />
    );
  }

  if (!ctx.country_code) {
    return (
      <div className="bg-amber-50 border border-amber-200 rounded-xl p-5">
        <div className="flex items-center gap-2 mb-1">
          <Globe2 className="w-4 h-4 text-amber-600" />
          <p className="text-sm font-semibold text-amber-800">
            {t('accounting.compliance.countryNotSet')}
          </p>
        </div>
        <p className="text-xs text-amber-700">
          {t('accounting.compliance.countryNotSetHint')}
        </p>
      </div>
    );
  }

  const coa = chartOfAccounts(ctx);
  const std = vatStandardRate(ctx);
  const red = vatReducedRate(ctx);
  const cur = currency(ctx);
  const authority = taxAuthority(ctx);

  const deadline =
    ctx.country_code === 'DE' ? nextUstvaDeadline(new Date()) : null;
  const deadlineLabel = deadline
    ? deadline.toLocaleDateString(LOCALE_MAP[language], {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
      })
    : null;

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <div className="bg-emerald-500 p-2 rounded-lg">
            <ShieldCheck className="w-4 h-4 text-white" />
          </div>
          <div>
            <p className="text-sm font-semibold text-gray-900">
              {t('accounting.compliance.title')}
            </p>
            <p className="text-xs text-gray-500">
              {ctx.country_name ?? ctx.country_code} &middot; {t('accounting.compliance.rulePackActive')}
            </p>
          </div>
        </div>
        <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-emerald-50 text-emerald-700 text-xs font-medium">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
          {ctx.country_code}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-3 text-xs">
        <div className="border border-gray-100 rounded-lg p-3">
          <p className="text-gray-500 uppercase tracking-wide text-[10px]">
            {t('accounting.compliance.chartOfAccounts')}
          </p>
          <p className="text-gray-900 font-semibold mt-1">
            {coa?.code ?? '—'}
          </p>
          {coa?.name && <p className="text-gray-500 mt-0.5">{coa.name}</p>}
        </div>

        <div className="border border-gray-100 rounded-lg p-3">
          <p className="text-gray-500 uppercase tracking-wide text-[10px]">
            {t('accounting.compliance.vatRates')}
          </p>
          <p className="text-gray-900 font-semibold mt-1">
            {std !== null ? `${std}%` : '—'}
            {red !== null && (
              <span className="text-gray-400 font-normal"> / {red}%</span>
            )}
          </p>
          <p className="text-gray-500 mt-0.5">{cur.code}</p>
        </div>

        <div className="border border-gray-100 rounded-lg p-3 col-span-2">
          <div className="flex items-center gap-2 mb-1">
            <Landmark className="w-3.5 h-3.5 text-gray-400" />
            <p className="text-gray-500 uppercase tracking-wide text-[10px]">
              {t('accounting.compliance.taxAuthority')}
            </p>
          </div>
          <p className="text-gray-900 font-semibold">
            {authority?.name ?? '—'}
          </p>
          {authority?.exports?.length ? (
            <div className="flex gap-1 mt-2 flex-wrap">
              {authority.exports.map((e) => (
                <span
                  key={e}
                  className="px-1.5 py-0.5 rounded bg-gray-100 text-gray-700 text-[10px] font-medium"
                >
                  {e}
                </span>
              ))}
            </div>
          ) : null}
        </div>

        {deadlineLabel && (
          <div className="border border-blue-100 bg-blue-50 rounded-lg p-3 col-span-2">
            <div className="flex items-center gap-2">
              <CalendarClock className="w-3.5 h-3.5 text-blue-600" />
              <p className="text-blue-900 text-[11px] font-medium">
                {t('accounting.compliance.nextDeadline')}: {deadlineLabel}
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
