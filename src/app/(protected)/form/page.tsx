// src/app/(protected)/form/page.tsx
'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';

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

type FormData = {
  name: string;
  mobile: string;
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
  const [mobile, setMobile] = useState('');
  const [clientInfo, setClientInfo] = useState<ClientInfo | null>(null);
  const [formData, setFormData] = useState<FormData>({
    name: '',
    mobile: '',
    date: new Date().toISOString().split('T')[0],
    treatment: '',
    amountPaid: 0,
    sessionHours: 0,
    tookPackage: false,
    isPackageCustomer: false,
    outlet: 'Indiranagar',
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const lookupTimeout = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    return () => {
      if (lookupTimeout.current) clearTimeout(lookupTimeout.current);
    };
  }, []);

  useEffect(() => {
    if (mobile.length >= 10) {
      const lookup = async () => {
        try {
          const res = await fetch(`/api/client-lookup?mobile=${encodeURIComponent(mobile)}`);
          const data = res.ok ? await res.json() : null;
          setClientInfo(data);
          
          if (data) {
            setFormData(prev => ({
              ...prev,
              name: data.name,
              isPackageCustomer: data.status === 'active'
            }));
          } else {
            setFormData(prev => ({
              ...prev,
              isPackageCustomer: false,
              tookPackage: false
            }));
          }
        } catch (e) {
          setClientInfo(null);
        }
      };
      
      lookupTimeout.current = setTimeout(lookup, 500);
    } else {
      setClientInfo(null);
    }
  }, [mobile]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value, type } = e.target;
    const checked = (e.target as HTMLInputElement).checked;
    
    setFormData(prev => {
      const updated = {
        ...prev,
        [name]: type === 'checkbox' ? checked : type === 'number' ? (value === '' ? 0 : Number(value)) : value
      };
      
      if (name === 'isPackageCustomer' && checked) updated.tookPackage = false;
      if (name === 'tookPackage' && checked) updated.isPackageCustomer = false;
      
      return updated;
    });
  };

  const handleTimeChange = (hours: string, minutes: string) => {
    const h = parseFloat(hours) || 0;
    const m = parseFloat(minutes) || 0;
    setFormData(prev => ({ ...prev, sessionHours: h + (m / 60) }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    
    try {
      const finalAmountPaid = (formData.tookPackage || formData.isPackageCustomer) ? 0 : formData.amountPaid;
      const response = await fetch('/api/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...formData, amountPaid: finalAmountPaid })
      });

      if (response.ok) {
        setSuccess(true);
        
        // FIX 1: Use router.refresh() to force the previous page (dashboard) to re-fetch data.
        router.refresh(); 
        
        // FIX 2: Redirect to the Outlet Dashboard.
        router.push('/outlet/dashboard'); 
        
        setMobile('');
        setClientInfo(null);
        setFormData({
          name: '',
          mobile: '',
          date: new Date().toISOString().split('T')[0],
          treatment: '',
          amountPaid: 0,
          sessionHours: 0,
          tookPackage: false,
          isPackageCustomer: false,
          outlet: 'Indiranagar',
        });
      }
    } catch (error) {
      // NOTE: Using console.error instead of alert for better DX
      console.error('Error saving record:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const showAmountField = !formData.tookPackage && !formData.isPackageCustomer;

  return (
    <div className="max-w-3xl mx-auto p-6 bg-white rounded-xl shadow-md mt-8 relative">
      <h1 className="text-2xl font-bold text-gray-800 mb-6">Client Treatment Record</h1>
      
      <button
        type="button"
        // FIX: The close/back button should also point to the Outlet Dashboard for the Outlet user context.
        onClick={() => router.push('/outlet/dashboard')} 
        className="absolute top-6 right-6 text-gray-500 hover:text-gray-700 text-2xl"
      >
        &times;
      </button>

      {success && (
        <div className="mb-6 p-4 bg-green-50 text-green-700 rounded-lg border border-green-200">
          ✅ Record saved successfully!
        </div>
      )}

      <div className="mb-6">
        <label className="block text-sm font-medium text-gray-700 mb-2">Mobile Number *</label>
        <input
          type="tel"
          value={mobile}
          onChange={(e) => setMobile(e.target.value)}
          required
          className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-gray-900"
          placeholder="Enter mobile number"
        />
      </div>

      {clientInfo && (
        <div className={`mb-6 p-4 rounded-lg border ${
          clientInfo.status === 'active' ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'
        }`}>
          <div className="flex justify-between items-center">
            <div>
              <span className="font-medium">
                {clientInfo.status === 'active' ? '✅ Active Package' : '❌ Expired Package'}
              </span>
              <span className="ml-2 font-semibold">{clientInfo.name}</span>
            </div>
            <span className="px-2 py-1 bg-green-100 text-green-800 rounded-full text-sm">
              Remaining: {clientInfo.remainingHours.toFixed(1)} hrs
            </span>
          </div>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-5">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Full Name *</label>
            <input
              name="name"
              type="text"
              value={formData.name}
              onChange={handleChange}
              required
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-gray-900"
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
              <label className="block text-sm font-medium text-gray-700 mb-1">Amount Paid ($)</label>
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
                  value={Math.floor(formData.sessionHours)}
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
                  value={Math.round((formData.sessionHours % 1) * 60)}
                  onChange={(e) => handleTimeChange(Math.floor(formData.sessionHours).toString(), e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-gray-900"
                />
              </div>
            </div>
          </div>
        </div>

        <div className="pt-4 border-t border-gray-200 space-y-3">
          <label className="flex items-center cursor-pointer">
            <div className="relative">
              <input
                type="checkbox"
                name="isPackageCustomer"
                checked={formData.isPackageCustomer}
                onChange={handleChange}
                className="sr-only"
              />
              <div className={`block w-14 h-8 rounded-full ${formData.isPackageCustomer ? 'bg-blue-500' : 'bg-gray-300'}`}></div>
              <div className={`absolute left-1 top-1 bg-white w-6 h-6 rounded-full transition-transform ${formData.isPackageCustomer ? 'transform translate-x-6' : ''}`}></div>
            </div>
            <div className="ml-3 text-gray-700 text-sm">
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
              />
              <div className={`block w-14 h-8 rounded-full ${formData.tookPackage ? 'bg-purple-500' : 'bg-gray-300'}`}></div>
              <div className={`absolute left-1 top-1 bg-white w-6 h-6 rounded-full transition-transform ${formData.tookPackage ? 'transform translate-x-6' : ''}`}></div>
            </div>
            <div className="ml-3 text-gray-700 text-sm">
              Taking a new package today
            </div>
          </label>
        </div>

        {formData.tookPackage && (
          <div className="mt-4 p-4 bg-purple-50 rounded-lg border border-purple-200 space-y-4">
            <h3 className="text-md font-semibold text-purple-800">Package Details</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm text-gray-700 mb-1">Package Amount (₹)</label>
                <input
                  name="packageAmount"
                  type="number"
                  min="0"
                  value={formData.packageAmount || ''}
                  onChange={handleChange}
                  className="w-full px-3 py-2 border border-gray-300 rounded focus:ring-1 focus:ring-purple-500 focus:border-purple-500 text-gray-900"
                />
              </div>
              <div>
                <label className="block text-sm text-gray-700 mb-1">Total Hours</label>
                <input
                  name="totalPackageHours"
                  type="number"
                  min="0"
                  step="0.1"
                  value={formData.totalPackageHours || ''}
                  onChange={handleChange}
                  className="w-full px-3 py-2 border border-gray-300 rounded focus:ring-1 focus:ring-purple-500 focus:border-purple-500 text-gray-900"
                />
              </div>
            </div>
          </div>
        )}

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
