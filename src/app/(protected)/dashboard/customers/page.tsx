'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { OUTLETS } from '@/lib/outlet';

// --- Types ---
type CustomerVisit = {
  id: string;
  name: string;
  mobile: string;
  date: string;
  treatment: string;
  session_hours: number;
  outlet_name: string; // <-- FIX: Use new column
  therapist_name?: string;
};

// --- FIX: This type now matches the API response ---
type PackageInfo = {
  id?: string;
  name: string;
  mobile: string;
  packageAmount: number;
  totalPackageHours: number;
  usedPackageHours: number;
  remainingHours: number;
  expiryDate: string;
  status: 'active' | 'expired';
  outlet?: string;
};

type CustomerDetails = {
  name: string;
  mobile: string;
  packageInfo: PackageInfo | null;
  visits: CustomerVisit[]; // This will be the type from the 'customers' table
};

// --- Helper Functions ---
const formatCurrency = (amountInPaise: number) =>
  new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amountInPaise / 100);

const formatDuration = (hours: number | null) => {
  if (!hours || hours === 0) return '—';
  if (hours < 1) return `${Math.round(hours * 60)} mins`;
  
  const h = Math.floor(hours);
  const m = Math.round((hours % 1) * 60);
  
  if (m === 0) return `${h} hr${h > 1 ? 's' : ''}`;
  if (h === 0) return `${m} mins`;
  return `${h}hr ${m}m`;
};

const formatDate = (dateString: string | null) => {
  if (!dateString) return '—';
  return new Date(dateString).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
};


export default function CustomersPage() {
  const [customers, setCustomers] = useState<CustomerVisit[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [outletFilter, setOutletFilter] = useState('all');

  const [modalLoading, setModalLoading] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState<CustomerDetails | null>(null);
  const [modalError, setModalError] = useState('');

  const outlets = ['all', ...OUTLETS.map(o => o.name)];

  const fetchCustomers = async () => {
    try {
      setLoading(true);
      // --- FIX: Select 'outlet_name' and removed 'took_package' ---
      const { data, error } = await supabase
        .from('customers')
        .select('id, name, mobile, date, treatment, session_hours, outlet_name, therapist_name, check_in_time, check_out_time')
        .order('date', { ascending: false });
      
      if (error) throw error;
      setCustomers(data as CustomerVisit[] || []);
    } catch (err) {
      console.error('Error fetching customers:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCustomers();
  }, []);

  // --- FIX: handleCustomerClick now uses the API for package info ---
  const handleCustomerClick = async (customer: CustomerVisit) => {
    setSelectedCustomer({ name: customer.name, mobile: customer.mobile, packageInfo: null, visits: [] });
    setModalLoading(true);
    setModalError('');

    try {
      const [pkgRes, visitsRes] = await Promise.all([
        // Use the API to get the correct *active* package
        fetch(`/api/client-lookup?mobile=${encodeURIComponent(customer.mobile)}`),
        // Get last 3 visits
        supabase
          .from('customers')
          .select('id, date, treatment, outlet_name, therapist_name, session_hours')
          .eq('mobile', customer.mobile)
          .order('date', { ascending: false })
          .limit(3)
      ]);

      const packageInfo: PackageInfo | null = await pkgRes.json();
      
      if (visitsRes.error) {
        throw new Error(`Visits Error: ${visitsRes.error.message}`);
      }

      setSelectedCustomer({
        name: customer.name,
        mobile: customer.mobile,
        packageInfo: packageInfo, // This is now the correct, active package
        visits: visitsRes.data as CustomerVisit[] || []
      });

    } catch (err: any) {
      console.error('Error fetching customer details:', err);
      setModalError(err.message);
    } finally {
      setModalLoading(false);
    }
  };

  const filteredCustomers = customers.filter(customer => {
    const matchesSearch = !searchTerm || 
      customer.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      customer.mobile.includes(searchTerm);
    
    // --- FIX: Filter by 'outlet_name' ---
    const matchesOutlet = outletFilter === 'all' || customer.outlet_name === outletFilter;
    
    return matchesSearch && matchesOutlet;
  });
  
  const uniqueCustomers = Array.from(new Map(filteredCustomers.map(c => [c.mobile, c])).values())
    .sort((a,b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  return (
    <div>
      {/* Page Header */}
      <div className="flex flex-col lg:flex-row lg:justify-between lg:items-start mb-8 gap-4">
        <h1 className="text-2xl font-bold text-gray-800">All Customers</h1>
        
        <div className="flex flex-col sm:flex-row gap-3">
          <button
            onClick={fetchCustomers}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center"
          >
            🔄 Refresh Data
          </button>
          
          <Link
            href="/form"
            className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700"
          >
            ➕ Add New Customer
          </Link>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white p-6 rounded-xl shadow mb-6">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <div>
            <label htmlFor="search" className="block text-sm font-medium text-gray-700 mb-1">
              Search
            </label>
            <input
              id="search"
              type="text"
              placeholder="Name or mobile..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500 text-gray-900"
            />
          </div>
          
          <div>
            <label htmlFor="outlet" className="block text-sm font-medium text-gray-700 mb-1">
              Outlet
            </label>
            <select
              id="outlet"
              value={outletFilter}
              onChange={(e) => setOutletFilter(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500 text-gray-900"
            >
              {outlets.map(outlet => (
                <option key={outlet} value={outlet}>
                  {outlet === 'all' ? 'All Outlets' : outlet}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      <div className="mb-4 text-sm text-gray-600">
        Showing {uniqueCustomers.length} unique customers. Click a row for details.
      </div>

      {loading ? (
        <div className="bg-white shadow rounded-lg p-8 text-center">
          Loading customers...
        </div>
      ) : uniqueCustomers.length === 0 ? (
        <div className="bg-white shadow rounded-lg p-8 text-center text-gray-500">
          No customers match your filters.
        </div>
      ) : (
        <div className="bg-white shadow rounded-lg overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Name</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Mobile</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Last Visit Date</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Last Outlet</th>
                  {/* --- FIX: Removed "Had Package" header --- */}
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {uniqueCustomers.map((customer) => (
                  <tr 
                    key={customer.id} 
                    onClick={() => handleCustomerClick(customer)}
                    className="hover:bg-gray-50 cursor-pointer"
                  >
                    <td className="px-6 py-4 whitespace-nowrap font-medium text-gray-900">
                      {customer.name}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {customer.mobile}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {formatDate(customer.date)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {/* --- FIX: Display 'outlet_name' --- */}
                      {customer.outlet_name}
                    </td>
                    {/* --- FIX: Removed "Had Package" cell --- */}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* --- RENDER THE MODAL --- */}
      {selectedCustomer && (
        <div 
          className="fixed inset-0 z-40 flex items-center justify-center p-4 bg-black/30" // Added background
          onClick={() => setSelectedCustomer(null)} // Close on overlay click
        >
          <div 
            className="bg-white rounded-lg shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()} // Prevent modal from closing on inner click
          >
            {/* Modal Header */}
            <div className="p-4 border-b sticky top-0 bg-white z-10">
              <div className="flex justify-between items-center">
                <div>
                  <h2 className="text-xl font-bold text-gray-900">{selectedCustomer.name}</h2>
                  <p className="text-sm text-gray-600">{selectedCustomer.mobile}</p>
                </div>
                <button 
                  onClick={() => setSelectedCustomer(null)} 
                  className="text-gray-400 hover:text-gray-600"
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
              </div>
            </div>

            {/* Modal Body */}
            {modalLoading ? (
              <div className="p-6 text-center text-gray-500">Loading details...</div>
            ) : modalError ? (
              <div className="p-6 text-center text-red-600">{modalError}</div>
            ) : (
              <div className="p-6 space-y-6">
                
                {/* --- FIX: Package Details Section now uses camelCase --- */}
                <div className="bg-gray-50 p-4 rounded-lg">
                  <h3 className="text-lg font-semibold text-gray-800 mb-3">Package Details</h3>
                  {selectedCustomer.packageInfo ? (
                    <dl className="grid grid-cols-2 gap-x-4 gap-y-2">
                      <dt className="text-sm font-medium text-gray-500">Package Price</dt>
                      <dd className="text-sm text-gray-900 font-medium">{formatCurrency(selectedCustomer.packageInfo.packageAmount)}</dd>
                      
                      <dt className="text-sm font-medium text-gray-500">Status</dt>
                      <dd className="text-sm text-gray-900">
                        <span className={`px-2 py-0.5 text-xs font-semibold rounded-full ${
                          selectedCustomer.packageInfo.status === 'active' 
                            ? 'bg-green-100 text-green-800' 
                            : 'bg-red-100 text-red-800'
                        }`}>
                          {selectedCustomer.packageInfo.status}
                        </span>
                      </dd>

                      <dt className="text-sm font-medium text-gray-500">Total Hours</dt>
                      <dd className="text-sm text-gray-900">{selectedCustomer.packageInfo.totalPackageHours} hrs</dd>

                      <dt className="text-sm font-medium text-gray-500">Used Hours</dt>
                      <dd className="text-sm text-gray-900">{selectedCustomer.packageInfo.usedPackageHours.toFixed(1)} hrs</dd>

                      <dt className="text-sm font-medium text-gray-500">Remaining</dt>
                      <dd className="text-sm font-bold text-blue-600">{selectedCustomer.packageInfo.remainingHours.toFixed(1)} hrs</dd>

                      <dt className="text-sm font-medium text-gray-500">Expires On</dt>
                      <dd className="text-sm text-gray-900">{formatDate(selectedCustomer.packageInfo.expiryDate)}</dd>
                    </dl>
                  ) : (
                    <p className="text-sm text-gray-500">No active package found for this mobile number.</p>
                  )}
                </div>

                {/* Visit History Section */}
                <div>
                  <h3 className="text-lg font-semibold text-gray-800 mb-3">Last 3 Visits</h3>
                  {selectedCustomer.visits.length === 0 ? (
                    <p className="text-sm text-gray-500">No visit history found.</p>
                  ) : (
                    <ul className="divide-y divide-gray-200">
                      {selectedCustomer.visits.map(visit => (
                        <li key={visit.id} className="py-3">
                          <div className="flex justify-between items-center mb-1">
                            <span className="text-sm font-medium text-gray-900">{visit.treatment}</span>
                            <span className="text-sm text-gray-500">{formatDate(visit.date)}</span>
                          </div>
                          <div className="flex justify-between items-center text-sm text-gray-600">
                            {/* --- FIX: Use 'outlet_name' --- */}
                            <span>{visit.outlet_name}</span>
                            <span className="flex gap-4">
                              <span>Therapist: {visit.therapist_name || 'N/A'}</span>
                              <span>Duration: {formatDuration(visit.session_hours)}</span>
                            </span>
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}