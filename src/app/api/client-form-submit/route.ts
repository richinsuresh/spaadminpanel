import { supabaseServer as supabase } from '@/lib/supabaseServer';
import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  try {
    const payload = await req.json();

    // --- 1. INSERT THE CLIENT SESSION (to 'customers' table) ---
    // (This section is unchanged, it's fine)
    const { data: sessionData, error: sessionError } = await supabase
      .from('customers')
      .insert({
        name: payload.name,
        mobile: payload.mobile,
        date: payload.date,
        treatment: payload.treatment,
        amount_paid: payload.amountPaid, 
        session_hours: payload.sessionHours,
        is_package_customer: payload.isPackageCustomer,
        took_package: payload.tookPackage, 
        package_amount: payload.packageAmount,
        total_package_hours: payload.totalPackageHours,
        package_sold_by: payload.packageSoldBy,
        outlet_id: payload.outlet_id,
        outlet_name: payload.outlet, 
        payment_method: payload.paymentMethod,
        check_in_time: payload.check_in_time, 
      })
      .select('id')
      .single();

    if (sessionError) {
      console.error('Supabase session insert error:', sessionError);
      throw new Error(`Error saving session: ${sessionError.message}`);
    }

    const customerSessionId = sessionData.id;

    // --- 2. HANDLE PACKAGE LOGIC ---

    // --- CASE A: CLIENT BOUGHT A NEW PACKAGE (via Admin Form) ---
    if (payload.tookPackage) {
      // ... (This logic is for your admin form and is correct)
      const validityMonths = parseInt(payload.packageValidity || '3', 10);
      const expiryDate = new Date(payload.date);
      expiryDate.setMonth(expiryDate.getMonth() + validityMonths);
      
      const { error: newPackageError } = await supabase
        .from('packages')
        .insert({
          name: payload.name,
          mobile: payload.mobile,
          total_hours: payload.totalPackageHours,
          remaining_hours: payload.totalPackageHours,
          start_date: payload.date, 
          expiry_date: expiryDate.toISOString(),
          status: 'active',
          outlet: payload.outlet, 
          sold_by: payload.packageSoldBy,
          package_amount: payload.packageAmount,
          used_hours: 0 
        });
      
      if (newPackageError) {
        throw new Error(`Error creating new package: ${newPackageError.message}`);
      }
    }
    
    // --- CASE B: CLIENT USED AN EXISTING PACKAGE (via Client Form) ---
    else if (payload.isPackageCustomer) {
      const hoursToDeduct = payload.sessionHours;
      const fullMobile = `+91${payload.mobile}`;
      const otpCode = payload.otpCode;

      if (!hoursToDeduct || hoursToDeduct <= 0) {
        throw new Error('Session hours must be provided for package clients.');
      }
      
      // --- NEW: VERIFY OTP FIRST ---
      if (!otpCode) {
        throw new Error('OTP was not provided.');
      }

      const { data: verifyData, error: otpError } = await supabase.auth.verifyOtp({
        phone: fullMobile,
        token: otpCode,
        type: 'sms',
      });

      if (otpError || !verifyData || !verifyData.user) {
        throw new Error('Invalid or expired OTP. Please try again.');
      }
      // --- END OF OTP VERIFICATION ---

      // --- If OTP is valid, proceed to deduct hours ---
      const { data: activePackage, error: findError } = await supabase
        .from('packages')
        .select('id, remaining_hours, used_hours') 
        .eq('mobile', payload.mobile)
        .eq('status', 'active')
        .gt('remaining_hours', 0) 
        .order('created_at', { ascending: true }) 
        .limit(1)
        .single();

      if (findError || !activePackage) {
        throw new Error('No active package found for this client. Please sell them a new package.');
      }

      const currentRemaining = parseFloat(activePackage.remaining_hours as any || '0');
      const currentUsed = parseFloat(activePackage.used_hours as any || '0');
      
      const newRemainingHours = currentRemaining - hoursToDeduct;
      const newUsedHours = currentUsed + hoursToDeduct;
      const newStatus = newRemainingHours <= 0 ? 'expired' : 'active';

      const { error: updateError } = await supabase
        .from('packages')
        .update({
          remaining_hours: newRemainingHours < 0 ? 0 : newRemainingHours,
          used_hours: newUsedHours,
          status: newStatus,
        })
        .eq('id', activePackage.id);

      if (updateError) {
        throw new Error(`Error deducting package hours: ${updateError.message}`);
      }
    }

    // --- 3. RETURN SUCCESS RESPONSE ---
    if (payload.paymentMethod === 'card') {
      return NextResponse.json({
        success: true,
        paymentMethod: 'card',
        customer_session_id: customerSessionId,
        outlet_id: payload.outlet_id,
        finalAmountInPaise: payload.finalAmountInPaise
      });
    } else {
      return NextResponse.json({
        success: true,
        paymentMethod: payload.paymentMethod,
      });
    }

  } catch (err: any) {
    console.error('Submit API error:', err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}