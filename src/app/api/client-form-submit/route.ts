// src/app/api/client-form-submit/route.ts
import { supabaseServer as supabase } from '@/lib/supabaseServer';
import { NextRequest, NextResponse } from 'next/server';
import { getISTToday, addMonthsAsISTDateString } from '@/lib/dateTime';

function calculateNewExpiryDate(currentExpiryDateStr: string | null, validityPeriod: string): string {
  const parts = validityPeriod.split(' ');
  const amount = parts[0] || '0';
  const monthsToAdd = parseInt(amount, 10);

  let baseDate: Date;
  if (currentExpiryDateStr) {
    const currentExpiry = new Date(currentExpiryDateStr);
    currentExpiry.setHours(0, 0, 0, 0);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    baseDate = currentExpiry >= today ? currentExpiry : today;
  } else {
    baseDate = new Date();
  }

  // NOTE: this route runs server-side on Vercel, which defaults to UTC.
  // addMonthsAsISTDateString() cancels out the server's UTC offset before
  // applying IST, so the resulting expiry date matches the IST calendar
  // day regardless of what timezone the serverless function is running in.
  return addMonthsAsISTDateString(baseDate, monthsToAdd);
}

// True only for a genuine Postgres unique-constraint violation (duplicate op_uuid).
// Postgres error code 23505 = unique_violation. We check the code first (reliable),
// and only fall back to string-matching on messages that explicitly say "already exists"
// or "duplicate key" — NOT on messages that merely mention the column name "op_uuid",
// because Supabase/PostgREST also uses that word in a completely different, fatal error:
// "Could not find the 'op_uuid' column of 'packages' in the schema cache" (missing column).
// The old code matched on that substring too and silently swallowed real insert failures.
function isBenignDuplicateError(err: any): boolean {
  if (!err) return false;
  if (err.code === '23505') return true;
  const msg = (err.message || '').toLowerCase();
  return msg.includes('duplicate key value') || msg.includes('already exists');
}

async function processPayload(payload: any) {
  const result: any = {
    client_uuid: payload && payload.client_uuid ? payload.client_uuid : null,
    ok: false,
  };

  try {
    if (!payload || !payload.name || !payload.mobile) {
      result.error = 'Invalid payload: missing name or mobile';
      return result;
    }

    // Normalize the "sold by" field once. The form sends `sold_by`; some legacy
    // callers may send `packageSoldBy`. Support both so we never silently save null.
    const soldBy = payload.sold_by ?? payload.packageSoldBy ?? null;

    // Idempotency check
    if (payload.client_uuid) {
      const { data: existingSession, error: existingError } = await supabase
        .from('customers')
        .select('id, client_uuid')
        .eq('client_uuid', payload.client_uuid)
        .limit(1)
        .maybeSingle();

      if (existingError) console.warn('[client-form-submit] existingSession check error:', existingError);
      else if (existingSession && existingSession.id) {
        result.ok = true;
        result.skipped = true;
        result.message = 'Already exists (client_uuid)';
        result.customer_session_id = existingSession.id;
        return result;
      }
    }

    const checkInTime: string = payload.check_in_time || new Date().toISOString();
    let finalCheckOutTime = null;
    if (payload.check_out_time) {
        finalCheckOutTime = payload.check_out_time;
    } else if (payload.tookPackage && (!payload.sessionHours || Number(payload.sessionHours) <= 0)) {
        finalCheckOutTime = checkInTime;
    }

    const baseCustomerInsert: any = {
      name: payload.name,
      mobile: payload.mobile,
      date: payload.date,
      treatment: payload.treatment,
      amount_paid: payload.amountPaid,
      is_package_customer: payload.isPackageCustomer,
      took_package: payload.tookPackage,
      package_amount: payload.packageAmount,
      total_package_hours: payload.totalPackageHours,
      package_sold_by: soldBy,
      outlet_id: payload.outlet_id,
      outlet_name: payload.outlet,
      payment_method: payload.paymentMethod,
      check_in_time: checkInTime,
      check_out_time: finalCheckOutTime,
      therapist_name: payload.therapist_name,
      room: payload.room,
      in_time: payload.in_time ?? null,
      out_time: payload.out_time ?? null,
      client_uuid: payload.client_uuid || null,
      
      // 🔥 FIX: ADD THE CLIENT TYPE HERE SO THE DATABASE SAVES IT 🔥
      client_type: payload.clientType || 'new',
    };

    // 1. PACKAGE REDEMPTION (Multi-Package FIFO Support)
    //
    // The eligibility check + hour deduction happens atomically in Postgres
    // (redeem_package_hours) instead of being read-computed-written here in
    // JS. That old pattern (SELECT remaining_hours, subtract in JS, UPDATE)
    // was a classic lost-update race: two near-simultaneous redemptions for
    // the same mobile could both read the same starting balance and both
    // succeed, over-drawing the package. The Postgres function locks every
    // eligible package row for this mobile (FOR UPDATE) for the duration of
    // the check-and-deduct, so a concurrent call always sees the up-to-date
    // balance. It also enforces expiry_date server-side on every call,
    // instead of relying on the admin UI's lazy "mark expired on page load"
    // side effect.
    if (payload.isPackageCustomer) {
        const people: any[] = [
            { is_main: true, name: payload.name, treatment: payload.treatment, hours: Number(payload.sessionHours) || 0, therapist_name: payload.therapist_name, room: payload.room, in_time: payload.in_time, out_time: payload.out_time }
        ];

        if (payload.group_customers && Array.isArray(payload.group_customers)) {
            payload.group_customers.forEach((g: any) => {
                people.push({
                    is_main: false,
                    name: g.name,
                    treatment: g.treatment,
                    hours: Number(g.sessionHours ?? g.session_hours ?? g.duration ?? 0),
                    therapist_name: g.therapist_name,
                    room: g.room,
                    in_time: g.in_time,
                    out_time: g.out_time
                });
            });
        }

        const { data: splits, error: redeemError } = await supabase.rpc('redeem_package_hours', {
            p_mobile: payload.mobile,
            p_today: getISTToday(),
            p_people: people,
        });

        if (redeemError) {
            // Surfaces the exact message raised inside the SQL function
            // (e.g. "Active package not found..." or "Insufficient package
            // balance...") so the staff member sees the same clear error
            // they always did.
            throw new Error(redeemError.message || 'Failed to redeem package hours');
        }
        if (!splits || splits.length === 0) {
            throw new Error('Active package not found. It may have been deleted or expired.');
        }

        // Build one session row per package the hours were actually taken
        // from, exactly as before — just sourced from the atomic RPC's
        // result instead of a locally-computed (and racy) split.
        const sessionsToInsert = splits.map((s: any, idx: number) => ({
            ...baseCustomerInsert,
            session_hours: s.session_main_hours,
            group_customers: s.session_guests && s.session_guests.length > 0 ? s.session_guests : null,
            package_id: s.package_id,
            client_uuid: payload.client_uuid ? (idx === 0 ? payload.client_uuid : `${payload.client_uuid}-${s.package_id}`) : null
        }));

        const { data: insertedSessions, error: insertSessionError } = await supabase
            .from('customers')
            .insert(sessionsToInsert)
            .select('id');

        if (insertSessionError) {
            // The hours were already deducted atomically above. Since the
            // visit records failed to save, credit every package back
            // exactly what was taken from it — otherwise this would look
            // identical to a lost-update bug from the outside (hours gone,
            // no session on file, no way to tell why).
            const { error: revertError } = await supabase.rpc('revert_package_hours', {
                p_splits: splits.map((s: any) => ({ package_id: s.package_id, used_hours: s.used_hours })),
            });
            if (revertError) {
                console.error('[client-form-submit] CRITICAL: failed to revert package hours after a failed session insert. Splits that need manual review:', JSON.stringify(splits), revertError);
            }
            throw new Error('Error saving sessions: ' + insertSessionError.message);
        }

        result.ok = true;
        result.customer_session_id = insertedSessions?.[0]?.id || null;
        result.message = 'Processed';
        return result;
    }

    // 2. PACKAGE SALE
    if (payload.tookPackage) {
      // Idempotency guard: use client_uuid as the package's op_uuid so that
      // retries/double-submits of the same request never create a second row.
      const pkgOpUuid = payload.client_uuid || null;

      if (pkgOpUuid) {
        const { data: existingPkg, error: existingPkgErr } = await supabase
          .from('packages')
          .select('id')
          .eq('op_uuid', pkgOpUuid)
          .limit(1)
          .maybeSingle();

        if (existingPkgErr) {
          // The lookup itself failed (e.g. column doesn't exist, connection issue).
          // Log it loudly instead of silently falling through to an insert attempt
          // that's likely to fail the same way.
          console.error('[client-form-submit] op_uuid lookup failed on packages table:', existingPkgErr);
        }

        if (!existingPkgErr && existingPkg && (existingPkg as any).id) {
          // Package for this exact submission already exists — skip re-creating it.
          result.ok = true;
          result.skipped = true;
          result.message = 'Package already created for this submission';
          result.package_id = (existingPkg as any).id;
          // Fall through so the normal session/customer insert logic below still runs
          // (it has its own client_uuid-based idempotency check at the top of this function).
        } else {
          const newTotalHours = Number(payload.totalPackageHours || 0);
          const sessionHours = Number(payload.sessionHours || 0);
          const packagePrice = payload.packageAmount || 0;
          const validityPeriod = payload.packageValidity || '3 months';

          const newExpiry = calculateNewExpiryDate(null, validityPeriod);

          const basePkg: any = {
            name: payload.name,
            mobile: payload.mobile,
            package_amount: packagePrice,
            package_sold_by: soldBy,
            outlet_id: payload.outlet_id,
            outlet: payload.outlet,
            outlet_name: payload.outlet,
            payment_method: payload.paymentMethod,
            status: 'active',
            start_date: getISTToday(),
            remaining_hours: newTotalHours - sessionHours,
            total_hours: newTotalHours,
            used_hours: sessionHours,
            expiry_date: newExpiry,
            op_uuid: pkgOpUuid,
          };

          const { error: insertError } = await supabase.from('packages').insert([basePkg]);
          if (insertError) {
            // Always log the real error so failures are visible in Vercel logs,
            // even in the case below where we choose to treat it as benign.
            console.error('[client-form-submit] Error inserting into packages table:', insertError);

            if (!isBenignDuplicateError(insertError)) {
              // This is a real failure (missing column, bad type, RLS, etc).
              // Do NOT silently continue — surface it so the whole submission fails
              // loudly instead of quietly skipping package creation.
              throw new Error('Error creating new package: ' + insertError.message);
            }
            // Otherwise: genuine unique-constraint duplicate on op_uuid from a
            // concurrent retry — safe to ignore and continue.
          }
        }
      } else {
        // No client_uuid supplied — proceed as before (legacy callers), but this
        // path has no duplicate protection. Frontend should always send client_uuid.
        const newTotalHours = Number(payload.totalPackageHours || 0);
        const sessionHours = Number(payload.sessionHours || 0);
        const packagePrice = payload.packageAmount || 0;
        const validityPeriod = payload.packageValidity || '3 months';

        const newExpiry = calculateNewExpiryDate(null, validityPeriod);

        const basePkg: any = {
          name: payload.name,
          mobile: payload.mobile,
          package_amount: packagePrice,
          package_sold_by: soldBy,
          outlet_id: payload.outlet_id,
          outlet: payload.outlet,
          outlet_name: payload.outlet,
          payment_method: payload.paymentMethod,
          status: 'active',
          start_date: getISTToday(),
          remaining_hours: newTotalHours - sessionHours,
          total_hours: newTotalHours,
          used_hours: sessionHours,
          expiry_date: newExpiry
        };

        const { error: insertError } = await supabase.from('packages').insert([basePkg]);
        if (insertError) {
          console.error('[client-form-submit] Error inserting into packages table (no client_uuid):', insertError);
          throw new Error('Error creating new package: ' + insertError.message);
        }
      }
    }

    // 3. INSERT NON-REDEMPTION SESSION
    const singleSessionInsert = {
        ...baseCustomerInsert,
        session_hours: payload.sessionHours,
        group_customers: payload.group_customers?.length ? payload.group_customers : null
    };

    const { data: sessionData, error: sessionError } = await supabase
      .from('customers')
      .insert(singleSessionInsert)
      .select('id')
      .single();

    if (sessionError) {
      const lower = (sessionError.message || '').toLowerCase();
      if (payload.client_uuid && (lower.includes('unique') || lower.includes('duplicate') || lower.includes('client_uuid'))) {
        const { data: existing } = await supabase
          .from('customers')
          .select('id')
          .eq('client_uuid', payload.client_uuid)
          .limit(1)
          .maybeSingle();
        if (existing?.id) {
          result.ok = true;
          result.skipped = true;
          result.customer_session_id = existing.id;
          result.message = 'Already exists (client_uuid duplicate)';
          return result;
        }
      }
      throw new Error('Error saving session: ' + sessionError.message);
    }

    result.ok = true;
    result.customer_session_id = sessionData?.id || null;
    result.message = 'Processed';
    return result;

  } catch (err: any) {
    console.error('[client-form-submit] Error:', err);
    result.ok = false;
    result.error = err.message || String(err);
    return result;
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const bulk = Array.isArray(body?.bulk) ? body.bulk : (Array.isArray(body) ? body : null);
    const single = !bulk ? body : null;

    if (bulk) {
      const results = [];
      for (const item of bulk) {
        try {
          const r = await processPayload(item);
          results.push(r);
        } catch (e: any) {
          results.push({ ok: false, error: e.message || String(e) });
        }
      }
      return NextResponse.json({ ok: true, results });
    }

    if (single) {
      const res = await processPayload(single);
      return NextResponse.json(res.ok ? { ok: true, result: res } : { ok: false, error: res.error }, { status: res.ok ? 200 : 500 });
    }

    return NextResponse.json({ error: 'No payload' }, { status: 400 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
