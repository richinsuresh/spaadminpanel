import { ReactNode } from 'react';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabaseServer';
import NavigationWrapper from './NavigationWrapper';

export default async function DashboardLayout({
  children,
}: {
  children: ReactNode;
}) {
  // Now matches the export in supabaseServer.ts
  const supabase = await createClient();

  const { data: { session }, error } = await supabase.auth.getSession();

  if (error || !session) {
    redirect('/login');
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <NavigationWrapper>
        <main className="p-4 md:p-8 max-w-7xl mx-auto">
          {children}
        </main>
      </NavigationWrapper>
    </div>
  );
}
