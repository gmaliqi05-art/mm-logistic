export type UserRole =
  | 'super_admin'
  | 'company_admin'
  | 'depot_worker'
  | 'driver'
  | 'accountant'
  | 'logistics_admin';

export interface Profile {
  id: string;
  email: string;
  full_name: string;
  role: UserRole;
  company_id: string | null;
  depot_id: string | null;
  phone: string;
  avatar_url: string;
  is_active: boolean;
  worker_category?: 'depoist' | 'reparature' | null;
  created_at: string;
}

export interface Company {
  id: string;
  name: string;
  address: string;
  phone: string;
  email: string;
  logo_url: string;
  is_active: boolean;
  created_by: string;
  created_at: string;
  vat_number: string | null;
  tax_number: string | null;
  commercial_register: string | null;
  legal_form: string | null;
  registration_court: string | null;
  country: string | null;
  city: string | null;
  postal_code: string | null;
  website: string | null;
}

export interface Depot {
  id: string;
  company_id: string;
  name: string;
  address: string;
  phone: string;
  manager_id: string | null;
  is_active: boolean;
  created_at: string;
}

export type SortingMode = 'none' | 'class' | 'type';

export interface ProductCategory {
  id: string;
  company_id: string;
  name: string;
  description: string;
  sorting_mode: SortingMode;
  aliases: string[];
  created_at: string;
}

export type SortingBatchStatus = 'in_progress' | 'completed' | 'cancelled';

export interface PalletSortingBatch {
  id: string;
  company_id: string;
  depot_id: string;
  category_id: string;
  source_delivery_note_id: string | null;
  total_received: number;
  status: SortingBatchStatus;
  notes: string;
  created_by: string;
  completed_by: string | null;
  completed_at: string | null;
  committed_at: string | null;
  created_at: string;
  updated_at: string;
  category?: ProductCategory;
  depot?: Depot;
  items?: PalletSortingItem[];
}

export interface PalletSortingItem {
  id: string;
  batch_id: string;
  category_product_id: string;
  quantity: number;
  condition: 'good' | 'damaged' | 'repaired';
  created_at: string;
}

export interface Stock {
  id: string;
  company_id: string;
  depot_id: string;
  category_id: string;
  category_product_id: string | null;
  quantity: number;
  condition: 'good' | 'damaged' | 'repaired';
  updated_at: string;
  created_at: string;
  category?: ProductCategory;
  depot?: Depot;
  product?: { id: string; name: string } | null;
}

export interface StockMovement {
  id: string;
  company_id: string;
  depot_id: string;
  category_id: string;
  category_product_id: string | null;
  movement_type: 'entry' | 'exit' | 'repair';
  quantity: number;
  condition_before: string;
  condition_after: string;
  notes: string;
  performed_by: string;
  created_at: string;
  category?: ProductCategory;
  depot?: Depot;
  performer?: Profile;
  product?: { id: string; name: string } | null;
}

export interface DeliveryNote {
  id: string;
  company_id: string;
  created_by: string;
  assigned_driver_id: string | null;
  assigned_depot_id: string | null;
  note_number: string;
  type: 'pickup' | 'delivery';
  status: 'draft' | 'sent' | 'in_transit' | 'delivered' | 'confirmed' | 'pending_company_review' | 'pending_stock_confirmation' | 'completed' | 'cancelled';
  delivery_address: string;
  pickup_address: string;
  photo_url: string;
  scanned_photo_url: string;
  attachment_url: string | null;
  notes: string;
  created_at: string;
  updated_at: string;
  items?: DeliveryNoteItem[];
  driver?: Profile;
  depot?: Depot;
  creator?: Profile;
  partner_name?: string | null;
  reference_number?: string | null;
  ai_extracted_json?: Record<string, unknown> | null;
  ai_confidence?: number | null;
  scheduled_pickup_at?: string | null;
  scheduled_delivery_at?: string | null;
  delivered_at?: string | null;
}

export interface DeliveryNoteItem {
  id: string;
  delivery_note_id: string;
  category_id: string | null;
  quantity: number;
  condition: string;
  notes: string;
  category?: ProductCategory;
}

export interface ChatRoom {
  id: string;
  company_id: string;
  name: string;
  is_group: boolean;
  created_by: string;
  created_at: string;
  participants?: ChatParticipant[];
  last_message?: ChatMessage;
}

export interface ChatParticipant {
  id: string;
  room_id: string;
  user_id: string;
  joined_at: string;
  profile?: Profile;
}

export interface ChatMessage {
  id: string;
  room_id: string;
  sender_id: string;
  message: string;
  message_type: 'text' | 'photo' | 'delivery_note' | 'address' | 'document';
  attachment_url: string;
  is_deleted: boolean;
  created_at: string;
  sender?: Profile;
}

export type DocumentType = 'delivery_note' | 'invoice' | 'report' | 'photo' | 'contract' | 'other';
export type DocumentPriority = 'normal' | 'urgent';
export type DocumentRecipientStatus = 'sent' | 'delivered' | 'viewed' | 'signed' | 'completed';

export interface Document {
  id: string;
  company_id: string | null;
  sender_id: string;
  title: string;
  description: string;
  document_type: DocumentType;
  file_url: string;
  file_name: string;
  file_size: number;
  priority: DocumentPriority;
  is_reply_to: string | null;
  created_at: string;
  sender?: Profile;
  recipients?: DocumentRecipient[];
  reply_doc?: Document;
}

export interface DocumentRecipient {
  id: string;
  document_id: string;
  recipient_id: string;
  status: DocumentRecipientStatus;
  viewed_at: string | null;
  signed_at: string | null;
  signed_file_url: string;
  notes: string;
  created_at: string;
  recipient?: Profile;
  document?: Document;
}

export interface Notification {
  id: string;
  user_id: string;
  title: string;
  message: string;
  type: 'delivery_note' | 'chat' | 'stock' | 'system';
  reference_id: string | null;
  is_read: boolean;
  created_at: string;
}

export type ProductType = 'logistics' | 'accounting';

export interface SubscriptionPlan {
  id: string;
  name: string;
  display_name: string;
  description: string;
  price_monthly: number;
  trial_days: number;
  max_drivers: number;
  max_depots: number;
  features: string[];
  is_active: boolean;
  sort_order: number;
  product_type: ProductType;
  created_at: string;
  updated_at: string;
}

export type SubscriptionStatus = 'trial' | 'active' | 'expired' | 'cancelled';

export interface CompanySubscription {
  id: string;
  company_id: string;
  plan_id: string;
  status: SubscriptionStatus;
  trial_start: string | null;
  trial_end: string | null;
  current_period_start: string;
  current_period_end: string | null;
  stripe_subscription_id: string;
  stripe_customer_id: string;
  created_at: string;
  updated_at: string;
  plan?: SubscriptionPlan;
  company?: Company;
}

export type PaymentStatus = 'pending' | 'completed' | 'failed' | 'refunded';

export interface PaymentTransaction {
  id: string;
  company_id: string;
  subscription_id: string | null;
  amount: number;
  currency: string;
  status: PaymentStatus;
  payment_method: string;
  stripe_payment_id: string;
  description: string;
  created_at: string;
  company?: Company;
}

export type PlanTier = 'free_trial' | 'standard' | 'premium';

export type Feature =
  | 'documents_signing'
  | 'basic_reports'
  | 'categories'
  | 'advanced_reports'
  | 'export_pdf'
  | 'export_excel'
  | 'audit_log'
  | 'bulk_operations'
  | 'stock_alerts'
  | 'data_export';

export interface AuditLog {
  id: string;
  company_id: string;
  user_id: string;
  action: string;
  entity_type: string;
  entity_id: string | null;
  details: Record<string, unknown>;
  created_at: string;
  user?: Profile;
}

export interface StockAlert {
  id: string;
  company_id: string;
  depot_id: string;
  category_id: string;
  alert_type: 'low_stock' | 'out_of_stock' | 'damaged_threshold';
  threshold: number;
  is_active: boolean;
  last_triggered_at: string | null;
  created_at: string;
  updated_at: string;
  depot?: Depot;
  category?: ProductCategory;
}

export interface CompanyFeature {
  id: string;
  company_id: string;
  feature: Feature;
  is_enabled: boolean;
  enabled_by: string | null;
  enabled_at: string;
  notes: string;
  created_at: string;
  updated_at: string;
  enabler?: Profile;
}
