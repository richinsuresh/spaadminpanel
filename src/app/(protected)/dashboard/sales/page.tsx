// ===========================
// ADMIN SALES PAGE - FIXED / IMPROVED
// ===========================

'use client';

import React, { useState, useEffect, useCallback, useMemo, FormEvent } from 'react';
import { supabase } from '@/lib/supabase';
import { OUTLETS } from '@/lib/outlet';
import { exportToExcel } from '@/lib/exportToExcel';
import { Loader2 } from 'lucide-react';
import { useActivityLog } from '@/hooks/useActivityLog';
import LastAction from '@/components/LastAction';

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
  outlet_id: string;
  outlet_name: string;
  package_sold_by: string | null;
  payment_method: string | null;
  is_package_customer: boolean;
};

// Helpers
const formatCurrency = (v: number) =>
  new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(v / 100);

const formatTime = (d: string | null) => {
  if (!d) return '—';
  const dt = new Date(d);
  if (isNaN(dt.getTime())) return 'Invalid';
  return dt.toLocaleTimeString('en-IN', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });
};

const toInputTime = (d: string | null) => {
  if (!d) return '';
  try {
    const t = new Date(d);
    if (isNaN(t.getTime())) return '';
    return t.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  } catch {
    return '';
  }
};

const toInputDate = (d: string | null): string => {
  if (!d) return '';
  try {
    const dt = new Date(d);
    if (isNaN(dt.getTime())) return '';
    return dt.toISOString().split('T')[0];
  } catch {
    return '';
  }
};

const getExpectedCheckoutTime = (inTime: string | null, hrs: number | null) => {
  if (!inTime || !hrs || hrs <= 0) return null;
  const dt = new Date(inTime);
  if (isNaN(dt.getTime())) return null;
  return new Date(dt.getTime() + hrs * 60 * 60 * 1000);
};

const formatDuration = (h: number | null) => {
  if (!h || h === 0) return '—';
  if (h < 1) return `${Math.round(h * 60)} mins`;
  const hours = Math.floor(h);
  const mins = Math.round((h % 1) * 60);
  if (mins === 0) return `${hours} hr${hours > 1 ? 's' : ''}`;
  return `${hours}hr ${mins}m`;
};

const formatPaymentMethod = (m: string | null) => {
  if (!m) return 'N/A';
  if (m === 'card') return 'Card';
  if (m === 'upi') return 'UPI';
  if (m === 'cash') return 'Cash';
  if (m === 'package') return 'Package';
  return m.charAt(0).toUpperCase() + m.slice(1);
};

const formatService = (sale: Sale) => {
  if (sale.took_package)
    return (
      <>
        <span className="font-medium text-purple-700">New Package</span>
        <div className="text-gray-500 truncate">{sale.treatment}</div>
      </>
    );
  if (sale.is_package_customer)
    return (
      <>
        <span className="font-medium text-yellow-600">Package Redemption</span>
        <div className="text-gray-500 truncate">{sale.treatment}</div>
      </>
    );
  return <span className="text-gray-900">{sale.treatment}</span>;
};

const getToday = () => new Date().toISOString().split('T')[0];

export default function AdminSalesPage() {
  const { logActivity } = useActivityLog();

  const [sales, setSales] = useState<Sale[]>([]);
  const [loading, setLoading] = useState(true);
  const [isExporting, setIsExporting] = useState(false);

  const [startDate, setStartDate] = useState<string>(getToday());
  const [endDate, setEndDate] = useState<string>(getToday());
  const [selectedOutletId, setSelectedOutletId] = useState<string>('all');

  // EDIT STATES
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editingSale, setEditingSale] = useState<Sale | null>(null);

  // keep a well-typed edit form with defaults so inputs are controlled
  const [editForm, setEditForm] = useState<{
    name: string;
    mobile: string;
    date: string;
    outlet_id: string;
    treatment: string;
    payment_method: string;
    amount: number | '';
    therapist_name: string;
    room: string;
    session_hours: number | '';
    check_in_time: string;
  }>({
    name: '',
    mobile: '',
    date: '',
    outlet_id: OUTLETS[0]?.id || 'unknown',
    treatment: '',
    payment_method: 'cash',
    amount: '',
    therapist_name: '',
    room: '',
    session_hours: '',
    check_in_time: '',
  });

  const [editPassword, setEditPassword] = useState('');
  const [editRemark, setEditRemark] = useState(''); // REQUIRED
  const [saveError, setSaveError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  // DELETE STATES
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [deletePassword, setDeletePassword] = useState('');
  const [deleteRemark, setDeleteRemark] = useState('');
  const [deleteError, setDeleteError] = useState('');
  const [selectedSaleForDelete, setSelectedSaleForDelete] = useState<Sale | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Fetch Sales
  const fetchSales = useCallback(async () => {
    setLoading(true);
    try {
      let query = supabase
        .from('customers')
        .select(
          'id, date, name, mobile, treatment, session_hours, amount_paid, took_package, is_package_customer, package_amount, check_in_time, check_out_time, room, therapist_name, outlet_name, outlet_id, package_sold_by, payment_method'
        )
        .gte('date', startDate)
        .lte('date', endDate)
        .order('check_in_time', { ascending: false });

      if (selectedOutletId !== 'all') {
        query = query.eq('outlet_id', selectedOutletId);
      }

      const { data, error } = await query;
      if (error) {
        // supabase sometimes returns error as an object — stringify so we get message in logs
        console.error('Supabase error fetching customers:', JSON.stringify(error));
        throw error;
      }

      // Defensive: ensure data is an array
      const rows = Array.isArray(data) ? data : [];

      setSales(rows as Sale[]);
    } catch (err: any) {
      console.error('Error fetching sales:', err?.message ?? err);
      // show a friendly message (don't crash the UI)
      alert('Error fetching sales. Check console for details.');
    } finally {
      setLoading(false);
    }
  }, [startDate, endDate, selectedOutletId]);

  // Auto fetch
  useEffect(() => {
    fetchSales();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetchSales]);

  // Real-time updates
  useEffect(() => {
    // guard: only create channel if supabase realtime is available
    try {
      const channel = supabase
        .channel('admin-sales-channel')
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'customers' },
          () => fetchSales()
        )
        .subscribe();

      return () => {
        // unsubscribe safely
        try {
          // channel.unsubscribe might be the API depending on supabase client version
          // try both patterns to be robust
          if ((channel as any).unsubscribe) (channel as any).unsubscribe();
          else if ((supabase as any).removeChannel) (supabase as any).removeChannel(channel);
        } catch (e) {
          // ignore cleanup errors
          console.warn('Realtime cleanup error', e);
        }
      };
    } catch (e) {
      console.warn('Failed to subscribe to realtime updates', e);
      return;
    }
  }, [fetchSales]);

  // Sales calculations
  const activeSales = useMemo(() => sales.filter((s) => !!s.check_out_time), [sales]);

  const totalSales = useMemo(
    () =>
      activeSales.reduce((a, s) => {
        const amount = s.took_package ? s.package_amount : s.amount_paid;
        return a + (amount || 0);
      }, 0),
    [activeSales]
  );

  const totalCashSales = useMemo(
    () =>
      activeSales
        .filter((s) => s.payment_method === 'cash')
        .reduce((a, s) => a + (s.took_package ? s.package_amount : s.amount_paid), 0),
    [activeSales]
  );

  const totalUpiSales = useMemo(
    () =>
      activeSales
        .filter((s) => s.payment_method === 'upi')
        .reduce((a, s) => a + (s.took_package ? s.package_amount : s.amount_paid), 0),
    [activeSales]
  );

  const totalCardSales = useMemo(
    () =>
      activeSales
        .filter((s) => s.payment_method === 'card')
        .reduce((a, s) => a + (s.took_package ? s.package_amount : s.amount_paid), 0),
    [activeSales]
  );

  const totalPackageSales = useMemo(
    () =>
      activeSales.filter((s) => s.took_package).reduce((a, s) => a + (s.package_amount || 0), 0),
    [activeSales]
  );

  const activeSalesCount = useMemo(() => activeSales.length, [activeSales]);

  // EXPORT
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
      if (error) {
        console.error('Supabase export error:', JSON.stringify(error));
        throw error;
      }

      const rows = Array.isArray(data) ? data : [];

      if (!rows || rows.length === 0) {
        alert('No data to export for this period.');
        setIsExporting(false);
        return;
      }

      const dataToExport = rows.map((sale: any) => {
        let serviceName = sale.treatment;
        if (sale.took_package) serviceName = `New Package - ${sale.treatment}`;
        else if (sale.is_package_customer) serviceName = `Package Redemption - ${sale.treatment}`;

        return {
          Date: new Date(sale.date).toLocaleDateString('en-IN'),
          Outlet: sale.outlet_name,
          'Customer Name': sale.name,
          Mobile: sale.mobile,
          Service: serviceName,
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
      logActivity('export_sales', `Downloaded Excel Report (${fileName})`);
    } catch (e: any) {
      console.error(e);
      alert(e?.message ?? 'Export failed.');
    } finally {
      setIsExporting(false);
    }
  };

  // CHECKOUT
  const handleCheckOut = async (id: string) => {
    if (!confirm('Are you sure you want to check out this client?')) return;
    try {
      const { error } = await supabase
        .from('customers')
        .update({ check_out_time: new Date().toISOString() })
        .eq('id', id);

      if (error) throw error;

      await fetchSales();
    } catch (err: any) {
      console.error('Checkout error', err);
      alert('Failed to check out.');
    }
  };

  // DELETE — WITH REMARK & PASSWORD
  const handleDelete = async () => {
    if (!selectedSaleForDelete) return;

    if (deletePassword !== 'admin123') {
      setDeleteError('Incorrect admin password');
      return;
    }

    if (!deleteRemark.trim()) {
      setDeleteError('Please enter a reason for deleting this sale');
      return;
    }

    setIsDeleting(true);
    try {
      const { error } = await supabase.from('customers').delete().eq('id', selectedSaleForDelete.id);

      if (error) throw error;

      logActivity('delete_sale', `Deleted Sale ID: ${selectedSaleForDelete.id}. Reason: ${deleteRemark}`);

      setIsDeleteModalOpen(false);
      setSelectedSaleForDelete(null);
      await fetchSales();
    } catch (err: any) {
      setDeleteError(err?.message ?? 'Delete failed');
    } finally {
      setIsDeleting(false);
    }
  };

  // OPEN EDIT
  const handleOpenEdit = (sale: Sale) => {
    setEditingSale(sale);
    setEditForm({
      name: sale.name || '',
      mobile: sale.mobile || '',
      date: toInputDate(sale.date),
      outlet_id: sale.outlet_id || OUTLETS[0]?.id || 'unknown',
      treatment: sale.treatment || '',
      payment_method: sale.payment_method || 'cash',
      amount: (sale.took_package ? sale.package_amount : sale.amount_paid) / 100,
      therapist_name: sale.therapist_name || '',
      room: sale.room || '',
      session_hours: sale.session_hours ?? '',
      check_in_time: toInputTime(sale.check_in_time),
    });
    setEditPassword('');
    setEditRemark('');
    setSaveError(null);
    setIsEditModalOpen(true);
  };

  const handleCloseEdit = () => {
    setIsEditModalOpen(false);
    setEditingSale(null);
    setSaveError(null);
  };

  // EDIT FORM CHANGE - generic handler
  const handleEditFormChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setEditForm((prev) => ({ ...prev, [name]: name === 'amount' || name === 'session_hours' ? (value === '' ? '' : Number(value)) : value }));
  };

  // SAVE EDIT — REQUIRED REMARK
  const handleSaveEdit = async (e: FormEvent) => {
    e.preventDefault();
    setSaveError(null);

    if (editPassword !== 'admin123') {
      setSaveError('Incorrect Admin Password');
      return;
    }

    if (!editRemark.trim()) {
      setSaveError('Please explain what you edited');
      return;
    }

    if (!editingSale) {
      setSaveError('No sale selected to edit');
      return;
    }

    setIsSaving(true);
    try {
      const outlet = OUTLETS.find((o) => o.id === editForm.outlet_id);
      const outlet_name = outlet ? outlet.name : 'Unknown';

      let fullCheckIn = editingSale.check_in_time ?? null;
      if (editForm.check_in_time && editForm.date) {
        // ensure we build a valid ISO string
        const tentative = new Date(`${editForm.date}T${editForm.check_in_time}`);
        fullCheckIn = isNaN(tentative.getTime()) ? null : tentative.toISOString();
      }

      const amountPaise = typeof editForm.amount === 'number' && !Number.isNaN(editForm.amount) ? Math.round(editForm.amount * 100) : 0;

      const updates: any = {
        name: editForm.name,
        mobile: editForm.mobile,
        outlet_id: editForm.outlet_id,
        outlet_name,
        treatment: editForm.treatment,
        payment_method: editForm.payment_method,
        date: editForm.date,
        therapist_name: editForm.therapist_name || null,
        room: editForm.room || null,
        session_hours: typeof editForm.session_hours === 'number' ? editForm.session_hours : null,
        check_in_time: fullCheckIn,
      };

      if (editingSale.took_package) {
        updates.package_amount = amountPaise;
        updates.amount_paid = 0;
      } else {
        updates.amount_paid = amountPaise;
      }

      const { error } = await supabase.from('customers').update(updates).eq('id', editingSale.id);

      if (error) throw error;

      logActivity('edit_sale', `Edited Sale ID: ${editingSale.id}. Remark: ${editRemark}`);

      await fetchSales();
      handleCloseEdit();
    } catch (err: any) {
      setSaveError(err?.message ?? 'Save failed');
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
          <label className="block text-sm font-medium text-gray-700 mb-1">Outlet</label>

          <select
            value={selectedOutletId}
            onChange={(e) => setSelectedOutletId(e.target.value)}
            className="w-full px-3 py-2 border rounded-lg bg-white text-black focus:outline-none focus:ring-0 focus:text-black"
            aria-label="Select outlet"
          >
            <option value="all" className="text-black">All Outlets</option>
            {OUTLETS.map((o) => (
              <option key={o.id} value={o.id} className="text-black">{o.name}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Start Date</label>
          <input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="w-full px-3 py-2 border rounded-lg text-black bg-white"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">End Date</label>
          <input
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            className="w-full px-3 py-2 border rounded-lg text-black bg-white"
          />
        </div>

        <div className="flex flex-col gap-1">
          <button
            onClick={handleExport}
            disabled={loading || isExporting}
            className="w-full px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50"
          >
            {isExporting ? 'Exporting…' : 'Export to Excel'}
          </button>
          <LastAction actionType="export_sales" />
        </div>
      </div>

      {/* Totals */}
      <div className="bg-white p-6 rounded-xl shadow-sm">
        <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-6">
          <div>
            <h3 className="text-gray-500 text-sm">Total Completed Sales</h3>
            <p className="text-2xl mt-2 font-bold text-green-600">{formatCurrency(totalSales)}</p>
            <p className="text-xs text-gray-500">{activeSalesCount} sessions</p>
          </div>
          <div>
            <h3 className="text-gray-500 text-sm">Total Cash Sales</h3>
            <p className="text-2xl mt-2 font-bold text-blue-600">{formatCurrency(totalCashSales)}</p>
          </div>
          <div>
            <h3 className="text-gray-500 text-sm">Total UPI Sales</h3>
            <p className="text-2xl mt-2 font-bold text-purple-600">{formatCurrency(totalUpiSales)}</p>
          </div>
          <div>
            <h3 className="text-gray-500 text-sm">Total Card Sales</h3>
            <p className="text-2xl mt-2 font-bold text-indigo-600">{formatCurrency(totalCardSales)}</p>
          </div>
          <div>
            <h3 className="text-gray-500 text-sm">Total Package Value</h3>
            <p className="text-2xl mt-2 font-bold text-gray-600">{formatCurrency(totalPackageSales)}</p>
          </div>
        </div>
      </div>

      {/* Sales Table */}
      <div className="bg-white shadow rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-3 py-2 text-left text-xs font-bold text-gray-600 uppercase">Customer</th>
                <th className="px-3 py-2 text-left text-xs font-bold text-gray-600 uppercase">Outlet</th>
                <th className="px-3 py-2 text-left text-xs font-bold text-gray-600 uppercase">Sale Date</th>
                <th className="px-3 py-2 text-left text-xs font-bold text-gray-600 uppercase">Service</th>
                <th className="px-3 py-2 text-left text-xs font-bold text-gray-600 uppercase">Amount</th>
                <th className="px-3 py-2 text-left text-xs font-bold text-gray-600 uppercase">Payment</th>
                <th className="px-3 py-2 text-left text-xs font-bold text-gray-600 uppercase">Time</th>
                <th className="px-3 py-2 text-left text-xs font-bold text-gray-600 uppercase">Therapist</th>
                <th className="px-3 py-2 text-left text-xs font-bold text-gray-600 uppercase">Room</th>
                <th className="px-3 py-2 text-left text-xs font-bold text-gray-600 uppercase">Action</th>
              </tr>
            </thead>

            <tbody className="bg-white divide-y divide-gray-200">
              {loading ? (
                <tr>
                  <td colSpan={10} className="p-6 text-center text-gray-500">Loading…</td>
                </tr>
              ) : sales.length === 0 ? (
                <tr>
                  <td colSpan={10} className="p-6 text-center text-gray-500">No sales found.</td>
                </tr>
              ) : (
                sales.map((sale) => (
                  <tr key={sale.id} className={sale.check_out_time ? 'bg-gray-50 opacity-60' : ''}>
                    <td className="px-3 py-2 text-xs">
                      <div className="font-medium text-gray-900">{sale.name}</div>
                      <div className="text-gray-500">{sale.mobile}</div>
                    </td>

                    <td className="px-3 py-2 text-xs text-gray-900">{sale.outlet_name}</td>
                    <td className="px-3 py-2 text-xs text-gray-900">{toInputDate(sale.date)}</td>

                    <td className="px-3 py-2 text-xs max-w-xs">
                      {formatService(sale)}
                      <div className="text-gray-400">{formatDuration(sale.session_hours)}</div>
                    </td>

                    <td className="px-3 py-2 text-xs font-bold text-green-600">
                      {formatCurrency(sale.took_package ? sale.package_amount : sale.amount_paid)}
                    </td>

                    <td className="px-3 py-2 text-xs text-gray-900">{formatPaymentMethod(sale.payment_method)}</td>

                    <td className="px-3 py-2 text-xs text-gray-900">
                      <div>In: {formatTime(sale.check_in_time)}</div>
                      {sale.check_out_time ? (
                        <div>Out: {formatTime(sale.check_out_time)}</div>
                      ) : (
                        <div className="text-gray-400">
                          Est: {(() => {
                            const expected = getExpectedCheckoutTime(sale.check_in_time, sale.session_hours);
                            return expected ? formatTime(expected.toISOString()) : '—';
                          })()}
                        </div>
                      )}
                    </td>

                    <td className="px-3 py-2 text-xs text-gray-900">{sale.therapist_name || '—'}</td>
                    <td className="px-3 py-2 text-xs text-gray-900">{sale.room || '—'}</td>

                    <td className="px-3 py-2 text-xs">
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleOpenEdit(sale)}
                          className="px-3 py-1 bg-blue-100 text-blue-700 rounded-lg hover:bg-blue-200"
                        >
                          Edit
                        </button>

                        {!sale.check_out_time && (
                          <button
                            onClick={() => handleCheckOut(sale.id)}
                            className="px-3 py-1 bg-green-600 text-white rounded-lg hover:bg-green-700"
                          >
                            Check Out
                          </button>
                        )}

                        <button
                          onClick={() => {
                            setSelectedSaleForDelete(sale);
                            setDeleteError('');
                            setDeletePassword('');
                            setDeleteRemark('');
                            setIsDeleteModalOpen(true);
                          }}
                          className="px-3 py-1 bg-red-700 text-white rounded-lg hover:bg-red-800"
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

      {/* EDIT MODAL */}
      {isEditModalOpen && (
        <div className="fixed inset-0 bg-black/20 flex items-center justify-center p-4 z-50">
          <form onSubmit={handleSaveEdit} className="bg-white text-black rounded-xl w-full max-w-lg p-6 shadow-xl border border-gray-200">
            <h2 className="text-xl font-bold border-b pb-2 text-black">Edit Sale Details</h2>

            {saveError && (
              <div className="p-3 bg-red-100 text-red-700 border border-red-300 rounded">{saveError}</div>
            )}

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-semibold text-black">Name</label>
                <input type="text" name="name" value={editForm.name} onChange={handleEditFormChange} className="w-full p-2 border rounded text-black bg-white" required />
              </div>

              <div>
                <label className="text-xs font-semibold text-black">Mobile</label>
                <input type="text" name="mobile" value={editForm.mobile} onChange={handleEditFormChange} className="w-full p-2 border rounded text-black bg-white" required />
              </div>

              <div>
                <label className="text-xs font-semibold text-black">Outlet</label>
                <select name="outlet_id" value={editForm.outlet_id} onChange={handleEditFormChange} className="w-full p-2 border rounded bg-white text-black focus:text-black">
                  {OUTLETS.map((o) => (
                    <option key={o.id} value={o.id} className="text-black">{o.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-xs font-semibold text-black">Date</label>
                <input type="date" name="date" value={editForm.date} onChange={handleEditFormChange} className="w-full p-2 border rounded text-black bg-white" required />
              </div>
            </div>

            <div>
              <label className="text-xs font-semibold text-black">Treatment</label>
              <input type="text" name="treatment" value={editForm.treatment} onChange={handleEditFormChange} className="w-full p-2 border rounded text-black bg-white" required />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-semibold text-black">Amount (₹)</label>
                <input type="number" name="amount" value={editForm.amount as number | ''} onChange={handleEditFormChange} className="w-full p-2 border rounded text-black bg-white" required />
              </div>

              <div>
                <label className="text-xs font-semibold text-black">Payment Method</label>
                <select name="payment_method" value={editForm.payment_method} onChange={handleEditFormChange} className="w-full p-2 border rounded bg-white text-black">
                  <option value="cash" className="text-black">Cash</option>
                  <option value="card" className="text-black">Card</option>
                  <option value="upi" className="text-black">UPI</option>
                  <option value="package" className="text-black">Package Redemption</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className="text-xs font-semibold text-black">Therapist</label>
                <input type="text" name="therapist_name" value={editForm.therapist_name} onChange={handleEditFormChange} className="w-full p-2 border rounded text-black bg-white" />
              </div>

              <div>
                <label className="text-xs font-semibold text-black">Room</label>
                <input type="text" name="room" value={editForm.room} onChange={handleEditFormChange} className="w-full p-2 border rounded text-black bg-white" />
              </div>

              <div>
                <label className="text-xs font-semibold text-black">Duration (hrs)</label>
                <input type="number" step="0.1" name="session_hours" value={editForm.session_hours as number | ''} onChange={handleEditFormChange} className="w-full p-2 border rounded text-black bg-white" />
              </div>
            </div>

            {/* TIME */}
            <div>
              <label className="text-xs font-semibold text-black">Check-In Time</label>
              <input type="time" name="check_in_time" value={editForm.check_in_time || ''} onChange={handleEditFormChange} className="w-full p-2 border rounded text-black bg-white" />
            </div>

            {/* REQUIRED EDIT REMARK */}
            <div>
              <label className="text-xs font-semibold text-black">What did you edit? (Required)</label>
              <textarea rows={3} className="w-full p-2 border border-gray-300 rounded bg-white text-black placeholder-gray-500" value={editRemark} onChange={(e) => setEditRemark(e.target.value)} required />
            </div>

            {/* PASSWORD */}
            <div className="pt-4 border-t">
              <label className="text-xs font-bold text-black">Admin Password</label>
              <input type="password" value={editPassword} onChange={(e) => setEditPassword(e.target.value)} className="w-full p-2 border rounded border-gray-300 text-black bg-white" placeholder="Enter admin123" />
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <button type="button" onClick={handleCloseEdit} className="px-4 py-2 bg-gray-200 rounded hover:bg-gray-300 text-black">Cancel</button>

              <button type="submit" disabled={isSaving} className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700">
                {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Save Changes'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* DELETE MODAL */}
      {isDeleteModalOpen && (
        <div className="fixed inset-0 bg-black/20 flex items-center justify-center p-4 z-50">
          <div className="bg-white text-black rounded-xl w-full max-w-md p-6 shadow-xl border border-gray-200 space-y-4">
            <h2 className="text-xl font-bold text-black">Delete Sale</h2>

            {deleteError && <div className="p-2 bg-red-100 text-red-700 border border-red-300 rounded">{deleteError}</div>}

            <p className="text-sm text-gray-700">You are deleting: <strong className="text-black">{selectedSaleForDelete?.name}</strong></p>

            <div>
              <label className="text-xs font-semibold text-black">Admin Password</label>
              <input type="password" className="w-full p-2 border border-gray-300 rounded bg-white text-black placeholder-gray-500" value={deletePassword} onChange={(e) => setDeletePassword(e.target.value)} />
            </div>

            <div>
              <label className="text-xs font-semibold text-black">Reason for deleting</label>
              <textarea rows={3} className="w-full p-2 border border-gray-300 rounded bg-white text-black placeholder-gray-500" value={deleteRemark} onChange={(e) => setDeleteRemark(e.target.value)} required />
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <button onClick={() => setIsDeleteModalOpen(false)} className="px-4 py-2 bg-gray-200 rounded hover:bg-gray-300 text-black">Cancel</button>

              <button onClick={handleDelete} disabled={isDeleting} className="px-4 py-2 bg-red-700 text-white rounded hover:bg-red-800">
                {isDeleting ? 'Deleting…' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
