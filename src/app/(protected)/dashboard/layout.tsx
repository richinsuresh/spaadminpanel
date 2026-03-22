import { ReactNode } from 'react';
import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import NavigationWrapper from './NavigationWrapper';

export default async function DashboardLayout({ children }: { children: ReactNode }) {
  const cookieStore = await cookies();
  const adminSession = cookieStore.get('admin_session');

  // If the cookie from our updated API route isn't 'true', boot them to login
  if (!adminSession || adminSession.value !== 'true') {
    redirect('/login');
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <NavigationWrapper>
        <main className="p-4 md:p-8 max-w-7xl mx-auto">{children}</main>
      </NavigationWrapper>
    </div>
  );
}