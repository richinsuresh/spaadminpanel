// src/app/(protected)/outlet/layout.tsx
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

export default async function OutletLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // ✅ Add 'async' and 'await'
  const cookieStore = await cookies();
  const role = cookieStore.get('auth_role')?.value;
  const outletId = cookieStore.get('outlet_id')?.value;
  
  if (role !== 'outlet' || !outletId) {
    redirect('/outlet-login');
  }
  
  return <>{children}</>;
}