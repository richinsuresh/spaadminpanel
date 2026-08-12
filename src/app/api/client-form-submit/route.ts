// src/app/api/client-form-submit/route.ts
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
      client_uuid: payload.client_uuid || null,
      
      // 🔥 FIX: ADD THE CLIENT TYPE HERE SO THE DATABASE SAVES IT 🔥
      client_type: payload.clientType || 'new',
    };

    // 1. PACKAGE REDEMPTION (Multi-Package FIFO Support)
    if (payload.isPackageCustomer) {
        // Fetch active packages ordered by oldest first
        const { data: activePackages, error: findError } = await supabase
          .from('packages')
          .select('id, remaining_hours, used_hours, status')
          .eq('mobile', payload.mobile)
          .eq('status', 'active')
          .gt('remaining_hours', 0)
          .order('created_at', { ascending: true }); 

        if (findError) throw new Error('Error fetching active packages: ' + findError.message);
        if (!activePackages || activePackages.length === 0) throw new Error('Active package not found. It may have been deleted or expired.');

        let totalAvailable = activePackages.reduce((sum, p) => sum + Number(p.remaining_hours), 0);

        // Queue all participants who need hours
        let people: any[] = [
            { isMain: true, name: payload.name, treatment: payload.treatment, hours: Number(payload.sessionHours) || 0, therapist_name: payload.therapist_name, room: payload.room, in_time: payload.in_time, out_time: payload.out_time }
        ];

        if (payload.group_customers && Array.isArray(payload.group_customers)) {
            payload.group_customers.forEach((g: any) => {
                people.push({
                    isMain: false,
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

        let totalNeeded = people.reduce((sum, p) => sum + p.hours, 0);

        if (totalNeeded > totalAvailable) {
            throw new Error(`Insufficient package balance across all active packages. Needed: ${totalNeeded.toFixed(2)}, Available: ${totalAvailable.toFixed(2)}`);
        }

        const sessionsToInsert = [];
        const packagesToUpdate = [];

        // Distribute hours across packages sequentially
        for (let pkg of activePackages) {
            if (people.length === 0) break;

            let rem = Number(pkg.remaining_hours);
            let usedFromThisPkg = 0;
            let sessionMainHours = 0;
            let sessionGuests = [];

            while (people.length > 0 && rem > 0.001) {
                let p = people[0];
                let allocate = Math.min(p.hours, rem);
                
                allocate = Math.round(allocate * 100) / 100; // Float precision safety

                if (p.isMain) {
                    sessionMainHours += allocate;
                } else {
                    sessionGuests.push({
                        name: p.name,
                        treatment: p.treatment,
                        sessionHours: allocate,
                        therapist_name: p.therapist_name,
                        room: p.room,
                        in_time: p.in_time,
                        out_time: p.out_time
                    });
                }

                usedFromThisPkg += allocate;
                rem -= allocate;
                p.hours -= allocate;

                // Move to next person if current person's hours are fulfilled
                if (p.hours <= 0.001) {
                    people.shift();
                }
            }

            if (usedFromThisPkg > 0) {
                packagesToUpdate.push({
                    id: pkg.id,
                    used_hours: Number(pkg.used_hours) + usedFromThisPkg,
                    remaining_hours: Math.round(rem * 100) / 100,
                    status: rem <= 0.001 ? 'expired' : 'active'
                });

                // Create a dedicated session split for this specific package so history sync works
                sessionsToInsert.push({
                    ...baseCustomerInsert,
                    session_hours: sessionMainHours,
                    group_customers: sessionGuests.length > 0 ? sessionGuests : null,
                    package_id: pkg.id,
                    client_uuid: payload.client_uuid ? (sessionsToInsert.length === 0 ? payload.client_uuid : `${payload.client_uuid}-${pkg.id}`) : null
                });
            }
        }

        // Apply package updates
        for (let pu of packagesToUpdate) {
            const { error: puError } = await supabase
                .from('packages')
                .update({ used_hours: pu.used_hours, remaining_hours: pu.remaining_hours, status: pu.status })
                .eq('id', pu.id);
            if (puError) throw new Error('Failed to update package: ' + puError.message);
        }

        // Insert session splits
        const { data: insertedSessions, error: insertSessionError } = await supabase
            .from('customers')
            .insert(sessionsToInsert)
            .select('id');
            
        if (insertSessionError) throw new Error('Error saving sessions: ' + insertSessionError.message);

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
            expiry_date: newExpiry,
            op_uuid: pkgOpUuid,
          };

          const { error: insertError } = await supabase.from('packages').insert([basePkg]);
          if (insertError) {
            const lower = (insertError.message || '').toLowerCase();
            // If a unique constraint on op_uuid exists and a concurrent request beat us to it,
            // treat it as a benign duplicate instead of failing the whole submission.
            if (!(lower.includes('unique') || lower.includes('duplicate') || lower.includes('op_uuid'))) {
              throw new Error('Error creating new package: ' + insertError.message);
            }
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
