/*
  # Add Missing Foreign Key Indexes for Performance

  1. Performance Improvements
    - Add indexes to all foreign key columns that don't have covering indexes
    - This dramatically improves JOIN performance and foreign key constraint checks
    
  2. Tables Affected
    - audit_logs: user_id
    - chat_messages: sender_id
    - chat_rooms: company_id, created_by
    - companies: created_by
    - company_features: enabled_by
    - company_subscriptions: plan_id
    - delivery_note_items: category_id, delivery_note_id
    - delivery_notes: assigned_depot_id
    - depots: manager_id
    - payment_transactions: subscription_id
    - product_categories: company_id
    - profiles: depot_id (fk_profiles_depot)
    - stock: company_id
    - stock_alerts: category_id, depot_id
    - stock_movements: category_id, performed_by
    - support_messages: faq_id, sender_id
    
  3. Benefits
    - Faster queries with JOINs on foreign keys
    - Better query planning by PostgreSQL optimizer
    - Improved overall application performance
*/

-- audit_logs
CREATE INDEX IF NOT EXISTS idx_audit_logs_user_id ON public.audit_logs(user_id);

-- chat_messages
CREATE INDEX IF NOT EXISTS idx_chat_messages_sender_id ON public.chat_messages(sender_id);

-- chat_rooms
CREATE INDEX IF NOT EXISTS idx_chat_rooms_company_id ON public.chat_rooms(company_id);
CREATE INDEX IF NOT EXISTS idx_chat_rooms_created_by ON public.chat_rooms(created_by);

-- companies
CREATE INDEX IF NOT EXISTS idx_companies_created_by ON public.companies(created_by);

-- company_features
CREATE INDEX IF NOT EXISTS idx_company_features_enabled_by ON public.company_features(enabled_by);

-- company_subscriptions
CREATE INDEX IF NOT EXISTS idx_company_subscriptions_plan_id ON public.company_subscriptions(plan_id);

-- delivery_note_items
CREATE INDEX IF NOT EXISTS idx_delivery_note_items_category_id ON public.delivery_note_items(category_id);
CREATE INDEX IF NOT EXISTS idx_delivery_note_items_delivery_note_id ON public.delivery_note_items(delivery_note_id);

-- delivery_notes
CREATE INDEX IF NOT EXISTS idx_delivery_notes_assigned_depot_id ON public.delivery_notes(assigned_depot_id);

-- depots
CREATE INDEX IF NOT EXISTS idx_depots_manager_id ON public.depots(manager_id);

-- payment_transactions
CREATE INDEX IF NOT EXISTS idx_payment_transactions_subscription_id ON public.payment_transactions(subscription_id);

-- product_categories
CREATE INDEX IF NOT EXISTS idx_product_categories_company_id ON public.product_categories(company_id);

-- profiles (depot_id via fk_profiles_depot)
CREATE INDEX IF NOT EXISTS idx_profiles_depot_id ON public.profiles(depot_id);

-- stock
CREATE INDEX IF NOT EXISTS idx_stock_company_id ON public.stock(company_id);

-- stock_alerts
CREATE INDEX IF NOT EXISTS idx_stock_alerts_category_id ON public.stock_alerts(category_id);
CREATE INDEX IF NOT EXISTS idx_stock_alerts_depot_id ON public.stock_alerts(depot_id);

-- stock_movements
CREATE INDEX IF NOT EXISTS idx_stock_movements_category_id ON public.stock_movements(category_id);
CREATE INDEX IF NOT EXISTS idx_stock_movements_performed_by ON public.stock_movements(performed_by);

-- support_messages
CREATE INDEX IF NOT EXISTS idx_support_messages_faq_id ON public.support_messages(faq_id);
CREATE INDEX IF NOT EXISTS idx_support_messages_sender_id ON public.support_messages(sender_id);
