import { supabase } from '@/lib/supabase';
import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  try {
    const mobile = request.nextUrl.searchParams.get('mobile')?.replace(/\D/g, '');

    if (!mobile) {
      return NextResponse.json({ error: 'Mobile required' }, { status: 400 });
    }

    // --- 1. Find the BEST ACTIVE package ---
    // Order by expiry_date descending (latest expiry first) to find the most relevant active package.
    const { data: activePkg, error } = await supabase
      .from('packages')
      .select('*')
      .eq('mobile', mobile)
      .eq('status', 'active')
      .gt('remaining_hours', 0)
      .order('expiry_date', { ascending: false }) // FIX: Changed to latest expiry date first
      .limit(1)
      .maybeSingle(); 

    if (error) {
      console.error('Active package lookup error:', error);
      return NextResponse.json(null);
    }
    
    let finalPkg = activePkg;
    let status = activePkg ? 'active' : 'not_found';
    let clientName = '';

    // --- 2. If no active package, find the latest package for name/status ---
    if (!finalPkg) {
      const { data: latestPkg } = await supabase
        .from('packages')
        .select('name, status, expiry_date, total_hours, used_hours, remaining_hours, id')
        .eq('mobile', mobile)
        .order('created_at', { ascending: false }) 
        .limit(1)
        .maybeSingle();

      if (latestPkg) {
        clientName = latestPkg.name || '';
        const today = new Date().toISOString().split('T')[0];
        const isExpired = latestPkg.expiry_date && latestPkg.expiry_date < today;
        
        if (isExpired || latestPkg.remaining_hours <= 0) {
            status = 'expired';
            finalPkg = latestPkg; 
        } else {
            status = 'not_found'; // No usable package found, but client has history
        }
      } else {
          // Client has no history in the 'packages' table
          return NextResponse.json({ status: 'not_found', name: '', mobile, remainingHours: 0, expiryDate: null, packageId: null });
      }
    } else {
        clientName = activePkg.name;
    }

    if (!finalPkg) return NextResponse.json(null); 

    // FIX: Ensure packageId and status are correctly formatted for the front-end
    return NextResponse.json({
      status: status, 
      name: clientName,
      mobile: finalPkg.mobile,
      packageAmount: finalPkg.package_amount || 0,
      totalPackageHours: finalPkg.total_hours || 0,
      usedPackageHours: finalPkg.used_hours || 0,
      remainingHours: finalPkg.remaining_hours || 0, 
      expiryDate: finalPkg.expiry_date || null,
      packageId: finalPkg.id, // <-- CRITICAL FIX: The front-end needs this ID.
      email: finalPkg.email || null 
    });
  } catch (error) {
    console.error('Lookup error:', error);
    return NextResponse.json({ status: 'error', error: 'Internal Server Error' }, { status: 500 });
  }
}