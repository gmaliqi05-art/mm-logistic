// New component: OurRoleSelector
// Allows the user to choose which role the company plays in this delivery.
// Place at: src/components/delivery/OurRoleSelector.tsx

import { ArrowUpRight, ArrowDownLeft, Truck, PackageOpen, PackageCheck, Repeat } from 'lucide-react';
import { useLanguage } from '../../i18n';

export type OurRole = 'consignor' | 'consignee' | 'carrier' | 'custodian_in' | 'custodian_out' | 'internal_transfer';

interface Props {
  value: OurRole;
  onChange: (role: OurRole) => void;
  disabled?: boolean;
  compact?: boolean;
}

interface RoleOption {
  value: OurRole;
  icon: typeof ArrowUpRight;
  labelKey: string;
  descKey: string;
  color: string;
  bg: string;
  border: string;
}

const ROLE_OPTIONS: RoleOption[] = [
  {
    value: 'consignor',
    icon: ArrowUpRight,
    labelKey: 'ourRole.consignor.label',
    descKey: 'ourRole.consignor.desc',
    color: 'text-blue-700',
    bg: 'bg-blue-50',
    border: 'border-blue-200',
  },
  {
    value: 'consignee',
    icon: ArrowDownLeft,
    labelKey: 'ourRole.consignee.label',
    descKey: 'ourRole.consignee.desc',
    color: 'text-orange-700',
    bg: 'bg-orange-50',
    border: 'border-orange-200',
  },
  {
    value: 'carrier',
    icon: Truck,
    labelKey: 'ourRole.carrier.label',
    descKey: 'ourRole.carrier.desc',
    color: 'text-purple-700',
    bg: 'bg-purple-50',
    border: 'border-purple-200',
  },
  {
    value: 'custodian_in',
    icon: PackageOpen,
    labelKey: 'ourRole.custodianIn.label',
    descKey: 'ourRole.custodianIn.desc',
    color: 'text-amber-700',
    bg: 'bg-amber-50',
    border: 'border-amber-200',
  },
  {
    value: 'custodian_out',
    icon: PackageCheck,
    labelKey: 'ourRole.custodianOut.label',
    descKey: 'ourRole.custodianOut.desc',
    color: 'text-amber-700',
    bg: 'bg-amber-50',
    border: 'border-amber-200',
  },
  {
    value: 'internal_transfer',
    icon: Repeat,
    labelKey: 'ourRole.internalTransfer.label',
    descKey: 'ourRole.internalTransfer.desc',
    color: 'text-slate-700',
    bg: 'bg-slate-50',
    border: 'border-slate-200',
  },
];

export default function OurRoleSelector({ value, onChange, disabled, compact = false }: Props) {
  const { t } = useLanguage();

  return (
    <div className="space-y-2">
      <label className="text-sm font-medium text-slate-700">
        {t('ourRole.title')}
      </label>
      <div className={`grid gap-2 ${compact ? 'grid-cols-2' : 'grid-cols-2 md:grid-cols-3'}`}>
        {ROLE_OPTIONS.map((opt) => {
          const Icon = opt.icon;
          const selected = value === opt.value;
          return (
            <button
              key={opt.value}
              type="button"
              disabled={disabled}
              onClick={() => onChange(opt.value)}
              className={`text-left p-3 rounded-lg border-2 transition-all ${
                selected
                  ? `${opt.bg} ${opt.border} ring-2 ring-offset-1 ring-current ${opt.color}`
                  : 'border-slate-200 bg-white hover:bg-slate-50'
              } ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
            >
              <div className="flex items-start gap-2">
                <div className={`p-1.5 rounded ${selected ? opt.bg : 'bg-slate-100'}`}>
                  <Icon className={`w-4 h-4 ${selected ? opt.color : 'text-slate-500'}`} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className={`text-sm font-semibold ${selected ? opt.color : 'text-slate-900'}`}>
                    {t(opt.labelKey)}
                  </div>
                  {!compact && (
                    <div className="text-xs text-slate-600 mt-0.5">
                      {t(opt.descKey)}
                    </div>
                  )}
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
