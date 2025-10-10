// src/app/api/auth/route.ts
import { NextRequest, NextResponse } from 'next/server';

const ADMIN_PASSWORD = 'admin123';

export async function POST(request: NextRequest) {
  try {
    const { password } = await request.json();
    
    if (password === ADMIN_PASSWORD) {
      // ✅ CORRECT WAY: Use NextResponse.json() with cookies
      const response = NextResponse.json({ success: true });
      
      // Set cookie on the response
      response.cookies.set('admin_auth', 'true', {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        maxAge: 3600, // 1 hour
        path: '/',
      });
      
      return response;
    }
    
    return NextResponse.json(
      { error: 'Invalid password' },
      { status: 401 }
    );
  } catch (error) {
    console.error('💥 SERVER ERROR:', error);
    return NextResponse.json(
      { error: 'Authentication failed' },
      { status: 500 }
    );
  }
}