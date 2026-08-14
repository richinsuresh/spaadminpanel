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

  // NOTE: NavigationWrapper already renders a <main> with its own padding
  // (p-4 lg:p-8) that fills the space next to the sidebar. This layout used
  // to wrap `children` in a SECOND <main> with `max-w-7xl mx-auto`, which
  // capped every dashboard page at 1280px and centered it — wasting most of
  // the screen on wide monitors and pushing table columns/action buttons
  // out of the comfortably visible area. We just render children directly now.
  return (
    <div className="min-h-screen bg-gray-50">
      <NavigationWrapper>{children}</NavigationWrapper>
    </div>
  );
}
