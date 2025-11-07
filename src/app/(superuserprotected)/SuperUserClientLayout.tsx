'use client'; 

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState, ReactNode } from 'react';

export default function SuperUserClientLayout({
  children,
}: {
  children: ReactNode;
}) {
  const pathname = usePathname();
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  
  // Nav items pointing to the /superuser path
  const navItems = [
    { name: 'Home', href: '/superuser', icon: '匠' },
    { name: 'All Customers', href: '/superuser/customers', icon: '則' },
    { name: 'Package Clients', href: '/superuser/packages', icon: '逃' },
    { name: 'Outlets', href: '/superuser/outlets', icon: '宵' },
    { name: 'Sales', href: '/superuser/sales', icon: '腸' },
    { name: 'Attendance', href: '/superuser/attendance', icon: '套' },
  ];
  
  const getLinkClass = (href: string) => {
    const isActive = pathname === href || (href !== '/superuser' && pathname.startsWith(href));
    
    return `flex items-center px-6 py-3 text-sm font-medium transition-colors ${
        isActive
          ? 'bg-red-900/50 text-white border-r-4 border-red-500'
          : 'text-gray-400 hover:bg-gray-800 hover:text-white'
      }`;
  };

  return (
    <div className="flex min-h-screen bg-gray-100">
      
      {isSidebarOpen && (
        <div 
          className="fixed inset-0 z-20 bg-black/50 md:hidden"
          onClick={() => setIsSidebarOpen(false)}
        ></div>
      )}

      {/* Dark Sidebar */}
      <div 
        className={`fixed inset-y-0 left-0 z-30 w-64 bg-gray-900 shadow-xl flex flex-col transform ${
          isSidebarOpen ? 'translate-x-0' : '-translate-x-full'
        } transition-transform duration-300 ease-in-out md:translate-x-0 md:static md:inset-0`}
      >
        <div className="p-6 border-b border-gray-700">
          <h1 className="text-xl font-bold text-red-600">SuperUser Panel</h1>
        </div>
        <nav className="flex-1 mt-6">
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={getLinkClass(item.href)}
              onClick={() => setIsSidebarOpen(false)} 
            >
              <span className="mr-3 text-lg w-6 text-center">{item.icon}</span>
              {item.name}
            </Link>
          ))}
        </nav>
      </div>

      {/* Main Content Wrapper */}
      <div className="flex-1 flex flex-col md:ml-64">
        
        {/* Mobile Header */}
        <div className="md:hidden sticky top-0 z-10 flex items-center justify-between bg-gray-900 p-4 shadow-sm">
          <button 
            onClick={() => setIsSidebarOpen(true)}
            className="text-gray-400 hover:text-white"
            aria-label="Open navigation"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
          <h1 className="text-lg font-bold text-red-600">SuperUser Panel</h1>
          <div></div> {/* Spacer */}
        </div>
        
        <main className="flex-1 bg-white">
          <div className="max-w-7xl mx-auto p-6 md:p-10">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}