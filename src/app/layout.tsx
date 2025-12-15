// src/app/layout.tsx
import type { Metadata, Viewport } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import { UserProvider } from '@/context/UserContext';
import { NotificationProvider } from '@/components/NotificationSystem';
import OfflineSync from '@/components/OfflineSync';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'Spa Admin Panel',
  description: 'Admin dashboard for managing spa outlets',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'Spa Admin',
  },
};

export const viewport: Viewport = {
  themeColor: '#ffffff',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={inter.className}>
        {/* UserProvider wraps everything, allowing child layouts to use useUser */}
        <UserProvider>
          <NotificationProvider>
            {children}
            <OfflineSync />
          </NotificationProvider>
        </UserProvider>
      </body>
    </html>
  );
}