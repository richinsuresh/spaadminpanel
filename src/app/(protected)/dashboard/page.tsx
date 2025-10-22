// src/app/(protected)/dashboard/page.tsx
'use client';

import { useEffect, useState } from 'react';
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
    achieved: 0,
    percentage: 0
  });

  useEffect(() => {
    fetchDashboardData();
  }, []);

  const fetchDashboardData = async () => {
    setLoading(true);
    try {
      // Fetch all customer sessions (no outlet filter for Admin view)
      const { data: customers, error: customersError } = await supabase
        .from('customers')
        .select('date, package_amount, amount_paid, took_package'); // Only need these fields for aggregation
      
      if (customersError) throw customersError;

      const allCustomers = customers || [];
      setTotalCustomers(allCustomers.length);

      // Calculate total daily sales across all outlets
      const today = new Date().toISOString().split('T')[0];
      const todaySales = allCustomers.filter(c => c.date === today);

      const totalDailySales = todaySales.reduce((sum: number, c: any) => {
        if (c.took_package) return sum + (c.package_amount || 0);
        return sum + (c.amount_paid || 0);
      }, 0);

      const target = 350000;
      const percentage = target > 0 ? Math.min(100, Math.round((totalDailySales / target) * 100)) : 0;

      setDailyTarget({ target, achieved: totalDailySales, percentage });

    } catch (error) {
      console.error('Error fetching dashboard data:', error);
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (amount: number) =>
    new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(amount);

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
            {loading ? '...' : formatCurrency(dailyTarget.achieved)}
          </p>
        </div>

        {/* Daily Target Card */}
        <div className="bg-white p-6 rounded-xl shadow">
          <h3 className="text-gray-500 text-sm font-medium">Company Daily Target</h3>
          <p className="text-2xl font-bold mt-2 text-gray-800">
            {formatCurrency(dailyTarget.target)}
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
          <h3 className="text-gray-500 text-sm font-medium">Total Customers (All Time)</h3>
          <p className="text-2xl font-bold mt-2 text-gray-800">
            {loading ? '...' : totalCustomers}
          </p>
        </div>
      </div>
      
      {/* Link to view detailed outlet performance */}
      <div className="p-4 bg-blue-50 rounded-lg border border-blue-200">
        <p className="text-blue-700">
          💡 For detailed customer lists, package status, or outlet performance, please use the sidebar navigation.
        </p>
      </div>
    </div>
  );
}