// src/app/api/sales/route.ts
import { supabaseServer as supabase } from '@/lib/supabaseServer';
import { NextRequest, NextResponse } from 'next/server';

/**
 * GET: list sales (basic fields)
 * POST: bulk handler { bulk: [ { op, op_uuid, payload }, ... ] }
 */

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const outletId = searchParams.get('outletId') || null;

    const query = supabase
      .from('sales')
      .select('id, invoice_no, amount, date, outlet_id, customer_id, created_at')
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
    const body = await req.json().catch(() => ({}));
    const bulk = Array.isArray(body?.bulk) ? body.bulk : (Array.isArray(body) ? body : null);
    if (!bulk) return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });

    const results: any[] = [];

    for (const item of bulk) {
      const op = (item.op || 'create').toLowerCase();
      const op_uuid = item.op_uuid || item.payload?.op_uuid || null;
      const payload = item.payload || {};

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
          if (payload.invoiceNo !== undefined) updateObj.invoice_no = payload.invoiceNo;
          if (payload.amount !== undefined) updateObj.amount = payload.amount;
          if (payload.date !== undefined) updateObj.date = payload.date;
          if (payload.outlet_id !== undefined) updateObj.outlet_id = payload.outlet_id;
          if (payload.customer_id !== undefined) updateObj.customer_id = payload.customer_id;
          if (payload.meta !== undefined) updateObj.meta = payload.meta;
          if (op_uuid) updateObj.op_uuid = op_uuid;

          let query = supabase.from('sales').update(updateObj);
          if (identifier.op_uuid) query = query.eq('op_uuid', identifier.op_uuid);
          else query = query.eq('id', identifier.id);

          const { data: updated, error: updateErr } = await query.select('id');

          if (updateErr) {
            results.push({ op, op_uuid, status: 'failed', error: updateErr.message || String(updateErr) });
            continue;
          }

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
