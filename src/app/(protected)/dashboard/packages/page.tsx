// src/app/(protected)/dashboard/packages/page.tsx
'use client';

import { useState, useEffect } from 'react';

type PackageCustomer = {
  name: string;
  mobile: string;
  packageAmount: number;
  totalPackageHours: number;
  usedPackageHours: number;
  remainingHours: number;
  expiryDate: string;
  status: 'active' | 'expired';
  outlet: string;
};

export default function PackagesPage() {
  const [allCustomers, setAllCustomers] = useState<PackageCustomer[]>([]);
  const [filteredCustomers, setFilteredCustomers] = useState<PackageCustomer[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'expired'>('all');
  const [loading, setLoading] = useState(true);

  const fetchPackageCustomers = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/customers');
      if (res.ok) {
        const allCustomersData = await res.json();
        
        // Group by mobile to get unique clients with packages
        const packageMap = new Map<string, PackageCustomer>();
        
        // First pass: find all package purchases
        const packagePurchases = allCustomersData.filter((c: any) => c.tookPackage);
        packagePurchases.forEach((purchase: any) => {
          const key = purchase.mobile;
          if (!packageMap.has(key)) {
            const expiry = new Date(purchase.date);
            expiry.setMonth(expiry.getMonth() + 2);
            
            packageMap.set(key, {
              name: purchase.name,
              mobile: purchase.mobile,
              packageAmount: purchase.packageAmount || 0,
              totalPackageHours: purchase.totalPackageHours || 0,
              usedPackageHours: 0,
              remainingHours: purchase.totalPackageHours || 0,
              expiryDate: expiry.toISOString().split('T')[0],
              status: 'active',
              outlet: purchase.outlet || 'Unknown'
            });
          }
        });

        // Second pass: calculate used hours for each package client
        allCustomersData.forEach((session: any) => {
          const pkg = packageMap.get(session.mobile);
          if (pkg) {
            // Only count sessions that happened after package purchase
            const purchaseDate = new Date(
              packagePurchases.find((p: any) => p.mobile === session.mobile)?.date || ''
            );
            const sessionDate = new Date(session.date);
            
            if (sessionDate >= purchaseDate) {
              pkg.usedPackageHours += session.sessionHours || 0;
            }
          }
        });

        // Update remaining hours and status
        const now = new Date();
        const result = Array.from(packageMap.values()).map(pkg => {
          pkg.remainingHours = Math.max(0, pkg.totalPackageHours - pkg.usedPackageHours);
          const expiry = new Date(pkg.expiryDate);
          const hoursExhausted = pkg.remainingHours <= 0;
          const timeExpired = now > expiry;
          pkg.status = (hoursExhausted || timeExpired) ? 'expired' : 'active';
          return pkg;
        });

        setAllCustomers(result);
      }
    } catch (err) {
      console.error('Error:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPackageCustomers();
  }, []);

  useEffect(() => {
    let result = [...allCustomers];
    
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
    
    setFilteredCustomers(result);
  }, [searchTerm, statusFilter, allCustomers]);

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
        <h1 className="text-2xl font-bold text-gray-800">Package Clients</h1>
        
        <div className="flex flex-col sm:flex-row gap-3">
          <button
            onClick={fetchPackageCustomers}
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
          
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as any)}
            className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500 text-gray-900"
          >
            <option value="all">All Statuses</option>
            <option value="active">Active</option>
            <option value="expired">Expired</option>
          </select>
        </div>
      </div>

      <div className="mb-4 text-sm text-gray-600">
        Showing {filteredCustomers.length} of {allCustomers.length} package clients
      </div>

      {loading ? (
        <div className="bg-white shadow rounded-lg p-8 text-center">
          Loading package clients...
        </div>
      ) : filteredCustomers.length === 0 ? (
        <div className="bg-white shadow rounded-lg p-8 text-center text-gray-500">
          {allCustomers.length === 0 
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
                {filteredCustomers.map((customer, index) => (
                  <tr key={index} className="hover:bg-gray-50">
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
                      {formatCurrency(customer.packageAmount)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {customer.totalPackageHours} hrs
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {customer.usedPackageHours.toFixed(1)} hrs
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                      <span className={
                        customer.status === 'active' && customer.remainingHours < 1
                          ? 'text-red-600'
                          : customer.status === 'active'
                          ? 'text-green-600'
                          : 'text-gray-500'
                      }>
                        {customer.remainingHours.toFixed(1)} hrs
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {new Date(customer.expiryDate).toLocaleDateString()}
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