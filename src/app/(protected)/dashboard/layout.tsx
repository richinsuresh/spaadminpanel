'use client';

// Removed: useState, createContext, useContext
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
  UserPlus, // <-- 1. Icon imported
} from 'lucide-react';
// Removed: ChevronDown, ChevronRight

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  // Removed: 'isExpanded' state and context provider

  return (
    <div className="flex h-screen bg-gray-100">
      {/* --- MODIFIED: Sidebar is now a fixed width --- */}
      <aside className="flex flex-col w-64 bg-white shadow-lg overflow-y-auto">
        <div className="flex items-center p-4 h-16 border-b">
          <span className="font-bold text-xl text-blue-600">
            Admin Panel
          </span>
          {/* Removed: Expand/collapse button */}
        </div>

        <nav className="flex-1 px-4 py-4 space-y-2">
          <SideNavItem
            icon={<LayoutDashboard size={20} />}
            text="Dashboard"
            href="/dashboard"
          />

          {/* --- 2. NEW ITEM ADDED HERE --- */}
          <SideNavItem
            icon={<UserPlus size={20} />}
            text="Add Customer"
            href="/form"
          />
          {/* --- END OF NEW ITEM --- */}
          
          <SideNavItem
            icon={<FileText size={20} />}
            text="Sales"
            href="/dashboard/sales"
          />
          <SideNavItem
            icon={<Search size={20} />}
            text="Search Customers"
            href="/dashboard/search"
          />
          <SideNavItem
            icon={<Users size={20} />}
            text="Customers"
            href="/dashboard/customers"
          />
          <SideNavItem
            icon={<Box size={20} />}
            text="Packages"
            href="/dashboard/packages"
          />
          <SideNavItem
            icon={<Building size={20} />}
            text="Outlets"
            href="/dashboard/outlets"
          />
          <SideNavItem
            icon={<Calendar size={20} />}
            text="Attendance"
            href="/dashboard/attendance"
          />
        </nav>

        <div className="p-4 border-t">
          <SideNavItem icon={<LogOut size={20} />} text="Logout" href="/api/auth?action=logout" />
        </div>
      </aside>

      <main className="flex-1 overflow-y-auto p-8">
        {children}
      </main>
    </div>
  );
}

function SideNavItem({ icon, text, href }: { icon: React.ReactNode; text: string; href: string }) {
  // Removed: 'isExpanded' context
  const pathname = usePathname();
  const isActive = pathname === href;

  return (
    <Link
      href={href}
      className={`
        flex items-center p-3 rounded-lg
        ${isActive ? 'bg-blue-100 text-blue-600 font-medium' : 'text-gray-700 hover:bg-gray-100'}
      `}
    >
      {icon}
      {/* --- MODIFIED: Text is now always visible --- */}
      <span className="ml-4">
        {text}
      </span>
    </Link>
  );
}