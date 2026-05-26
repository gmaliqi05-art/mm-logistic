/*
  # Seed email verification template

  1. New email template
    - `email_verification` - sends 6-digit code to verify email ownership during registration
    - Available in sq, en, de, fr

  2. Notes
    - Used by the send-verification-code edge function
    - Variables: verification_code, email
*/

INSERT INTO email_templates (
  code, category, name, description, is_system, is_active,
  preheader_sq, subject_sq, heading_sq, intro_sq, body_html_sq, cta_label_sq,
  preheader_en, subject_en, heading_en, intro_en, body_html_en, cta_label_en,
  preheader_de, subject_de, heading_de, intro_de, body_html_de, cta_label_de,
  preheader_fr, subject_fr, heading_fr, intro_fr, body_html_fr, cta_label_fr,
  variables
) VALUES (
  'email_verification',
  'system',
  'Verifikimi i Emailit',
  'Dergon kodin 6-shifror per verifikimin e emailit gjate regjistrimit',
  true, true,

  -- Albanian
  'Kodi juaj i verifikimit: {{verification_code}}',
  'Kodi juaj i verifikimit: {{verification_code}}',
  'Verifikoni Emailin Tuaj',
  'Ju lutem perdorni kodin e meposhtem per te verifikuar adresen tuaj te emailit.',
  '<div style="text-align:center;margin:28px 0;">
    <div style="display:inline-block;background:#f0fdf4;border:2px solid #bbf7d0;border-radius:16px;padding:24px 48px;">
      <div style="font-size:40px;font-weight:800;letter-spacing:12px;color:#0f766e;font-family:''Courier New'',Courier,monospace;">{{verification_code}}</div>
    </div>
  </div>
  <p style="font-size:14px;color:#475569;line-height:1.6;text-align:center;">Ky kod skadon pas <strong>15 minutash</strong>.</p>
  <p style="font-size:13px;color:#64748b;line-height:1.6;text-align:center;margin-top:16px;">Nese nuk keni kerkuar kete kod, mund ta injoroni kete email.</p>',
  '',

  -- English
  'Your verification code: {{verification_code}}',
  'Your verification code: {{verification_code}}',
  'Verify Your Email',
  'Please use the code below to verify your email address.',
  '<div style="text-align:center;margin:28px 0;">
    <div style="display:inline-block;background:#f0fdf4;border:2px solid #bbf7d0;border-radius:16px;padding:24px 48px;">
      <div style="font-size:40px;font-weight:800;letter-spacing:12px;color:#0f766e;font-family:''Courier New'',Courier,monospace;">{{verification_code}}</div>
    </div>
  </div>
  <p style="font-size:14px;color:#475569;line-height:1.6;text-align:center;">This code expires in <strong>15 minutes</strong>.</p>
  <p style="font-size:13px;color:#64748b;line-height:1.6;text-align:center;margin-top:16px;">If you did not request this code, you can safely ignore this email.</p>',
  '',

  -- German
  'Ihr Verifizierungscode: {{verification_code}}',
  'Ihr Verifizierungscode: {{verification_code}}',
  'E-Mail verifizieren',
  'Bitte verwenden Sie den folgenden Code, um Ihre E-Mail-Adresse zu verifizieren.',
  '<div style="text-align:center;margin:28px 0;">
    <div style="display:inline-block;background:#f0fdf4;border:2px solid #bbf7d0;border-radius:16px;padding:24px 48px;">
      <div style="font-size:40px;font-weight:800;letter-spacing:12px;color:#0f766e;font-family:''Courier New'',Courier,monospace;">{{verification_code}}</div>
    </div>
  </div>
  <p style="font-size:14px;color:#475569;line-height:1.6;text-align:center;">Dieser Code laeuft in <strong>15 Minuten</strong> ab.</p>
  <p style="font-size:13px;color:#64748b;line-height:1.6;text-align:center;margin-top:16px;">Wenn Sie diesen Code nicht angefordert haben, koennen Sie diese E-Mail ignorieren.</p>',
  '',

  -- French
  'Votre code de verification: {{verification_code}}',
  'Votre code de verification: {{verification_code}}',
  'Verifier votre email',
  'Veuillez utiliser le code ci-dessous pour verifier votre adresse email.',
  '<div style="text-align:center;margin:28px 0;">
    <div style="display:inline-block;background:#f0fdf4;border:2px solid #bbf7d0;border-radius:16px;padding:24px 48px;">
      <div style="font-size:40px;font-weight:800;letter-spacing:12px;color:#0f766e;font-family:''Courier New'',Courier,monospace;">{{verification_code}}</div>
    </div>
  </div>
  <p style="font-size:14px;color:#475569;line-height:1.6;text-align:center;">Ce code expire dans <strong>15 minutes</strong>.</p>
  <p style="font-size:13px;color:#64748b;line-height:1.6;text-align:center;margin-top:16px;">Si vous n''avez pas demande ce code, vous pouvez ignorer cet email.</p>',
  '',

  '["verification_code", "email"]'::jsonb
)
ON CONFLICT (code) WHERE company_id IS NULL DO NOTHING;
