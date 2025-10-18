// src/app/(protected)/outlet/layout.tsx
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

export default async function OutletLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const cookieStore = await cookies();
  
  // 1. Get the cookies
  const authRoleCookie = cookieStore.get('auth_role');
  const outletIdCookie = cookieStore.get('outlet_id');
  
  // 2. Explicitly check if the role is 'outlet' AND the outlet_id exists
  const isOutletAuthenticated = 
    authRoleCookie?.value === 'outlet' && 
    !!outletIdCookie;
  
  if (!isOutletAuthenticated) {
    redirect('/outlet-login');
  }
  
  return <>{children}</>;
}