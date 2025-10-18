// src/app/(protected)/outlet/layout.tsx
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

export default async function OutletLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const cookieStore = await cookies();
  // ✅ Check admin_auth (set by your current API)
  const isAuthenticated = cookieStore.get('admin_auth')?.value === 'true';
  const outletId = cookieStore.get('outlet_id')?.value;
  
  // Outlet staff must have both admin_auth AND outlet_id
  if (!isAuthenticated || !outletId) {
    redirect('/outlet-login');
  }
  
  return <>{children}</>;
}