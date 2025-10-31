// src/app/(protected)/dashboard/page.tsx
'use client';

import { useEffect, useState, useCallback } from 'react'; // <-- 1. IMPORTED useCallback
import { supabase } from '@/lib/supabase';
import Link from 'next/link';

interface Customer {
  id: string;
  name: string;
  mobile: string;
  email: string | null;
  took_package: boolean;
  created_at: string;
  date: string; // Used for sales calculation
  package_amount?: number;
  amount_paid?: number;
}

export default function Dashboard() {
  const [loading, setLoading] = useState(true);
  const [totalCustomers, setTotalCustomers] = useState(0);
  const [dailyTarget, setDailyTarget] = useState({
    target: 350000, // Aggregate target based on 7 outlets * 50000
    achieved: 0, // Stored in PAISA
    percentage: 0
  });

  // --- 2. WRAPPED in useCallback ---
  const fetchDashboardData = useCallback(async () => {
    setLoading(true);
    try {
      // Fetch all customer sessions for today
      const today = new Date().toISOString().split('T')[0];
      const { data: customers, error: customersError, count } = await supabase
        .from('customers')
        .select('date, package_amount, amount_paid, took_package', { count: 'exact' }) // Get count
        .eq('date', today); // Filter by today
      
      if (customersError) throw customersError;

      const todaySales = customers || [];
      setTotalCustomers(count || 0); // Set today's customer count

      // Calculate total daily sales across all outlets
      const totalDailySalesInPaise = todaySales.reduce((sum: number, c: any) => {
        if (c.took_package) return sum + (c.package_amount || 0);
        return sum + (c.amount_paid || 0);
      }, 0);

      const targetInRupees = 350000;
      // --- 3. FIXED: Correctly calculate percentage with paise/rupees ---
      const salesInRupees = totalDailySalesInPaise / 100;
      const percentage = targetInRupees > 0 
        ? Math.min(100, Math.round((salesInRupees / targetInRupees) * 100)) 
        : 0;

      setDailyTarget({ target: targetInRupees, achieved: totalDailySalesInPaise, percentage });

    } catch (error) {
      console.error('Error fetching dashboard data:', error);
    } finally {
      setLoading(false);
    }
  }, []); // <-- Added dependency array

  useEffect(() => {
    fetchDashboardData();
  }, [fetchDashboardData]);

  // --- 4. FIXED: formatCurrency function to divide by 100 ---
  const formatCurrency = (amountInPaise: number) =>
    new Intl.NumberFormat('en-IN', { 
      style: 'currency', 
      currency: 'INR',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(amountInPaise / 100); // <-- The fix

  // --- 5. ADDED: formatTarget function for clarity ---
  const formatTarget = (amountInRupees: number) =>
    new Intl.NumberFormat('en-IN', { 
      style: 'currency', 
      currency: 'INR',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(amountInRupees); // Target is already in rupees

  return (
    <div className="space-y-8">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold text-gray-800">Admin Overview Dashboard</h1>
        <Link href="/form" passHref>
          <button className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700">
            ➕ Add Customer
          </button>
        </Link>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Daily Sales Card */}
        <div className="bg-white p-6 rounded-xl shadow">
          <h3 className="text-gray-500 text-sm font-medium">Today's Total Sales</h3>
          <p className="text-2xl font-bold mt-2 text-green-600">
            {/* This will now display the correct value (e.g., ₹500) */}
            {loading ? '...' : formatCurrency(dailyTarget.achieved)}
          </p>
        </div>

        {/* Daily Target Card */}
        <div className="bg-white p-6 rounded-xl shadow">
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
                className={`h-2 rounded-full ${
                  dailyTarget.percentage >= 80 ? 'bg-green-500' :
                  dailyTarget.percentage >= 50 ? 'bg-yellow-500' : 'bg-red-500'
                }`}
                style={{ width: `${dailyTarget.percentage}%` }}
              ></div>
            </div>
          </div>
        </div>

        {/* Total Customers Card */}
        <div className="bg-white p-6 rounded-xl shadow">
          {/* --- 6. CHANGED: Text to be "Today's" to match logic --- */}
          <h3 className="text-gray-500 text-sm font-medium">Today's Customers (All Outlets)</h3>
          <p className="text-2xl font-bold mt-2 text-gray-800">
            {loading ? '...' : totalCustomers}
          </p>
        </div>
      </div>
      
      <div className="p-4 bg-blue-50 rounded-lg border border-blue-200">
        <p className="text-blue-700">
          💡 For detailed customer lists, package status, or outlet performance, please use the sidebar navigation.
        </p>
      </div>
    </div>
  );
}