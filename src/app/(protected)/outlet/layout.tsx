// src/app/(protected)/outlet/layout.tsx
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

export default async function OutletLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const cookieStore = await cookies();
  
  // Efficient single check: both cookies must exist
  if (!cookieStore.get('auth_role') || !cookieStore.get('outlet_id')) {
    redirect('/outlet-login');
  }
  
  return <>{children}</>;
}