# mm-logistic — Deep Audit & Market Strategy

_Date: 2026-06-29. Four parallel deep passes: (A) logistics/depot business-logic coherence, (B) accounting logic + DE/EU compliance, (C) wiring/integration integrity, (D) market & AI strategy. This complements `docs/SUPER_AUDIT.md` (security/RLS/perf) — here the focus is **is the logic correct**, **does everything connect**, and **how to become best-in-class**._

Scale: ~135k LOC `src`, 52 edge functions, 395 migrations, 159 pages.

---

## Executive verdict

The engineering is **more mature than a solo MVP** — real double-entry journal, Tausch/Pfand VAT wiring with legal grounding, EPAL quality-class, ISPM15, DATEV/SAF-T/e-invoice, PII encryption, heavy RLS. **Everything is wired** (0 broken calls). The two real problems are:

1. **Domain-logic coherence bugs** in the two moat areas — the **pallet ledger sign is inverted** (every Saldenbestätigung shows debtor/creditor reversed), the 3-party/`our_role` stock model was **built then half-abandoned** (3 overlapping role vocabularies), and the repair RPC can **destroy stock / double-count** movements. These corrupt exactly the data the product's differentiation depends on.
2. **Accounting is an invoicing tool with a genuine-but-shallow double-entry layer** — not yet GoBD-compliant (mutable booked invoices, non-unique invoice numbers, backwards credit notes, SKR03 hardcoded while selling SKR04/PCG/Balkan charts).

The strategic problem is **focus + correctness of the moat**, not missing breadth. The wedge — *"the pallet swap is booked with the correct §607-BGB VAT treatment and lands in DATEV automatically"* — is real and unserved by any competitor end-to-end. But a funded competitor (**Logistikbude**, ~$8.24M raised, Nagel-Group 130 sites) is racing for the same pallet niche. Win by going **deep on pallet-clearing + repair economics** and treating accounting as a **compliance bridge**, not a DATEV rival.

---

## Part A — Logistics / Depot logic

### CRITICAL
- **A-C1 — Pallet ledger sign inverted.** `pallet_accounts.opening_balance` is specced "positive = partner owes us" (`20260504114724`), but our deliveries map `direction='out'` → `-quantity` (`apply_pallet_transaction` / `auto_pallet_ledger_on_delivery`), and `generate-pallet-statement/index.ts:213` prints `running>0 → partnerOwesUs`. Net: delivering our pallets (partner now owes us) **decreases** the balance → every statement shows debtor/creditor **reversed**. Corrupts the core EPAL exchange balance.
- **A-C2 — `derive_pallet_quantities_from_items` references a dropped column.** Winning body (`20260512100400:33-39`) reads `NEW.pallet_partner_contact_id`, dropped in `20260508095640`. Clean replay throws on every confirm/deliver. (Prod diverges from the committed migration set.)
- **A-C3 — `apply_repair_from_stock` can destroy stock + double-count.** If `p_repaired_qty>0` but `p_target_category_product_id IS NULL`, repaired pallets are deducted from damaged stock but the good-stock insert is guarded on a non-null target → pallets vanish. The movement ledger logs `v_total` (repaired+scrapped) once as damaged→good, then per-item repair and scrap rows → scrap counted twice, worker productivity inflated. (`20260621193000`.)

### MAJOR
- **A-M1 — 3-party / `our_role` stock model built then abandoned.** `20260512100200` routed stock by `our_role`; current `process_delivery_note_stock` (`20260614130000:89-93`) reverts to legacy `type → exit/entry` on a single `assigned_depot_id`. `our_role`, `origin/destination_depot_id`, `held_stock`, `ownership` unused. Custody is dead; **carrier deliveries wrongly hit own stock** — yet `our_role` still drives pallet attribution. Two subsystems disagree on the role model.
- **A-M2 — Three overlapping role vocabularies** on `delivery_notes`: `type`, `flow_role`, `our_role`, plus single `counterparty_*` vs 3-party `consignor/carrier/consignee`. Two triggers attribute partners off **different** columns. `20260510190542` and `20260520120000` duplicate the same flow_role infra.
- **A-M3 — Catalog split-brain.** `acc_invoice_apply_stock_movement` decrements at **category** level (`category_product_id` ignored) while delivery notes post at **category_product_id** level → an invoice sale can hit the qty-0 seed row and never touch real product rows (oversell not reflected).
- **A-M4 — Sorting intake double-accounting** inconsistent (decrement of an "unsorted intake" row that consignee→sorting routing never creates → no-op).
- **A-M5 — Pallet quantities conflate goods with exchange pallets** (sum all items with `category_id`, no pallet_type/one-way/scrap distinction).

### STRONG
Data-driven `complianceEngine.ts`; pallet aging/dunning (`v_pallet_account_aging` + `pallet_reconciliations` + escalation grounded in §439/§212); Tausch/Pfand VAT actually wired (`vatTreatment.ts`, `sachdarlehen`/`schadenersatz` legally sound); repair RPC has FOR-UPDATE locking + target validation; `v_delivery_notes_missing_pallet_partner` diagnostic.

### Missing for a serious pallet operator
Per-quality-class ledger balances (A/B/C/Defekt aggregate, not just net count); deposit/Pfand price tables + auto schadenersatz line from non-return; one-way vs rental vs exchange distinction + Palettenschein numbering + Zug-um-Zug quota; **CMR consignment-note PDF** (columns exist, no document); a real fleet-compliance matrix (HU 24m, tacho 24m, Kod95 5y, ADR 5y, license↔vehicle gating); enforced POD↔ledger reconciliation.

---

## Part B — Accounting logic & DE/EU compliance

### CRITICAL (legally/mathematically wrong)
- **B-C1 — No invoice immutability (fails GoBD Unveränderbarkeit).** `acc_invoices` freely UPDATE-able after send; the journal trigger deletes+reposts on any header change; `InvoiceBuilder.save()` writes `status:'draft'` back onto an existing invoice (`InvoiceBuilder.tsx:702,725`), wiping its journal. A booked, sent invoice can be silently altered or erased.
- **B-C2 — Invoice numbers neither gap-free nor unique.** `idx_acc_inv_number` is a **non-unique** index (`20260420084941:277`) → duplicate legal numbers possible. Number reserved before send; failed send → deletable draft → permanent gap. GoBD requires lückenlose fortlaufende Nummerierung.
- **B-C3 — Credit notes / Storno post backwards.** `acc_post_invoice_to_journal` always books Dr 1400 / Cr revenue positive, never inspects `invoice_type='credit_note'` → a Gutschrift **increases** revenue/receivables.
- **B-C4 — Journal hardcodes SKR03, ignores the company's COA.** Poster hardcodes `1400/8400/8300/1770/…`; never joins `acc_chart_of_accounts` / `seed_company_coa` (SKR04/PCG/Balkan). `acc_journal_lines.account_code` has **no FK**. Every non-SKR03 tenant gets a ledger referencing accounts that don't exist in their chart.

### MAJOR
- **B-M5 — VAT determination naive:** no §19 Kleinunternehmer, no OSS/B2C distance sales (EU consumer charged seller-country VAT), `isGoods` unused so intra-EU B2B **services** mislabeled Art. 138 instead of Art. 44/196 reverse charge, no domestic §13b.
- **B-M6 — `vat_override` dead to the ledger** (poster reads only booleans + item rate).
- **B-M7 — DATEV export flaws:** mixed-rate invoices collapsed to one blended rate/account; Debitor/Kreditor numbers from a volatile per-export index (change every export); revenue mapping disagrees with the journal poster.
- **B-M8 — Depreciation:** linear only (no degressive/GWG/Sammelposten despite UI); AfA posts to `acc_transactions` only, **never to the journal** → GuV from the ledger omits depreciation; no disposal P&L.
- **B-M9 — FX:** ALL/RSD/BAM/MKD hardcoded fallback constants (`fetch-ecb-rates:16`) — fictional rates; likely EUR→quote vs quote→EUR direction mismatch.

### STRONG
Genuine balanced double-entry journal (debit=credit, idempotent reposting, per-rate VAT split, A/R+A/P+payment legs); live VIES SOAP validation; per-country VAT regex; EN 16931-mapped XRechnung; CAMT.053 + MT940 parsing; multi-country COA templates; DATEV EXTF-700 with Windows-1252. Well above a typical invoicing tool.

### Verdict
**An invoicing tool with a real but shallow double-entry layer — not yet production-grade DE accounting.** Top fixes to be GoBD/DATEV-competitive: (1) immutability lock + append-only Storno + `UNIQUE(company_id, invoice_number)` + gap-free finalize; (2) sign-correct credit notes; (3) COA-driven account resolution + FK on `account_code`; (4) §19/OSS/goods-vs-service RC + honor `vat_override`; (5) per-rate DATEV split with stable master numbers + UStVA/ELSTER; (6) degressive+GWG depreciation posted to journal; (7) real PDF/A-3 Factur-X + Schematron validation + live ECB rates.

---

## Part C — Wiring / integration integrity

**BROKEN: none.** 50/52 edge functions wired (35 frontend + 10 cron + 5 fn-to-fn), 9/9 `rpc()` resolve, 160/160 lazy pages routed, 3/3 context providers mounted, 12/17 feature flags enforced, 0 dangling references.

**ORPHANED (highest-impact — confirm they aren't scheduled via the Supabase dashboard):**
- **`execute-account-deletion`** — nothing in-repo invokes it; the 30-day deletion columns (`20260518194537`/`20260621120000`) are wired to a function that never runs → **GDPR deletions may never execute**.
- **`check-pallet-account-aging`** — its migration calls it "the cron edge function" but no `net.http_post` schedules it → **dunning escalation un-triggered**.

**ORPHANED (dead weight):** 5 feature flags toggleable but never enforced (`documents_signing`, `basic_reports`, `export_pdf`, `export_excel`, `bulk_operations`); 2 unused hooks (`useSignedUrl`, `useCompanySubscriptions`); 2 possibly-dead i18n sections (`language`, `scenarios`).

---

## Part D — Market position & strategy

**Positioning verdict:** genuinely unusual combination (pallet-condition + repair + Tausch/Pfand VAT-correct clearing + fleet compliance + DE accounting + AI CMR scan, multi-tenant, Albanian-first). Incumbents are all point solutions. Defensible wedge: the **pallet-heavy transport/depot operator (10–150 employees)** running a Palettenkonto in Excel + an EPAL repair line on paper + a shoebox to the Steuerberater. Risk: one founder building six enterprise products while a funded rival owns the pallet flank and DATEV owns the accounting flank.

### Competitor map
| Segment | Real players | mm-logistic stance |
|---|---|---|
| Pallet/Tauschkonto (DE) | **Logistikbude** (funded, AI scan, Nagel/Bitergo), COSYS, TrackOnline, palettenkonto.net, EPAL Pallet App | **Compete & differentiate** (repair + VAT-correct billing) |
| TMS/freight | Transporeon, Timocom, project44, Shippeo | Complement, don't compete (no network liquidity) |
| Fleet telematics | Webfleet, Samsara, Geotab | Gap: phone-GPS only, no hardware/tacho |
| SME accounting DE | lexoffice, sevDesk, DATEV, Candis | **Bridge, don't rival** |
| SMB logistics ERP | Odoo, SAP B1, Weclapp | Lighter, vertical, cheaper |

### Top 10 moves to become best-in-class (impact × feasibility; AI = uses AI)
1. **Pallet-balance forecasting + shortfall alerts** — predict per-partner Palettenkonto N days out from your own flows. *M, AI.* #1 pain, predictive vs retroactive.
2. **AI auto-reconciliation ("silent miss" resolver)** — turn `silent_pallet_ledger_miss_view` into an AI matcher (delivery notes ↔ counter-bookings ↔ partner statements). *M, AI.*
3. **GoBD certification + audit-proof archiving** — hard buying gate; without it the accounting module is unsellable to serious SMEs. *M.*
4. **Natural-language reporting ("Ask your depot")** — chat/RAG over stock/repair/pallet/fleet SQL views. *S–M, AI.* Demo-magic.
5. **EPAL QR + EPAL Pallet App interop** — you already track `epal_qr`; ride the standard. *S.*
6. **AP invoice-capture automation (Candis-style)** — extend OCR to inbound supplier invoices → auto-code → DATEV. *M, AI.*
7. **Route/load optimization + repair-throughput scheduling** — VRP + repair-line capacity (repair highest-value damaged first). *M–L, AI.*
8. **Anomaly detection in pallet flows** — abnormal non-return/shrinkage, driver count mismatches (leakage = cash). *M, AI.*
9. **Telematics + tacho ingestion** — Webfleet/Samsara/Geotab APIs + digital-tacho files. *M.* Table-stakes for fleets >10 trucks.
10. **Peppol/XRechnung validated send, packaged for the 2027 mandate.** *M, partial AI.* Regulatory tailwind.

### Do NOT
1. **Don't out-accounting DATEV/lexoffice** — bridge into them, don't replace the ledger.
2. **Don't become a freight exchange** — you can't seed network liquidity solo.
3. **Don't keep broadening horizontally** — depth on pallet-clearing + repair beats another module.

Sources: Logistikbude (logistikbude.com, PitchBook, ITJ), Nagel-Group 130 sites, COSYS/TrackOnline, EPAL Pallet App, Transporeon/Cargoson TMS, OMR accounting comparison, EU eInvoicing Germany timeline (2025–2028, 2027 large-business mandate on track).

---

## Consolidated priority roadmap

**Fix the moat first (correctness before features):**
1. **A-C1 pallet ledger sign** + **A-C2 dropped-column trigger** + **A-C3 repair stock/movement** — the differentiator's data is currently wrong. Highest priority.
2. **B-C1/B-C2/B-C3 GoBD basics** — invoice immutability, `UNIQUE` number + gap-free, sign-correct credit notes. Required before selling accounting.
3. **A-M1/A-M2 role-model unification** — collapse `type`/`flow_role`/`our_role` to one source of truth; decide if custody/3-party stock is in or out.
4. **C orphans** — confirm/scheduled `execute-account-deletion` (GDPR) and `check-pallet-account-aging` (dunning), or wire cron.

**Then differentiate (from Part D):** forecasting (#1), auto-reconciliation (#2), NL reporting (#4), EPAL interop (#5) — highest impact × feasibility on the existing Supabase+React stack.

**Then compliance depth:** B-C4 COA-driven posting, B-M5 VAT completeness, GoBD cert (#3), 2027 e-invoice (#10).
