// src/app/api/send-otp/route.ts
import { supabaseServer as supabase } from '@/lib/supabaseServer';
import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  try {
    // 1. Parse the request body
    const { mobileNumber } = await req.json();

    // 2. Add your validation logic here (e.g. check if number exists)

    // 3. Add your OTP sending logic here
    // (Ensure your original logic below this point is uncommented)

    return NextResponse.json({ success: true });
    
  } catch (err: any) {
    console.error('Send OTP API error:', err);
    return NextResponse.json({ success: false, error: err?.message || 'Unknown error' }, { status: 500 });
  }
}