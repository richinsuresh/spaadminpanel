// src/app/api/customers/route.ts
import { supabaseServer as supabase } from '@/lib/supabaseServer'; // Changed to supabaseServer for better permissions
import { NextRequest, NextResponse } from 'next/server';

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

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const mobile = searchParams.get('mobile')?.replace(/\D/g, '');

    // Lookup by Mobile (for client form usage)
    if (mobile) {
      const { data: pkg } = await supabase
        .from('packages')
        .select('*')
        .eq('mobile', mobile)
        .eq('status', 'active')
        .gt('remaining_hours', 0)
        .order('expiry_date', { ascending: false })
        .limit(1)
        .maybeSingle();

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
          id: pkg.id
        });
      }
      return NextResponse.json(null);
    }

    // Return All Customers
    const { data: customers, error } = await supabase
      .from('customers')
      .select('id, name, mobile, date, treatment, session_hours, took_package, package_amount, total_package_hours, outlet, amount_paid, client_uuid')
      .order('date', { ascending: false });

    if (error) throw error;
    return NextResponse.json(customers || []);
  } catch (error) {
    console.error('Error fetching customers:', error);
    return NextResponse.json([], { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const bulk = Array.isArray(body?.bulk) ? body.bulk : (Array.isArray(body) ? body : null);

    if (!bulk) return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });

    const results: Array<any> = [];

    for (const item of bulk) {
      const op = (item.op || 'create').toLowerCase();
      const client_uuid = item.client_uuid || item.payload?.client_uuid || null;
      const payload = item.payload || {};
      const actor = payload.username || payload.outlet || payload.outlet_id || 'API';

      try {
        // --- CREATE ---
        if (op === 'create') {
          if (client_uuid) {
            const { data: existing } = await supabase
              .from('customers')
              .select('id')
              .eq('client_uuid', client_uuid)
              .maybeSingle();

            if (existing) {
              results.push({ op, client_uuid, status: 'skipped', reason: 'already_exists', customer_id: existing.id });
              continue;
            }
          }

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
            room: payload.room,
            client_uuid: client_uuid || null,
          };

          const { data: inserted, error: insertErr } = await supabase
            .from('customers')
            .insert([insertObj])
            .select('id')
            .single();

          if (insertErr) {
             results.push({ op, client_uuid, status: 'failed', error: insertErr.message });
             continue;
          }

          await logActivity('create_customer', `Created Customer ${insertObj.name}`, actor);
          results.push({ op, client_uuid, status: 'created', customer_id: inserted?.id });
          continue;
        }

        // --- UPDATE ---
        if (op === 'update') {
          if (!client_uuid) {
            results.push({ op, status: 'failed', error: 'Missing client_uuid' });
            continue;
          }

          // 1. Fetch OLD Data (To check if we need to sync packages)
          const { data: oldCustomer } = await supabase
            .from('customers')
            .select('mobile, name, date, took_package')
            .eq('client_uuid', client_uuid)
            .single();

          // 2. Perform Update
          const updateObj: any = {};
          if (payload.name !== undefined) updateObj.name = payload.name;
          if (payload.mobile !== undefined) updateObj.mobile = payload.mobile;
          if (payload.date !== undefined) updateObj.date = payload.date;
          if (payload.amountPaid !== undefined) updateObj.amount_paid = payload.amountPaid;
          if (payload.sessionHours !== undefined) updateObj.session_hours = payload.sessionHours;
          if (payload.therapist_name !== undefined) updateObj.therapist_name = payload.therapist_name;
          if (payload.room !== undefined) updateObj.room = payload.room;
          
          // ... add other fields as needed

          const { error: updateErr, data: updated } = await supabase
            .from('customers')
            .update(updateObj)
            .eq('client_uuid', client_uuid)
            .select('id');

          if (updateErr) {
            results.push({ op, client_uuid, status: 'failed', error: updateErr.message });
            continue;
          }

          // 3. SYNC PACKAGES (If name/mobile changed and they took a package)
          if (oldCustomer && oldCustomer.took_package) {
             const newMobile = payload.mobile;
             const newName = payload.name;
             
             // Check if data actually changed
             if ((newMobile && newMobile !== oldCustomer.mobile) || (newName && newName !== oldCustomer.name)) {
                
                const pkgUpdate: any = {};
                if (newMobile) pkgUpdate.mobile = newMobile;
                if (newName) pkgUpdate.name = newName;

                console.log(`Syncing package details for ${oldCustomer.name} -> ${newName || oldCustomer.name}`);

                // Update the package that matches the OLD details and the creation date
                await supabase
                   .from('packages')
                   .update(pkgUpdate)
                   .eq('mobile', oldCustomer.mobile)
                   .eq('name', oldCustomer.name)
                   .eq('start_date', oldCustomer.date); // Safety check: only update package created on that day
             }
          }

          await logActivity('update_customer', `Updated Customer ${client_uuid}`, actor);
          results.push({ op, client_uuid, status: 'updated', customer_id: updated?.[0]?.id });
          continue;
        }

        if (op === 'delete') {
           // Delete logic unchanged...
           const { error: deleteErr } = await supabase.from('customers').delete().eq('client_uuid', client_uuid);
           if (deleteErr) {
             results.push({ op, client_uuid, status: 'failed', error: deleteErr.message });
           } else {
             results.push({ op, client_uuid, status: 'deleted' });
           }
           continue;
        }

        results.push({ op, status: 'failed', error: 'Unknown op' });
      } catch (err: any) {
        console.error('Error processing bulk item:', err);
        results.push({ op: item.op, status: 'failed', error: err.message });
      }
    }

    return NextResponse.json({ ok: true, results });
  } catch (err: any) {
    console.error('API Error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}