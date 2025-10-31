// src/app/(protected)/dashboard/layout.tsx
'use client'; 

import Link from 'next/link';
import { usePathname } from 'next/navigation';

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  
  const navItems = [
    { name: 'Home', href: '/dashboard', icon: '📊' },
    { name: 'All Customers', href: '/dashboard/customers', icon: '👥' },
    { name: 'Package Clients', href: '/dashboard/packages', icon: '📦' },
    { name: 'Outlets', href: '/dashboard/outlets', icon: '🏪' },
    { name: 'Sales', href: '/dashboard/sales', icon: '💰' },
    { name: 'Attendance', href: '/dashboard/attendance', icon: '📅' },
  ];
  
  const getLinkClass = (href: string) => {
    const isActive = pathname === href || (href !== '/dashboard' && pathname.startsWith(href));
    
    return `flex items-center px-6 py-3 text-sm font-medium transition-colors ${
        isActive
          ? 'bg-purple-50 text-purple-700 border-r-4 border-purple-600'
          : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
      }`;
  };

  return (
    <div className="flex min-h-screen bg-gray-50">
      {/* Admin Sidebar */}
      <div className="w-64 bg-white shadow-md">
        <div className="p-6 border-b border-gray-200">
          <h1 className="text-xl font-bold text-purple-700">Berry Spa Admin</h1>
        </div>
        <nav className="mt-6">
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={getLinkClass(item.href)}
            >
              <span className="mr-3 text-lg w-6 text-center">{item.icon}</span>
              {item.name}
            </Link>
          ))}
        </nav>
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