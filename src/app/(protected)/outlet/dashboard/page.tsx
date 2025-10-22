// src/app/(protected)/outlet/dashboard/page.tsx
'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { OUTLETS } from '@/lib/outlet';

type Customer = {
  id?: string;
  name?: string;
  mobile?: string;
  treatment?: string;
  date?: string;
  amount_paid?: number;
  package_amount?: number;
  took_package?: boolean;
  outlet?: string;
};

export default function OutletDashboard() {
  const router = useRouter();
  const [outletName, setOutletName] = useState('');
  const [recentCustomers, setRecentCustomers] = useState<Customer[]>([]);
  const [dailyTarget, setDailyTarget] = useState({
    target: 50000,
    achieved: 0,
    percentage: 0
  });
  const [loading, setLoading] = useState(true);
  const [packageAlerts, setPackageAlerts] = useState(0);

  useEffect(() => {
    const init = async () => {
      // Get outlet info from cookies
      const outletId = document.cookie.split('; ').find(row => row.startsWith('outlet_id='))?.split('=')[1];
      if (outletId) {
        const outlet = OUTLETS.find(o => o.id === outletId);
        if (outlet) setOutletName(outlet.name);
      }

      await fetchData();
    };

    init();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      const outletId = document.cookie.split('; ').find(row => row.startsWith('outlet_id='))?.split('=')[1];
      if (!outletId) {
        setRecentCustomers([]);
        setDailyTarget(prev => ({ ...prev, achieved: 0, percentage: 0 }));
        setPackageAlerts(0);
        return;
      }

      const outlet = OUTLETS.find(o => o.id === outletId);
      if (!outlet) return;

      // Get recent customers for this outlet
      const { data: customers, error: customersError } = await supabase
        .from('customers')
        .select('*')
        .eq('outlet', outlet.name)
        .order('date', { ascending: false })
        .limit(5);

      if (customersError) {
        console.error('Error fetching customers:', customersError);
        setRecentCustomers([]);
      } else {
        const casted = (customers as Customer[]) ?? [];
        setRecentCustomers(casted);
        // simple heuristic: package alerts = number of recent customers who took package
        setPackageAlerts(casted.filter(c => c.took_package).length);
      }

      // Calculate daily sales (all customers for today)
      const today = new Date().toISOString().split('T')[0];
      const { data: sales, error: salesError } = await supabase
        .from('customers')
        .select('amount_paid, package_amount, took_package')
        .eq('outlet', outlet.name)
        .eq('date', today);

      if (salesError) {
        console.error('Error fetching sales:', salesError);
      }

      const totalSales = ((sales ?? []) as any[]).reduce((sum: number, c: any) => {
        if (c.took_package) return sum + (c.package_amount || 0);
        return sum + (c.amount_paid || 0);
      }, 0);

      const target = 50000;
      const percentage = target > 0 ? Math.min(100, Math.round((totalSales / target) * 100)) : 0;

      setDailyTarget({ target, achieved: totalSales, percentage });
    } catch (error) {
      console.error('Error fetching dashboard data:', error);
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (amount: number) =>
    new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(amount);

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Page container */}
      <div className="max-w-7xl mx-auto px-6 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-semibold text-gray-900">{outletName || 'Outlet'} Dashboard</h1>
          </div>

          <div className="flex items-center gap-3">
            <button
              disabled
              className="px-4 py-2 border border-gray-200 rounded-md text-gray-400 bg-white cursor-not-allowed"
            >
              ← Back to Outlets
            </button>

            <button
              onClick={() => router.push('/outlet/form')}
              className="px-4 py-2 rounded-md bg-purple-600 text-white hover:bg-purple-700 shadow"
            >
              + Add Customer
            </button>
          </div>
        </div>

        {/* Top summary cards (4) */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 mb-6">
          {/* Daily Sales */}
          <div className="bg-white rounded-lg p-6 shadow-sm border border-transparent">
            <h3 className="text-sm text-gray-500">Daily Sales</h3>
            <p className="mt-4 text-2xl font-bold text-green-600">{formatCurrency(dailyTarget.achieved)}</p>
          </div>

          {/* Daily Target */}
          <div className="bg-white rounded-lg p-6 shadow-sm border border-transparent">
            <h3 className="text-sm text-gray-500">Daily Target</h3>
            <p className="mt-4 text-xl font-semibold text-gray-400">{formatCurrency(dailyTarget.target)}</p>
            <div className="mt-4 text-sm text-gray-400">Achieved</div>
            <div className="mt-2 w-full bg-gray-100 rounded-full h-2">
              <div
                className="h-2 rounded-full bg-gray-300"
                style={{ width: `${dailyTarget.percentage}%` }}
              />
            </div>
            <div className="mt-2 text-xs text-gray-400">{dailyTarget.percentage}%</div>
          </div>

          {/* Total Customers */}
          <div className="bg-white rounded-lg p-6 shadow-sm border border-transparent">
            <h3 className="text-sm text-gray-500">Total Customers</h3>
            <p className="mt-4 text-2xl font-bold text-gray-800">{recentCustomers.length}</p>
          </div>

          {/* Package Alerts */}
          <div className="bg-white rounded-lg p-6 shadow-sm border border-transparent">
            <h3 className="text-sm text-gray-500">Package Alerts</h3>
            <p className="mt-4 text-2xl font-bold text-red-600">{packageAlerts}</p>
          </div>
        </div>

        {/* Lower panels: Recent Customers + Package Alerts panel */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Recent Customers */}
          <div className="bg-white rounded-lg shadow-sm border border-transparent">
            <div className="p-6 border-b border-gray-100">
              <h2 className="text-lg font-semibold text-gray-800">Recent Customers</h2>
            </div>

            <div className="divide-y divide-gray-100">
              {loading ? (
                <div className="p-6 text-center text-gray-500">Loading...</div>
              ) : recentCustomers.length === 0 ? (
                <div className="p-6 text-center text-gray-500">No customers yet</div>
              ) : (
                recentCustomers.map((c, i) => (
                  <div key={c.id ?? i} className="p-6 flex justify-between items-start">
                    <div>
                      <h3 className="text-md font-medium text-gray-800">{c.name}</h3>
                      <p className="text-sm text-gray-500 mt-1">{c.mobile}</p>
                    </div>

                    <div className="text-right">
                      <p className="text-sm font-medium text-gray-800">{c.treatment}</p>
                      <p className="text-xs text-gray-400 mt-1">
                        {c.date ? new Date(c.date).toLocaleDateString('en-IN') : '-'}
                      </p>
                      {c.took_package && (
                        <span className="mt-2 inline-block px-2 py-1 bg-green-100 text-green-800 text-xs rounded-full">
                          Package Client
                        </span>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Package Alerts panel (wide) */}
          <div className="bg-white rounded-lg shadow-sm border border-transparent">
            <div className="p-6 border-b border-gray-100 flex items-center">
              <span className="mr-3 text-yellow-600">⚠️</span>
              <h2 className="text-lg font-semibold text-red-600">Package Alerts</h2>
            </div>

            <div className="p-6 text-center text-gray-500">
              {/* If there are alerts show a list, else show healthy */}
              {packageAlerts > 0 ? (
                <div>
                  <p className="mb-4 text-gray-700 font-medium">{packageAlerts} package alert(s)</p>
                  <ul className="text-left text-sm text-gray-600 space-y-2">
                    {/* Simple list from recent customers who took package */}
                    {recentCustomers.filter(c => c.took_package).map((c, i) => (
                      <li key={c.id ?? i} className="flex justify-between">
                        <span>{c.name}</span>
                        <span className="text-gray-400 text-xs">{c.date ? new Date(c.date).toLocaleDateString('en-IN') : '-'}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : (
                <div className="text-gray-500">All packages healthy</div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
