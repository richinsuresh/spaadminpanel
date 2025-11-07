// src/app/(protected)/dashboard/page.tsx
'use client';

import { useEffect, useState, useCallback } from 'react'; 
import { supabase } from '@/lib/supabase';
import Link from 'next/link';

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
}

export default function Dashboard() {
  const [loading, setLoading] = useState(true);
  const [totalCustomers, setTotalCustomers] = useState(0);
  const [dailyTarget, setDailyTarget] = useState({
    target: 350000, 
    achieved: 0, 
    percentage: 0
  });

  const fetchDashboardData = useCallback(async () => {
    setLoading(true);
    try {
      const today = new Date().toISOString().split('T')[0];
      const { data: customers, error: customersError, count } = await supabase
        .from('customers')
        .select('date, package_amount, amount_paid, took_package', { count: 'exact' }) 
        .eq('date', today); 
      
      if (customersError) throw customersError;

      const todaySales = customers || [];
      setTotalCustomers(count || 0); 

      const totalDailySalesInPaise = todaySales.reduce((sum: number, c: any) => {
        if (c.took_package) return sum + (c.package_amount || 0);
        return sum + (c.amount_paid || 0);
      }, 0);

      const targetInRupees = 350000;
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
          {/* --- UPDATED THEME: Button is now red --- */}
          <button className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors">
            ➕ Add Customer
          </button>
        </Link>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Daily Sales Card */}
        <div className="bg-white p-6 rounded-xl shadow-lg">
          <h3 className="text-gray-500 text-sm font-medium">Today's Total Sales</h3>
          {/* --- UPDATED THEME: "Gold" text for money --- */}
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
              {/* --- UPDATED THEME: Progress bar is now red --- */}
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
      
      {/* --- UPDATED THEME: Dark info banner --- */}
      <div className="p-4 bg-gray-800 rounded-lg border border-gray-700">
        <p className="text-gray-200">
          💡 For detailed customer lists, package status, or outlet performance, please use the sidebar navigation.
        </p>
      </div>
    </div>
  );
}