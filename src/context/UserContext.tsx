"use client";

// src/context/UserContext.tsx
import { createContext, useContext, useState, ReactNode } from 'react';

type Role = 'admin' | 'developer' | 'staff';

type User = {
  username: string;
  role: Role;
};

type UserContextValue = {
  user: User | null;
  isLoading: boolean;
  login: (u: User) => void;
  logout: () => void;
};

const UserContext = createContext<UserContextValue | undefined>(undefined);

export function UserProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(() => {
    if (typeof window === 'undefined') return null;
    try {
      const raw = localStorage.getItem('app_user');
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  });

  const [isLoading] = useState(false);

  const login = (u: User) => {
    setUser(u);
    try {
      localStorage.setItem('app_user', JSON.stringify(u));
    } catch {}
  };

  const logout = () => {
    setUser(null);
    try {
      localStorage.removeItem('app_user');
      sessionStorage.removeItem('offline_admin_logged_in');
      document.cookie = 'admin_session=; path=/; max-age=0';
      document.cookie = 'auth_role=; path=/; max-age=0';
    } catch {}
  };

  return (
    <UserContext.Provider value={{ user, isLoading, login, logout }}>
      {children}
    </UserContext.Provider>
  );
}

export function useUser() {
  const ctx = useContext(UserContext);
  if (!ctx) {
    throw new Error("useUser must be used inside UserProvider");
  }
  return ctx;
}
