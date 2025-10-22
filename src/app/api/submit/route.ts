// src/app/api/submit/route.ts
import { NextRequest } from 'next/server';
import { supabase } from '@/lib/supabase';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // Save customer session (Now guaranteed to include mobile)
    const { error: customerError } = await supabase
      .from('customers')
      .insert([{
        name: body.name,
        mobile: body.mobile, // This field is now correctly populated from the client
        date: body.date,
        treatment: body.treatment,
        session_hours: body.sessionHours,
        took_package: body.tookPackage,
        package_amount: body.packageAmount,
        total_package_hours: body.totalPackageHours,
        outlet: body.outlet
      }]);

    if (customerError) throw customerError;

    // Handle package logic (New Package or Existing Customer using credits)
    
    // --- New Package Registration ---
    if (body.tookPackage) {
      const expiry = new Date(body.date);
      expiry.setMonth(expiry.getMonth() + 2); // Assuming 2 month expiry
      
      const { error: upsertError } = await supabase.from('packages').upsert({
        mobile: body.mobile,
        name: body.name,
        package_amount: body.packageAmount,
        total_hours: body.totalPackageHours,
        remaining_hours: body.totalPackageHours,
        start_date: body.date,
        expiry_date: expiry.toISOString().split('T')[0],
        outlet: body.outlet,
        used_hours: 0, // Ensure this is initialized
        status: 'active' // Ensure status is set
      }, { onConflict: 'mobile' });
      
      if (upsertError) throw upsertError;
    } 
    // --- Existing Package Usage (Deducting Credits) ---
    else if (body.isPackageCustomer && body.sessionHours > 0) {
      // Get current package including its ID (Crucial for update robustness)
      const { data: pkg, error: fetchError } = await supabase
        .from('packages')
        .select('id, used_hours, total_hours, expiry_date') // Ensure ID is selected
        .eq('mobile', body.mobile)
        .single();
        
      if (fetchError) {
          // If the package doesn't exist, simply log and continue (no package to update)
          console.warn(`Package not found for mobile: ${body.mobile}. Skipping usage update.`);
      } else if (pkg) {
        const newUsed = (pkg.used_hours || 0) + body.sessionHours;
        const newRemaining = Math.max(0, pkg.total_hours - newUsed);
        
        // Determine status
        const now = new Date();
        const expiry = new Date(pkg.expiry_date);
        const status = (newRemaining <= 0 || now > expiry) ? 'expired' : 'active';

        // Update the package using the primary key ID
        const { error: updateError } = await supabase
          .from('packages')
          .update({
            used_hours: newUsed,
            remaining_hours: newRemaining,
            status
          })
          .eq('id', pkg.id); // Use ID for update

        if (updateError) throw updateError;
      }
    }

    return Response.json({ success: true });
  } catch (error) {
    console.error('Submit error:', error);
    // Return a 500 error if any operation failed
    return Response.json({ error: 'Failed to save or update data' }, { status: 500 });
  }
}