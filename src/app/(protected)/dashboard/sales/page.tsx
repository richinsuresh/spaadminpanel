// src/app/(protected)/dashboard/sales/page.tsx
'use client';

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { OUTLETS } from '@/lib/outlet';
import { THERAPISTS_BY_OUTLET, ALL_THERAPISTS } from 'src/lib/therapists'; // <-- 1. IMPORT maps

type Sale = {
  id: string;
  date: string;
  name: string;
  mobile: string;
  outlet: string;
  treatment: string;
  amount_paid: number;
  took_package: boolean;
  package_amount: number;
  check_in_time: string | null;
  check_out_time: string | null;
  room: string | null;
  therapist_name: string | null;
};

const formatCurrency = (amountInPaise: number) =>
  new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amountInPaise / 100);

const formatDate = (dateString: string | null) => {
  if (!dateString) return '—';
  return new Date(dateString).toLocaleTimeString('en-IN', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });
};

export default function AdminSalesPage() {
  const [sales, setSales] = useState<Sale[]>([]);
  const [loading, setLoading] = useState(true);
  
  const [outletFilter, setOutletFilter] = useState('all');
  const [dateFilter, setDateFilter] = useState(new Date().toISOString().split('T')[0]);
  const [roomInputs, setRoomInputs] = useState<{[key: string]: string}>({});
  const [therapistInputs, setTherapistInputs] = useState<{[key: string]: string}>({}); // <-- 2. ADDED

  const outletNames = ['all', ...OUTLETS.map(o => o.name)];

  const fetchSales = useCallback(async () => {
    setLoading(true);
    try {
      let query = supabase
        .from('customers')
        .select('id, date, name, mobile, outlet, treatment, amount_paid, took_package, package_amount, check_in_time, check_out_time, room, therapist_name')
        .order('check_in_time', { ascending: false, nullsFirst: false });

      if (dateFilter) {
        query = query.eq('date', dateFilter);
      }
      if (outletFilter !== 'all') {
        query = query.eq('outlet', outletFilter);
      }

      const { data, error } = await query;
      if (error) throw error;
      setSales(data || []);
      
      const initialRooms: {[key: string]: string} = {};
      const initialTherapists: {[key: string]: string} = {}; // <-- 3. ADDED
      (data || []).forEach(sale => {
        initialRooms[sale.id] = sale.room || '';
        initialTherapists[sale.id] = sale.therapist_name || ''; // <-- 3. ADDED
      });
      setRoomInputs(initialRooms);
      setTherapistInputs(initialTherapists); // <-- 3. ADDED
      
    } catch (err) {
      console.error('Error fetching sales:', err);
    } finally {
      setLoading(false);
    }
  }, [dateFilter, outletFilter]);

  useEffect(() => {
    fetchSales();
    
    const channel = supabase
      .channel('customers-sales-admin')
      .on('postgres_changes', 
        { event: '*', schema: 'public', table: 'customers' },
        (payload) => {
          console.log('Change detected, refreshing sales...', payload);
          fetchSales();
        }
      )
      .subscribe();
      
    return () => {
      supabase.removeChannel(channel);
    };
    
  }, [fetchSales]);

  const handleRoomInputChange = (id: string, room: string) => {
    setRoomInputs(prev => ({ ...prev, [id]: room }));
  };

  const handleRoomSave = async (id: string, room: string) => {
    if (!room) return;
    await supabase.from('customers').update({ room }).eq('id', id);
  };
  
  // --- 4. ADDED handler for saving therapist ---
  const handleTherapistSave = async (id: string, therapistName: string) => {
    setTherapistInputs(prev => ({ ...prev, [id]: therapistName }));
    if (!therapistName) return;
    await supabase.from('customers').update({ therapist_name: therapistName }).eq('id', id);
  };
  
  const handleCheckOut = async (id: string) => {
    if (!confirm('Are you sure you want to check out this client?')) return;
    await supabase
      .from('customers')
      .update({ check_out_time: new Date().toISOString() })
      .eq('id', id);
  };
  
  const totalSales = sales
    .filter(sale => !!sale.check_out_time) 
    .reduce((sum, sale) => {
      const amount = sale.took_package ? sale.package_amount : sale.amount_paid;
      return sum + (amount || 0);
    }, 0);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-800">Live Sales & Check-out</h1>

      {/* --- Filters --- */}
      <div className="bg-white p-4 rounded-xl shadow-sm grid grid-cols-1 md:grid-cols-3 gap-4">
        <div>
          <label htmlFor="date" className="block text-sm font-medium text-gray-700 mb-1">Date</label>
          <input
            id="date"
            type="date"
            value={dateFilter}
            onChange={(e) => setDateFilter(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg"
          />
        </div>
        <div>
          <label htmlFor="outlet" className="block text-sm font-medium text-gray-700 mb-1">Outlet</label>
          <select
            id="outlet"
            value={outletFilter}
            onChange={(e) => setOutletFilter(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-white"
          >
            {outletNames.map(name => (
              <option key={name} value={name}>{name === 'all' ? 'All Outlets' : name}</option>
            ))}
          </select>
        </div>
      </div>

      {/* --- Total Sales Card --- */}
      <div className="bg-white p-6 rounded-xl shadow-sm">
        <h3 className="text-gray-500 text-sm font-medium">Total Completed Sales (Filtered)</h3>
        <p className="text-3xl font-bold mt-2 text-green-600">
          {formatCurrency(totalSales)}
        </p>
        <p className="text-gray-500 text-sm">{sales.filter(s => !!s.check_out_time).length} completed transaction(s)</p>
      </div>

      {/* --- Sales Table --- */}
      <div className="bg-white shadow rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Customer</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Outlet</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Service</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Amount</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Check-in</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Therapist</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Room</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Check-out</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {loading ? (
                <tr><td colSpan={8} className="p-6 text-center text-gray-500">Loading...</td></tr>
              ) : sales.length === 0 ? (
                <tr><td colSpan={8} className="p-6 text-center text-gray-500">No sales found for these filters.</td></tr>
              ) : (
                sales.map(sale => {
                  // --- 5. GET the correct therapist list for this row ---
                  const therapistList = THERAPISTS_BY_OUTLET[sale.outlet] || [];
                  
                  return (
                    <tr key={sale.id} className={sale.check_out_time ? 'bg-gray-50 opacity-60' : 'bg-white'}>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm font-medium text-gray-900">{sale.name}</div>
                        <div className="text-sm text-gray-500">{sale.mobile}</div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{sale.outlet}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {sale.took_package ? <span className="font-medium text-purple-700">New Package</span> : sale.treatment}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-green-600">
                        {formatCurrency(sale.took_package ? sale.package_amount : sale.amount_paid)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {formatDate(sale.check_in_time)}
                      </td>
                      
                      {/* --- 6. ADDED Therapist Dropdown --- */}
                      <td className="px-6 py-4 whitespace-nowrap">
                        {sale.check_out_time ? (
                          <span className="text-sm text-gray-500">{sale.therapist_name || 'N/A'}</span>
                        ) : (
                          <select
                            value={therapistInputs[sale.id] || ''}
                            onChange={(e) => handleTherapistSave(sale.id, e.target.value)}
                            className="w-28 px-2 py-1 border border-gray-300 rounded-md text-sm bg-white"
                          >
                            <option value="">Select...</option>
                            {/* If outlet filter is on, show specific therapists.
                              If 'all' is selected, show ALL therapists.
                            */}
                            {(outletFilter === 'all' ? ALL_THERAPISTS : therapistList).map(name => (
                              <option key={name} value={name}>{name}</option>
                            ))}
                          </select>
                        )}
                      </td>

                      <td className="px-6 py-4 whitespace-nowrap">
                        {sale.check_out_time ? (
                          <span className="text-sm text-gray-500">{sale.room || 'N/A'}</span>
                        ) : (
                          <div className="flex">
                            <input 
                              type="text"
                              value={roomInputs[sale.id] || ''}
                              onChange={(e) => handleRoomInputChange(sale.id, e.target.value)}
                              placeholder="Room name"
                              className="w-20 px-2 py-1 border border-gray-300 rounded-l-md text-sm"
                            />
                            <button
                              onClick={() => handleRoomSave(sale.id, roomInputs[sale.id])}
                              className="px-2 py-1 bg-gray-200 text-gray-700 rounded-r-md text-sm hover:bg-gray-300"
                            >
                              Save
                            </button>
                          </div>
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        {sale.check_out_time ? (
                          <span className="text-sm text-gray-500">{formatDate(sale.check_out_time)}</span>
                        ) : (
                          <button
                            onClick={() => handleCheckOut(sale.id)}
                            className="px-3 py-1 bg-red-500 text-white text-sm rounded-lg hover:bg-red-600"
                          >
                            Check Out
                          </button>
                        )}
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}