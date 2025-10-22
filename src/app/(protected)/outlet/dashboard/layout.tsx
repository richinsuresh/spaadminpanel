// src/app/(protected)/outlet/dashboard/layout.tsx
'use client'; 

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';

export default function OutletDashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();

  // Links for Outlet Staff
  const navItems = [
    { name: 'Summary', href: '/outlet/dashboard', icon: '🏠' },
    { name: 'All Customers', href: '/outlet/dashboard/customers', icon: '👥' },
    { name: 'Package Clients', href: '/outlet/dashboard/packages', icon: '🎁' },
    { name: 'Attendance', href: '/outlet/dashboard/attendance', icon: '📅' },
  ];
  
  // Handles logout by clearing cookies and redirecting to login page
  const handleLogout = () => {
    document.cookie = 'auth_role=; Max-Age=0; path=/';
    document.cookie = 'outlet_id=; Max-Age=0; path=/';
    router.push('/outlet-login');
  };

  return (
    <div className="flex min-h-screen bg-gray-50">
      {/* Sidebar */}
      <div className="w-64 bg-white shadow-xl flex flex-col">
        <div className="p-6 border-b border-gray-200">
          <h1 className="text-xl font-bold text-blue-700">Outlet Panel</h1>
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
                    ? 'bg-blue-50 text-blue-700 border-r-4 border-blue-600' // Handle nested routes like /outlet/dashboard/customers
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
            className="w-full flex items-center justify-center gap-2 px-4 py-2 text-sm bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors"
          >
            <span className="text-lg">🚪</span>
            Logout
          </button>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 p-8 overflow-y-auto">
        <div className="max-w-7xl mx-auto">
          {children}
        </div>
      </div>
    </div>
  );
}
