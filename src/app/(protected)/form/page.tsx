// src/app/api/submit/route.ts
import { NextRequest, NextResponse } from 'next/server'; // Import NextResponse
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
    
    // Basic validation
    if (!body.mobile || !body.name || !body.outlet) {
      return NextResponse.json({ error: 'Missing required fields: mobile, name, or outlet.' }, { status: 400 });
    }
    if (body.isPackageCustomer && body.sessionHours <= 0) {
        return NextResponse.json({ error: 'Session hours must be greater than 0 when using a package.'}, { status: 400 });
    }


    // Save customer session (includes amount_paid logic)
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
        outlet: body.outlet,
        amount_paid: body.amountPaid // Ensure amountPaid is saved
      }]);

    if (customerError) {
        console.error('Supabase Customer INSERT Error:', customerError);
        throw customerError; // Throw to trigger catch block
    }

    // --- New Package Registration ---
    if (body.tookPackage) {
      const expiry = new Date(body.date);
      expiry.setMonth(expiry.getMonth() + 2); // Assuming 2-month expiry
      
      // Upsert package details
      const { error: upsertError } = await serviceSupabase.from('packages').upsert({ // <-- Use serviceSupabase
        mobile: body.mobile,
        name: body.name,
        package_amount: body.packageAmount,
        total_hours: body.totalPackageHours,
        remaining_hours: body.totalPackageHours, // Initially remaining = total
        start_date: body.date,
        expiry_date: expiry.toISOString().split('T')[0],
        outlet: body.outlet,
        used_hours: 0, // Initialize used_hours to 0 for new packages
        status: 'active' // Set status to active
      }, { onConflict: 'mobile', ignoreDuplicates: false }); // Use mobile as conflict target
      
      if (upsertError) {
          console.error('Supabase Package UPSERT Error:', upsertError);
          throw upsertError; // Throw to trigger catch block
      }
    } 
    // --- Existing Package Usage (Deducting Credits) ---
    else if (body.isPackageCustomer && body.sessionHours > 0) {
      // Get current package including its ID
      const { data: pkg, error: fetchError } = await serviceSupabase // <-- Use serviceSupabase
        .from('packages')
        .select('id, used_hours, total_hours, expiry_date') 
        .eq('mobile', body.mobile)
        .maybeSingle(); // Use maybeSingle to handle null gracefully if no package found
        
      if (fetchError) { // Handle errors other than 'not found'
          console.error('Package FETCH Error:', fetchError);
          throw fetchError; // Throw to trigger catch block
      } 
      
      if (pkg) { // Only proceed if a package was found
        // Calculate new used and remaining hours
        const currentUsedHours = pkg.used_hours || 0;
        const sessionHoursUsed = body.sessionHours || 0;
        const newUsed = currentUsedHours + sessionHoursUsed;
        const totalHours = pkg.total_hours || 0;
        const newRemaining = Math.max(0, totalHours - newUsed); // Ensure remaining doesn't go below 0
        
        // Determine status based on remaining hours and expiry date
        const now = new Date();
        const expiry = new Date(pkg.expiry_date);
        const status = (newRemaining <= 0 || now > expiry) ? 'expired' : 'active';

        // Update the package using its primary key ID
        const { error: updateError } = await serviceSupabase // <-- Use serviceSupabase
          .from('packages')
          .update({
            used_hours: newUsed,
            remaining_hours: newRemaining,
            status: status
          })
          .eq('id', pkg.id); // Update using the specific package ID

        if (updateError) {
            console.error('Supabase Package UPDATE Error:', updateError);
            throw updateError; // Throw to trigger catch block
        }
      } else {
          // Log if no package found, but don't throw error - customer entry still saved
          console.warn(`No active package found for mobile ${body.mobile}. Cannot deduct hours.`);
      }
    }

    // If all operations successful
    return NextResponse.json({ success: true });

  } catch (error: any) {
    console.error('Submit failed:', error);
    // Return a detailed error message to the client for immediate debugging
    return NextResponse.json({ 
        error: `Failed to save or update data. Error: ${error.message || 'Unknown DB error'}`,
        db_code: error.code // Include database error code if available
    }, { status: 500 });
  }
}