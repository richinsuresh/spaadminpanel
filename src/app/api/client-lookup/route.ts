// src/app/api/client-lookup/route.ts
import { supabase } from '@/lib/supabase';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const mobile = searchParams.get('mobile')?.replace(/\D/g, '');

    if (!mobile) {
      return Response.json({ error: 'Mobile required' }, { status: 400 });
    }

    const { data: pkg } = await supabase
      .from('packages')
      .select('*')
      .eq('mobile', mobile)
      .single();

    if (!pkg) return Response.json(null);

    return Response.json({
      status: pkg.status,
      name: pkg.name,
      mobile: pkg.mobile,
      packageAmount: pkg.package_amount,
      totalPackageHours: pkg.total_hours,
      usedPackageHours: pkg.used_hours,
      remainingHours: pkg.remaining_hours,
      expiryDate: pkg.expiry_date
    });
  } catch (error) {
    console.error('Lookup error:', error);
    return Response.json(null);
  }
}