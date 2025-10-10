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
  // Get cookies asynchronously (required in Next.js 15+ server components)
  const cookieStore = await cookies();
  const isAuthenticated = cookieStore.has('admin_auth');

  // Redirect to login if not authenticated
  if (!isAuthenticated) {
    redirect('/login');
  }

  // Render children if authenticated
  return <>{children}</>;
}