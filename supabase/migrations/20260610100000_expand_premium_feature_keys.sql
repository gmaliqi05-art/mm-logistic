/*
  # Expand premium feature_keys

  Adds the following gated capabilities to the Premium logistics plan:

  - `fleet_reports`   — Fleet analytics dashboard
  - `hr`              — Human Resources module (leave, attendance,
                        work hours, salaries) for admins AND employees
  - `email_automation`— Email templates, branding, automation rules
  - `api_webhooks`    — External API + webhooks
  - `sorting`         — Sorting workflow (depot + company sorting reports)
  - `repairs`         — Repair workflow (depot repairs, repair workers,
                        damage reports, company repair-reports)
  - `driver_tracking` — Live GPS tracking (driver tracking + company
                        live map). Navigation stays free for drivers.

  Free Trial keeps `basic_reports` only. Standard plan is unchanged
  (no new premium features for standard tier).

  Safe to run multiple times: we replace `feature_keys` wholesale for
  the premium plan to keep the set canonical.
*/

UPDATE subscription_plans
SET feature_keys = '[
  "documents_signing",
  "basic_reports",
  "categories",
  "advanced_reports",
  "export_pdf",
  "export_excel",
  "audit_log",
  "bulk_operations",
  "stock_alerts",
  "data_export",
  "fleet_reports",
  "hr",
  "email_automation",
  "api_webhooks",
  "sorting",
  "repairs",
  "driver_tracking"
]'::jsonb
WHERE name = 'premium';
