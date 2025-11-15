'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { OUTLETS } from '@/lib/outlet';
import { exportToExcel } from '@/lib/exportToExcel';

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
  payment_method: string | null;
};

const formatCurrency = (amountInPaise: number) =>
  new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amountInPaise / 100);

const formatTime = (dateString: string | null) => {
  if (!dateString) return '—';
  
  const date = new Date(dateString);
  
  if (isNaN(date.getTime())) {
    console.warn('Invalid date string passed to formatTime:', dateString);
    return 'Invalid Date';
  }

  return date.toLocaleTimeString('en-IN', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });
};

const getExpectedCheckoutTime = (checkIn: string | null, hours: number | null): Date | null => {
  if (!checkIn || !hours || hours <= 0) {
    return null;
  }
  const checkInDate = new Date(checkIn);
  const durationInMs = hours * 60 * 60 * 1000;
  return new Date(checkInDate.getTime() + durationInMs);
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

const formatPaymentMethod = (method: string | null) => {
  if (!method) return 'N/A';
  if (method === 'card') return 'UPI / Card';
  if (method === 'cash') return 'Cash';
  if (method === 'package') return 'Package';
  return method.charAt(0).toUpperCase() + method.slice(1);
};

const getToday = () => new Date().toISOString().split('T')[0];

export default function AdminSalesPage() {
  const [sales, setSales] = useState<Sale[]>([]);
  const [loading, setLoading] = useState(true);
  const [isExporting, setIsExporting] = useState(false);

  const [startDate, setStartDate] = useState(getToday);
  const [endDate, setEndDate] = useState(getToday);
  const [selectedOutletId, setSelectedOutletId] = useState('all');

  const [roomInputs, setRoomInputs] = useState<{ [key: string]: string }>({});
  const [therapistInputs, setTherapistInputs] = useState<{ [key: string]: string }>({});

  const fetchSales = useCallback(async () => {
    try {
      let query = supabase
        .from('customers')
        .select(
          'id, date, name, mobile, treatment, session_hours, amount_paid, took_package, package_amount, check_in_time, check_out_time, room, therapist_name, outlet_name, package_sold_by, payment_method'
        )
        .gte('date', startDate)
        .lte('date', endDate)
        .order('check_in_time', { ascending: false, nullsFirst: false });

      if (selectedOutletId !== 'all') {
        query = query.eq('outlet_id', selectedOutletId);
      }

      const { data, error } = await query;
      if (error) throw error;

      setSales(data || []);

      const initialRooms: { [key: string]: string } = {};
      const initialTherapists: { [key: string]: string } = {};
      (data || []).forEach((sale: any) => {
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

  useEffect(() => {
    const channel = supabase
      .channel('admin-sales-channel')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'customers' },
        (payload) => {
          console.log('Change detected in customers table, refreshing sales...', payload);
          fetchSales();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchSales]);

  const activeSales = useMemo(() => {
    return sales.filter((sale) => !!sale.check_out_time);
  }, [sales]);
  
  const totalSales = useMemo(() => {
    return activeSales.reduce((sum, sale) => {
        const amount = sale.took_package ? sale.package_amount : sale.amount_paid;
        return sum + (amount || 0);
      }, 0);
  }, [activeSales]);

  const totalCashSales = useMemo(() => {
    return activeSales
      .filter((sale) => sale.payment_method === 'cash')
      .reduce((sum, sale) => sum + (sale.amount_paid || 0), 0);
  }, [activeSales]);

  const totalUpiSales = useMemo(() => {
    return activeSales
      .filter((sale) => sale.payment_method === 'card')
      .reduce((sum, sale) => sum + (sale.amount_paid || 0), 0);
  }, [activeSales]);

  const totalPackageSales = useMemo(() => {
    return activeSales
      .filter((sale) => sale.payment_method === 'package' || sale.took_package)
      .reduce((sum, sale) => sum + (sale.package_amount || 0), 0);
  }, [activeSales]);

  const activeSalesCount = useMemo(() => activeSales.length, [activeSales]);

  const handleExport = async () => {
    setIsExporting(true);
    try {
      let query = supabase
        .from('customers')
        .select(
          'id, date, name, mobile, treatment, session_hours, amount_paid, took_package, package_amount, check_in_time, check_out_time, therapist_name, outlet_name, package_sold_by, room, payment_method'
        )
        .gte('date', startDate)
        .lte('date', endDate)
        .order('date', { ascending: false });

      if (selectedOutletId !== 'all') {
        query = query.eq('outlet_id', selectedOutletId);
      }

      const { data, error } = await query;
      if (error) throw error;
      if (!data || data.length === 0) {
        alert('No data to export for this period.');
        setIsExporting(false);
        return;
      }

      const dataToExport = data.map((sale: any) => ({
        Date: new Date(sale.date).toLocaleDateString('en-IN'),
        Outlet: sale.outlet_name,
        'Customer Name': sale.name,
        Mobile: sale.mobile,
        Service: sale.took_package ? 'New Package' : sale.treatment,
        'Amount (INR)': (sale.took_package ? sale.package_amount : sale.amount_paid) / 100,
        'Payment Method': formatPaymentMethod(sale.payment_method),
        Duration: formatDuration(sale.session_hours),
        'Sold By': sale.package_sold_by || 'N/A',
        Therapist: sale.therapist_name || 'N/A',
        Room: sale.room || 'N/A',
        'Check-in Time': formatTime(sale.check_in_time),
        'Check-out Time': formatTime(sale.check_out_time),
      }));

      const outletName =
        selectedOutletId === 'all' ? 'AllOutlets' : OUTLETS.find((o) => o.id === selectedOutletId)?.name || 'Outlet';
      const fileName = `Sales_${outletName}_${startDate}_to_${endDate}.xlsx`;

      exportToExcel(dataToExport, fileName);
    } catch (err: any) {
      console.error('Error exporting data:', err);
      alert(`Error exporting: ${err.message}`);
    } finally {
      setIsExporting(false);
    }
  };

  const handleRoomInputChange = (id: string, room: string) => {
    setRoomInputs((prev) => ({ ...prev, [id]: room }));
  };
  const handleRoomSave = async (id: string, room: string) => {
    if (!room) return;
    await supabase.from('customers').update({ room }).eq('id', id);
  };
  const handleTherapistInputChange = (id: string, name: string) => {
    setTherapistInputs((prev) => ({ ...prev, [id]: name }));
  };
  const handleTherapistSave = async (id: string, therapistName: string) => {
    if (!therapistName) return;
    await supabase.from('customers').update({ therapist_name: therapistName }).eq('id', id);
  };
  
  const handleCheckOut = async (id: string) => {
    if (!confirm('Are you sure you want to check out this client?')) return;
    await supabase.from('customers').update({ check_out_time: new Date().toISOString() }).eq('id', id);
  };

  // --- NEW: Delete Function ---
  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to PERMANENTLY DELETE this sale? This action cannot be undone.')) return;
    try {
      const { error } = await supabase.from('customers').delete().eq('id', id);
      if (error) throw error;
      // No need to call fetchSales(), realtime listener will handle it.
    } catch (err: any) {
      console.error('Error deleting sale:', err);
      alert(`Error deleting sale: ${err.message}`);
    }
  };

  return (
    <div className="space-y-6">
      
      <h1 className="text-2xl font-bold text-gray-800">Admin Live Dashboard & Sales</h1>

      {/* Filter Bar (Responsive) */}
      <div className="bg-white p-4 rounded-xl shadow-sm grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 items-end">
        <div>
          <label htmlFor="outlet" className="block text-sm font-medium text-gray-700 mb-1">
            Outlet
          </label>
          <select
            id="outlet"
            value={selectedOutletId}
            onChange={(e) => setSelectedOutletId(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-black bg-white"
          >
            <option value="all">All Outlets</option>
            {OUTLETS.map((outlet) => (
              <option key={outlet.id} value={outlet.id}>
                {outlet.name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="startDate" className="block text-sm font-medium text-gray-700 mb-1">
            Start Date
          </label>
          <input
            id="startDate"
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-black"
          />
        </div>

        <div>
          <label htmlFor="endDate" className="block text-sm font-medium text-gray-700 mb-1">
            End Date
          </label>
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

      {/* Total Sales Card Grid (Responsive) */}
      <div className="bg-white p-6 rounded-xl shadow-sm">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 divide-y md:divide-x lg:divide-y-0">
          {/* Total Sales */}
          <div className="py-2 md:py-0 md:px-4 first:pt-0 first:pl-0 last:pr-0">
            <h3 className="text-gray-500 text-sm font-medium">Total Active Sales (All)</h3>
            <p className="text-3xl font-bold mt-2 text-green-600">{formatCurrency(totalSales)}</p>
            <p className="text-gray-500 text-sm">{activeSalesCount} completed session(s)</p>
          </div>
          
          {/* Cash Sales */}
          <div className="py-2 md:py-0 md:px-4 first:pt-0 first:pl-0 last:pr-0">
            <h3 className="text-gray-500 text-sm font-medium">Total Cash Sales</h3>
            <p className="text-3xl font-bold mt-2 text-blue-600">{formatCurrency(totalCashSales)}</p>
            <p className="text-gray-500 text-sm">&nbsp;</p> 
          </div>

          {/* UPI/Card Sales */}
          <div className="py-2 md:py-0 md:px-4 first:pt-0 first:pl-0 last:pr-0">
            <h3 className="text-gray-500 text-sm font-medium">Total UPI/Card Sales</h3>
            <p className="text-3xl font-bold mt-2 text-purple-600">{formatCurrency(totalUpiSales)}</p>
            <p className="text-gray-500 text-sm">&nbsp;</p>
          </div>

          {/* Package Sales */}
          <div className="py-2 md:py-0 md:px-4 first:pt-0 first:pl-0 last:pr-0">
            <h3 className="text-gray-500 text-sm font-medium">Total Package Value</h3>
            <p className="text-3xl font-bold mt-2 text-gray-600">{formatCurrency(totalPackageSales)}</p>
            <p className="text-gray-500 text-sm">&nbsp;</p>
          </div>
        </div>
      </div>


      {/* Sales Table */}
      <div className="bg-white shadow rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Customer</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Outlet</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Service</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Amount</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Payment Method</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Session Time</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Therapist</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Room</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Action</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {loading ? (
                <tr>
                  <td colSpan={9} className="p-6 text-center text-gray-500">Loading...</td>
                </tr>
              ) : sales.length === 0 ? (
                <tr>
                  <td colSpan={9} className="p-6 text-center text-gray-500">No sales found for these filters.</td>
                </tr>
              ) : (
                sales.map((sale) => (
                  <tr key={sale.id} className={sale.check_out_time ? 'bg-gray-50 opacity-60' : 'bg-white'}>
                    
                    {/* --- UI FIX: Removed whitespace-nowrap to allow wrapping --- */}
                    <td className="px-6 py-4">
                      <div className="text-sm font-medium text-gray-900">{sale.name}</div>
                      <div className="text-sm text-gray-500">{sale.mobile}</div>
                    </td>
                    
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{sale.outlet_name}</td>
                    
                    {/* --- UI FIX: Removed whitespace-nowrap to allow wrapping --- */}
                    <td className="px-6 py-4 text-sm text-gray-500 max-w-xs">
                      {sale.took_package ? <span className="font-medium text-purple-700">New Package</span> : sale.treatment}
                      <div className="text-xs text-gray-400">{formatDuration(sale.session_hours)}</div>
                    </td>
                    
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-green-600">
                      {formatCurrency(sale.took_package ? sale.package_amount : sale.amount_paid)}
                    </td>
                    
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {formatPaymentMethod(sale.payment_method)}
                    </td>
                    
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      <div>
                        <span className="font-medium">In: </span>
                        {formatTime(sale.check_in_time)}
                      </div>
                      {sale.check_out_time ? (
                        <div>
                          <span className="font-medium">Out: </span>
                          {formatTime(sale.check_out_time)}
                        </div>
                      ) : (
                        (() => {
                          const expectedTime = getExpectedCheckoutTime(sale.check_in_time, sale.session_hours);
                          if (expectedTime) {
                            return (
                              <div className="text-gray-400">
                                <span className="font-medium">Est. Out: </span>
                                {formatTime(expectedTime.toISOString())}
                              </div>
                            );
                          }
                          return <div><span className="font-medium">Out: </span>—</div>;
                        })()
                      )}
                    </td>

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

                    {/* --- NEW: Action Column with Delete Button --- */}
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex flex-col gap-2 items-start">
                        {sale.check_out_time ? (
                          <span className="px-3 py-1 bg-green-100 text-green-700 text-sm rounded-full font-medium">
                            Completed
                          </span>
                        ) : (
                          <button
                            onClick={() => handleCheckOut(sale.id)}
                            className="px-3 py-1 bg-red-500 text-white text-sm rounded-lg hover:bg-red-600"
                          >
                            Check Out
                          </button>
                        )}
                        
                        {/* --- NEW: Delete Button --- */}
                        <button
                          onClick={() => handleDelete(sale.id)}
                          className="px-3 py-1 bg-red-700 text-white text-sm rounded-lg hover:bg-red-800"
                        >
                          Delete
                        </button>
                      </div>
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