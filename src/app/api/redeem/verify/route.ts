// src/app/api/redeem/verify/route.ts
import { NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabaseServer';

export async function POST(req: Request) {
  try {
    const { code, outletId } = await req.json();

    // 1. Find the code
    const { data: record, error } = await supabaseServer
      .from('redemption_codes')
      .select('*')
      .eq('code', code)
      .eq('status', 'pending')
      .gt('expires_at', new Date().toISOString()) // Must not be expired
      .single();

    if (error || !record) {
      return NextResponse.json(
        { error: 'Invalid or expired code' }, 
        { status: 400 }
      );
    }

    // 2. Fetch the customer details associated with this mobile
    const { data: customerData } = await supabaseServer
      .from('packages')
      .select('*')
      .eq('mobile', record.mobile)
      .eq('status', 'active')
      .single();

    if (!customerData) {
       return NextResponse.json({ error: 'User has no active packages anymore' }, { status: 400 });
    }

    // 3. Mark code as used immediately so it can't be reused? 
    // Or wait until manager submits? Let's wait.
    // Just return success and data.

    return NextResponse.json({ 
      success: true, 
      mobile: record.mobile,
      customer: customerData
    });

  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}