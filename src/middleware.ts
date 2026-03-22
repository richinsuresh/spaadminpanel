import { NextResponse, NextRequest } from 'next/server';

// Updated matcher to exclude ALL API routes and static assets
export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - api (All API routes to prevent polling spikes)
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico
     * - public (static public folder)
     * - login, outlet-login, admin-login, superuser-login (auth pages)
     */
    '/((?!api|_next/static|_next/image|favicon.ico|public|login|outlet-login|admin-login|superuser-login).*)',
  ],
};

export function middleware(request: NextRequest) {
  // Since logic is handled in layouts, we just return next()
  // The matcher above is the key to reducing usage hours.
  return NextResponse.next();
}
