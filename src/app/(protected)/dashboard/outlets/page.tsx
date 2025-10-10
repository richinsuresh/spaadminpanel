// src/app/(protected)/dashboard/outlets/page.tsx
'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';

type Outlet = {
  id: string;
  name: string;
  location: string;
  dailySales: number;
};

export default function OutletsPage() {
  const router = useRouter();
  const [outlets, setOutlets] = useState<Outlet[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchOutletData();
  }, []);

  const fetchOutletData = async () => {
    try {
      const res = await fetch('/api/customers');
      if (res.ok) {
        const allCustomers = await res.json();
        const today = new Date().toISOString().split('T')[0];
        
        const outletList = [
          { id: '1', name: 'Berry Spa - Indiranagar', location: 'Indiranagar, Bangalore' },
          { id: '2', name: 'Berry Spa - Kaggadaspura', location: 'Kaggadaspura, Bangalore' },
          { id: '3', name: 'Berry Spa - Kalyan Nagar', location: 'Kalyan Nagar, Bangalore' },
          { id: '4', name: 'Berry Spa - Cunningham Road', location: 'Cunningham Road, Bangalore' },
          { id: '5', name: 'Berry Spa - HSR Layout', location: 'HSR Layout, Bangalore' },
          { id: '6', name: 'Berry Spa - Malleswaram', location: 'Malleswaram, Bangalore' },
          { id: '7', name: 'Berry Spa - Marathahalli', location: 'Marathahalli, Bangalore' }
        ];

        const outletsWithSales = outletList.map(outlet => {
          const outletName = outlet.name.replace('Berry Spa - ', '');
          const todaySales = allCustomers
            .filter((c: any) => 
              c.outlet === outletName && 
              c.date === today
            )
            .reduce((sum: number, c: any) => {
              // Include both treatment payments AND package sales
              if (c.tookPackage) {
                return sum + (c.packageAmount || 0);
              } else {
                return sum + (c.amountPaid || 0);
              }
            }, 0);
          
          return {
            ...outlet,
            dailySales: todaySales
          };
        });

        setOutlets(outletsWithSales);
      }
    } catch (error) {
      console.error('Error fetching outlet data:', error);
      // Fallback with 0 sales
      const fallbackOutlets = [
        { id: '1', name: 'Berry Spa - Indiranagar', location: 'Indiranagar, Bangalore', dailySales: 0 },
        { id: '2', name: 'Berry Spa - Kaggadaspura', location: 'Kaggadaspura, Bangalore', dailySales: 0 },
        { id: '3', name: 'Berry Spa - Kalyan Nagar', location: 'Kalyan Nagar, Bangalore', dailySales: 0 },
        { id: '4', name: 'Berry Spa - Cunningham Road', location: 'Cunningham Road, Bangalore', dailySales: 0 },
        { id: '5', name: 'Berry Spa - HSR Layout', location: 'HSR Layout, Bangalore', dailySales: 0 },
        { id: '6', name: 'Berry Spa - Malleswaram', location: 'Malleswaram, Bangalore', dailySales: 0 },
        { id: '7', name: 'Berry Spa - Marathahalli', location: 'Marathahalli, Bangalore', dailySales: 0 }
      ];
      setOutlets(fallbackOutlets);
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
    <div>
      <div className="flex justify-between items-center mb-8">
        <h1 className="text-2xl font-bold text-gray-800">Outlets Management</h1>
        <button className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700">
          ➕ Add New Outlet
        </button>
      </div>

      {loading ? (
        <div className="bg-white shadow rounded-lg p-8 text-center">
          Loading outlets...
        </div>
      ) : (
        <div className="bg-white shadow rounded-lg overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Outlet</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Location</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Daily Sales</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {outlets.map((outlet) => (
                  <tr 
                    key={outlet.id} 
                    className="hover:bg-gray-50 cursor-pointer"
                    onClick={() => router.push(`/dashboard/outlets/${outlet.id}`)}
                  >
                    <td className="px-6 py-4 whitespace-nowrap font-medium text-gray-900">
                      {outlet.name}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {outlet.location}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-green-600">
                      {formatCurrency(outlet.dailySales)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-green-100 text-green-800">
                        Active
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="mt-8 p-4 bg-blue-50 rounded-lg border border-blue-200">
        <p className="text-blue-700">
          💡 Note: Click any outlet to view its detailed dashboard with customer data, package alerts, and performance metrics.
        </p>
      </div>
    </div>
  );
}