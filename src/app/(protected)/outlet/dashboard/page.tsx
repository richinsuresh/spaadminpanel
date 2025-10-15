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
        // cast to Customer[] for local usage
        setRecentCustomers((customers as Customer[]) ?? []);
      }

      // Calculate daily sales
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
    <div className="space-y-8">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold text-gray-800">{outletName || 'Outlet'} Dashboard</h1>
        <div className="flex gap-3">
          <button
            onClick={() => {
              document.cookie = 'auth_role=; Max-Age=0; path=/';
              document.cookie = 'outlet_id=; Max-Age=0; path=/';
              router.push('/outlet-login');
            }}
            className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
          >
            Logout
          </button>
          <button
            onClick={() => router.push('/outlet/form')}
            className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700"
          >
            ➕ Add Customer
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white p-6 rounded-xl shadow">
          <h3 className="text-gray-500 text-sm font-medium">Daily Sales</h3>
          <p className="text-2xl font-bold mt-2 text-green-600">{formatCurrency(dailyTarget.achieved)}</p>
          <div className="mt-4">
            <div className="flex justify-between text-sm mb-1">
              <span>Target: {formatCurrency(dailyTarget.target)}</span>
              <span>{dailyTarget.percentage}%</span>
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

        <div className="bg-white p-6 rounded-xl shadow">
          <h3 className="text-gray-500 text-sm font-medium">Total Customers</h3>
          <p className="text-2xl font-bold mt-2">{recentCustomers.length}</p>
        </div>

        <div className="bg-white p-6 rounded-xl shadow">
          <h3 className="text-gray-500 text-sm font-medium">Outlet</h3>
          <p className="text-2xl font-bold mt-2">{outletName}</p>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow">
        <div className="p-6 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-800">Recent Customers</h2>
        </div>
        <div className="divide-y divide-gray-100">
          {loading ? (
            <div className="p-6 text-center text-gray-500">Loading...</div>
          ) : recentCustomers.length === 0 ? (
            <div className="p-6 text-center text-gray-500">No customers yet</div>
          ) : (
            recentCustomers.map((c, i) => (
              <div key={c.id ?? i} className="p-6">
                <div className="flex justify-between">
                  <div>
                    <h3 className="font-medium">{c.name}</h3>
                    <p className="text-sm text-gray-500">{c.mobile}</p>
                  </div>
                  <div className="text-right">
                    <p className="font-medium">{c.treatment}</p>
                    <p className="text-sm text-gray-500">
                      {c.date ? new Date(c.date).toLocaleDateString('en-IN') : '-'}
                    </p>
                  </div>
                </div>
                {c.took_package && (
                  <span className="mt-2 inline-block px-2 py-1 bg-green-100 text-green-800 text-xs rounded-full">
                    Package Client
                  </span>
                )}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
