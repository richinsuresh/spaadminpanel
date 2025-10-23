// src/app/(protected)/dashboard/packages/page.tsx
'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';

type PackageCustomer = {
  id: string;
  name: string;
  mobile: string;
  package_amount: number;
  total_hours: number;
  used_hours: number;
  remaining_hours: number;
  start_date: string;
  expiry_date: string;
  status: 'active' | 'expired';
  outlet: string;
};

export default function PackagesPage() {
  const [packages, setPackages] = useState<PackageCustomer[]>([]);
  const [filteredPackages, setFilteredPackages] = useState<PackageCustomer[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'expired'>('all');
  const [loading, setLoading] = useState(true);
  
  const outlets = [
    'all', 'Indiranagar', 'Kaggadaspura', 'Kalyan Nagar', 'Cunningham Road', 
    'HSR Layout', 'Malleswaram', 'Marathahalli'
  ];
  const [outletFilter, setOutletFilter] = useState('all');

  const fetchPackages = async () => {
    try {
      setLoading(true);
      // Admin fetches ALL packages
      const { data, error } = await supabase
        .from('packages')
        .select('*')
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      setPackages(data || []);
    } catch (err) {
      console.error('Error fetching packages:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPackages();
    
    // Auto-refresh every 30 seconds
    const interval = setInterval(fetchPackages, 30000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    let result = [...packages];
    
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      result = result.filter(customer => 
        customer.name.toLowerCase().includes(term) ||
        customer.mobile.includes(term)
      );
    }
    
    if (statusFilter !== 'all') {
      result = result.filter(customer => customer.status === statusFilter);
    }
    
    if (outletFilter !== 'all') {
        result = result.filter(customer => customer.outlet === outletFilter);
    }
    
    setFilteredPackages(result);
  }, [searchTerm, statusFilter, outletFilter, packages]);

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      minimumFractionDigits: 0
    }).format(amount);
  };

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center mb-8 gap-4">
        <h1 className="text-2xl font-bold text-gray-800">All Package Clients</h1>
        
        <div className="flex flex-col sm:flex-row gap-3">
          <button
            onClick={fetchPackages}
            disabled={loading}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed flex items-center"
          >
            {loading ? 'Refreshing...' : '🔄 Refresh Data'}
          </button>
          
          <div className="relative">
            <input
              type="text"
              placeholder="Search by name or mobile..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500 text-gray-900"
            />
            <svg 
              className="absolute left-3 top-2.5 h-5 w-5 text-gray-400" 
              fill="none" 
              stroke="currentColor" 
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </div>
        </div>
      </div>
      
      {/* Filters */}
      <div className="bg-white p-6 rounded-xl shadow mb-6">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <div>
                <label htmlFor="status" className="block text-sm font-medium text-gray-700 mb-1">
                Status
                </label>
                <select
                    id="status"
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value as any)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500 text-gray-900"
                >
                    <option value="all">All Statuses</option>
                    <option value="active">Active</option>
                    <option value="expired">Expired</option>
                </select>
            </div>
            <div>
                <label htmlFor="outlet" className="block text-sm font-medium text-gray-700 mb-1">
                Outlet Filter
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
        Showing {filteredPackages.length} of {packages.length} package clients
      </div>

      {loading ? (
        <div className="bg-white shadow rounded-lg p-8 text-center">
          Loading package clients...
        </div>
      ) : filteredPackages.length === 0 ? (
        <div className="bg-white shadow rounded-lg p-8 text-center text-gray-500">
          {packages.length === 0 
            ? 'No package clients found.' 
            : 'No clients match your filters.'}
        </div>
      ) : (
        <div className="bg-white shadow rounded-lg overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Name</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Mobile</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Outlet</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Package</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Total Hours</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Used Hours</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Remaining</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Expiry Date</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {filteredPackages.map((customer) => (
                  <tr key={customer.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                      {customer.name}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {customer.mobile}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {customer.outlet}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {formatCurrency(customer.package_amount)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {customer.total_hours} hrs
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {customer.used_hours.toFixed(1)} hrs
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                      <span className={
                        customer.status === 'active' && customer.remaining_hours < 1
                          ? 'text-red-600'
                          : customer.status === 'active'
                          ? 'text-green-600'
                          : 'text-gray-500'
                      }>
                        {customer.remaining_hours.toFixed(1)} hrs
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {new Date(customer.expiry_date).toLocaleDateString('en-IN')}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                        customer.status === 'active' 
                          ? 'bg-green-100 text-green-800' 
                          : 'bg-red-100 text-red-800'
                      }`}>
                        {customer.status.charAt(0).toUpperCase() + customer.status.slice(1)}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
