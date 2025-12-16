// src/app/(protected)/dashboard/layout.tsx (Server Component)
// This file must NOT have 'use client'.

import NavigationWrapper from './NavigationWrapper';

// This component ensures that route params are handled correctly by the Server.
export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    // Passes the children (which will be your page component) to the Client wrapper.
    <NavigationWrapper>
      {children}
    </NavigationWrapper>
  );
}