import { supabase } from '@/lib/supabase';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const mobile = searchParams.get('mobile')?.replace(/\D/g, '');

    if (!mobile) {
      return Response.json({ error: 'Mobile required' }, { status: 400 });
    }

    const { data: pkg, error } = await supabase
      .from('packages')
      .select('*') // select * will now include the new 'email' column
      .eq('mobile', mobile)
      .eq('status', 'active')
      .gt('remaining_hours', 0)
      .order('created_at', { ascending: true }) 
      .limit(1)
      .maybeSingle(); 

    if (error) {
      console.error('Lookup error:', error);
      return Response.json(null);
    }

    if (!pkg) return Response.json(null);

    return Response.json({
      status: pkg.status,
      name: pkg.name,
      mobile: pkg.mobile,
      packageAmount: pkg.package_amount,
      totalPackageHours: pkg.total_hours,
      usedPackageHours: pkg.used_hours,
      remainingHours: pkg.remaining_hours,
      expiryDate: pkg.expiry_date,
      email: pkg.email // --- NEW: Return the email
    });
  } catch (error) {
    console.error('Lookup error:', error);
    return Response.json(null);
  }
}