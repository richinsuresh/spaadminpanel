'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import { OUTLETS } from '@/lib/outlet';
import { exportToExcel } from '@/lib/exportToExcel';

// --- Updated Sale type to include all fields ---
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
  room: string | null; // <-- ADDED
  therapist_name: string | null;
  session_hours: number | null;
  outlet_name: string;
  package_sold_by: string | null;
};

// --- Helper Functions ---
const formatCurrency = (amountInPaise: number) =>
  new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amountInPaise / 100);

const formatDate = (dateString: string | null) => {
  if (!dateString) return '—';
  return new Date(dateString).toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
  });
};

const formatTime = (dateString: string | null) => {
  if (!dateString) return '—';
  return new Date(dateString).toLocaleTimeString('en-IN', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });
};

const formatDuration = (hours: number | null) => {
  if (!hours || hours === 0) return '—';
  if (hours < 1) return `${Math.round(hours * 60)} mins`;
  
  const h = Math.floor(hours);
  const m = Math.round((hours % 1) * 60);
  
  if (m === 0) return `${h} hr${h > 1 ? 's' : ''}`;
  if (h === 0) return `${m} mins`;
  return `${h}hr ${m}m`;
};

// --- Helper to get today's date ---
const getToday = () => {
  return new Date().toISOString().split('T')[0];
};

export default function AdminSalesPage() {
  const [sales, setSales] = useState<Sale[]>([]);
  const [loading, setLoading] = useState(true);
  const [isExporting, setIsExporting] = useState(false);

  // --- MODIFIED: Date filters now default to just TODAY ---
  const [startDate, setStartDate] = useState(getToday);
  const [endDate, setEndDate] = useState(getToday);
  const [selectedOutletId, setSelectedOutletId] = useState('all');

  // --- ADDED: State for live inputs ---
  const [roomInputs, setRoomInputs] = useState<{[key: string]: string}>({});
  const [therapistInputs, setTherapistInputs] = useState<{[key: string]: string}>({});

  // --- MODIFIED: Fetches sales based on all filters ---
  const fetchSales = useCallback(async () => {
    setLoading(true);
    try {
      let query = supabase
        .from('customers')
        .select('id, date, name, mobile, treatment, session_hours, amount_paid, took_package, package_amount, check_in_time, check_out_time, room, therapist_name, outlet_name, package_sold_by')
        // --- REMOVED: .not('check_out_time', 'is', null) ---
        // Now it fetches ALL sales, including live ones
        .gte('date', startDate)
        .lte('date', endDate)
        .order('check_in_time', { ascending: false, nullsFirst: false }); // Show live check-ins first

      // Filter 2: Outlet
      if (selectedOutletId !== 'all') {
        query = query.eq('outlet_id', selectedOutletId);
      }
      
      const { data, error } = await query;
      if (error) throw error;
      setSales(data || []);
      
      // --- ADDED: Populate inputs for live sales ---
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
      alert('Error fetching sales. See console for details.');
    } finally {
      setLoading(false);
    }
  }, [startDate, endDate, selectedOutletId]);

  // --- Re-fetch sales when filters change ---
  useEffect(() => {
    fetchSales();
  }, [fetchSales]);
  
  // --- ADDED: Real-time Supabase subscription ---
  useEffect(() => {
    // This function will be called by the channel
    const handleUpdate = (payload: any) => {
      console.log('Change detected!', payload);
      // Re-fetch all sales to get the new/updated row
      fetchSales();
    };

    // Base filter: only listen for changes within the selected date range
    let channelFilter = `date=gte.${startDate}&date=lte.${endDate}`;
    // If a specific outlet is chosen, add it to the filter
    if (selectedOutletId !== 'all') {
      channelFilter += `&outlet_id=eq.${selectedOutletId}`;
    }

    const channel = supabase
      .channel(`admin-sales-channel-${selectedOutletId}-${startDate}-${endDate}`)
      .on('postgres_changes', 
        { 
          event: '*', 
          schema: 'public', 
          table: 'customers',
          filter: channelFilter
        },
        handleUpdate
      )
      .subscribe();
      
    // Cleanup function
    return () => {
      supabase.removeChannel(channel);
    };
    
  }, [fetchSales, selectedOutletId, startDate, endDate]);

  // --- Calculate total *completed* sales from the fetched data ---
  const totalSales = useMemo(() => {
    return sales
      .filter(sale => !!sale.check_out_time) // Only count completed sales
      .reduce((sum, sale) => {
        const amount = sale.took_package ? sale.package_amount : sale.amount_paid;
        return sum + (amount || 0);
    }, 0);
  }, [sales]);
  
  const completedSalesCount = useMemo(() => {
    return sales.filter(s => !!s.check_out_time).length;
  }, [sales]);

  // --- Handle Export Function (No changes needed) ---
  const handleExport = async () => {
    setIsExporting(true);
    try {
      // 1. Build the query based on filters
      let query = supabase
        .from('customers')
        .select('id, date, name, mobile, treatment, session_hours, amount_paid, took_package, package_amount, check_in_time, check_out_time, therapist_name, outlet_name, package_sold_by, room') // Added room
        // --- MODIFIED: Export *all* data, not just completed
        // .not('check_out_time', 'is', null) 
        .gte('date', startDate)
        .lte('date', endDate)
        .order('date', { ascending: false });

      if (selectedOutletId !== 'all') {
        query = query.eq('outlet_id', selectedOutletId);
      }

      // 2. Fetch ALL data for the export
      const { data, error } = await query;
      if (error) throw error;
      if (!data || data.length === 0) {
        alert('No data to export for this period.');
        setIsExporting(false);
        return;
      }

      // 3. Format data for Excel
      const dataToExport = data.map(sale => ({
        'Date': new Date(sale.date).toLocaleDateString('en-IN'),
        'Outlet': sale.outlet_name,
        'Customer Name': sale.name,
        'Mobile': sale.mobile,
        'Service': sale.took_package ? "New Package" : sale.treatment,
        'Amount (INR)': (sale.took_package ? sale.package_amount : sale.amount_paid) / 100,
        'Duration': formatDuration(sale.session_hours),
        'Sold By': sale.package_sold_by || 'N/A',
        'Therapist': sale.therapist_name || 'N/A',
        'Room': sale.room || 'N/A',
        'Check-in Time': formatTime(sale.check_in_time),
        'Check-out Time': formatTime(sale.check_out_time),
      }));

      // 4. Generate dynamic file name
      const outletName = selectedOutletId === 'all' ? 'AllOutlets' : OUTLETS.find(o => o.id === selectedOutletId)?.name || 'Outlet';
      const fileName = `Sales_${outletName}_${startDate}_to_${endDate}.xlsx`;

      // 5. Call the export function
      exportToExcel(dataToExport, fileName);

    } catch (err: any) {
      console.error('Error exporting data:', err);
      alert(`Error exporting: ${err.message}`);
    } finally {
      setIsExporting(false);
    }
  };

  // --- ADDED: Handlers for live updates ---
  const handleRoomInputChange = (id: string, room: string) => {
    setRoomInputs(prev => ({ ...prev, [id]: room }));
  };
  const handleRoomSave = async (id: string, room: string) => {
    if (!room) return;
    await supabase.from('customers').update({ room }).eq('id', id);
    // No need to call fetchSales() here, the channel will catch the update
  };
  const handleTherapistInputChange = (id: string, name: string) => {
    setTherapistInputs(prev => ({ ...prev, [id]: name }));
  };
  const handleTherapistSave = async (id: string, therapistName: string) => {
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
  
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-800">Admin Live Dashboard & Sales</h1>

      {/* --- Filter Bar (no change) --- */}
      <div className="bg-white p-4 rounded-xl shadow-sm grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
        <div>
          <label htmlFor="outlet" className="block text-sm font-medium text-gray-700 mb-1">Outlet</label>
          <select
            id="outlet"
            value={selectedOutletId}
            onChange={(e) => setSelectedOutletId(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-black bg-white"
          >
            <option value="all">All Outlets</option>
            {OUTLETS.map(outlet => (
              <option key={outlet.id} value={outlet.id}>
                {outlet.name}
              </option>
            ))}
          </select>
        </div>
        
        <div>
          <label htmlFor="startDate" className="block text-sm font-medium text-gray-700 mb-1">Start Date</label>
          <input
            id="startDate"
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-black"
          />
        </div>

        <div>
          <label htmlFor="endDate" className="block text-sm font-medium text-gray-700 mb-1">End Date</label>
          <input
            id="endDate"
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-black"
          />
        </div>
        
        <div>
          <button
            onClick={handleExport}
            disabled={loading || isExporting}
            className="w-full px-4 py-2 bg-green-600 text-white font-medium rounded-lg hover:bg-green-700 disabled:opacity-50"
          >
            {isExporting ? 'Exporting...' : 'Export to Excel'}
          </button>
        </div>
      </div>

      <div className="bg-white p-6 rounded-xl shadow-sm">
        <h3 className="text-gray-500 text-sm font-medium">Total Completed Sales (Filtered)</h3>
        <p className="text-3xl font-bold mt-2 text-green-600">
          {formatCurrency(totalSales)}
        </p>
        <p className="text-gray-500 text-sm">{completedSalesCount} completed transaction(s)</p>
      </div>

      {/* --- MODIFIED: Table with live check-out columns --- */}
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
                sales.map(sale => (
                  <tr key={sale.id} className={sale.check_out_time ? 'bg-gray-50 opacity-60' : 'bg-white'}>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm font-medium text-gray-900">{sale.name}</div>
                      <div className="text-sm text-gray-500">{sale.mobile}</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                      {sale.outlet_name}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {sale.took_package ? <span className="font-medium text-purple-700">New Package</span> : sale.treatment}
                      <div className="text-xs text-gray-400">{formatDuration(sale.session_hours)}</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-green-600">
                      {formatCurrency(sale.took_package ? sale.package_amount : sale.amount_paid)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {formatTime(sale.check_in_time)}
                    </td>
                    
                    {/* --- ADDED: Live Therapist Column --- */}
                    <td className="px-6 py-4 whitespace-nowrap">
                      {sale.check_out_time ? (
                        <span className="text-sm text-gray-500">{sale.therapist_name || 'N/A'}</span>
                      ) : (
                        <div className="flex">
                          <input 
                            type="text"
                            value={therapistInputs[sale.id] || ''}
                            onChange={(e) => handleTherapistInputChange(sale.id, e.target.value)}
                            placeholder="Therapist"
                            className="w-24 px-2 py-1 border border-gray-300 rounded-l-md text-sm text-black"
                          />
                          <button
                            onClick={() => handleTherapistSave(sale.id, therapistInputs[sale.id])}
                            className="px-2 py-1 bg-gray-200 text-gray-700 rounded-r-md text-sm hover:bg-gray-300"
                          >
                            Save
                          </button>
                        </div>
                      )}
                    </td>

                    {/* --- ADDED: Live Room Column --- */}
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
                            className="w-20 px-2 py-1 border border-gray-300 rounded-l-md text-sm text-black"
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
                    
                    {/* --- ADDED: Live Check-out Column --- */}
                    <td className="px-6 py-4 whitespace-nowrap">
                      {sale.check_out_time ? (
                        <span className="text-sm text-gray-500">{formatTime(sale.check_out_time)}</span>
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