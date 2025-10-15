// src/app/api/auth/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { OUTLETS, ADMIN_CREDENTIALS } from '@/lib/outlets';

export async function POST(request: NextRequest) {
  try {
    const { username, password, outletId } = await request.json();
    
    // Admin login
    if (username === ADMIN_CREDENTIALS.username && password === ADMIN_CREDENTIALS.password) {
      const response = NextResponse.json({ success: true, role: 'admin' });
      response.cookies.set('auth_role', 'admin', { httpOnly: true, maxAge: 3600, path: '/' });
      return response;
    }
    
    // Outlet login
    if (outletId) {
      const outlet = OUTLETS.find(o => o.id === outletId && o.password === password);
      if (outlet) {
        const response = NextResponse.json({ success: true, role: 'outlet', outletId });
        response.cookies.set('auth_role', 'outlet', { httpOnly: true, maxAge: 3600, path: '/' });
        response.cookies.set('outlet_id', outletId, { httpOnly: true, maxAge: 3600, path: '/' });
        return response;
      }
    }
    
    return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 });
  } catch (error) {
    return NextResponse.json({ error: 'Authentication failed' }, { status: 500 });
  }
}