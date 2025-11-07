import { NextResponse, NextRequest } from 'next/server';

// This function determines which paths are protected
export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - api/auth (The login API route)
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico
     * - /login, /outlet-login, /admin-login (the auth pages)
     * - /superuser-login (the new superuser auth page)
     */
    '/((?!api|_next/static|_next/image|favicon.ico|login|outlet-login|admin-login|superuser-login).*)',
  ],
};

// This middleware is empty because the entire logic is moved to the layouts.
// Its sole purpose here is to define the matcher config above, 
// ensuring that /api/auth and public login pages are excluded from protected checks.
export function middleware(request: NextRequest) {
  return NextResponse.next();
} 