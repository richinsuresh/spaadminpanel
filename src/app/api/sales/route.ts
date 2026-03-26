// src/app/api/sales/route.ts
import { supabaseServer as supabase } from '@/lib/supabaseServer';
import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers'; // <-- ADDED FOR SECURITY

/**
 * GET: list sales (basic fields)
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
    // --- ADDED SECURITY CHECK ---
    const cookieStore = await cookies();
    const authRole = cookieStore.get('auth_role')?.value;
    const adminSession = cookieStore.get('admin_session')?.value;
    
    // Basic check to ensure caller is an admin or outlet
    if (!authRole && adminSession !== 'true' && adminSession !== '1') {
      return NextResponse.json({ error: 'Unauthorized request' }, { status: 401 });
    }
    // -----------------------------

    const { searchParams } = new URL(req.url);
    const outletId = searchParams.get('outletId') || null;

    // Added 'meta' to select so you can see item details
    const query = supabase
      .from('sales')
      .select('id, invoice_no, amount, date, outlet_id, customer_id, meta, created_at')
      .order('created_at', { ascending: false });

    if (outletId) query.eq('outlet_id', outletId);

    const { data, error } = await query;

    if (error) throw error;
    return NextResponse.json(data || []);
  } catch (err: any) {
    console.error('Error fetching sales:', err);
    return NextResponse.json({ error: err?.message || 'Failed to fetch sales' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    // --- ADDED SECURITY CHECK ---
    const cookieStore = await cookies();
    const authRole = cookieStore.get('auth_role')?.value;
    const adminSession = cookieStore.get('admin_session')?.value;
    
    if (!authRole && adminSession !== 'true' && adminSession !== '1') {
      return NextResponse.json({ error: 'Unauthorized request' }, { status: 401 });
    }
    // -----------------------------

    const body = await req.json().catch(() => ({}));
    const bulk = Array.isArray(body?.bulk) ? body.bulk : (Array.isArray(body) ? body : null);
    if (!bulk) return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });

    const results: any[] = [];

    for (const item of bulk) {
      const op = (item.op || 'create').toLowerCase();
      const op_uuid = item.op_uuid || item.payload?.op_uuid || null;
      const payload = item.payload || {};
      
      // Determine "Who" did this. Prioritize explicit username, then outlet name/ID.
      const actor = payload.username || payload.outlet || payload.outletId || payload.outlet_id || 'API';

      try {
        // CREATE
        if (op === 'create') {
          if (op_uuid) {
            const { data: exists, error: existsErr } = await supabase
              .from('sales')
              .select('id')
              .eq('op_uuid', op_uuid)
              .limit(1)
              .maybeSingle();

            if (!existsErr && exists && (exists as any).id) {
              results.push({ op, op_uuid, status: 'skipped', reason: 'already_exists', sale_id: (exists as any).id });
              continue;
            }
          }

          const insertObj: any = {
            invoice_no: payload.invoiceNo ?? payload.invoice_no ?? null,
            amount: payload.amount ?? payload.total ?? 0,
            date: payload.date ?? new Date().toISOString(),
            outlet_id: payload.outlet_id ?? payload.outletId ?? null,
            customer_id: payload.customer_id ?? payload.customerId ?? null,
            meta: payload.meta ?? payload.items ?? null,
            op_uuid: op_uuid ?? null
          };

          const { data: inserted, error: insertErr } = await supabase
            .from('sales')
            .insert([insertObj])
            .select('id')
            .single();

          if (insertErr) {
            const lower = (insertErr.message || '').toLowerCase();
            if (op_uuid && (lower.includes('unique') || lower.includes('duplicate') || lower.includes('op_uuid'))) {
              const { data: existing2 } = await supabase
                .from('sales')
                .select('id')
                .eq('op_uuid', op_uuid)
                .limit(1)
                .maybeSingle();
              results.push({ op, op_uuid, status: 'skipped', reason: 'unique_violation', sale_id: existing2?.id ?? null });
            } else {
              results.push({ op, op_uuid, status: 'failed', error: insertErr.message || String(insertErr) });
            }
            continue;
          }

          // --- LOGGING ---
          await logActivity(
            'create_sale', 
            `Created Sale Invoice #${insertObj.invoice_no || 'Unknown'} (Amount: ${insertObj.amount})`, 
            actor
          );

          results.push({ op, op_uuid, status: 'created', sale_id: inserted?.id ?? null });
          continue;
        }

        // UPDATE
        if (op === 'update') {
          const identifier = op_uuid ? { op_uuid } : (payload.id ? { id: payload.id } : null);
          if (!identifier) {
            results.push({ op, op_uuid, status: 'failed', error: 'Missing op_uuid or id for update' });
            continue;
          }

          const updateObj: any = {};
          
          // Helper to get value from either casing
          const getVal = (k1: string, k2?: string) => {
             if (payload[k1] !== undefined) return payload[k1];
             if (k2 && payload[k2] !== undefined) return payload[k2];
             return undefined;
          };

          const inv = getVal('invoiceNo', 'invoice_no');
          if (inv !== undefined) updateObj.invoice_no = inv;

          const amt = getVal('amount', 'total');
          if (amt !== undefined) updateObj.amount = amt;

          const dt = getVal('date');
          if (dt !== undefined) updateObj.date = dt;

          const outId = getVal('outletId', 'outlet_id');
          if (outId !== undefined) updateObj.outlet_id = outId;

          const custId = getVal('customerId', 'customer_id');
          if (custId !== undefined) updateObj.customer_id = custId;

          const meta = getVal('meta', 'items');
          if (meta !== undefined) updateObj.meta = meta;

          if (op_uuid) updateObj.op_uuid = op_uuid;

          let query = supabase.from('sales').update(updateObj);
          if (identifier.op_uuid) query = query.eq('op_uuid', identifier.op_uuid);
          else query = query.eq('id', identifier.id);

          const { data: updated, error: updateErr } = await query.select('id');

          if (updateErr) {
            results.push({ op, op_uuid, status: 'failed', error: updateErr.message || String(updateErr) });
            continue;
          }

          // --- LOGGING ---
          await logActivity(
            'update_sale', 
            `Updated Sale ${identifier.op_uuid || identifier.id}`, 
            actor
          );

          results.push({ op, op_uuid, status: 'updated', sale_id: updated?.[0]?.id ?? null });
          continue;
        }

        // DELETE
        if (op === 'delete') {
          const identifier = op_uuid ? { op_uuid } : (payload.id ? { id: payload.id } : null);
          if (!identifier) {
            results.push({ op, op_uuid, status: 'failed', error: 'Missing op_uuid or id for delete' });
            continue;
          }

          let delQuery = supabase.from('sales').delete();
          if (identifier.op_uuid) delQuery = delQuery.eq('op_uuid', identifier.op_uuid);
          else delQuery = delQuery.eq('id', identifier.id);

          const { error: delErr } = await delQuery;
          if (delErr) {
            results.push({ op, op_uuid, status: 'failed', error: delErr.message || String(delErr) });
            continue;
          }

          // --- LOGGING ---
          await logActivity(
            'delete_sale', 
            `Deleted Sale ${identifier.op_uuid || identifier.id}`, 
            actor
          );

          results.push({ op, op_uuid, status: 'deleted' });
          continue;
        }

        results.push({ op: item.op, op_uuid, status: 'failed', error: 'Unknown operation' });
      } catch (err: any) {
        console.error('Error processing sale bulk item:', err);
        results.push({ op: item.op, op_uuid, status: 'failed', error: err?.message || String(err) });
      }
    } // for

    return NextResponse.json({ ok: true, results });
  } catch (err: any) {
    console.error('sales bulk handler error:', err);
    return NextResponse.json({ error: err?.message || 'Unknown error' }, { status: 500 });
  }
}