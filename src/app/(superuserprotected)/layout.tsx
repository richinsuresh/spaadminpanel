import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import type { ReactNode } from 'react';
import SuperUserClientLayout from './SuperUserClientLayout'; // Import the new client layout

// This file is now a Server Component (NO 'use client')

export default async function SuperUserProtectedLayout({
  children,
}: {
  children: ReactNode;
}) {
  // 1. Perform server-side auth check
  const cookieStore = cookies();
  const authCookie = cookieStore.get('superuser-auth');

  if (!authCookie || authCookie.value !== 'true') {
    redirect('/superuser-login');
  }

  // 2. If auth passes, render the Client Component layout
  //    and pass the server-side {children} (the page) into it.
  return <SuperUserClientLayout>{children}</SuperUserClientLayout>;
}