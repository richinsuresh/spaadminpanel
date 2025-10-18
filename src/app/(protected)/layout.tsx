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
  // FIX: Check for 'auth_role' cookie set by your API, not 'admin_auth'
  const isAuthenticated = cookieStore.has('auth_role');

  // Redirect to login if not authenticated
  if (!isAuthenticated) {
    redirect('/login');
  }

  // Render children if authenticated
  return <>{children}</>;
}