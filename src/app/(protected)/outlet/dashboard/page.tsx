'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useState, useEffect } from 'react';
import { OUTLETS } from '@/lib/outlet';

export default function OutletDashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [outletName, setOutletName] = useState('Loading...');
  const [outletId, setOutletId] = useState<string | null>(null);

  useEffect(() => {
    // Client-side reading of cookies
    const id = document.cookie.split('; ').find(row => row.startsWith('outlet_id='))?.split('=')[1] ?? null;
    setOutletId(id);
    
    if (id) {
      const outlet = OUTLETS.find(o => o.id === id);
      if (outlet) setOutletName(outlet.name);
    } else {
      // Should be caught by the server layout, but ensures client redirect if cookie is suddenly missing
      router.replace('/outlet-login'); 
    }
  }, [router]);

  const handleLogout = () => {
    // Clear cookies for auth_role and outlet_id
    document.cookie = 'auth_role=; Max-Age=0; path=/';
    document.cookie = 'outlet_id=; Max-Age=0; path=/';
    router.push('/outlet-login');
  };
  
  // Base path for navigation
  const basePath = '/outlet/dashboard';

  const navItems = [
    { name: 'Summary', href: `${basePath}`, icon: '🏠' },
    { name: 'Customers', href: `${basePath}/customers`, icon: '👤' },
    { name: 'Packages', href: `${basePath}/packages`, icon: '🎁' },
    { name: 'Attendance', href: `${basePath}/attendance`, icon: '📅' },
  ];

  return (
    <div className="flex min-h-screen bg-gray-50">
      {/* Sidebar */}
      <div className="w-64 bg-white shadow-md flex flex-col">
        <div className="p-6 border-b border-gray-200">
          <h1 className="text-xl font-bold text-blue-700">Outlet Panel</h1>
          <p className="text-sm text-gray-500 mt-1 truncate">{outletName}</p>
        </div>
        <nav className="mt-6 flex-1">
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center px-6 py-3 text-sm font-medium ${
                pathname === item.href || (item.href === basePath && pathname === `${basePath}/`)
                  ? 'bg-blue-50 text-blue-700 border-r-4 border-blue-600'
                  : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
              }`}
            >
              <span className="mr-3 text-lg">{item.icon}</span>
              {item.name}
            </Link>
          ))}
        </nav>
        
        {/* Logout Button */}
        <div className="p-6 border-t border-gray-200">
          <button
            onClick={handleLogout}
            className="w-full text-left px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-100 text-gray-700 transition"
          >
            Logout
          </button>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 p-8">
        <div className="max-w-7xl mx-auto">
          {children}
        </div>
      </div>
    </div>
  );
}