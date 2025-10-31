// src/app/(protected)/dashboard/sales/page.tsx
'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { OUTLETS } from '@/lib/outlet'; // Import outlets for filtering

type Sale = {
  id: string;
  date: string;
  name: string;
  mobile: string;
  outlet: string;
  treatment: string;
  amount_paid: number; // in paise
  took_package: boolean;
  package_amount: number; // in paise
};

const formatCurrency = (amountInPaise: number) =>
  new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amountInPaise / 100);

export default function AdminSalesPage() {
  const [sales, setSales] = useState<Sale[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Filters
  const [outletFilter, setOutletFilter] = useState('all');
  const [dateFilter, setDateFilter] = useState(new Date().toISOString().split('T')[0]);

  // Get outlet names for the filter dropdown
  const outletNames = ['all', ...OUTLETS.map(o => o.name)];

  useEffect(() => {
    fetchSales();
  }, [outletFilter, dateFilter]); // Refetch when filters change

  const fetchSales = async () => {
    setLoading(true);
    try {
      let query = supabase
        .from('customers')
        .select('id, date, name, mobile, outlet, treatment, amount_paid, took_package, package_amount')
        .order('date', { ascending: false });

      // Apply date filter
      if (dateFilter) {
        query = query.eq('date', dateFilter);
      }

      // Apply outlet filter
      if (outletFilter !== 'all') {
        query = query.eq('outlet', outletFilter);
      }

      const { data, error } = await query;
      if (error) throw error;
      setSales(data || []);
    } catch (err) {
      console.error('Error fetching sales:', err);
    } finally {
      setLoading(false);
    }
  };
  
  // Calculate total sales from the filtered list
  const totalSales = sales.reduce((sum, sale) => {
    const amount = sale.took_package ? sale.package_amount : sale.amount_paid;
    return sum + (amount || 0);
  }, 0);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-800">Sales Report</h1>

      {/* --- Filters --- */}
      <div className="bg-white p-4 rounded-xl shadow-sm grid grid-cols-1 md:grid-cols-3 gap-4">
        <div>
          <label htmlFor="date" className="block text-sm font-medium text-gray-700 mb-1">Date</label>
          <input
            id="date"
            type="date"
            value={dateFilter}
            onChange={(e) => setDateFilter(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg"
          />
        </div>
        <div>
          <label htmlFor="outlet" className="block text-sm font-medium text-gray-700 mb-1">Outlet</label>
          <select
            id="outlet"
            value={outletFilter}
            onChange={(e) => setOutletFilter(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-white"
          >
            {outletNames.map(name => (
              <option key={name} value={name}>{name === 'all' ? 'All Outlets' : name}</option>
            ))}
          </select>
        </div>
      </div>

      {/* --- Total Sales Card --- */}
      <div className="bg-white p-6 rounded-xl shadow-sm">
        <h3 className="text-gray-500 text-sm font-medium">Total Filtered Sales</h3>
        <p className="text-3xl font-bold mt-2 text-green-600">
          {formatCurrency(totalSales)}
        </p>
        <p className="text-gray-500 text-sm">{sales.length} transaction(s) found</p>
      </div>

      {/* --- Sales Table --- */}
      <div className="bg-white shadow rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Customer</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Outlet</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Treatment</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Amount</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {loading ? (
                <tr><td colSpan={4} className="p-6 text-center text-gray-500">Loading...</td></tr>
              ) : sales.length === 0 ? (
                <tr><td colSpan={4} className="p-6 text-center text-gray-500">No sales found for these filters.</td></tr>
              ) : (
                sales.map(sale => (
                  <tr key={sale.id}>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm font-medium text-gray-900">{sale.name}</div>
                      <div className="text-sm text-gray-500">{sale.mobile}</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{sale.outlet}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {sale.took_package ? (
                        <span className="font-medium text-purple-700">New Package</span>
                      ) : (
                        sale.treatment
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-green-600">
                      {formatCurrency(sale.took_package ? sale.package_amount : sale.amount_paid)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}