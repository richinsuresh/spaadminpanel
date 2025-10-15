// src/app/(auth)/login/page.tsx
'use client';

import { useState } from 'react';
import Link from 'next/link';

export default function LoginPage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 to-blue-100 flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-white rounded-2xl shadow-xl p-8">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-gray-800">Berry Spa Admin Panel</h1>
          <p className="text-gray-600 mt-2">Choose your login type</p>
        </div>

        <div className="space-y-6">
          {/* Admin Login Card */}
          <div className="border border-purple-200 rounded-xl p-6 hover:shadow-md transition-shadow">
            <h2 className="text-lg font-semibold text-purple-700 mb-3 flex items-center">
              <span className="mr-2">👑</span>
              Main Admin Login
            </h2>
            <p className="text-gray-600 text-sm mb-4">
              Access all outlets, manage staff, and view company-wide reports
            </p>
            <Link
              href="/admin-login"
              className="w-full block text-center bg-purple-600 hover:bg-purple-700 text-white font-medium py-2 px-4 rounded-lg transition duration-300"
            >
              Admin Login →
            </Link>
          </div>

          {/* Outlet Login Card */}
          <div className="border border-blue-200 rounded-xl p-6 hover:shadow-md transition-shadow">
            <h2 className="text-lg font-semibold text-blue-700 mb-3 flex items-center">
              <span className="mr-2">🏪</span>
              Outlet Staff Login
            </h2>
            <p className="text-gray-600 text-sm mb-4">
              Manage your outlet's customers, packages, and daily operations
            </p>
            <Link
              href="/outlet-login"
              className="w-full block text-center bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 px-4 rounded-lg transition duration-300"
            >
              Outlet Login →
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}