import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

export default async function OutletLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Await the cookie store to ensure the value is the expected ReadonlyRequestCookies
  const cookieStore = await cookies();
  const role = cookieStore.get('auth_role')?.value;
  const outletId = cookieStore.get('outlet_id')?.value;
  
  if (role !== 'outlet' || !outletId) {
    redirect('/outlet-login');
  }
  
  return <>{children}</>;
}
