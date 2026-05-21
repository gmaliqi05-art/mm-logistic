/*
  # Email templates: add French locale + fix sq/de UTF-8 + tidy copy

  Two issues with the invoice email templates:

  1. Locale coverage. The system serves four languages (sq/en/de/fr)
     across the rest of the app, but `email_templates` only has
     `*_sq`, `*_en`, `*_de` columns. French customers receive an
     Albanian or German email by accident. Add the `*_fr` columns
     and populate the seed templates `invoice_issued` and
     `invoice_overdue`.

  2. Diacritics. All sq + de seed text was ASCII-transliterated
     (e.g. "Sehr geehrte(r)" instead of "Sehr geehrte Damen und
     Herren"; "ueberfaellig" instead of "überfällig"; missing every
     ë/ç in sq). The DB column is `text` (UTF-8) and the wrapper
     forwards UTF-8 to Resend, so the only reason the customer sees
     ASCII is that the seed rows are. Refresh them to proper UTF-8.

  Only the rows where `company_id IS NULL` (the system seed) are
  touched — any company that has cloned a template into its own
  copy is left alone.
*/

-- 1. Schema: add French locale columns ---------------------------------------

ALTER TABLE public.email_templates
  ADD COLUMN IF NOT EXISTS preheader_fr text,
  ADD COLUMN IF NOT EXISTS subject_fr   text,
  ADD COLUMN IF NOT EXISTS heading_fr   text,
  ADD COLUMN IF NOT EXISTS intro_fr     text,
  ADD COLUMN IF NOT EXISTS body_html_fr text,
  ADD COLUMN IF NOT EXISTS cta_label_fr text;

-- 2. invoice_issued ----------------------------------------------------------

UPDATE public.email_templates
SET
  subject_sq = 'Fatura {{invoice_number}}',
  subject_de = 'Rechnung {{invoice_number}}',
  subject_fr = 'Facture {{invoice_number}}',

  intro_sq = 'I/E nderuar <strong>{{customer_name}}</strong>, ju lutemi gjeni bashkëngjitur faturën tuaj me numër <strong>{{invoice_number}}</strong>, të lëshuar më <strong>{{issue_date}}</strong>.',
  intro_de = 'Sehr geehrte Damen und Herren, anbei erhalten Sie Ihre Rechnung Nr. <strong>{{invoice_number}}</strong> vom <strong>{{issue_date}}</strong>.',
  intro_fr = 'Madame, Monsieur, veuillez trouver ci-joint votre facture n° <strong>{{invoice_number}}</strong>, émise le <strong>{{issue_date}}</strong>.',

  body_html_sq = '<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin:4px 0 18px 0;border:1px solid #e2e8f0;border-radius:10px;background:#f8fafc;">
<tr><td style="padding:12px 18px;border-bottom:1px solid #e2e8f0;"><strong>Numri i faturës:</strong> <span style="float:right;color:#0f172a;">{{invoice_number}}</span></td></tr>
<tr><td style="padding:12px 18px;border-bottom:1px solid #e2e8f0;"><strong>Data e lëshimit:</strong> <span style="float:right;color:#0f172a;">{{issue_date}}</span></td></tr>
<tr><td style="padding:12px 18px;border-bottom:1px solid #e2e8f0;"><strong>Afati i pagesës:</strong> <span style="float:right;color:#b91c1c;">{{due_date}}</span></td></tr>
<tr><td style="padding:12px 18px;"><strong>Shuma totale:</strong> <span style="float:right;color:#0f766e;font-weight:700;font-size:16px;">{{amount}} {{currency}}</span></td></tr>
</table>
<p style="margin:0 0 6px 0;"><strong>Të dhënat për pagesë me transfer bankar:</strong></p>
<p style="margin:0 0 4px 0;color:#334155;">IBAN: <code style="background:#f1f5f9;padding:2px 6px;border-radius:4px;">{{iban}}</code></p>
<p style="margin:0 0 14px 0;color:#334155;">Referenca: <code style="background:#f1f5f9;padding:2px 6px;border-radius:4px;">{{invoice_number}}</code></p>
<p style="margin:0;color:#475569;font-size:13px;"><em>Fatura është bashkëngjitur si PDF. Për çdo paqartësi rreth kësaj fature, na kontaktoni duke iu referuar numrit të mësipërm.</em></p>',

  body_html_de = '<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin:4px 0 18px 0;border:1px solid #e2e8f0;border-radius:10px;background:#f8fafc;">
<tr><td style="padding:12px 18px;border-bottom:1px solid #e2e8f0;"><strong>Rechnungsnummer:</strong> <span style="float:right;">{{invoice_number}}</span></td></tr>
<tr><td style="padding:12px 18px;border-bottom:1px solid #e2e8f0;"><strong>Ausstellungsdatum:</strong> <span style="float:right;">{{issue_date}}</span></td></tr>
<tr><td style="padding:12px 18px;border-bottom:1px solid #e2e8f0;"><strong>Fälligkeit:</strong> <span style="float:right;color:#b91c1c;">{{due_date}}</span></td></tr>
<tr><td style="padding:12px 18px;"><strong>Gesamtbetrag:</strong> <span style="float:right;color:#0f766e;font-weight:700;font-size:16px;">{{amount}} {{currency}}</span></td></tr>
</table>
<p style="margin:0 0 6px 0;"><strong>Zahlung per Überweisung:</strong></p>
<p style="margin:0 0 4px 0;">IBAN: <code style="background:#f1f5f9;padding:2px 6px;border-radius:4px;">{{iban}}</code></p>
<p style="margin:0 0 14px 0;">Verwendungszweck: <code style="background:#f1f5f9;padding:2px 6px;border-radius:4px;">{{invoice_number}}</code></p>
<p style="margin:0;color:#475569;font-size:13px;"><em>Die Rechnung finden Sie als PDF im Anhang. Bei Rückfragen erreichen Sie uns unter Angabe der oben genannten Rechnungsnummer.</em></p>',

  body_html_fr = '<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin:4px 0 18px 0;border:1px solid #e2e8f0;border-radius:10px;background:#f8fafc;">
<tr><td style="padding:12px 18px;border-bottom:1px solid #e2e8f0;"><strong>Numéro de facture :</strong> <span style="float:right;">{{invoice_number}}</span></td></tr>
<tr><td style="padding:12px 18px;border-bottom:1px solid #e2e8f0;"><strong>Date d''émission :</strong> <span style="float:right;">{{issue_date}}</span></td></tr>
<tr><td style="padding:12px 18px;border-bottom:1px solid #e2e8f0;"><strong>Échéance :</strong> <span style="float:right;color:#b91c1c;">{{due_date}}</span></td></tr>
<tr><td style="padding:12px 18px;"><strong>Montant total :</strong> <span style="float:right;color:#0f766e;font-weight:700;font-size:16px;">{{amount}} {{currency}}</span></td></tr>
</table>
<p style="margin:0 0 6px 0;"><strong>Coordonnées bancaires :</strong></p>
<p style="margin:0 0 4px 0;">IBAN : <code style="background:#f1f5f9;padding:2px 6px;border-radius:4px;">{{iban}}</code></p>
<p style="margin:0 0 14px 0;">Référence : <code style="background:#f1f5f9;padding:2px 6px;border-radius:4px;">{{invoice_number}}</code></p>
<p style="margin:0;color:#475569;font-size:13px;"><em>La facture est jointe au format PDF. Pour toute question, n''hésitez pas à nous contacter en indiquant le numéro ci-dessus.</em></p>'
WHERE code = 'invoice_issued' AND company_id IS NULL;

-- 3. invoice_overdue ---------------------------------------------------------

UPDATE public.email_templates
SET
  subject_sq = 'Rikujtesë: Fatura {{invoice_number}} është e vonuar',
  subject_de = 'Erinnerung: Rechnung {{invoice_number}} überfällig',
  subject_fr = 'Rappel : Facture {{invoice_number}} en retard',

  intro_sq = 'I/E nderuar <strong>{{customer_name}}</strong>, vërejmë se fatura <strong>{{invoice_number}}</strong>, e lëshuar më <strong>{{issue_date}}</strong>, është <strong>{{days_overdue}} ditë</strong> pas afatit dhe ende nuk figuron e paguar.',
  intro_de = 'Sehr geehrte Damen und Herren, die Rechnung <strong>{{invoice_number}}</strong> vom <strong>{{issue_date}}</strong> ist seit <strong>{{days_overdue}} Tagen</strong> überfällig und noch nicht beglichen.',
  intro_fr = 'Madame, Monsieur, nous constatons que la facture <strong>{{invoice_number}}</strong>, émise le <strong>{{issue_date}}</strong>, est en retard de <strong>{{days_overdue}} jours</strong> et n''a pas encore été réglée.',

  body_html_sq = '<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin:4px 0 18px 0;border:1px solid #fecaca;border-radius:10px;background:#fef2f2;">
<tr><td style="padding:12px 18px;border-bottom:1px solid #fecaca;"><strong>Shuma e mbetur:</strong> <span style="float:right;color:#b91c1c;font-weight:700;">{{amount}} {{currency}}</span></td></tr>
<tr><td style="padding:12px 18px;"><strong>Afati origjinal:</strong> <span style="float:right;">{{due_date}}</span></td></tr>
</table>
<p style="margin:0 0 10px 0;">Ju lutem vazhdoni me pagesën në mundësinë e parë ose na kontaktoni nëse ka ndonjë paqartësi.</p>
<p style="margin:0;color:#475569;font-size:13px;"><em>Nëse pagesa është bërë tashmë, ju lutemi injoroni këtë rikujtesë. Për çdo vështirësi të përkohshme, mbetemi në dispozicion për të gjetur një zgjidhje të përbashkët.</em></p>',

  body_html_de = '<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin:4px 0 18px 0;border:1px solid #fecaca;border-radius:10px;background:#fef2f2;">
<tr><td style="padding:12px 18px;border-bottom:1px solid #fecaca;"><strong>Offener Betrag:</strong> <span style="float:right;color:#b91c1c;font-weight:700;">{{amount}} {{currency}}</span></td></tr>
<tr><td style="padding:12px 18px;"><strong>Ursprünglicher Termin:</strong> <span style="float:right;">{{due_date}}</span></td></tr>
</table>
<p style="margin:0 0 10px 0;">Bitte begleichen Sie die Rechnung zeitnah oder kontaktieren Sie uns bei Rückfragen.</p>
<p style="margin:0;color:#475569;font-size:13px;"><em>Sollte die Zahlung in der Zwischenzeit erfolgt sein, betrachten Sie diese E-Mail bitte als gegenstandslos.</em></p>',

  body_html_fr = '<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin:4px 0 18px 0;border:1px solid #fecaca;border-radius:10px;background:#fef2f2;">
<tr><td style="padding:12px 18px;border-bottom:1px solid #fecaca;"><strong>Montant restant dû :</strong> <span style="float:right;color:#b91c1c;font-weight:700;">{{amount}} {{currency}}</span></td></tr>
<tr><td style="padding:12px 18px;"><strong>Échéance initiale :</strong> <span style="float:right;">{{due_date}}</span></td></tr>
</table>
<p style="margin:0 0 10px 0;">Nous vous prions de bien vouloir procéder au règlement dans les meilleurs délais, ou de nous contacter en cas de difficulté.</p>
<p style="margin:0;color:#475569;font-size:13px;"><em>Si le paiement a été effectué entre-temps, veuillez considérer ce message comme nul et non avenu.</em></p>'
WHERE code = 'invoice_overdue' AND company_id IS NULL;
