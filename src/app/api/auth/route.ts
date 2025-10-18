// src/app/api/auth/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { OUTLETS, ADMIN_CREDENTIALS } from '@/lib/outlet';
import { supabase } from '@/lib/supabase'; // Import Supabase client

export async function POST(request: NextRequest) {
  try {
    const { username, password, outletId } = await request.json();

    // --- ADMIN LOGIN (MIGRATED TO SUPABASE AUTH) ---
    if (username === ADMIN_CREDENTIALS.username) {
      // 1. Use a defined Admin Email for Supabase Auth lookup
      const adminEmail = 'admin@berryspa.com'; 

      // 2. Sign in with Supabase Authentication to verify the password
      const { data, error } = await supabase.auth.signInWithPassword({
        email: adminEmail,
        password: password,
      });

      if (error) {
        // Handle Supabase authentication errors (e.g., Invalid login credentials)
        return NextResponse.json({ error: error.message || 'Invalid password' }, { status: 401 });
      }

      // 3. If successful, set the role cookie (keeping your current structure)
      const response = NextResponse.json({ success: true, role: 'admin' });
      response.cookies.set('auth_role', 'admin', { // ✅ auth_role
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        maxAge: 3600,
        path: '/',
        sameSite: 'lax'
      });
      return response;
    }

    // --- OUTLET LOGIN (KEPT AS IS FOR NOW) ---
    if (outletId) {
      const outlet = OUTLETS.find(o => o.id === outletId && o.password === password);
      if (outlet) {
        const response = NextResponse.json({ success: true, role: 'outlet', outletId });
        response.cookies.set('auth_role', 'outlet', { // ✅ auth_role = 'outlet'
          httpOnly: true,
          secure: process.env.NODE_ENV === 'production',
          maxAge: 3600,
          path: '/',
          sameSite: 'lax'
        });
        response.cookies.set('outlet_id', outletId, {
          httpOnly: true,
          secure: process.env.NODE_ENV === 'production',
          maxAge: 3600,
          path: '/',
          sameSite: 'lax'
        });
        return response;
      }
    }

    return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 });
  } catch (error) {
    console.error('Authentication error:', error);
    return NextResponse.json({ error: 'Authentication failed' }, { status: 500 });
  }
}