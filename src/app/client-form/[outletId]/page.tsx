// src/app/client-form/[outletId]/page.tsx
'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { OUTLETS } from '@/lib/outlet';

// --- Type Definitions ---
type Treatment = {
  id: string;
  name: string;
};

type ClientInfo = {
  status: 'active' | 'expired';
  name: string;
  mobile: string;
  packageAmount: number;
  totalPackageHours: number;
  usedPackageHours: number;
  remainingHours: number;
  expiryDate: string;
};

// --- Custom Hook for Razorpay ---
const useRazorpay = () => {
  const [scriptLoaded, setScriptLoaded] = useState(false);
  useEffect(() => {
    if (typeof window === 'undefined' || typeof document === 'undefined') {
      return;
    }

    const src = 'https://checkout.razorpay.com/v1/checkout.js';
    const existingScript = document.querySelector(`script[src="${src}"]`);

    if (existingScript) {
      const checkRazorpay = () => {
        // @ts-ignore
        if (window.Razorpay) {
          setScriptLoaded(true);
        } else {
          setTimeout(checkRazorpay, 100);
        }
      };
      checkRazorpay();
      return;
    }

    const script = document.createElement('script');
    script.src = src;
    script.async = true;
    script.onload = () => setScriptLoaded(true);
    script.onerror = () => {
      console.error('Failed to load Razorpay script');
      setScriptLoaded(false);
    };
    document.body.appendChild(script);

  }, []);
  return scriptLoaded;
};

// --- Main Form Component ---
export default function ClientCheckinForm() {
  const params = useParams();
  const outletId = params.outletId as string;

  // --- State Declarations ---
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
    tookPackage: false,
    packageAmount: 0,
    totalPackageHours: 0,
    paymentMethod: 'cash',
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const scriptLoaded = useRazorpay();

  // --- Effects ---

  // Effect 1: Load Outlet Info and Treatments
  useEffect(() => {
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

  // Effect 2 & 3: Debounced Client Lookup
  const performClientLookup = useCallback(async () => {
    if (mobile.length !== 10) return;

    try {
      setError('');
      const res = await fetch(`/api/client-lookup?mobile=${encodeURIComponent(mobile)}`);

      if (!res.ok) {
        console.warn(`Client lookup for ${mobile} failed or not found.`);
        setClientInfo(null);
        setFormData(prev => ({ ...prev, name: '', isPackageCustomer: false }));
        return;
      }
      const data: ClientInfo | null = await res.json();
      setClientInfo(data);
      setFormData(prev => ({
        ...prev,
        name: data?.name || '',
        isPackageCustomer: data?.status === 'active'
      }));
    } catch (e) {
      console.error('Client lookup error:', e);
      setError('Error looking up client details.');
      setClientInfo(null);
      setFormData(prev => ({ ...prev, name: '', isPackageCustomer: false }));
    }
  }, [mobile]);

  useEffect(() => {
    setClientInfo(null);
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

      if (name === 'isPackageCustomer' && checked) {
        updated.tookPackage = false;
      }
      if (name === 'tookPackage' && checked) {
        updated.isPackageCustomer = false;
      }

      return updated;
    });
  };

  // --- Helper Functions ---

  const getSessionDuration = useCallback(() => {
    const hours = Number(formData.sessionHours) || 0;
    const minutes = Number(formData.sessionMinutes) || 0;
    const totalHours = hours + (minutes / 60);
    return totalHours > 0 ? totalHours : 0;
  }, [formData.sessionHours, formData.sessionMinutes]);

  const getFinalAmountInPaise = useCallback(() => {
    if (formData.isPackageCustomer) return 0;
    if (formData.tookPackage) {
      return (Number(formData.packageAmount) || 0) * 100;
    }
    return (Number(formData.amountPaid) || 0) * 100;
  }, [
    formData.isPackageCustomer, 
    formData.tookPackage, 
    formData.packageAmount, 
    formData.amountPaid
  ]);


  // --- Form Submission Handler ---
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    setLoading(true);

    // Validations
    if (!outlet) {
        setError("Outlet information is missing. Cannot submit.");
        setLoading(false);
        return;
    }
    if (mobile.length !== 10) {
       setError('Please enter a valid 10-digit mobile number.');
       setLoading(false);
       return;
    }
    if (!formData.name.trim()) {
        setError('Please enter the client\'s name.');
        setLoading(false);
        return;
    }
    if (!formData.treatment) {
      setError('Please select a treatment.');
      setLoading(false);
      return;
    }
    const sessionHours = getSessionDuration();
    if (formData.isPackageCustomer && sessionHours <= 0) {
      setError('Please enter a session duration (hours/mins) when using package credits.');
      setLoading(false);
      return;
    }
    if (formData.tookPackage) {
        if (!formData.packageAmount || formData.packageAmount <= 0) {
           setError('Please enter a valid Package Amount for the new package.');
           setLoading(false);
           return;
        }
        if (!formData.totalPackageHours || formData.totalPackageHours <= 0) {
            setError('Please enter valid Total Hours for the new package.');
            setLoading(false);
            return;
        }
    }
    if (!formData.isPackageCustomer && !formData.tookPackage && (formData.amountPaid <= 0 || !formData.amountPaid)) {
        setError('Please enter a valid Amount for the treatment.');
        setLoading(false);
        return;
    }

    const treatmentName = formData.treatment;
    const finalAmountInPaise = getFinalAmountInPaise();
    const effectivePaymentMethod = formData.isPackageCustomer ? 'package' : formData.paymentMethod;

    try {
      const payload = {
          name: formData.name.trim(),
          mobile: mobile,
          date: new Date().toISOString().split('T')[0],
          treatment: treatmentName,
          amountPaid: (formData.isPackageCustomer || formData.tookPackage) ? 0 : finalAmountInPaise,
          sessionHours: sessionHours,
          isPackageCustomer: formData.isPackageCustomer,
          tookPackage: formData.tookPackage,
          packageAmount: formData.tookPackage ? (Number(formData.packageAmount) || 0) * 100 : 0,
          totalPackageHours: formData.tookPackage ? Number(formData.totalPackageHours) || 0 : 0,
          outlet: outlet.name,
          outlet_id: outlet.id,
          paymentMethod: effectivePaymentMethod,
          finalAmountInPaise: finalAmountInPaise, 
      };

      // Submit to API
      const res = await fetch('/api/client-form-submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Submission failed');
      }

      // Handle API response (Cash, Package)
      if (data.paymentMethod === 'cash' || data.paymentMethod === 'package') {
        setSuccess(data.paymentMethod === 'cash'
            ? 'Success! Please collect cash payment. Session registered.'
            : 'Success! Session using package is registered.');
        setMobile('');
        setFormData({
          name: '', treatment: '', amountPaid: 0, sessionHours: 0, sessionMinutes: 0,
          isPackageCustomer: false, tookPackage: false, packageAmount: 0,
          totalPackageHours: 0, paymentMethod: 'cash',
        });
        setClientInfo(null);
        setLoading(false); 
      } 
      // Handle API response (Online Payment)
      else if (data.paymentMethod === 'online' && data.razorpayOrder) {
        if (!scriptLoaded) {
          throw new Error('Razorpay script not loaded. Please refresh and try again.');
        }

        const options = {
          key: data.razorpayKey,
          amount: data.razorpayOrder.amount,
          currency: 'INR',
          name: 'Berry Spa',
          description: `Payment for ${formData.tookPackage ? 'New Package' : treatmentName}`,
          order_id: data.razorpayOrder.id,
          handler: function (response: any) {
             setSuccess('Payment successful! Redirecting...');
             setTimeout(() => {
                window.location.href = '/client-thank-you';
             }, 1500);
          },
          prefill: { name: formData.name, email: '', contact: mobile },
          theme: { color: '#8A2BE2' },
           modal: {
                ondismiss: function() {
                    console.log('Checkout form closed');
                    setLoading(false);
                }
            }
        };

        // @ts-ignore
        const rzp = new window.Razorpay(options);
        rzp.on('payment.failed', function (response: any) {
           console.error('Razorpay Payment Failed:', response.error);
           setError(`Payment failed: ${response.error.description || 'Unknown error'}. Please try cash.`);
           setLoading(false);
        });
        rzp.open();
      } else {
          throw new Error("Invalid response from server.");
      }

    } catch (err: any) {
      console.error('Submit error:', err);
      setError(err.message || 'An unknown error occurred.');
      setLoading(false);
    }
  };

  // --- Render Logic ---
  const showAmountField = !formData.isPackageCustomer && !formData.tookPackage;
  const showPackageFields = formData.tookPackage;
  const isSubmitDisabled = loading || (formData.paymentMethod !== 'cash' && !formData.isPackageCustomer && !scriptLoaded);

  // Initial loading state
  if (loading && !outlet) {
      return (
        <div className="min-h-screen bg-gray-100 flex items-center justify-center p-4">
            <div className="text-center text-black">Loading form data...</div>
        </div>
      );
  }

  // Initial error state
  if (error && !outlet && !success) {
      return (
          <div className="min-h-screen bg-gray-100 flex items-center justify-center p-4">
              <div className="max-w-md w-full bg-white rounded-2xl shadow-xl p-8 text-center">
                  <h1 className="text-xl font-bold text-red-600 mb-4">Error</h1>
                  <p className="text-red-700">{error}</p>
              </div>
          </div>
      );
  }

  // --- Main Form Render ---
  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 to-blue-100 flex items-center justify-center p-4">
      <div className="max-w-lg w-full bg-white rounded-2xl shadow-xl p-8">
        <h1 className="text-2xl font-bold text-black text-center mb-2">Welcome to {outlet?.name || 'Berry Spa'}</h1>
        <p className="text-center text-black mb-6">Client Check-in / New Registration</p>

        {error && !success && <div className="mb-4 p-3 bg-red-50 text-red-700 rounded-lg border border-red-200 text-sm">{error}</div>}
        {success && <div className="mb-4 p-3 bg-green-50 text-green-700 rounded-lg border border-green-200 text-sm">{success}</div>}

        <form onSubmit={handleSubmit} className="space-y-5">
          {/* Section 1: Client Info */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label htmlFor="mobile" className="block text-sm font-medium text-black mb-1">Phone Number *</label>
              <input
                id="mobile"
                type="tel"
                value={mobile}
                onChange={(e) => setMobile(e.target.value.replace(/\D/g, ''))}
                required
                maxLength={10}
                // --- CHANGED ---: Added text-black
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-1 focus:ring-purple-500 text-sm disabled:bg-gray-100 placeholder:text-gray-500 text-black"
                placeholder="10-digit mobile"
                disabled={loading}
              />
            </div>
            <div>
              <label htmlFor="name" className="block text-sm font-medium text-black mb-1">Full Name *</label>
              <input
                id="name"
                name="name"
                type="text"
                value={formData.name}
                onChange={handleChange}
                required
                // --- CHANGED ---: Added text-black
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-1 focus:ring-purple-500 text-sm disabled:bg-gray-100 placeholder:text-gray-500 text-black"
                placeholder="Client's full name"
                disabled={loading}
              />
            </div>
          </div>

          {/* Package Info Display */}
          {clientInfo && clientInfo.status === 'active' && (
            <div className="p-3 bg-green-50 border border-green-200 rounded-lg text-sm text-center text-green-800">
              Active package found: <strong>{clientInfo.remainingHours.toFixed(1)} hrs</strong> remaining.
            </div>
          )}
           {clientInfo && clientInfo.status !== 'active' && (
            <div className="p-3 bg-yellow-50 border border-yellow-200 rounded-lg text-sm text-center text-yellow-800">
              Package found but it's expired or has no hours left.
            </div>
          )}

          {/* Section 2: Service & Duration */}
          <div>
            <label htmlFor="treatment" className="block text-sm font-medium text-black mb-1">Select Treatment *</label>
            <select
              id="treatment"
              name="treatment"
              value={formData.treatment}
              onChange={handleChange}
              required
              // --- CHANGED ---: Added text-black
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-1 focus:ring-purple-500 text-sm bg-white disabled:bg-gray-100 text-black"
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
            <label className="block text-sm font-medium text-black mb-1">Session Duration {formData.isPackageCustomer ? '*' : ''}</label>
            <div className="flex space-x-2">
              <div className="flex-1">
                <input
                  name="sessionHours"
                  type="number" min="0" max="10" step="1"
                  placeholder="Hours"
                  value={formData.sessionHours || ''}
                  onChange={handleChange}
                  // --- CHANGED ---: Added text-black
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-1 focus:ring-purple-500 text-sm disabled:bg-gray-100 placeholder:text-gray-500 text-black"
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
                  // --- CHANGED ---: Added text-black
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-1 focus:ring-purple-500 text-sm disabled:bg-gray-100 placeholder:text-gray-500 text-black"
                  disabled={loading}
                />
              </div>
            </div>
             {formData.isPackageCustomer && getSessionDuration() <=0 && <p className="text-xs text-red-500 mt-1">Duration required when using package.</p>}
          </div>

          {/* Section 3: Package Options */}
          <div className="pt-4 border-t border-gray-200 space-y-2">
             <span className="block text-sm font-medium text-black mb-1">Package Status:</span>
            <label className="flex items-center cursor-pointer p-2 rounded-md hover:bg-gray-50">
              <input
                type="checkbox"
                name="isPackageCustomer"
                checked={formData.isPackageCustomer}
                onChange={handleChange}
                className="h-4 w-4 text-purple-600 border-gray-300 rounded focus:ring-purple-500 focus:ring-offset-0 disabled:opacity-50"
                disabled={loading || !clientInfo || clientInfo.status !== 'active'}
              />
              <span className={`ml-2 text-sm ${(!clientInfo || clientInfo.status !== 'active') ? 'text-gray-500 cursor-not-allowed' : 'text-black'}`}>
                Use existing package credits
              </span>
            </label>
            <label className="flex items-center cursor-pointer p-2 rounded-md hover:bg-gray-50">
              <input
                type="checkbox"
                name="tookPackage"
                checked={formData.tookPackage}
                onChange={handleChange}
                className="h-4 w-4 text-purple-600 border-gray-300 rounded focus:ring-purple-500 focus:ring-offset-0 disabled:opacity-50"
                disabled={loading || (!!clientInfo && clientInfo.status === 'active')}
              />
              <span className={`ml-2 text-sm ${(!!clientInfo && clientInfo.status === 'active') ? 'text-gray-500 cursor-not-allowed' : 'text-black'}`}>
                Purchase a new package today
              </span>
            </label>
          </div>

          {/* Section 4: Conditional Price Fields */}
          {showAmountField && (
            <div>
              <label htmlFor="amountPaid" className="block text-sm font-medium text-black mb-1">Amount for Treatment (₹) *</label>
              <input
                id="amountPaid"
                name="amountPaid"
                type="number"
                min="0"
                step="1"
                value={formData.amountPaid || ''}
                onChange={handleChange}
                // --- CHANGED ---: Added text-black
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-1 focus:ring-purple-500 text-sm disabled:bg-gray-100 placeholder:text-gray-500 text-black"
                placeholder="Enter amount (e.g., 500)"
                disabled={loading}
                required={!formData.isPackageCustomer && !formData.tookPackage}
              />
            </div>
          )}

          {showPackageFields && (
            <div className="p-4 bg-purple-50 rounded-lg border border-purple-100 space-y-3">
              <h3 className="text-sm font-semibold text-purple-800">New Package Details</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label htmlFor="packageAmount" className="block text-xs font-medium text-black mb-1">Amount (₹) *</label>
                  <input
                    id="packageAmount"
                    name="packageAmount"
                    type="number" min="0" step="100"
                    value={formData.packageAmount || ''}
                    onChange={handleChange}
                    required={formData.tookPackage}
                    // --- CHANGED ---: Added text-black
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm disabled:bg-gray-100 text-black"
                    disabled={loading}
                  />
                </div>
                <div>
                  <label htmlFor="totalPackageHours" className="block text-xs font-medium text-black mb-1">Total Hours *</label>
                  <input
                    id="totalPackageHours"
                    name="totalPackageHours"
                    type="number" min="0.5" step="0.5"
                    value={formData.totalPackageHours || ''}
                    onChange={handleChange}
                    required={formData.tookPackage}
                    // --- CHANGED ---: Added text-black
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm disabled:bg-gray-100 text-black"
                    disabled={loading}
                  />
                </div>
              </div>
            </div>
          )}

          {/* Section 5: Payment Method */}
          {!formData.isPackageCustomer && (
            <div>
              <label htmlFor="paymentMethod" className="block text-sm font-medium text-black mb-1">Payment Option</label>
              <select
                id="paymentMethod"
                name="paymentMethod"
                value={formData.paymentMethod}
                onChange={handleChange}
                // --- CHANGED ---: Added text-black
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-1 focus:ring-purple-500 text-sm bg-white disabled:bg-gray-100 text-black"
                disabled={loading}
              >
                <option value="cash">Pay with Cash</option>
                <option value="card">Pay Online (Card/UPI etc.)</option>
              </select>
               {!scriptLoaded && formData.paymentMethod !== 'cash' &&
                 <p className="text-xs text-yellow-600 mt-1">Loading online payment options...</p>
               }
            </div>
          )}

          {/* Submit Button */}
          <button
            type="submit"
            disabled={isSubmitDisabled}
            className="w-full bg-gradient-to-r from-purple-600 to-blue-500 hover:from-purple-700 hover:to-blue-600 text-white font-medium py-3 px-4 rounded-lg transition duration-300 disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {loading ? 'Processing...' :
             formData.isPackageCustomer ? 'Confirm Session using Package' :
             formData.paymentMethod === 'cash' ? 'Register & Accept Cash' :
             'Proceed to Online Payment'}
          </button>
        </form>
      </div>
    </div>
  );
}