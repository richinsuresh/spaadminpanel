'use client';

import { usePathname } from 'next/navigation';
import Link from 'next/link';
import {
  LayoutDashboard, Users, Building, Box, LogOut, Calendar,
  FileText, Search, UserPlus, Briefcase, User
} from 'lucide-react';
import { useUser } from '@/context/UserContext';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { logout, user } = useUser();

  return (
    <div className="flex h-screen bg-gray-100">
      <aside className="flex flex-col w-64 bg-white shadow-lg overflow-y-auto z-20 border-r border-gray-200">
        <div className="flex items-center p-4 h-16 border-b border-gray-200">
          <span className="font-bold text-xl text-blue-600">Admin Panel</span>
        </div>

        <nav className="flex-1 px-4 py-4 space-y-1">
          <SideNavItem icon={<LayoutDashboard size={20} />} text="Dashboard" href="/dashboard" />
          <SideNavItem icon={<UserPlus size={20} />} text="Add Customer" href="/form" />
          
          <div className="pt-4 pb-2 text-xs font-semibold text-gray-400 uppercase tracking-wider">Analytics</div>
          <SideNavItem icon={<FileText size={20} />} text="Sales Report" href="/dashboard/sales" />
          <SideNavItem icon={<Briefcase size={20} />} text="Staff Performance" href="/dashboard/employees" />
          <SideNavItem icon={<Calendar size={20} />} text="Attendance" href="/dashboard/attendance" />

          <div className="pt-4 pb-2 text-xs font-semibold text-gray-400 uppercase tracking-wider">Management</div>
          <SideNavItem icon={<Search size={20} />} text="Search Customers" href="/dashboard/search" />
          <SideNavItem icon={<Users size={20} />} text="Customer List" href="/dashboard/customers" />
          <SideNavItem icon={<Box size={20} />} text="Packages" href="/dashboard/packages" />
          <SideNavItem icon={<Building size={20} />} text="Outlets" href="/dashboard/outlets" />
        </nav>

        <div className="p-4 border-t border-gray-200">
          <button onClick={logout} className="flex w-full items-center p-3 rounded-lg text-sm font-medium text-red-600 hover:bg-red-50 transition-colors">
            <LogOut size={20} />
            <span className="ml-3">Logout</span>
          </button>
        </div>
      </aside>

      <div className="flex-1 flex flex-col overflow-hidden">
        <header className="h-16 bg-white shadow-sm border-b border-gray-200 flex items-center justify-end px-8 z-10">
           <Link href="/dashboard/profile" className="flex items-center gap-3 hover:bg-gray-50 p-2 rounded-lg transition-colors group">
             <div className="text-right hidden sm:block">
               <p className="text-sm font-medium text-gray-700 group-hover:text-blue-600 transition-colors">{user?.username || 'User'}</p>
               <p className="text-xs text-gray-500 capitalize">{user?.role || 'Admin'}</p>
             </div>
             <div className="h-10 w-10 bg-blue-50 text-blue-600 rounded-full flex items-center justify-center border border-blue-100 group-hover:border-blue-200 group-hover:bg-blue-100 transition-all">
               <User size={20} />
             </div>
           </Link>
        </header>
        <main className="flex-1 overflow-y-auto p-8 bg-gray-100">{children}</main>
      </div>
    </div>
  );
}

function SideNavItem({ icon, text, href }: { icon: React.ReactNode; text: string; href: string }) {
  const pathname = usePathname();
  const isActive = pathname === href;
  return (
    <Link href={href} className={`flex items-center p-3 rounded-lg text-sm font-medium transition-colors mb-1 ${isActive ? 'bg-blue-50 text-blue-700' : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'}`}>
      {icon}
      <span className="ml-3">{text}</span>
    </Link>
  );
}