import { supabase } from '@/lib/supabase';
import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  try {
    const payload = await req.json();

    // --- 1. INSERT THE CLIENT SESSION (this happens for all types) ---
    // This logs the individual visit/session
    const { data: sessionData, error: sessionError } = await supabase
      .from('customers')
      .insert({
        name: payload.name,
        mobile: payload.mobile,
        date: payload.date,
        treatment: payload.treatment,
        amount_paid: payload.amountPaid, // This is 0 for package customers
        session_hours: payload.sessionHours,
        
        // Package tracking fields
        is_package_customer: payload.isPackageCustomer,
        took_package: payload.tookPackage,
        package_amount: payload.packageAmount,
        total_package_hours: payload.totalPackageHours,
        package_sold_by: payload.packageSoldBy,
        
        // Outlet and payment fields
        outlet_id: payload.outlet_id,
        outlet_name: payload.outlet, // Use 'outlet_name' in DB
        payment_method: payload.paymentMethod,
        check_in_time: payload.check_in_time, // null for UPI, set for cash/package
      })
      .select('id')
      .single();

    if (sessionError) {
      console.error('Supabase session insert error:', sessionError);
      throw new Error(`Error saving session: ${sessionError.message}`);
    }

    const customerSessionId = sessionData.id;

    // --- 2. HANDLE PACKAGE LOGIC ---

    // --- CASE A: CLIENT BOUGHT A NEW PACKAGE ---
    if (payload.tookPackage) {
      // Set expiry date (e.g., 1 year from now)
      const expiryDate = new Date();
      expiryDate.setFullYear(expiryDate.getFullYear() + 1);

      const { error: newPackageError } = await supabase
        .from('packages')
        .insert({
          client_name: payload.name,
          mobile: payload.mobile,
          total_hours: payload.totalPackageHours,
          remaining_hours: payload.totalPackageHours, // Starts full
          expiry_date: expiryDate.toISOString(),
          status: 'active',
          outlet_id: payload.outlet_id,
          sold_by: payload.packageSoldBy,
        });
      
      if (newPackageError) {
        console.error('Supabase new package error:', newPackageError);
        throw new Error(`Error creating new package: ${newPackageError.message}`);
      }
    }
    
    // --- CASE B: CLIENT USED AN EXISTING PACKAGE ---
    else if (payload.isPackageCustomer) {
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
        .gt('remaining_hours', 0) // Find one with hours left
        .order('created_at', { ascending: true }) // Use the oldest package first
        .limit(1)
        .single();

      if (findError || !activePackage) {
        throw new Error('No active package found for this client. Please sell them a new package.');
      }

      // Calculate new hours and status
      const newRemainingHours = activePackage.remaining_hours - hoursToDeduct;
      const newStatus = newRemainingHours <= 0 ? 'expired' : 'active';

      // Update the package
      const { error: updateError } = await supabase
        .from('packages')
        .update({
          remaining_hours: newRemainingHours < 0 ? 0 : newRemainingHours, // Don't go below 0
          status: newStatus,
        })
        .eq('id', activePackage.id);

      if (updateError) {
        console.error('Supabase package update error:', updateError);
        throw new Error(`Error deducting package hours: ${updateError.message}`);
      }
    }

    // --- 3. RETURN SUCCESS RESPONSE (as expected by client form) ---
    // The client form is already set up to handle these responses
    
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