export type AccContactType = 'customer' | 'supplier' | 'both';
export type AccInvoiceStatus = 'draft' | 'sent' | 'paid' | 'partial' | 'overdue' | 'cancelled';
export type AccPurchaseStatus = 'draft' | 'received' | 'paid' | 'overdue' | 'cancelled';
export type AccInvoiceType = 'invoice' | 'credit_note' | 'proforma';
export type AccCurrency = 'EUR' | 'CHF' | 'ALL' | 'RSD' | 'BAM' | 'MKD' | 'RON' | 'BGN' | 'PLN' | 'GBP' | 'USD';

export const ACC_CURRENCIES: AccCurrency[] = ['EUR', 'CHF', 'ALL', 'RSD', 'BAM', 'MKD', 'RON', 'BGN', 'PLN', 'GBP', 'USD'];
export type AccUnit = 'pcs' | 'kg' | 'liter' | 'hour' | 'meter' | 'package' | 'set';
export type AccVatRate = 0 | 7 | 19;
export type AccPaymentMethod = '' | 'bank_transfer' | 'cash' | 'card' | 'paypal' | 'other';
export type AccMovementType = 'in' | 'out' | 'adjustment' | 'return';
export type AccTransactionType = 'income' | 'expense' | 'transfer';
export type AccDeliveryNoteStatus = 'draft' | 'sent' | 'in_transit' | 'delivered' | 'confirmed';
export type AccDeliveryNoteKind = 'sale' | 'purchase_receipt' | 'transfer' | 'return_in' | 'return_out';

// Pallet clearing model per partner. 'deposit' = pallets billed with
// VAT (Pfand/rental). 'exchange' = open EPAL pool swap booked as
// Sachdarlehen §607 BGB — pallets themselves carry no VAT, only
// handling fees do. Mirrors acc_contacts.clearing_model added in
// migration 20260613180000.
export type ClearingModel = 'deposit' | 'exchange';

// Pallet exchange protocol per partner relationship. 'koelner' =
// direct swap by carrier at both A and B (Doppeltausch). 'bonner' =
// receiver has a return obligation to ship back equivalents within
// the agreed window. NULL = no formal Palettenkonto agreement.
// Mirrors acc_contacts.exchange_protocol added in migration
// 20260614092000. See OLG Düsseldorf 18 U 10/21 on the legal weight
// of getting this right per partner.
export type ExchangeProtocol = 'koelner' | 'bonner';

// Per-line VAT rule for acc_invoice_items. 'standard' uses vat_rate
// as-is. The other treatments force the effective rate to 0 with a
// legal annotation on the printed invoice. Mirrors
// acc_invoice_items.vat_treatment added in migration 20260613180000.
export type VatTreatment =
  | 'standard'
  | 'reverse_charge'
  | 'exempt'
  | 'sachdarlehen'
  | 'schadenersatz';

// Optional categorisation for downstream DATEV/SAF-T export and journal
// posting. Nullable on the DB; consumers should treat null as 'goods'
// for backward compatibility with existing line items.
export type LineType =
  | 'goods'
  | 'transport'
  | 'handling'
  | 'pallet_deposit'
  | 'pallet_exchange'
  | 'repair'
  | 'other';

export interface AccContact {
  id: string;
  company_id: string;
  name: string;
  contact_type: AccContactType;
  address: string;
  city: string;
  postal_code: string;
  country: string;
  vat_number: string;
  tax_number: string;
  email: string;
  phone: string;
  website: string;
  iban: string;
  bic: string;
  bank_name: string;
  payment_days: number;
  notes: string;
  is_active: boolean;
  clearing_model: ClearingModel;
  exchange_protocol?: ExchangeProtocol | null;
  created_at: string;
  updated_at: string;
}

export interface AccProductCategory {
  id: string;
  company_id: string;
  name: string;
  description: string;
  sort_order: number;
  created_at: string;
}

export interface AccProduct {
  id: string;
  company_id: string;
  name: string;
  description: string;
  sku: string;
  unit: AccUnit;
  price_net: number;
  vat_rate: number;
  category_id: string | null;
  image_url: string;
  current_stock: number;
  min_stock: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  category?: AccProductCategory;
}

export interface AccBankAccount {
  id: string;
  company_id: string;
  name: string;
  iban: string;
  bic: string;
  bank_name: string;
  currency: AccCurrency;
  opening_balance: number;
  is_default: boolean;
  is_active: boolean;
  created_at: string;
}

export interface AccInvoice {
  id: string;
  company_id: string;
  created_by: string;
  contact_id: string | null;
  invoice_number: string;
  invoice_date: string;
  due_date: string | null;
  status: AccInvoiceStatus;
  subtotal: number;
  vat_amount: number;
  total: number;
  discount: number;
  currency: AccCurrency;
  notes: string;
  bank_account_id: string | null;
  invoice_type: AccInvoiceType;
  delivery_status?: 'none' | 'pending' | 'assigned' | 'in_transit' | 'delivered' | 'cancelled';
  dispatched_to_logistics_at?: string | null;
  dispatched_by?: string | null;
  source_depot_id?: string | null;
  delivery_note_id?: string | null;
  linked_document_number?: string | null;
  delivery_note?: { id: string; note_number: string | null; document_number?: string | null } | null;
  sent_at?: string | null;
  created_at: string;
  updated_at: string;
  contact?: AccContact;
  items?: AccInvoiceItem[];
  bank_account?: AccBankAccount;
}

export interface AccInvoiceItem {
  id: string;
  invoice_id: string;
  product_id: string | null;
  description: string;
  quantity: number;
  unit: string;
  unit_price: number;
  vat_rate: number;
  line_discount: number;
  line_total: number;
  vat_treatment: VatTreatment;
  line_type: LineType | null;
  created_at: string;
  product?: AccProduct;
}

export interface AccPurchase {
  id: string;
  company_id: string;
  created_by: string;
  contact_id: string | null;
  purchase_number: string;
  purchase_date: string;
  due_date: string | null;
  status: AccPurchaseStatus;
  subtotal: number;
  vat_amount: number;
  total: number;
  currency: AccCurrency;
  notes: string;
  external_invoice_number: string;
  bank_account_id: string | null;
  created_at: string;
  updated_at: string;
  contact?: AccContact;
  items?: AccPurchaseItem[];
}

export interface AccPurchaseItem {
  id: string;
  purchase_id: string;
  product_id: string | null;
  description: string;
  quantity: number;
  unit: string;
  unit_price: number;
  vat_rate: number;
  line_total: number;
  created_at: string;
  product?: AccProduct;
}

export interface AccExpenseCategory {
  id: string;
  company_id: string;
  name: string;
  description: string;
  category_type: 'income' | 'expense' | 'other';
  parent_id: string | null;
  created_at: string;
}

export interface AccTransaction {
  id: string;
  company_id: string;
  transaction_type: AccTransactionType;
  category_id: string | null;
  contact_id: string | null;
  invoice_id: string | null;
  purchase_id: string | null;
  bank_account_id: string | null;
  amount: number;
  currency: string;
  description: string;
  transaction_date: string;
  payment_method: AccPaymentMethod;
  reference_number: string;
  notes: string;
  created_by: string | null;
  created_at: string;
  contact?: AccContact;
  category?: AccExpenseCategory;
  bank_account?: AccBankAccount;
}

export interface AccStockMovement {
  id: string;
  company_id: string;
  product_id: string;
  movement_type: AccMovementType;
  quantity: number;
  unit_price: number;
  reference_type: string;
  reference_id: string | null;
  notes: string;
  created_by: string | null;
  created_at: string;
  product?: AccProduct;
}

export interface AccDeliveryNote {
  id: string;
  company_id: string;
  created_by: string;
  contact_id: string | null;
  note_number: string;
  note_date: string;
  status: AccDeliveryNoteStatus;
  kind: AccDeliveryNoteKind;
  shipping_address: string;
  notes: string;
  invoice_id: string | null;
  created_at: string;
  updated_at: string;
  contact?: AccContact;
  items?: AccDeliveryNoteItem[];
}

export interface AccDeliveryNoteItem {
  id: string;
  delivery_note_id: string;
  product_id: string | null;
  description: string;
  quantity: number;
  unit: string;
  image_url: string;
  created_at: string;
  product?: AccProduct;
}

export const UNITS: { value: AccUnit; label: string }[] = [
  { value: 'pcs', label: 'Cope' },
  { value: 'kg', label: 'Kg' },
  { value: 'liter', label: 'Liter' },
  { value: 'hour', label: 'Ore' },
  { value: 'meter', label: 'Meter' },
  { value: 'package', label: 'Pakete' },
  { value: 'set', label: 'Set' },
];

// Map the app language (stored in localStorage as `ep_language`) to a
// proper BCP-47 locale tag. Defaulting to de-DE preserved the previous
// behaviour for the German-first flow; everyone else now sees numbers
// in their own conventions (1 234,56 in FR, 1,234.56 in EN, etc.).
function currentLocaleTag(): string {
  try {
    const saved = typeof localStorage !== 'undefined' ? localStorage.getItem('ep_language') : null;
    switch (saved) {
      case 'sq': return 'sq-AL';
      case 'en': return 'en-GB';
      case 'fr': return 'fr-FR';
      case 'de':
      default:   return 'de-DE';
    }
  } catch {
    return 'de-DE';
  }
}

export function formatCurrency(
  amount: number,
  currency: AccCurrency = 'EUR',
  locale?: string,
): string {
  return new Intl.NumberFormat(locale ?? currentLocaleTag(), { style: 'currency', currency }).format(amount);
}

export function formatNumber(num: number, locale?: string): string {
  return new Intl.NumberFormat(locale ?? currentLocaleTag(), { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(num);
}
