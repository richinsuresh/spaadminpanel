// src/app/(protected)/outlet/layout.tsx
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

export default async function OutletLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const cookieStore = cookies();
  const role = cookieStore.get('auth_role')?.value;
  const outletId = cookieStore.get('outlet_id')?.value;
  
  // ✅ Check both role AND outlet ID
  if (role !== 'outlet' || !outletId) {
    redirect('/outlet-login');
  }
  
  return <>{children}</>;
}