/**
 * Empty-state placeholder with optional CTA. Replaces the bare
 * "Nuk ka X" text that used to sit inside otherwise-empty tables —
 * a fresh tenant landing on Invoices or Contacts now sees a clear
 * "Create your first invoice" button instead of an apparent dead end.
 *
 * Typical usage:
 *   <EmptyState
 *     icon={FileText}
 *     title={t('accounting.invoices.noInvoices')}
 *     hint={t('accounting.invoices.noInvoicesHint')}
 *     action={{
 *       label: t('accounting.invoices.create'),
 *       onClick: () => setShowForm(true),
 *     }}
 *   />
 */

import type { LucideIcon } from 'lucide-react';

interface EmptyStateAction {
  label: string;
  onClick: () => void;
  icon?: LucideIcon;
}

interface EmptyStateProps {
  icon?: LucideIcon;
  title: string;
  hint?: string;
  action?: EmptyStateAction;
  /** When true, renders a compact variant for inline use inside cards. */
  compact?: boolean;
}

export default function EmptyState({
  icon: Icon,
  title,
  hint,
  action,
  compact = false,
}: EmptyStateProps) {
  return (
    <div
      className={`flex flex-col items-center justify-center text-center ${
        compact ? 'py-8' : 'py-16'
      }`}
    >
      {Icon && (
        <div
          className={`flex items-center justify-center rounded-full bg-slate-100 text-slate-400 mb-3 ${
            compact ? 'w-12 h-12' : 'w-16 h-16'
          }`}
        >
          <Icon className={compact ? 'w-6 h-6' : 'w-8 h-8'} />
        </div>
      )}
      <p
        className={`font-semibold text-slate-700 ${
          compact ? 'text-sm' : 'text-base'
        }`}
      >
        {title}
      </p>
      {hint && (
        <p
          className={`text-slate-500 mt-1 max-w-md ${
            compact ? 'text-xs' : 'text-sm'
          }`}
        >
          {hint}
        </p>
      )}
      {action && (
        <button
          onClick={action.onClick}
          className="mt-5 inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-emerald-600 text-white text-sm font-semibold hover:bg-emerald-700 transition-colors"
        >
          {action.icon && <action.icon className="w-4 h-4" />}
          {action.label}
        </button>
      )}
    </div>
  );
}
