/*
  # Allow drivers to reassign any trailer load in their company

  ## Purpose
  Drivers now manage trailer loads alongside depot staff. The previous RPC
  required the caller to already be the assigned/claimed driver (or assigning
  to themselves). Drivers need the full reassign capability inside their
  company, so this migration broadens the authorization check.

  ## Changes
  - `reassign_trailer_load(load_id, new_driver_id)` now also accepts callers
    whose role is `driver` and who belong to the same company as the trailer.
  - All other validations remain identical.
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

  IF caller_role NOT IN ('depot_worker', 'company_admin', 'logistics_admin', 'driver') THEN
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
