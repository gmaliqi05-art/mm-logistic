/*
  # Add reassign_trailer_load RPC

  ## Purpose
  Allow depot staff, the currently assigned driver, or a new driver picking up
  an available trailer to change (or clear) the assigned driver of a trailer
  load. This is purely a logistics operation; stock is not affected.

  ## Function
  - `reassign_trailer_load(load_id uuid, new_driver_id uuid)` — SECURITY DEFINER
    - Validates the caller belongs to the same company.
    - Allowed callers:
      1. depot_worker / company_admin / logistics_admin of the company
      2. The currently assigned OR currently claimed driver
      3. A driver picking up the trailer for themselves when new_driver_id matches auth.uid()
    - If `new_driver_id` is NULL -> trailer returns to 'available' and both
      assigned_driver_id and claimed_by_driver_id are cleared.
    - If `new_driver_id` is provided -> sets assigned/claimed to that driver and
      status to 'claimed'.
    - Returns the updated row.

  ## Notes
  - Stock and stock_movements are NOT touched.
  - Does not change existing RLS; operates via SECURITY DEFINER.
*/

CREATE OR REPLACE FUNCTION reassign_trailer_load(load_id uuid, new_driver_id uuid)
RETURNS trailer_loads
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  caller_company uuid;
  caller_role text;
  tr trailer_loads;
  new_driver_company uuid;
  new_driver_role text;
  result trailer_loads;
BEGIN
  SELECT company_id, role INTO caller_company, caller_role
  FROM profiles WHERE id = auth.uid();

  IF caller_company IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT * INTO tr FROM trailer_loads WHERE id = load_id;
  IF tr IS NULL THEN
    RAISE EXCEPTION 'Trailer load not found';
  END IF;

  IF tr.company_id <> caller_company THEN
    RAISE EXCEPTION 'Not authorized (company mismatch)';
  END IF;

  IF caller_role NOT IN ('depot_worker', 'company_admin', 'logistics_admin')
     AND tr.assigned_driver_id IS DISTINCT FROM auth.uid()
     AND tr.claimed_by_driver_id IS DISTINCT FROM auth.uid()
     AND NOT (caller_role = 'driver' AND new_driver_id = auth.uid()
              AND tr.status IN ('available', 'claimed'))
  THEN
    RAISE EXCEPTION 'Not authorized to reassign this trailer';
  END IF;

  IF new_driver_id IS NOT NULL THEN
    SELECT company_id, role INTO new_driver_company, new_driver_role
    FROM profiles WHERE id = new_driver_id;
    IF new_driver_company IS DISTINCT FROM caller_company OR new_driver_role <> 'driver' THEN
      RAISE EXCEPTION 'Invalid driver';
    END IF;

    UPDATE trailer_loads
    SET assigned_driver_id = new_driver_id,
        claimed_by_driver_id = new_driver_id,
        claimed_at = now(),
        status = 'claimed',
        updated_at = now()
    WHERE id = load_id
    RETURNING * INTO result;
  ELSE
    UPDATE trailer_loads
    SET assigned_driver_id = NULL,
        claimed_by_driver_id = NULL,
        claimed_at = NULL,
        status = 'available',
        updated_at = now()
    WHERE id = load_id
    RETURNING * INTO result;
  END IF;

  RETURN result;
END;
$$;

REVOKE EXECUTE ON FUNCTION reassign_trailer_load(uuid, uuid) FROM public;
GRANT EXECUTE ON FUNCTION reassign_trailer_load(uuid, uuid) TO authenticated;
