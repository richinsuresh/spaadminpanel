import { supabaseServer as supabase } from '@/lib/supabaseServer';
import { NextRequest, NextResponse } from 'next/server';

// Helper to calculate the new expiry date
function calculateNewExpiryDate(currentExpiryDateStr: string | null, validityPeriod: string): string {
    // Determine the number of months to add
    const [amount, unit] = validityPeriod.split(' ');
    const monthsToAdd = parseInt(amount);

    let baseDate: Date;
    let newExpiryDate = new Date();
    
    // Check if there's a current expiry date and if it's still in the future
    if (currentExpiryDateStr) {
        // Use midnight of the current expiry date
        const currentExpiry = new Date(currentExpiryDateStr);
        currentExpiry.setHours(0, 0, 0, 0); 
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        // If the package is still active or expires today, base the new expiry on the current expiry.
        // THIS IS THE RENEWAL/EXTENSION LOGIC: New validity starts from the old expiry.
        if (currentExpiry >= today) {
            baseDate = currentExpiry;
        } else {
            // If expired, base it on today.
            baseDate = today;
        }
    } else {
        // If no prior package or no current expiry, base it on today.
        baseDate = new Date();
    }

    // Start from the base date
    newExpiryDate.setTime(baseDate.getTime());
    
    // Set the month, which handles month rollovers automatically
    newExpiryDate.setMonth(newExpiryDate.getMonth() + monthsToAdd);

    // Format to YYYY-MM-DD for Supabase
    return newExpiryDate.toISOString().split('T')[0];
}

export async function POST(req: NextRequest) {
  try {
    const payload = await req.json();

    // --- 1. HANDLE PACKAGE LOGIC *FIRST* ---

    // 1A. Handle Package Redemption (Deduction of hours)
    if (payload.isPackageCustomer) {
      const hoursToDeduct = payload.sessionHours;
      
      if (!hoursToDeduct || hoursToDeduct <= 0) { 
        // Skip deduction if hours are 0, but allow check-in to proceed.
      } else {
          
          if (!payload.packageId) {
             throw new Error('Active package ID missing for package redemption.');
          }

          const { data: activePackage, error: findError } = await supabase
            .from('packages')
            .select('id, remaining_hours, used_hours') 
            .eq('id', payload.packageId) // Look up by ID
            .eq('status', 'active')
            .gt('remaining_hours', 0) 
            .limit(1)
            .single();
            
          if (findError || !activePackage) { 
            throw new Error('No active package found for this client to redeem hours.'); 
          }
          
          const currentRemaining = parseFloat(activePackage.remaining_hours as any || '0');
          const currentUsed = parseFloat(activePackage.used_hours as any || '0');
          const newRemainingHours = currentRemaining - hoursToDeduct;
          const newUsedHours = currentUsed + hoursToDeduct;
          const newStatus = newRemainingHours <= 0 ? 'expired' : 'active';

          const { error: updateError } = await supabase
            .from('packages')
            .update({
              remaining_hours: newRemainingHours,
              used_hours: newUsedHours,
              status: newStatus,
            })
            .eq('id', payload.packageId); // Update by ID

          if (updateError) {
            console.error('Supabase package update error:', updateError);
            throw new Error(`Error updating package hours: ${updateError.message}`);
          }
      }
    }
    
    // 1B. Handle Package Sale/Addition (Creating a new package record)
    if (payload.tookPackage) {
        
        const newTotalHours = payload.totalPackageHours;
        const validityPeriod = payload.packageValidity; // e.g., '3 months'
        const packagePrice = payload.packageAmount;
        
        
        // ★★★ RENEWAL LOGIC ★★★
        // 1. Check for the single, currently active package that the new package should stack onto.
        // We only check for an *active* package because a new package purchase should only extend
        // the expiry date of an existing active one, or start a new active one.
        const { data: existingActivePackage, error: findActivePkgError } = await supabase
            .from('packages')
            .select('id, remaining_hours, expiry_date, total_hours, used_hours') 
            .eq('mobile', payload.mobile)
            .eq('status', 'active')
            .order('created_at', { ascending: true }) // Find the oldest active package to add to
            .limit(1)
            .maybeSingle();

        if (findActivePkgError) {
            console.error('Supabase find active package error:', findActivePkgError);
            throw new Error(`Error finding active package for addition check: ${findActivePkgError.message}`);
        }

        const packageDataToSave: any = {
            name: payload.name,
            mobile: payload.mobile,
            package_amount: packagePrice,
            package_sold_by: payload.packageSoldBy,
            outlet_id: payload.outlet_id,
            outlet_name: payload.outlet, // Assume column exists now
            payment_method: payload.paymentMethod, // Assume column exists now
            status: 'active',
        };
        
        let finalRemainingHours: number;
        let finalTotalHours: number;
        let finalUsedHours: number;
        let newExpiryDateStr: string;


        if (existingActivePackage) {
            // ADDITION LOGIC (RENEWAL/STACKING): Update the existing active package
            
            const currentRemaining = parseFloat(existingActivePackage.remaining_hours as any || '0');
            const currentTotal = parseFloat(existingActivePackage.total_hours as any || '0');
            const currentUsed = parseFloat(existingActivePackage.used_hours as any || '0');
            
            // 1. Add new hours to old remaining hours
            finalRemainingHours = currentRemaining + newTotalHours;
            finalTotalHours = currentTotal + newTotalHours;
            finalUsedHours = currentUsed; // Used hours are preserved
            
            // 2. Calculate new expiry date based on existing expiry
            newExpiryDateStr = calculateNewExpiryDate(existingActivePackage.expiry_date, validityPeriod);

            // Set update data
            packageDataToSave.remaining_hours = finalRemainingHours;
            packageDataToSave.total_hours = finalTotalHours;
            packageDataToSave.used_hours = finalUsedHours;
            packageDataToSave.expiry_date = newExpiryDateStr;
            
            const { error: updateError } = await supabase
                .from('packages')
                .update(packageDataToSave)
                .eq('id', existingActivePackage.id);

            if (updateError) {
                console.error('Supabase package stacking error:', updateError);
                throw new Error(`Error adding hours to existing package: ${updateError.message}`);
            }
            
            console.log(`Hours added to existing package ID ${existingActivePackage.id}.`);
        } 
        else {
            // NEW PACKAGE SALE LOGIC (No active package found): Insert a new package row.
            
            // Calculate new expiry date starting from today
            newExpiryDateStr = calculateNewExpiryDate(null, validityPeriod);
            
            // Set insert data
            packageDataToSave.remaining_hours = newTotalHours;
            packageDataToSave.total_hours = newTotalHours;
            packageDataToSave.used_hours = 0; // New package starts with 0 used hours
            packageDataToSave.expiry_date = newExpiryDateStr;


            const { error: insertError } = await supabase
                .from('packages')
                .insert([packageDataToSave]);

            // This INSERT should now succeed because the unique constraint on 'mobile' is dropped.
            if (insertError) {
                console.error('Supabase new package insert error:', insertError);
                throw new Error(`Error creating new package: ${insertError.message}`);
            }
            
            console.log(`New package created for ${payload.mobile}.`);
        }
    }


    // --- 2. INSERT CUSTOMER SESSION/CHECK-IN RECORD ---
    const checkInTime: string | null = new Date().toISOString();

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
        check_in_time: checkInTime,
        // --- MAPPED FIELDS ---
        therapist_name: payload.therapist_name,
        room: payload.room, 
      })
      .select('id')
      .single();

    if (sessionError) {
      console.error('Supabase session insert error:', sessionError);
      throw new Error(`Error saving session: ${sessionError.message}`);
    }

    const customerSessionId = sessionData.id;

    if (payload.paymentMethod === 'upi') {
      return NextResponse.json({
        success: true,
        paymentMethod: 'upi', 
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
    console.error('Form submission error:', err);
    return NextResponse.json({ error: err.message || 'An unknown error occurred during submission.' }, { status: 500 });
  }
}