'use client';

import { useEffect, useState, useCallback } from 'react';
import { supabase, toggleDatabaseMode, isUsingBackup } from '@/lib/supabase';
import Link from 'next/link';
import { OUTLETS } from '@/lib/outlet';
import { useUser } from '@/context/UserContext';
import { Wifi, WifiOff } from 'lucide-react';

interface OutletSale {
  name: string;
  sales: number;
  id?: string;
}

interface TodaySaleRow {
  outlet_name: string | null;
  package_amount: number | null;
  amount_paid: number | null;
  took_package: boolean | null;
}

export default function Dashboard() {
  const { user } = useUser();

  const [loading, setLoading] = useState(true);
  const [totalCustomers, setTotalCustomers] = useState(0);
  
  const [dailyTarget, setDailyTarget] = useState({
    target: 200000, 
    achieved: 0, 
    percentage: 0,
  });
  const [outletSales, setOutletSales] = useState<OutletSale[]>([]);
  
  // --- REALTIME PRESENCE STATE ---
  const [onlineOutlets, setOnlineOutlets] = useState<Set<string>>(new Set());

  useEffect(() => {
    const channel = supabase.channel('online-outlets');

    channel
      .on('presence', { event: 'sync' }, () => {
        const newState = channel.presenceState();
        const onlineIds = new Set<string>();
        
        // newState structure: { "id": [ { outlet_id: '...', ... }, ... ] }
        Object.values(newState).forEach((presences: any) => {
            presences.forEach((p: any) => {
                if (p.outlet_id) onlineIds.add(p.outlet_id);
            });
        });
        
        setOnlineOutlets(onlineIds);
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const fetchDashboardData = useCallback(async () => {
    setLoading(true);
    try {
      const today = new Date().toISOString().split('T')[0];

      const { data: todaySales, error: customersError } = await supabase
        .from('customers')
        .select('outlet_name, package_amount, amount_paid, took_package')
        .eq('date', today);

      if (customersError) {
        console.error('Supabase customers error (dashboard):', customersError);
        throw customersError;
      }

      const salesData = (todaySales || []) as TodaySaleRow[];
      setTotalCustomers(salesData.length);

      const salesByOutlet = new Map<string, number>();
      
      for (const outlet of OUTLETS) {
        salesByOutlet.set(outlet.name, 0);
      }

      let totalDailySalesInPaise = 0;
      for (const sale of salesData) {
        const amount = sale.took_package
          ? sale.package_amount || 0
          : sale.amount_paid || 0;

        totalDailySalesInPaise += amount;

        if (sale.outlet_name && salesByOutlet.has(sale.outlet_name)) {
          salesByOutlet.set(
            sale.outlet_name,
            (salesByOutlet.get(sale.outlet_name) || 0) + amount,
          );
        }
      }

      const targetInRupees = 200000;
      const salesInRupees = totalDailySalesInPaise / 100;
      const percentage =
        targetInRupees > 0
          ? Math.min(100, Math.round((salesInRupees / targetInRupees) * 100))
          : 0;

      setDailyTarget({
        target: targetInRupees,
        achieved: totalDailySalesInPaise,
        percentage,
      });

      const salesArray = Array.from(salesByOutlet, ([name, sales]) => {
         const outletObj = OUTLETS.find(o => o.name === name);
         return {
            name,
            sales,
            id: outletObj?.id 
         };
      });
      setOutletSales(salesArray);
    } catch (error: any) {
      console.error('Error fetching dashboard data (wrapper):', error);
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
      maximumFractionDigits: 0,
    }).format(amountInPaise / 100);

  const formatTarget = (amountInRupees: number) =>
    new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amountInRupees);

  return (
    <div className="space-y-8 relative"> 
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">
            Welcome,{' '}
            <span className="text-blue-600 capitalize">
              {user?.username || 'Admin'}
            </span>{' '}
            👋
          </h1>
          <p className="text-gray-500 text-sm mt-1">
            Here is today&apos;s overview
          </p>
        </div>

        <Link href="/form" passHref>
          <button className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors shadow-md font-medium">
            ➕ Add Customer
          </button>
        </Link>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Daily Sales Card */}
        <div className="bg-white p-6 rounded-xl shadow-lg border border-gray-100">
          <h3 className="text-gray-500 text-sm font-medium uppercase tracking-wide">
            Today&apos;s Total Sales
          </h3>
          <p className="text-3xl font-bold mt-2 text-amber-600">
            {loading ? '...' : formatCurrency(dailyTarget.achieved)}
          </p>
        </div>

        {/* Daily Target Card */}
        <div className="bg-white p-6 rounded-xl shadow-lg border border-gray-100">
          <h3 className="text-gray-500 text-sm font-medium uppercase tracking-wide">
            Company Daily Target
          </h3>
          <p className="text-2xl font-bold mt-2 text-gray-800">
            {loading ? '...' : formatTarget(dailyTarget.target)}
          </p>
          <div className="mt-4">
            <div className="flex justify-between text-xs mb-1 font-medium text-gray-500">
              <span>Progress</span>
              <span>{loading ? '...' : `${dailyTarget.percentage}%`}</span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-2">
              <div
                className="h-2 rounded-full bg-red-600 transition-all duration-1000"
                style={{ width: `${dailyTarget.percentage}%` }}
              ></div>
            </div>
          </div>
        </div>

        {/* Total Customers Card */}
        <div className="bg-white p-6 rounded-xl shadow-lg border border-gray-100">
          <h3 className="text-gray-500 text-sm font-medium uppercase tracking-wide">
            Today&apos;s Customers
          </h3>
          <p className="text-3xl font-bold mt-2 text-gray-800">
            {loading ? '...' : totalCustomers}
          </p>
        </div>
      </div>

      {/* Outlet Sales Grid */}
      <div>
        <h2 className="text-xl font-bold text-gray-800 mb-4">
          Sales by Outlet
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {loading ? (
            <div className="md:col-span-3 lg:col-span-4 p-10 bg-white rounded-lg shadow-md text-gray-400 text-center">
              Loading data...
            </div>
          ) : (
            outletSales.map((outlet) => {
              const isOnline = outlet.id ? onlineOutlets.has(outlet.id) : false;

              return (
                <div
                  key={outlet.name}
                  className="bg-white p-5 rounded-xl shadow-md border border-gray-100 hover:shadow-lg transition-all"
                >
                  <div className="flex items-center justify-between mb-2">
                      <h4 className="text-gray-500 text-xs font-bold uppercase tracking-wider">
                        {outlet.name}
                      </h4>
                      {/* --- Status Light --- */}
                      {isOnline ? (
                        <div className="flex items-center gap-1.5 bg-emerald-50 px-2 py-1 rounded-full border border-emerald-100">
                            <span className="relative flex h-2 w-2">
                              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                            </span>
                            <span className="text-[9px] font-bold text-emerald-700 uppercase">Live</span>
                        </div>
                      ) : (
                        <div className="flex items-center gap-1.5 px-2 py-1 rounded-full border border-gray-100 bg-gray-50">
                            <span className="h-2 w-2 rounded-full bg-rose-400 shadow-sm"></span>
                            <span className="text-[9px] font-bold text-gray-400 uppercase">Offline</span>
                        </div>
                      )}
                  </div>
                  
                  <p className="text-2xl font-bold text-blue-600">
                    {formatCurrency(outlet.sales)}
                  </p>
                </div>
              );
            })
          )}
        </div>
      </div>

      <div className="p-4 bg-gray-800 rounded-lg border border-gray-700 shadow-lg">
        <p className="text-gray-300 text-sm flex items-center gap-2">
          <span>💡</span> For detailed customer lists, package status, or outlet
          performance, please use the sidebar navigation.
        </p>
      </div>

      {/* --- OFFLINE MODE TOGGLE BUTTON --- */}
      <button
        onClick={toggleDatabaseMode}
        className={`fixed bottom-4 right-4 z-50 flex items-center gap-2 px-4 py-3 rounded-full shadow-2xl font-bold text-white transition-colors ${
          isUsingBackup() ? 'bg-red-600 animate-pulse' : 'bg-green-600 hover:bg-green-700'
        }`}
      >
        {isUsingBackup() ? <WifiOff size={20} /> : <Wifi size={20} />}
        {isUsingBackup() ? 'OFFLINE MODE (Local)' : 'ONLINE MODE (Cloud)'}
      </button>
    </div>
  );
}