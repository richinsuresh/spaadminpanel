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

    // Shared cookie configuration to ensure visibility to Server Components
    const cookieOptions = {
      httpOnly: false, // Must be false so the client-side router.refresh() can sync state
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      maxAge: 86400, // 1 day
      sameSite: 'lax' as const, // Ensures cookies are sent during redirects
    };

    /**
     * 1) ADMIN / STAFF / DEV LOGIN
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

      // Set auth cookies using optimized options
      res.cookies.set('auth_role', data.role, cookieOptions);
      res.cookies.set('admin_session', 'true', cookieOptions);
      res.cookies.set('username', username, cookieOptions);

      return res;
    }

    /**
     * 2) OUTLET LOGIN
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

      // Set outlet cookies
      res.cookies.set('auth_role', 'outlet', cookieOptions);
      res.cookies.set('outlet_id', outlet.id, cookieOptions);
      res.cookies.set('admin_session', 'true', cookieOptions); // Added to pass DashboardLayout check

      return res;
    }

    return NextResponse.json(
      { error: 'Bad request' },
      { status: 400 }
    );
  } catch (err) {
    console.error('AUTH ERROR:', err);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}