import { X, ShoppingCart, Receipt, Briefcase, Truck, PackageCheck, FileText, ArrowRight } from 'lucide-react';
import { useTranslation } from '../../i18n';

export type ScanDocKind = 'purchase' | 'expense' | 'investment' | 'sale' | 'delivery_out' | 'delivery_in';

interface Props {
  onClose: () => void;
  onChoose: (kind: ScanDocKind) => void;
}

interface CardDef {
  key: ScanDocKind;
  icon: typeof ShoppingCart;
  accent: string;
  iconBg: string;
  iconColor: string;
  titleKey: string;
  descKey: string;
}

const CARDS: CardDef[] = [
  { key: 'purchase', icon: ShoppingCart, accent: 'border-teal-200 hover:border-teal-400 hover:bg-teal-50', iconBg: 'bg-teal-100', iconColor: 'text-teal-600', titleKey: 'companyAdmin.scanner.purchaseTitle', descKey: 'companyAdmin.scanner.purchaseDesc' },
  { key: 'expense', icon: Receipt, accent: 'border-amber-200 hover:border-amber-400 hover:bg-amber-50', iconBg: 'bg-amber-100', iconColor: 'text-amber-600', titleKey: 'companyAdmin.scanner.expenseTitle', descKey: 'companyAdmin.scanner.expenseDesc' },
  { key: 'investment', icon: Briefcase, accent: 'border-slate-200 hover:border-slate-400 hover:bg-slate-50', iconBg: 'bg-slate-100', iconColor: 'text-slate-600', titleKey: 'companyAdmin.scanner.investmentTitle', descKey: 'companyAdmin.scanner.investmentDesc' },
  { key: 'sale', icon: FileText, accent: 'border-emerald-200 hover:border-emerald-400 hover:bg-emerald-50', iconBg: 'bg-emerald-100', iconColor: 'text-emerald-600', titleKey: 'companyAdmin.scanner.saleTitle', descKey: 'companyAdmin.scanner.saleDesc' },
  { key: 'delivery_out', icon: Truck, accent: 'border-sky-200 hover:border-sky-400 hover:bg-sky-50', iconBg: 'bg-sky-100', iconColor: 'text-sky-600', titleKey: 'companyAdmin.scanner.deliveryOutLabel', descKey: 'companyAdmin.scanner.deliveryOutDesc' },
  { key: 'delivery_in', icon: PackageCheck, accent: 'border-blue-200 hover:border-blue-400 hover:bg-blue-50', iconBg: 'bg-blue-100', iconColor: 'text-blue-600', titleKey: 'companyAdmin.scanner.deliveryInLabel', descKey: 'companyAdmin.scanner.deliveryInDesc' },
];

export default function DocumentTypeChooser({ onClose, onChoose }: Props) {
  const { t } = useTranslation();

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="bg-white w-full sm:max-w-2xl rounded-t-2xl sm:rounded-2xl shadow-xl max-h-[92vh] flex flex-col">
        <div className="flex items-start justify-between gap-4 px-5 py-4 border-b border-gray-100">
          <div className="min-w-0">
            <h2 className="text-base sm:text-lg font-bold text-gray-900">
              {t('companyAdmin.scanner.chooseTitle')}
            </h2>
            <p className="text-xs sm:text-sm text-gray-500 mt-0.5">
              {t('companyAdmin.scanner.chooseSubtitle')}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors flex-shrink-0"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 sm:p-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {CARDS.map((card) => {
              const Icon = card.icon;
              return (
                <button
                  key={card.key}
                  type="button"
                  onClick={() => onChoose(card.key)}
                  className={`group text-left p-4 border-2 rounded-xl transition-all ${card.accent} active:scale-[0.99]`}
                >
                  <div className="flex items-start gap-3">
                    <div className={`w-11 h-11 rounded-lg flex items-center justify-center flex-shrink-0 ${card.iconBg}`}>
                      <Icon className={`w-5 h-5 ${card.iconColor}`} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <h3 className="font-semibold text-gray-900 text-sm">{t(card.titleKey)}</h3>
                        <ArrowRight className="w-4 h-4 text-gray-300 group-hover:text-gray-600 transition-colors flex-shrink-0" />
                      </div>
                      <p className="text-xs text-gray-500 mt-1 leading-relaxed">{t(card.descKey)}</p>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
