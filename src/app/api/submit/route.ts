// src/app/api/submit/route.ts
import { NextRequest, NextResponse } from 'next/server'; // Import NextResponse
import { createClient } from '@supabase/supabase-js';

// Function to create a client that bypasses RLS for server-side writes
const createServiceRoleClient = () => {
    const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '';
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY || ''; 

    if (!supabaseUrl || !supabaseServiceKey) {
        throw new Error('Supabase URL or Service Key missing in environment variables. Check .env.local.');
    }
    return createClient(supabaseUrl, supabaseServiceKey);
};


export async function POST(request: NextRequest) {
  let serviceSupabase;
  try {
    serviceSupabase = createServiceRoleClient();
    const body = await request.json();
    
    if (!body.mobile || !body.name || !body.outlet) {
      return NextResponse.json({ error: 'Missing required fields: mobile, name, or outlet.' }, { status: 400 });
    }
    if (body.isPackageCustomer && body.sessionHours <= 0) {
        return NextResponse.json({ error: 'Session hours must be greater than 0 when using a package.'}, { status: 400 });
    }

    // Save customer session 
    const { error: customerError } = await serviceSupabase 
      .from('customers')
      .insert([{
        name: body.name,
        mobile: body.mobile, 
        date: body.date,
        treatment: body.treatment,
        session_hours: body.sessionHours,
        took_package: body.tookPackage,
        package_amount: body.packageAmount,
        total_package_hours: body.totalPackageHours,
        outlet: body.outlet,
        // --- CONFIRMING COLUMN NAME ---
        amount_paid: body.amountPaid // Using snake_case for the database column
        // --- END CONFIRMATION ---
      }]);

    if (customerError) {
        console.error('Supabase Customer INSERT Error:', customerError);
        throw customerError; 
    }

    // --- Package Logic (New or Existing) ---
    if (body.tookPackage) { 
      // ... (New package logic remains the same)
      const expiry = new Date(body.date);
      expiry.setMonth(expiry.getMonth() + 2);
      
      const { error: upsertError } = await serviceSupabase.from('packages').upsert({ 
        mobile: body.mobile, name: body.name, package_amount: body.packageAmount,
        total_hours: body.totalPackageHours, remaining_hours: body.totalPackageHours, 
        start_date: body.date, expiry_date: expiry.toISOString().split('T')[0],
        outlet: body.outlet, used_hours: 0, status: 'active'
      }, { onConflict: 'mobile', ignoreDuplicates: false });
      
      if (upsertError) {
          console.error('Supabase Package UPSERT Error:', upsertError);
          throw upsertError; 
      }
    } 
    else if (body.isPackageCustomer && body.sessionHours > 0) {
      // ... (Existing package update logic remains the same)
       const { data: pkg, error: fetchError } = await serviceSupabase 
        .from('packages')
        .select('id, used_hours, total_hours, expiry_date') 
        .eq('mobile', body.mobile)
        .maybeSingle(); 
        
      if (fetchError) { 
          console.error('Package FETCH Error:', fetchError);
          throw fetchError; 
      } 
      
      if (pkg) { 
        const currentUsedHours = pkg.used_hours || 0;
        const sessionHoursUsed = body.sessionHours || 0;
        const newUsed = currentUsedHours + sessionHoursUsed;
        const totalHours = pkg.total_hours || 0;
        const newRemaining = Math.max(0, totalHours - newUsed); 
        
        const now = new Date();
        const expiry = new Date(pkg.expiry_date);
        const status = (newRemaining <= 0 || now > expiry) ? 'expired' : 'active';

        const { error: updateError } = await serviceSupabase 
          .from('packages')
          .update({
            used_hours: newUsed,
            remaining_hours: newRemaining,
            status: status
          })
          .eq('id', pkg.id); 

        if (updateError) {
            console.error('Supabase Package UPDATE Error:', updateError);
            throw updateError; 
        }
      } else {
          console.warn(`No active package found for mobile ${body.mobile}. Cannot deduct hours.`);
      }
    }

    return NextResponse.json({ success: true });

  } catch (error: any) {
    console.error('Submit failed:', error);
    return NextResponse.json({ 
        error: `Failed to save or update data. Error: ${error.message || 'Unknown DB error'}`,
        db_code: error.code 
    }, { status: 500 });
  }
}