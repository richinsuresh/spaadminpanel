'use client';

import { useState } from 'react';
import { useUser } from '@/context/UserContext';
import { supabase } from '@/lib/supabase';
import { User, Lock, CheckCircle, AlertCircle, Loader2 } from 'lucide-react';

export default function ProfilePage() {
  const { user } = useUser();
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);
  const [loading, setLoading] = useState(false);

  const handlePasswordUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage(null);

    if (newPassword !== confirmPassword) {
      setMessage({ type: 'error', text: 'Passwords do not match.' });
      return;
    }

    if (newPassword.length < 6) {
        setMessage({ type: 'error', text: 'Password must be at least 6 characters.' });
        return;
    }

    setLoading(true);
    try {
      // Update password in app_users table
      const { error } = await supabase
        .from('app_users')
        .update({ password: newPassword }) // Ideally hash this in production
        .eq('username', user?.username);

      if (error) throw error;

      setMessage({ type: 'success', text: 'Password updated successfully!' });
      setNewPassword('');
      setConfirmPassword('');
    } catch (err: any) {
      setMessage({ type: 'error', text: 'Failed to update password.' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-lg mx-auto mt-10">
      <h1 className="text-2xl font-bold text-gray-800 mb-6">User Profile</h1>

      <div className="bg-white shadow-sm rounded-xl border border-gray-200 overflow-hidden">
        <div className="p-6 bg-gray-50 border-b border-gray-200 flex items-center gap-4">
          <div className="bg-blue-100 p-3 rounded-full">
             <User className="w-8 h-8 text-blue-600" />
          </div>
          <div>
            <p className="text-sm text-gray-500 uppercase font-semibold">Username</p>
            <p className="text-xl font-bold text-gray-900 capitalize">{user?.username || 'Guest'}</p>
          </div>
        </div>

        <div className="p-6">
          <h3 className="text-lg font-semibold text-gray-700 mb-4 flex items-center gap-2">
            <Lock size={20} /> Change Password
          </h3>

          {message && (
            <div className={`p-3 mb-4 rounded-lg text-sm flex items-center gap-2 ${message.type === 'success' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
               {message.type === 'success' ? <CheckCircle size={16}/> : <AlertCircle size={16}/>}
               {message.text}
            </div>
          )}

          <form onSubmit={handlePasswordUpdate} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">New Password</label>
              <input 
                type="password" 
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="w-full p-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                placeholder="Enter new password"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Confirm Password</label>
              <input 
                type="password" 
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="w-full p-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                placeholder="Confirm new password"
                required
              />
            </div>
            <button 
                type="submit" 
                disabled={loading}
                className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 rounded-lg transition-colors disabled:opacity-50 flex justify-center"
            >
                {loading ? <Loader2 className="animate-spin" /> : 'Update Password'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}