// src/app/(protected)/outlet/layout.tsx
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

export default async function OutletLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const role = cookies().get('auth_role')?.value;
  const outletId = cookies().get('outlet_id')?.value;
  
  if (role !== 'outlet' || !outletId) {
    redirect('/outlet-login');
  }
  
  return <>{children}</>;
}