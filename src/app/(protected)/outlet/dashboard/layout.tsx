// src/app/(protected)/outlet/dashboard/layout.tsx
'use client'; 

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
// --- REMOVED: OUTLETS import ---

export default function OutletDashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [outletName, setOutletName] = useState('Outlet Panel');

  // --- MODIFIED: Fetch name from your API ---
  useEffect(() => {
    async function fetchOutletSession() {
      try {
        const res = await fetch('/api/outlet'); // Use your existing route
        const data = await res.json();
        if (data.outletName) {
          setOutletName(data.outletName);
        }
      } catch (err) {
        console.error("Could not fetch outlet session", err);
      }
    }
    fetchOutletSession();
  }, []); // Runs once on mount

  const navItems = [
    { name: 'Summary', href: '/outlet/dashboard', icon: '📊' },
    { name: 'All Customers', href: '/outlet/dashboard/customers', icon: '👥' },
    { name: 'Package Clients', href: '/outlet/dashboard/packages', icon: '📦' },
    { name: 'Sales', href: '/outlet/dashboard/sales', icon: '💰' },
    { name: 'Attendance', href: '/outlet/dashboard/attendance', icon: '📅' },
  ];
  
  const handleLogout = () => {
    document.cookie = 'auth_role=; Max-Age=0; path=/';
    document.cookie = 'outlet_id=; Max-Age=0; path=/';
    router.push('/outlet-login');
  };

  return (
    <div className="flex min-h-screen bg-gray-50">
      <div className="w-64 bg-white shadow-xl flex flex-col">
        <div className="p-6 border-b border-gray-200">
          <h1 className="text-xl font-bold text-blue-700" title="Outlet Panel">
            {outletName}
          </h1>
        </div>
        <nav className="flex-1 mt-6">
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center px-6 py-3 text-sm font-medium transition-colors ${
                pathname === item.href
                  ? 'bg-blue-50 text-blue-700 border-r-4 border-blue-600'
                  : pathname.startsWith(item.href) && item.href !== '/outlet/dashboard'
                    ? 'bg-blue-50 text-blue-700 border-r-4 border-blue-600'
                    : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
              }`}
            >
              <span className="mr-3 text-lg w-6 text-center">{item.icon}</span>
              {item.name}
            </Link>
          ))}
        </nav>
        
        <div className="p-6 border-t border-gray-200">
          <button
            onClick={handleLogout}
            className="w-full flex items-center justify-center gap-2 px-4 py-2 text-sm bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors"
          >
            <span>🚪</span>
            Logout
          </button>
        </div>
      </div>
      <div className="flex-1 p-8 overflow-y-auto">
        <div className="max-w-7xl mx-auto">
          {children}
        </div>
      </div>
    </div>
  );
}