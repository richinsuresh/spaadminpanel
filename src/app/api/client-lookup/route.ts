// src/app/api/client-lookup/route.ts
import { supabase } from '@/lib/supabase';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const mobile = searchParams.get('mobile')?.replace(/\D/g, '');

    if (!mobile) {
      return Response.json({ error: 'Mobile required' }, { status: 400 });
    }

    // --- THIS IS THE FIX ---
    // We now look for a package that is 'active', has hours left,
    // and use the oldest one first. .single() is removed.
    const { data: pkg, error } = await supabase
      .from('packages')
      .select('*')
      .eq('mobile', mobile)
      .eq('status', 'active')
      .gt('remaining_hours', 0)
      .order('created_at', { ascending: true }) // Use oldest active package first
      .limit(1)
      .maybeSingle(); // Use maybeSingle() to return null instead of an error

    if (error) {
      console.error('Lookup error:', error);
      return Response.json(null);
    }
    // --- END OF FIX ---

    if (!pkg) return Response.json(null);

    return Response.json({
      status: pkg.status,
      name: pkg.name, // 'name' column is correct
      mobile: pkg.mobile,
      packageAmount: pkg.package_amount,
      totalPackageHours: pkg.total_hours, // 'total_hours' is correct
      usedPackageHours: pkg.used_hours, // 'used_hours' is correct
      remainingHours: pkg.remaining_hours,
      expiryDate: pkg.expiry_date
    });
  } catch (error) {
    console.error('Lookup error:', error);
    return Response.json(null);
  }
}