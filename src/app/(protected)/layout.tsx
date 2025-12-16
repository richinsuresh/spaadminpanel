// src/app/(protected)/layout.tsx
'use client';

import { useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useUser } from '@/context/UserContext';
import { Loader2 } from 'lucide-react';
import SaleReminderPoller from '@/components/SaleReminderPoller'; // <-- IMPORT THE POLLER

function readCookie(name: string) {
  if (typeof document === 'undefined') return null;
  const match = document.cookie.split(';').map(s => s.trim()).find(s => s.startsWith(name + '='));
  if (!match) return null;
  return match.split('=').slice(1).join('=');
}

export default function ProtectedLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { user, isLoading } = useUser();
  const [isChecking, setIsChecking] = useState(true);
  const [isAuthorized, setIsAuthorized] = useState(false);

  useEffect(() => {
    if (isLoading) return;

    const checkAuth = () => {
      // 1) Context
      if (user) return true;

      // 2) Server cookie set by /api/auth (recommended)
      const authRole = readCookie('auth_role');
      if (authRole && authRole === 'admin') return true;

      // 3) Legacy cookie
      const adminSession = readCookie('admin_session');
      if (adminSession && adminSession !== '') return true;

      // 4) Offline session flag
      try {
        if (typeof window !== 'undefined') {
          const offlineFlag = sessionStorage.getItem('offline_admin_logged_in');
          if (offlineFlag === '1' || offlineFlag === 'true') return true;
        }
      } catch (e) { /* ignore */ }

      // 5) Legacy localStorage fallback
      try {
        if (typeof window !== 'undefined') {
          const appUser = localStorage.getItem('app_user');
          if (appUser) return true;
        }
      } catch (e) { /* ignore */ }

      return false;
    };

    const ok = checkAuth();
    setIsAuthorized(ok);
    setIsChecking(false);

    if (!ok) {
      const preferred = '/admin-login';
      router.replace(preferred);
    }
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

  return (
    <>
      {/* 🛑 ADD THE GLOBAL POLLER HERE 🛑 */}
      <SaleReminderPoller /> 
      {children}
    </>
  );
}