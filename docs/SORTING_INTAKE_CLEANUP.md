# Pastrimi i stokut "stuck" pas rregullimit te double-counting

Pas migracionit `20260607184500_sorting_decrement_unsorted_intake.sql`,
flow-i i ri funksionon korrekt: hyrjet per kategori sortimi ruhen me
`category_product_id = NULL` dhe pas sortires zbriten automatikisht.

**Por** rreshtat e vjeter ne `stock` qe u krijuan para kesaj patch-e jane
ende ne tabele dhe perfshihen ne raportet "Sipas Produktit" — sjellja qe
ndodhi ne screenshot-in e Bolt (`Euro Pallet EPAL: 428`).

Kjo skedar permban query-te diagnostikuese dhe SQL-in e pastrimit. **Asnje
nuk ekzekutohet automatikisht** — i drejtoni manualisht ne Supabase SQL
editor dhe e konfirmoni rezultatin para se te pastroni.

## 1. Diagnostike — identifikoni rreshtat e "stuck"

```sql
-- Per cdo kategori sortimi, krahaso stokun e produkteve "generic intake"
-- me sasine totale te sortuar nga batches te perfunduara.
WITH sorted_per_cat AS (
  SELECT b.company_id,
         b.depot_id,
         b.category_id,
         SUM(i.quantity) FILTER (WHERE i.quantity > 0) AS sorted_qty
  FROM public.pallet_sorting_batches b
  JOIN public.pallet_sorting_items i ON i.batch_id = b.id
  WHERE b.status = 'completed' AND b.committed_at IS NOT NULL
  GROUP BY b.company_id, b.depot_id, b.category_id
)
SELECT s.id AS stock_id,
       s.company_id,
       co.name AS company_name,
       d.name AS depot_name,
       pc.name AS category_name,
       cp.name AS product_name,
       s.condition,
       s.quantity AS stuck_qty,
       sp.sorted_qty AS total_sorted_for_category
FROM public.stock s
JOIN public.product_categories pc ON pc.id = s.category_id
JOIN public.category_products cp  ON cp.id = s.category_product_id
LEFT JOIN public.depots d         ON d.id = s.depot_id
LEFT JOIN public.companies co     ON co.id = s.company_id
LEFT JOIN sorted_per_cat sp
       ON sp.company_id = s.company_id
      AND sp.depot_id   = s.depot_id
      AND sp.category_id = s.category_id
WHERE pc.sorting_mode <> 'none'
  AND s.category_product_id IS NOT NULL
  AND s.condition = 'good'
  AND s.quantity > 0
  AND sp.sorted_qty > 0
ORDER BY co.name, d.name, pc.name, s.quantity DESC;
```

Cdo rresht qe del ketu eshte kandidat per pastrim: ka stock me product te
percaktuar nen nje kategori sortimi, dhe ka pasur sortime te perfunduara
ne ate kategori. Sasia ne `stuck_qty` eshte qe rri "dy here".

## 2. Verifikim — krahasim me sasine e Klasse

Para se te fshini, verifikoni qe Klasse A/B/C jane krijuar perfekt:

```sql
SELECT pc.name AS category,
       cp.name AS product,
       s.condition,
       SUM(s.quantity) AS qty
FROM public.stock s
JOIN public.product_categories pc ON pc.id = s.category_id
LEFT JOIN public.category_products cp ON cp.id = s.category_product_id
WHERE s.company_id = '<COMPANY_ID>'
  AND s.depot_id   = '<DEPOT_ID>'
  AND pc.id        = '<CATEGORY_ID>'
GROUP BY pc.name, cp.name, s.condition
ORDER BY cp.name NULLS LAST;
```

Plotesoni `<COMPANY_ID>`, `<DEPOT_ID>`, `<CATEGORY_ID>` me UUID-te perkatese
nga query-a 1.

## 3. Pastrim — opsioni A (mbaj stokun e ardhshem te ri)

Per cdo `stock_id` te identifikuar te query-a 1, ekzekuto:

```sql
-- 1) Logo zbritjen ne stock_movements per traceability
INSERT INTO public.stock_movements (
  company_id, depot_id, category_id, category_product_id,
  movement_type, quantity, condition_before, condition_after,
  notes, performed_by, created_at
)
SELECT company_id, depot_id, category_id, category_product_id,
       'exit', quantity, condition, condition,
       'Manual cleanup: legacy unsorted intake row consumed by past sorting batches',
       (SELECT id FROM public.profiles WHERE role = 'super_admin' LIMIT 1),
       now()
FROM public.stock
WHERE id = '<STOCK_ID>';

-- 2) Vendos sasine ne 0
UPDATE public.stock
SET quantity = 0, updated_at = now()
WHERE id = '<STOCK_ID>';
```

**Mos e fshini rreshtin** — mbajeni me `quantity = 0` qe historiku te ruhet
dhe nese ndonje "Sipas Produktit" filtron `> 0` automatikisht do ta heq.

## 4. Pastrim — opsioni B (batch, gjithe rreshtat sebashku)

Nese e keni verifikuar dhe doni te pastroni gjithe rreshtat sebashku:

```sql
WITH stuck_rows AS (
  SELECT s.id
  FROM public.stock s
  JOIN public.product_categories pc ON pc.id = s.category_id
  WHERE pc.sorting_mode <> 'none'
    AND s.category_product_id IS NOT NULL
    AND s.condition = 'good'
    AND s.quantity > 0
)
INSERT INTO public.stock_movements (
  company_id, depot_id, category_id, category_product_id,
  movement_type, quantity, condition_before, condition_after,
  notes, performed_by, created_at
)
SELECT s.company_id, s.depot_id, s.category_id, s.category_product_id,
       'exit', s.quantity, s.condition, s.condition,
       'Manual cleanup: legacy unsorted intake row consumed by past sorting batches',
       (SELECT id FROM public.profiles WHERE role = 'super_admin' LIMIT 1),
       now()
FROM public.stock s
WHERE s.id IN (SELECT id FROM stuck_rows);

UPDATE public.stock
SET quantity = 0, updated_at = now()
WHERE id IN (
  SELECT s.id
  FROM public.stock s
  JOIN public.product_categories pc ON pc.id = s.category_id
  WHERE pc.sorting_mode <> 'none'
    AND s.category_product_id IS NOT NULL
    AND s.condition = 'good'
    AND s.quantity > 0
);
```

Ekzekutohet ne nje transaksion (`BEGIN; ... COMMIT;`) qe te jete atomik.

## 5. Pas pastrimit — verifikim

```sql
SELECT pc.name AS category, cp.name AS product, s.condition, SUM(s.quantity) AS qty
FROM public.stock s
JOIN public.product_categories pc ON pc.id = s.category_id
LEFT JOIN public.category_products cp ON cp.id = s.category_product_id
WHERE pc.sorting_mode <> 'none'
GROUP BY pc.name, cp.name, s.condition
ORDER BY pc.name, cp.name NULLS LAST;
```

Pas pastrimit, per kategorite sortimi duhet te shihni vetem:
- Klasse A / B / C / etc. (good)
- NULL (damaged)
- NULL (good) — vetem nese ka batch ne progres

`Euro Pallet EPAL` ose `EPAL` apo cfaredo produkti "generic intake" nuk
duhet te kete `quantity > 0`.
