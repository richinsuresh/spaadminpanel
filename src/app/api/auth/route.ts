// src/app/api/auth/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabaseServer';
import { OUTLETS } from '@/lib/outlet';

export async function POST(request: NextRequest) {
  try {
    const { username, password, outletId } = await request.json();

    // --- Basic validation ---
    if ((!username && !outletId) || !password) {
      return NextResponse.json(
        { error: 'Missing username or outlet id, or password' },
        { status: 400 }
      );
    }

    /**
     * 1) ADMIN / STAFF / DEV LOGIN (via app_users in Supabase)
     *    This path is used when "username" is provided.
     */
    if (username) {
      const { data, error } = await supabaseServer
        .from('app_users')
        .select('username, role')
        .eq('username', username)
        .eq('password', password)
        .single();

      if (error || !data) {
        return NextResponse.json(
          { error: 'Invalid credentials' },
          { status: 401 }
        );
      }

      const res = NextResponse.json({
        success: true,
        role: data.role,
        username: data.username,
      });

      // Same cookies you already used for admin/staff/dev
      res.cookies.set('auth_role', data.role, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        path: '/',
        maxAge: 86400, // 1 day
      });

      res.cookies.set('admin_session', 'true', {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        path: '/',
        maxAge: 86400,
      });

      // Non-HTTP-only for convenience in client (not sensitive)
      res.cookies.set('username', username, {
        httpOnly: false,
        path: '/',
        maxAge: 86400,
      });

      return res;
    }

    /**
     * 2) OUTLET LOGIN (via OUTLETS config)
     *    This path is used when "outletId" is provided instead of username.
     */
    if (outletId) {
      const outlet = OUTLETS.find(
        (o) => o.id === outletId && o.password === password
      );

      if (!outlet) {
        return NextResponse.json(
          { error: 'Invalid outlet credentials' },
          { status: 401 }
        );
      }

      const res = NextResponse.json({
        success: true,
        role: 'outlet',
        outletId: outlet.id,
        outletName: outlet.name,
      });

      // Mark this session as an outlet session
      res.cookies.set('auth_role', 'outlet', {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        path: '/',
        maxAge: 86400,
        sameSite: 'lax',
      });

      res.cookies.set('outlet_id', outlet.id, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        path: '/',
        maxAge: 86400,
        sameSite: 'lax',
      });

      return res;
    }

    // Fallback (should not normally reach here)
    return NextResponse.json(
      { error: 'Bad request' },
      { status: 400 }
    );
  } catch (err) {
    console.error('AUTH ERROR:', err);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
