/*
  # Seed Accounting Demo Data

  Seeds demo data for the accounting module linked to the first company.

  1. Data Created
    - 5 contacts (3 customers, 2 suppliers)
    - 2 product categories
    - 8 products with prices and VAT rates
    - 2 bank accounts (EUR and CHF)
    - 5 expense categories
    - 3 invoice sequences (RE, BL, FL)
*/

DO $$
DECLARE
  v_company_id uuid;
  v_user_id uuid;
  v_cat1_id uuid;
  v_cat2_id uuid;
  v_p1 uuid; v_p2 uuid; v_p3 uuid; v_p4 uuid;
  v_p5 uuid; v_p6 uuid; v_p7 uuid; v_p8 uuid;
  v_c1 uuid; v_c2 uuid; v_c3 uuid; v_c4 uuid; v_c5 uuid;
  v_bank1 uuid; v_bank2 uuid;
  v_ecat1 uuid; v_ecat2 uuid; v_ecat3 uuid; v_ecat4 uuid; v_ecat5 uuid;
BEGIN
  SELECT id INTO v_company_id FROM companies LIMIT 1;
  SELECT id INTO v_user_id FROM profiles WHERE email = 'accountant@demo.com' LIMIT 1;

  IF v_company_id IS NULL OR v_user_id IS NULL THEN
    RAISE NOTICE 'Company or user not found, skipping seed';
    RETURN;
  END IF;

  -- Product Categories
  INSERT INTO acc_product_categories (id, company_id, name, description, sort_order)
  VALUES
    (gen_random_uuid(), v_company_id, 'Euro Paletten', 'Europaeische Standardpaletten', 1),
    (gen_random_uuid(), v_company_id, 'Transportzubehoer', 'Zubehoer fuer Transport und Verpackung', 2);

  SELECT id INTO v_cat1_id FROM acc_product_categories WHERE company_id = v_company_id AND name = 'Euro Paletten' LIMIT 1;
  SELECT id INTO v_cat2_id FROM acc_product_categories WHERE company_id = v_company_id AND name = 'Transportzubehoer' LIMIT 1;

  -- Products
  INSERT INTO acc_products (id, company_id, name, description, sku, unit, price_net, vat_rate, category_id, current_stock, min_stock, is_active) VALUES
    (gen_random_uuid(), v_company_id, 'Euro Pallet EPAL', 'Standard EUR/EPAL Palette 800x1200mm', 'EP-001', 'pcs', 12.50, 19.00, v_cat1_id, 450, 50, true),
    (gen_random_uuid(), v_company_id, 'Euro Pallet EPAL Klasse B', 'Gebrauchte EPAL Palette Klasse B', 'EP-002', 'pcs', 8.00, 19.00, v_cat1_id, 280, 30, true),
    (gen_random_uuid(), v_company_id, 'Industriepalette 1000x1200', 'Industriepalette Sondermass', 'IP-001', 'pcs', 18.00, 19.00, v_cat1_id, 120, 20, true),
    (gen_random_uuid(), v_company_id, 'CP1 Chemiepalette', 'CP1 Palette fuer Chemieindustrie', 'CP-001', 'pcs', 22.00, 19.00, v_cat1_id, 85, 15, true),
    (gen_random_uuid(), v_company_id, 'Stretchfolie 500mm', 'Stretchfolie 500mm x 300m', 'SF-001', 'pcs', 9.50, 19.00, v_cat2_id, 200, 40, true),
    (gen_random_uuid(), v_company_id, 'Kantenschutz L-Profil', 'Kantenschutz aus Karton L-Profil 1m', 'KS-001', 'pcs', 0.85, 19.00, v_cat2_id, 1500, 200, true),
    (gen_random_uuid(), v_company_id, 'Antirutschmatte', 'Antirutschmatte 800x1200mm', 'AR-001', 'pcs', 3.20, 19.00, v_cat2_id, 350, 50, true),
    (gen_random_uuid(), v_company_id, 'Reparaturservice Palette', 'Pauschal Reparatur einer Palette', 'RS-001', 'pcs', 5.00, 19.00, v_cat1_id, 0, 0, true);

  SELECT id INTO v_p1 FROM acc_products WHERE company_id = v_company_id AND sku = 'EP-001';
  SELECT id INTO v_p2 FROM acc_products WHERE company_id = v_company_id AND sku = 'EP-002';
  SELECT id INTO v_p3 FROM acc_products WHERE company_id = v_company_id AND sku = 'IP-001';
  SELECT id INTO v_p4 FROM acc_products WHERE company_id = v_company_id AND sku = 'CP-001';
  SELECT id INTO v_p5 FROM acc_products WHERE company_id = v_company_id AND sku = 'SF-001';
  SELECT id INTO v_p6 FROM acc_products WHERE company_id = v_company_id AND sku = 'KS-001';
  SELECT id INTO v_p7 FROM acc_products WHERE company_id = v_company_id AND sku = 'AR-001';
  SELECT id INTO v_p8 FROM acc_products WHERE company_id = v_company_id AND sku = 'RS-001';

  -- Contacts
  INSERT INTO acc_contacts (id, company_id, name, contact_type, address, city, postal_code, country, vat_number, email, phone, iban, bic, bank_name, payment_days) VALUES
    (gen_random_uuid(), v_company_id, 'Logistics Partner GmbH', 'customer', 'Industriestr. 45', 'Hamburg', '20095', 'DE', 'DE123456789', 'info@logpartner.de', '+49 40 12345', 'DE89370400440532013000', 'COBADEFFXXX', 'Commerzbank', 30),
    (gen_random_uuid(), v_company_id, 'TransEuropa AG', 'customer', 'Bahnhofstr. 12', 'Frankfurt', '60311', 'DE', 'DE987654321', 'buchhaltung@transeuropa.de', '+49 69 54321', '', '', '', 14),
    (gen_random_uuid(), v_company_id, 'MegaStore Retail KG', 'customer', 'Einkaufsstr. 88', 'Muenchen', '80331', 'DE', 'DE456789123', 'einkauf@megastore.de', '+49 89 67890', '', '', '', 30),
    (gen_random_uuid(), v_company_id, 'PalletWorks International', 'supplier', 'Fabrikweg 7', 'Dortmund', '44135', 'DE', 'DE111222333', 'order@palletworks.de', '+49 231 11223', 'DE27100777770209299700', 'DEUTDEDBBER', 'Deutsche Bank', 45),
    (gen_random_uuid(), v_company_id, 'PackMaterial Swiss AG', 'supplier', 'Industrieweg 22', 'Zuerich', '8001', 'CH', 'CHE-123.456.789', 'info@packmaterial.ch', '+41 44 123456', 'CH9300762011623852957', 'UBSWCHZH80A', 'UBS', 30);

  SELECT id INTO v_c1 FROM acc_contacts WHERE company_id = v_company_id AND name = 'Logistics Partner GmbH';
  SELECT id INTO v_c2 FROM acc_contacts WHERE company_id = v_company_id AND name = 'TransEuropa AG';
  SELECT id INTO v_c3 FROM acc_contacts WHERE company_id = v_company_id AND name = 'MegaStore Retail KG';
  SELECT id INTO v_c4 FROM acc_contacts WHERE company_id = v_company_id AND name = 'PalletWorks International';
  SELECT id INTO v_c5 FROM acc_contacts WHERE company_id = v_company_id AND name = 'PackMaterial Swiss AG';

  -- Bank Accounts
  INSERT INTO acc_bank_accounts (id, company_id, name, iban, bic, bank_name, currency, opening_balance, is_default) VALUES
    (gen_random_uuid(), v_company_id, 'Geschaeftskonto EUR', 'DE89370400440532013000', 'COBADEFFXXX', 'Commerzbank AG', 'EUR', 25000.00, true),
    (gen_random_uuid(), v_company_id, 'Geschaeftskonto CHF', 'CH9300762011623852957', 'UBSWCHZH80A', 'UBS AG', 'CHF', 15000.00, false);

  SELECT id INTO v_bank1 FROM acc_bank_accounts WHERE company_id = v_company_id AND currency = 'EUR';
  SELECT id INTO v_bank2 FROM acc_bank_accounts WHERE company_id = v_company_id AND currency = 'CHF';

  -- Expense Categories
  INSERT INTO acc_expense_categories (id, company_id, name, description, category_type) VALUES
    (gen_random_uuid(), v_company_id, 'Miete & Nebenkosten', 'Buero- und Lagermiete', 'expense'),
    (gen_random_uuid(), v_company_id, 'Personalkosten', 'Gehaelter und Sozialabgaben', 'expense'),
    (gen_random_uuid(), v_company_id, 'Transport & Logistik', 'Frachtkosten und Fahrzeuge', 'expense'),
    (gen_random_uuid(), v_company_id, 'Versicherungen', 'Betriebs- und Transportversicherung', 'expense'),
    (gen_random_uuid(), v_company_id, 'Sonstige Einnahmen', 'Zinsen und sonstige Ertraege', 'income');

  -- Invoice Sequences
  INSERT INTO acc_invoice_sequences (company_id, prefix, year, current_number) VALUES
    (v_company_id, 'RE', 2026, 3),
    (v_company_id, 'BL', 2026, 2),
    (v_company_id, 'FL', 2026, 1)
  ON CONFLICT (company_id, prefix, year) DO NOTHING;

  -- Invoices
  INSERT INTO acc_invoices (company_id, created_by, contact_id, invoice_number, invoice_date, due_date, status, subtotal, vat_amount, total, discount, currency, notes, bank_account_id, invoice_type) VALUES
    (v_company_id, v_user_id, v_c1, 'RE-2026-0001', '2026-03-15', '2026-04-14', 'paid', 1875.00, 356.25, 2231.25, 0, 'EUR', 'Palettenlieferung Maerz', v_bank1, 'invoice'),
    (v_company_id, v_user_id, v_c2, 'RE-2026-0002', '2026-04-01', '2026-04-15', 'sent', 960.00, 182.40, 1142.40, 0, 'EUR', 'Transportmaterial', v_bank1, 'invoice'),
    (v_company_id, v_user_id, v_c3, 'RE-2026-0003', '2026-04-18', '2026-05-18', 'draft', 2200.00, 418.00, 2618.00, 0, 'EUR', '', v_bank1, 'invoice');

  -- Invoice Items for RE-0001 (paid)
  INSERT INTO acc_invoice_items (invoice_id, product_id, description, quantity, unit, unit_price, vat_rate, line_total)
  SELECT i.id, v_p1, 'Euro Pallet EPAL', 100, 'pcs', 12.50, 19.00, 1250.00
  FROM acc_invoices i WHERE i.invoice_number = 'RE-2026-0001' AND i.company_id = v_company_id;

  INSERT INTO acc_invoice_items (invoice_id, product_id, description, quantity, unit, unit_price, vat_rate, line_total)
  SELECT i.id, v_p2, 'Euro Pallet EPAL Klasse B', 50, 'pcs', 8.00, 19.00, 400.00
  FROM acc_invoices i WHERE i.invoice_number = 'RE-2026-0001' AND i.company_id = v_company_id;

  INSERT INTO acc_invoice_items (invoice_id, product_id, description, quantity, unit, unit_price, vat_rate, line_total)
  SELECT i.id, v_p5, 'Stretchfolie 500mm', 10, 'pcs', 9.50, 19.00, 95.00
  FROM acc_invoices i WHERE i.invoice_number = 'RE-2026-0001' AND i.company_id = v_company_id;

  INSERT INTO acc_invoice_items (invoice_id, product_id, description, quantity, unit, unit_price, vat_rate, line_total)
  SELECT i.id, v_p7, 'Antirutschmatte', 40, 'pcs', 3.25, 19.00, 130.00
  FROM acc_invoices i WHERE i.invoice_number = 'RE-2026-0001' AND i.company_id = v_company_id;

  -- Invoice Items for RE-0002 (sent)
  INSERT INTO acc_invoice_items (invoice_id, product_id, description, quantity, unit, unit_price, vat_rate, line_total)
  SELECT i.id, v_p5, 'Stretchfolie 500mm', 80, 'pcs', 9.50, 19.00, 760.00
  FROM acc_invoices i WHERE i.invoice_number = 'RE-2026-0002' AND i.company_id = v_company_id;

  INSERT INTO acc_invoice_items (invoice_id, product_id, description, quantity, unit, unit_price, vat_rate, line_total)
  SELECT i.id, v_p6, 'Kantenschutz L-Profil', 200, 'pcs', 1.00, 19.00, 200.00
  FROM acc_invoices i WHERE i.invoice_number = 'RE-2026-0002' AND i.company_id = v_company_id;

  -- Invoice Items for RE-0003 (draft)
  INSERT INTO acc_invoice_items (invoice_id, product_id, description, quantity, unit, unit_price, vat_rate, line_total)
  SELECT i.id, v_p1, 'Euro Pallet EPAL', 100, 'pcs', 12.50, 19.00, 1250.00
  FROM acc_invoices i WHERE i.invoice_number = 'RE-2026-0003' AND i.company_id = v_company_id;

  INSERT INTO acc_invoice_items (invoice_id, product_id, description, quantity, unit, unit_price, vat_rate, line_total)
  SELECT i.id, v_p3, 'Industriepalette 1000x1200', 30, 'pcs', 18.00, 19.00, 540.00
  FROM acc_invoices i WHERE i.invoice_number = 'RE-2026-0003' AND i.company_id = v_company_id;

  INSERT INTO acc_invoice_items (invoice_id, product_id, description, quantity, unit, unit_price, vat_rate, line_total)
  SELECT i.id, v_p4, 'CP1 Chemiepalette', 15, 'pcs', 22.00, 19.00, 330.00
  FROM acc_invoices i WHERE i.invoice_number = 'RE-2026-0003' AND i.company_id = v_company_id;

  INSERT INTO acc_invoice_items (invoice_id, product_id, description, quantity, unit, unit_price, vat_rate, line_total)
  SELECT i.id, v_p7, 'Antirutschmatte', 25, 'pcs', 3.20, 19.00, 80.00
  FROM acc_invoices i WHERE i.invoice_number = 'RE-2026-0003' AND i.company_id = v_company_id;

  -- Purchases
  INSERT INTO acc_purchases (company_id, created_by, contact_id, purchase_number, purchase_date, due_date, status, subtotal, vat_amount, total, currency, notes, external_invoice_number, bank_account_id) VALUES
    (v_company_id, v_user_id, v_c4, 'BL-2026-0001', '2026-03-10', '2026-04-24', 'paid', 5000.00, 950.00, 5950.00, 'EUR', 'Paletteneinkauf Q1', 'PW-2026-1234', v_bank1),
    (v_company_id, v_user_id, v_c5, 'BL-2026-0002', '2026-04-05', '2026-05-05', 'draft', 1425.00, 270.75, 1695.75, 'CHF', 'Verpackungsmaterial', 'PM-4567', v_bank2);

  -- Purchase Items for BL-0001 (paid)
  INSERT INTO acc_purchase_items (purchase_id, product_id, description, quantity, unit, unit_price, vat_rate, line_total)
  SELECT p.id, v_p1, 'Euro Pallet EPAL Neuware', 300, 'pcs', 10.00, 19.00, 3000.00
  FROM acc_purchases p WHERE p.purchase_number = 'BL-2026-0001' AND p.company_id = v_company_id;

  INSERT INTO acc_purchase_items (purchase_id, product_id, description, quantity, unit, unit_price, vat_rate, line_total)
  SELECT p.id, v_p2, 'Euro Pallet EPAL Klasse B', 250, 'pcs', 6.00, 19.00, 1500.00
  FROM acc_purchases p WHERE p.purchase_number = 'BL-2026-0001' AND p.company_id = v_company_id;

  INSERT INTO acc_purchase_items (purchase_id, product_id, description, quantity, unit, unit_price, vat_rate, line_total)
  SELECT p.id, v_p4, 'CP1 Chemiepalette', 25, 'pcs', 20.00, 19.00, 500.00
  FROM acc_purchases p WHERE p.purchase_number = 'BL-2026-0001' AND p.company_id = v_company_id;

  -- Purchase Items for BL-0002 (draft)
  INSERT INTO acc_purchase_items (purchase_id, product_id, description, quantity, unit, unit_price, vat_rate, line_total)
  SELECT p.id, v_p5, 'Stretchfolie 500mm Premium', 100, 'pcs', 8.50, 19.00, 850.00
  FROM acc_purchases p WHERE p.purchase_number = 'BL-2026-0002' AND p.company_id = v_company_id;

  INSERT INTO acc_purchase_items (purchase_id, product_id, description, quantity, unit, unit_price, vat_rate, line_total)
  SELECT p.id, v_p6, 'Kantenschutz L-Profil', 500, 'pcs', 0.65, 19.00, 325.00
  FROM acc_purchases p WHERE p.purchase_number = 'BL-2026-0002' AND p.company_id = v_company_id;

  INSERT INTO acc_purchase_items (purchase_id, product_id, description, quantity, unit, unit_price, vat_rate, line_total)
  SELECT p.id, v_p7, 'Antirutschmatte', 100, 'pcs', 2.50, 19.00, 250.00
  FROM acc_purchases p WHERE p.purchase_number = 'BL-2026-0002' AND p.company_id = v_company_id;

  -- Transactions
  SELECT id INTO v_ecat3 FROM acc_expense_categories WHERE company_id = v_company_id AND name = 'Transport & Logistik';
  SELECT id INTO v_ecat1 FROM acc_expense_categories WHERE company_id = v_company_id AND name = 'Miete & Nebenkosten';
  SELECT id INTO v_ecat2 FROM acc_expense_categories WHERE company_id = v_company_id AND name = 'Personalkosten';

  INSERT INTO acc_transactions (company_id, transaction_type, category_id, contact_id, invoice_id, bank_account_id, amount, currency, description, transaction_date, payment_method, created_by) VALUES
    (v_company_id, 'income', NULL, v_c1, (SELECT id FROM acc_invoices WHERE invoice_number = 'RE-2026-0001' AND company_id = v_company_id), v_bank1, 2231.25, 'EUR', 'Zahlung RE-2026-0001', '2026-04-10', 'bank_transfer', v_user_id),
    (v_company_id, 'expense', v_ecat3, v_c4, NULL, v_bank1, 5950.00, 'EUR', 'Zahlung BL-2026-0001', '2026-03-25', 'bank_transfer', v_user_id);

  INSERT INTO acc_transactions (company_id, transaction_type, category_id, bank_account_id, amount, currency, description, transaction_date, payment_method, created_by) VALUES
    (v_company_id, 'expense', v_ecat1, v_bank1, 2800.00, 'EUR', 'Lagermiete April 2026', '2026-04-01', 'bank_transfer', v_user_id),
    (v_company_id, 'expense', v_ecat2, v_bank1, 8500.00, 'EUR', 'Gehaelter April 2026', '2026-04-25', 'bank_transfer', v_user_id),
    (v_company_id, 'expense', v_ecat3, v_bank1, 1200.00, 'EUR', 'Frachtkosten Spedition Mueller', '2026-04-12', 'bank_transfer', v_user_id);

  -- Stock movements for paid invoice and purchase
  INSERT INTO acc_stock_movements (company_id, product_id, movement_type, quantity, unit_price, reference_type, reference_id, notes, created_by) VALUES
    (v_company_id, v_p1, 'in', 300, 10.00, 'purchase', (SELECT id FROM acc_purchases WHERE purchase_number = 'BL-2026-0001' AND company_id = v_company_id), 'Einkauf BL-2026-0001', v_user_id),
    (v_company_id, v_p2, 'in', 250, 6.00, 'purchase', (SELECT id FROM acc_purchases WHERE purchase_number = 'BL-2026-0001' AND company_id = v_company_id), 'Einkauf BL-2026-0001', v_user_id),
    (v_company_id, v_p4, 'in', 25, 20.00, 'purchase', (SELECT id FROM acc_purchases WHERE purchase_number = 'BL-2026-0001' AND company_id = v_company_id), 'Einkauf BL-2026-0001', v_user_id),
    (v_company_id, v_p1, 'out', 100, 12.50, 'invoice', (SELECT id FROM acc_invoices WHERE invoice_number = 'RE-2026-0001' AND company_id = v_company_id), 'Verkauf RE-2026-0001', v_user_id),
    (v_company_id, v_p2, 'out', 50, 8.00, 'invoice', (SELECT id FROM acc_invoices WHERE invoice_number = 'RE-2026-0001' AND company_id = v_company_id), 'Verkauf RE-2026-0001', v_user_id),
    (v_company_id, v_p5, 'out', 10, 9.50, 'invoice', (SELECT id FROM acc_invoices WHERE invoice_number = 'RE-2026-0001' AND company_id = v_company_id), 'Verkauf RE-2026-0001', v_user_id),
    (v_company_id, v_p7, 'out', 40, 3.25, 'invoice', (SELECT id FROM acc_invoices WHERE invoice_number = 'RE-2026-0001' AND company_id = v_company_id), 'Verkauf RE-2026-0001', v_user_id);

END $$;
