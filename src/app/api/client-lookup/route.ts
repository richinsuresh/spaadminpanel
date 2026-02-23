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

    // Fetch ALL active packages ordered by created_at (FIFO)
    const { data: pkgs, error } = await supabase
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
      .order('created_at', { ascending: true });

    if (error) {
      console.error('Lookup error:', error);
      return Response.json(null);
    }

    if (!pkgs || pkgs.length === 0) return Response.json(null);

    // Aggregate totals across all active packages
    let totalPackageHours = 0;
    let usedPackageHours = 0;
    let remainingHours = 0;
    let latestExpiry = pkgs[0].expiry_date;

    for (const p of pkgs) {
        totalPackageHours += Number(p.total_hours);
        usedPackageHours += Number(p.used_hours);
        remainingHours += Number(p.remaining_hours);
        
        // Find the furthest expiry date to show to the customer
        if (p.expiry_date) {
            if (!latestExpiry) {
                latestExpiry = p.expiry_date;
            } else if (new Date(p.expiry_date) > new Date(latestExpiry)) {
                latestExpiry = p.expiry_date;
            }
        }
    }

    return Response.json({
      status: 'active',
      name: pkgs[0].name,
      mobile: pkgs[0].mobile,
      packageAmount: pkgs.reduce((sum, p) => sum + Number(p.package_amount), 0),
      totalPackageHours,
      usedPackageHours,
      remainingHours,
      expiryDate: latestExpiry,
      email: pkgs[0].email,
      packageId: pkgs[0].id, 
    });
  } catch (error) {
    console.error('Lookup error:', error);
    return Response.json(null);
  }
}