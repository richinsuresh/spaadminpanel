'use client';

import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { useRouter } from 'next/navigation';

export type AppUser = {
  username: string;
  role: 'staff' | 'developer';
};

interface UserContextType {
  user: AppUser | null;
  isLoading: boolean; // <--- This was likely missing
  login: (user: AppUser) => void;
  logout: () => void;
}

const UserContext = createContext<UserContextType | undefined>(undefined);

export function UserProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AppUser | null>(null);
  const [isLoading, setIsLoading] = useState(true); // <--- Initialize as true
  const router = useRouter();

  useEffect(() => {
    // Check local storage on mount
    const stored = localStorage.getItem('app_user');
    if (stored) {
      try {
        setUser(JSON.parse(stored));
      } catch (e) {
        console.error("Failed to parse user session");
      }
    }
    setIsLoading(false); // <--- Mark loading as done
  }, []);

  const login = (userData: AppUser) => {
    setUser(userData);
    localStorage.setItem('app_user', JSON.stringify(userData));
    // Set a cookie as a backup for middleware/layouts
    document.cookie = "admin_session=true; path=/; max-age=86400"; 
  };

  const logout = () => {
    setUser(null);
    localStorage.removeItem('app_user');
    document.cookie = "admin_session=; path=/; expires=Thu, 01 Jan 1970 00:00:00 UTC;";
    router.push('/login');
  };

  return (
    <UserContext.Provider value={{ user, isLoading, login, logout }}>
      {children}
    </UserContext.Provider>
  );
}

export function useUser() {
  const context = useContext(UserContext);
  if (!context) {
    throw new Error('useUser must be used within UserProvider');
  }
  return context;
}