// src/app/api/customers/route.ts
// Removing 'fs/promises', 'xlsx', and 'path' dependencies, relying solely on Supabase.
import { supabase } from '@/lib/supabase';
import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const mobile = searchParams.get('mobile')?.replace(/\D/g, '');

    // --- Lookup by Mobile (for client form usage) ---
    if (mobile) {
      // Fetch the latest package information directly from the 'packages' table
      const { data: pkg, error: pkgError } = await supabase
        .from('packages')
        .select('*')
        .eq('mobile', mobile)
        .single();

      if (pkgError && pkgError.code !== 'PGRST116') {
         // PGRST116 means 'No rows found', which is fine. Other errors are not.
         console.error('Package lookup error:', pkgError);
      }

      if (pkg) {
        // Return structured data about the client's current package status
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
      
      // If no active package, return null (handled correctly by client-lookup logic)
      return NextResponse.json(null);
    }

    // --- Return All Customers (for dashboard display) ---
    const { data: customers, error: customersError } = await supabase
      .from('customers')
      // Fetch all customer session records
      .select('id, name, mobile, date, treatment, session_hours, took_package, package_amount, total_package_hours, outlet, amount_paid')
      .order('date', { ascending: false }); // Sort by latest visit

    if (customersError) throw customersError;

    // Return the list of customer sessions
    return NextResponse.json(customers || []);

  } catch (error) {
    console.error('Error fetching customers from Supabase:', error);
    // Respond with empty array on generic failure
    return NextResponse.json([], { status: 500 });
  }
}
