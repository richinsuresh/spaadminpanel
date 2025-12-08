'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useUser } from '@/context/UserContext';
import { Lock, User, Loader2, ArrowLeft } from 'lucide-react';
import Link from 'next/link';

// Offline auth helpers (you already had these)
import { saveLocalAdminHash, verifyLocalAdminPassword } from '@/lib/offlineAuth';

export default function AdminLoginPage() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const router = useRouter();
  const { login } = useUser();

  const goToDashboard = () => {
    router.push('/dashboard');
  };

  const handleServerAuth = async (uname: string, pwd: string) => {
    try {
      const res = await fetch('/api/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: uname, password: pwd }),
      });

      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        return { ok: false, error: body?.error || `Auth failed (${res.status})` };
      }
      return { ok: true, body };
    } catch (err: any) {
      return { ok: false, error: err?.message || String(err) };
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    const uname = username.trim();
    const pwd = password.trim();

    if (!uname || !pwd) {
      setError('Please enter username and password.');
      setLoading(false);
      return;
    }

    // Prefer server auth when online
    if (navigator.onLine) {
      const server = await handleServerAuth(uname, pwd);

      if (server.ok) {
        // Use returned role (admin | developer | staff)
        const role = server.body?.role ?? 'admin';

        // Update app context
        login({ username: uname, role });

        // Save local salted hash for offline login (non-blocking)
        try { await saveLocalAdminHash(pwd); } catch (err) { console.warn('saveLocalAdminHash failed', err); }

        // Keep legacy cookie for compatibility (harmless)
        document.cookie = 'admin_session=true; path=/; max-age=86400';

        goToDashboard();
        return;
      }

      // If server explicitly returned invalid credentials, stop and show message
      if (!server.ok && server.error && !server.error.toLowerCase().includes('network')) {
        setError(server.error || 'Authentication failed');
        setLoading(false);
        return;
      }

      // If server failed due to network or unexpected issue, fall through to offline attempts
    }

    // OFFLINE fallback
    try {
      const ok = await verifyLocalAdminPassword(pwd);
      if (ok) {
        login({ username: uname || 'admin', role: 'admin' });
        document.cookie = 'admin_session=true; path=/; max-age=86400';
        sessionStorage.setItem('offline_admin_logged_in', '1');
        goToDashboard();
        return;
      } else {
        setError('Offline login failed — wrong password or no cached credentials.');
        setLoading(false);
        return;
      }
    } catch (verifyErr: any) {
      console.error('Offline verify error:', verifyErr);
      setError('Offline login failed.');
      setLoading(false);
      return;
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-black to-gray-800 flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-gray-900 rounded-2xl shadow-2xl p-8 border border-gray-700 relative">
        <Link href="/login" className="absolute top-6 left-6 text-gray-400 hover:text-white transition-colors">
          <ArrowLeft size={24} />
        </Link>

        <div className="text-center mb-8 mt-2">
          <div className="inline-flex p-3 bg-red-900/30 rounded-full mb-4">
            <Lock className="h-8 w-8 text-red-500" />
          </div>
          <h1 className="text-2xl font-bold text-white">Admin Sign In</h1>
          <p className="text-gray-400 mt-2 text-sm">Enter your secure credentials</p>
        </div>

        {error && (
          <div className="mb-6 p-3 bg-red-900/50 border border-red-700 text-red-200 text-sm rounded-lg text-center">
            {error}
          </div>
        )}

        <form onSubmit={handleLogin} className="space-y-6">
          <div>
            <label className="block text-xs font-medium text-gray-400 mb-1.5 uppercase tracking-wider">Username</label>
            <div className="relative group">
              <User className="absolute left-3 top-3 text-gray-500 h-5 w-5 group-focus-within:text-red-500 transition-colors" />
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="w-full pl-10 pr-4 py-3 bg-gray-800 border border-gray-600 rounded-xl focus:ring-2 focus:ring-red-500 focus:border-transparent outline-none text-white placeholder:text-gray-600 transition-all"
                placeholder=""
                required
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-400 mb-1.5 uppercase tracking-wider">Password</label>
            <div className="relative group">
              <Lock className="absolute left-3 top-3 text-gray-500 h-5 w-5 group-focus-within:text-red-500 transition-colors" />
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full pl-10 pr-4 py-3 bg-gray-800 border border-gray-600 rounded-xl focus:ring-2 focus:ring-red-500 focus:border-transparent outline-none text-white placeholder:text-gray-600 transition-all"
                placeholder="••••••••"
                required
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3.5 bg-red-600 hover:bg-red-700 text-white rounded-xl font-bold shadow-lg shadow-red-900/20 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {loading ? <Loader2 className="animate-spin" /> : 'Authenticate'}
          </button>
        </form>
      </div>
    </div>
  );
}
