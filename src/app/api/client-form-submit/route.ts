import { supabaseServer as supabase } from '@/lib/supabaseServer';
import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  try {
    const payload = await req.json();

    // --- 1. HANDLE PACKAGE LOGIC *FIRST* ---

    // --- CASE A: CLIENT USED AN EXISTING PACKAGE ---
    if (payload.isPackageCustomer) {
      // ... (This section is correct, no changes needed)
      const hoursToDeduct = payload.sessionHours;
      const email = payload.clientEmail; 
      const otpCode = payload.otpCode;
      if (!hoursToDeduct || hoursToDeduct <= 0) { throw new Error('Session hours must be provided.'); }
      if (!otpCode) { throw new Error('OTP was not provided.'); }
      if (!email) { throw new Error('Client email not found.'); }
      
      const { data: verifyData, error: otpError } = await supabase.auth.verifyOtp({
        email: email,
        token: otpCode,
        type: 'email', 
      });
      if (otpError) { throw new Error('Invalid or expired OTP. Please try again.'); }
      
      const { data: activePackage, error: findError } = await supabase
        .from('packages')
        .select('id, remaining_hours, used_hours') 
        .eq('mobile', payload.mobile)
        .eq('status', 'active')
        .gt('remaining_hours', 0) 
        .order('created_at', { ascending: true }) 
        .limit(1)
        .single();
      if (findError || !activePackage) { throw new Error('No active package found for this client.'); }
      
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
      if (updateError) { throw new Error(`Error deducting package hours: ${updateError.message}`); }
    }
    
    // --- CASE B: CLIENT BOUGHT A NEW PACKAGE (via Admin Form) ---
    else if (payload.tookPackage) {
      
      // --- NEW: Create the Auth User First ---
      // We use 'supabase.auth.admin.createUser' because RLS is on
      const { data: authUser, error: authError } = await supabase.auth.admin.createUser({
        email: payload.email,
        // Using mobile as a temporary password; it will never be used.
        password: payload.mobile, 
        email_confirm: true // Mark email as confirmed since we're adding it
      });

      // If it's not a "User already exists" error, then fail.
      if (authError && !authError.message.includes('User already exists')) {
        console.error('Supabase auth create error:', authError);
        throw new Error(`Error creating auth user: ${authError.message}`);
      }
      // --- END OF NEW AUTH STEP ---

      const validityMonths = parseInt(payload.packageValidity || '3', 10);
      const expiryDate = new Date(payload.date);
      expiryDate.setMonth(expiryDate.getMonth() + validityMonths);
      
      const { error: newPackageError } = await supabase
        .from('packages')
        .insert({
          name: payload.name,
          mobile: payload.mobile,
          email: payload.email,
          total_hours: payload.totalPackageHours,
          remaining_hours: payload.totalPackageHours,
          start_date: payload.date, 
          expiry_date: expiryDate.toISOString(),
          status: 'active',
          outlet: payload.outlet, 
          sold_by: payload.packageSoldBy,
          package_amount: payload.packageAmount,
          used_hours: 0,
          package_validity: payload.packageValidity
        });
      
      if (newPackageError) {
        throw new Error(`Error creating new package: ${newPackageError.message}`);
      }
    }
    
    // --- 2. INSERT THE CLIENT SESSION (to 'customers' table) ---
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