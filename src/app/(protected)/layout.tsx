// src/app/(protected)/layout.tsx
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

export default function ProtectedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const isAuthenticated = cookies().has('admin_auth');
  
  if (!isAuthenticated) {
    redirect('/login');
  }
  
  return <>{children}</>;
}