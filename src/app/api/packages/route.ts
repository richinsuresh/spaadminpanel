// src/app/api/packages/route.ts
import { supabaseServer as supabase } from '@/lib/supabaseServer';
import { NextRequest, NextResponse } from 'next/server';

/**
 * GET: existing packages listing
 * POST: bulk handler { bulk: [ { op, op_uuid, payload }, ... ] }
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

          // Normalize inputs
          const totalHours = payload.totalHours ?? payload.total_hours ?? payload.totalPackageHours ?? null;
          const usedHours = payload.usedHours ?? payload.used_hours ?? 0;
          // Auto-calculate remaining if missing
          const remainingHours = payload.remainingHours ?? payload.remaining_hours ?? (totalHours !== null ? totalHours - usedHours : null);

          const insertObj: any = {
            name: payload.name,
            mobile: payload.mobile,
            package_amount: payload.packageAmount ?? payload.package_amount ?? 0,
            total_hours: totalHours,
            remaining_hours: remainingHours,
            used_hours: usedHours,
            expiry_date: payload.expiryDate ?? payload.expiry_date ?? null,
            // FORCE status to lowercase to avoid case-sensitivity lookup issues
            status: (payload.status ?? 'active').toLowerCase(),
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
          
          // Helper to check both camelCase and snake_case
          const getVal = (k1: string, k2?: string) => {
             if (payload[k1] !== undefined) return payload[k1];
             if (k2 && payload[k2] !== undefined) return payload[k2];
             return undefined;
          };

          const name = getVal('name');
          if (name !== undefined) updateObj.name = name;

          const mobile = getVal('mobile');
          if (mobile !== undefined) updateObj.mobile = mobile;

          const pAmt = getVal('packageAmount', 'package_amount');
          if (pAmt !== undefined) updateObj.package_amount = pAmt;

          const tHours = getVal('totalHours', 'total_hours');
          if (tHours !== undefined) updateObj.total_hours = tHours;

          const rHours = getVal('remainingHours', 'remaining_hours');
          if (rHours !== undefined) updateObj.remaining_hours = rHours;

          const uHours = getVal('usedHours', 'used_hours');
          if (uHours !== undefined) updateObj.used_hours = uHours;

          const expDate = getVal('expiryDate', 'expiry_date');
          if (expDate !== undefined) updateObj.expiry_date = expDate;

          const stat = getVal('status');
          if (stat !== undefined) updateObj.status = stat.toLowerCase(); // Ensure lowercase

          const pSoldBy = getVal('packageSoldBy', 'package_sold_by');
          if (pSoldBy !== undefined) updateObj.package_sold_by = pSoldBy;

          const payMethod = getVal('paymentMethod', 'payment_method');
          if (payMethod !== undefined) updateObj.payment_method = payMethod;

          const sDate = getVal('startDate', 'start_date');
          if (sDate !== undefined) updateObj.start_date = sDate;
          
          // Ensure op_uuid stored
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
