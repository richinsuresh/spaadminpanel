// src/app/(protected)/layout.tsx
'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useUser } from '@/context/UserContext';
import { Loader2 } from 'lucide-react';
import SmartAssistant from '@/components/SmartAssistant';

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

      // 2) Server cookie set by /api/auth
      const authRole = readCookie('auth_role');
      if (authRole && authRole === 'admin') return true;

      // 3) Legacy cookie
      const adminSession = readCookie('admin_session');
      if (adminSession && adminSession !== '') return true;

      // 4) Legacy localStorage fallback
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
      router.replace('/admin-login');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoading, user, router]);

  if (isLoading || isChecking || !isAuthorized) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-100">
        <Loader2 className="w-10 h-10 text-blue-600 animate-spin" />
      </div>
    );
  }

  return (
    <>
      {children}
      <SmartAssistant />
    </>
  );
}
