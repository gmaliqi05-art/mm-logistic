/*
  # Update Subscription Plan Features

  1. Changes
    - Update the features list for each plan to reflect the actual feature gating
    - free_trial: basic features only
    - standard: adds categories, basic reports, document signing
    - premium: adds advanced reports, audit log, stock alerts, data export, bulk operations

  2. Notes
    - Uses UPDATE only, no destructive operations
    - Features are stored as JSONB arrays for display purposes
*/

UPDATE subscription_plans
SET features = '["Deri ne 3 shofere", "1 depo", "Menaxhim stoku baze", "Fletedergesa", "Chat ne kohe reale", "Dokumente (pa nenshkrim)"]'::jsonb,
    updated_at = now()
WHERE name = 'free_trial';

UPDATE subscription_plans
SET features = '["Deri ne 15 shofere", "5 depo", "Menaxhim stoku i plote", "Fletedergesa", "Sistem dokumentesh me nenshkrim", "Chat ne kohe reale", "Raporte baze", "Menaxhim kategorish", "Suport me email"]'::jsonb,
    updated_at = now()
WHERE name = 'standard';

UPDATE subscription_plans
SET features = '["Shofere te pakufizuar", "Depo te pakufizuara", "Menaxhim stoku i plote", "Fletedergesa te avancuara", "Sistem dokumentesh me nenshkrim", "Chat ne kohe reale", "Raporte te avancuara me eksportim PDF/Excel", "Regjistri i veprimeve (Audit Log)", "Alarme automatike stoku", "Eksportim i te dhenave (CSV)", "Veprime ne mase", "Suport prioritar 24/7", "Akses API"]'::jsonb,
    updated_at = now()
WHERE name = 'premium';
