'use client';

import { useEffect, useState, useCallback } from 'react'; 
import { supabase } from '@/lib/supabase';
import Link from 'next/link';
// --- 1. Import the OUTLETS list ---
import { OUTLETS } from '@/lib/outlet';

interface Customer {
  id: string;
  name: string;
  mobile: string;
  email: string | null;
  took_package: boolean;
  created_at: string;
  date: string; 
  package_amount?: number;
  amount_paid?: number;
  outlet_name?: string; // <-- Ensure outlet_name is part of the type
}

// --- 2. Define a new type for outlet sales ---
interface OutletSale {
  name: string;
  sales: number;
}

export default function Dashboard() {
  const [loading, setLoading] = useState(true);
  const [totalCustomers, setTotalCustomers] = useState(0);
  const [dailyTarget, setDailyTarget] = useState({
    target: 350000, 
    achieved: 0, 
    percentage: 0
  });
  // --- 3. Add new state for outlet-specific sales ---
  const [outletSales, setOutletSales] = useState<OutletSale[]>([]);

  const fetchDashboardData = useCallback(async () => {
    setLoading(true);
    try {
      const today = new Date().toISOString().split('T')[0];
      
      // --- 4. Fetch all sales details for today ---
      const { data: todaySales, error: customersError } = await supabase
        .from('customers')
        .select('outlet_name, package_amount, amount_paid, took_package') 
        .eq('date', today); 
      
      if (customersError) throw customersError;

      // --- 5. Process the data ---
      const salesData = todaySales || [];
      setTotalCustomers(salesData.length); 

      // Initialize a Map for sales with all outlets from the master list
      const salesByOutlet = new Map<string, number>();
      for (const outlet of OUTLETS) {
        salesByOutlet.set(outlet.name, 0);
      }

      // Calculate totals
      let totalDailySalesInPaise = 0;
      for (const sale of salesData) {
        const amount = sale.took_package ? (sale.package_amount || 0) : (sale.amount_paid || 0);
        totalDailySalesInPaise += amount;

        // Add to the specific outlet's total
        if (sale.outlet_name && salesByOutlet.has(sale.outlet_name)) {
          salesByOutlet.set(
            sale.outlet_name,
            (salesByOutlet.get(sale.outlet_name) || 0) + amount
          );
        }
      }

      // Update daily target
      const targetInRupees = 350000;
      const salesInRupees = totalDailySalesInPaise / 100;
      const percentage = targetInRupees > 0 
        ? Math.min(100, Math.round((salesInRupees / targetInRupees) * 100)) 
        : 0;
      setDailyTarget({ target: targetInRupees, achieved: totalDailySalesInPaise, percentage });

      // --- 6. Set the outlet sales state ---
      // Convert the Map to an array for easier rendering
      const salesArray = Array.from(salesByOutlet, ([name, sales]) => ({ name, sales }));
      setOutletSales(salesArray);

    } catch (error) {
      console.error('Error fetching dashboard data:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchDashboardData();
  }, [fetchDashboardData]);

  const formatCurrency = (amountInPaise: number) =>
    new Intl.NumberFormat('en-IN', { 
      style: 'currency', 
      currency: 'INR',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(amountInPaise / 100); 

  const formatTarget = (amountInRupees: number) =>
    new Intl.NumberFormat('en-IN', { 
      style: 'currency', 
      currency: 'INR',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(amountInRupees);

  return (
    <div className="space-y-8">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold text-gray-800">Admin Overview Dashboard</h1>
        <Link href="/form" passHref>
          <button className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors">
            ➕ Add Customer
          </button>
        </Link>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Daily Sales Card */}
        <div className="bg-white p-6 rounded-xl shadow-lg">
          <h3 className="text-gray-500 text-sm font-medium">Today's Total Sales</h3>
          <p className="text-3xl font-bold mt-2 text-amber-600">
            {loading ? '...' : formatCurrency(dailyTarget.achieved)}
          </p>
        </div>

        {/* Daily Target Card */}
        <div className="bg-white p-6 rounded-xl shadow-lg">
          <h3 className="text-gray-500 text-sm font-medium">Company Daily Target</h3>
          <p className="text-2xl font-bold mt-2 text-gray-800">
            {loading ? '...' : formatTarget(dailyTarget.target)}
          </p>
          <div className="mt-4">
            <div className="flex justify-between text-sm mb-1">
              <span>Achieved</span>
              <span>{loading ? '...' : `${dailyTarget.percentage}%`}</span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-2">
              <div
                className="h-2 rounded-full bg-red-600"
                style={{ width: `${dailyTarget.percentage}%` }}
              ></div>
            </div>
          </div>
        </div>

        {/* Total Customers Card */}
        <div className="bg-white p-6 rounded-xl shadow-lg">
          <h3 className="text-gray-500 text-sm font-medium">Today's Customers (All Outlets)</h3>
          <p className="text-3xl font-bold mt-2 text-gray-800">
            {loading ? '...' : totalCustomers}
          </p>
        </div>
      </div>

      {/* --- 7. NEW: Outlet Sales Grid --- */}
      <div>
        <h2 className="text-xl font-semibold text-gray-700 mb-4">Today's Sales by Outlet</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {loading ? (
            <div className="md:col-span-3 lg:col-span-4 p-4 bg-white rounded-lg shadow-md text-gray-500">
              Loading outlet sales...
            </div>
          ) : (
            outletSales.map(outlet => (
              <div key={outlet.name} className="bg-white p-4 rounded-xl shadow-md">
                <h4 className="text-gray-500 text-sm font-medium truncate">{outlet.name}</h4>
                <p className="text-2xl font-bold mt-2 text-blue-600">
                  {formatCurrency(outlet.sales)}
                </p>
              </div>
            ))
          )}
        </div>
      </div>
      
      <div className="p-4 bg-gray-800 rounded-lg border border-gray-700">
        <p className="text-gray-200">
          💡 For detailed customer lists, package status, or outlet performance, please use the sidebar navigation.
        </p>
      </div>
    </div>
  );
}