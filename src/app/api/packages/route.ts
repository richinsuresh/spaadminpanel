// src/app/api/packages/route.ts
import { supabaseServer as supabase } from '@/lib/supabaseServer';
import { NextRequest, NextResponse } from 'next/server';

/**
 * GET: existing packages listing (keeps your existing behavior)
 * POST: accepts { bulk: [ { op, op_uuid, payload }, ... ] }
 */

// Helper to log activity
async function logActivity(action: string, description: string, user: string) {
  try {
    await supabase.from('activity_logs').insert({
      action_type: action,
      description: description,
      username: user
    });
  } catch (err) {
    console.error('Failed to log activity:', err);
  }
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const mobile = searchParams.get('mobile')?.replace(/\D/g, '');

    if (mobile) {
      const { data: packages, error } = await supabase
        .from('packages')
        .select('*')
        .eq('mobile', mobile)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return NextResponse.json(packages || []);
    }

    // general list
    const { data, error } = await supabase
      .from('packages')
      .select('id, name, mobile, package_amount, total_hours, remaining_hours, used_hours, expiry_date, status, outlet, outlet_id')
      .order('created_at', { ascending: false });

    if (error) throw error;
    return NextResponse.json(data || []);
  } catch (err: any) {
    console.error('Error fetching packages:', err);
    return NextResponse.json({ error: err.message || 'Failed to fetch packages' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const bulk = Array.isArray(body?.bulk) ? body.bulk : (Array.isArray(body) ? body : null);
    if (!bulk) return NextResponse.json({ error: 'Invalid payload, expected { bulk: [...] }' }, { status: 400 });

    const results: any[] = [];

    for (const item of bulk) {
      const op = (item.op || 'create').toLowerCase();
      const op_uuid = item.op_uuid || item.payload?.op_uuid || null;
      const payload = item.payload || {};
      
      // Determine "Who" did this.
      const actor = payload.username || payload.outlet || payload.outlet_id || 'API';

      try {
        // CREATE
        if (op === 'create') {
          if (op_uuid) {
            const { data: exists, error: existsErr } = await supabase
              .from('packages')
              .select('id')
              .eq('op_uuid', op_uuid)
              .limit(1)
              .maybeSingle();

            if (!existsErr && exists && (exists as any).id) {
              results.push({ op, op_uuid, status: 'skipped', reason: 'already_exists', package_id: (exists as any).id });
              continue;
            }
          }

          const insertObj: any = {
            name: payload.name,
            mobile: payload.mobile,
            package_amount: payload.packageAmount ?? payload.package_amount ?? 0,
            total_hours: payload.totalHours ?? payload.total_hours ?? payload.totalPackageHours ?? null,
            remaining_hours: payload.remainingHours ?? payload.remaining_hours ?? null,
            used_hours: payload.usedHours ?? payload.used_hours ?? 0,
            expiry_date: payload.expiryDate ?? payload.expiry_date ?? null,
            status: payload.status ?? 'active',
            package_sold_by: payload.packageSoldBy ?? payload.package_sold_by ?? null,
            outlet: payload.outlet ?? null,
            outlet_id: payload.outlet_id ?? null,
            payment_method: payload.paymentMethod ?? payload.payment_method ?? null,
            start_date: payload.startDate ?? payload.start_date ?? null,
            op_uuid: op_uuid ?? null
          };

          const { data: inserted, error: insertErr } = await supabase
            .from('packages')
            .insert([insertObj])
            .select('id')
            .single();

          if (insertErr) {
            const lower = (insertErr.message || '').toLowerCase();
            if (op_uuid && (lower.includes('unique') || lower.includes('duplicate') || lower.includes('op_uuid'))) {
              const { data: existing2 } = await supabase
                .from('packages')
                .select('id')
                .eq('op_uuid', op_uuid)
                .limit(1)
                .maybeSingle();
              results.push({ op, op_uuid, status: 'skipped', reason: 'unique_violation', package_id: existing2?.id ?? null });
            } else {
              results.push({ op, op_uuid, status: 'failed', error: insertErr.message || String(insertErr) });
            }
            continue;
          }

          // --- LOGGING ---
          await logActivity(
            'create_package', 
            `Created Package for ${insertObj.name} (${insertObj.mobile}) - ₹${insertObj.package_amount}`, 
            actor
          );

          results.push({ op, op_uuid, status: 'created', package_id: inserted?.id ?? null });
          continue;
        }

        // UPDATE
        if (op === 'update') {
          // Prefer op_uuid for idempotent lookup; fallback to id
          const identifier = op_uuid ? { op_uuid } : (payload.id ? { id: payload.id } : null);
          if (!identifier) {
            results.push({ op, op_uuid, status: 'failed', error: 'Missing op_uuid or id for update' });
            continue;
          }

          const updateObj: any = {};
          if (payload.name !== undefined) updateObj.name = payload.name;
          if (payload.mobile !== undefined) updateObj.mobile = payload.mobile;
          if (payload.packageAmount !== undefined) updateObj.package_amount = payload.packageAmount;
          if (payload.totalHours !== undefined) updateObj.total_hours = payload.totalHours;
          if (payload.remainingHours !== undefined) updateObj.remaining_hours = payload.remainingHours;
          if (payload.usedHours !== undefined) updateObj.used_hours = payload.usedHours;
          if (payload.expiryDate !== undefined) updateObj.expiry_date = payload.expiryDate;
          if (payload.status !== undefined) updateObj.status = payload.status;
          if (payload.packageSoldBy !== undefined) updateObj.package_sold_by = payload.packageSoldBy;
          if (payload.paymentMethod !== undefined) updateObj.payment_method = payload.paymentMethod;
          if (payload.startDate !== undefined) updateObj.start_date = payload.startDate;
          // Ensure op_uuid stored (so future duplicates are detected)
          if (op_uuid) updateObj.op_uuid = op_uuid;

          const query = supabase.from('packages').update(updateObj);
          if (identifier.op_uuid) query.eq('op_uuid', identifier.op_uuid);
          else query.eq('id', identifier.id);

          const { data: updated, error: updateErr } = await query.select('id');

          if (updateErr) {
            results.push({ op, op_uuid, status: 'failed', error: updateErr.message || String(updateErr) });
            continue;
          }

          // --- LOGGING ---
          await logActivity(
            'update_package', 
            `Updated Package ${identifier.op_uuid || identifier.id}`, 
            actor
          );

          results.push({ op, op_uuid, status: 'updated', package_id: updated?.[0]?.id ?? null });
          continue;
        }

        // DELETE
        if (op === 'delete') {
          const identifier = op_uuid ? { op_uuid } : (payload.id ? { id: payload.id } : null);
          if (!identifier) {
            results.push({ op, op_uuid, status: 'failed', error: 'Missing op_uuid or id for delete' });
            continue;
          }

          let delQuery = supabase.from('packages').delete();
          if (identifier.op_uuid) delQuery = delQuery.eq('op_uuid', identifier.op_uuid);
          else delQuery = delQuery.eq('id', identifier.id);

          const { error: delErr } = await delQuery;

          if (delErr) {
            results.push({ op, op_uuid, status: 'failed', error: delErr.message || String(delErr) });
            continue;
          }

          // --- LOGGING ---
          await logActivity(
            'delete_package', 
            `Deleted Package ${identifier.op_uuid || identifier.id}`, 
            actor
          );

          results.push({ op, op_uuid, status: 'deleted' });
          continue;
        }

        // unknown op
        results.push({ op: item.op, op_uuid, status: 'failed', error: 'Unknown operation' });
      } catch (err: any) {
        console.error('Error processing package bulk item:', err);
        results.push({ op: item.op, op_uuid, status: 'failed', error: err?.message || String(err) });
      }
    } // for

    return NextResponse.json({ ok: true, results });
  } catch (err: any) {
    console.error('packages bulk handler error:', err);
    return NextResponse.json({ error: err?.message || 'Unknown error' }, { status: 500 });
  }
}