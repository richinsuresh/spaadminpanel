// src/app/api/send-otp/route.ts
import { supabaseServer as supabase } from '@/lib/supabaseServer';
import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  try {
    const { email } = await req.json();

    if (!email || !email.includes('@')) {
      return NextResponse.json({ error: 'Invalid email address.' }, { status: 400 });
    }

    // --- 1) Check user existence using admin API (server-only) ---
    // listUsers is an admin-only endpoint that requires the service_role key.
    // It returns a paginated list; we look for a matching email on the returned page.
    const { data: listData, error: listError } = await supabase.auth.admin.listUsers({
      // adjust perPage if you expect many users; default is 50
      perPage: 100
    });

    if (listError) {
      console.error('Error listing users:', listError);
      return NextResponse.json({ success: false, error: 'Failed to check user existence.' }, { status: 500 });
    }

    const users = (listData && (listData as any).users) || (listData as any)?.users || listData;
    // listUsers returns { users: [...] } in latest SDK — handle both shapes above.
    const foundUser = Array.isArray(users) ? users.find((u: any) => (u.email || '').toLowerCase() === email.toLowerCase()) : null;

    if (!foundUser) {
      // user doesn't exist — do not try to create one because signups are disabled
      return NextResponse.json({ success: false, message: 'No account exists for that email.' }, { status: 404 });
    }

    // --- 2) Send OTP only for existing user ---
    const { data, error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        shouldCreateUser: false // ensure we don't attempt to create a new user
      }
    });

    if (error) {
      console.error('Error sending email OTP:', error);
      // If signups are disabled and user exists, this should generally not happen,
      // but return a sensible error to the client.
      return NextResponse.json({ success: false, error: error.message }, { status: 422 });
    }

    return NextResponse.json({ success: true, message: 'OTP sent to email.' });

  } catch (err: any) {
    console.error('Send OTP API error:', err);
    return NextResponse.json({ success: false, error: err?.message || 'Unknown error' }, { status: 500 });
  }
}
