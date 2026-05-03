/*
  # Professional Email Templates Rewrite

  1. Purpose
    - Rewrites every row in `email_templates` with polished, production-ready copy in Albanian, German and English.
    - Adds two new marketing templates: `marketing_promo` and `newsletter`.
    - Ensures every template provides rich body HTML (info boxes, lists, variables) that renders beautifully inside the new layout (logo header, hero band, company card, legal fine print).

  2. Safety
    - All statements are idempotent (`ON CONFLICT (code) DO UPDATE`).
    - No columns are dropped, no data deleted.
*/

INSERT INTO email_templates (code, category, name, description, is_system, is_active,
  preheader_sq, preheader_de, preheader_en,
  subject_sq, subject_de, subject_en,
  heading_sq, heading_de, heading_en,
  intro_sq, intro_de, intro_en,
  body_html_sq, body_html_de, body_html_en,
  cta_label_sq, cta_label_de, cta_label_en, cta_url, variables
) VALUES
-- 1. WELCOME COMPANY
('welcome_company','transactional','Mireseerdhje - Kompani e re',
 'Email mirëseardhjeje kur një kompani e re aktivizohet në platformë.',
 true,true,
 'Mireseerdhet ne {{brand_name}} - udhezues i shpejte per te filluar.',
 'Willkommen bei {{brand_name}} - Ihre Schnellstart-Anleitung.',
 'Welcome to {{brand_name}} - your quick start guide.',
 'Mireseerdhet ne {{brand_name}}, {{company_name}}',
 'Willkommen bei {{brand_name}}, {{company_name}}',
 'Welcome to {{brand_name}}, {{company_name}}',
 'Te mirepresim ne {{brand_name}}',
 'Willkommen bei {{brand_name}}',
 'Welcome to {{brand_name}}',
 'Pershendetje <strong>{{first_name}}</strong>, jemi te lumtur qe <strong>{{company_name}}</strong> po i bashkohet platformes <strong>{{brand_name}}</strong>. Ne vijim do te gjeni tre hapa te thjeshte per te filluar sot.',
 'Hallo <strong>{{first_name}}</strong>, wir freuen uns, dass <strong>{{company_name}}</strong> der Plattform <strong>{{brand_name}}</strong> beitritt. Nachfolgend finden Sie drei einfache Schritte fuer den Start.',
 'Hi <strong>{{first_name}}</strong>, we are thrilled to welcome <strong>{{company_name}}</strong> to <strong>{{brand_name}}</strong>. Here are three simple steps to get started today.',
 '<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin:4px 0 18px 0;border:1px solid #e2e8f0;border-radius:10px;">
    <tr><td style="padding:14px 18px;border-bottom:1px solid #e2e8f0;"><strong style="color:#0f766e;">1.</strong> &nbsp;Konfiguro floten tende - shto mjete, shofere dhe depo.</td></tr>
    <tr><td style="padding:14px 18px;border-bottom:1px solid #e2e8f0;"><strong style="color:#0f766e;">2.</strong> &nbsp;Fto bashkepunetoret - admin, logjistike, depo, kontabilitet.</td></tr>
    <tr><td style="padding:14px 18px;"><strong style="color:#0f766e;">3.</strong> &nbsp;Krijo faturen e pare dhe dergesen e pare - gjithcka nga nje panel.</td></tr>
  </table>
  <p style="margin:0 0 8px 0;">Plani yt aktual: <strong>{{plan_name}}</strong>. Menaxheri yt i dedikuar do te kontaktoje ne 24 ore per konfigurim te avancuar, trajnim dhe migrim te te dhenave ekzistuese.</p>
  <p style="margin:14px 0 0 0;color:#475569;">Kemi pergatitur edhe nje biblioteke te plote me udhezues dhe video ne qendren tone te ndihmes.</p>',
 '<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin:4px 0 18px 0;border:1px solid #e2e8f0;border-radius:10px;">
    <tr><td style="padding:14px 18px;border-bottom:1px solid #e2e8f0;"><strong style="color:#0f766e;">1.</strong> &nbsp;Richten Sie Ihre Flotte ein - Fahrzeuge, Fahrer, Lager.</td></tr>
    <tr><td style="padding:14px 18px;border-bottom:1px solid #e2e8f0;"><strong style="color:#0f766e;">2.</strong> &nbsp;Laden Sie Ihr Team ein - Admin, Logistik, Lager, Buchhaltung.</td></tr>
    <tr><td style="padding:14px 18px;"><strong style="color:#0f766e;">3.</strong> &nbsp;Erstellen Sie Ihre erste Rechnung und Lieferung - alles in einem Dashboard.</td></tr>
  </table>
  <p style="margin:0 0 8px 0;">Ihr aktueller Plan: <strong>{{plan_name}}</strong>. Ihr persoenlicher Ansprechpartner meldet sich innerhalb von 24 Stunden fuer das erweiterte Onboarding.</p>
  <p style="margin:14px 0 0 0;color:#475569;">Unser Help Center enthaelt Leitfaeden und Video-Tutorials.</p>',
 '<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin:4px 0 18px 0;border:1px solid #e2e8f0;border-radius:10px;">
    <tr><td style="padding:14px 18px;border-bottom:1px solid #e2e8f0;"><strong style="color:#0f766e;">1.</strong> &nbsp;Set up your fleet - vehicles, drivers, depots.</td></tr>
    <tr><td style="padding:14px 18px;border-bottom:1px solid #e2e8f0;"><strong style="color:#0f766e;">2.</strong> &nbsp;Invite your team - admins, dispatch, depot, accounting.</td></tr>
    <tr><td style="padding:14px 18px;"><strong style="color:#0f766e;">3.</strong> &nbsp;Create your first invoice and delivery - all from one dashboard.</td></tr>
  </table>
  <p style="margin:0 0 8px 0;">Your current plan: <strong>{{plan_name}}</strong>. A dedicated success manager will reach out within 24 hours for advanced onboarding.</p>
  <p style="margin:14px 0 0 0;color:#475569;">Our Help Center has full guides and video tutorials to get you up to speed.</p>',
 'Hap panelin','Dashboard oeffnen','Open dashboard','{{app_base_url}}/login',
 '["first_name","company_name","plan_name"]'::jsonb),

-- 2. INVITE USER
('invite_user','transactional','Ftese perdoruesi',
 'Email ftese per nje perdorues te ri ne kompani.',
 true,true,
 '{{inviter_name}} te fton te bashkohesh ne {{company_name}}.',
 '{{inviter_name}} laedt Sie zu {{company_name}} ein.',
 '{{inviter_name}} invites you to join {{company_name}}.',
 '{{inviter_name}} ju ftoi ne {{company_name}}',
 '{{inviter_name}} hat Sie zu {{company_name}} eingeladen',
 '{{inviter_name}} invited you to {{company_name}}',
 'Je ftuar te bashkohesh',
 'Sie wurden eingeladen',
 'You are invited',
 'Pershendetje <strong>{{first_name}}</strong>, <strong>{{inviter_name}}</strong> te ka ftuar te bashkohesh ne <strong>{{company_name}}</strong> ne platformen {{brand_name}} me rolin <strong>{{role}}</strong>.',
 'Hallo <strong>{{first_name}}</strong>, <strong>{{inviter_name}}</strong> hat Sie eingeladen, <strong>{{company_name}}</strong> auf {{brand_name}} als <strong>{{role}}</strong> beizutreten.',
 'Hi <strong>{{first_name}}</strong>, <strong>{{inviter_name}}</strong> has invited you to join <strong>{{company_name}}</strong> on {{brand_name}} as <strong>{{role}}</strong>.',
 '<p style="margin:0 0 12px 0;">Me pranimin e ftesës do te kesh akses ne:</p>
  <ul style="margin:0 0 14px 18px;padding:0;color:#334155;">
    <li style="margin-bottom:6px;">Paneli qendror i <strong>{{company_name}}</strong></li>
    <li style="margin-bottom:6px;">Mjetet e rolit <strong>{{role}}</strong></li>
    <li>Biseda dhe dokumente te kompanise</li>
  </ul>
  <p style="margin:0 0 8px 0;color:#475569;"><em>Kjo ftese skadon pas 7 diteve.</em> Nese nuk e pranon brenda afatit, do duhet te kerkosh ftese te re.</p>',
 '<p style="margin:0 0 12px 0;">Nach Annahme erhalten Sie Zugriff auf:</p>
  <ul style="margin:0 0 14px 18px;padding:0;color:#334155;">
    <li style="margin-bottom:6px;">Das Dashboard von <strong>{{company_name}}</strong></li>
    <li style="margin-bottom:6px;">Werkzeuge der Rolle <strong>{{role}}</strong></li>
    <li>Chats und Dokumente des Unternehmens</li>
  </ul>
  <p style="margin:0 0 8px 0;color:#475569;"><em>Diese Einladung laeuft in 7 Tagen ab.</em></p>',
 '<p style="margin:0 0 12px 0;">Once you accept, you will get access to:</p>
  <ul style="margin:0 0 14px 18px;padding:0;color:#334155;">
    <li style="margin-bottom:6px;">The <strong>{{company_name}}</strong> dashboard</li>
    <li style="margin-bottom:6px;">Tools for the <strong>{{role}}</strong> role</li>
    <li>Company chats and shared documents</li>
  </ul>
  <p style="margin:0 0 8px 0;color:#475569;"><em>This invitation expires in 7 days.</em></p>',
 'Prano ftesen','Einladung annehmen','Accept invitation','{{invite_url}}',
 '["first_name","inviter_name","company_name","role","invite_url"]'::jsonb),

-- 3. PASSWORD RESET
('password_reset','transactional','Rivendosje fjalekalimi',
 'Email me linkun e sigurte per rivendosjen e fjalekalimit.',
 true,true,
 'Nje kerkese per rivendosjen e fjalekalimit eshte bere per llogarine tende.',
 'Eine Anfrage zum Zuruecksetzen des Passworts wurde fuer Ihr Konto gestellt.',
 'A password reset was requested for your account.',
 'Rivendosni fjalekalimin','Passwort zuruecksetzen','Reset your password',
 'Kerkese e re per rivendosje','Neue Anfrage','New reset request',
 'Pershendetje <strong>{{first_name}}</strong>, morem nje kerkese per te rivendosur fjalekalimin e llogarise tende ne {{brand_name}}. Klik butonin me poshte brenda <strong>60 minutash</strong> per ta vazhduar.',
 'Hallo <strong>{{first_name}}</strong>, wir haben eine Anfrage zum Zuruecksetzen Ihres Passworts erhalten. Klicken Sie innerhalb von <strong>60 Minuten</strong> auf den Button.',
 'Hi <strong>{{first_name}}</strong>, we received a request to reset the password for your {{brand_name}} account. Click the button below within <strong>60 minutes</strong> to continue.',
 '<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin:4px 0 14px 0;background-color:#fef3c7;border:1px solid #fcd34d;border-radius:10px;">
    <tr><td style="padding:14px 18px;font-size:13px;line-height:1.55;color:#92400e;">
      <strong>Nuk e kerkove?</strong> Injoro kete email - llogaria jote mbetet e sigurt dhe fjalekalimi i vjeter vlen.
    </td></tr>
  </table>
  <p style="margin:0 0 6px 0;color:#475569;">Keshilla per nje fjalekalim te forte:</p>
  <ul style="margin:0 0 0 18px;padding:0;color:#334155;font-size:14px;">
    <li>12+ karaktere me shkronja te medha, te vogla, numra dhe simbole</li>
    <li>Mos e perdor ne sajte te tjera</li>
    <li>Aktivizo 2FA per siguri shtese</li>
  </ul>',
 '<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin:4px 0 14px 0;background-color:#fef3c7;border:1px solid #fcd34d;border-radius:10px;">
    <tr><td style="padding:14px 18px;font-size:13px;line-height:1.55;color:#92400e;">
      <strong>Nicht von Ihnen?</strong> Ignorieren Sie diese E-Mail - Ihr Konto bleibt sicher.
    </td></tr>
  </table>
  <p style="margin:0 0 6px 0;color:#475569;">Tipps fuer ein sicheres Passwort:</p>
  <ul style="margin:0 0 0 18px;padding:0;color:#334155;font-size:14px;">
    <li>Mindestens 12 Zeichen, Gross-/Kleinbuchstaben, Zahlen, Symbole</li>
    <li>Nirgendwo anders verwenden</li>
    <li>2FA fuer zusaetzliche Sicherheit aktivieren</li>
  </ul>',
 '<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin:4px 0 14px 0;background-color:#fef3c7;border:1px solid #fcd34d;border-radius:10px;">
    <tr><td style="padding:14px 18px;font-size:13px;line-height:1.55;color:#92400e;">
      <strong>Did not request this?</strong> Ignore this email - your account stays secure.
    </td></tr>
  </table>
  <p style="margin:0 0 6px 0;color:#475569;">Tips for a strong password:</p>
  <ul style="margin:0 0 0 18px;padding:0;color:#334155;font-size:14px;">
    <li>12+ characters with upper, lower, numbers and symbols</li>
    <li>Do not reuse across sites</li>
    <li>Enable 2FA for extra protection</li>
  </ul>',
 'Rivendos fjalekalimin','Passwort zuruecksetzen','Reset password','{{reset_url}}',
 '["first_name","reset_url"]'::jsonb),

-- 4. INVOICE ISSUED
('invoice_issued','transactional','Fature e re',
 'Email i faturës së re për klientin.',
 true,true,
 'Fatura {{invoice_number}} ne shume prej {{amount}} {{currency}}.',
 'Rechnung {{invoice_number}} in Hoehe von {{amount}} {{currency}}.',
 'Invoice {{invoice_number}} for {{amount}} {{currency}}.',
 'Fatura {{invoice_number}}','Rechnung {{invoice_number}}','Invoice {{invoice_number}}',
 'Fatura e re eshte gati','Neue Rechnung','Your invoice is ready',
 'I nderuar <strong>{{customer_name}}</strong>, ne vijim gjeni faturen tuaj me numer <strong>{{invoice_number}}</strong> te leshuar me date <strong>{{issue_date}}</strong>.',
 'Sehr geehrte(r) <strong>{{customer_name}}</strong>, anbei Ihre Rechnung Nr. <strong>{{invoice_number}}</strong> vom <strong>{{issue_date}}</strong>.',
 'Dear <strong>{{customer_name}}</strong>, please find your invoice <strong>{{invoice_number}}</strong> issued on <strong>{{issue_date}}</strong>.',
 '<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin:4px 0 18px 0;border:1px solid #e2e8f0;border-radius:10px;background:#f8fafc;">
    <tr><td style="padding:12px 18px;border-bottom:1px solid #e2e8f0;"><strong>Numri i fatures:</strong> <span style="float:right;color:#0f172a;">{{invoice_number}}</span></td></tr>
    <tr><td style="padding:12px 18px;border-bottom:1px solid #e2e8f0;"><strong>Data e leshimit:</strong> <span style="float:right;color:#0f172a;">{{issue_date}}</span></td></tr>
    <tr><td style="padding:12px 18px;border-bottom:1px solid #e2e8f0;"><strong>Afati i pageses:</strong> <span style="float:right;color:#b91c1c;">{{due_date}}</span></td></tr>
    <tr><td style="padding:12px 18px;"><strong>Shuma totale:</strong> <span style="float:right;color:#0f766e;font-weight:700;font-size:16px;">{{amount}} {{currency}}</span></td></tr>
  </table>
  <p style="margin:0 0 6px 0;"><strong>Te dhenat per pagese me transfer bankar:</strong></p>
  <p style="margin:0 0 4px 0;color:#334155;">IBAN: <code style="background:#f1f5f9;padding:2px 6px;border-radius:4px;">{{iban}}</code></p>
  <p style="margin:0 0 14px 0;color:#334155;">Referenca: <code style="background:#f1f5f9;padding:2px 6px;border-radius:4px;">{{invoice_number}}</code></p>
  <p style="margin:0;color:#475569;font-size:13px;"><em>Fatura eshte bashkengjitur si PDF. Ne rast pyetjesh per kete fature, na kontaktoni duke iu referuar numrit te mesiperm.</em></p>',
 '<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin:4px 0 18px 0;border:1px solid #e2e8f0;border-radius:10px;background:#f8fafc;">
    <tr><td style="padding:12px 18px;border-bottom:1px solid #e2e8f0;"><strong>Rechnungsnummer:</strong> <span style="float:right;">{{invoice_number}}</span></td></tr>
    <tr><td style="padding:12px 18px;border-bottom:1px solid #e2e8f0;"><strong>Ausstellungsdatum:</strong> <span style="float:right;">{{issue_date}}</span></td></tr>
    <tr><td style="padding:12px 18px;border-bottom:1px solid #e2e8f0;"><strong>Faelligkeit:</strong> <span style="float:right;color:#b91c1c;">{{due_date}}</span></td></tr>
    <tr><td style="padding:12px 18px;"><strong>Gesamtbetrag:</strong> <span style="float:right;color:#0f766e;font-weight:700;font-size:16px;">{{amount}} {{currency}}</span></td></tr>
  </table>
  <p style="margin:0 0 6px 0;"><strong>Zahlung per Ueberweisung:</strong></p>
  <p style="margin:0 0 4px 0;">IBAN: <code style="background:#f1f5f9;padding:2px 6px;border-radius:4px;">{{iban}}</code></p>
  <p style="margin:0 0 14px 0;">Verwendungszweck: <code style="background:#f1f5f9;padding:2px 6px;border-radius:4px;">{{invoice_number}}</code></p>
  <p style="margin:0;color:#475569;font-size:13px;"><em>Die Rechnung ist als PDF angehaengt.</em></p>',
 '<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin:4px 0 18px 0;border:1px solid #e2e8f0;border-radius:10px;background:#f8fafc;">
    <tr><td style="padding:12px 18px;border-bottom:1px solid #e2e8f0;"><strong>Invoice number:</strong> <span style="float:right;">{{invoice_number}}</span></td></tr>
    <tr><td style="padding:12px 18px;border-bottom:1px solid #e2e8f0;"><strong>Issue date:</strong> <span style="float:right;">{{issue_date}}</span></td></tr>
    <tr><td style="padding:12px 18px;border-bottom:1px solid #e2e8f0;"><strong>Due date:</strong> <span style="float:right;color:#b91c1c;">{{due_date}}</span></td></tr>
    <tr><td style="padding:12px 18px;"><strong>Total amount:</strong> <span style="float:right;color:#0f766e;font-weight:700;font-size:16px;">{{amount}} {{currency}}</span></td></tr>
  </table>
  <p style="margin:0 0 6px 0;"><strong>Pay by bank transfer:</strong></p>
  <p style="margin:0 0 4px 0;">IBAN: <code style="background:#f1f5f9;padding:2px 6px;border-radius:4px;">{{iban}}</code></p>
  <p style="margin:0 0 14px 0;">Reference: <code style="background:#f1f5f9;padding:2px 6px;border-radius:4px;">{{invoice_number}}</code></p>
  <p style="margin:0;color:#475569;font-size:13px;"><em>The invoice is attached as PDF.</em></p>',
 'Shiko dhe paguaj','Rechnung ansehen','View & pay invoice','{{invoice_url}}',
 '["customer_name","invoice_number","issue_date","due_date","amount","currency","iban","invoice_url"]'::jsonb),

-- 5. INVOICE PAID
('invoice_paid','transactional','Fature e paguar',
 'Konfirmim i pageses se fatures.',
 true,true,
 'Faleminderit! Fatura {{invoice_number}} u pagua.',
 'Vielen Dank! Rechnung {{invoice_number}} wurde bezahlt.',
 'Thank you! Invoice {{invoice_number}} is paid.',
 'Fatura {{invoice_number}} u pagua','Rechnung {{invoice_number}} bezahlt','Invoice {{invoice_number}} paid',
 'Pagesa u konfirmua','Zahlung bestaetigt','Payment confirmed',
 'I nderuar <strong>{{customer_name}}</strong>, konfirmojme marrjen e pageses per faturen <strong>{{invoice_number}}</strong>. Ju faleminderit per bashkepunimin!',
 'Sehr geehrte(r) <strong>{{customer_name}}</strong>, wir bestaetigen den Zahlungseingang fuer Rechnung <strong>{{invoice_number}}</strong>. Vielen Dank!',
 'Dear <strong>{{customer_name}}</strong>, we confirm receipt of payment for invoice <strong>{{invoice_number}}</strong>. Thank you for your business!',
 '<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin:4px 0 18px 0;border:1px solid #bbf7d0;border-radius:10px;background:#f0fdf4;">
    <tr><td style="padding:12px 18px;border-bottom:1px solid #bbf7d0;"><strong>Shuma e marre:</strong> <span style="float:right;color:#15803d;font-weight:700;">{{amount}} {{currency}}</span></td></tr>
    <tr><td style="padding:12px 18px;border-bottom:1px solid #bbf7d0;"><strong>Data e pageses:</strong> <span style="float:right;">{{payment_date}}</span></td></tr>
    <tr><td style="padding:12px 18px;"><strong>Metoda:</strong> <span style="float:right;">{{payment_method}}</span></td></tr>
  </table>
  <p style="margin:0 0 8px 0;color:#475569;">Mund te shkarkoni nje kopje te fatures me vulen "E paguar" nga butoni me poshte.</p>',
 '<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin:4px 0 18px 0;border:1px solid #bbf7d0;border-radius:10px;background:#f0fdf4;">
    <tr><td style="padding:12px 18px;border-bottom:1px solid #bbf7d0;"><strong>Empfangener Betrag:</strong> <span style="float:right;color:#15803d;font-weight:700;">{{amount}} {{currency}}</span></td></tr>
    <tr><td style="padding:12px 18px;border-bottom:1px solid #bbf7d0;"><strong>Zahlungsdatum:</strong> <span style="float:right;">{{payment_date}}</span></td></tr>
    <tr><td style="padding:12px 18px;"><strong>Methode:</strong> <span style="float:right;">{{payment_method}}</span></td></tr>
  </table>
  <p style="margin:0 0 8px 0;color:#475569;">Laden Sie die bezahlte Rechnung als PDF herunter.</p>',
 '<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin:4px 0 18px 0;border:1px solid #bbf7d0;border-radius:10px;background:#f0fdf4;">
    <tr><td style="padding:12px 18px;border-bottom:1px solid #bbf7d0;"><strong>Amount received:</strong> <span style="float:right;color:#15803d;font-weight:700;">{{amount}} {{currency}}</span></td></tr>
    <tr><td style="padding:12px 18px;border-bottom:1px solid #bbf7d0;"><strong>Payment date:</strong> <span style="float:right;">{{payment_date}}</span></td></tr>
    <tr><td style="padding:12px 18px;"><strong>Method:</strong> <span style="float:right;">{{payment_method}}</span></td></tr>
  </table>
  <p style="margin:0 0 8px 0;color:#475569;">Download the paid invoice PDF below.</p>',
 'Shkarko faturen','Rechnung herunterladen','Download invoice','{{invoice_url}}',
 '["customer_name","invoice_number","amount","currency","payment_date","payment_method","invoice_url"]'::jsonb),

-- 6. INVOICE OVERDUE
('invoice_overdue','transactional','Rikujtese fature e vonuar',
 'Rikujtesë për fatura të pa paguara.',
 true,true,
 'Fatura {{invoice_number}} eshte {{days_overdue}} dite e vonuar.',
 'Rechnung {{invoice_number}} ist {{days_overdue}} Tage ueberfaellig.',
 'Invoice {{invoice_number}} is {{days_overdue}} days overdue.',
 'Rikujtese: Fatura {{invoice_number}} eshte e vonuar','Erinnerung: Rechnung {{invoice_number}} ueberfaellig','Reminder: Invoice {{invoice_number}} overdue',
 'Rikujtese pageses','Zahlungserinnerung','Payment reminder',
 'I nderuar <strong>{{customer_name}}</strong>, konstatojme qe fatura <strong>{{invoice_number}}</strong>, e leshuar me <strong>{{issue_date}}</strong>, ende nuk figuron e paguar dhe eshte <strong>{{days_overdue}} dite</strong> pas afatit.',
 'Sehr geehrte(r) <strong>{{customer_name}}</strong>, die Rechnung <strong>{{invoice_number}}</strong> vom <strong>{{issue_date}}</strong> ist noch nicht beglichen und bereits <strong>{{days_overdue}} Tage</strong> ueberfaellig.',
 'Dear <strong>{{customer_name}}</strong>, invoice <strong>{{invoice_number}}</strong> issued on <strong>{{issue_date}}</strong> is still unpaid and now <strong>{{days_overdue}} days</strong> past due.',
 '<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin:4px 0 18px 0;border:1px solid #fecaca;border-radius:10px;background:#fef2f2;">
    <tr><td style="padding:12px 18px;border-bottom:1px solid #fecaca;"><strong>Shuma e mbetur:</strong> <span style="float:right;color:#b91c1c;font-weight:700;">{{amount}} {{currency}}</span></td></tr>
    <tr><td style="padding:12px 18px;"><strong>Afati origjinal:</strong> <span style="float:right;">{{due_date}}</span></td></tr>
  </table>
  <p style="margin:0 0 10px 0;">Ju lutem vazhdoni me pagesen sa me shpejt te jete e mundur ose na kontaktoni nese ka ndonje pasaktesi.</p>
  <p style="margin:0 0 0 0;color:#475569;font-size:13px;"><em>Nese pagesa eshte bere tashme, ju lutem injoroni kete rikujtese. Per cdo veshtiresi te perkohshme, jemi ne dispozicion per te gjetur nje zgjidhje te perbashket.</em></p>',
 '<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin:4px 0 18px 0;border:1px solid #fecaca;border-radius:10px;background:#fef2f2;">
    <tr><td style="padding:12px 18px;border-bottom:1px solid #fecaca;"><strong>Offener Betrag:</strong> <span style="float:right;color:#b91c1c;font-weight:700;">{{amount}} {{currency}}</span></td></tr>
    <tr><td style="padding:12px 18px;"><strong>Urspruenglicher Termin:</strong> <span style="float:right;">{{due_date}}</span></td></tr>
  </table>
  <p style="margin:0 0 10px 0;">Bitte begleichen Sie die Rechnung zeitnah oder kontaktieren Sie uns bei Rueckfragen.</p>
  <p style="margin:0;color:#475569;font-size:13px;"><em>Sollte die Zahlung bereits erfolgt sein, betrachten Sie diese E-Mail als gegenstandslos.</em></p>',
 '<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin:4px 0 18px 0;border:1px solid #fecaca;border-radius:10px;background:#fef2f2;">
    <tr><td style="padding:12px 18px;border-bottom:1px solid #fecaca;"><strong>Outstanding amount:</strong> <span style="float:right;color:#b91c1c;font-weight:700;">{{amount}} {{currency}}</span></td></tr>
    <tr><td style="padding:12px 18px;"><strong>Original due date:</strong> <span style="float:right;">{{due_date}}</span></td></tr>
  </table>
  <p style="margin:0 0 10px 0;">Please settle the invoice at your earliest convenience or reach out if there is any discrepancy.</p>
  <p style="margin:0;color:#475569;font-size:13px;"><em>If payment has already been sent, please disregard this reminder.</em></p>',
 'Paguaj tani','Jetzt bezahlen','Pay now','{{invoice_url}}',
 '["customer_name","invoice_number","issue_date","due_date","days_overdue","amount","currency","invoice_url"]'::jsonb),

-- 7. SUBSCRIPTION ACTIVATED
('subscription_activated','transactional','Abonim i aktivizuar',
 'Konfirmim i aktivizimit të planit.',
 true,true,
 'Plani {{plan_name}} u aktivizua per {{company_name}}.',
 'Plan {{plan_name}} wurde fuer {{company_name}} aktiviert.',
 'Plan {{plan_name}} is now active for {{company_name}}.',
 'Abonimi u aktivizua: {{plan_name}}','Abonnement aktiviert: {{plan_name}}','Subscription activated: {{plan_name}}',
 'Plani eshte aktiv','Ihr Plan ist aktiv','Your plan is live',
 'I nderuar <strong>{{first_name}}</strong>, plani <strong>{{plan_name}}</strong> eshte aktivizuar per kompaninë <strong>{{company_name}}</strong>. Ja cfare perfshin:',
 'Sehr geehrte(r) <strong>{{first_name}}</strong>, Plan <strong>{{plan_name}}</strong> wurde fuer <strong>{{company_name}}</strong> aktiviert. Enthalten sind:',
 'Hi <strong>{{first_name}}</strong>, plan <strong>{{plan_name}}</strong> is active for <strong>{{company_name}}</strong>. Here is what is included:',
 '<ul style="margin:4px 0 16px 18px;padding:0;color:#334155;line-height:1.7;">
    <li>Akses i plote ne modulet e planit</li>
    <li>Perdorues te pakufizuar sipas rolit</li>
    <li>Mbeshtetje teknike prioritare</li>
    <li>Backup automatik dhe siguria e te dhenave</li>
  </ul>
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin:4px 0 18px 0;border:1px solid #e2e8f0;border-radius:10px;background:#f8fafc;">
    <tr><td style="padding:12px 18px;border-bottom:1px solid #e2e8f0;"><strong>Cikli i faturimit:</strong> <span style="float:right;">{{billing_cycle}}</span></td></tr>
    <tr><td style="padding:12px 18px;border-bottom:1px solid #e2e8f0;"><strong>Fatura tjeter:</strong> <span style="float:right;">{{next_billing_date}}</span></td></tr>
    <tr><td style="padding:12px 18px;"><strong>Shuma e ardhshme:</strong> <span style="float:right;color:#0f766e;font-weight:700;">{{amount}} {{currency}}</span></td></tr>
  </table>',
 '<ul style="margin:4px 0 16px 18px;padding:0;color:#334155;line-height:1.7;">
    <li>Voller Zugriff auf die Module des Plans</li>
    <li>Unbegrenzte Benutzer pro Rolle</li>
    <li>Priorisierter technischer Support</li>
    <li>Automatische Backups und Datensicherheit</li>
  </ul>
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin:4px 0 18px 0;border:1px solid #e2e8f0;border-radius:10px;background:#f8fafc;">
    <tr><td style="padding:12px 18px;border-bottom:1px solid #e2e8f0;"><strong>Abrechnungszyklus:</strong> <span style="float:right;">{{billing_cycle}}</span></td></tr>
    <tr><td style="padding:12px 18px;border-bottom:1px solid #e2e8f0;"><strong>Naechste Rechnung:</strong> <span style="float:right;">{{next_billing_date}}</span></td></tr>
    <tr><td style="padding:12px 18px;"><strong>Naechster Betrag:</strong> <span style="float:right;color:#0f766e;font-weight:700;">{{amount}} {{currency}}</span></td></tr>
  </table>',
 '<ul style="margin:4px 0 16px 18px;padding:0;color:#334155;line-height:1.7;">
    <li>Full access to plan modules</li>
    <li>Unlimited users per role</li>
    <li>Priority technical support</li>
    <li>Automatic backups and data security</li>
  </ul>
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin:4px 0 18px 0;border:1px solid #e2e8f0;border-radius:10px;background:#f8fafc;">
    <tr><td style="padding:12px 18px;border-bottom:1px solid #e2e8f0;"><strong>Billing cycle:</strong> <span style="float:right;">{{billing_cycle}}</span></td></tr>
    <tr><td style="padding:12px 18px;border-bottom:1px solid #e2e8f0;"><strong>Next invoice:</strong> <span style="float:right;">{{next_billing_date}}</span></td></tr>
    <tr><td style="padding:12px 18px;"><strong>Next amount:</strong> <span style="float:right;color:#0f766e;font-weight:700;">{{amount}} {{currency}}</span></td></tr>
  </table>',
 'Menaxho abonimin','Abonnement verwalten','Manage subscription','{{app_base_url}}/company/subscription',
 '["first_name","company_name","plan_name","billing_cycle","next_billing_date","amount","currency"]'::jsonb),

-- 8. TRIAL ENDING SOON
('trial_ending_soon','transactional','Periudha provuese po perfundon',
 'Rikujtesë kur provoja po mbaron.',
 true,true,
 'Provoja jote perfundon per {{days_remaining}} dite.',
 'Ihre Testphase endet in {{days_remaining}} Tagen.',
 'Your trial ends in {{days_remaining}} days.',
 'Periudha provuese perfundon per {{days_remaining}} dite','Testphase endet in {{days_remaining}} Tagen','Trial ends in {{days_remaining}} days',
 'Provoja jote po perfundon','Ihre Testphase endet bald','Your trial is ending',
 'Pershendetje <strong>{{first_name}}</strong>, provoja e <strong>{{company_name}}</strong> perfundon me <strong>{{trial_end_date}}</strong>. Zgjidh nje plan tani per te mos nderprere punen.',
 'Hallo <strong>{{first_name}}</strong>, die Testphase von <strong>{{company_name}}</strong> endet am <strong>{{trial_end_date}}</strong>. Waehlen Sie jetzt einen Plan.',
 'Hi <strong>{{first_name}}</strong>, the trial for <strong>{{company_name}}</strong> ends on <strong>{{trial_end_date}}</strong>. Pick a plan now to keep working without interruption.',
 '<p style="margin:0 0 8px 0;"><strong>Cfare do te humbasesh pas provos:</strong></p>
  <ul style="margin:0 0 16px 18px;padding:0;color:#334155;line-height:1.7;">
    <li>Akses ne te gjitha dergesat dhe faturat aktive</li>
    <li>Mbeshtetje te drejtperdrejte nga ekipi yne</li>
    <li>Te dhenat e kompanise do te behen <em>vetem per lexim</em> per 30 dite para fshirjes</li>
  </ul>
  <p style="margin:0 0 10px 0;"><strong>Ofrojme 3 plane te personalizueshem.</strong> Klik butonin me poshte per te zgjedhur.</p>
  <p style="margin:0;color:#475569;font-size:13px;"><em>Keni pyetje? Menaxheri yt eshte ne dispozicion ne {{support_url}}.</em></p>',
 '<p style="margin:0 0 8px 0;"><strong>Was Sie nach Ablauf verlieren:</strong></p>
  <ul style="margin:0 0 16px 18px;padding:0;color:#334155;line-height:1.7;">
    <li>Zugriff auf alle aktiven Lieferungen und Rechnungen</li>
    <li>Direkten Support unseres Teams</li>
    <li>Unternehmensdaten werden 30 Tage lang <em>schreibgeschuetzt</em></li>
  </ul>
  <p style="margin:0 0 10px 0;"><strong>Wir bieten 3 flexible Plaene.</strong></p>',
 '<p style="margin:0 0 8px 0;"><strong>What you lose after trial:</strong></p>
  <ul style="margin:0 0 16px 18px;padding:0;color:#334155;line-height:1.7;">
    <li>Access to all active deliveries and invoices</li>
    <li>Direct support from our team</li>
    <li>Company data becomes <em>read-only</em> for 30 days before deletion</li>
  </ul>
  <p style="margin:0 0 10px 0;"><strong>We offer 3 flexible plans to match your needs.</strong></p>',
 'Zgjidh planin','Plan waehlen','Choose a plan','{{app_base_url}}/company/subscription',
 '["first_name","company_name","days_remaining","trial_end_date"]'::jsonb),

-- 9. DELIVERY ASSIGNED
('delivery_assigned','transactional','Dergese e caktuar',
 'Njoftim për shoferin kur i caktohet një dergesë e re.',
 true,true,
 'Dergesa {{note_number}} eshte caktuar per {{pickup_date}}.',
 'Lieferung {{note_number}} zugewiesen fuer {{pickup_date}}.',
 'Delivery {{note_number}} assigned for {{pickup_date}}.',
 'Dergese e re: {{note_number}}','Neue Lieferung: {{note_number}}','New delivery: {{note_number}}',
 'Detyre e re dergese','Neue Lieferung','New delivery task',
 'Pershendetje <strong>{{driver_name}}</strong>, te eshte caktuar nje dergese e re. Gjej detajet e meposhtme dhe konfirmo marrjen.',
 'Hallo <strong>{{driver_name}}</strong>, Ihnen wurde eine neue Lieferung zugewiesen. Details unten.',
 'Hi <strong>{{driver_name}}</strong>, a new delivery has been assigned to you. Details below.',
 '<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin:4px 0 18px 0;border:1px solid #e2e8f0;border-radius:10px;background:#f8fafc;">
    <tr><td style="padding:12px 18px;border-bottom:1px solid #e2e8f0;"><strong>Numri:</strong> <span style="float:right;">{{note_number}}</span></td></tr>
    <tr><td style="padding:12px 18px;border-bottom:1px solid #e2e8f0;"><strong>Klienti:</strong> <span style="float:right;">{{partner_name}}</span></td></tr>
    <tr><td style="padding:12px 18px;border-bottom:1px solid #e2e8f0;"><strong>Ngarkimi:</strong> <span style="float:right;">{{pickup_location}}</span></td></tr>
    <tr><td style="padding:12px 18px;border-bottom:1px solid #e2e8f0;"><strong>Shkarkimi:</strong> <span style="float:right;">{{delivery_location}}</span></td></tr>
    <tr><td style="padding:12px 18px;border-bottom:1px solid #e2e8f0;"><strong>Data/Ora:</strong> <span style="float:right;">{{pickup_date}} {{pickup_time}}</span></td></tr>
    <tr><td style="padding:12px 18px;"><strong>Mjeti:</strong> <span style="float:right;">{{vehicle_plate}}</span></td></tr>
  </table>
  <p style="margin:0 0 8px 0;color:#475569;"><strong>Udhezime:</strong> {{notes}}</p>',
 '<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin:4px 0 18px 0;border:1px solid #e2e8f0;border-radius:10px;background:#f8fafc;">
    <tr><td style="padding:12px 18px;border-bottom:1px solid #e2e8f0;"><strong>Nummer:</strong> <span style="float:right;">{{note_number}}</span></td></tr>
    <tr><td style="padding:12px 18px;border-bottom:1px solid #e2e8f0;"><strong>Kunde:</strong> <span style="float:right;">{{partner_name}}</span></td></tr>
    <tr><td style="padding:12px 18px;border-bottom:1px solid #e2e8f0;"><strong>Abholung:</strong> <span style="float:right;">{{pickup_location}}</span></td></tr>
    <tr><td style="padding:12px 18px;border-bottom:1px solid #e2e8f0;"><strong>Zustellung:</strong> <span style="float:right;">{{delivery_location}}</span></td></tr>
    <tr><td style="padding:12px 18px;border-bottom:1px solid #e2e8f0;"><strong>Datum/Zeit:</strong> <span style="float:right;">{{pickup_date}} {{pickup_time}}</span></td></tr>
    <tr><td style="padding:12px 18px;"><strong>Fahrzeug:</strong> <span style="float:right;">{{vehicle_plate}}</span></td></tr>
  </table>
  <p style="margin:0 0 8px 0;color:#475569;"><strong>Hinweise:</strong> {{notes}}</p>',
 '<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin:4px 0 18px 0;border:1px solid #e2e8f0;border-radius:10px;background:#f8fafc;">
    <tr><td style="padding:12px 18px;border-bottom:1px solid #e2e8f0;"><strong>Number:</strong> <span style="float:right;">{{note_number}}</span></td></tr>
    <tr><td style="padding:12px 18px;border-bottom:1px solid #e2e8f0;"><strong>Customer:</strong> <span style="float:right;">{{partner_name}}</span></td></tr>
    <tr><td style="padding:12px 18px;border-bottom:1px solid #e2e8f0;"><strong>Pickup:</strong> <span style="float:right;">{{pickup_location}}</span></td></tr>
    <tr><td style="padding:12px 18px;border-bottom:1px solid #e2e8f0;"><strong>Delivery:</strong> <span style="float:right;">{{delivery_location}}</span></td></tr>
    <tr><td style="padding:12px 18px;border-bottom:1px solid #e2e8f0;"><strong>Date/time:</strong> <span style="float:right;">{{pickup_date}} {{pickup_time}}</span></td></tr>
    <tr><td style="padding:12px 18px;"><strong>Vehicle:</strong> <span style="float:right;">{{vehicle_plate}}</span></td></tr>
  </table>
  <p style="margin:0 0 8px 0;color:#475569;"><strong>Instructions:</strong> {{notes}}</p>',
 'Hap dergesen','Lieferung oeffnen','Open delivery','{{app_base_url}}/driver',
 '["driver_name","note_number","partner_name","pickup_location","delivery_location","pickup_date","pickup_time","vehicle_plate","notes"]'::jsonb),

-- 10. FLEET DOC REJECTED
('fleet_doc_rejected','transactional','Dokument flote u refuzua',
 'Njoftim kur një dokument i flotës refuzohet.',
 true,true,
 'Dokumenti {{doc_type}} u refuzua - kerkohet veprim.',
 'Dokument {{doc_type}} abgelehnt - Aktion erforderlich.',
 'Document {{doc_type}} was rejected - action required.',
 'Dokumenti u refuzua: {{doc_type}}','Dokument abgelehnt: {{doc_type}}','Document rejected: {{doc_type}}',
 'Dokumenti kerkon rishikim','Dokument zur Ueberpruefung','Document needs review',
 'Pershendetje <strong>{{first_name}}</strong>, dokumenti <strong>{{doc_type}}</strong> per <strong>{{subject_label}}</strong> u refuzua nga administratori. Ju lutem rishikoni arsyen dhe ringarkoni dokumentin.',
 'Hallo <strong>{{first_name}}</strong>, das Dokument <strong>{{doc_type}}</strong> fuer <strong>{{subject_label}}</strong> wurde abgelehnt. Bitte laden Sie es erneut hoch.',
 'Hi <strong>{{first_name}}</strong>, the document <strong>{{doc_type}}</strong> for <strong>{{subject_label}}</strong> has been rejected. Please review the reason and upload a new version.',
 '<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin:4px 0 18px 0;border:1px solid #fecaca;border-radius:10px;background:#fef2f2;">
    <tr><td style="padding:14px 18px;"><strong style="color:#b91c1c;">Arsyeja e refuzimit:</strong><br/><span style="color:#7f1d1d;">{{reason}}</span></td></tr>
  </table>
  <p style="margin:0 0 8px 0;color:#475569;">Sigurohu qe dokumenti eshte i qarte, ne afat dhe permban te gjitha faqet e kerkuara.</p>',
 '<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin:4px 0 18px 0;border:1px solid #fecaca;border-radius:10px;background:#fef2f2;">
    <tr><td style="padding:14px 18px;"><strong style="color:#b91c1c;">Ablehnungsgrund:</strong><br/><span style="color:#7f1d1d;">{{reason}}</span></td></tr>
  </table>',
 '<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin:4px 0 18px 0;border:1px solid #fecaca;border-radius:10px;background:#fef2f2;">
    <tr><td style="padding:14px 18px;"><strong style="color:#b91c1c;">Rejection reason:</strong><br/><span style="color:#7f1d1d;">{{reason}}</span></td></tr>
  </table>',
 'Ringarko dokumentin','Dokument erneut hochladen','Re-upload document','{{app_base_url}}/driver/documents',
 '["first_name","doc_type","subject_label","reason"]'::jsonb),

-- 11. COMPLIANCE EXPIRING
('compliance_expiring','transactional','Dokument compliance skadon',
 'Rikujtesë kur një dokument compliance po skadon.',
 true,true,
 '{{type_label}} skadon per {{days_remaining}} dite - {{subject_label}}.',
 '{{type_label}} laeuft in {{days_remaining}} Tagen ab - {{subject_label}}.',
 '{{type_label}} expires in {{days_remaining}} days - {{subject_label}}.',
 '{{type_label}} skadon per {{days_remaining}} dite - {{subject_label}}','{{type_label}} laeuft in {{days_remaining}} Tagen ab - {{subject_label}}','{{type_label}} expires in {{days_remaining}} days - {{subject_label}}',
 'Kerkohet rinovim','Verlaengerung erforderlich','Renewal required',
 'Pershendetje <strong>{{first_name}}</strong>, dokumenti <strong>{{type_label}}</strong> per <strong>{{subject_label}}</strong> skadon ne <strong>{{expiry_date}}</strong> (ne {{days_remaining}} dite).',
 'Hallo <strong>{{first_name}}</strong>, das Dokument <strong>{{type_label}}</strong> fuer <strong>{{subject_label}}</strong> laeuft am <strong>{{expiry_date}}</strong> ab (in {{days_remaining}} Tagen).',
 'Hi <strong>{{first_name}}</strong>, the <strong>{{type_label}}</strong> for <strong>{{subject_label}}</strong> expires on <strong>{{expiry_date}}</strong> (in {{days_remaining}} days).',
 '<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin:4px 0 18px 0;border:1px solid #fde68a;border-radius:10px;background:#fffbeb;">
    <tr><td style="padding:14px 18px;font-size:14px;line-height:1.6;color:#92400e;">
      <strong>Pasoja pas skadimit:</strong> Mjeti/shoferi <em>nuk mund te perdoret</em> ne dergesa te reja dhe platforma e bllokon automatikisht deri ne rinovim.
    </td></tr>
  </table>
  <p style="margin:0;color:#475569;">Rinovo dokumentin ne kohe per te shmangur nderprerjen e sherbimit.</p>',
 '<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin:4px 0 18px 0;border:1px solid #fde68a;border-radius:10px;background:#fffbeb;">
    <tr><td style="padding:14px 18px;font-size:14px;line-height:1.6;color:#92400e;">
      <strong>Folge nach Ablauf:</strong> Das Fahrzeug/der Fahrer kann <em>nicht</em> fuer neue Lieferungen verwendet werden.
    </td></tr>
  </table>',
 '<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin:4px 0 18px 0;border:1px solid #fde68a;border-radius:10px;background:#fffbeb;">
    <tr><td style="padding:14px 18px;font-size:14px;line-height:1.6;color:#92400e;">
      <strong>Consequence after expiry:</strong> The vehicle/driver <em>cannot</em> be used for new deliveries until renewed.
    </td></tr>
  </table>',
 'Rinovo tani','Jetzt verlaengern','Renew now','{{app_base_url}}/company/compliance',
 '["first_name","type_label","subject_label","days_remaining","expiry_date"]'::jsonb),

-- 12. ADMIN BROADCAST
('admin_broadcast','marketing','Njoftim i pergjithshem',
 'Template i lire per njoftime dhe fushata marketingu.',
 true,true,
 '{{preheader}}','{{preheader}}','{{preheader}}',
 '{{subject}}','{{subject}}','{{subject}}',
 '{{heading}}','{{heading}}','{{heading}}',
 '{{intro}}','{{intro}}','{{intro}}',
 '{{body_html}}','{{body_html}}','{{body_html}}',
 '{{cta_label}}','{{cta_label}}','{{cta_label}}','{{cta_url}}',
 '["subject","preheader","heading","intro","body_html","cta_label","cta_url"]'::jsonb),

-- 13. MARKETING PROMO (NEW)
('marketing_promo','marketing','Oferte promovuese',
 'Email promovues me kod zbritjeje.',
 false,true,
 'Vetem sot: {{discount}} ulje me kodin {{promo_code}}.',
 'Nur heute: {{discount}} Rabatt mit Code {{promo_code}}.',
 'Today only: {{discount}} off with code {{promo_code}}.',
 'Oferte speciale: {{discount}} ulje','Sonderangebot: {{discount}} Rabatt','Special offer: {{discount}} off',
 'Nje oferte e dizenjuar per ty','Ein Angebot nur fuer Sie','An offer crafted for you',
 'Pershendetje <strong>{{first_name}}</strong>, kemi pergatitur nje oferte te limituar vetem per klientet tane besnike: <strong>{{discount}} ulje</strong> ne planin <strong>{{plan_name}}</strong>.',
 'Hallo <strong>{{first_name}}</strong>, wir haben ein zeitlich begrenztes Angebot fuer Sie: <strong>{{discount}} Rabatt</strong> auf <strong>{{plan_name}}</strong>.',
 'Hi <strong>{{first_name}}</strong>, we prepared a limited-time offer just for you: <strong>{{discount}} off</strong> on the <strong>{{plan_name}}</strong> plan.',
 '<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin:4px 0 18px 0;border:2px dashed #0f766e;border-radius:12px;background:#ecfdf5;">
    <tr><td align="center" style="padding:18px;">
      <div style="font-size:12px;text-transform:uppercase;letter-spacing:2px;color:#065f46;margin-bottom:6px;">Kodi yt promovues</div>
      <div style="font-size:26px;font-weight:800;color:#064e3b;letter-spacing:3px;">{{promo_code}}</div>
      <div style="font-size:12px;color:#047857;margin-top:6px;">Vlen deri me <strong>{{expires_on}}</strong></div>
    </td></tr>
  </table>
  <p style="margin:0 0 10px 0;"><strong>Cfare perfiton:</strong></p>
  <ul style="margin:0 0 14px 18px;padding:0;color:#334155;line-height:1.7;">
    <li>Kursim i menjehershem ne faturen e pare</li>
    <li>Te gjitha modulet e planit te zgjedhur</li>
    <li>Mbeshtetje te dedikuar</li>
  </ul>
  <p style="margin:0;color:#475569;font-size:13px;"><em>Kushte: Oferta vlen per abonime te reja ose upgrade. Nuk kumulohet me oferta te tjera.</em></p>',
 '<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin:4px 0 18px 0;border:2px dashed #0f766e;border-radius:12px;background:#ecfdf5;">
    <tr><td align="center" style="padding:18px;">
      <div style="font-size:12px;text-transform:uppercase;letter-spacing:2px;color:#065f46;">Ihr Promo-Code</div>
      <div style="font-size:26px;font-weight:800;color:#064e3b;letter-spacing:3px;">{{promo_code}}</div>
      <div style="font-size:12px;color:#047857;margin-top:6px;">Gueltig bis <strong>{{expires_on}}</strong></div>
    </td></tr>
  </table>
  <p style="margin:0 0 10px 0;"><strong>Ihre Vorteile:</strong></p>
  <ul style="margin:0 0 14px 18px;padding:0;color:#334155;line-height:1.7;">
    <li>Sofortige Ersparnis bei der ersten Rechnung</li>
    <li>Alle Module des gewaehlten Plans</li>
    <li>Dedizierter Support</li>
  </ul>',
 '<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin:4px 0 18px 0;border:2px dashed #0f766e;border-radius:12px;background:#ecfdf5;">
    <tr><td align="center" style="padding:18px;">
      <div style="font-size:12px;text-transform:uppercase;letter-spacing:2px;color:#065f46;">Your promo code</div>
      <div style="font-size:26px;font-weight:800;color:#064e3b;letter-spacing:3px;">{{promo_code}}</div>
      <div style="font-size:12px;color:#047857;margin-top:6px;">Valid until <strong>{{expires_on}}</strong></div>
    </td></tr>
  </table>
  <p style="margin:0 0 10px 0;"><strong>What you get:</strong></p>
  <ul style="margin:0 0 14px 18px;padding:0;color:#334155;line-height:1.7;">
    <li>Immediate savings on your first invoice</li>
    <li>Full access to your plan modules</li>
    <li>Dedicated support</li>
  </ul>',
 'Aktivizo oferten','Angebot aktivieren','Redeem offer','{{app_base_url}}/company/subscription?promo={{promo_code}}',
 '["first_name","discount","promo_code","plan_name","expires_on"]'::jsonb),

-- 14. NEWSLETTER (NEW)
('newsletter','marketing','Newsletter mujor',
 'Newsletter periodik me lajme dhe keshilla.',
 false,true,
 'Edicioni i {{month}}: lajmet me te fundit dhe keshilla te dobishme.',
 'Ausgabe {{month}}: Neuigkeiten und Tipps.',
 'Edition {{month}}: latest news and tips.',
 'Newsletter {{month}}','Newsletter {{month}}','Newsletter {{month}}',
 'Newsletter i {{month}}','Newsletter fuer {{month}}','{{month}} newsletter',
 'Pershendetje <strong>{{first_name}}</strong>, ne edicionin e ketij muaji: 3 lajme kryesore, nje keshille praktike dhe nje tregim suksesi nga klientet tane.',
 'Hallo <strong>{{first_name}}</strong>, in dieser Ausgabe: 3 Top-News, ein praktischer Tipp und eine Erfolgsgeschichte.',
 'Hi <strong>{{first_name}}</strong>, in this edition: 3 top stories, one practical tip and a customer success story.',
 '<div style="margin:4px 0 18px 0;">
    <div style="padding:12px 16px;background:#f8fafc;border-left:4px solid #0f766e;border-radius:6px;margin-bottom:10px;">
      <div style="font-size:11px;text-transform:uppercase;letter-spacing:1.5px;color:#0f766e;font-weight:700;">Lajm 1</div>
      <div style="font-weight:700;color:#0f172a;margin:2px 0;">{{story_1_title}}</div>
      <div style="color:#475569;font-size:14px;">{{story_1_summary}}</div>
    </div>
    <div style="padding:12px 16px;background:#f8fafc;border-left:4px solid #fbbf24;border-radius:6px;margin-bottom:10px;">
      <div style="font-size:11px;text-transform:uppercase;letter-spacing:1.5px;color:#b45309;font-weight:700;">Lajm 2</div>
      <div style="font-weight:700;color:#0f172a;margin:2px 0;">{{story_2_title}}</div>
      <div style="color:#475569;font-size:14px;">{{story_2_summary}}</div>
    </div>
    <div style="padding:12px 16px;background:#f8fafc;border-left:4px solid #0f172a;border-radius:6px;">
      <div style="font-size:11px;text-transform:uppercase;letter-spacing:1.5px;color:#0f172a;font-weight:700;">Lajm 3</div>
      <div style="font-weight:700;color:#0f172a;margin:2px 0;">{{story_3_title}}</div>
      <div style="color:#475569;font-size:14px;">{{story_3_summary}}</div>
    </div>
  </div>
  <div style="padding:14px 18px;background:#ecfdf5;border:1px solid #a7f3d0;border-radius:10px;margin-bottom:10px;">
    <div style="font-weight:700;color:#065f46;margin-bottom:4px;">Keshilla e muajit</div>
    <div style="color:#064e3b;font-size:14px;">{{tip_of_month}}</div>
  </div>',
 '<div style="margin:4px 0 18px 0;">
    <div style="padding:12px 16px;background:#f8fafc;border-left:4px solid #0f766e;border-radius:6px;margin-bottom:10px;">
      <div style="font-size:11px;text-transform:uppercase;letter-spacing:1.5px;color:#0f766e;font-weight:700;">News 1</div>
      <div style="font-weight:700;color:#0f172a;margin:2px 0;">{{story_1_title}}</div>
      <div style="color:#475569;font-size:14px;">{{story_1_summary}}</div>
    </div>
    <div style="padding:12px 16px;background:#f8fafc;border-left:4px solid #fbbf24;border-radius:6px;margin-bottom:10px;">
      <div style="font-size:11px;text-transform:uppercase;letter-spacing:1.5px;color:#b45309;font-weight:700;">News 2</div>
      <div style="font-weight:700;color:#0f172a;margin:2px 0;">{{story_2_title}}</div>
      <div style="color:#475569;font-size:14px;">{{story_2_summary}}</div>
    </div>
    <div style="padding:12px 16px;background:#f8fafc;border-left:4px solid #0f172a;border-radius:6px;">
      <div style="font-size:11px;text-transform:uppercase;letter-spacing:1.5px;color:#0f172a;font-weight:700;">News 3</div>
      <div style="font-weight:700;color:#0f172a;margin:2px 0;">{{story_3_title}}</div>
      <div style="color:#475569;font-size:14px;">{{story_3_summary}}</div>
    </div>
  </div>
  <div style="padding:14px 18px;background:#ecfdf5;border:1px solid #a7f3d0;border-radius:10px;">
    <div style="font-weight:700;color:#065f46;margin-bottom:4px;">Tipp des Monats</div>
    <div style="color:#064e3b;font-size:14px;">{{tip_of_month}}</div>
  </div>',
 '<div style="margin:4px 0 18px 0;">
    <div style="padding:12px 16px;background:#f8fafc;border-left:4px solid #0f766e;border-radius:6px;margin-bottom:10px;">
      <div style="font-size:11px;text-transform:uppercase;letter-spacing:1.5px;color:#0f766e;font-weight:700;">Story 1</div>
      <div style="font-weight:700;color:#0f172a;margin:2px 0;">{{story_1_title}}</div>
      <div style="color:#475569;font-size:14px;">{{story_1_summary}}</div>
    </div>
    <div style="padding:12px 16px;background:#f8fafc;border-left:4px solid #fbbf24;border-radius:6px;margin-bottom:10px;">
      <div style="font-size:11px;text-transform:uppercase;letter-spacing:1.5px;color:#b45309;font-weight:700;">Story 2</div>
      <div style="font-weight:700;color:#0f172a;margin:2px 0;">{{story_2_title}}</div>
      <div style="color:#475569;font-size:14px;">{{story_2_summary}}</div>
    </div>
    <div style="padding:12px 16px;background:#f8fafc;border-left:4px solid #0f172a;border-radius:6px;">
      <div style="font-size:11px;text-transform:uppercase;letter-spacing:1.5px;color:#0f172a;font-weight:700;">Story 3</div>
      <div style="font-weight:700;color:#0f172a;margin:2px 0;">{{story_3_title}}</div>
      <div style="color:#475569;font-size:14px;">{{story_3_summary}}</div>
    </div>
  </div>
  <div style="padding:14px 18px;background:#ecfdf5;border:1px solid #a7f3d0;border-radius:10px;">
    <div style="font-weight:700;color:#065f46;margin-bottom:4px;">Tip of the month</div>
    <div style="color:#064e3b;font-size:14px;">{{tip_of_month}}</div>
  </div>',
 'Lexo me shume','Mehr lesen','Read more','{{app_base_url}}/news',
 '["first_name","month","story_1_title","story_1_summary","story_2_title","story_2_summary","story_3_title","story_3_summary","tip_of_month"]'::jsonb)

ON CONFLICT (code) DO UPDATE SET
  category = EXCLUDED.category,
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  is_active = EXCLUDED.is_active,
  preheader_sq = EXCLUDED.preheader_sq,
  preheader_de = EXCLUDED.preheader_de,
  preheader_en = EXCLUDED.preheader_en,
  subject_sq = EXCLUDED.subject_sq,
  subject_de = EXCLUDED.subject_de,
  subject_en = EXCLUDED.subject_en,
  heading_sq = EXCLUDED.heading_sq,
  heading_de = EXCLUDED.heading_de,
  heading_en = EXCLUDED.heading_en,
  intro_sq = EXCLUDED.intro_sq,
  intro_de = EXCLUDED.intro_de,
  intro_en = EXCLUDED.intro_en,
  body_html_sq = EXCLUDED.body_html_sq,
  body_html_de = EXCLUDED.body_html_de,
  body_html_en = EXCLUDED.body_html_en,
  cta_label_sq = EXCLUDED.cta_label_sq,
  cta_label_de = EXCLUDED.cta_label_de,
  cta_label_en = EXCLUDED.cta_label_en,
  cta_url = EXCLUDED.cta_url,
  variables = EXCLUDED.variables,
  updated_at = now();
