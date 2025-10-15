import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const cookieStore = await cookies();
  const isAdmin = cookieStore.get('auth_role')?.value === 'admin';
  
  if (!isAdmin) redirect('/login');
  return <>{children}</>;
}