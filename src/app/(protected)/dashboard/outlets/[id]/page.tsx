'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { getISTToday, addMonthsAsISTDateString } from '@/lib/dateTime';

type Customer = {
  name: string;
  mobile: string;
  date: string;
  treatment: string;
  sessionHours: number;
  tookPackage: boolean;
  packageAmount?: number;
  totalPackageHours?: number;
  outlet: string;
  amountPaid?: number;
};

type PackageAlert = {
  name: string;
  mobile: string;
  remainingHours: number;
  expiryDate: string;
  daysLeft: number;
};

export default function OutletDashboard() {
  const params = useParams();
  const router = useRouter();
  const outletId = params.id as string;
  
  const outletMapping: Record<string, string> = {
    '1': 'Indiranagar',
    '2': 'Kaggadaspura',
    '3': 'Kalyan Nagar',
    '4': 'Cunningham Road',
    '5': 'HSR Layout',
    '6': 'Malleswaram',
    '7': 'Marathahalli'
  };

  const outletName = outletMapping[outletId] || 'Unknown Outlet';
  
  const [recentCustomers, setRecentCustomers] = useState<Customer[]>([]);
  const [packageAlerts, setPackageAlerts] = useState<PackageAlert[]>([]);
  const [dailyTarget, setDailyTarget] = useState({
    target: 50000,
    achieved: 0,
    percentage: 0
  });
  const [dailySales, setDailySales] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchData();
  }, [outletId]);

  const fetchData = async () => {
    try {
      const res = await fetch('/api/customers');
      if (res.ok) {
        const allCustomers: Customer[] = await res.json();
        const outletCustomers = allCustomers.filter(c => c.outlet === outletName);
        
        // Recent customers
        const sorted = outletCustomers
          .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
          .slice(0, 5);
        setRecentCustomers(sorted);

        // Daily sales (treatment + package sales)
        const today = getISTToday();
        const todayNonPackageSales = outletCustomers
          .filter(c => c.date === today && !c.tookPackage)
          .reduce((sum, c) => sum + (c.amountPaid || 0), 0);
        
        const todayPackageSales = outletCustomers
          .filter(c => c.date === today && c.tookPackage)
          .reduce((sum, c) => sum + (c.packageAmount || 0), 0);
        
        const totalDailySales = todayNonPackageSales + todayPackageSales;
        const target = 50000;
        const percentage = Math.min(100, Math.round((totalDailySales / target) * 100));
        
        setDailyTarget({ target, achieved: totalDailySales, percentage });
        setDailySales(totalDailySales);

        // Package alerts
        const packageMap = new Map<string, any>();
        outletCustomers.forEach(c => {
          if (c.tookPackage) {
            const key = c.mobile;
            if (!packageMap.has(key)) {
              packageMap.set(key, { ...c, totalUsed: 0 });
            }
            const existing = packageMap.get(key)!;
            existing.totalUsed += c.sessionHours || 0;
          }
        });

        const alerts: PackageAlert[] = [];
        const now = new Date();
        packageMap.forEach(customer => {
          const sessions = outletCustomers
            .filter(c => c.mobile === customer.mobile && c.tookPackage)
            .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
          
          if (sessions[0]) {
            const startDate = new Date(sessions[0].date);
            const expiry = new Date(startDate);
            expiry.setMonth(expiry.getMonth() + 2);
            
            const daysLeft = Math.ceil((expiry.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
            const remaining = Math.max(0, (customer.totalPackageHours || 0) - customer.totalUsed);
            
            if (daysLeft <= 7 || remaining < 1) {
              alerts.push({
                name: customer.name,
                mobile: customer.mobile,
                remainingHours: remaining,
                expiryDate: addMonthsAsISTDateString(startDate, 2),
                daysLeft: daysLeft > 0 ? daysLeft : 0
              });
            }
          }
        });

        alerts.sort((a, b) => a.daysLeft - b.daysLeft || a.remainingHours - b.remainingHours);
        setPackageAlerts(alerts);
      }
    } catch (error) {
      console.error('Error:', error);
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (amount: number) => 
    new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(amount);

  return (
    <div className="space-y-8">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold text-gray-800">{outletName} Dashboard</h1>
        <div className="flex gap-3">
          <button 
            onClick={() => router.back()}
            className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
          >
            ← Back to Outlets
          </button>
          <Link
            href="/form"
            className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700"
          >
            ➕ Add Customer
          </Link>
        </div>
      </div>

      {/* Updated Stats Cards - Added Daily Sales */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <div className="bg-white p-6 rounded-xl shadow">
          <h3 className="text-gray-500 text-sm font-medium">Daily Sales</h3>
          <p className="text-2xl font-bold mt-2 text-green-600">{formatCurrency(dailySales)}</p>
        </div>

        <div className="bg-white p-6 rounded-xl shadow">
          <h3 className="text-gray-500 text-sm font-medium">Daily Target</h3>
          <p className="text-2xl font-bold mt-2">{formatCurrency(dailyTarget.target)}</p>
          <div className="mt-4">
            <div className="flex justify-between text-sm mb-1">
              <span>Achieved</span>
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
          <h3 className="text-gray-500 text-sm font-medium">Package Alerts</h3>
          <p className="text-2xl font-bold mt-2 text-red-600">{packageAlerts.length}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
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
                <div key={i} className="p-6">
                  <div className="flex justify-between">
                    <div>
                      <h3 className="font-medium">{c.name}</h3>
                      <p className="text-sm text-gray-500">{c.mobile}</p>
                    </div>
                    <div className="text-right">
                      <p className="font-medium">{c.treatment}</p>
                      <p className="text-sm text-gray-500">
                        {new Date(c.date).toLocaleDateString()}
                      </p>
                    </div>
                  </div>
                  {c.tookPackage && (
                    <span className="mt-2 inline-block px-2 py-1 bg-green-100 text-green-800 text-xs rounded-full">
                      Package
                    </span>
                  )}
                </div>
              ))
            )}
          </div>
        </div>

        <div className="bg-white rounded-xl shadow">
          <div className="p-6 border-b border-gray-200">
            <h2 className="text-lg font-semibold text-red-600">⚠️ Package Alerts</h2>
          </div>
          <div className="divide-y divide-gray-100">
            {loading ? (
              <div className="p-6 text-center text-gray-500">Loading...</div>
            ) : packageAlerts.length === 0 ? (
              <div className="p-6 text-center text-gray-500">All packages healthy</div>
            ) : (
              packageAlerts.map((alert, i) => (
                <div key={i} className="p-6">
                  <div className="flex justify-between">
                    <div>
                      <h3 className="font-medium">{alert.name}</h3>
                      <p className="text-sm text-gray-500">{alert.mobile}</p>
                    </div>
                    <span className={`px-2 py-1 text-xs rounded-full ${
                      alert.daysLeft === 0 ? 'bg-red-200 text-red-800' :
                      alert.daysLeft <= 3 ? 'bg-orange-200 text-orange-800' :
                      'bg-yellow-200 text-yellow-800'
                    }`}>
                      {alert.daysLeft === 0 ? 'Expired' : `${alert.daysLeft} days`}
                    </span>
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
                    <div>
                      <span className="text-gray-500">Remaining:</span>
                      <span className="ml-1 font-medium text-red-600">
                        {alert.remainingHours.toFixed(1)} hrs
                      </span>
                    </div>
                    <div>
                      <span className="text-gray-500">Expiry:</span>
                      <span className="ml-1">
                        {new Date(alert.expiryDate).toLocaleDateString()}
                      </span>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}