// app/api/client-form-submit/route.ts
import { supabaseServer as supabase } from '@/lib/supabaseServer';
import { NextRequest, NextResponse } from 'next/server';

/** helper unchanged **/
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

  const newExpiryDate = new Date(baseDate.getTime());
  newExpiryDate.setMonth(newExpiryDate.getMonth() + monthsToAdd);

  return newExpiryDate.toISOString().split('T')[0];
}

/** ---------------------------------------------------------
 * PROCESS SINGLE PAYLOAD
 * --------------------------------------------------------- */
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

    // -------------------------------
    // Idempotency check by client_uuid
    // -------------------------------
    if (payload.client_uuid) {
      const { data: existingSession, error: existingError } = await supabase
        .from('customers')
        .select('id, client_uuid')
        .eq('client_uuid', payload.client_uuid)
        .limit(1)
        .maybeSingle();

      if (existingError) {
        console.warn('[client-form-submit] existingSession check error:', existingError);
      } else if (existingSession && existingSession.id) {
        result.ok = true;
        result.skipped = true;
        result.message = 'Already exists (client_uuid)';
        result.customer_session_id = existingSession.id;
        return result;
      }
    }

    // -------------------------------
    // 1. PACKAGE REDEMPTION
    // -------------------------------
    if (payload.isPackageCustomer && payload.packageId) {
      const hoursToDeduct = Number(payload.sessionHours || 0);

      if (hoursToDeduct > 0) {
        const { data: activePackage, error: findError } = await supabase
          .from('packages')
          .select('id, remaining_hours, used_hours')
          .eq('id', payload.packageId)
          .eq('status', 'active')
          .gt('remaining_hours', 0)
          .limit(1)
          .maybeSingle();

        if (findError) {
          console.warn('[client-form-submit] package lookup error:', findError);
          result.package_warn =
            'Package lookup error: ' +
            (findError.message || JSON.stringify(findError));
        } else if (activePackage && activePackage.id) {
          const currentRemaining = parseFloat(activePackage.remaining_hours || '0');
          const currentUsed = parseFloat(activePackage.used_hours || '0');

          const newRemainingHours = currentRemaining - hoursToDeduct;
          const newUsedHours = currentUsed + hoursToDeduct;
          const newStatus = newRemainingHours <= 0 ? 'expired' : 'active';

          const { error: updateError } = await supabase
            .from('packages')
            .update({
              remaining_hours: newRemainingHours,
              used_hours: newUsedHours,
              status: newStatus,
            })
            .eq('id', payload.packageId);

          if (updateError) {
            console.error('[client-form-submit] package update error:', updateError);
            throw new Error(
              'Error updating package: ' +
                (updateError.message || JSON.stringify(updateError)),
            );
          }
        } else {
          result.package_warn =
            'No active package available to redeem (skipped deduction)';
        }
      }
    }

    // -------------------------------
    // 2. PACKAGE SALE / RENEWAL
    // -------------------------------
    if (payload.tookPackage) {
      const newTotalHours = Number(payload.totalPackageHours || 0);
      const sessionHours = Number(payload.sessionHours || 0);
      const packagePrice = payload.packageAmount || 0;
      const validityPeriod = payload.packageValidity || '3 months';

      const { data: existingActivePackage, error: findActivePkgError } =
        await supabase
          .from('packages')
          .select('id, remaining_hours, expiry_date, total_hours, used_hours')
          .eq('mobile', payload.mobile)
          .eq('status', 'active')
          .order('created_at', { ascending: true })
          .limit(1)
          .maybeSingle();

      if (findActivePkgError) {
        console.error(
          '[client-form-submit] find active package error:',
          findActivePkgError,
        );
        throw new Error(
          'Error finding active package: ' +
            (findActivePkgError.message ||
              JSON.stringify(findActivePkgError)),
        );
      }

      const basePkg: any = {
        name: payload.name,
        mobile: payload.mobile,
        package_amount: packagePrice,
        package_sold_by: payload.packageSoldBy,
        outlet_id: payload.outlet_id,
        outlet: payload.outlet,
        outlet_name: payload.outlet,
        payment_method: payload.paymentMethod,
        status: 'active',
      };

      if (existingActivePackage && existingActivePackage.id) {
        const currentRemaining = parseFloat(
          existingActivePackage.remaining_hours || '0',
        );
        const currentTotal = parseFloat(existingActivePackage.total_hours || '0');
        const currentUsed = parseFloat(existingActivePackage.used_hours || '0');

        const finalRemaining = currentRemaining + newTotalHours - sessionHours;
        const finalTotal = currentTotal + newTotalHours;
        const finalUsed = currentUsed + sessionHours;

        const newExpiry = calculateNewExpiryDate(
          existingActivePackage.expiry_date,
          validityPeriod,
        );

        basePkg.remaining_hours = finalRemaining;
        basePkg.total_hours = finalTotal;
        basePkg.used_hours = finalUsed;
        basePkg.expiry_date = newExpiry;

        const { error: updateError } = await supabase
          .from('packages')
          .update(basePkg)
          .eq('id', existingActivePackage.id);

        if (updateError) {
          console.error(
            '[client-form-submit] package stacking error:',
            updateError,
          );
          throw new Error(
            'Error adding hours to existing package: ' +
              (updateError.message || JSON.stringify(updateError)),
          );
        }
      } else {
        const newExpiry = calculateNewExpiryDate(null, validityPeriod);

        basePkg.remaining_hours = newTotalHours - sessionHours;
        basePkg.total_hours = newTotalHours;
        basePkg.used_hours = sessionHours;
        basePkg.expiry_date = newExpiry;
        basePkg.start_date = new Date().toISOString().split('T')[0];

        const { error: insertError } = await supabase
          .from('packages')
          .insert([basePkg]);

        if (insertError) {
          console.error(
            '[client-form-submit] new package insert error:',
            insertError,
          );
          throw new Error(
            'Error creating new package: ' +
              (insertError.message || JSON.stringify(insertError)),
          );
        }
      }
    }

    // -------------------------------
    // 3. INSERT CUSTOMER SESSION
    // -------------------------------
    // Use check_in_time from payload if present (client already computed),
    // otherwise default to "now".
    const checkInTime: string = payload.check_in_time || new Date().toISOString();

    const customerInsert: any = {
      name: payload.name,
      mobile: payload.mobile,
      date: payload.date,
      treatment: payload.treatment,
      amount_paid: payload.amountPaid,
      session_hours: payload.sessionHours,
      is_package_customer: payload.isPackageCustomer,
      took_package: payload.tookPackage,
      package_amount: payload.packageAmount,
      total_package_hours: payload.totalPackageHours,
      package_sold_by: payload.packageSoldBy,
      outlet_id: payload.outlet_id,
      outlet_name: payload.outlet,
      payment_method: payload.paymentMethod,
      check_in_time: checkInTime,
      therapist_name: payload.therapist_name,
      room: payload.room,

      // 🔴 NEW: save manual / auto-calculated times from client form
      in_time: payload.in_time ?? null,   // "HH:mm" (main customer)
      out_time: payload.out_time ?? null, // "HH:mm" (main customer)

      // 🔴 NEW: full group JSON sent from client form
      group_customers:
        payload.group_customers && payload.group_customers.length
          ? payload.group_customers
          : null,
    };

    if (payload.client_uuid) {
      customerInsert.client_uuid = payload.client_uuid;
    }

    const { data: sessionData, error: sessionError } = await supabase
      .from('customers')
      .insert(customerInsert)
      .select('id')
      .single();

    if (sessionError) {
      const lower = (sessionError.message || '').toLowerCase();
      console.error('[client-form-submit] session insert error:', sessionError);

      if (
        payload.client_uuid &&
        (lower.includes('unique') ||
          lower.includes('duplicate') ||
          lower.includes('client_uuid'))
      ) {
        const { data: existing, error: findExistingErr } = await supabase
          .from('customers')
          .select('id')
          .eq('client_uuid', payload.client_uuid)
          .limit(1)
          .maybeSingle();

        if (!findExistingErr && existing && existing.id) {
          result.ok = true;
          result.skipped = true;
          result.customer_session_id = existing.id;
          result.message = 'Already exists (client_uuid duplicate)';
          return result;
        }
      }

      throw new Error(
        'Error saving session: ' +
          (sessionError.message || JSON.stringify(sessionError)),
      );
    }

    // success
    result.ok = true;
    result.customer_session_id = sessionData ? sessionData.id : null;
    result.message = 'Processed';
    return result;
  } catch (err: any) {
    const uuid = payload && payload.client_uuid ? payload.client_uuid : 'none';
    console.error(
      '[client-form-submit] Error processing payload (client_uuid=' +
        uuid +
        '):',
      err,
    );

    result.ok = false;
    result.error = err && err.message ? err.message : String(err);
    return result;
  }
}

/** ---------------------------------------------------------
 * POST HANDLER
 * --------------------------------------------------------- */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));

    const bulk = Array.isArray(body && body.bulk)
      ? body.bulk
      : Array.isArray(body)
      ? body
      : null;
    const single = !bulk ? body : null;

    // BULK MODE
    if (bulk) {
      const results: any[] = [];

      for (const item of bulk) {
        try {
          const r = await processPayload(item);
          results.push(r);
        } catch (e: any) {
          console.error('[client-form-submit] fatal error in bulk:', e);
          results.push({
            ok: false,
            error: e && e.message ? e.message : String(e),
          });
        }
      }

      return NextResponse.json({ ok: true, results });
    }

    // SINGLE MODE
    if (single) {
      console.info('[client-form-submit] incoming single payload (safe log):', {
        name: single.name,
        mobile: single.mobile,
        tookPackage: single.tookPackage,
        isPackageCustomer: single.isPackageCustomer,
        outlet: single.outlet,
      });

      const res = await processPayload(single);

      if (res.ok) {
        return NextResponse.json({ ok: true, result: res });
      } else {
        return NextResponse.json(
          { ok: false, error: res.error || 'Failed to process' },
          { status: 500 },
        );
      }
    }

    return NextResponse.json({ error: 'No payload' }, { status: 400 });
  } catch (err: any) {
    console.error('[client-form-submit] top-level error:', err);
    return NextResponse.json(
      { error: err && err.message ? err.message : 'Unknown server error' },
      { status: 500 },
    );
  }
}
