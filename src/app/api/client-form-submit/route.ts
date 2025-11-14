import { supabaseServer as supabase } from '@/lib/supabaseServer';
import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  try {
    const payload = await req.json();

    // --- 1. HANDLE PACKAGE LOGIC *FIRST* ---

    // --- CASE A: CLIENT USED AN EXISTING PACKAGE ---
    if (payload.isPackageCustomer) {
      const hoursToDeduct = payload.sessionHours;
      
      if (!hoursToDeduct || hoursToDeduct <= 0) { 
        throw new Error('Session hours must be provided when using a package.'); 
      }
      
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
        throw new Error('No active package found for this client.'); 
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
      if (updateError) { throw new Error(`Error deducting package hours: ${updateError.message}`); }
    }
    
    // --- CASE B: CLIENT BOUGHT A NEW PACKAGE (UPDATED LOGIC) ---
    else if (payload.tookPackage) {
      
      // --- NEW LOGIC: Calculate initial hours based on first session ---
      const totalHours = Number(payload.totalPackageHours) || 0;
      const firstSessionHours = Number(payload.sessionHours) || 0;

      if (firstSessionHours > totalHours) {
        throw new Error('First session cannot be longer than total package hours.');
      }

      const initialRemainingHours = totalHours - firstSessionHours;
      const initialUsedHours = firstSessionHours;
      const newStatus = initialRemainingHours <= 0 ? 'expired' : 'active';
      // --- END OF NEW LOGIC ---

      const validityMonths = parseInt(payload.packageValidity || '3', 10);
      const expiryDate = new Date(payload.date);
      expiryDate.setMonth(expiryDate.getMonth() + validityMonths);
      
      const { error: newPackageError } = await supabase
        .from('packages')
        .insert({
          name: payload.name,
          mobile: payload.mobile,
          total_hours: totalHours, // The full total
          remaining_hours: initialRemainingHours, // Deducted amount
          used_hours: initialUsedHours, // The first session
          status: newStatus, // Status after first session
          start_date: payload.date, 
          expiry_date: expiryDate.toISOString(),
          outlet: payload.outlet, 
          sold_by: payload.packageSoldBy,
          package_amount: payload.packageAmount,
          package_validity: payload.packageValidity
        });
      
      if (newPackageError) {
        throw new Error(`Error creating new package: ${newPackageError.message}`);
      }
    }
    
    // --- 2. INSERT THE CLIENT SESSION (to 'customers' table) ---
    // This insert is now correct for all cases.
    // If a package was bought, this logs the first session (if sessionHours > 0).
    // If package was used, this logs the session.
    // If no package, this logs the session.
    const { data: sessionData, error: sessionError } = await supabase
      .from('customers')
      .insert({
        name: payload.name,
        mobile: payload.mobile,
        date: payload.date,
        treatment: payload.treatment,
        amount_paid: payload.amountPaid, 
        session_hours: payload.sessionHours, // This is correct
        is_package_customer: payload.isPackageCustomer,
        took_package: payload.tookPackage, 
        package_amount: payload.packageAmount,
        total_package_hours: payload.totalPackageHours, // Log the total hours of the package bought
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