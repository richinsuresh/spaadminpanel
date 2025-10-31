// src/app/(protected)/outlet/dashboard/page.tsx
'use client';

import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { useRouter } from 'next/navigation';
// --- REMOVED: OUTLETS import ---

export default function OutletDashboard() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [outletId, setOutletId] = useState(''); 
  const [outletName, setOutletName] = useState('Outlet');
  const [todayCustomers, setTodayCustomers] = useState(0);
  const [dailyTarget, setDailyTarget] = useState({
    target: 50000,
    achieved: 0,
    percentage: 0
  });

  const fetchDashboardData = useCallback(async (currentOutletName: string) => {
    if (!currentOutletName) return;
    setLoading(true);
    
    try {
      const today = new Date().toISOString().split('T')[0];
      
      const { data: customers, error: customersError, count } = await supabase
        .from('customers')
        .select('date, package_amount, amount_paid, took_package', { count: 'exact' })
        .eq('outlet', currentOutletName)
        .eq('date', today);
      
      if (customersError) throw customersError;
      setTodayCustomers(count || 0);

      const todaySales = customers || [];
      const totalDailySalesInPaise = todaySales.reduce((sum: number, c: any) => {
        if (c.took_package) return sum + (c.package_amount || 0);
        return sum + (c.amount_paid || 0);
      }, 0);

      const targetInRupees = 50000;
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

  // --- MODIFIED: Fetch from API ---
  useEffect(() => {
    const init = async () => {
      try {
        const res = await fetch('/api/outlet'); // Use your existing route
        if (!res.ok) throw new Error('Could not fetch session');
        
        const data = await res.json();
        if (data.outletId && data.outletName) {
          setOutletId(data.outletId);
          setOutletName(data.outletName);
          await fetchDashboardData(data.outletName); // Fetch data
        } else {
          throw new Error("No outlet data returned from API");
        }
      } catch (err) {
        console.error(err);
        setLoading(false);
        // router.push('/outlet-login'); // Optional: redirect if session fails
      }
    };
    init();
  }, [fetchDashboardData]);

  // Real-time listener (no change)
  useEffect(() => {
    if (!outletName || !outletId) return;
    const channel = supabase
      .channel(`customers-outlet-${outletId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'customers',
          filter: `outlet=eq.${outletName}`
        },
        (payload) => {
          fetchDashboardData(outletName);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [outletId, outletName, fetchDashboardData]);

  // Formatting functions (no change)
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
        <h1 className="text-2xl font-bold text-gray-800">{outletName} Dashboard</h1>
        <button 
          onClick={() => router.push(`/client-form/${outletId}`)}
          className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700">
          ➕ Add Customer
        </button>
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
          <h3 className="text-gray-500 text-sm font-medium">Outlet Daily Target</h3>
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
          <h3 className="text-gray-500 text-sm font-medium">Today's Customers</h3>
          <p className="text-2xl font-bold mt-2 text-gray-800">
            {loading ? '...' : todayCustomers}
          </p>
        </div>
      </div>
      
    </div>
  );
}