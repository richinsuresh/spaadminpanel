'use client';

import { useState } from 'react';
import { supabase } from '@/lib/supabase';
import { Search, Loader2, AlertCircle } from 'lucide-react';

type PackageInfo = {
  id: string;
  name: string;
  mobile: string;
  total_hours: number;
  used_hours: number;
  start_date: string;
  expiry_date: string;
  status: 'active' | 'expired';
  remaining_hours: number;
};

type Visit = {
  date: string;
  treatment: string;
  therapist_name: string | null;
  outlet_name: string;
  check_in_time: string | null;
};

type CustomerDetails = {
  packageInfo: PackageInfo | null;
  visitHistory: Visit[];
};

// Helper function to format date
const formatDate = (dateString: string) => {
  return new Date(dateString).toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
};

// Helper function to format time
const formatTime = (timeString: string | null) => {
  if (!timeString) return '—';
  return new Date(timeString).toLocaleTimeString('en-IN', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });
};

export default function SearchCustomersPage() {
  const [mobile, setMobile] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [customerDetails, setCustomerDetails] = useState<CustomerDetails | null>(null);

  const handleSearch = async () => {
    if (mobile.length !== 10) {
      setError('Please enter a valid 10-digit mobile number.');
      setCustomerDetails(null);
      return;
    }

    setIsLoading(true);
    setError(null);
    setCustomerDetails(null);

    try {
      // 1. Check for a package
      const { data: packageData, error: packageError } = await supabase
        .from('packages')
        .select('*')
        .eq('mobile', mobile)
        .single();

      let packageInfo: PackageInfo | null = null;
      if (packageData) {
        const now = new Date();
        const expiry = new Date(packageData.expiry_date);
        const remaining_hours = (packageData.total_hours || 0) - (packageData.used_hours || 0);
        const status = now > expiry || remaining_hours <= 0 ? 'expired' : 'active';
        
        packageInfo = { ...packageData, status, remaining_hours };
      }

      // 2. Fetch visit history
      const { data: visitData, error: visitError } = await supabase
        .from('customers')
        .select('date, treatment, therapist_name, outlet_name, check_in_time')
        .eq('mobile', mobile)
        .order('date', { ascending: false })
        .order('check_in_time', { ascending: false, nullsFirst: true });

      if (visitError) throw visitError;
      
      if (!packageInfo && visitData.length === 0) {
        setError('No records found for this mobile number.');
      } else {
        setCustomerDetails({
          packageInfo,
          visitHistory: visitData || [],
        });
      }

    } catch (err: any) {
      console.error('Search error:', err);
      setError(`An error occurred: ${err.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-800">Search Customers</h1>

      {/* Search Bar */}
      <div className="bg-white p-4 rounded-xl shadow-sm flex items-center gap-4">
        <input
          type="tel"
          value={mobile}
          onChange={(e) => setMobile(e.target.value.replace(/\D/g, ''))}
          maxLength={10}
          placeholder="Enter 10-digit mobile number..."
          className="flex-grow px-4 py-2 border border-gray-300 rounded-lg text-black focus:ring-2 focus:ring-blue-500"
          onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
        />
        <button
          onClick={handleSearch}
          disabled={isLoading}
          className="px-5 py-2 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2"
        >
          {isLoading ? <Loader2 size={18} className="animate-spin" /> : <Search size={18} />}
          Search
        </button>
      </div>

      {/* Error Message */}
      {error && (
        <div className="bg-red-50 text-red-700 border border-red-200 p-4 rounded-lg flex items-center gap-3">
          <AlertCircle size={20} />
          <span className="font-medium">{error}</span>
        </div>
      )}

      {/* Results */}
      {customerDetails && (
        <div className="space-y-6">
          {/* Package Status Card */}
          <div className="bg-white p-6 rounded-xl shadow-sm">
            <h2 className="text-lg font-semibold text-gray-700 mb-4">Package Status</h2>
            {customerDetails.packageInfo ? (
              <div className={`p-4 rounded-lg border ${customerDetails.packageInfo.status === 'active' ? 'bg-green-50 border-green-200 text-green-800' : 'bg-red-50 border-red-200 text-red-800'}`}>
                <div className="flex justify-between items-center">
                  <span className="text-xl font-bold">
                    {customerDetails.packageInfo.status === 'active' ? 'Active Package' : 'Expired/Used Package'}
                  </span>
                  <span className="text-lg font-semibold">
                    {customerDetails.packageInfo.remaining_hours.toFixed(1)} hrs remaining
                  </span>
                </div>
                <div className="mt-2 text-sm">
                  <p>Client: <span className="font-medium">{customerDetails.packageInfo.name}</span></p>
                  <p>Total: <span className="font-medium">{customerDetails.packageInfo.total_hours} hrs</span> | Used: <span className="font-medium">{customerDetails.packageInfo.used_hours.toFixed(1)} hrs</span></p>
                  <p>Expires on: <span className="font-medium">{formatDate(customerDetails.packageInfo.expiry_date)}</span></p>
                </div>
              </div>
            ) : (
              <p className="text-gray-500">No package found for this customer.</p>
            )}
          </div>

          {/* Visit History Table */}
          <div className="bg-white shadow rounded-lg overflow-hidden">
            <h2 className="text-lg font-semibold text-gray-700 p-6">Visit History</h2>
            {customerDetails.visitHistory.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Last Visit</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Treatment</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Therapist</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Outlet</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {customerDetails.visitHistory.map((visit, index) => (
                      <tr key={index}>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">{formatDate(visit.date)}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">{formatTime(visit.check_in_time)}</td>
                        <td className="px-6 py-4 text-sm text-gray-700 max-w-xs">{visit.treatment}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">{visit.therapist_name || 'N/A'}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">{visit.outlet_name}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="text-gray-500 px-6 pb-6">No visit history found.</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}