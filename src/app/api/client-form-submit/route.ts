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

    let razorpayOrderId: string | null = null;
    let razorpayOrder: any = null;
    
    // --- 1. SET CHECK-IN TIME ---
    // We set this to now. If online payment fails, this will be null.
    // We will update it to NOW() only if payment is cash/package/successful
    let checkInTime: string | null = null;

    if (paymentMethod === 'cash' || isPackageCustomer) {
      checkInTime = new Date().toISOString(); // Check-in happens now
    }
    
    // Create Razorpay order if needed (but don't set check-in time yet)
    if (paymentMethod === 'card' || paymentMethod === 'upi') {
      const rzp = new Razorpay({
        key_id: process.env.RZP_KEY_ID!,
        key_secret: process.env.RZP_KEY_SECRET!
      });

      razorpayOrder = await rzp.orders.create({
        amount: finalAmountInPaise,
        currency: 'INR',
        receipt: `session_${mobile}_${Date.now()}`,
        notes: { mobile, outlet }
      });
      razorpayOrderId = razorpayOrder.id;
      // checkInTime is still NULL here. It will be set by the client
      // on successful payment handler, or via webhook.
      // For simplicity, we will set it *after* payment success.
    }

    // --- 2. Save Customer Session ---
    const { data: customerSession, error: customerError } = await serviceSupabase
      .from('customers')
      .insert([{
        name, mobile, date, treatment,
        session_hours: sessionHours,
        took_package: tookPackage,
        package_amount: tookPackage ? packageAmount : 0,
        total_package_hours: tookPackage ? totalPackageHours : 0,
        outlet,
        amount_paid: finalAmountInPaise,
        razorpay_order_id: razorpayOrderId,
        payment_method: paymentMethod,
        check_in_time: checkInTime // <-- SETS CHECK-IN TIME (if cash/package)
      }])
      .select()
      .single();

    if (customerError) throw customerError;
    const newCustomerSessionId = customerSession.id;

    // --- 3. Handle Package Logic (No changes) ---
    if (tookPackage) {
      // ... (package logic remains the same)
      const expiry = new Date(date);
      expiry.setMonth(expiry.getMonth() + 2);
      await serviceSupabase.from('packages').upsert({ 
        mobile, name, package_amount: packageAmount,
        total_hours: totalPackageHours, remaining_hours: totalPackageHours, 
        start_date: date, expiry_date: expiry.toISOString().split('T')[0],
        outlet, used_hours: 0, status: 'active'
      }, { onConflict: 'mobile' });
    } else if (isPackageCustomer && sessionHours > 0) {
      // ... (package logic remains the same)
      const { data: pkg } = await serviceSupabase 
        .from('packages')
        .select('id, used_hours, total_hours, expiry_date') 
        .eq('mobile', mobile)
        .maybeSingle(); 
      if (pkg) { 
        const newUsed = (pkg.used_hours || 0) + (sessionHours || 0);
        const newRemaining = Math.max(0, (pkg.total_hours || 0) - newUsed); 
        const status = (newRemaining <= 0 || new Date() > new Date(pkg.expiry_date)) ? 'expired' : 'active';
        await serviceSupabase.from('packages')
          .update({ used_hours: newUsed, remaining_hours: newRemaining, status })
          .eq('id', pkg.id); 
      }
    }
    
    // --- 4. Handle Response ---
    if (paymentMethod === 'cash' || paymentMethod === 'package') {
      return NextResponse.json({ success: true, paymentMethod: paymentMethod });
    }

    if (paymentMethod === 'card' || paymentMethod === 'upi') {
      return NextResponse.json({
        success: true,
        paymentMethod: 'online',
        razorpayKey: process.env.RZP_KEY_ID,
        razorpayOrder: razorpayOrder,
        customer_session_id: newCustomerSessionId // <-- Send this back
      });
    }

    return NextResponse.json({ success: true, paymentMethod: 'unknown' });

  } catch (error: any) {
    console.error('Client form submit error:', error);
    return NextResponse.json({ 
        success: false, 
        error: `Failed to save data: ${error.message || 'Unknown DB error'}`
    }, { status: 500 });
  }
}