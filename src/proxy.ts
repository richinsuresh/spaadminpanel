// src/proxy.ts
import { NextResponse, NextRequest } from 'next/server';

export const config = {
  matcher: [
    /*
     * Exclude all API routes and static assets from triggering Edge Functions
     */
    '/((?!api|_next/static|_next/image|favicon.ico|public|login|outlet-login|admin-login|superuser-login).*)',
  ],
};

export function proxy(request: NextRequest) {
  return NextResponse.next();
}
