// src/app/(auth)/login/page.tsx
'use client';

import Link from 'next/link';

export default function LoginPage() {
  return (
    // --- UPDATED THEME: Dark gradient background ---
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-black to-gray-800 flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-gray-900 rounded-2xl shadow-2xl p-8 border border-gray-700">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-white">Spa Admin Panel</h1>
          <p className="text-gray-400 mt-2">Choose your login type</p>
        </div>

        <div className="space-y-6">
          {/* --- UPDATED THEME: Admin Login Card --- */}
          <div className="bg-gray-800 border border-gray-700 rounded-xl p-6 hover:shadow-lg transition-shadow">
            <h2 className="text-lg font-semibold text-red-500 mb-3 flex items-center">
              <span className="mr-2">👑</span>
              Main Admin Login
            </h2>
            <p className="text-gray-400 text-sm mb-4">
              Access all outlets, manage staff, and view company-wide reports.
            </p>
            <Link
              href="/admin-login"
              className="w-full block text-center bg-red-600 hover:bg-red-700 text-white font-medium py-2 px-4 rounded-lg transition duration-300"
            >
              Admin Login →
            </Link>
          </div>

          {/* --- UPDATED THEME: Outlet Login Card --- */}
          <div className="bg-gray-800 border border-gray-700 rounded-xl p-6 hover:shadow-lg transition-shadow">
            <h2 className="text-lg font-semibold text-amber-500 mb-3 flex items-center">
              <span className="mr-2">🏪</span>
              Outlet Staff Login
            </h2>
            <p className="text-gray-400 text-sm mb-4">
              Manage your outlet's customers, packages, and daily operations.
            </p>
            <Link
              href="/outlet-login"
              className="w-full block text-center bg-gray-600 hover:bg-gray-700 text-white font-medium py-2 px-4 rounded-lg transition duration-300"
            >
              Outlet Login →
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}