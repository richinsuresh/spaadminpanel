// src/app/api/auth/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { OUTLETS, ADMIN_CREDENTIALS } from '@/lib/outlet';

export async function POST(request: NextRequest) {
  try {
    const { username, password, outletId } = await request.json();
    
    // Admin login
    if (username === ADMIN_CREDENTIALS.username && password === ADMIN_CREDENTIALS.password) {
      const response = NextResponse.json({ success: true, role: 'admin' });
      // ✅ Use auth_role for consistency with outlet layout
      response.cookies.set('auth_role', 'admin', {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        maxAge: 3600,
        path: '/',
        sameSite: 'lax'
      });
      return response;
    }
    
    // Outlet login
    if (outletId) {
      const outlet = OUTLETS.find(o => o.id === outletId && o.password === password);
      if (outlet) {
        const response = NextResponse.json({ success: true, role: 'outlet', outletId });
        // ✅ Use auth_role = 'outlet' for outlet staff
        response.cookies.set('auth_role', 'outlet', {
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
    return NextResponse.json({ error: 'Authentication failed' }, { status: 500 });
  }
}