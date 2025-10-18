import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

export default async function OutletLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const cookieStore = await cookies();
  
  // 1. Explicitly check if the 'auth_role' cookie exists AND its value is 'outlet'
  const authRoleCookie = cookieStore.get('auth_role');
  const outletIdCookie = cookieStore.get('outlet_id');
  
  const isOutletAuthenticated = 
    authRoleCookie?.value === 'outlet' && 
    !!outletIdCookie?.value; // Ensure outlet ID is also present

  if (!isOutletAuthenticated) {
    // If not authenticated as an outlet, redirect to outlet login
    redirect('/outlet-login');
  }
  
  return <>{children}</>;
}
