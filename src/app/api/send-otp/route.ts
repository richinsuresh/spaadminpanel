import { supabaseServer as supabase } from '@/lib/supabaseServer';
import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  try {
    const { mobile } = await req.json();

    if (!mobile || mobile.length !== 10) {
      return NextResponse.json({ error: 'Invalid mobile number.' }, { status: 400 });
    }

    // IMPORTANT: Add your country code.
    const fullMobile = `+91${mobile}`;

    // This uses your Supabase auth settings (Twilio) to send the SMS
    const { data, error } = await supabase.auth.signInWithOtp({
      phone: fullMobile,
    });

    if (error) {
      console.error('Error sending OTP:', error);
      throw new Error(error.message);
    }

    return NextResponse.json({ success: true, message: 'OTP sent.' });

  } catch (err: any) {
    console.error('Send OTP API error:', err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}