// src/app/(auth)/outlet-login/page.tsx
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { OUTLETS } from '@/lib/outlet';

export default function OutletLogin() {
  const [outletId, setOutletId] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');

    try {
      const res = await fetch('/api/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ outletId, password }),
      });

      const data = await res.json();

      if (res.ok) {
        window.location.href = '/outlet/dashboard/sales'; 
      } else {
        setError(data.error || 'Invalid outlet ID or password');
      }
    } catch (err) {
      setError('Login failed. Please try again.');
      console.error('Login error:', err);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    // --- UPDATED THEME: Dark gradient background ---
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-black to-gray-800 flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-gray-900 rounded-2xl shadow-2xl p-8 border border-gray-700">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-white">Outlet Login</h1>
          {/* --- UPDATED THEME: Text color --- */}
          <p className="text-gray-400">Enter your outlet credentials</p>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-900/50 text-red-300 rounded-lg border border-red-700">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div className="mb-6">
            <label htmlFor="outlet" className="block text-sm font-medium text-gray-300 mb-2">
              Select Outlet
            </label>
            <select
              id="outlet"
              value={outletId}
              onChange={(e) => setOutletId(e.target.value)}
              required
              // --- UPDATED THEME: Dark select ---
              className="w-full px-4 py-3 bg-gray-800 border border-gray-700 text-white rounded-lg focus:ring-2 focus:ring-red-500 focus:border-red-500"
            >
              <option value="">Choose your outlet</option>
              {OUTLETS.map(outlet => (
                <option key={outlet.id} value={outlet.id}>
                  {outlet.name}
                </option>
              ))}
            </select>
          </div>

          <div className="mb-6">
            <label htmlFor="password" className="block text-sm font-medium text-gray-300 mb-2">
              Password
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              // --- UPDATED THEME: Dark input ---
              className="w-full px-4 py-3 bg-gray-800 border border-gray-700 text-white rounded-lg focus:ring-2 focus:ring-red-500 focus:border-red-500"
              placeholder="Enter your password"
            />
          </div>

          <button
            type="submit"
            disabled={isLoading}
            // --- UPDATED THEME: Red button ---
            className="w-full bg-red-600 hover:bg-red-700 text-white font-medium py-3 px-4 rounded-lg transition duration-300 disabled:opacity-70"
          >
            {isLoading ? 'Logging in...' : 'Login to Dashboard'}
          </button>
        </form>
      </div>
    </div>
  );
}