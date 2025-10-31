// src/app/(protected)/outlet/dashboard/sales/page.tsx
'use client';

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { OUTLETS } from '@/lib/outlet';
import { THERAPISTS_BY_OUTLET } from 'src/lib/therapists'; // <-- 1. IMPORT new map

type Sale = {
  id: string;
  date: string;
  name: string;
  mobile: string;
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

export default function OutletSalesPage() {
  const [sales, setSales] = useState<Sale[]>([]);
  const [loading, setLoading] = useState(true);
  const [outletName, setOutletName] = useState('');
  const [outletId, setOutletId] = useState('');
  const [dateFilter, setDateFilter] = useState(new Date().toISOString().split('T')[0]);
  const [roomInputs, setRoomInputs] = useState<{[key: string]: string}>({});
  const [therapistInputs, setTherapistInputs] = useState<{[key: string]: string}>({});
  
  // --- 2. ADDED state for this outlet's specific therapist list ---
  const [therapistList, setTherapistList] = useState<string[]>([]);

  useEffect(() => {
    async function fetchOutletSession() {
      try {
        const res = await fetch('/api/outlet');
        if (!res.ok) throw new Error('Could not fetch outlet session');
        
        const data = await res.json();
        if (data.outletId && data.outletName) {
          setOutletId(data.outletId);
          setOutletName(data.outletName);
          // --- 3. Set this outlet's therapist list ---
          setTherapistList(THERAPISTS_BY_OUTLET[data.outletName] || []);
        } else {
          throw new Error("No outlet data returned from API");
        }
      } catch (err) {
        console.error(err);
        setLoading(false);
      }
    }
    fetchOutletSession();
  }, []);

  const fetchSales = useCallback(async () => {
    if (!outletName) return; 
    
    setLoading(true);
    try {
      let query = supabase
        .from('customers')
        .select('id, date, name, mobile, treatment, amount_paid, took_package, package_amount, check_in_time, check_out_time, room, therapist_name')
        .eq('outlet', outletName) 
        .order('check_in_time', { ascending: false, nullsFirst: false });

      if (dateFilter) {
        query = query.eq('date', dateFilter);
      }
      
      const { data, error } = await query;
      if (error) throw error;
      setSales(data || []);
      
      const initialRooms: {[key: string]: string} = {};
      const initialTherapists: {[key: string]: string} = {};
      (data || []).forEach(sale => {
        initialRooms[sale.id] = sale.room || '';
        initialTherapists[sale.id] = sale.therapist_name || '';
      });
      setRoomInputs(initialRooms);
      setTherapistInputs(initialTherapists);
      
    } catch (err) {
      console.error('Error fetching sales:', err);
    } finally {
      setLoading(false);
    }
  }, [dateFilter, outletName]);

  useEffect(() => {
    if (!outletName || !outletId) return;
    
    fetchSales();
    
    const channel = supabase
      .channel(`customers-sales-outlet-${outletId}`)
      .on('postgres_changes', 
        { 
          event: '*', 
          schema: 'public', 
          table: 'customers',
          filter: `outlet=eq.${outletName}` 
        },
        (payload) => {
          fetchSales();
        }
      )
      .subscribe();
      
    return () => {
      supabase.removeChannel(channel);
    };
    
  }, [fetchSales, outletId, outletName]);

  const handleRoomInputChange = (id: string, room: string) => {
    setRoomInputs(prev => ({ ...prev, [id]: room }));
  };

  const handleRoomSave = async (id: string, room: string) => {
    if (!room) return;
    await supabase.from('customers').update({ room }).eq('id', id);
  };
  
  const handleTherapistSave = async (id: string, therapistName: string) => {
    setTherapistInputs(prev => ({ ...prev, [id]: therapistName }));
    if (!therapistName) return; // Allow clearing but don't save empty string
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
      <h1 className="text-2xl font-bold text-gray-800">{outletName} Sales & Check-out</h1>

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
      </div>

      <div className="bg-white p-6 rounded-xl shadow-sm">
        <h3 className="text-gray-500 text-sm font-medium">Total Completed Sales (Filtered)</h3>
        <p className="text-3xl font-bold mt-2 text-green-600">
          {formatCurrency(totalSales)}
        </p>
        <p className="text-gray-500 text-sm">{sales.filter(s => !!s.check_out_time).length} completed transaction(s)</p>
      </div>

      <div className="bg-white shadow rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Customer</th>
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
                <tr><td colSpan={7} className="p-6 text-center text-gray-500">Loading...</td></tr>
              ) : sales.length === 0 ? (
                <tr><td colSpan={7} className="p-6 text-center text-gray-500">No sales found for these filters.</td></tr>
              ) : (
                sales.map(sale => (
                  <tr key={sale.id} className={sale.check_out_time ? 'bg-gray-50 opacity-60' : 'bg-white'}>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm font-medium text-gray-900">{sale.name}</div>
                      <div className="text-sm text-gray-500">{sale.mobile}</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {sale.took_package ? <span className="font-medium text-purple-700">New Package</span> : sale.treatment}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-green-600">
                      {formatCurrency(sale.took_package ? sale.package_amount : sale.amount_paid)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {formatDate(sale.check_in_time)}
                    </td>
                    
                    {/* --- 4. UPDATED Therapist Dropdown --- */}
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
                          {/* Map over this outlet's specific list */}
                          {therapistList.map(name => (
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
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}