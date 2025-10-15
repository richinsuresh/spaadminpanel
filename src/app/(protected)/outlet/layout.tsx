import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

export default async function OutletLayout({ children }: { children: React.ReactNode }) {
  const cookieStore = await cookies();
  const isOutlet = cookieStore.get('auth_role')?.value === 'outlet';
  
  if (!isOutlet) redirect('/outlet-login');
  return <>{children}</>;
}