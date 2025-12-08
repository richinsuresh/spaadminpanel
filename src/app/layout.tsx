// app/(protected)/client-form/layout.tsx
import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
// --- MUST IMPORT THESE ---
import { UserProvider } from '@/context/UserContext';
import { NotificationProvider } from '@/components/NotificationSystem';

// Offline sync component (client-side) — runs background sync and shows queue status
import OfflineSync from '@/components/OfflineSync';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'Spa Admin Panel',
  description: 'Admin dashboard for managing spa outlets',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={inter.className}>
        {/* --- MUST WRAP CHILDREN --- */}
        <UserProvider>
          <NotificationProvider>
            {children}
            {/* Client-side background sync UI — mounts on all pages under this layout */}
            <OfflineSync />
          </NotificationProvider>
        </UserProvider>
      </body>
    </html>
  );
}
