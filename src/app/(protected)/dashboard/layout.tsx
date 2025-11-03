// src/app/(protected)/dashboard/layout.tsx
'use client'; 

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  
  const navItems = [
    { name: 'Home', href: '/dashboard', icon: '🏠' },
    { name: 'All Customers', href: '/dashboard/customers', icon: '👥' },
    { name: 'Package Clients', href: '/dashboard/packages', icon: '📦' },
    { name: 'Outlets', href: '/dashboard/outlets', icon: '🏪' },
    { name: 'Sales', href: '/dashboard/sales', icon: '💰' },
    { name: 'Attendance', href: '/dashboard/attendance', icon: '📅' },
  ];
  
  const getLinkClass = (href: string) => {
    const isActive = pathname === href || (href !== '/dashboard' && pathname.startsWith(href));
    
    // --- UPDATED THEME ---
    return `flex items-center px-6 py-3 text-sm font-medium transition-colors ${
        isActive
          ? 'bg-red-900/50 text-white border-r-4 border-red-500' // Active link
          : 'text-gray-400 hover:bg-gray-800 hover:text-white' // Inactive link
      }`;
  };

  return (
    // --- UPDATED THEME: Changed background to light gray ---
    <div className="flex min-h-screen bg-gray-100">
      
      {isSidebarOpen && (
        <div 
          className="fixed inset-0 z-20 bg-black/50 md:hidden"
          onClick={() => setIsSidebarOpen(false)}
        ></div>
      )}

      {/* --- UPDATED THEME: Sidebar is now dark --- */}
      <div 
        className={`fixed inset-y-0 left-0 z-30 w-64 bg-gray-900 shadow-xl transform ${
          isSidebarOpen ? 'translate-x-0' : '-translate-x-full'
        } transition-transform duration-300 ease-in-out md:translate-x-0 md:static md:inset-0`}
      >
        <div className="p-6 border-b border-gray-700">
          {/* --- UPDATED THEME: Title is now red --- */}
          <h1 className="text-xl font-bold text-red-600">Admin Panel</h1>
        </div>
        <nav className="mt-6">
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

      {/* Main Content */}
      <div className="flex-1 flex flex-col md:ml-64">
        
        {/* --- UPDATED THEME: Mobile header is dark --- */}
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
          <h1 className="text-lg font-bold text-red-600">Admin Panel</h1>
          <div></div> {/* Spacer */}
        </div>
        
        {/* --- UPDATED THEME: Padding increased --- */}
        <main className="flex-1 p-6 md:p-10">
          <div className="max-w-7xl mx-auto">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}