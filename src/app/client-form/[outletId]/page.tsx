'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { OUTLETS } from '@/lib/outlet';

// --- Type Definitions ---
type Treatment = { id: string; name: string; };
// --- FIX: Add email to ClientInfo ---
type ClientInfo = {
  status: 'active' | 'expired';
  name: string;
  mobile: string;
  remainingHours: number;
  email?: string; // <-- NEW (optional)
};

// --- Main Form Component ---
export default function ClientCheckinForm() {
  const params = useParams();
  const outletId = params.outletId as string;
  const router = useRouter();

  const [outlet, setOutlet] = useState<{ id: string; name: string } | null>(null);
  const [treatments, setTreatments] = useState<Treatment[]>([]);
  const [mobile, setMobile] = useState('');
  const [clientInfo, setClientInfo] = useState<ClientInfo | null>(null);
  const lookupTimeout = useRef<NodeJS.Timeout | null>(null);
  
  const [formData, setFormData] = useState({
    name: '',
    treatment: '',
    amountPaid: 0,
    sessionHours: 0,
    sessionMinutes: 0,
    isPackageCustomer: false,
    paymentMethod: 'cash',
  });

  // --- OTP State ---
  const [otpState, setOtpState] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');
  const [otpCode, setOtpCode] = useState('');
  // --- NEW: State to hold the client's email ---
  const [clientEmail, setClientEmail] = useState('');

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Effect 1: Load Outlet Info & Treatments
  useEffect(() => {
    // ... (no change, this is fine)
    if (!outletId) {
      setError('Outlet ID missing in URL.');
      setLoading(false);
      return;
    }
    setLoading(true);
    setError('');
    const outletInfo = OUTLETS.find(o => o.id === outletId);
    if (!outletInfo) {
      setError('Invalid Outlet ID.');
      setLoading(false);
      return;
    }
    setOutlet(outletInfo);
    const fetchTreatments = async () => {
      try {
        const { data, error: dbError } = await supabase
          .from('treatments')
          .select('id, name')
          .eq('outlet_id', outletId);
        if (dbError) throw dbError;
        setTreatments(data || []);
      } catch (err) {
        console.error('Error fetching treatments:', err);
        setError('Could not load treatments. Please try refreshing.');
        setTreatments([]);
      } finally {
        setLoading(false);
      }
    };
    fetchTreatments();
  }, [outletId]);

  // Effect 2 & 3: Client Lookup
  const performClientLookup = useCallback(async () => {
    if (mobile.length !== 10) return;
    try {
      setError('');
      const res = await fetch(`/api/client-lookup?mobile=${encodeURIComponent(mobile)}`);
      if (!res.ok) {
        setClientInfo(null);
        setFormData(prev => ({ ...prev, name: '', isPackageCustomer: false }));
        setOtpState('idle'); 
        setClientEmail('');
        return;
      }
      const data: ClientInfo | null = await res.json();
      setClientInfo(data);
      
      if (data && data.status === 'active') {
        setFormData(prev => ({
          ...prev,
          name: data.name || '',
          isPackageCustomer: true 
        }));
        // --- NEW: Store the client's email ---
        setClientEmail(data.email || '');
        setOtpState('idle'); 
      } else {
        setFormData(prev => ({
          ...prev,
          name: data?.name || '',
          isPackageCustomer: false
        }));
        setOtpState('idle');
        setClientEmail('');
      }
    } catch (e) {
      console.error('Client lookup error:', e);
      setClientInfo(null);
      setFormData(prev => ({ ...prev, name: '', isPackageCustomer: false }));
      setOtpState('idle');
      setClientEmail('');
    }
  }, [mobile]);

  useEffect(() => {
    setClientInfo(null);
    setOtpState('idle'); 
    setOtpCode('');
    setClientEmail('');
    if (mobile.length < 10) {
        setFormData(prev => ({ ...prev, name: '', isPackageCustomer: false }));
    }
    if (lookupTimeout.current) {
      clearTimeout(lookupTimeout.current);
    }
    if (mobile.length === 10) {
      lookupTimeout.current = setTimeout(() => {
        performClientLookup();
      }, 300);
    }
    return () => {
      if (lookupTimeout.current) {
        clearTimeout(lookupTimeout.current);
      }
    };
  }, [mobile, performClientLookup]);

  // --- Event Handlers ---
  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value, type } = e.target;
    const checked = type === 'checkbox' ? (e.target as HTMLInputElement).checked : undefined;
    
    setError('');
    
    if (name === 'isPackageCustomer' && !checked) {
      setOtpState('idle');
      setOtpCode('');
    }

    setFormData(prev => {
      let updatedValue: string | number | boolean;
      if (type === 'checkbox') {
        updatedValue = checked ?? false;
      } else if (type === 'number') {
        updatedValue = value === '' ? 0 : Number(value);
      } else {
        updatedValue = value;
      }
      const updated = { ...prev, [name]: updatedValue };
      return updated;
    });
  };

  // --- NEW: Handler to Send OTP (sends email) ---
  const handleSendOtp = async () => {
    if (!clientEmail) {
      setError('No email found for this package client. Cannot send OTP. Please update client at admin panel.');
      return;
    }
    setOtpState('sending');
    setError('');
    try {
      const res = await fetch('/api/send-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: clientEmail }), // <-- Send email
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to send OTP.');
      setOtpState('sent'); // Show OTP input
    } catch (err: any) {
      setError(err.message);
      setOtpState('idle'); 
    }
  };

  // --- Helper Functions (no change) ---
  const getSessionDuration = useCallback(() => {
    const hours = Number(formData.sessionHours) || 0;
    const minutes = Number(formData.sessionMinutes) || 0;
    return hours + (minutes / 60);
  }, [formData.sessionHours, formData.sessionMinutes]);

  const getFinalAmountInPaise = useCallback(() => {
    if (formData.isPackageCustomer) return 0;
    return (Number(formData.amountPaid) || 0) * 100;
  }, [formData.isPackageCustomer, formData.amountPaid]);


  // --- handleSubmit (Updated) ---
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    setLoading(true);

    const sessionHours = getSessionDuration();
    if (formData.isPackageCustomer) {
      if (sessionHours <= 0) {
        setError('Please enter Session Duration when using package credits.');
        setLoading(false);
        return;
      }
      if (!otpCode || otpCode.length !== 6) {
        setError('A valid 6-digit OTP is required to use a package.');
        setLoading(false);
        return;
      }
    }
    if (!formData.isPackageCustomer && (formData.amountPaid <= 0 || !formData.amountPaid)) {
        setError('Please enter a valid Amount for the treatment.');
        setLoading(false);
        return;
    }
    
    const treatmentName = formData.treatment;
    const finalAmountInPaise = getFinalAmountInPaise();
    const effectivePaymentMethod = formData.isPackageCustomer ? 'package' : formData.paymentMethod;

    try {
      let checkInTime: string | null = null;
      if (formData.paymentMethod === 'cash' || formData.isPackageCustomer) {
        checkInTime = new Date().toISOString();
      }

      const payload = {
          name: formData.name.trim(),
          mobile: mobile,
          date: new Date().toISOString().split('T')[0],
          treatment: treatmentName,
          amountPaid: formData.isPackageCustomer ? 0 : finalAmountInPaise,
          sessionHours: sessionHours,
          isPackageCustomer: formData.isPackageCustomer,
          tookPackage: false,
          packageAmount: 0,
          totalPackageHours: 0,
          packageSoldBy: null, 
          outlet: outlet!.name,
          outlet_id: outlet!.id,
          paymentMethod: effectivePaymentMethod,
          finalAmountInPaise: finalAmountInPaise, 
          check_in_time: checkInTime,
          // --- NEW: Send OTP code AND Email ---
          otpCode: formData.isPackageCustomer ? otpCode : null,
          clientEmail: formData.isPackageCustomer ? clientEmail : null,
      };

      // API call
      const res = await fetch('/api/client-form-submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok) {
        setOtpState('sent'); // Reset to 'sent' to allow re-try
        throw new Error(data.error || 'Submission failed');
      }

      // --- Success (reset OTP state) ---
      if (data.paymentMethod === 'package') {
        setSuccess('Success! Session using package is registered.');
        setMobile('');
        setFormData({
          name: '', treatment: '', amountPaid: 0, sessionHours: 0, sessionMinutes: 0,
          isPackageCustomer: false, paymentMethod: 'cash',
        });
        setClientInfo(null);
        setLoading(false); 
        setOtpState('idle'); // Reset OTP
        setOtpCode('');
        setClientEmail('');
      } 
      else if (data.paymentMethod === 'cash') {
        setSuccess('Registration successful! Redirecting...');
        setTimeout(() => {
          router.push(`/client-cash-success?outletId=${outletId}`);
        }, 1500);
      } 
      else if (data.paymentMethod === 'card') {
        setSuccess('Registration complete. Redirecting to payment QR...');
        const amountInRupees = data.finalAmountInPaise / 100;
        setTimeout(() => {
          router.push(`/pay/qr/${data.outlet_id}?amount=${amountInRupees}`);
        }, 1500);
      }
      else {
          throw new Error("Invalid response from server.");
      }

    } catch (err: any) {
      console.error('Submit error:', err);
      setError(err.message || 'An unknown error occurred.');
      setLoading(false);
    }
  };

  // --- Render Logic (Updated) ---
  const showAmountField = !formData.isPackageCustomer;
  const isSubmitDisabled = loading || (formData.isPackageCustomer && otpCode.length !== 6);
  
  // --- NEW: Helper to mask email ---
  const maskEmail = (email: string) => {
    if (!email || !email.includes('@')) return '...';
    const parts = email.split('@');
    const user = parts[0];
    const domain = parts[1];
    return `${user.substring(0, 1)}******${user.substring(user.length - 1)}@${domain}`;
  };


  // --- Main Form Render ---
  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-black to-gray-800 flex items-center justify-center p-4">
      <div className="max-w-lg w-full bg-gray-900 rounded-2xl shadow-2xl p-8 border border-gray-700">
        <h1 className="text-2xl font-bold text-white text-center mb-2">Welcome to {outlet?.name || 'Your Spa'}</h1>
        <p className="text-center text-gray-400 mb-6">Client Check-in</p>

        {error && !success && <div className="mb-4 p-3 bg-red-900/50 text-red-300 rounded-lg border border-red-700 text-sm">{error}</div>}
        {success && <div className="mb-4 p-3 bg-green-900/50 text-green-300 rounded-lg border border-green-700 text-sm">{success}</div>}

        <form onSubmit={handleSubmit} className="space-y-5">
          {/* Section 1: Client Info */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label htmlFor="mobile" className="block text-sm font-medium text-gray-300 mb-1">Phone Number *</label>
              <input
                id="mobile"
                type="tel"
                value={mobile}
                onChange={(e) => setMobile(e.target.value.replace(/\D/g, ''))}
                required
                maxLength={10}
                className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg focus:ring-1 focus:ring-red-500 text-white placeholder:text-gray-500"
                placeholder="10-digit mobile"
                disabled={loading}
              />
            </div>
            <div>
              <label htmlFor="name" className="block text-sm font-medium text-gray-300 mb-1">Full Name *</label>
              <input
                id="name"
                name="name"
                type="text"
                value={formData.name}
                onChange={handleChange}
                required
                className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg focus:ring-1 focus:ring-red-500 text-white placeholder:text-gray-500"
                placeholder="Client's full name"
                disabled={loading}
              />
            </div>
          </div>

          {/* Package Info Display */}
          {clientInfo && clientInfo.status === 'active' && (
            <div className="p-3 bg-green-900/50 border border-green-700 rounded-lg text-sm text-center text-green-300">
              <strong>Active package found.</strong>
            </div>
          )}
           {clientInfo && clientInfo.status !== 'active' && (
            <div className="p-3 bg-yellow-900/50 border border-yellow-700 rounded-lg text-sm text-center text-yellow-300">
              No active package found.
            </div>
          )}

          {/* Section 2: Service & Duration */}
          <div>
            <label htmlFor="treatment" className="block text-sm font-medium text-gray-300 mb-1">Select Treatment *</label>
            <select
              id="treatment"
              name="treatment"
              value={formData.treatment}
              onChange={handleChange}
              required
              className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg focus:ring-1 focus:ring-red-500 text-white"
              disabled={loading || treatments.length === 0}
            >
              <option value="">-- Select a Treatment --</option>
              {treatments.map(t => (
                <option key={t.id} value={t.name}>
                  {t.name}
                </option>
              ))}
            </select>
            {treatments.length === 0 && !loading && <p className="text-xs text-red-500 mt-1">No treatments loaded for this outlet.</p>}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">Session Duration {formData.isPackageCustomer ? '*' : ''}</label>
            <div className="flex space-x-2">
              <div className="flex-1">
                <input
                  name="sessionHours"
                  type="number" min="0" max="10" step="1"
                  placeholder="Hours"
                  value={formData.sessionHours || ''}
                  onChange={handleChange}
                  className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg focus:ring-1 focus:ring-red-500 text-white placeholder:text-gray-500"
                  disabled={loading}
                  required={formData.isPackageCustomer}
                />
              </div>
              <div className="flex-1">
                <input
                  name="sessionMinutes"
                  type="number" min="0" max="59" step="15"
                  placeholder="Mins"
                  value={formData.sessionMinutes || ''}
                  onChange={handleChange}
                  className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg focus:ring-1 focus:ring-red-500 text-white placeholder:text-gray-500"
                  disabled={loading}
                />
              </div>
            </div>
             {formData.isPackageCustomer && getSessionDuration() <=0 && <p className="text-xs text-red-500 mt-1">Duration required when using package.</p>}
          </div>

          {/* --- Section 3: Package Options (Updated) --- */}
          <div className="pt-4 border-t border-gray-700 space-y-3">
             <span className="block text-sm font-medium text-gray-300 mb-1">Package Status:</span>
            <label className="flex items-center cursor-pointer p-2 rounded-md hover:bg-gray-800">
              <input
                type="checkbox"
                name="isPackageCustomer"
                checked={formData.isPackageCustomer}
                onChange={handleChange}
                className="h-4 w-4 text-red-600 bg-gray-700 border-gray-600 rounded focus:ring-red-500 focus:ring-offset-gray-900"
                disabled={loading || !clientInfo || clientInfo.status !== 'active'}
              />
              <span className={`ml-2 text-sm ${(!clientInfo || clientInfo.status !== 'active') ? 'text-gray-500 cursor-not-allowed' : 'text-gray-300'}`}>
                Use existing package credits
              </span>
            </label>
            
            {/* --- NEW: OTP Verification Section (Updated for Email) --- */}
            {formData.isPackageCustomer && (
              <div className="p-4 bg-gray-800 rounded-lg border border-gray-700 space-y-3">
                <h3 className="text-sm font-medium text-white">Customer Verification (Required)</h3>
                
                {clientEmail ? (
                  <>
                    <p className="text-xs text-gray-400">
                      To use package hours, an OTP will be sent to the client's registered email: 
                      <strong className="text-amber-400 ml-1">{maskEmail(clientEmail)}</strong>
                    </p>
                    
                    {otpState !== 'sent' && (
                      <button
                        type="button"
                        onClick={handleSendOtp}
                        disabled={otpState === 'sending'}
                        className="w-full px-4 py-2 bg-amber-600 text-white font-semibold rounded-lg hover:bg-amber-700 disabled:opacity-50"
                      >
                        {otpState === 'sending' ? 'Sending...' : 'Send OTP to Client Email'}
                      </button>
                    )}

                    {otpState === 'sent' && (
                      <div className="space-y-2">
                        <label htmlFor="otpCode" className="block text-sm font-medium text-green-400">✓ OTP Sent! Enter 6-Digit Code</label>
                        <input
                          id="otpCode"
                          type="tel"
                          value={otpCode}
                          onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, ''))}
                          maxLength={6}
                          className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg focus:ring-1 focus:ring-red-500 text-white placeholder:text-gray-500"
                          placeholder="123456"
                        />
                      </div>
                    )}
                  </>
                ) : (
                  <p className="text-sm text-yellow-400">
                    No email found for this package. Cannot send OTP. Please update client at admin panel.
                  </p>
                )}
              </div>
            )}
            {/* --- END: OTP Section --- */}
          </div>

          {/* Section 4: Conditional Price Fields */}
          {showAmountField && (
            <div>
              <label htmlFor="amountPaid" className="block text-sm font-medium text-gray-300 mb-1">Amount for Treatment (₹) *</label>
              <input
                id="amountPaid"
                name="amountPaid"
                type="number"
                min="0"
                step="1"
                value={formData.amountPaid || ''}
                onChange={handleChange}
                className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg focus:ring-1 focus:ring-red-500 text-white placeholder:text-gray-500"
                placeholder="Enter amount (e.g., 500)"
                disabled={loading}
                required={!formData.isPackageCustomer}
              />
            </div>
          )}

          {/* Section 5: Payment Method */}
          {!formData.isPackageCustomer && (
            <div>
              <label htmlFor="paymentMethod" className="block text-sm font-medium text-gray-300 mb-1">Payment Option</label>
              <select
                id="paymentMethod"
                name="paymentMethod"
                value={formData.paymentMethod}
                onChange={handleChange}
                className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg focus:ring-1 focus:ring-red-500 text-white"
                disabled={loading}
              >
                <option value="cash">Pay with Cash or Card</option>
                <option value="card">Pay with UPI</option>
              </select>
            </div>
          )}

          {/* Submit Button (Updated) */}
          <button
            type="submit"
            disabled={isSubmitDisabled}
            className="w-full bg-red-600 hover:bg-red-700 text-white font-medium py-3 px-4 rounded-lg transition duration-300 disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {loading ? 'Processing...' :
             formData.isPackageCustomer ? (otpCode.length !== 6 ? 'Enter OTP to Submit' : 'Verify & Confirm Session') :
             formData.paymentMethod === 'cash' ? 'Register & Accept Cash' :
             'Proceed to UPI Payment'}
          </button>
        </form>
      </div>
    </div>
  );
}