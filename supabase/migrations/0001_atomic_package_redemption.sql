-- ============================================================================
-- Atomic package-hour redemption
-- ============================================================================
-- WHY THIS EXISTS
--
-- The app used to redeem package hours like this, in plain JS (client-form-submit
-- route):
--   1. SELECT remaining_hours FROM packages WHERE mobile = ... AND status='active'
--   2. compute new remaining/used hours in JavaScript
--   3. UPDATE packages SET remaining_hours = ..., used_hours = ...
--
-- Steps 1-3 are NOT atomic. If two redemption requests for the same customer
-- happen close together (double-tap, a flaky-network retry, two staff serving
-- the same customer, etc.) both requests can read the SAME starting balance in
-- step 1, both pass the "is there enough left" check, and then both write in
-- step 3 — the second write clobbers the first ("lost update"). The customer
-- ends up with more hours deducted than they had, or the deduction from the
-- first visit is silently overwritten and lost, depending on timing. This is
-- exactly the "Package hour mismatch" / "Used hours exceed total" pattern the
-- in-app Audit page has to detect and patch by hand after the fact.
--
-- It also never checked expiry_date at redemption time — only a lazy,
-- client-side effect (on the Packages admin page / Audit page) flips
-- status to 'expired' once someone happens to load that page. Until then, a
-- package that's expired by date but still has status='active' can keep
-- being redeemed indefinitely from any outlet.
--
-- redeem_package_hours() fixes both problems by doing the eligibility check
-- and the deduction inside ONE Postgres transaction, with `SELECT ... FOR
-- UPDATE` row locks on every package for that mobile number. A second,
-- concurrent call for the same customer has to wait for the first
-- transaction to commit before it can even read the balance — so it always
-- sees the up-to-date, already-decremented numbers. No lost updates are
-- possible. Expiry date is checked server-side on every call, not just when
-- an admin happens to open a page.
--
-- revert_package_hours() is a compensating operation: if the caller's
-- session/customer insert fails *after* redeem_package_hours() already
-- committed the deduction, the API route calls this to credit the exact
-- hours back atomically, so a failed request never leaves hours silently
-- deducted with no visit on record.
--
-- HOW TO APPLY
-- Run this file once in the Supabase SQL editor (or `supabase db push` /
-- your migration tool of choice) against your project. It only creates
-- functions — it does not touch existing data or table structure.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- redeem_package_hours
-- ----------------------------------------------------------------------------
-- p_mobile : customer's mobile number, exactly as stored in packages.mobile
-- p_today  : today's date in IST (pass the same getISTToday() value the rest
--            of the app already uses, so "expired" means the same thing
--            everywhere)
-- p_people : jsonb array, one entry per person sharing this redemption:
--            [{ "is_main": true, "name": "...", "treatment": "...",
--               "hours": 1.5, "therapist_name": "...", "room": "...",
--               "in_time": "...", "out_time": "..." }, ...]
--
-- Returns a jsonb array of "splits" — one entry per package that hours were
-- actually taken from, in FIFO (oldest package first) order:
--   [{ "package_id": "...", "used_hours": 1.5,
--      "session_main_hours": 1.0, "session_guests": [ ... ] }, ...]
--
-- Raises an exception (and rolls back, deducting nothing) if there is no
-- eligible package or the combined balance is insufficient.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.redeem_package_hours(
  p_mobile text,
  p_today date,
  p_people jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_total_available numeric := 0;
  v_total_needed     numeric := 0;
  v_people_hours     numeric[];
  v_n                int;
  v_person_idx       int := 1; -- 1-based: PostgreSQL arrays are 1-indexed
  v_rec              record;
  v_rem              numeric;
  v_used_from_pkg    numeric;
  v_session_main     numeric;
  v_session_guests   jsonb;
  v_allocate         numeric;
  v_person           jsonb;
  v_result           jsonb := '[]'::jsonb;
BEGIN
  IF p_mobile IS NULL OR length(trim(p_mobile)) = 0 THEN
    RAISE EXCEPTION 'INVALID_INPUT: mobile is required';
  END IF;

  IF p_people IS NULL OR jsonb_typeof(p_people) <> 'array' OR jsonb_array_length(p_people) = 0 THEN
    RAISE EXCEPTION 'INVALID_INPUT: at least one participant is required';
  END IF;

  v_n := jsonb_array_length(p_people);

  SELECT COALESCE(SUM((elem->>'hours')::numeric), 0)
    INTO v_total_needed
    FROM jsonb_array_elements(p_people) elem;

  IF v_total_needed <= 0 THEN
    RAISE EXCEPTION 'INVALID_INPUT: total requested hours must be greater than zero';
  END IF;

  SELECT array_agg((elem->>'hours')::numeric ORDER BY ord)
    INTO v_people_hours
    FROM jsonb_array_elements(p_people) WITH ORDINALITY AS t(elem, ord);

  -- ---- Pass 1: lock every eligible package for this mobile and sum what's
  -- available. "Eligible" = active, has hours left, and not expired by date.
  -- The row lock is what makes this safe: a concurrent call for the same
  -- mobile blocks here until this transaction commits or rolls back.
  FOR v_rec IN
    SELECT remaining_hours
    FROM packages
    WHERE mobile = p_mobile
      AND status = 'active'
      AND remaining_hours > 0
      AND (expiry_date IS NULL OR expiry_date >= p_today)
    ORDER BY created_at ASC
    FOR UPDATE
  LOOP
    v_total_available := v_total_available + COALESCE(v_rec.remaining_hours, 0);
  END LOOP;

  IF v_total_available <= 0 THEN
    RAISE EXCEPTION 'NO_ACTIVE_PACKAGE: Active package not found. It may have been deleted or expired.';
  END IF;

  IF v_total_needed > v_total_available THEN
    RAISE EXCEPTION 'INSUFFICIENT_BALANCE: Insufficient package balance across all active packages. Needed: %, Available: %',
      round(v_total_needed, 2), round(v_total_available, 2);
  END IF;

  -- ---- Pass 2: distribute FIFO across the same rows (still locked from
  -- pass 1 within this transaction — re-selecting them does not re-lock or
  -- race, it just re-reads the rows we already own).
  FOR v_rec IN
    SELECT id, remaining_hours, used_hours
    FROM packages
    WHERE mobile = p_mobile
      AND status = 'active'
      AND remaining_hours > 0
      AND (expiry_date IS NULL OR expiry_date >= p_today)
    ORDER BY created_at ASC
    FOR UPDATE
  LOOP
    EXIT WHEN v_person_idx > v_n;

    v_rem := v_rec.remaining_hours;
    v_used_from_pkg := 0;
    v_session_main := 0;
    v_session_guests := '[]'::jsonb;

    WHILE v_person_idx <= v_n AND v_rem > 0.001 LOOP
      v_person := p_people -> (v_person_idx - 1);
      v_allocate := round(LEAST(v_people_hours[v_person_idx], v_rem), 2);

      IF COALESCE((v_person->>'is_main')::boolean, false) THEN
        v_session_main := v_session_main + v_allocate;
      ELSE
        v_session_guests := v_session_guests || jsonb_build_array(jsonb_build_object(
          'name', v_person->>'name',
          'treatment', v_person->>'treatment',
          'sessionHours', v_allocate,
          'therapist_name', v_person->>'therapist_name',
          'room', v_person->>'room',
          'in_time', v_person->>'in_time',
          'out_time', v_person->>'out_time'
        ));
      END IF;

      v_used_from_pkg := v_used_from_pkg + v_allocate;
      v_rem := v_rem - v_allocate;
      v_people_hours[v_person_idx] := v_people_hours[v_person_idx] - v_allocate;

      IF v_people_hours[v_person_idx] <= 0.001 THEN
        v_person_idx := v_person_idx + 1;
      END IF;
    END LOOP;

    IF v_used_from_pkg > 0 THEN
      v_rem := round(v_rem, 2);

      UPDATE packages
      SET used_hours = v_rec.used_hours + v_used_from_pkg,
          remaining_hours = v_rem,
          status = CASE WHEN v_rem <= 0.001 THEN 'expired' ELSE 'active' END
      WHERE id = v_rec.id;

      v_result := v_result || jsonb_build_array(jsonb_build_object(
        'package_id', v_rec.id::text,
        'used_hours', round(v_used_from_pkg, 2),
        'session_main_hours', round(v_session_main, 2),
        'session_guests', CASE WHEN jsonb_array_length(v_session_guests) = 0 THEN NULL ELSE v_session_guests END
      ));
    END IF;
  END LOOP;

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.redeem_package_hours(text, date, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.redeem_package_hours(text, date, jsonb) TO service_role;

-- ----------------------------------------------------------------------------
-- revert_package_hours
-- ----------------------------------------------------------------------------
-- Compensating operation for redeem_package_hours(). Takes the same
-- "splits" array redeem_package_hours() returned (only package_id and
-- used_hours are read) and credits each package back atomically. Used when
-- the caller successfully deducted hours but then failed to save the
-- visit/session record, so the deduction needs to be undone rather than
-- left as an unexplained shortfall on the customer's package.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.revert_package_hours(p_splits jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_split jsonb;
  v_pkg_id text;
  v_hours numeric;
BEGIN
  IF p_splits IS NULL OR jsonb_typeof(p_splits) <> 'array' THEN
    RETURN;
  END IF;

  FOR v_split IN SELECT * FROM jsonb_array_elements(p_splits) LOOP
    v_pkg_id := v_split->>'package_id';
    v_hours := COALESCE((v_split->>'used_hours')::numeric, 0);

    IF v_pkg_id IS NULL OR v_hours <= 0 THEN
      CONTINUE;
    END IF;

    UPDATE packages
    SET used_hours = GREATEST(0, used_hours - v_hours),
        remaining_hours = remaining_hours + v_hours,
        -- The package was eligible (active, not date-expired) moments ago
        -- when redeem_package_hours() took these hours from it, so crediting
        -- them back and marking it active again is always correct here.
        status = 'active'
    WHERE id::text = v_pkg_id;
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public.revert_package_hours(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.revert_package_hours(jsonb) TO service_role;
