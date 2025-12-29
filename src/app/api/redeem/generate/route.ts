// src/app/api/redeem/generate/route.ts
import { NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabaseServer';

export async function POST(req: Request) {
  try {
    const { mobile, outletId } = await req.json();

    // 1. Verify user actually has a package (optional but good security)
    const { data: packages } = await supabaseServer
      .from('packages')
      .select('id')
      .eq('mobile', mobile)
      .eq('status', 'active')
      .maybeSingle();

    if (!packages) {
      return NextResponse.json(
        { error: 'No active packages found for this mobile number.' }, 
        { status: 404 }
      );
    }

    // 2. Generate short code (e.g., A7X2 or just 4521)
    const code = Math.floor(1000 + Math.random() * 9000).toString(); // Simple 4 digit
    
    // 3. Set expiry (15 mins from now)
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();

    // 4. Save to DB
    const { error } = await supabaseServer
      .from('redemption_codes')
      .insert({
        code,
        mobile,
        outlet_id: outletId,
        expires_at: expiresAt,
        status: 'pending'
      });

    if (error) throw error;

    return NextResponse.json({ code });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}