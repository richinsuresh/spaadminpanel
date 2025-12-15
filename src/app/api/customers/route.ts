// src/app/api/customers/route.ts
import { supabase } from '@/lib/supabase';
import { NextRequest, NextResponse } from 'next/server';

/**
 * Expected POST body:
 * { bulk: [ { op: 'create'|'update'|'delete', client_uuid?: string, payload: { ... } }, ... ] }
 */

// Helper to log activity
async function logActivity(action: string, description: string, user: string) {
  try {
    // Note: 'supabase' here is the client from lib/supabase. 
    // If RLS blocks this, you might need to use supabaseServer.
    await supabase.from('activity_logs').insert({
      action_type: action,
      description: description,
      username: user
    });
  } catch (err) {
    console.error('Failed to log activity:', err);
  }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const mobile = searchParams.get('mobile')?.replace(/\D/g, '');

    // --- Lookup by Mobile (for client form usage) ---
    if (mobile) {
      const { data: pkg, error: pkgError } = await supabase
        .from('packages')
        .select('*')
        .eq('mobile', mobile)
        .single();

      if (pkgError && pkgError.code !== 'PGRST116') {
        console.error('Package lookup error:', pkgError);
      }

      if (pkg) {
        return NextResponse.json({
          status: pkg.status,
          name: pkg.name,
          mobile: pkg.mobile,
          packageAmount: pkg.package_amount || 0,
          totalPackageHours: pkg.total_hours || 0,
          usedPackageHours: pkg.used_hours || 0,
          remainingHours: pkg.remaining_hours || 0,
          expiryDate: pkg.expiry_date,
        });
      }

      return NextResponse.json(null);
    }

    // --- Return All Customers (for dashboard display) ---
    const { data: customers, error: customersError } = await supabase
      .from('customers')
      .select('id, name, mobile, date, treatment, session_hours, took_package, package_amount, total_package_hours, outlet, amount_paid, client_uuid')
      .order('date', { ascending: false });

    if (customersError) throw customersError;

    return NextResponse.json(customers || []);
  } catch (error) {
    console.error('Error fetching customers from Supabase:', error);
    return NextResponse.json([], { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const bulk = Array.isArray(body?.bulk) ? body.bulk : (Array.isArray(body) ? body : null);

    if (!bulk) {
      return NextResponse.json({ error: 'Invalid payload. Expected { bulk: [...] }' }, { status: 400 });
    }

    const results: Array<any> = [];

    // process items sequentially to avoid race conditions on the same client_uuid / package
    for (const item of bulk) {
      const op = (item.op || 'create').toLowerCase();
      const client_uuid = item.client_uuid || item.payload?.client_uuid || null;
      const payload = item.payload || {};
      
      // Determine "Who" did this.
      const actor = payload.username || payload.outlet || payload.outlet_id || 'API';

      try {
        if (op === 'create') {
          // if client_uuid provided, check existence (idempotency)
          if (client_uuid) {
            const { data: existing, error: existingErr } = await supabase
              .from('customers')
              .select('id')
              .eq('client_uuid', client_uuid)
              .limit(1)
              .maybeSingle();

            if (!existingErr && existing && (existing as any).id) {
              results.push({ op, client_uuid, status: 'skipped', reason: 'already_exists', customer_id: (existing as any).id });
              continue;
            }
          }

          // Insert row
          const insertObj: any = {
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
            outlet: payload.outlet,
            outlet_id: payload.outlet_id,
            payment_method: payload.paymentMethod,
            check_in_time: payload.check_in_time || new Date().toISOString(),
            therapist_name: payload.therapist_name,
            therapist_primary: payload.therapist_primary,
            therapist_secondary: payload.therapist_secondary,
            room: payload.room,
            client_uuid: client_uuid || null,
          };

          const { data: inserted, error: insertErr } = await supabase
            .from('customers')
            .insert([insertObj])
            .select('id')
            .single();

          if (insertErr) {
            // if unique-violation on client_uuid happens, return as skipped (already synced)
            const lower = (insertErr.message || '').toLowerCase();
            if (client_uuid && (lower.includes('unique') || lower.includes('duplicate') || lower.includes('client_uuid'))) {
              const { data: existing2 } = await supabase
                .from('customers')
                .select('id')
                .eq('client_uuid', client_uuid)
                .limit(1)
                .maybeSingle();
              results.push({ op, client_uuid, status: 'skipped', reason: 'unique_violation', customer_id: existing2?.id ?? null });
            } else {
              results.push({ op, client_uuid, status: 'failed', error: insertErr.message || insertErr });
            }
            continue;
          }

          // --- LOGGING ---
          await logActivity(
            'create_customer', 
            `Created Customer ${insertObj.name} (${insertObj.mobile})`, 
            actor
          );

          results.push({ op, client_uuid, status: 'created', customer_id: inserted?.id ?? null });
          continue;
        }

        if (op === 'update') {
          if (!client_uuid) {
            results.push({ op, status: 'failed', error: 'Missing client_uuid for update' });
            continue;
          }
          // Map incoming payload fields to DB column names (snake_case)
          const updateObj: any = {};
          if (payload.name !== undefined) updateObj.name = payload.name;
          if (payload.mobile !== undefined) updateObj.mobile = payload.mobile;
          if (payload.date !== undefined) updateObj.date = payload.date;
          if (payload.treatment !== undefined) updateObj.treatment = payload.treatment;
          if (payload.amountPaid !== undefined) updateObj.amount_paid = payload.amountPaid;
          if (payload.sessionHours !== undefined) updateObj.session_hours = payload.sessionHours;
          if (payload.isPackageCustomer !== undefined) updateObj.is_package_customer = payload.isPackageCustomer;
          if (payload.tookPackage !== undefined) updateObj.took_package = payload.tookPackage;
          if (payload.packageAmount !== undefined) updateObj.package_amount = payload.packageAmount;
          if (payload.totalPackageHours !== undefined) updateObj.total_package_hours = payload.totalPackageHours;
          if (payload.packageSoldBy !== undefined) updateObj.package_sold_by = payload.packageSoldBy;
          if (payload.outlet !== undefined) updateObj.outlet = payload.outlet;
          if (payload.outlet_id !== undefined) updateObj.outlet_id = payload.outlet_id;
          if (payload.paymentMethod !== undefined) updateObj.payment_method = payload.paymentMethod;
          if (payload.check_in_time !== undefined) updateObj.check_in_time = payload.check_in_time;
          if (payload.therapist_name !== undefined) updateObj.therapist_name = payload.therapist_name;
          if (payload.room !== undefined) updateObj.room = payload.room;

          const { error: updateErr, data: updated } = await supabase
            .from('customers')
            .update(updateObj)
            .eq('client_uuid', client_uuid)
            .select('id');

          if (updateErr) {
            results.push({ op, client_uuid, status: 'failed', error: updateErr.message || updateErr });
            continue;
          }

          // --- LOGGING ---
          await logActivity(
            'update_customer', 
            `Updated Customer ${client_uuid}`, 
            actor
          );

          results.push({ op, client_uuid, status: 'updated', customer_id: updated?.[0]?.id ?? null });
          continue;
        }

        if (op === 'delete') {
          if (!client_uuid) {
            results.push({ op, status: 'failed', error: 'Missing client_uuid for delete' });
            continue;
          }

          const { error: deleteErr } = await supabase
            .from('customers')
            .delete()
            .eq('client_uuid', client_uuid);

          if (deleteErr) {
            results.push({ op, client_uuid, status: 'failed', error: deleteErr.message || deleteErr });
            continue;
          }

          // --- LOGGING ---
          await logActivity(
            'delete_customer', 
            `Deleted Customer ${client_uuid}`, 
            actor
          );

          results.push({ op, client_uuid, status: 'deleted' });
          continue;
        }

        // unknown op
        results.push({ op: item.op, status: 'failed', error: 'Unknown operation' });
      } catch (err: any) {
        console.error('Error processing bulk item:', err);
        results.push({ op: item.op, client_uuid: item.client_uuid || null, status: 'failed', error: err?.message || String(err) });
      }
    } // for each

    return NextResponse.json({ ok: true, results });

  } catch (err: any) {
    console.error('Bulk customers handler error:', err);
    return NextResponse.json({ error: err?.message || 'Unknown error' }, { status: 500 });
  }
}