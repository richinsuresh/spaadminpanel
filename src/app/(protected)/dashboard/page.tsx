// src/app/(protected)/dashboard/page.tsx
'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';

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

export default function DashboardPage() {
  const [recentCustomers, setRecentCustomers] = useState<Customer[]>([]);
  const [packageAlerts, setPackageAlerts] = useState<PackageAlert[]>([]);
  const [dailyTarget, setDailyTarget] = useState({
    target: 50000,
    achieved: 0,
    percentage: 0
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const res = await fetch('/api/customers');
      if (res.ok) {
        const allCustomers = await res.json();
        
        // Get recent customers (last 5)
        const sorted = allCustomers
          .sort((a: any, b: any) => new Date(b.date).getTime() - new Date(a.date).getTime())
          .slice(0, 5);
        setRecentCustomers(sorted);

        // Calculate daily sales (treatment + package sales)
        const today = new Date().toISOString().split('T')[0];
        const todayNonPackageSales = allCustomers
          .filter((c: any) => c.date === today && !c.tookPackage)
          .reduce((sum: number, c: any) => sum + (c.amountPaid || 0), 0);
        
        const todayPackageSales = allCustomers
          .filter((c: any) => c.date === today && c.tookPackage)
          .reduce((sum: number, c: any) => sum + (c.packageAmount || 0), 0);
        
        const totalDailySales = todayNonPackageSales + todayPackageSales;
        const target = 50000;
        const percentage = Math.min(100, Math.round((totalDailySales / target) * 100));
        
        setDailyTarget({
          target,
          achieved: totalDailySales,
          percentage
        });

        // Find expiring packages
        const packageCustomers = new Map<string, any>();
        allCustomers.forEach((c: any) => {
          if (c.tookPackage) {
            const key = c.mobile;
            if (!packageCustomers.has(key)) {
              packageCustomers.set(key, { ...c, totalUsed: 0 });
            }
            const existing = packageCustomers.get(key)!;
            existing.totalUsed += c.sessionHours || 0;
          }
        });

        const alerts: PackageAlert[] = [];
        const now = new Date();
        
        packageCustomers.forEach((customer) => {
          const packageSessions = allCustomers
            .filter((x: any) => x.mobile === customer.mobile && x.tookPackage)
            .sort((a: any, b: any) => new Date(a.date).getTime() - new Date(b.date).getTime());
          
          if (packageSessions[0]) {
            const startDate = new Date(packageSessions[0].date);
            const expiry = new Date(startDate);
            expiry.setMonth(expiry.getMonth() + 2);
            
            const daysLeft = Math.ceil((expiry.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
            const remainingHours = Math.max(0, (customer.totalPackageHours || 0) - customer.totalUsed);
            
            if (daysLeft <= 7 || remainingHours < 1) {
              alerts.push({
                name: customer.name,
                mobile: customer.mobile,
                remainingHours,
                expiryDate: expiry.toISOString().split('T')[0],
                daysLeft: daysLeft > 0 ? daysLeft : 0
              });
            }
          }
        });

        alerts.sort((a, b) => {
          if (a.daysLeft !== b.daysLeft) return a.daysLeft - b.daysLeft;
          return a.remainingHours - b.remainingHours;
        });
        
        setPackageAlerts(alerts);
      }
    } catch (error) {
      console.error('Error fetching dashboard ', error);
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      minimumFractionDigits: 0
    }).format(amount);
  };

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold text-gray-800">Dashboard</h1>
        <Link
          href="/form"
          className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors"
        >
          ➕ Add New Customer
        </Link>
      </div>

      {/* Stats Cards */}
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
          <p className="text-gray-500 text-sm mt-2">Active today</p>
        </div>

        <div className="bg-white p-6 rounded-xl shadow">
          <h3 className="text-gray-500 text-sm font-medium">Package Alerts</h3>
          <p className="text-2xl font-bold mt-2 text-red-600">{packageAlerts.length}</p>
          <p className="text-gray-500 text-sm mt-2">Requiring attention</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Recent Customers */}
        <div className="bg-white rounded-xl shadow">
          <div className="p-6 border-b border-gray-200">
            <h2 className="text-lg font-semibold text-gray-800">Recent Customers</h2>
          </div>
          <div className="divide-y divide-gray-100">
            {loading ? (
              <div className="p-6 text-center text-gray-500">Loading...</div>
            ) : recentCustomers.length === 0 ? (
              <div className="p-6 text-center text-gray-500">No recent customers</div>
            ) : (
              recentCustomers.map((customer, index) => (
                <div key={index} className="p-6 hover:bg-gray-50">
                  <div className="flex justify-between">
                    <div>
                      <h3 className="font-medium text-gray-900">{customer.name}</h3>
                      <p className="text-sm text-gray-500">{customer.mobile}</p>
                    </div>
                    <div className="text-right">
                      <p className="font-medium">{customer.treatment}</p>
                      <p className="text-sm text-gray-500">
                        {new Date(customer.date).toLocaleDateString()}
                      </p>
                    </div>
                  </div>
                  {customer.tookPackage && (
                    <div className="mt-2 inline-block px-2 py-1 bg-green-100 text-green-800 text-xs rounded-full">
                      Package Client
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        </div>

        {/* Package Alerts */}
        <div className="bg-white rounded-xl shadow">
          <div className="p-6 border-b border-gray-200">
            <h2 className="text-lg font-semibold text-red-600 flex items-center">
              <span className="mr-2">⚠️</span>
              Package Expiry Alerts
            </h2>
          </div>
          <div className="divide-y divide-gray-100">
            {loading ? (
              <div className="p-6 text-center text-gray-500">Loading...</div>
            ) : packageAlerts.length === 0 ? (
              <div className="p-6 text-center text-gray-500">
                All packages are in good standing
              </div>
            ) : (
              packageAlerts.map((alert, index) => (
                <div key={index} className="p-6 hover:bg-red-50">
                  <div className="flex justify-between">
                    <div>
                      <h3 className="font-medium text-gray-900">{alert.name}</h3>
                      <p className="text-sm text-gray-500">{alert.mobile}</p>
                    </div>
                    <div className="text-right">
                      {/* ✅ FIXED: Proper nested ternary */}
                      <span className={`px-2 py-1 text-xs rounded-full ${
                        alert.daysLeft === 0 
                          ? 'bg-red-200 text-red-800' 
                          : alert.daysLeft <= 3 
                            ? 'bg-orange-200 text-orange-800' 
                            : 'bg-yellow-200 text-yellow-800'
                      }`}>
                        {alert.daysLeft === 0 ? 'Expired' : `${alert.daysLeft} days left`}
                      </span>
                    </div>
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <span className="text-gray-500">Remaining Hours:</span>
                      <span className="ml-2 font-medium text-red-600">
                        {alert.remainingHours.toFixed(1)} hrs
                      </span>
                    </div>
                    <div>
                      <span className="text-gray-500">Expiry:</span>
                      <span className="ml-2 font-medium">
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