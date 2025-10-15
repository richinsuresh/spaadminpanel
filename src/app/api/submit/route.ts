// src/app/api/submit/route.ts
import { supabase } from '@/lib/supabase';
import { type NextRequest } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // Save customer session
    const { error: customerError } = await supabase
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

    if (customerError) throw customerError;

    // Handle package logic
    if (body.tookPackage) {
      const expiry = new Date(body.date);
      expiry.setMonth(expiry.getMonth() + 2);
      
      await supabase.from('packages').upsert({
        mobile: body.mobile,
        name: body.name,
        package_amount: body.packageAmount,
        total_hours: body.totalPackageHours,
        remaining_hours: body.totalPackageHours,
        start_date: body.date,
        expiry_date: expiry.toISOString().split('T')[0],
        outlet: body.outlet
      }, { onConflict: 'mobile' });
    } 
    else if (body.isPackageCustomer) {
      // Get current package
      const { data: pkg } = await supabase
        .from('packages')
        .select('*')
        .eq('mobile', body.mobile)
        .single();

      if (pkg) {
        const newUsed = pkg.used_hours + body.sessionHours;
        const newRemaining = Math.max(0, pkg.total_hours - newUsed);
        const now = new Date();
        const expiry = new Date(pkg.expiry_date);
        const status = (newRemaining <= 0 || now > expiry) ? 'expired' : 'active';

        await supabase
          .from('packages')
          .update({
            used_hours: newUsed,
            remaining_hours: newRemaining,
            status
          })
          .eq('mobile', body.mobile);
      }
    }

    return Response.json({ success: true });
  } catch (error) {
    console.error('Submit error:', error);
    return Response.json({ error: 'Failed to save' }, { status: 500 });
  }
}