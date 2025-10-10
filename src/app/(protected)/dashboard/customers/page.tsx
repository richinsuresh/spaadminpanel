// src/app/(protected)/dashboard/customers/page.tsx
'use client';

import { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';

type Customer = {
  name: string;
  mobile: string;
  date: string;
  treatment: string;
  sessionHours: number;
  tookPackage: boolean;
  packageAmount?: number;
  totalPackageHours?: number;
  outlet: string;
  amountPaid?: number;
};

type CustomerSummary = {
  name: string;
  mobile: string;
  lastVisit: string;
  lastTreatment: string;
  hasPackage: boolean;
  outlet: string;
  totalVisits: number;
  totalSpent: number;
};

export default function CustomersPage() {
  const [allCustomers, setAllCustomers] = useState<Customer[]>([]);
  const [filteredCustomers, setFilteredCustomers] = useState<CustomerSummary[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [outletFilter, setOutletFilter] = useState('all');
  const [dateRange, setDateRange] = useState({ start: '', end: '' });
  const [loading, setLoading] = useState(true);
  const [exportLoading, setExportLoading] = useState(false);

  // Outlet options
  const outlets = [
    'all',
    'Indiranagar',
    'Kaggadaspura',
    'Kalyan Nagar',
    'Cunningham Road',
    'HSR Layout',
    'Malleswaram',
    'Marathahalli'
  ];

  useEffect(() => {
    fetchCustomers();
  }, []);

  // Aggregate and filter customers
  useEffect(() => {
    if (allCustomers.length === 0) return;

    // Aggregate customers by mobile (unique customers)
    const customerMap = new Map<string, CustomerSummary>();
    
    allCustomers.forEach(customer => {
      const key = `${customer.mobile}-${customer.outlet}`;
      
      if (!customerMap.has(key)) {
        customerMap.set(key, {
          name: customer.name,
          mobile: customer.mobile,
          lastVisit: customer.date,
          lastTreatment: customer.treatment,
          hasPackage: customer.tookPackage,
          outlet: customer.outlet,
          totalVisits: 0,
          totalSpent: 0
        });
      }
      
      const existing = customerMap.get(key)!;
      // Update last visit if this is more recent
      if (new Date(customer.date) > new Date(existing.lastVisit)) {
        existing.lastVisit = customer.date;
        existing.lastTreatment = customer.treatment;
      }
      existing.totalVisits += 1;
      existing.totalSpent += customer.amountPaid || 0;
      existing.hasPackage = existing.hasPackage || customer.tookPackage;
    });

    let result = Array.from(customerMap.values());

    // Apply date range filter (to lastVisit)
    if (dateRange.start || dateRange.end) {
      const startDate = dateRange.start ? new Date(dateRange.start) : null;
      const endDate = dateRange.end ? new Date(dateRange.end) : null;
      
      result = result.filter(customer => {
        const visitDate = new Date(customer.lastVisit);
        const afterStart = !startDate || visitDate >= startDate;
        const beforeEnd = !endDate || visitDate <= endDate;
        return afterStart && beforeEnd;
      });
    }

    // Apply outlet filter
    if (outletFilter !== 'all') {
      result = result.filter(customer => customer.outlet === outletFilter);
    }

    // Apply search filter
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      result = result.filter(customer => 
        customer.name.toLowerCase().includes(term) ||
        customer.mobile.includes(term)
      );
    }

    // Sort by last visit (newest first)
    result.sort((a, b) => new Date(b.lastVisit).getTime() - new Date(a.lastVisit).getTime());
    
    setFilteredCustomers(result);
  }, [allCustomers, searchTerm, outletFilter, dateRange]);

  const fetchCustomers = async () => {
    try {
      const res = await fetch('/api/customers');
      if (res.ok) {
        const data = await res.json();
        setAllCustomers(data);
      }
    } catch (err) {
      console.error('Error:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleExport = async () => {
    setExportLoading(true);
    try {
      // Filter data for export based on current filters
      const exportData = filteredCustomers.map(customer => ({
        Name: customer.name,
        Mobile: customer.mobile,
        'Last Visit': new Date(customer.lastVisit).toLocaleDateString(),
        'Last Treatment': customer.lastTreatment,
        'Has Package': customer.hasPackage ? 'Yes' : 'No',
        Outlet: customer.outlet,
        'Total Visits': customer.totalVisits,
        'Total Spent (₹)': Math.round(customer.totalSpent)
      }));

      // Create export URL with filtered data
      const response = await fetch('/api/export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data: exportData, filename: 'customers_export.xlsx' })
      });

      if (response.ok) {
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'customers_export.xlsx';
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
      }
    } catch (error) {
      alert('Export failed. Please try again.');
      console.error('Export error:', error);
    } finally {
      setExportLoading(false);
    }
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      minimumFractionDigits: 0
    }).format(amount);
  };

  return (
    <div>
      <div className="flex flex-col lg:flex-row lg:justify-between lg:items-start mb-8 gap-4">
        <h1 className="text-2xl font-bold text-gray-800">All Customers</h1>
        
        <div className="flex flex-col sm:flex-row gap-3">
          <button
            onClick={handleExport}
            disabled={exportLoading || filteredCustomers.length === 0}
            className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:bg-gray-400 disabled:cursor-not-allowed flex items-center"
          >
            {exportLoading ? 'Exporting...' : '📥 Export to Excel'}
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
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Search */}
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
          
          {/* Outlet Filter */}
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
          
          {/* Date Range Start */}
          <div>
            <label htmlFor="dateStart" className="block text-sm font-medium text-gray-700 mb-1">
              From Date
            </label>
            <input
              id="dateStart"
              type="date"
              value={dateRange.start}
              onChange={(e) => setDateRange(prev => ({ ...prev, start: e.target.value }))}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500 text-gray-900"
            />
          </div>
          
          {/* Date Range End */}
          <div>
            <label htmlFor="dateEnd" className="block text-sm font-medium text-gray-700 mb-1">
              To Date
            </label>
            <input
              id="dateEnd"
              type="date"
              value={dateRange.end}
              onChange={(e) => setDateRange(prev => ({ ...prev, end: e.target.value }))}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500 text-gray-900"
            />
          </div>
        </div>
      </div>

      {/* Results Summary */}
      <div className="mb-4 text-sm text-gray-600">
        Showing {filteredCustomers.length} unique customers
        {dateRange.start && ` from ${new Date(dateRange.start).toLocaleDateString()}`}
        {dateRange.end && ` to ${new Date(dateRange.end).toLocaleDateString()}`}
      </div>

      {loading ? (
        <div className="bg-white shadow rounded-lg p-8 text-center">
          Loading customers...
        </div>
      ) : filteredCustomers.length === 0 ? (
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
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Last Visit</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Last Treatment</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Package</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Outlet</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Total Visits</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Total Spent</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {filteredCustomers.map((customer, index) => (
                  <tr key={index} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap font-medium text-gray-900">
                      {customer.name}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {customer.mobile}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {new Date(customer.lastVisit).toLocaleDateString()}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {customer.lastTreatment}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      {customer.hasPackage ? (
                        <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-green-100 text-green-800">
                          Yes
                        </span>
                      ) : (
                        <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-gray-100 text-gray-800">
                          No
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {customer.outlet}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {customer.totalVisits}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                      {formatCurrency(customer.totalSpent)}
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