'use client';

import { useState, useEffect, useCallback, useMemo, FormEvent } from 'react';
import { supabase } from '@/lib/supabase';
import { OUTLETS } from '@/lib/outlet';
import { exportToExcel } from '@/lib/exportToExcel';
import { Loader2 } from 'lucide-react';

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
  outlet_id: string; // Added for editing
  outlet_name: string;
  package_sold_by: string | null;
  payment_method: string | null;
  is_package_customer: boolean;
};

// --- Helper functions ---
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
  if (isNaN(date.getTime())) return 'Invalid Date';
  return date.toLocaleTimeString('en-IN', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });
};

const toInputDate = (dateString: string | null): string => {
  if (!dateString) return '';
  try {
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return '';
    return date.toISOString().split('T')[0];
  } catch (e) {
    return '';
  }
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
  if (method === 'card' || method === 'upi') return 'UPI / Card';
  if (method === 'cash') return 'Cash';
  if (method === 'package') return 'Package';
  return method.charAt(0).toUpperCase() + method.slice(1);
};

const formatService = (sale: Sale) => {
  if (sale.took_package) {
    return (
      <>
        <span className="font-medium text-purple-700">New Package</span>
        <div className="text-gray-500 truncate" title={sale.treatment}>{sale.treatment}</div>
      </>
    );
  }
  if (sale.is_package_customer) {
     return (
      <>
        <span className="font-medium text-yellow-600">Package Redemption</span>
        <div className="text-gray-500 truncate" title={sale.treatment}>{sale.treatment}</div>
      </>
    );
  }
  return <span className="text-gray-900" title={sale.treatment}>{sale.treatment}</span>;
};

const getToday = () => new Date().toISOString().split('T')[0];

export default function AdminSalesPage() {
  const [sales, setSales] = useState<Sale[]>([]);
  const [loading, setLoading] = useState(true);
  const [isExporting, setIsExporting] = useState(false);

  const [startDate, setStartDate] = useState(getToday);
  const [endDate, setEndDate] = useState(getToday);
  const [selectedOutletId, setSelectedOutletId] = useState('all');

  // --- Edit Modal State ---
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editingSale, setEditingSale] = useState<Sale | null>(null);
  const [editForm, setEditForm] = useState<any>({});
  const [editPassword, setEditPassword] = useState('');
  const [saveError, setSaveError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const fetchSales = useCallback(async () => {
    try {
      let query = supabase
        .from('customers')
        .select(
          // Added outlet_id to selection
          'id, date, name, mobile, treatment, session_hours, amount_paid, took_package, is_package_customer, package_amount, check_in_time, check_out_time, room, therapist_name, outlet_name, outlet_id, package_sold_by, payment_method'
        )
        .gte('date', startDate)
        .lte('date', endDate)
        .order('check_in_time', { ascending: false, nullsFirst: false });

      if (selectedOutletId !== 'all') {
        query = query.eq('outlet_id', selectedOutletId);
      }

      const { data, error } = await query;
      if (error) throw error;

      setSales((data as Sale[]) || []);
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
      .reduce((sum, sale) => {
        const amount = sale.took_package ? sale.package_amount : sale.amount_paid;
        return sum + (amount || 0);
      }, 0);
  }, [activeSales]);

  const totalUpiSales = useMemo(() => {
    return activeSales
      .filter((sale) => sale.payment_method === 'card' || sale.payment_method === 'upi')
      .reduce((sum, sale) => {
        const amount = sale.took_package ? sale.package_amount : sale.amount_paid;
        return sum + (amount || 0);
      }, 0);
  }, [activeSales]);

  const totalPackageSales = useMemo(() => {
    return activeSales
      .filter((sale) => sale.took_package)
      .reduce((sum, sale) => {
        return sum + (sale.package_amount || 0);
      }, 0);
  }, [activeSales]);

  const activeSalesCount = useMemo(() => activeSales.length, [activeSales]);

  const handleExport = async () => {
    setIsExporting(true);
    try {
      let query = supabase
        .from('customers')
        .select(
          'id, date, name, mobile, treatment, session_hours, amount_paid, took_package, is_package_customer, package_amount, check_in_time, check_out_time, therapist_name, outlet_name, package_sold_by, room, payment_method'
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

      const dataToExport = data.map((sale: any) => {
        let service = sale.treatment;
        if (sale.took_package) {
          service = `New Package - ${sale.treatment}`;
        } else if (sale.is_package_customer) {
          service = `Package Redemption - ${sale.treatment}`;
        }

        return {
          Date: new Date(sale.date).toLocaleDateString('en-IN'),
          Outlet: sale.outlet_name,
          'Customer Name': sale.name,
          Mobile: sale.mobile,
          Service: service,
          'Amount (INR)': (sale.took_package ? sale.package_amount : sale.amount_paid) / 100,
          'Payment Method': formatPaymentMethod(sale.payment_method),
          Duration: formatDuration(sale.session_hours),
          'Sold By': sale.package_sold_by || 'N/A',
          Therapist: sale.therapist_name || 'N/A',
          Room: sale.room || 'N/A',
          'Check-in Time': formatTime(sale.check_in_time),
          'Check-out Time': formatTime(sale.check_out_time),
        };
      });

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

  const handleCheckOut = async (id: string) => {
    if (!confirm('Are you sure you want to check out this client?')) return;
    await supabase.from('customers').update({ check_out_time: new Date().toISOString() }).eq('id', id);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to PERMANENTLY DELETE this sale? This action cannot be undone.')) return;
    try {
      const { error } = await supabase.from('customers').delete().eq('id', id);
      if (error) throw error;
    } catch (err: any) {
      console.error('Error deleting sale:', err);
      alert(`Error deleting sale: ${err.message}`);
    }
  };

  // --- Edit Modal Logic ---
  const handleOpenEdit = (sale: Sale) => {
    setEditingSale(sale);
    setEditForm({
      name: sale.name,
      mobile: sale.mobile,
      outlet_id: sale.outlet_id,
      treatment: sale.treatment,
      // Convert to Rupees for editing
      amount: (sale.took_package ? sale.package_amount : sale.amount_paid) / 100,
      payment_method: sale.payment_method,
      date: toInputDate(sale.date),
      therapist_name: sale.therapist_name || '',
      room: sale.room || '',
      session_hours: sale.session_hours || 0,
    });
    setEditPassword('');
    setSaveError(null);
    setIsEditModalOpen(true);
  };

  const handleCloseEdit = () => {
    setIsEditModalOpen(false);
    setEditingSale(null);
    setSaveError(null);
  };

  const handleSaveEdit = async (e: FormEvent) => {
    e.preventDefault();
    setSaveError(null);

    if (editPassword !== 'admin123') { // Hardcoded password check
      setSaveError('Incorrect Admin Password');
      return;
    }

    setIsSaving(true);
    try {
      // Find outlet name from ID to keep DB consistent
      const outlet = OUTLETS.find(o => o.id === editForm.outlet_id);
      const outlet_name = outlet ? outlet.name : 'Unknown';

      // Calculate amount (convert back to paise)
      const amountInPaise = Number(editForm.amount) * 100;
      
      const updates: any = {
        name: editForm.name,
        mobile: editForm.mobile,
        outlet_id: editForm.outlet_id,
        outlet_name: outlet_name,
        treatment: editForm.treatment,
        payment_method: editForm.payment_method,
        date: editForm.date,
        therapist_name: editForm.therapist_name || null,
        room: editForm.room || null,
        session_hours: editForm.session_hours,
      };

      // Update the correct amount field based on sale type
      if (editingSale?.took_package) {
        updates.package_amount = amountInPaise;
        // Don't touch amount_paid, it stays 0 for packages
      } else {
        updates.amount_paid = amountInPaise;
        // Don't touch package_amount
      }

      const { error } = await supabase
        .from('customers')
        .update(updates)
        .eq('id', editingSale?.id);

      if (error) throw error;

      // Refresh data to update totals immediately
      await fetchSales();
      handleCloseEdit();
    } catch (err: any) {
      console.error('Update failed:', err);
      setSaveError(err.message || 'Failed to update sale.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      
      <h1 className="text-2xl font-bold text-gray-800">Admin Live Dashboard & Sales</h1>

      {/* Filters */}
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
            onClick={handleExport as any}
            disabled={loading || isExporting}
            className="w-full px-4 py-2 bg-green-600 text-white font-medium rounded-lg hover:bg-green-700 disabled:opacity-50"
          >
            {isExporting ? 'Exporting...' : 'Export to Excel'}
          </button>
        </div>
      </div>

      {/* Totals Cards */}
      <div className="bg-white p-6 rounded-xl shadow-sm">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          
          <div className="border-b border-gray-200 md:border-b-0 md:border-r md:pr-6">
            <h3 className="text-gray-500 text-sm font-medium">Total Completed Sales</h3>
            <p className="text-3xl font-bold mt-2 text-green-600">{formatCurrency(totalSales)}</p>
            <p className="text-gray-500 text-sm">{activeSalesCount} completed session(s)</p>
          </div>
          
          <div className="border-b border-gray-200 md:border-b-0 md:border-r md:pr-6 pt-4 md:pt-0">
            <h3 className="text-gray-500 text-sm font-medium">Total Cash Sales</h3>
            <p className="text-3xl font-bold mt-2 text-blue-600">{formatCurrency(totalCashSales)}</p>
            <p className="text-gray-500 text-sm">&nbsp;</p> 
          </div>

          <div className="border-b border-gray-200 md:border-b-0 md:border-r md:pr-6 pt-4 md:pt-0">
            <h3 className="text-gray-500 text-sm font-medium">Total UPI/Card Sales</h3>
            <p className="text-3xl font-bold mt-2 text-purple-600">{formatCurrency(totalUpiSales)}</p>
            <p className="text-gray-500 text-sm">&nbsp;</p>
          </div>

          <div className="pt-4 md:pt-0">
            <h3 className="text-gray-500 text-sm font-medium">Total Package Value Sold</h3>
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
                <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Customer</th>
                <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Outlet</th>
                <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Sale Date</th>
                <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Service</th>
                <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Amount</th>
                <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Payment Method</th>
                <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Session Time</th>
                <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Therapist</th>
                <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Room</th>
                <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Action</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {loading ? (
                <tr>
                  <td colSpan={10} className="p-6 text-center text-gray-500">Loading...</td>
                </tr>
              ) : sales.length === 0 ? (
                <tr>
                  <td colSpan={10} className="p-6 text-center text-gray-500">No sales found for these filters.</td>
                </tr>
              ) : (
                sales.map((sale) => (
                  <tr key={sale.id} className={sale.check_out_time ? 'bg-gray-50 opacity-60' : 'bg-white'}>
                    
                    <td className="px-3 py-2">
                      <div className="text-xs font-medium text-gray-900">{sale.name}</div>
                      <div className="text-xs text-gray-500">{sale.mobile}</div>
                    </td>
                    
                    <td className="px-3 py-2 text-xs font-medium text-gray-900">{sale.outlet_name}</td>
                    
                    <td className="px-3 py-2 text-xs font-medium text-gray-900">{toInputDate(sale.date)}</td>
                    
                    <td className="px-3 py-2 text-xs max-w-xs">
                      {formatService(sale)}
                      <div className="text-xs text-gray-400">{formatDuration(sale.session_hours)}</div>
                    </td>
                    
                    <td className="px-3 py-2 text-xs font-medium text-green-600">
                      {formatCurrency(sale.took_package ? sale.package_amount : sale.amount_paid)}
                    </td>
                    
                    <td className="px-3 py-2 text-xs text-gray-500">
                      {formatPaymentMethod(sale.payment_method)}
                    </td>
                    
                    <td className="px-3 py-2 text-xs text-gray-500">
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

                    <td className="px-3 py-2 text-xs text-gray-500">{sale.therapist_name || '—'}</td>

                    <td className="px-3 py-2 text-xs text-gray-500">{sale.room || '—'}</td>

                    <td className="px-3 py-2">
                      <div className="flex flex-row gap-2 items-center">
                        {/* --- EDIT BUTTON --- */}
                        <button
                          onClick={() => handleOpenEdit(sale)}
                          className="px-3 py-1 bg-blue-100 text-blue-700 text-xs rounded-lg hover:bg-blue-200"
                        >
                          Edit
                        </button>

                        {!sale.check_out_time && (
                          <button
                            onClick={() => handleCheckOut(sale.id)}
                            className="px-3 py-1 bg-green-600 text-white text-xs rounded-lg hover:bg-green-700"
                          >
                            Check Out
                          </button>
                        )}
                        
                        <button
                          onClick={() => handleDelete(sale.id)}
                          className="px-3 py-1 bg-red-700 text-white text-xs rounded-lg hover:bg-red-800"
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

      {/* --- Edit Sale Modal --- */}
      {isEditModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <form onSubmit={handleSaveEdit} className="bg-white rounded-xl shadow-xl w-full max-w-lg p-6 space-y-4 max-h-[90vh] overflow-y-auto">
            <h2 className="text-xl font-bold text-gray-800 border-b pb-2">Edit Sale Details</h2>
            
            {saveError && <div className="p-3 bg-red-100 text-red-700 rounded-lg border border-red-200 text-sm">{saveError}</div>}

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-semibold text-gray-500 uppercase">Name</label>
                <input type="text" value={editForm.name} onChange={e => setEditForm({...editForm, name: e.target.value})} className="w-full p-2 border rounded text-black" required />
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-500 uppercase">Mobile</label>
                <input type="text" value={editForm.mobile} onChange={e => setEditForm({...editForm, mobile: e.target.value})} className="w-full p-2 border rounded text-black" required />
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-500 uppercase">Outlet</label>
                <select value={editForm.outlet_id} onChange={e => setEditForm({...editForm, outlet_id: e.target.value})} className="w-full p-2 border rounded bg-white text-black">
                  {OUTLETS.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-500 uppercase">Date</label>
                <input type="date" value={editForm.date} onChange={e => setEditForm({...editForm, date: e.target.value})} className="w-full p-2 border rounded text-black" required />
              </div>
            </div>

            <div>
              <label className="text-xs font-semibold text-gray-500 uppercase">Treatment / Service</label>
              <input type="text" value={editForm.treatment} onChange={e => setEditForm({...editForm, treatment: e.target.value})} className="w-full p-2 border rounded text-black" required />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-semibold text-gray-500 uppercase">Amount (₹)</label>
                <input type="number" value={editForm.amount} onChange={e => setEditForm({...editForm, amount: e.target.value})} className="w-full p-2 border rounded text-black" required />
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-500 uppercase">Payment Method</label>
                <select value={editForm.payment_method} onChange={e => setEditForm({...editForm, payment_method: e.target.value})} className="w-full p-2 border rounded bg-white text-black">
                  <option value="cash">Cash</option>
                  <option value="card">UPI / Card</option>
                  <option value="package">Package Redemption</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className="text-xs font-semibold text-gray-500 uppercase">Therapist</label>
                <input type="text" value={editForm.therapist_name} onChange={e => setEditForm({...editForm, therapist_name: e.target.value})} className="w-full p-2 border rounded text-black" />
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-500 uppercase">Room</label>
                <input type="text" value={editForm.room} onChange={e => setEditForm({...editForm, room: e.target.value})} className="w-full p-2 border rounded text-black" />
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-500 uppercase">Duration (Hrs)</label>
                <input type="number" step="0.1" value={editForm.session_hours} onChange={e => setEditForm({...editForm, session_hours: e.target.value})} className="w-full p-2 border rounded text-black" />
              </div>
            </div>

            <div className="pt-4 border-t mt-4">
              <label className="text-xs font-bold text-red-600 uppercase block mb-1">Admin Password Required</label>
              <input 
                type="password" 
                placeholder="Enter admin123" 
                value={editPassword} 
                onChange={e => setEditPassword(e.target.value)} 
                className="w-full p-2 border border-red-200 rounded text-black focus:border-red-500 focus:ring-1 focus:ring-red-500"
              />
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <button type="button" onClick={handleCloseEdit} className="px-4 py-2 bg-gray-200 rounded hover:bg-gray-300 text-gray-800">Cancel</button>
              <button type="submit" disabled={isSaving} className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2">
                {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Save Changes'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
