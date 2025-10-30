// src/app/api/client-form-submit/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import Razorpay from 'razorpay';

// Create a Supabase client with the SERVICE_ROLE_KEY to bypass RLS
const createServiceRoleClient = () => {
  const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY || ''; 

  if (!supabaseUrl || !supabaseServiceKey) {
    throw new Error('Supabase URL or Service Key missing.');
  }
  return createClient(supabaseUrl, supabaseServiceKey);
};

export async function POST(request: NextRequest) {
  const serviceSupabase = createServiceRoleClient();
  const body = await request.json();

  try {
    const {
      name, mobile, date, treatment, sessionHours,
      isPackageCustomer, tookPackage, packageAmount, totalPackageHours,
      outlet, outlet_id, paymentMethod, finalAmountInPaise
    } = body;

    if (!mobile || !name || !outlet || !treatment) {
      return NextResponse.json({ success: false, error: 'Missing required fields.' }, { status: 400 });
    }

    // --- 1. Save Customer Session & Package Logic (from api/submit/route.ts) ---
    
    // 1a. Save the customer session
    const { data: customerSession, error: customerError } = await serviceSupabase
      .from('customers')
      .insert([{
        name, mobile, date, treatment,
        session_hours: sessionHours,
        took_package: tookPackage,
        package_amount: tookPackage ? packageAmount : 0,
        total_package_hours: tookPackage ? totalPackageHours : 0,
        outlet,
        amount_paid: (isPackageCustomer || tookPackage) ? 0 : finalAmountInPaise,
        // We'll add the Razorpay order ID later if needed
      }])
      .select()
      .single();

    if (customerError) throw customerError;

    const newCustomerSessionId = customerSession.id;

    // 1b. Handle package logic
    if (tookPackage) {
      // Create or update a package
      const expiry = new Date(date);
      expiry.setMonth(expiry.getMonth() + 2);
      
      const { error: upsertError } = await serviceSupabase.from('packages').upsert({ 
        mobile, name, package_amount: packageAmount,
        total_hours: totalPackageHours, remaining_hours: totalPackageHours, 
        start_date: date, expiry_date: expiry.toISOString().split('T')[0],
        outlet, used_hours: 0, status: 'active'
      }, { onConflict: 'mobile' });
      
      if (upsertError) throw upsertError;

    } else if (isPackageCustomer && sessionHours > 0) {
      // Deduct from existing package
      const { data: pkg, error: fetchError } = await serviceSupabase 
        .from('packages')
        .select('id, used_hours, total_hours, expiry_date') 
        .eq('mobile', mobile)
        .maybeSingle(); 
        
      if (fetchError) throw fetchError; 
      
      if (pkg) { 
        const newUsed = (pkg.used_hours || 0) + (sessionHours || 0);
        const newRemaining = Math.max(0, (pkg.total_hours || 0) - newUsed); 
        const status = (newRemaining <= 0 || new Date() > new Date(pkg.expiry_date)) ? 'expired' : 'active';

        await serviceSupabase.from('packages')
          .update({ used_hours: newUsed, remaining_hours: newRemaining, status })
          .eq('id', pkg.id); 
      }
    }
    
    // --- 2. Handle Payment Logic ---
    
    if (paymentMethod === 'cash') {
      // If payment is cash, create a notification
      const { error: cashError } = await serviceSupabase
        .from('cash_notifications')
        .insert([{
          outlet_id,
          customer_name: name,
          mobile,
          treatment,
          amount: finalAmountInPaise, // Amount in paise
          status: 'pending'
        }]);

      if (cashError) throw cashError;
      
      return NextResponse.json({ success: true, paymentMethod: 'cash' });
    }

    if (paymentMethod === 'card' || paymentMethod === 'upi') {
      // If online, create Razorpay order (from api/create-order/route.ts)
      
      const rzp = new Razorpay({
        key_id: process.env.RZP_KEY_ID!,
        key_secret: process.env.RZP_KEY_SECRET!
      });

      const order = await rzp.orders.create({
        amount: finalAmountInPaise,
        currency: 'INR',
        receipt: `session_${newCustomerSessionId}`,
        notes: { customer_session_id: newCustomerSessionId, outlet }
      });

      // Link the order ID to the customer session for reconciliation
      await serviceSupabase
        .from('customers')
        .update({ razorpay_order_id: order.id })
        .eq('id', newCustomerSessionId);

      return NextResponse.json({
        success: true,
        paymentMethod: 'online',
        razorpayKey: process.env.RZP_KEY_ID,
        razorpayOrder: order
      });
    }

    // If 'isPackageCustomer' is true, there's no payment, just return success
    return NextResponse.json({ success: true, paymentMethod: 'package' });

  } catch (error: any) {
    console.error('Client form submit error:', error);
    return NextResponse.json({ 
        success: false, 
        error: `Failed to save data: ${error.message || 'Unknown DB error'}`
    }, { status: 500 });
  }
}