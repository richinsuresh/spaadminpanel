// src/app/(protected)/dashboard/NavigationWrapper.tsx
'use client'; 

import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import Link from 'next/link';
import {
  LayoutDashboard,
  Users,
  Building,
  Box,
  LogOut,
  Calendar,
  FileText,
  Search,
  UserPlus,
  Briefcase,
  User,
  Menu,
  X,
  History,
  Activity, // <--- Added for Activity Log icon
  ShieldCheck
} from 'lucide-react';

import { useUser } from '@/context/UserContext';
import { supabase } from '@/lib/supabase';

export default function NavigationWrapper({ children }: { children: React.ReactNode }) {
  const { logout, user } = useUser();
  const [hasMounted, setHasMounted] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  
  // --- Developer Stats State ---
  const [overdueCount, setOverdueCount] = useState(0);
  const [pendingVerifyCount, setPendingVerifyCount] = useState(0);

  const pathname = usePathname();

  useEffect(() => {
    setHasMounted(true);
  }, []);

  useEffect(() => {
    setIsSidebarOpen(false);
  }, [pathname]);

  // --- Developer Polling Logic (Remains Developer Only) ---
  useEffect(() => {
    if (user?.role !== 'developer') return;

    const fetchDevStats = async () => {
        try {
            const today = new Date().toISOString().split('T')[0];
            const now = new Date();

            // 1. Overdue Checkouts
            const { data: activeSessions } = await supabase
                .from('customers')
                .select('check_in_time, session_hours')
                .eq('date', today)
                .is('check_out_time', null)
                .not('check_in_time', 'is', null);
            
            let overdue = 0;
            if (activeSessions) {
                activeSessions.forEach(s => {
                    if (s.check_in_time && s.session_hours) {
                        const startTime = new Date(s.check_in_time).getTime();
                        const durationMs = s.session_hours * 60 * 60 * 1000;
                        if (now.getTime() > startTime + durationMs + 60000) {
                            overdue++;
                        }
                    }
                });
            }
            setOverdueCount(overdue);

            // 2. Pending Verifications
            const { count } = await supabase
                .from('customers')
                .select('*', { count: 'exact', head: true })
                .eq('date', today)
                .eq('is_package_customer', true)
                .eq('is_verified', false);
            
            setPendingVerifyCount(count || 0);

        } catch (err) {
            console.error("Error fetching dev stats:", err);
        }
    };

    fetchDevStats();
    const interval = setInterval(fetchDevStats, 30000);
    return () => clearInterval(interval);

  }, [user]);

  return (
    <div className="flex h-screen bg-gray-100 overflow-hidden">
      
      {/* --- MOBILE OVERLAY --- */}
      {isSidebarOpen && (
        <div 
          className="fixed inset-0 bg-black/50 z-20 lg:hidden transition-opacity"
          onClick={() => setIsSidebarOpen(false)}
        />
      )}

      {/* --- SIDEBAR --- */}
      <aside 
        className={`
          fixed inset-y-0 left-0 z-30 w-64 bg-white shadow-xl transform transition-transform duration-300 ease-in-out border-r border-gray-200
          lg:static lg:translate-x-0 
          ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'}
        `}
      >
        <div className="flex items-center justify-between p-4 h-16 border-b border-gray-200">
          <span className="font-bold text-xl text-blue-600">Admin Panel</span>
          <button 
            onClick={() => setIsSidebarOpen(false)} 
            className="lg:hidden text-gray-500 hover:text-gray-700"
          >
            <X size={24} />
          </button>
        </div>

        <nav className="flex-1 px-4 py-4 space-y-1 overflow-y-auto h-[calc(100vh-8rem)]">
          <SideNavItem icon={<LayoutDashboard size={20} />} text="Dashboard" href="/dashboard" />
          <SideNavItem icon={<UserPlus size={20} />} text="Add Customer" href="/form" />

          <div className="pt-4 pb-2 text-xs font-semibold text-gray-400 uppercase tracking-wider">
            Analytics
          </div>
          
          <SideNavItem 
            icon={<FileText size={20} />} 
            text="Sales Report" 
            href="/dashboard/sales" 
            badge={user?.role === 'developer' && overdueCount > 0 ? (
                <span className="bg-amber-500 text-white text-[10px] font-bold px-2 py-0.5 rounded-full ml-auto shadow-sm animate-pulse">
                    {overdueCount} Overdue
                </span>
            ) : null}
          />
          
          <SideNavItem icon={<FileText size={20} />} text="Expenses" href="/dashboard/expenses" />
          <SideNavItem icon={<Briefcase size={20} />} text="Staff Performance" href="/dashboard/employees" />
          <SideNavItem icon={<Calendar size={20} />} text="Attendance" href="/dashboard/attendance" />

          <div className="pt-4 pb-2 text-xs font-semibold text-gray-400 uppercase tracking-wider">
            Management
          </div>
          <SideNavItem icon={<Search size={20} />} text="Search Customers" href="/dashboard/search" />
          <SideNavItem icon={<Users size={20} />} text="Customer List" href="/dashboard/customers" />
          <SideNavItem icon={<Box size={20} />} text="Packages" href="/dashboard/packages" />
          
          {/* PACKAGE ACTIVITY: Public to all */}
          <SideNavItem 
            icon={<History size={20} />} 
            text="Package Activity" 
            href="/dashboard/packages/activity" 
            // Badge is visible ONLY to developers
            badge={user?.role === 'developer' && pendingVerifyCount > 0 ? (
                <span className="bg-rose-500 text-white text-[10px] font-bold px-2 py-0.5 rounded-full ml-auto shadow-sm">
                    {pendingVerifyCount} Verify
                </span>
            ) : null}
          />
          
          <SideNavItem icon={<Building size={20} />} text="Outlets" href="/dashboard/outlets" />
          <SideNavItem icon={<ShieldCheck size={20} />} text="Data Health Check" href="/dashboard/audit" />

          {/* ACTIVITY LOGS: Developer ONLY */}
          {user?.role === 'developer' && (
             <>
               <div className="pt-4 pb-2 text-xs font-semibold text-gray-400 uppercase tracking-wider">
                 System
               </div>
               <SideNavItem 
                 icon={<Activity size={20} />} 
                 text="Activity Logs" 
                 href="/dashboard/activity" 
               />
             </>
          )}

        </nav>

        <div className="p-4 border-t border-gray-200 absolute bottom-0 w-full bg-white">
          <button
            onClick={logout}
            className="flex w-full items-center p-3 rounded-lg text-sm font-medium text-red-600 hover:bg-red-50 transition-colors"
          >
            <LogOut size={20} />
            <span className="ml-3">Logout</span>
          </button>
        </div>
      </aside>

      {/* --- MAIN CONTENT WRAPPER --- */}
      <div className="flex-1 flex flex-col w-full overflow-hidden">
        
        {/* HEADER */}
        <header className="h-16 bg-white shadow-sm border-b border-gray-200 flex items-center justify-between lg:justify-end px-4 lg:px-8 z-10 shrink-0">
          
          <button 
            onClick={() => setIsSidebarOpen(true)}
            className="lg:hidden p-2 text-gray-600 hover:bg-gray-100 rounded-lg"
          >
            <Menu size={24} />
          </button>

          <Link
            href="/dashboard/profile"
            className="flex items-center gap-3 hover:bg-gray-50 p-2 rounded-lg transition-colors group"
          >
            {hasMounted && (
              <div className="text-right hidden sm:block">
                <p className="text-sm font-medium text-gray-700 group-hover:text-blue-600 transition-colors">
                  {user?.username || 'User'}
                </p>
                <div className="flex items-center justify-end gap-1">
                    {user?.role === 'developer' && (
                        <span className="text-[10px] bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded uppercase font-bold tracking-wider">
                            Dev Mode
                        </span>
                    )}
                    <p className="text-xs text-gray-500 capitalize">
                    {user?.role || 'Admin'}
                    </p>
                </div>
              </div>
            )}
            <div className="h-10 w-10 bg-blue-50 text-blue-600 rounded-full flex items-center justify-center border border-blue-100 group-hover:border-blue-200 group-hover:bg-blue-100 transition-all">
              <User size={20} />
            </div>
          </Link>
        </header>

        <main className="flex-1 overflow-y-auto p-4 lg:p-8 bg-gray-100">
            {children}
        </main>
      </div>
    </div>
  );
}

function SideNavItem({ 
    icon, 
    text, 
    href, 
    badge 
}: { 
    icon: React.ReactNode; 
    text: string; 
    href: string; 
    badge?: React.ReactNode;
}) {
  const pathname = usePathname();
  const isActive = pathname === href;
  
  return (
    <Link
      href={href}
      className={`flex items-center p-3 rounded-lg text-sm font-medium transition-colors mb-1 group ${
        isActive
          ? 'bg-blue-50 text-blue-700'
          : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
      }`}
    >
      {icon}
      <span className="ml-3 flex-1">{text}</span>
      {badge}
    </Link>
  );
}
