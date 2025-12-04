import { supabaseServer as supabase } from '@/lib/supabaseServer'; // Assuming this uses a service role key
import { NextRequest, NextResponse } from 'next/server';

// Define the expected payload structure for clarity
interface CheckinPayload {
    name: string;
    mobile: string;
    date: string;
    treatment: string;
    
    // Package Purchase Fields
    tookPackage: boolean;
    packageAmount: number; // In paise
    totalPackageHours: number;
    packageSoldBy: string | null;
    packageValidity: string | null;
    
    // Session Fields
    amountPaid: number; // In paise (0 if package used/bought)
    sessionHours: number; // Duration (e.g., 1.5)
    
    // Package Usage Fields (from client lookup)
    isPackageCustomer: boolean;
    packageId: string | null; // ID of the package being used
    
    // Location & Staff
    outlet: string;
    outlet_id: string;
    paymentMethod: string;
    finalAmountInPaise: number;
    check_in_time: string | null;
    therapist_name: string | null;
    therapist_primary: string | null;
    therapist_secondary: string | null;
    room: string | null;
}

export async function POST(req: NextRequest) {
    let transactionError: Error | null = null;
    let finalCheckinRecord: any = null;

    try {
        const payload: CheckinPayload = await req.json();
        
        // Input validation (basic)
        if (!payload.mobile || payload.sessionHours <= 0) {
            return NextResponse.json({ error: 'Missing critical session data.' }, { status: 400 });
        }
        
        // --- 1. HANDLE PACKAGE REGISTRATION (New Purchase) ---
        if (payload.tookPackage) {
            // New package purchase, insert a new record into 'packages' table
            const newPackageData = {
                mobile: payload.mobile,
                name: payload.name,
                package_name: payload.treatment, // Using treatment name as package name
                total_hours: payload.totalPackageHours,
                used_hours: payload.sessionHours, // First session is immediately used
                remaining_hours: payload.totalPackageHours - payload.sessionHours,
                package_amount: payload.packageAmount,
                sold_by: payload.packageSoldBy,
                outlet_id: payload.outlet_id,
                status: (payload.totalPackageHours - payload.sessionHours) > 0 ? 'active' : 'used',
                // Assuming packageValidity needs to be parsed into an expiry date here
                // For simplicity, we skip date calculation here, relying on Supabase RLS policies
                // or a default validity setter. You might need to calculate expiryDate here.
            };

            const { error: pkgInsertError } = await supabase
                .from('packages')
                .insert([newPackageData]);
            
            if (pkgInsertError) {
                console.error('Supabase package insert error:', pkgInsertError);
                throw new Error(`Error saving new package: ${pkgInsertError.message}`);
            }
        }
        
        // --- 2. HANDLE PACKAGE DEDUCTION (Existing Package Used) ---
        if (payload.isPackageCustomer && payload.packageId) {
            const hoursToDeduct = payload.sessionHours;
            
            // a. Fetch current package state
            const { data: activePackage, error: findError } = await supabase
                .from('packages')
                .select('remaining_hours, used_hours') 
                .eq('id', payload.packageId)
                .maybeSingle();

            if (findError || !activePackage) { 
                throw new Error('Active package used, but record not found or error occurred.'); 
            }
            
            const currentRemaining = parseFloat(activePackage.remaining_hours as any || '0');
            const currentUsed = parseFloat(activePackage.used_hours as any || '0');
            
            if (currentRemaining < hoursToDeduct) {
                // Prevent over-deduction if the client used more than remaining hours
                // This should ideally be blocked on the front-end, but we guard here.
                throw new Error(`Session duration (${hoursToDeduct}h) exceeds remaining package hours (${currentRemaining}h).`);
            }
            
            const newRemainingHours = currentRemaining - hoursToDeduct;
            const newUsedHours = currentUsed + hoursToDeduct;
            const newStatus = newRemainingHours <= 0 ? 'used' : 'active';

            // b. Update package state
            const { error: updateError } = await supabase
                .from('packages')
                .update({
                    used_hours: newUsedHours,
                    remaining_hours: Math.max(0, newRemainingHours),
                    status: newStatus, 
                })
                .eq('id', payload.packageId);

            if (updateError) {
                console.error('Supabase package update error:', updateError);
                throw new Error(`Error updating package usage: ${updateError.message}`);
            }
        }
        
        // --- 3. INSERT CHECK-IN RECORD ---
        // Insert into the 'check_ins' table (as discussed in previous steps)
        const checkinRecord = {
            name: payload.name,
            mobile: payload.mobile,
            date: payload.date,
            treatment: payload.treatment,
            sessionHours: payload.sessionHours, // Use sessionHours for the column
            
            amountPaid: payload.amountPaid, // Amount for this session (0 if package)
            finalAmountInPaise: payload.finalAmountInPaise,
            paymentMethod: payload.paymentMethod,
            
            outlet: payload.outlet,
            outlet_id: payload.outlet_id,

            // Package flags and details
            isPackageCustomer: payload.isPackageCustomer,
            tookPackage: payload.tookPackage,
            packageAmount: payload.packageAmount,
            totalPackageHours: payload.totalPackageHours,
            packageSoldBy: payload.packageSoldBy,
            
            // Staff and Time
            check_in_time: payload.check_in_time,
            therapist_name: payload.therapist_name,
            therapist_primary: payload.therapist_primary,
            therapist_secondary: payload.therapist_secondary,
            room: payload.room,
        };

        const { data: sessionData, error: sessionError } = await supabase
            .from('check_ins') // Insert into the 'check_ins' table
            .insert([checkinRecord])
            .select('id, paymentMethod, outlet_id, finalAmountInPaise')
            .single();

        if (sessionError) {
            console.error('Supabase check_ins insert error:', sessionError);
            throw new Error(`Error saving session: ${sessionError.message}`);
        }

        finalCheckinRecord = sessionData;

        // --- 4. RETURN SUCCESS RESPONSE ---
        if (finalCheckinRecord.paymentMethod === 'upi') {
            return NextResponse.json({
                success: true,
                paymentMethod: 'upi', 
                customer_session_id: finalCheckinRecord.id,
                outlet_id: finalCheckinRecord.outlet_id,
                finalAmountInPaise: finalCheckinRecord.finalAmountInPaise
            });
        } else {
            return NextResponse.json({
                success: true,
                paymentMethod: finalCheckinRecord.paymentMethod,
            });
        }

    } catch (err: any) {
        console.error('Client Check-in Submit error:', err);
        return NextResponse.json({ 
            error: err.message || 'An unknown server error occurred.' 
        }, { status: 500 });
    }
}

// NOTE: Ensure your existing GET handler (Client Lookup) is also in this file if you are using a single file for the route.