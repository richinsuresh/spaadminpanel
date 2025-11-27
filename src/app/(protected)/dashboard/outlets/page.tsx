// src/app/(protected)/dashboard/outlets/page.tsx
'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, ArrowUp, ArrowDown } from 'lucide-react'; 
import { supabase } from '@/lib/supabase';
import { OUTLETS } from '@/lib/outlet';

type Outlet = {
  id: string;
  name: string;
  location: string;
  periodSales: number; // Renamed for clarity: sales for the selected period
};

// Helper function to format dates as 'YYYY-MM-DD'
const formatDate = (date: Date): string => {
  // Use UTC methods to avoid time zone issues when formatting to date strings
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

// Helper to get the date immediately following the end date
const getDayAfter = (dateString: string): string => {
    const date = new Date(dateString);
    date.setDate(date.getDate() + 1);
    return formatDate(date);
};

export default function OutletsPage() {
  const router = useRouter();
  const [outlets, setOutlets] = useState<Outlet[]>([]);
  const [loading, setLoading] = useState(true);
  
  // --- STATE FOR DATE FILTERING ---
  const today = new Date();
  const sevenDaysAgo = new Date(today.getTime() - (7 * 24 * 60 * 60 * 1000));
  
  const [startDate, setStartDate] = useState(formatDate(sevenDaysAgo));
  const [endDate, setEndDate] = useState(formatDate(today));

  // --- NEW STATE FOR SORTING ---
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc'); 
  // -----------------------------


  const fetchOutletData = useCallback(async (start: string, end: string) => {
    setLoading(true);
    
    try {
        const dayAfterEndDate = getDayAfter(end);

        const { data: customerData, error: customersError } = await supabase
            .from('customers')
            .select('outlet_name, package_amount, amount_paid, took_package, date')
            .gte('date', start)
            .lt('date', dayAfterEndDate);

        if (customersError) throw customersError;

        const salesData = customerData || [];
        
        const salesByOutlet = new Map<string, number>();
        for (const outlet of OUTLETS) {
            salesByOutlet.set(outlet.name, 0);
        }

        for (const sale of salesData) {
            const amount = sale.took_package 
                ? (sale.package_amount || 0) 
                : (sale.amount_paid || 0);

            if (sale.outlet_name && salesByOutlet.has(sale.outlet_name)) {
                salesByOutlet.set(
                    sale.outlet_name,
                    (salesByOutlet.get(sale.outlet_name) || 0) + amount
                );
            }
        }

        const outletsWithSales: Outlet[] = OUTLETS.map(outlet => {
            const totalSales = salesByOutlet.get(outlet.name) || 0;
            return {
                id: outlet.id,
                name: outlet.name,
                location: outlet.location,
                periodSales: totalSales,
            };
        });

        setOutlets(outletsWithSales);
    } catch (error) {
        console.error('Error fetching outlet data:', error);
        const fallbackOutlets = OUTLETS.map(o => ({ ...o, periodSales: 0 }));
        setOutlets(fallbackOutlets);
    } finally {
        setLoading(false);
    }
  }, []); 

  // --- useEffect to refetch data when dates change ---
  useEffect(() => {
    if (new Date(startDate) <= new Date(endDate)) {
        fetchOutletData(startDate, endDate);
    } else {
        setOutlets(outlets.map(o => ({...o, periodSales: 0})));
        setLoading(false);
    }
  }, [startDate, endDate, fetchOutletData]);
  
  // --- NEW: Function to toggle sort direction ---
  const handleSort = () => {
    setSortDirection(prev => (prev === 'desc' ? 'asc' : 'desc'));
  };

  // --- NEW: Apply sorting to the current outlets list ---
  const sortedOutlets = [...outlets].sort((a, b) => {
    if (sortDirection === 'desc') {
      return b.periodSales - a.periodSales; // High to Low
    } else {
      return a.periodSales - b.periodSales; // Low to High
    }
  });


  const formatCurrency = (amountInPaise: number) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      minimumFractionDigits: 0
    }).format(amountInPaise / 100);
  };

  const salesTitle = startDate === endDate ? 
    "Daily Sales" : 
    `Sales: ${new Date(startDate).toLocaleDateString()} to ${new Date(endDate).toLocaleDateString()}`;

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold text-gray-800">Outlets Management</h1>
        <button className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700">
          ➕ Add New Outlet
        </button>
      </div>

      {/* Date Range Filters (Unchanged) */}
      <div className="flex flex-col md:flex-row gap-4 mb-8 p-4 bg-white shadow rounded-lg border border-gray-200">
        <h3 className="text-lg font-semibold text-gray-700 md:self-center">Filter Sales Period:</h3>
        
        <div className="flex flex-col flex-1">
          <label htmlFor="startDate" className="text-sm font-medium text-gray-500">Start Date</label>
          <input 
            id="startDate"
            type="date" 
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="p-2 border border-gray-300 rounded-lg focus:ring-purple-500 focus:border-purple-500"
          />
        </div>

        <div className="flex flex-col flex-1">
          <label htmlFor="endDate" className="text-sm font-medium text-gray-500">End Date</label>
          <input 
            id="endDate"
            type="date" 
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            className="p-2 border border-gray-300 rounded-lg focus:ring-purple-500 focus:border-purple-500"
            max={formatDate(today)}
          />
        </div>

        <div className="md:self-center">
            <p className="text-sm font-medium text-gray-600">Current View:</p>
            <p className="font-bold text-purple-700">{salesTitle}</p>
        </div>
      </div>
      {/* End Date Range Filters */}


      {loading ? (
        <div className="bg-white shadow rounded-lg p-8 text-center flex justify-center items-center gap-2 text-purple-600">
          <Loader2 className="animate-spin h-5 w-5"/> Loading sales data...
        </div>
      ) : (
        <div className="bg-white shadow rounded-lg overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Outlet</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Location</th>
                  
                  {/* --- SORTABLE HEADER --- */}
                  <th 
                    className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:text-gray-900 transition-colors"
                    onClick={handleSort} // <-- Sorting handler
                  >
                    <div className="flex items-center gap-1">
                        Total Sales (Period)
                        {sortDirection === 'desc' ? <ArrowDown size={14} /> : <ArrowUp size={14} />}
                    </div>
                  </th>
                  {/* ----------------------- */}
                  
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {sortedOutlets.map((outlet) => ( // <-- Use sortedOutlets here
                  <tr 
                    key={outlet.id} 
                    className="hover:bg-gray-50 cursor-pointer"
                    onClick={() => router.push(`/dashboard/outlets/${outlet.id}`)}
                  >
                    <td className="px-6 py-4 whitespace-nowrap font-medium text-gray-900">
                      {outlet.name}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {outlet.location}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-green-600">
                      {formatCurrency(outlet.periodSales)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-green-100 text-green-800">
                        Active
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