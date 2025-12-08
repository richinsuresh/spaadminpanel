// src/components/ProtectedLayout.tsx  (or wherever your layout lives)
'use client';

import { useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useUser } from '@/context/UserContext';
import { Loader2 } from 'lucide-react';

/**
 * ProtectedLayout (client)
 * - Waits for UserContext
 * - Accepts multiple auth signals:
 *    1) user context
 *    2) auth_role cookie (from /api/auth)
 *    3) admin_session cookie (legacy)
 *    4) sessionStorage.offline_admin_logged_in (offline fallback)
 *    5) localStorage.app_user (legacy fallback)
 * - Redirects to /admin-login (preferred) or /login if you still use it.
 */

function readCookie(name: string) {
  if (typeof document === 'undefined') return null;
  const match = document.cookie.split(';').map(s => s.trim()).find(s => s.startsWith(name + '='));
  if (!match) return null;
  return match.split('=').slice(1).join('=');
}

export default function ProtectedLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { user, isLoading } = useUser();
  const [isChecking, setIsChecking] = useState(true);
  const [isAuthorized, setIsAuthorized] = useState(false);

  useEffect(() => {
    if (isLoading) return; // wait for user context to initialize

    const checkAuth = () => {
      // 1) Context
      if (user) return true;

      // 2) Server cookie set by /api/auth (recommended)
      const authRole = readCookie('auth_role');
      if (authRole && authRole === 'admin') return true;

      // 3) Legacy cookie (some code sets admin_session=true)
      const adminSession = readCookie('admin_session');
      if (adminSession && adminSession !== '') return true;

      // 4) Offline session flag stored in sessionStorage after offline login
      try {
        if (typeof window !== 'undefined') {
          const offlineFlag = sessionStorage.getItem('offline_admin_logged_in');
          if (offlineFlag === '1' || offlineFlag === 'true') return true;
        }
      } catch (e) {
        // ignore
      }

      // 5) Legacy localStorage fallback (still accepted)
      try {
        if (typeof window !== 'undefined') {
          const appUser = localStorage.getItem('app_user');
          if (appUser) return true;
        }
      } catch (e) {
        // ignore
      }

      return false;
    };

    const ok = checkAuth();
    setIsAuthorized(ok);
    setIsChecking(false);

    if (!ok) {
      // choose the login route you use. Prefer /admin-login to avoid 404.
      const preferred = '/admin-login';
      // fallback: if you still have /login in your app, we try that too
      router.replace(preferred);
    }
    // We intentionally skip pathname in deps to avoid redirect loops on small route changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoading, user, router]);

  // Show loader while checking
  if (isLoading || isChecking || !isAuthorized) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-100">
        <Loader2 className="w-10 h-10 text-blue-600 animate-spin" />
      </div>
    );
  }

  return <>{children}</>;
}
