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
  X
} from 'lucide-react';
import { useUser } from '@/context/UserContext';

// This component now holds all your previous DashboardLayout logic.
export default function NavigationWrapper({ children }: { children: React.ReactNode }) {
  const { logout, user } = useUser();
  const [hasMounted, setHasMounted] = useState(false);
  
  // State for mobile sidebar toggle
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const pathname = usePathname(); // usePathname() requires 'use client'

  useEffect(() => {
    setHasMounted(true);
  }, []);

  // Close sidebar automatically when navigating (mobile UX)
  useEffect(() => {
    setIsSidebarOpen(false);
  }, [pathname]);

  return (
    <div className="flex h-screen bg-gray-100 overflow-hidden">
      
      {/* --- MOBILE OVERLAY (Backdrop) --- */}
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
          {/* Close button for mobile */}
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
          <SideNavItem icon={<FileText size={20} />} text="Sales Report" href="/dashboard/sales" />
          <SideNavItem icon={<FileText size={20} />} text="Expenses" href="/dashboard/expenses" />
          <SideNavItem icon={<Briefcase size={20} />} text="Staff Performance" href="/dashboard/employees" />
          <SideNavItem icon={<Calendar size={20} />} text="Attendance" href="/dashboard/attendance" />

          <div className="pt-4 pb-2 text-xs font-semibold text-gray-400 uppercase tracking-wider">
            Management
          </div>
          <SideNavItem icon={<Search size={20} />} text="Search Customers" href="/dashboard/search" />
          <SideNavItem icon={<Users size={20} />} text="Customer List" href="/dashboard/customers" />
          <SideNavItem icon={<Box size={20} />} text="Packages" href="/dashboard/packages" />
          <SideNavItem icon={<Building size={20} />} text="Outlets" href="/dashboard/outlets" />
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
          
          {/* Hamburger Button (Visible only on Mobile) */}
          <button 
            onClick={() => setIsSidebarOpen(true)}
            className="lg:hidden p-2 text-gray-600 hover:bg-gray-100 rounded-lg"
          >
            <Menu size={24} />
          </button>

          {/* User Profile */}
          <Link
            href="/dashboard/profile"
            className="flex items-center gap-3 hover:bg-gray-50 p-2 rounded-lg transition-colors group"
          >
            {hasMounted && (
              <div className="text-right hidden sm:block">
                <p className="text-sm font-medium text-gray-700 group-hover:text-blue-600 transition-colors">
                  {user?.username || 'User'}
                </p>
                <p className="text-xs text-gray-500 capitalize">
                  {user?.role || 'Admin'}
                </p>
              </div>
            )}
            <div className="h-10 w-10 bg-blue-50 text-blue-600 rounded-full flex items-center justify-center border border-blue-100 group-hover:border-blue-200 group-hover:bg-blue-100 transition-all">
              <User size={20} />
            </div>
          </Link>
        </header>

        {/* PAGE CONTENT */}
        <main className="flex-1 overflow-y-auto p-4 lg:p-8 bg-gray-100">
            {children} {/* This renders the ClientDetailPage Server Component */}
        </main>
      </div>
    </div>
  );
}

// SideNavItem is kept here because it uses usePathname()
function SideNavItem({ icon, text, href }: { icon: React.ReactNode; text: string; href: string }) {
  const pathname = usePathname();
  const isActive = pathname === href;
  return (
    <Link
      href={href}
      className={`flex items-center p-3 rounded-lg text-sm font-medium transition-colors mb-1 ${
        isActive
          ? 'bg-blue-50 text-blue-700'
          : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
      }`}
    >
      {icon}
      <span className="ml-3">{text}</span>
    </Link>
  );
}