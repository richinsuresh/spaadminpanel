'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import { OUTLETS } from '@/lib/outlet';
import { exportToExcel } from '@/lib/exportToExcel';

// --- Type Definition ---
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

const getToday = () => {
  return new Date().toISOString().split('T')[0];
};

export default function AdminSalesPage() {
  const [sales, setSales] = useState<Sale[]>([]);
  const [loading, setLoading] = useState(true);
  const [isExporting, setIsExporting] = useState(false);
  const [startDate, setStartDate] = useState(getToday);
  const [endDate, setEndDate] = useState(getToday);
  const [selectedOutletId, setSelectedOutletId] = useState('all');
  const [roomInputs, setRoomInputs] = useState<{[key: string]: string}>({});
  const [therapistInputs, setTherapistInputs] = useState<{[key: string]: string}>({});

  const fetchSales = useCallback(async () => {
    setLoading(true);
    try {
      let query = supabase
        .from('customers')
        .select('id, date, name, mobile, treatment, session_hours, amount_paid, took_package, package_amount, check_in_time, check_out_time, room, therapist_name, outlet_name, package_sold_by')
        .gte('date', startDate)
        .lte('date', endDate)
        .order('check_in_time', { ascending: false, nullsFirst: true }); // Keep nulls at the top

      if (selectedOutletId !== 'all') {
        query = query.eq('outlet_id', selectedOutletId);
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
      alert('Error fetching sales. See console for details.');
    } finally {
      setLoading(false);
    }
  }, [startDate, endDate, selectedOutletId]);

  useEffect(() => {
    fetchSales();
  }, [fetchSales]);
  
  // Real-time listener
  useEffect(() => {
    const handleUpdate = (payload: any) => {
      console.log('Change detected!', payload);
      fetchSales(); 
    };

    let channelFilter = `date=gte.${startDate}&date=lte.${endDate}`;
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
      
    return () => {
      supabase.removeChannel(channel);
    };
    
  }, [fetchSales, selectedOutletId, startDate, endDate]);

  // --- Calculations (no change) ---
  const totalSales = useMemo(() => {
    return sales
      .filter(sale => !!sale.check_out_time) 
      .reduce((sum, sale) => {
        const amount = sale.took_package ? sale.package_amount : sale.amount_paid;
        return sum + (amount || 0);
    }, 0);
  }, [sales]);
  
  const completedSalesCount = useMemo(() => {
    return sales.filter(s => !!s.check_out_time).length;
  }, [sales]);

  // --- Export (no change) ---
  const handleExport = async () => {
    // ... (export logic is correct)
  };

  // --- Handlers for live updates ---
  const handleRoomInputChange = (id: string, room: string) => {
    setRoomInputs(prev => ({ ...prev, [id]: room }));
  };
  const handleRoomSave = async (id: string, room: string) => {
    if (!room) return;
    await supabase.from('customers').update({ room }).eq('id', id);
    fetchSales(); 
  };
  const handleTherapistInputChange = (id: string, name: string) => {
    setTherapistInputs(prev => ({ ...prev, [id]: name }));
  };
  const handleTherapistSave = async (id: string, therapistName: string) => {
    if (!therapistName) return;
    await supabase.from('customers').update({ therapist_name: therapistName }).eq('id', id);
    fetchSales(); 
  };
  
  // --- NEW: Handler to manually set check-in time ---
  const handleCheckIn = async (id: string) => {
    if (!confirm('Are you sure you want to check in this client? This confirms their UPI payment.')) return;
    await supabase
      .from('customers')
      .update({ check_in_time: new Date().toISOString() })
      .eq('id', id);
    fetchSales(); // Refresh data
  };

  const handleCheckOut = async (id: string) => {
    if (!confirm('Are you sure you want to check out this client?')) return;
    await supabase
      .from('customers')
      .update({ check_out_time: new Date().toISOString() })
      .eq('id', id);
    fetchSales(); 
  };
  
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-800">Admin Live Dashboard & Sales</h1>

      {/* Filter Bar (no change) */}
      <div className="bg-white p-4 rounded-xl shadow-sm grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
        {/* ... (all filters and export button) ... */}
      </div>

      {/* Total Sales Card (no change) */}
      <div className="bg-white p-6 rounded-xl shadow-sm">
        {/* ... (total sales display) ... */}
      </div>

      {/* --- Sales Table (Updated) --- */}
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
                  <tr key={sale.id} className={sale.check_out_time ? 'bg-gray-50 opacity-60' : (sale.check_in_time ? 'bg-white' : 'bg-yellow-50')}>
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
                    
                    {/* --- FIX: Updated Check-in Column --- */}
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {sale.check_in_time ? (
                        formatTime(sale.check_in_time)
                      ) : (
                        <button
                          onClick={() => handleCheckIn(sale.id)}
                          className="px-3 py-1 bg-green-500 text-white text-xs rounded-lg hover:bg-green-600 font-medium"
                        >
                          Check In
                        </button>
                      )}
                    </td>
                    
                    {/* Therapist Column (no change) */}
                    <td className="px-6 py-4 whitespace-nowrap">
                      {/* ... (therapist input/save logic) ... */}
                    </td>

                    {/* Room Column (no change) */}
                    <td className="px-6 py-4 whitespace-nowrap">
                      {/* ... (room input/save logic) ... */}
                    </td>
                    
                    {/* --- FIX: Updated Check-out Column --- */}
                    <td className="px-6 py-4 whitespace-nowrap">
                      {sale.check_out_time ? (
                        <span className="text-sm text-gray-500">{formatTime(sale.check_out_time)}</span>
                      ) : sale.check_in_time ? ( // Only show if checked in
                        <button
                          onClick={() => handleCheckOut(sale.id)}
                          className="px-3 py-1 bg-red-500 text-white text-sm rounded-lg hover:bg-red-600"
                        >
                          Check Out
                        </button>
                      ) : (
                        <span className="text-xs text-gray-400">Pending</span>
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