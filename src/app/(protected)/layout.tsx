// src/app/(protected)/layout.tsx
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import type { ReactNode } from 'react';

interface ProtectedLayoutProps {
  children: ReactNode;
}

export default async function ProtectedLayout({
  children,
}: ProtectedLayoutProps) {
  // Get cookies asynchronously
  const cookieStore = await cookies();
  const isAuthenticated = cookieStore.has('auth_role');

  // Redirect to login if not authenticated
  if (!isAuthenticated) {
    redirect('/login');
  }

  // Render children (e.g., the Admin or Outlet layout)
  return <>{children}</>;
}