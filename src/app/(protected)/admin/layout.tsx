import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const cookieStore = await cookies();

  const role = cookieStore.get('auth_role')?.value;
  const legacySession = cookieStore.get('admin_session')?.value;

  // Accept new + old login methods
  const isAdmin = 
    role === 'admin' ||
    legacySession === 'true' ||
    legacySession === '1';

  if (!isAdmin) {
    // Redirect to actual admin login page—not /login
    redirect('/admin-login');
  }

  return <>{children}</>;
}
