/*
  # Prevent duplicate subscription plans

  1. Changes
    - Add a partial unique index on `(name, product_type)` for active plans,
      so the super-admin UI and API cannot create two active plans that share
      the same slug within the same product type.
    - Inactive plans are allowed to share names (for historical/archived plans).

  2. Notes
    - Non-destructive: no existing data is modified; creation is safe because
      the current data has no conflicts.
*/

CREATE UNIQUE INDEX IF NOT EXISTS uq_subscription_plans_active_name_type
  ON subscription_plans (name, product_type)
  WHERE is_active;
