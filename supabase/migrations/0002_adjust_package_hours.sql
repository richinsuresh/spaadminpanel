-- ============================================================================
-- adjust_package_hours: shared, atomic hour adjustment for a single package
-- ============================================================================
-- WHY THIS EXISTS
--
-- redeem_package_hours() (see 0001_atomic_package_redemption.sql) is only
-- called once, at check-in time. Three other places in the app change how
-- many hours a session used *after* that point, and all three updated only
-- the `customers` (session) row in plain JS, without ever touching the
-- linked package's remaining_hours/used_hours:
--
--   1. Outlet "Sales" page -> Add-on/extend session (extra minutes added to
--      an existing package-redemption visit)
--   2. Office Sales detail page -> "Extend Session"
--   3. Office Sales page -> manual edit of a session's hours
--
-- And a 4th place deletes a package-redemption session row outright without
-- crediting the hours back to the package at all:
--
--   4. Office Sales page -> delete a sale
--
-- Each of these left the customer's package balance permanently wrong -
-- exactly the "wrong hours" drift reported. This function gives all four
-- call sites one atomic, row-locked way to fix that: pass a positive delta
-- to take more hours from the package (addon, or edit that increases
-- hours), or a negative delta to credit hours back (edit that decreases
-- hours, or a delete). `FOR UPDATE` locks the row for the duration of the
-- transaction so concurrent edits/addons on the same package can't race
-- each other the way the original plain-JS redemption code used to.
--
-- p_package_id : packages.id this session's hours came from. If NULL, the
--                caller should not call this function at all (the session
--                was never a package redemption) - callers are expected to
--                skip the call themselves, but NULL is handled here too as
--                a harmless no-op for safety.
-- p_delta_hours: hours to move. Positive = consume more from the package
--                (fails if insufficient balance). Negative = credit back
--                (capped so remaining_hours never exceeds total_hours).
-- ============================================================================

CREATE OR REPLACE FUNCTION public.adjust_package_hours(
  p_package_id uuid,
  p_delta_hours numeric
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rec record;
  v_new_remaining numeric;
  v_new_used numeric;
  v_today date := (now() AT TIME ZONE 'Asia/Kolkata')::date;
BEGIN
  IF p_package_id IS NULL THEN
    RETURN jsonb_build_object('skipped', true, 'reason', 'no_package_id');
  END IF;

  IF p_delta_hours IS NULL OR p_delta_hours = 0 THEN
    RETURN jsonb_build_object('skipped', true, 'reason', 'zero_delta');
  END IF;

  SELECT id, total_hours, used_hours, remaining_hours, expiry_date
  INTO v_rec
  FROM packages
  WHERE id = p_package_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'PACKAGE_NOT_FOUND: package % does not exist', p_package_id;
  END IF;

  IF p_delta_hours > 0 AND COALESCE(v_rec.remaining_hours, 0) < p_delta_hours THEN
    RAISE EXCEPTION 'INSUFFICIENT_BALANCE: package % has % hours left, tried to take %',
      p_package_id, round(COALESCE(v_rec.remaining_hours, 0), 2), round(p_delta_hours, 2);
  END IF;

  -- Consuming (+delta) reduces remaining_hours; crediting back (-delta)
  -- increases it, but never past the package's original total_hours.
  v_new_remaining := LEAST(
    COALESCE(v_rec.total_hours, v_rec.remaining_hours),
    GREATEST(0, COALESCE(v_rec.remaining_hours, 0) - p_delta_hours)
  );
  v_new_used := GREATEST(0, COALESCE(v_rec.used_hours, 0) + p_delta_hours);

  UPDATE packages
  SET remaining_hours = v_new_remaining,
      used_hours = v_new_used,
      status = CASE
                 WHEN v_new_remaining <= 0.001 THEN 'expired'
                 WHEN v_rec.expiry_date IS NOT NULL AND v_rec.expiry_date < v_today THEN 'expired'
                 ELSE 'active'
               END
  WHERE id = p_package_id;

  RETURN jsonb_build_object(
    'package_id', p_package_id::text,
    'remaining_hours', v_new_remaining,
    'used_hours', v_new_used
  );
END;
$$;

REVOKE ALL ON FUNCTION public.adjust_package_hours(uuid, numeric) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.adjust_package_hours(uuid, numeric) TO service_role;
