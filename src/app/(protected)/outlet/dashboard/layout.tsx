// src/app/(protected)/outlet/dashboard/layout.tsx
'use client'; 

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function OutletDashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const [outletName, setOutletName] = useState('Outlet Panel');

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

  return (
    <div className="flex min-h-screen bg-gray-50">
      {/* --- SIDEBAR (Now just a header and logout) --- */}
      <div className="w-64 bg-white shadow-xl flex flex-col">
        <div className="p-6 border-b border-gray-200">
          <h1 className="text-xl font-bold text-blue-700" title="Outlet Panel">
            {outletName}
          </h1>
        </div>
        
        {/* --- Navigation Removed --- */}
        <div className="flex-1 mt-6">
           {/* You can add a link back to the sales page if needed */}
           <a
              href="/outlet/dashboard/sales"
              className="flex items-center px-6 py-3 text-sm font-medium bg-blue-50 text-blue-700 border-r-4 border-blue-600"
            >
              <span className="mr-3 text-lg w-6 text-center">💰</span>
              Sales
            </a>
        </div>
        
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

      {/* Main Content (This will be the Sales Page) */}
      <div className="flex-1 p-8 overflow-y-auto">
        <div className="max-w-7xl mx-auto">
          {children}
        </div>
      </div>
    </div>
  );
}