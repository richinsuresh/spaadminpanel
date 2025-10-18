// src/app/(protected)/outlet/layout.tsx
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

export default async function OutletLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const cookieStore = await cookies();
  const role = cookieStore.get('auth_role')?.value;
  const outletId = cookieStore.get('outlet_id')?.value;
  
  // ✅ Only check if both are present (don't require specific values)
  if (!role || !outletId) {
    redirect('/outlet-login');
  }
  
  return <>{children}</>;
}