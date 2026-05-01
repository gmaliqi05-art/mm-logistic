/*
  # Add social logo platform setting

  1. Data
    - Insert new `platform_logo_social` key into `platform_settings` if not present.
    - This is the logo variant with a dark background, used for social share previews (OG/Twitter).
  2. Notes
    - Uses safe upsert via INSERT ... WHERE NOT EXISTS to avoid duplicates.
    - Does NOT overwrite existing `platform_logo` value uploaded by admin.
*/

INSERT INTO platform_settings (key, value, description)
SELECT 'platform_logo_social', '/mm-logistic-social.png', 'Platform logo variant used for social share previews (OG/Twitter)'
WHERE NOT EXISTS (
  SELECT 1 FROM platform_settings WHERE key = 'platform_logo_social'
);

INSERT INTO platform_settings (key, value, description)
SELECT 'platform_logo_icon', '/mm-logistic-logo.png', 'Platform logo variant used as favicon and PWA icon'
WHERE NOT EXISTS (
  SELECT 1 FROM platform_settings WHERE key = 'platform_logo_icon'
);
