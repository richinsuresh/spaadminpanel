// src/app/api/client-lookup/route.ts
import { supabase } from '@/lib/supabase';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const mobileRaw = searchParams.get('mobile');

    if (!mobileRaw) {
      return Response.json({ error: 'Mobile required' }, { status: 400 });
    }

    const mobile = mobileRaw.replace(/\D/g, '');

    const { data: pkg, error } = await supabase
      .from('packages')
      .select(
        `
          id,
          name,
          mobile,
          package_amount,
          total_hours,
          used_hours,
          remaining_hours,
          expiry_date,
          status,
          email
        `
      )
      .eq('mobile', mobile)
      .eq('status', 'active')
      .gt('remaining_hours', 0)
      // ✅ FIX: Prioritize OLDEST active package first (FIFO)
      .order('created_at', { ascending: true }) 
      .limit(1)
      .maybeSingle();

    if (error) {
      console.error('Lookup error:', error);
      // keep old behavior: don't crash form, just return null
      return Response.json(null);
    }

    if (!pkg) return Response.json(null);

    return Response.json({
      status: pkg.status === 'active' ? 'active' : 'expired',
      name: pkg.name,
      mobile: pkg.mobile,
      packageAmount: pkg.package_amount,
      totalPackageHours: pkg.total_hours,
      usedPackageHours: pkg.used_hours,
      remainingHours: pkg.remaining_hours,
      expiryDate: pkg.expiry_date,
      email: pkg.email,
      // 🔑 NEW: expose the package row id so client-form can send it to /client-form-submit
      packageId: pkg.id,
    });
  } catch (error) {
    console.error('Lookup error:', error);
    return Response.json(null);
  }
}