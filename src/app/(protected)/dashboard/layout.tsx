'use client';

import { useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useUser } from '@/context/UserContext';
import { Loader2 } from 'lucide-react';

export default function ProtectedLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { user, isLoading } = useUser();
  const [isAuthorized, setIsAuthorized] = useState(false);
  const [isChecking, setIsChecking] = useState(true);

  useEffect(() => {
    // 1. Wait for UserContext to initialize
    if (isLoading) return;

    const checkAuth = () => {
      // A. Check Context (Best)
      if (user) return true;

      // B. Check Cookie (Backup)
      // Checks if "admin_session" exists in the cookie string
      const hasCookie = document.cookie.split(';').some((item) => item.trim().startsWith('admin_session='));
      if (hasCookie) return true;

      // C. Check LocalStorage (Fail-safe)
      if (typeof window !== 'undefined' && localStorage.getItem('app_user')) {
        return true;
      }

      return false;
    };

    if (checkAuth()) {
      setIsAuthorized(true);
    } else {
      // Not logged in -> Redirect
      router.replace('/login');
    }
    
    setIsChecking(false);
  }, [isLoading, user, router, pathname]);

  // Show loader while checking auth state
  if (isLoading || isChecking || !isAuthorized) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-100">
        <Loader2 className="w-10 h-10 text-blue-600 animate-spin" />
      </div>
    );
  }

  // Just render the children (The Sidebar will be applied by the nested layout)
  return <>{children}</>;
}