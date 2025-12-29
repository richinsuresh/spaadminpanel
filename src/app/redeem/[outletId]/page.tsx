// src/app/redeem/[outletId]/page.tsx
'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { OUTLETS } from '@/lib/outlet';
import { Loader2, CheckCircle, Ticket } from 'lucide-react';

export default function CustomerRedeemPage() {
  const { outletId } = useParams();
  const [step, setStep] = useState<'mobile' | 'otp' | 'success'>('mobile');
  const [mobile, setMobile] = useState('');
  const [otp, setOtp] = useState('');
  const [redemptionCode, setRedemptionCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const outletName = OUTLETS.find(o => o.id === outletId)?.name || 'Spa';

  // Step 1: Send OTP
  const handleSendOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    
    try {
      // Use existing OTP API
      const res = await fetch('/api/send-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mobile }),
      });
      
      if (!res.ok) throw new Error('Failed to send OTP');
      setStep('otp');
    } catch (err) {
      setError('Could not send OTP. Check mobile number.');
    } finally {
      setLoading(false);
    }
  };

  // Step 2: Verify OTP & Generate Redemption Code
  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    // Mock OTP check (since your send-otp is mocked with '1234')
    if (otp !== '1234') {
      setError('Invalid OTP');
      setLoading(false);
      return;
    }

    try {
      // Call new API to generate redemption code
      const res = await fetch('/api/redeem/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mobile, outletId }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to generate code');

      setRedemptionCode(data.code);
      setStep('success');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
      <div className="bg-white w-full max-w-md rounded-2xl shadow-xl overflow-hidden">
        <div className="bg-blue-600 p-6 text-center">
          <h1 className="text-xl font-bold text-white">Redeem Package</h1>
          <p className="text-blue-100 text-sm mt-1">{outletName}</p>
        </div>

        <div className="p-8">
          {step === 'mobile' && (
            <form onSubmit={handleSendOtp} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Mobile Number</label>
                <input
                  type="tel"
                  maxLength={10}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg text-lg text-center tracking-widest text-black"
                  placeholder="9876543210"
                  value={mobile}
                  onChange={(e) => setMobile(e.target.value.replace(/\D/g, ''))}
                  required
                />
              </div>
              <button
                type="submit"
                disabled={loading || mobile.length < 10}
                className="w-full bg-blue-600 text-white py-3 rounded-lg font-semibold hover:bg-blue-700 disabled:opacity-50 flex justify-center"
              >
                {loading ? <Loader2 className="animate-spin" /> : 'Send OTP'}
              </button>
            </form>
          )}

          {step === 'otp' && (
            <form onSubmit={handleVerify} className="space-y-4">
               <div className="text-center mb-4">
                 <p className="text-gray-500 text-sm">Enter OTP sent to {mobile}</p>
                 <p className="text-xs text-gray-400 mt-1">(Hint: Use 1234)</p>
               </div>
              <input
                type="text"
                maxLength={4}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg text-2xl text-center tracking-[1em] font-bold text-black"
                value={otp}
                onChange={(e) => setOtp(e.target.value)}
                autoFocus
              />
              <button
                type="submit"
                disabled={loading || otp.length < 4}
                className="w-full bg-green-600 text-white py-3 rounded-lg font-semibold hover:bg-green-700 disabled:opacity-50 flex justify-center"
              >
                {loading ? <Loader2 className="animate-spin" /> : 'Generate Code'}
              </button>
            </form>
          )}

          {step === 'success' && (
            <div className="text-center space-y-6">
              <div className="flex justify-center">
                <div className="bg-green-100 p-4 rounded-full">
                  <Ticket className="w-12 h-12 text-green-600" />
                </div>
              </div>
              
              <div>
                <h2 className="text-gray-500 text-sm uppercase tracking-wide">Show this to Manager</h2>
                <div className="mt-2 bg-gray-100 border-2 border-dashed border-gray-300 rounded-xl p-6">
                  <span className="text-5xl font-mono font-bold text-gray-800 tracking-wider">
                    {redemptionCode}
                  </span>
                </div>
                <p className="text-xs text-red-400 mt-2">Valid for 15 minutes</p>
              </div>

              <div className="bg-blue-50 p-4 rounded-lg text-left">
                <p className="text-xs text-blue-800 font-semibold">Instructions:</p>
                <ul className="text-xs text-blue-600 list-disc list-inside mt-1 space-y-1">
                  <li>Show this code at the reception.</li>
                  <li>The manager will use it to verify your package.</li>
                  <li>Once verified, your session will begin.</li>
                </ul>
              </div>
            </div>
          )}

          {error && (
            <p className="mt-4 text-center text-red-600 text-sm bg-red-50 p-2 rounded">
              {error}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}