// src/app/(protected)/outlet/dashboard/page.tsx
'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { OUTLETS } from '@/lib/outlet';
import PendingCashPayments from './PendingCashPayments'; // <-- 1. IMPORT

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

export default function OutletDashboardPage() {
  const router = useRouter();
  const [outletId, setOutletId] = useState(''); // <-- 2. ADD OUTLET ID STATE
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
      const id = document.cookie.split('; ').find(row => row.startsWith('outlet_id='))?.split('=')[1];
      if (id) {
        setOutletId(id); // <-- 3. SET THE ID
        const outlet = OUTLETS.find(o => o.id === id);
        if (outlet) {
          setOutletName(outlet.name);
          await fetchData(outlet.name); // Pass name to fetch data
        }
      } else {
        setLoading(false);
      }
    };

    init();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fetchData = async (currentOutletName: string) => { // <-- 4. ACCEPT NAME
    if (!currentOutletName) return;
    setLoading(true);
    try {
      // ... (rest of the sales/customer fetching logic remains the same)
      // ...
      
      // Get recent customers for this outlet
      const { data: customers, error: customersError } = await supabase
        .from('customers')
        .select('*')
        .eq('outlet', currentOutletName) // Use the passed name
        .order('date', { ascending: false })
        .limit(5);

      if (customersError) {
        console.error('Error fetching customers:', customersError);
        setRecentCustomers([]);
      } else {
        const casted = (customers as Customer[]) ?? [];
        setRecentCustomers(casted);
        setPackageAlerts(casted.filter(c => c.took_package).length);
      }

      // Calculate daily sales (all customers for today)
      const today = new Date().toISOString().split('T')[0];
      const { data: sales, error: salesError } = await supabase
        .from('customers')
        .select('amount_paid, package_amount, took_package')
        .eq('outlet', currentOutletName) // Use the passed name
        .eq('date', today);
      
      // ... (rest of sales calculation remains the same)
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
      {/* Page Header and Add Customer Button */}
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold text-gray-800">{outletName || 'Outlet'} Summary</h1>
        <button
          onClick={() => router.push('/outlet/form')}
          className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700"
        >
          ➕ Add Customer
        </button>
      </div>

      {/* Top summary cards (4) - no changes here */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 mb-6">
        {/* ... cards ... */}
        <div className="bg-white rounded-lg p-6 shadow-sm border border-transparent">
          <h3 className="text-sm text-gray-500">Daily Sales</h3>
          <p className="mt-4 text-2xl font-bold text-green-600">{formatCurrency(dailyTarget.achieved)}</p>
        </div>
        <div className="bg-white rounded-lg p-6 shadow-sm border border-transparent">
          <h3 className="text-sm text-gray-500">Daily Target</h3>
          <p className="mt-4 text-xl font-semibold text-gray-400">{formatCurrency(dailyTarget.target)}</p>
          {/* ... rest of target card ... */}
        </div>
        <div className="bg-white p-6 rounded-xl shadow">
          <h3 className="text-gray-500 text-sm font-medium">Recent Customers</h3>
          <p className="text-2xl font-bold mt-2">{recentCustomers.length}</p>
        </div>
        <div className="bg-white p-6 rounded-xl shadow">
          <h3 className="text-gray-500 text-sm font-medium">Package Alerts</h3>
          <p className="text-2xl font-bold mt-2 text-red-600">{packageAlerts}</p>
        </div>
      </div>

      {/* Lower panels: Recent Customers + Package Alerts panel */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      
        {/* 5. ADD THE NEW COMPONENT HERE */}
        <PendingCashPayments outletId={outletId} />

        {/* Recent Customers List */}
        <div className="bg-white rounded-lg shadow-sm border border-transparent">
          <div className="p-6 border-b border-gray-100">
            <h2 className="text-lg font-semibold text-gray-800">Recent Customer Activity</h2>
          </div>
          <div className="divide-y divide-gray-100">
            {/* ... recent customer mapping ... */}
            {loading ? (
              <div className="p-6 text-center text-gray-500">Loading...</div>
            ) : recentCustomers.length === 0 ? (
              <div className="p-6 text-center text-gray-500">No recent activity</div>
            ) : (
              recentCustomers.map((c, i) => (
                <div key={c.id ?? i} className="p-6 flex justify-between items-start">
                  {/* ... customer details ... */}
                </div>
              ))
            )}
          </div>
        </div>
        
        {/* Package Alerts panel (wide) - no changes here */}
        {/* ... */}
      </div>
    </div>
  );
}