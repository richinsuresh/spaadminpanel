'use client'; 

import { useState, useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link'; 

export default function OutletDashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [outletName, setOutletName] = useState('Outlet Panel');
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
  
  const navItems = [
    { name: 'Sales & Check-out', href: '/outlet/dashboard/sales', icon: '💰' },
    { name: 'Expenses', href: '/outlet/dashboard/expenses', icon: '💸' },
    { name: 'New Package Sale', href: '/outlet/dashboard/packages/new', icon: '📦' }, // Added new package page
    // { name: 'Customers', href: '/outlet/dashboard/customers', icon: '👥' },
  ];
  
  const getLinkClass = (href: string) => {
    // Check if pathname starts with the item's href for active state, e.g., /packages/new is active when /packages is active
    const isActive = pathname === href || pathname.startsWith(href) || (href === '/outlet/dashboard/sales' && pathname === '/outlet/dashboard');
    
    return `flex items-center px-6 py-3 text-sm font-medium transition-colors ${
      isActive
        ? 'bg-red-900/50 text-white border-r-4 border-red-500' // Active link
        : 'text-gray-400 hover:bg-gray-800 hover:text-white'   // Inactive link
    }`;
  };

  return (
    // Base layout: uses flex to handle the content next to the sidebar on desktop
    <div className="flex min-h-screen bg-gray-100">
      
      {/* Mobile Overlay */}
      {isSidebarOpen && (
        <div 
          className="fixed inset-0 z-20 bg-black/50 md:hidden"
          onClick={() => setIsSidebarOpen(false)}
        ></div>
      )}

      {/* Sidebar */}
      {/* On mobile, it slides in/out. On desktop (md:), it is fixed and takes up 64 units of width. */}
      <div 
        className={`fixed inset-y-0 left-0 z-30 w-64 bg-gray-900 shadow-xl flex flex-col 
          transform transition-transform duration-300 ease-in-out 
          ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'}
          
          md:translate-x-0 md:fixed md:h-full md:flex-shrink-0 md:border-r border-gray-700`}
          // Removed md:static md:inset-0, added md:fixed md:h-full
      >
        <div className="p-6 border-b border-gray-700">
          <h1 className="text-xl font-bold text-red-600" title={outletName}>
            {outletName}
          </h1>
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
        
        <div className="p-6 border-t border-gray-700">
          <button
            onClick={handleLogout}
            className="w-full flex items-center justify-center gap-2 px-4 py-2 text-sm bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
          >
            <span>🚪</span>
            Logout
          </button>
        </div>
      </div>

      {/* Main Content Wrapper */}
      {/* md:ml-64 creates the offset for the fixed sidebar. min-w-0 prevents content overflow on mobile. */}
      <div className="flex-1 flex flex-col md:ml-64 min-w-0">
        
        {/* Mobile header (Sticky for better navigation) */}
        <div className="md:hidden sticky top-0 z-10 flex items-center justify-between bg-gray-900 p-4 shadow-xl">
          <button 
            onClick={() => setIsSidebarOpen(true)}
            className="text-gray-400 hover:text-white p-2"
            aria-label="Open navigation"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
          <h1 className="text-lg font-bold text-red-600">{outletName}</h1>
          <div className="w-6 h-6"></div> {/* Placeholder for balance */}
        </div>
        
        <main className="flex-1 bg-gray-100">
          {/* Inner content padding */}
          <div className="max-w-7xl mx-auto p-4 md:p-8">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}