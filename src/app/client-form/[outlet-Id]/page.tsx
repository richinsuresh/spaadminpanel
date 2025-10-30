// src/app/client-form/[outletId]/page.tsx
'use client';

import { useState, useEffect, useRef, useCallback } from 'react'; // Added useCallback
import { useParams } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { OUTLETS } from '@/lib/outlet';

// --- Type Definitions ---
type Treatment = {
  id: string;
  name: string;
  price: number; // Price in paise
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
// (Slightly refined, ensures document exists)
const useRazorpay = () => {
  const [scriptLoaded, setScriptLoaded] = useState(false);
  useEffect(() => {
    // Ensure this runs only in the browser
    if (typeof window === 'undefined' || typeof document === 'undefined') {
      return;
    }

    const src = 'https://checkout.razorpay.com/v1/checkout.js';
    const existingScript = document.querySelector(`script[src="${src}"]`);

    if (existingScript) {
      // If script already exists (maybe loaded by another instance or previous navigation)
      // Check if Razorpay object is available, might need a slight delay
      const checkRazorpay = () => {
        // @ts-ignore
        if (window.Razorpay) {
          setScriptLoaded(true);
        } else {
          setTimeout(checkRazorpay, 100); // Retry after 100ms
        }
      };
      checkRazorpay();
      return;
    }

    // If script doesn't exist, create and append it
    const script = document.createElement('script');
    script.src = src;
    script.async = true;
    script.onload = () => {
        setScriptLoaded(true);
    };
    script.onerror = () => {
      console.error('Failed to load Razorpay script');
      setScriptLoaded(false);
    };
    document.body.appendChild(script);

    // Cleanup function (optional, might remove script if component unmounts quickly)
    // return () => {
    //   const scriptTag = document.querySelector(`script[src="${src}"]`);
    //   if (scriptTag) {
    //     document.body.removeChild(scriptTag);
    //   }
    // };
  }, []); // Empty dependency array ensures this runs once on mount
  return scriptLoaded;
};

// --- Main Component ---
export default function ClientCheckinForm() {
  const params = useParams();
  const outletId = params.outletId as string;

  // State Declarations
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
  const [loading, setLoading] = useState(true); // Combined loading state
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const scriptLoaded = useRazorpay(); // Load Razorpay script

  // Effect 1: Load Outlet Info and Treatments
  useEffect(() => {
    if (!outletId) {
        setError('Outlet ID missing in URL.');
        setLoading(false);
        return;
    }

    setLoading(true); // Start loading
    setError(''); // Clear previous errors

    // Find outlet details
    const outletInfo = OUTLETS.find(o => o.id === outletId);
    if (outletInfo) {
      setOutlet(outletInfo);
    } else {
      setError('Invalid Outlet ID.');
      setLoading(false);
      return;
    }

    // Fetch treatments asynchronously
    const fetchTreatments = async () => {
      const { data, error: dbError } = await supabase
        .from('treatments')
        .select('id, name, price')
        .eq('outlet_id', outletId);

      if (dbError) {
        console.error('Error fetching treatments:', dbError);
        setError('Could not load treatments. Please try refreshing.');
        setTreatments([]); // Set empty array on error
      } else {
        setTreatments(data || []);
      }
      setLoading(false); // Finish loading
    };

    fetchTreatments();

  }, [outletId]); // Rerun if outletId changes

  // Effect 2: Client Lookup via Mobile (using useCallback for the fetch function)
  const performClientLookup = useCallback(async () => {
    if (mobile.length !== 10) return; // Only lookup for 10 digits

    try {
      setError(''); // Clear error before fetch
      const res = await fetch(`/api/client-lookup?mobile=${encodeURIComponent(mobile)}`);
      if (!res.ok) {
        // Handle case where lookup fails or client not found
        console.warn(`Client lookup for ${mobile} failed or not found.`);
        setClientInfo(null);
        setFormData(prev => ({ ...prev, name: '', isPackageCustomer: false }));
        return;
      }

      const data: ClientInfo | null = await res.json();
      setClientInfo(data); // Store fetched data (or null)

      // Update form data based on lookup result
      setFormData(prev => ({
        ...prev,
        name: data?.name || '', // Autofill name if found, else clear
        isPackageCustomer: data?.status === 'active' // Set package status
      }));

    } catch (e) {
      console.error('Client lookup error:', e);
      setError('Error looking up client details.');
      setClientInfo(null);
      setFormData(prev => ({ ...prev, name: '', isPackageCustomer: false }));
    }
  }, [mobile]); // Dependency: mobile

  // Effect 3: Debounce Client Lookup
  useEffect(() => {
    // Clear previous client info and errors when mobile starts changing
    setClientInfo(null);
    if (mobile.length < 10) {
        setFormData(prev => ({ ...prev, name: '', isPackageCustomer: false }));
    }

    // Clear existing timeout
    if (lookupTimeout.current) {
      clearTimeout(lookupTimeout.current);
    }

    // Set a new timeout to perform lookup after 300ms of inactivity
    if (mobile.length === 10) {
      lookupTimeout.current = setTimeout(() => {
        performClientLookup();
      }, 300); // 300ms debounce
    }

    // Cleanup timeout on unmount or if mobile changes again
    return () => {
      if (lookupTimeout.current) {
        clearTimeout(lookupTimeout.current);
      }
    };
  }, [mobile, performClientLookup]); // Rerun when mobile or the lookup function changes


  // --- Event Handlers ---
  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value, type } = e.target;
    const checked = type === 'checkbox' ? (e.target as HTMLInputElement).checked : undefined;

    setError(''); // Clear error on any input change

    setFormData(prev => {
      let updatedValue: string | number | boolean;
      if (type === 'checkbox') {
        updatedValue = checked ?? false;
      } else if (type === 'number') {
        updatedValue = value === '' ? 0 : Number(value); // Handle empty number input
      } else {
        updatedValue = value;
      }

      const updated = { ...prev, [name]: updatedValue };

      // Auto-fill amount when treatment is selected and not using package
      if (name === 'treatment' && value && !updated.isPackageCustomer && !updated.tookPackage) {
        const selectedTreatment = treatments.find(t => `${t.name}|${t.price}` === value);
        updated.amountPaid = selectedTreatment ? selectedTreatment.price / 100 : 0;
      }

      // Ensure only one package option is checked
      if (name === 'isPackageCustomer' && checked) {
        updated.tookPackage = false;
        updated.amountPaid = 0; // Amount is 0 when using package
      }
      if (name === 'tookPackage' && checked) {
        updated.isPackageCustomer = false;
         // Amount to pay depends on package amount, handled in getFinalAmountInPaise
        updated.amountPaid = 0; // Clear treatment amount
      }
      // If unchecking a package option, recalculate amount
      if ((name === 'isPackageCustomer' && !checked && !updated.tookPackage) || (name === 'tookPackage' && !checked && !updated.isPackageCustomer)) {
         const selectedTreatment = treatments.find(t => `${t.name}|${t.price}` === updated.treatment);
         updated.amountPaid = selectedTreatment ? selectedTreatment.price / 100 : 0;
      }

      return updated;
    });
  };

  // --- Helper Functions ---
  const getSessionDuration = useCallback(() => {
    const hours = Number(formData.sessionHours) || 0;
    const minutes = Number(formData.sessionMinutes) || 0;
    // Ensure duration is positive
    const totalHours = hours + (minutes / 60);
    return totalHours > 0 ? totalHours : 0;
  }, [formData.sessionHours, formData.sessionMinutes]);

  const getFinalAmountInPaise = useCallback(() => {
    if (formData.isPackageCustomer) return 0; // No charge if using existing package
    if (formData.tookPackage) {
        // Charge the package amount if purchasing a new one
        return (Number(formData.packageAmount) || 0) * 100;
    }
    // Otherwise, charge the selected treatment price
    const selectedTreatment = treatments.find(t => `${t.name}|${t.price}` === formData.treatment);
    return selectedTreatment ? selectedTreatment.price : 0;
  }, [formData.isPackageCustomer, formData.tookPackage, formData.packageAmount, formData.treatment, treatments]);


  // --- Form Submission ---
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    setLoading(true); // Indicate submission start

    // Validations
    if (!outlet) {
        setError("Outlet information is missing.");
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
      setError('Please enter a session duration (hours/mins) to use your package.');
      setLoading(false);
      return;
    }
    if (formData.tookPackage && (!formData.packageAmount || formData.packageAmount <= 0 || !formData.totalPackageHours || formData.totalPackageHours <= 0)) {
       setError('Please enter a valid Package Amount and Total Hours for the new package.');
       setLoading(false);
       return;
    }

    const [treatmentName] = formData.treatment.split('|');
    const finalAmountInPaise = getFinalAmountInPaise();
    const effectivePaymentMethod = formData.isPackageCustomer ? 'package' : formData.paymentMethod;

    try {
      const payload = {
          name: formData.name,
          mobile: mobile,
          date: new Date().toISOString().split('T')[0],
          treatment: treatmentName,
          // Amount paid for the *treatment* specifically (0 if package involved)
          amountPaid: (formData.isPackageCustomer || formData.tookPackage) ? 0 : (Number(formData.amountPaid) || 0) * 100,
          sessionHours: sessionHours,
          isPackageCustomer: formData.isPackageCustomer,
          tookPackage: formData.tookPackage,
          // Package details (sent even if not tookPackage, API handles it)
          packageAmount: (Number(formData.packageAmount) || 0) * 100,
          totalPackageHours: Number(formData.totalPackageHours) || 0,
          // Outlet info
          outlet: outlet.name,
          outlet_id: outlet.id,
          // Payment details
          paymentMethod: effectivePaymentMethod,
          finalAmountInPaise: finalAmountInPaise, // Actual amount to charge (could be treatment or package)
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

      // Handle API response
      if (data.paymentMethod === 'cash' || data.paymentMethod === 'package') {
        setSuccess(data.paymentMethod === 'cash'
            ? 'Success! Please pay at the counter. Your session is registered.'
            : 'Success! Your session using the package is registered.');
        // Reset form
        setMobile('');
        setFormData({
          name: '', treatment: '', amountPaid: 0, sessionHours: 0, sessionMinutes: 0,
          isPackageCustomer: false, tookPackage: false, packageAmount: 0,
          totalPackageHours: 0, paymentMethod: 'cash',
        });
        setClientInfo(null);
      } else if (data.paymentMethod === 'online' && data.razorpayOrder) {
        // --- Online payment: Open Razorpay ---
        if (!scriptLoaded) {
          throw new Error('Razorpay script not loaded. Please refresh and try again.');
        }

        const options = {
          key: data.razorpayKey,
          amount: data.razorpayOrder.amount, // Amount from order (in paise)
          currency: 'INR',
          name: 'Berry Spa',
          description: `Payment for ${formData.tookPackage ? 'New Package' : treatmentName}`,
          order_id: data.razorpayOrder.id,
          handler: function (response: any) {
             setSuccess('Payment successful! Redirecting...');
             // Redirect after a short delay
             setTimeout(() => {
                window.location.href = '/client-thank-you'; // Simple static thank you page
             }, 1500);
          },
          prefill: { name: formData.name, email: '', contact: mobile },
          theme: { color: '#8A2BE2' }, // Purple theme
           modal: {
                ondismiss: function() {
                    console.log('Checkout form closed');
                    // Optionally set an error or message if the user closes the modal
                    // setError('Payment cancelled.');
                    setLoading(false); // Re-enable submit button if modal is closed
                }
            }
        };

        // @ts-ignore - Razorpay is loaded globally
        const rzp = new window.Razorpay(options);

        rzp.on('payment.failed', function (response: any) {
           console.error('Razorpay Payment Failed:', response.error);
           setError(`Payment failed: ${response.error.description || 'Unknown Razorpay error'}. Please try again or choose cash.`);
           setLoading(false); // Re-enable submit button on failure
        });

        rzp.open();
        // Keep loading true until payment success/failure or modal dismiss
        // setLoading(false); // Don't set loading false here, wait for handler/ondismiss/failure

      } else {
          // Should not happen based on API logic
          throw new Error("Invalid response from server after submission.");
      }

    } catch (err: any) {
      console.error('Submit error:', err);
      setError(err.message || 'An unknown error occurred.');
      setLoading(false); // Stop loading indicator on error
    }
    // Don't set loading false here for online payments, wait for Razorpay callbacks
    if (effectivePaymentMethod === 'cash' || effectivePaymentMethod === 'package'){
         setLoading(false);
    }
  };

  // --- Render Logic ---
  const showAmountField = !formData.isPackageCustomer && !formData.tookPackage && formData.treatment !== '';
  const showPackageFields = formData.tookPackage;
  const isSubmitDisabled = loading || (formData.paymentMethod !== 'cash' && !formData.isPackageCustomer && !scriptLoaded);

  // Loading state for initial data fetch
  if (loading && !outlet) {
      return (
        <div className="min-h-screen bg-gray-100 flex items-center justify-center p-4">
            <div className="text-center">Loading form...</div>
        </div>
      );
  }

  // Error state for initial data fetch
  if (error && !outlet) {
      return (
          <div className="min-h-screen bg-gray-100 flex items-center justify-center p-4">
              <div className="max-w-md w-full bg-white rounded-2xl shadow-xl p-8 text-center">
                  <h1 className="text-xl font-bold text-red-600">{error}</h1>
              </div>
          </div>
      );
  }

  // Main Form Render
  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 to-blue-100 flex items-center justify-center p-4">
      <div className="max-w-lg w-full bg-white rounded-2xl shadow-xl p-8">
        <h1 className="text-2xl font-bold text-gray-800 text-center mb-2">Welcome to {outlet?.name || 'Berry Spa'}</h1>
        <p className="text-center text-gray-600 mb-6">Please fill in your details.</p>

        {/* --- Error/Success Messages --- */}
        {error && <div className="mb-4 p-3 bg-red-50 text-red-700 rounded-lg border border-red-200 text-sm">{error}</div>}
        {success && <div className="mb-4 p-3 bg-green-50 text-green-700 rounded-lg border border-green-200 text-sm">{success}</div>}

        <form onSubmit={handleSubmit} className="space-y-5">
          {/* --- Section 1: Client Info --- */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label htmlFor="mobile" className="block text-sm font-medium text-gray-700 mb-1">Phone Number *</label>
              <input
                id="mobile"
                type="tel"
                value={mobile}
                onChange={(e) => setMobile(e.target.value.replace(/\D/g, ''))}
                required
                maxLength={10}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-1 focus:ring-purple-500 text-sm"
                placeholder="10-digit mobile"
                disabled={loading}
              />
            </div>
            <div>
              <label htmlFor="name" className="block text-sm font-medium text-gray-700 mb-1">Full Name *</label>
              <input
                id="name"
                name="name"
                type="text"
                value={formData.name}
                onChange={handleChange}
                required
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-1 focus:ring-purple-500 text-sm"
                placeholder="Your name"
                disabled={loading}
              />
            </div>
          </div>

          {/* --- Package Info Display --- */}
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

          {/* --- Section 2: Service & Duration --- */}
          <div>
            <label htmlFor="treatment" className="block text-sm font-medium text-gray-700 mb-1">Select Treatment *</label>
            <select
              id="treatment"
              name="treatment"
              value={formData.treatment}
              onChange={handleChange}
              required
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-1 focus:ring-purple-500 text-sm bg-white"
              disabled={loading || treatments.length === 0}
            >
              <option value="">-- Select --</option>
              {treatments.map(t => (
                <option key={t.id} value={`${t.name}|${t.price}`}>
                  {t.name} (₹{t.price / 100})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Session Duration {formData.isPackageCustomer ? '*' : ''}</label>
            <div className="flex space-x-2">
              <div className="flex-1">
                <input
                  name="sessionHours"
                  type="number" min="0" max="10" step="1"
                  placeholder="Hours"
                  value={formData.sessionHours || ''}
                  onChange={handleChange}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-1 focus:ring-purple-500 text-sm"
                  disabled={loading}
                  required={formData.isPackageCustomer} // Required only if using package
                />
              </div>
              <div className="flex-1">
                <input
                  name="sessionMinutes"
                  type="number" min="0" max="59" step="15"
                  placeholder="Mins"
                  value={formData.sessionMinutes || ''}
                  onChange={handleChange}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-1 focus:ring-purple-500 text-sm"
                  disabled={loading}
                />
              </div>
            </div>
             {formData.isPackageCustomer && getSessionDuration() <=0 && <p className="text-xs text-red-500 mt-1">Duration required when using package.</p>}
          </div>


          {/* --- Section 3: Package Options --- */}
          <div className="pt-4 border-t border-gray-200 space-y-2">
             <span className="block text-sm font-medium text-gray-700 mb-1">Package Options:</span>
            <label className="flex items-center cursor-pointer p-2 rounded-md hover:bg-gray-50">
              <input
                type="checkbox"
                name="isPackageCustomer"
                checked={formData.isPackageCustomer}
                onChange={handleChange}
                className="h-4 w-4 text-purple-600 border-gray-300 rounded focus:ring-purple-500 focus:ring-offset-0 disabled:opacity-50"
                disabled={loading || !clientInfo || clientInfo.status !== 'active'}
              />
              <span className={`ml-2 text-sm ${(!clientInfo || clientInfo.status !== 'active') ? 'text-gray-400' : 'text-gray-700'}`}>
                Use my existing package
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
              <span className={`ml-2 text-sm ${(!!clientInfo && clientInfo.status === 'active') ? 'text-gray-400' : 'text-gray-700'}`}>
                Purchase a new package today
              </span>
            </label>
          </div>

          {/* --- Section 4: Conditional Price Fields --- */}
          {showAmountField && (
            <div>
              <label htmlFor="amountPaidDisplay" className="block text-sm font-medium text-gray-700 mb-1">Amount for Treatment (₹)</label>
              <input
                id="amountPaidDisplay"
                type="number"
                value={formData.amountPaid || ''}
                readOnly // Auto-filled from treatment selection
                className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-gray-100 text-gray-700 text-sm"
              />
            </div>
          )}

          {showPackageFields && (
            <div className="p-4 bg-purple-50 rounded-lg border border-purple-100 space-y-3">
              <h3 className="text-sm font-semibold text-purple-800">New Package Details</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label htmlFor="packageAmount" className="block text-xs font-medium text-gray-700 mb-1">Amount (₹) *</label>
                  <input
                    id="packageAmount"
                    name="packageAmount"
                    type="number" min="0" step="100"
                    value={formData.packageAmount || ''}
                    onChange={handleChange}
                    required={formData.tookPackage}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                    disabled={loading}
                  />
                </div>
                <div>
                  <label htmlFor="totalPackageHours" className="block text-xs font-medium text-gray-700 mb-1">Total Hours *</label>
                  <input
                    id="totalPackageHours"
                    name="totalPackageHours"
                    type="number" min="0.5" step="0.5"
                    value={formData.totalPackageHours || ''}
                    onChange={handleChange}
                    required={formData.tookPackage}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                    disabled={loading}
                  />
                </div>
              </div>
            </div>
          )}

          {/* --- Section 5: Payment Method --- */}
          {!formData.isPackageCustomer && ( // Hide payment options if using existing package
            <div>
              <label htmlFor="paymentMethod" className="block text-sm font-medium text-gray-700 mb-1">Payment Option</label>
              <select
                id="paymentMethod"
                name="paymentMethod"
                value={formData.paymentMethod}
                onChange={handleChange}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-1 focus:ring-purple-500 text-sm bg-white"
                disabled={loading}
              >
                <option value="cash">Pay with Cash</option>
                <option value="card">Pay Online (Card/UPI)</option>
                {/* <option value="upi">Pay with UPI</option> */}
              </select>
               {!scriptLoaded && formData.paymentMethod !== 'cash' &&
                 <p className="text-xs text-yellow-600 mt-1">Loading online payment options...</p>
               }
            </div>
          )}

          {/* --- Submit Button --- */}
          <button
            type="submit"
            disabled={isSubmitDisabled}
            className="w-full bg-gradient-to-r from-purple-600 to-blue-500 hover:from-purple-700 hover:to-blue-600 text-white font-medium py-3 px-4 rounded-lg transition duration-300 disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {loading ? 'Please wait...' :
             formData.isPackageCustomer ? 'Confirm Session' :
             formData.paymentMethod === 'cash' ? 'Register & Pay Cash' :
             'Proceed to Online Payment'}
          </button>
        </form>
      </div>
    </div>
  );
}