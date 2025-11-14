// src/app/api/send-otp/route.ts
import { supabaseServer as supabase } from '@/lib/supabaseServer';
import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  try {
    // --- FUNCTIONALITY DISABLED ---
    return NextResponse.json(
      { success: false, error: 'OTP functionality has been disabled.' }, 
      { status: 403 } // 403 Forbidden
    );
    
    // All original logic below is now unreachable
    
  } catch (err: any) {
    console.error('Send OTP API error:', err);
    return NextResponse.json({ success: false, error: err?.message || 'Unknown error' }, { status: 500 });
  }
}