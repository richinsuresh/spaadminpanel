// src/app/(protected)/dashboard/layout.tsx
'use client'; 

import Link from 'next/link';
import { usePathname } from 'next/navigation';
// --- FIX: Import useState for mobile menu ---
import { useState } from 'react';

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  // --- FIX: Add state to manage sidebar visibility on mobile ---
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
    
    return `flex items-center px-6 py-3 text-sm font-medium transition-colors ${
        isActive
          ? 'bg-purple-50 text-purple-700 border-r-4 border-purple-600'
          : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
      }`;
  };

  return (
    // --- FIX: Main wrapper ---
    <div className="flex min-h-screen bg-gray-50">
      
      {/* --- NEW: Mobile Sidebar Overlay --- */}
      {isSidebarOpen && (
        <div 
          className="fixed inset-0 z-20 bg-black/30 md:hidden"
          onClick={() => setIsSidebarOpen(false)}
        ></div>
      )}

      {/* --- FIX: Admin Sidebar (Made responsive) --- */}
      <div 
        className={`fixed inset-y-0 left-0 z-30 w-64 bg-white shadow-md transform ${
          isSidebarOpen ? 'translate-x-0' : '-translate-x-full'
        } transition-transform duration-300 ease-in-out md:translate-x-0 md:static md:inset-0`}
      >
        <div className="p-6 border-b border-gray-200">
          <h1 className="text-xl font-bold text-purple-700">Admin Panel</h1>
        </div>
        <nav className="mt-6">
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={getLinkClass(item.href)}
              onClick={() => setIsSidebarOpen(false)} // Close on link click
            >
              <span className="mr-3 text-lg w-6 text-center">{item.icon}</span>
              {item.name}
            </Link>
          ))}
        </nav>
      </div>

      {/* --- FIX: Main Content (Made responsive) --- */}
      <div className="flex-1 flex flex-col md:ml-64">
        
        {/* --- NEW: Mobile Header --- */}
        <div className="md:hidden sticky top-0 z-10 flex items-center justify-between bg-white p-4 shadow-sm">
          <button 
            onClick={() => setIsSidebarOpen(true)}
            className="text-gray-500 hover:text-gray-700"
            aria-label="Open navigation"
          >
            {/* Hamburger Icon */}
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
          <h1 className="text-lg font-bold text-purple-700">Admin Panel</h1>
          <div></div> {/* Spacer */}
        </div>
        
        {/* --- Main Content --- */}
        <main className="flex-1 p-4 md:p-8">
          <div className="max-w-7xl mx-auto">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
