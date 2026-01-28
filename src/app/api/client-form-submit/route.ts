import { supabaseServer as supabase } from '@/lib/supabaseServer';
import { NextRequest, NextResponse } from 'next/server';

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

    // 1. PACKAGE REDEMPTION
    if (payload.isPackageCustomer && payload.packageId) {
      // FIX: Calculate TOTAL hours (Main Session + Group Sessions)
      let hoursToDeduct = Number(payload.sessionHours || 0);
      
      if (payload.group_customers && Array.isArray(payload.group_customers)) {
        payload.group_customers.forEach((guest: any) => {
          hoursToDeduct += Number(guest.sessionHours || 0);
        });
      }

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
          result.package_warn = 'Package lookup error: ' + (findError.message || JSON.stringify(findError));
        } else if (activePackage && activePackage.id) {
          const currentRemaining = parseFloat(activePackage.remaining_hours || '0');
          const currentUsed = parseFloat(activePackage.used_hours || '0');
          const newRemainingHours = currentRemaining - hoursToDeduct;
          const newUsedHours = currentUsed + hoursToDeduct;
          
          // Allow it to go negative if you want, or clamp it. 
          // Usually better to allow slight negative to not block service, or strict check. 
          // Here we assume strict check was done on frontend, but we process it regardless.
          const newStatus = newRemainingHours <= 0 ? 'expired' : 'active';

          const { error: updateError } = await supabase
            .from('packages')
            .update({ remaining_hours: newRemainingHours, used_hours: newUsedHours, status: newStatus })
            .eq('id', payload.packageId);

          if (updateError) throw new Error('Error updating package: ' + updateError.message);
        } else {
          result.package_warn = 'No active package available to redeem (skipped deduction)';
        }
      }
    }

    // 2. PACKAGE SALE (Always New)
    if (payload.tookPackage) {
      const newTotalHours = Number(payload.totalPackageHours || 0);
      const sessionHours = Number(payload.sessionHours || 0);
      const packagePrice = payload.packageAmount || 0;
      const validityPeriod = payload.packageValidity || '3 months';

      const newExpiry = calculateNewExpiryDate(null, validityPeriod);

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
        start_date: new Date().toISOString().split('T')[0],
        remaining_hours: newTotalHours - sessionHours,
        total_hours: newTotalHours,
        used_hours: sessionHours,
        expiry_date: newExpiry
      };

      const { error: insertError } = await supabase.from('packages').insert([basePkg]);
      if (insertError) throw new Error('Error creating new package: ' + insertError.message);
    }

    // 3. INSERT SESSION
    const checkInTime: string = payload.check_in_time || new Date().toISOString();

    let finalCheckOutTime = null;
    if (payload.check_out_time) {
        finalCheckOutTime = payload.check_out_time;
    } 
    else if (payload.tookPackage && (!payload.sessionHours || Number(payload.sessionHours) <= 0)) {
        finalCheckOutTime = checkInTime;
    }

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
      check_out_time: finalCheckOutTime,
      therapist_name: payload.therapist_name,
      room: payload.room,
      in_time: payload.in_time ?? null,
      out_time: payload.out_time ?? null,
      group_customers: payload.group_customers?.length ? payload.group_customers : null,
      client_uuid: payload.client_uuid || null
    };

    const { data: sessionData, error: sessionError } = await supabase
      .from('customers')
      .insert(customerInsert)
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