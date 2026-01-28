'use client'; 

import { useState, useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link'; 
import { supabase } from '@/lib/supabase';
import { Menu, X, LogOut, LayoutDashboard, Receipt, UserPlus, Clock, Wifi } from 'lucide-react';

export default function OutletDashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [outletName, setOutletName] = useState('Outlet Panel');
  const [outletId, setOutletId] = useState<string | null>(null);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  
  // Connection State for visual confirmation
  const [isConnected, setIsConnected] = useState(false);

  useEffect(() => {
    async function fetchOutletSession() {
      try {
        const res = await fetch('/api/outlet');
        const data = await res.json();
        if (data.outletName) {
          setOutletName(data.outletName);
        }
        if (data.outletId) {
          setOutletId(data.outletId);
        }
      } catch (err) {
        console.error("Could not fetch outlet session", err);
      }
    }
    fetchOutletSession();
  }, []);

  const handleLogout = () => {
    document.cookie = 'auth_role=; Max-Age=0; path=/';
    document.cookie = 'outlet_id=; Max-Age=0; path=/';
    router.push('/outlet-login');
  };

  // --- REALTIME PRESENCE & COMMAND LISTENER ---
  useEffect(() => {
    if (!outletId) return;

    const channel = supabase.channel('online-outlets');

    channel
      .on('broadcast', { event: 'force_logout' }, (payload) => {
          console.log('Received forced logout command:', payload);
          // Trigger the logout logic
          handleLogout();
          alert('Session expired by admin.');
      })
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          setIsConnected(true); 
          await channel.track({
            outlet_id: outletId,
            outlet_name: outletName,
            online_at: new Date().toISOString(),
          });
        }
      });

    return () => {
      supabase.removeChannel(channel);
      setIsConnected(false);
    };
  }, [outletId, outletName]);
  
  const navItems = [
    { name: 'New Client', href: '/outlet/dashboard/client-form/[outletId]', icon: <UserPlus size={18} /> },
    { name: 'Sales & Check-out', href: '/outlet/dashboard/sales', icon: <LayoutDashboard size={18} /> },
    { name: 'Expenses', href: '/outlet/dashboard/expenses', icon: <Receipt size={18} /> },
    { name: 'Attendance', href: '/outlet/dashboard/attendance', icon: <Clock size={18} /> },
  ];
  
  const resolveHref = (href: string) => {
    if (href.includes('[outletId]')) {
      return href.replace('[outletId]', outletId || 'pending');
    }
    return href;
  };

  const getLinkClass = (rawHref: string) => {
    const resolvedHref = resolveHref(rawHref);
    const isActive = pathname === resolvedHref || 
                     (resolvedHref !== '/outlet/dashboard/sales' && pathname.startsWith(resolvedHref)) || 
                     (resolvedHref === '/outlet/dashboard/sales' && pathname === '/outlet/dashboard');
                     
    return `flex items-center px-6 py-3 text-sm font-medium transition-colors ${
      isActive 
        ? 'bg-red-900/50 text-white border-r-4 border-red-500' 
        : 'text-gray-400 hover:bg-gray-800 hover:text-white'
    }`;
  };

  return (
    <div className="flex min-h-screen bg-gray-100 text-black">
      {/* Mobile Sidebar Overlay */}
      {isSidebarOpen && (
        <div 
          className="fixed inset-0 z-40 bg-black/60 md:hidden backdrop-blur-sm"
          onClick={() => setIsSidebarOpen(false)}
        ></div>
      )}

      {/* Responsive Sidebar */}
      <div 
        className={`fixed inset-y-0 left-0 z-50 w-64 bg-gray-900 shadow-xl flex flex-col transform transition-transform duration-300 ease-in-out 
          ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'} md:translate-x-0 md:fixed md:h-full md:border-r border-gray-700`}
      >
        <div className="p-6 border-b border-gray-700 flex justify-between items-center">
          <div>
              <h1 className="text-xl font-bold text-red-600 truncate" title={outletName}>
                {outletName}
              </h1>
              {/* Connection Status Indicator */}
              <div className={`text-[10px] font-bold uppercase mt-1 flex items-center gap-1.5 ${isConnected ? 'text-emerald-500' : 'text-gray-500'}`}>
                  <Wifi size={10} className={isConnected ? 'animate-pulse' : ''} />
                  {isConnected ? 'System Online' : 'Connecting...'}
              </div>
          </div>
          <button className="md:hidden text-gray-400" onClick={() => setIsSidebarOpen(false)}>
            <X size={24} />
          </button>
        </div>
        
        <nav className="flex-1 mt-6">
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={resolveHref(item.href)}
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
            <LogOut size={16} />
            Logout
          </button>
        </div>
      </div>

      {/* Main Content Wrapper */}
      <div className="flex-1 flex flex-col md:ml-64 min-w-0 overflow-hidden">
        
        {/* Mobile Header */}
        <header className="md:hidden sticky top-0 z-30 flex items-center justify-between bg-gray-900 p-4 shadow-xl">
          <button 
            onClick={() => setIsSidebarOpen(true)}
            className="text-gray-400 hover:text-white p-2"
          >
            <Menu size={24} />
          </button>
          <h1 className="text-lg font-bold text-red-600 truncate px-2">{outletName}</h1>
          <div className="w-8"></div>
        </header>
        
        <main className="flex-1 bg-gray-100 overflow-y-auto">
          <div className="max-w-7xl mx-auto p-4 md:p-8">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}