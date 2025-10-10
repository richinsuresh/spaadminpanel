// src/app/api/submit/route.ts
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { type NextRequest } from 'next/server';

export async function POST(request: NextRequest) {
  const supabase = createRouteHandlerClient({ cookies });
  const body = await request.json();

  // Save customer session
  const { error: customerError } = await supabase
    .from('customers')
    .insert([body]);

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
    // Deduct hours
    await supabase.rpc('deduct_package_hours', {
      p_mobile: body.mobile,
      p_hours: body.sessionHours
    });
  }

  if (customerError) return Response.json({ error: 'Failed' }, { status: 500 });
  return Response.json({ success: true });
}