// MUST use await cookies()
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

export default async function OutletLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const cookieStore = await cookies(); // ✅ await cookies()
  const role = cookieStore.get('auth_role')?.value;
  const outletId = cookieStore.get('outlet_id')?.value;
  
  if (role !== 'outlet' || !outletId) { // ✅ Check both
    redirect('/outlet-login');
  }
  
  return <>{children}</>;
}