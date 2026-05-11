/*
  # Add is_loaded flag to trailer_loads

  ## Purpose
  Distinguish between a trailer that is merely registered (empty plate record)
  and one that currently carries a load (has items). A depot can now register
  all company trailer plates in advance and fill them with items later.

  ## Changes
  - Add column `is_loaded boolean NOT NULL DEFAULT false` on `trailer_loads`.
  - Add trigger to auto-maintain `is_loaded` from the count of rows in
    `trailer_load_items` (insert / update / delete).

  ## Notes
  - Non-destructive. Backfill existing rows based on current item count.
  - Does not change RLS or any stock handling.
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'trailer_loads' AND column_name = 'is_loaded'
  ) THEN
    ALTER TABLE trailer_loads ADD COLUMN is_loaded boolean NOT NULL DEFAULT false;
  END IF;
END $$;

UPDATE trailer_loads tl
SET is_loaded = EXISTS (
  SELECT 1 FROM trailer_load_items WHERE trailer_load_id = tl.id
);

CREATE OR REPLACE FUNCTION trailer_load_items_refresh_flag()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  target_id uuid;
BEGIN
  target_id := COALESCE(NEW.trailer_load_id, OLD.trailer_load_id);
  UPDATE trailer_loads
  SET is_loaded = EXISTS (
        SELECT 1 FROM trailer_load_items WHERE trailer_load_id = target_id
      ),
      updated_at = now()
  WHERE id = target_id;
  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_trailer_load_items_refresh_flag ON trailer_load_items;
CREATE TRIGGER trg_trailer_load_items_refresh_flag
AFTER INSERT OR UPDATE OR DELETE ON trailer_load_items
FOR EACH ROW EXECUTE FUNCTION trailer_load_items_refresh_flag();
