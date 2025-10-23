// src/app/api/submit/route.ts
import { NextRequest } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// Function to create a client that bypasses RLS for server-side writes
const createServiceRoleClient = () => {
    // IMPORTANT: Reads private server variables (not NEXT_PUBLIC_)
    const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '';
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY || ''; // Must use the Service Key

    if (!supabaseUrl || !supabaseServiceKey) {
        // We throw a detailed error here to help diagnose missing .env variables
        throw new Error('Supabase URL or Service Key missing in environment variables. Check .env.local.');
    }

    // Initialize client using the Service Role Key
    return createClient(supabaseUrl, supabaseServiceKey);
};


export async function POST(request: NextRequest) {
  let serviceSupabase;
  try {
    // 1. Initialize the Service Role Client
    serviceSupabase = createServiceRoleClient();
    const body = await request.json();
    
    if (!body.mobile || !body.name || !body.outlet) {
      return Response.json({ error: 'Missing required fields: mobile, name, or outlet.' }, { status: 400 });
    }

    // Save customer session 
    const { error: customerError } = await serviceSupabase // <-- Use serviceSupabase
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
        outlet: body.outlet
      }]);

    if (customerError) {
        console.error('Supabase Customer INSERT Error:', customerError);
        throw customerError;
    }

    // --- New Package Registration ---
    if (body.tookPackage) {
      const expiry = new Date(body.date);
      expiry.setMonth(expiry.getMonth() + 2);
      
      const { error: upsertError } = await serviceSupabase.from('packages').upsert({ // <-- Use serviceSupabase
        mobile: body.mobile,
        name: body.name,
        package_amount: body.packageAmount,
        total_hours: body.totalPackageHours,
        remaining_hours: body.totalPackageHours,
        start_date: body.date,
        expiry_date: expiry.toISOString().split('T')[0],
        outlet: body.outlet,
        used_hours: 0,
        status: 'active'
      }, { onConflict: 'mobile', ignoreDuplicates: false });
      
      if (upsertError) {
          console.error('Supabase Package UPSERT Error:', upsertError);
          throw upsertError;
      }
    } 
    // --- Existing Package Usage (Deducting Credits) ---
    else if (body.isPackageCustomer && body.sessionHours > 0) {
      // Get current package including its ID
      const { data: pkg, error: fetchError } = await serviceSupabase // <-- Use serviceSupabase
        .from('packages')
        .select('id, used_hours, total_hours, expiry_date') 
        .eq('mobile', body.mobile)
        .single();
        
      if (fetchError && fetchError.code !== 'PGRST116') {
          console.error('Package FETCH Error:', fetchError);
          throw fetchError;
      } else if (pkg) {
        const newUsed = (pkg.used_hours || 0) + body.sessionHours;
        const newRemaining = Math.max(0, pkg.total_hours - newUsed);
        
        const now = new Date();
        const expiry = new Date(pkg.expiry_date);
        const status = (newRemaining <= 0 || now > expiry) ? 'expired' : 'active';

        const { error: updateError } = await serviceSupabase // <-- Use serviceSupabase
          .from('packages')
          .update({
            used_hours: newUsed,
            remaining_hours: newRemaining,
            status
          })
          .eq('id', pkg.id); 

        if (updateError) {
            console.error('Supabase Package UPDATE Error:', updateError);
            throw updateError;
        }
      }
    }

    return Response.json({ success: true });
  } catch (error: any) {
    console.error('Submit failed:', error);
    // Return a detailed error message to the client
    return Response.json({ 
        error: `Failed to save or update data. Error: ${error.message || 'Unknown DB error'}`,
        db_code: error.code
    }, { status: 500 });
  }
}