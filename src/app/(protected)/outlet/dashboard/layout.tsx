// src/app/(protected)/outlet/dashboard/layout.tsx
'use client'; 

import { useState, useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link'; // Import Link

export default function OutletDashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [outletName, setOutletName] = useState('Outlet Panel');
  // --- FIX: Add state to manage sidebar visibility on mobile ---
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  // Fetch outlet name from our secure API
  useEffect(() => {
    async function fetchOutletSession() {
      try {
        const res = await fetch('/api/outlet');
        const data = await res.json();
        if (data.outletName) {
          setOutletName(data.outletName);
        }
      } catch (err) {
        console.error("Could not fetch outlet session", err);
      }
    }
    fetchOutletSession();
  }, []);

  // Handles logout
  const handleLogout = () => {
    document.cookie = 'auth_role=; Max-Age=0; path=/';
    document.cookie = 'outlet_id=; Max-Age=0; path=/';
    router.push('/outlet-login');
  };
  
  // --- NEW: Navigation items for outlet ---
  const navItems = [
    { name: 'Sales & Check-out', href: '/outlet/dashboard/sales', icon: '💰' },
    // Add more outlet-specific links here if you want
    // { name: 'Customers', href: '/outlet/dashboard/customers', icon: '👥' },
    // { name: 'Packages', href: '/outlet/dashboard/packages', icon: '📦' },
  ];
  
  const getLinkClass = (href: string) => {
    const isActive = pathname === href || pathname.startsWith(href);
    return `flex items-center px-6 py-3 text-sm font-medium transition-colors ${
        isActive
          ? 'bg-blue-50 text-blue-700 border-r-4 border-blue-600'
          : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
      }`;
  };

  return (
    <div className="flex min-h-screen bg-gray-50">
      
      {/* --- NEW: Mobile Sidebar Overlay --- */}
      {isSidebarOpen && (
        <div 
          className="fixed inset-0 z-20 bg-black/30 md:hidden"
          onClick={() => setIsSidebarOpen(false)}
        ></div>
      )}

      {/* --- FIX: SIDEBAR (Made responsive) --- */}
      <div 
        className={`fixed inset-y-0 left-0 z-30 w-64 bg-white shadow-xl flex flex-col transform ${
          isSidebarOpen ? 'translate-x-0' : '-translate-x-full'
        } transition-transform duration-300 ease-in-out md:translate-x-0 md:static md:inset-0`}
      >
        <div className="p-6 border-b border-gray-200">
          <h1 className="text-xl font-bold text-blue-700" title="Outlet Panel">
            {outletName}
          </h1>
        </div>
        
        {/* --- UPDATED: Navigation --- */}
        <nav className="flex-1 mt-6">
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
        
        {/* Logout Button */}
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
          <h1 className="text-lg font-bold text-blue-700">{outletName}</h1>
          <div></div> {/* Spacer */}
        </div>
        
        {/* --- Main Content Area --- */}
        <main className="flex-1 p-4 md:p-8">
          <div className="max-w-7xl mx-auto">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
