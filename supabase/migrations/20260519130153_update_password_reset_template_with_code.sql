/*
  # Update Password Reset Email Template with 6-Digit Code

  1. Changes
    - Updates the `password_reset` email template to prominently display a 6-digit verification code
    - Code is shown in large, bold, monospace font for easy reading and copying
    - CTA button links to reset page with pre-filled code and email
    - Added `reset_code` and `expiry_minutes` to required variables
    - Updated all 3 locales (sq, de, en)

  2. Important Notes
    - The code is displayed as the main visual element
    - Template retains the security warning about unsolicited requests
    - Expiry is 15 minutes (displayed dynamically)
*/

UPDATE email_templates
SET
  intro_sq = 'Pershendetje <strong>{{first_name}}</strong>, morem nje kerkese per te rivendosur fjalekalimin e llogarise tende ne {{brand_name}}. Perdor kodin e meposhtem brenda <strong>{{expiry_minutes}} minutash</strong>:',
  intro_de = 'Hallo <strong>{{first_name}}</strong>, wir haben eine Anfrage zum Zuruecksetzen Ihres Passworts erhalten. Verwenden Sie den folgenden Code innerhalb von <strong>{{expiry_minutes}} Minuten</strong>:',
  intro_en = 'Hi <strong>{{first_name}}</strong>, we received a request to reset your {{brand_name}} password. Use the code below within <strong>{{expiry_minutes}} minutes</strong>:',
  body_html_sq = '<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin:20px 0;background-color:#f0fdfa;border:2px solid #0d9488;border-radius:12px;">
    <tr><td style="padding:24px;text-align:center;">
      <p style="margin:0 0 8px 0;font-size:12px;text-transform:uppercase;letter-spacing:2px;color:#0f766e;font-weight:600;">Kodi i verifikimit</p>
      <p style="margin:0;font-size:36px;font-weight:700;letter-spacing:8px;font-family:monospace;color:#0f172a;">{{reset_code}}</p>
      <p style="margin:8px 0 0 0;font-size:12px;color:#64748b;">Skadon pas {{expiry_minutes}} minutash</p>
    </td></tr>
  </table>
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin:4px 0 14px 0;background-color:#fef3c7;border:1px solid #fcd34d;border-radius:10px;">
    <tr><td style="padding:14px 18px;font-size:13px;line-height:1.55;color:#92400e;">
      <strong>Nuk e kerkove?</strong> Injoro kete email - llogaria jote mbetet e sigurt dhe fjalekalimi i vjeter vlen.
    </td></tr>
  </table>',
  body_html_de = '<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin:20px 0;background-color:#f0fdfa;border:2px solid #0d9488;border-radius:12px;">
    <tr><td style="padding:24px;text-align:center;">
      <p style="margin:0 0 8px 0;font-size:12px;text-transform:uppercase;letter-spacing:2px;color:#0f766e;font-weight:600;">Verifizierungscode</p>
      <p style="margin:0;font-size:36px;font-weight:700;letter-spacing:8px;font-family:monospace;color:#0f172a;">{{reset_code}}</p>
      <p style="margin:8px 0 0 0;font-size:12px;color:#64748b;">Laeuft in {{expiry_minutes}} Minuten ab</p>
    </td></tr>
  </table>
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin:4px 0 14px 0;background-color:#fef3c7;border:1px solid #fcd34d;border-radius:10px;">
    <tr><td style="padding:14px 18px;font-size:13px;line-height:1.55;color:#92400e;">
      <strong>Nicht von Ihnen?</strong> Ignorieren Sie diese E-Mail - Ihr Konto bleibt sicher.
    </td></tr>
  </table>',
  body_html_en = '<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin:20px 0;background-color:#f0fdfa;border:2px solid #0d9488;border-radius:12px;">
    <tr><td style="padding:24px;text-align:center;">
      <p style="margin:0 0 8px 0;font-size:12px;text-transform:uppercase;letter-spacing:2px;color:#0f766e;font-weight:600;">Verification Code</p>
      <p style="margin:0;font-size:36px;font-weight:700;letter-spacing:8px;font-family:monospace;color:#0f172a;">{{reset_code}}</p>
      <p style="margin:8px 0 0 0;font-size:12px;color:#64748b;">Expires in {{expiry_minutes}} minutes</p>
    </td></tr>
  </table>
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin:4px 0 14px 0;background-color:#fef3c7;border:1px solid #fcd34d;border-radius:10px;">
    <tr><td style="padding:14px 18px;font-size:13px;line-height:1.55;color:#92400e;">
      <strong>Did not request this?</strong> Ignore this email - your account stays secure.
    </td></tr>
  </table>',
  cta_label_sq = 'Vendos Kodin',
  cta_label_de = 'Code Eingeben',
  cta_label_en = 'Enter Code',
  cta_url = '{{reset_url}}',
  variables = '["first_name","reset_url","reset_code","expiry_minutes"]'::jsonb
WHERE code = 'password_reset';
