// src/app/(protected)/form/page.tsx
'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';

// Type definition for the data returned by /api/client-lookup
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

// Type definition for the form's internal data state
type FormData = {
  name: string;
  mobile: string; // Keep this in formData if needed, though 'mobile' state is primary driver
  date: string;
  treatment: string;
  amountPaid: number;
  sessionHours: number;
  tookPackage: boolean;
  isPackageCustomer: boolean;
  packageAmount?: number;
  totalPackageHours?: number;
  outlet: string;
};

export default function ClientForm() {
  const router = useRouter();
  const [mobile, setMobile] = useState(''); // State for the mobile input field
  const [clientInfo, setClientInfo] = useState<ClientInfo | null>(null); // State to store fetched client/package details
  const [formData, setFormData] = useState<FormData>({ // State for the rest of the form data
    name: '',
    mobile: '', // This will be set on submit using the 'mobile' state
    date: new Date().toISOString().split('T')[0],
    treatment: '',
    amountPaid: 0,
    sessionHours: 0,
    tookPackage: false,
    isPackageCustomer: false,
    outlet: 'Indiranagar', // Default outlet for Admin form
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [inputError, setInputError] = useState('');
  const lookupTimeout = useRef<NodeJS.Timeout | null>(null); // Ref for debouncing API calls

  // Cleanup timeout on component unmount
  useEffect(() => {
    return () => {
      if (lookupTimeout.current) clearTimeout(lookupTimeout.current);
    };
  }, []);

  // --- AUTOFILL LOGIC ---
  useEffect(() => {
    // Clear previous timeout and client info when mobile changes
    if (lookupTimeout.current) clearTimeout(lookupTimeout.current);
    setClientInfo(null);
    setInputError(''); // Clear errors on mobile change

    // Only trigger lookup if mobile number is 10 digits
    if (mobile.length === 10) {
      const lookup = async () => {
        try {
          setInputError(''); // Clear error before fetch
          const res = await fetch(`/api/client-lookup?mobile=${encodeURIComponent(mobile)}`);
          
          if (!res.ok) { // Handle potential server errors during lookup
            console.warn(`Client lookup failed with status: ${res.status}`);
             setFormData(prev => ({ ...prev, name: '', isPackageCustomer: false, tookPackage: false }));
             setClientInfo(null);
            return;
          }

          const data: ClientInfo | null = await res.json();
          setClientInfo(data); // Store the full client info (or null)
          
          if (data) {
            // Autofill name and set package status
            setFormData(prev => ({
              ...prev,
              name: data.name, // Autofill the name
              isPackageCustomer: data.status === 'active' // Set based on package status
            }));
          } else {
            // No client/package found, clear relevant fields
            setFormData(prev => ({
              ...prev,
              name: '', // Clear name if no client exists
              isPackageCustomer: false,
              tookPackage: false // Ensure 'new package' isn't checked
            }));
          }
        } catch (e) {
          console.error("Lookup error:", e);
          setClientInfo(null);
          setFormData(prev => ({ ...prev, name: '', isPackageCustomer: false, tookPackage: false }));
        }
      };
      
      // Debounce the API call by 500ms
      lookupTimeout.current = setTimeout(lookup, 500);
    } 
    // If mobile length is not 10, clear autofilled fields
    else if (mobile.length < 10) {
        setFormData(prev => ({
            ...prev,
            name: '', // Clear name if mobile is incomplete
            isPackageCustomer: false,
            tookPackage: false,
        }));
    }
  }, [mobile]); // This effect runs whenever the 'mobile' state changes

  // Handle changes for form inputs (excluding mobile)
  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value, type } = e.target;
    const checked = (e.target as HTMLInputElement).checked;
    
    setFormData(prev => {
      const updated = {
        ...prev,
        [name]: type === 'checkbox' ? checked : type === 'number' ? (value === '' ? 0 : Number(value)) : value
      };
      
      // Ensure only one package option is selected
      if (name === 'isPackageCustomer' && checked) updated.tookPackage = false;
      if (name === 'tookPackage' && checked) updated.isPackageCustomer = false;
      
      return updated;
    });
  };

  // Handle session duration input
  const handleTimeChange = (hours: string, minutes: string) => {
    const h = parseFloat(hours) || 0;
    const m = parseFloat(minutes) || 0;
    setFormData(prev => ({ ...prev, sessionHours: h + (m / 60) }));
  };

  // Handle form submission
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setInputError(''); // Clear previous errors

    // Client-side validation for package usage
    if (formData.isPackageCustomer && formData.sessionHours <= 0) {
        setInputError('Please enter Session Duration when using package credits.');
        setIsSubmitting(false);
        return;
    }
    
    try {
      const finalAmountPaid = (formData.tookPackage || formData.isPackageCustomer) ? 0 : formData.amountPaid;
      const response = await fetch('/api/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
            ...formData, 
            mobile: mobile, // Send the mobile number from its dedicated state
            amountPaid: finalAmountPaid 
        })
      });

      if (response.ok) {
        setSuccess(true);
        setTimeout(() => {
            router.refresh(); // Refresh data on the target page
            router.push('/dashboard'); // Redirect Admin to Admin Dashboard
        }, 1500); 
        
        // Reset form state
        setMobile('');
        setClientInfo(null);
        setFormData({
          name: '', mobile: '', date: new Date().toISOString().split('T')[0],
          treatment: '', amountPaid: 0, sessionHours: 0, tookPackage: false,
          isPackageCustomer: false, outlet: 'Indiranagar',
        });
      } else {
         const errorData = await response.json();
         console.error('Submission failed:', errorData.error);
         alert(`Error: ${errorData.error}` || 'Error saving record');
         setIsSubmitting(false); 
      }
    } catch (error) {
      console.error('Error saving record:', error);
      alert('An unexpected error occurred.');
      setIsSubmitting(false); 
    } 
  };

  const showAmountField = !formData.tookPackage && !formData.isPackageCustomer;

  return (
    <div className="max-w-3xl mx-auto p-6 bg-white rounded-xl shadow-md mt-8 relative">
      <h1 className="text-2xl font-bold text-gray-800 mb-6">Client Treatment Record</h1>
      
      <button
        type="button"
        onClick={() => router.push('/dashboard')} 
        className="absolute top-6 right-6 text-gray-500 hover:text-gray-700 text-2xl"
      >
        &times;
      </button>

      {success && (
        <div className="mb-6 p-4 bg-green-50 text-green-700 rounded-lg border border-green-200">
          ✅ Client added successfully! Redirecting...
        </div>
      )}
      
      {inputError && (
          <div className="mb-4 p-3 bg-red-50 text-red-700 rounded-lg border border-red-200">
            {inputError}
          </div>
        )}

      <div className="mb-6">
        <label className="block text-sm font-medium text-gray-700 mb-2">Mobile Number *</label>
        <input
          type="tel"
          value={mobile} // Controlled by mobile state
          onChange={(e) => setMobile(e.target.value)} // Update mobile state
          required
          maxLength={10} // Optional: limit input length
          className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-gray-900"
          placeholder="Enter 10-digit mobile to lookup client"
        />
      </div>

      {/* Display Client Package Info if lookup successful */}
      {clientInfo && (
        <div className={`mb-6 p-4 rounded-lg border ${
          clientInfo.status === 'active' ? 'bg-green-50 border-green-200' : 'bg-yellow-50 border-yellow-200' // Changed expired to yellow
        }`}>
          <div className="flex justify-between items-center">
            <div>
              <span className="font-medium">
                {clientInfo.status === 'active' ? '✅ Active Package' : '⚠️ Package Expired/None'}
              </span>
              {/* Display name from clientInfo, not formData, as it's the source */}
              <span className="ml-2 font-semibold">{clientInfo.name}</span> 
            </div>
            {/* Show remaining hours only if package is active */}
            {clientInfo.status === 'active' && (
              <span className="px-2 py-1 bg-green-100 text-green-800 rounded-full text-sm">
                Remaining: {clientInfo.remainingHours.toFixed(1)} hrs
              </span>
            )}
          </div>
        </div>
      )}

      {/* Main Form Starts Here */}
      <form onSubmit={handleSubmit} className="space-y-5">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Full Name *</label>
            <input
              name="name"
              type="text"
              value={formData.name} // Controlled by formData, updated via lookup or manually
              onChange={handleChange}
              required
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-gray-900"
              placeholder={clientInfo ? '' : 'Enter name or lookup via mobile'}
            />
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Outlet *</label>
            <select
              name="outlet"
              value={formData.outlet}
              onChange={handleChange}
              required
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-gray-900"
            >
              <option value="Indiranagar">Indiranagar</option>
              <option value="Kaggadaspura">Kaggadaspura</option>
              <option value="Kalyan Nagar">Kalyan Nagar</option>
              <option value="Cunningham Road">Cunningham Road</option>
              <option value="HSR Layout">HSR Layout</option>
              <option value="Malleswaram">Malleswaram</option>
              <option value="Marathahalli">Marathahalli</option>
            </select>
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Treatment *</label>
            <input
              name="treatment"
              type="text"
              value={formData.treatment}
              onChange={handleChange}
              required
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-gray-900"
            />
          </div>
          
          {showAmountField && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Amount Paid (₹)</label>
              <input
                name="amountPaid"
                type="number"
                min="0"
                step="0.01"
                value={formData.amountPaid || ''}
                onChange={handleChange}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-gray-900"
              />
            </div>
          )}
          
          <div className="md:col-span-2">
            <label className="block text-sm font-medium text-gray-700 mb-1">Session Duration</label>
            <div className="flex space-x-3">
              <div className="flex-1">
                <input
                  type="number"
                  min="0"
                  placeholder="Hrs"
                  value={formData.sessionHours >= 1 ? Math.floor(formData.sessionHours) : ''} 
                  onChange={(e) => handleTimeChange(e.target.value, ((formData.sessionHours % 1) * 60).toString())}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-gray-900"
                />
              </div>
              <div className="flex-1">
                <input
                  type="number"
                  min="0"
                  max="59"
                  placeholder="Mins"
                  value={formData.sessionHours > 0 ? Math.round((formData.sessionHours % 1) * 60) : ''}
                  onChange={(e) => handleTimeChange(Math.floor(formData.sessionHours).toString(), e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-gray-900"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Package Options */}
        <div className="pt-4 border-t border-gray-200 space-y-3">
          <label className="flex items-center cursor-pointer">
            <div className="relative">
              <input
                type="checkbox"
                name="isPackageCustomer"
                checked={formData.isPackageCustomer}
                onChange={handleChange}
                className="sr-only"
                disabled={!clientInfo || clientInfo.status !== 'active'} // Can only check if lookup found an ACTIVE package
              />
              <div className={`block w-14 h-8 rounded-full ${formData.isPackageCustomer ? 'bg-blue-500' : 'bg-gray-300'} ${(!clientInfo || clientInfo.status !== 'active') ? 'opacity-50 cursor-not-allowed' : ''}`}></div>
              <div className={`absolute left-1 top-1 bg-white w-6 h-6 rounded-full transition-transform ${formData.isPackageCustomer ? 'transform translate-x-6' : ''}`}></div>
            </div>
            <div className={`ml-3 text-gray-700 text-sm ${(!clientInfo || clientInfo.status !== 'active') ? 'opacity-50' : ''}`}>
              Existing package customer (use package credits)
            </div>
          </label>
          
          <label className="flex items-center cursor-pointer">
            <div className="relative">
              <input
                type="checkbox"
                name="tookPackage"
                checked={formData.tookPackage}
                onChange={handleChange}
                className="sr-only"
                disabled={!!clientInfo && clientInfo.status === 'active'} // Disable if client already has an active package
              />
              <div className={`block w-14 h-8 rounded-full ${formData.tookPackage ? 'bg-purple-500' : 'bg-gray-300'} ${ (!!clientInfo && clientInfo.status === 'active') ? 'opacity-50 cursor-not-allowed' : ''}`}></div>
              <div className={`absolute left-1 top-1 bg-white w-6 h-6 rounded-full transition-transform ${formData.tookPackage ? 'transform translate-x-6' : ''}`}></div>
            </div>
            <div className={`ml-3 text-gray-700 text-sm ${ (!!clientInfo && clientInfo.status === 'active') ? 'opacity-50' : ''}`}>
              Taking a new package today
            </div>
          </label>
        </div>

        {/* New Package Details */}
        {formData.tookPackage && (
          <div className="mt-4 p-4 bg-purple-50 rounded-lg border border-purple-200 space-y-4">
            <h3 className="text-md font-semibold text-purple-800">New Package Details</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Package Amount (₹)</label>
                <input
                  name="packageAmount"
                  type="number"
                  min="0"
                  value={formData.packageAmount || ''}
                  onChange={handleChange}
                  required={formData.tookPackage} // Make required only if taking new package
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-1 focus:ring-purple-500 focus:border-purple-500 text-gray-900"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Total Hours</label>
                <input
                  name="totalPackageHours"
                  type="number"
                  min="0"
                  step="0.1"
                  value={formData.totalPackageHours || ''}
                  onChange={handleChange}
                  required={formData.tookPackage} // Make required only if taking new package
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-1 focus:ring-purple-500 focus:border-purple-500 text-gray-900"
                />
              </div>
            </div>
          </div>
        )}

        {/* Submit Button */}
        <button
          type="submit"
          disabled={isSubmitting}
          className="w-full py-3 px-4 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-400"
        >
          {isSubmitting ? 'Saving...' : 'Save Record'}
        </button>
      </form>
    </div>
  );
}