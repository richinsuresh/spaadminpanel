import { supabase } from '@/lib/supabase';
import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  try {
    const payload = await req.json();

    // --- 1. INSERT THE CLIENT SESSION (to 'customers' table) ---
    // This part is simplified, no new package fields
    const { data: sessionData, error: sessionError } = await supabase
      .from('customers')
      .insert({
        name: payload.name,
        mobile: payload.mobile,
        date: payload.date,
        treatment: payload.treatment,
        amount_paid: payload.amountPaid,
        session_hours: payload.sessionHours,
        
        // Package tracking fields
        is_package_customer: payload.isPackageCustomer,
        took_package: false, // Hardcoded to false
        package_amount: 0,
        total_package_hours: 0,
        package_sold_by: null,
        
        // Outlet and payment fields
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

    // --- CASE A: REMOVED (No longer creating packages here) ---
    
    // --- CASE B: CLIENT USED AN EXISTING PACKAGE ---
    if (payload.isPackageCustomer) {
      const hoursToDeduct = payload.sessionHours;

      if (!hoursToDeduct || hoursToDeduct <= 0) {
        throw new Error('Session hours must be provided for package clients.');
      }

      // Find the client's active package
      const { data: activePackage, error: findError } = await supabase
        .from('packages')
        .select('id, remaining_hours')
        .eq('mobile', payload.mobile)
        .eq('status', 'active')
        .gt('remaining_hours', 0) 
        .order('created_at', { ascending: true }) 
        .limit(1)
        .single();

      if (findError || !activePackage) {
        throw new Error('No active package found for this client.');
      }

      // Calculate new hours and status
      const currentRemaining = parseFloat(activePackage.remaining_hours as any || '0');
      const newRemainingHours = currentRemaining - hoursToDeduct;
      const newStatus = newRemainingHours <= 0 ? 'expired' : 'active';

      // Update the package
      const { error: updateError } = await supabase
        .from('packages')
        .update({
          remaining_hours: newRemainingHours < 0 ? 0 : newRemainingHours,
          status: newStatus,
        })
        .eq('id', activePackage.id);

      if (updateError) {
        console.error('Supabase package update error:', updateError);
        throw new Error(`Error deducting package hours: ${updateError.message}`);
      }
    }

    // --- 3. RETURN SUCCESS RESPONSE ---
    
    if (payload.paymentMethod === 'card') {
      // UPI payment
      return NextResponse.json({
        success: true,
        paymentMethod: 'card',
        customer_session_id: customerSessionId,
        outlet_id: payload.outlet_id,
        finalAmountInPaise: payload.finalAmountInPaise
      });
    } else {
      // Cash or Package payment
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