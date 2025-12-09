'use client';

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { supabase } from '@/lib/supabase';

// --- Types ---
type Sale = {
  id: string;
  date: string;
  name: string;
  mobile: string;
  treatment: string;
  amount_paid: number; // Stored in paise/cents
  took_package: boolean;
  package_amount: number; // Stored in paise/cents
  check_in_time: string | null;
  check_out_time: string | null;
  room: string | null;
  therapist_name: string | null;
  session_hours: number | null;
  payment_method: string | null;
};

type AddonModalProps = {
  sale: Sale | null;
  onClose: () => void;
  onConfirm: (saleId: string, extraMinutes: number, extraAmount: number, currentSale: Sale) => void;
};

type CheckoutConfirmModalProps = {
  sale: Sale | null;
  expectedTime: string | null;
  onClose: () => void;
  onCheckout: (id: string) => void;
  onAddon: (sale: Sale) => void;
};

// --- Helper Functions ---
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

const getExpectedCheckoutTime = (checkIn: string | null, hours: number | null): Date | null => {
  if (!checkIn || !hours || hours <= 0) return null;
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

const formatPaymentMethod = (method: string | null, tookPackage: boolean) => {
  if (tookPackage) return 'Package';
  if (method === 'card') return 'Card';
  if (method === 'upi') return 'UPI';
  if (method === 'cash') return 'Cash';
  if (!method) return 'N/A';
  return method.charAt(0).toUpperCase() + method.slice(1);
};

// --- Add-on Modal ---
function AddonModal({ sale, onClose, onConfirm }: AddonModalProps) {
  const [minutes, setMinutes] = useState(30);
  const [amount, setAmount] = useState(0);

  if (!sale) return null;

  const handleSubmit = () => {
    onConfirm(sale.id, minutes, amount, sale); 
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-md p-6 space-y-4">
        <h2 className="text-xl font-bold text-gray-800">Add Add-on for {sale.name}</h2>
        
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Extra Time (min)</label>
          <input
            type="number"
            value={minutes}
            onChange={(e) => setMinutes(Number(e.target.value))}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-black"
            step="15"
            min="0"
          />
        </div>
        
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Extra Amount (₹)</label>
          <input
            type="number"
            value={amount}
            onChange={(e) => setAmount(Number(e.target.value))}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-black"
            step="100"
            min="0"
          />
        </div>

        <div className="flex justify-end gap-3 pt-4">
          <button onClick={onClose} className="px-4 py-2 bg-gray-200 rounded-lg">Cancel</button>
          <button onClick={handleSubmit} className="px-4 py-2 bg-blue-600 text-white rounded-lg">Confirm</button>
        </div>
      </div>
    </div>
  );
}

// --- Checkout Modal ---
function CheckoutConfirmModal({ sale, expectedTime, onClose, onCheckout, onAddon }: CheckoutConfirmModalProps) {
  if (!sale) return null;

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-md p-6 space-y-4">
        <h2 className="text-xl font-bold text-gray-800">Session Ended for {sale.name}</h2>
        <p className="text-gray-600">
          Scheduled to end at **{expectedTime}**.
        </p>
        <p className="text-gray-800 font-medium">Has the client checked out?</p>

        <div className="flex justify-end gap-3 pt-4">
          <button onClick={onClose} className="px-4 py-2 bg-gray-200 rounded-lg">No (Snooze)</button>
          <button onClick={() => onAddon(sale)} className="px-4 py-2 bg-blue-600 text-white rounded-lg">Add-on</button>
          <button onClick={() => onCheckout(sale.id)} className="px-4 py-2 bg-green-600 text-white rounded-lg">Checkout</button>
        </div>
      </div>
    </div>
  );
}

export default function OutletSalesPage() {
  const [sales, setSales] = useState<Sale[]>([]);
  const [loading, setLoading] = useState(true);
  const [outletName, setOutletName] = useState('');
  const [outletId, setOutletId] = useState('');
  
  const today = useMemo(() => new Date().toISOString().split('T')[0], []);
  const [dateFilter, setDateFilter] = useState(today);

  const snoozedClients = useRef<Set<string>>(new Set());
  const warningTimerRef = useRef<NodeJS.Timeout | null>(null);

  const [addonModalOpen, setAddonModalOpen] = useState(false);
  const [selectedSale, setSelectedSale] = useState<Sale | null>(null);

  const [warningModalOpen, setWarningModalOpen] = useState(false);
  const [warningSale, setWarningSale] = useState<Sale | null>(null);
  const [warningExpectedTime, setWarningExpectedTime] = useState<string | null>(null);

  const isToday = dateFilter === today;

  // Fetch outlet info
  useEffect(() => {
    async function fetchOutletSession() {
      try {
        const res = await fetch('/api/outlet');
        const data = await res.json();
        if (data.outletId) {
          setOutletId(data.outletId);
          setOutletName(data.outletName);
        } else {
          console.error("Outlet ID not found in session data.");
        }
      } catch (err) {
        console.error('Error fetching outlet session:', err);
      }
    }
    fetchOutletSession();
  }, []);

  // Fetch sales
  const fetchSales = useCallback(async () => {
    if (!outletId) return;
    
    setLoading(true);
    try {
      let query = supabase
        .from('customers')
        .select('id, date, name, mobile, treatment, session_hours, amount_paid, took_package, package_amount, check_in_time, check_out_time, room, therapist_name, payment_method')
        .eq('outlet_id', outletId)
        .order('check_in_time', { ascending: false });

      if (dateFilter) {
        query = query.eq('date', dateFilter); 
      }
      
      const { data, error } = await query;
      if (error) throw error;

      setSales(data as Sale[] || []);
    } catch (err) {
      console.error('Error fetching sales:', err);
    } finally {
      setLoading(false);
    }
  }, [dateFilter, outletId]);

  useEffect(() => {
    if (!outletId) return;
    fetchSales();

    const channel = supabase
      .channel(`customers-${outletId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'customers', filter: `outlet_id=eq.${outletId}` },
        () => {
          fetchSales();
        }
      )
      .subscribe();

    return () => {
      if (channel) {
        supabase.removeChannel(channel);
      }
    };
  }, [fetchSales, outletId]);

  const handleCheckOut = useCallback(async (id: string) => {
    try {
      const { error } = await supabase.from('customers').update({ check_out_time: new Date().toISOString() }).eq('id', id);
      if (error) throw error;
      if (warningSale && warningSale.id === id) {
        setWarningModalOpen(false);
        setWarningSale(null);
        setWarningExpectedTime(null);
      }
    } catch (error) {
      console.error('Error checking out:', error);
    }
  }, [warningSale]);

  // Warning system
  useEffect(() => {
    if (!isToday) {
      if (warningTimerRef.current) clearInterval(warningTimerRef.current);
      return;
    }

    const checkWarnings = () => {
      const now = new Date();
      if (warningModalOpen) return;

      for (const sale of sales.filter(s => s.check_in_time && !s.check_out_time && s.session_hours)) {
        if (!snoozedClients.current.has(sale.id)) {
          const expected = getExpectedCheckoutTime(sale.check_in_time, sale.session_hours);
          if (expected && now >= expected) {
            setWarningSale(sale);
            setWarningExpectedTime(formatTime(expected.toISOString()));
            setWarningModalOpen(true);
            break;
          }
        }
      }
    };

    if (warningTimerRef.current) clearInterval(warningTimerRef.current);
    warningTimerRef.current = setInterval(checkWarnings, 30000);

    return () => {
      if (warningTimerRef.current) {
        clearInterval(warningTimerRef.current);
      }
    };
  }, [sales, warningModalOpen, isToday]);

  const handleWarningModalClose = () => {
    if (warningSale) {
      snoozedClients.current.add(warningSale.id);
      setTimeout(() => snoozedClients.current.delete(warningSale.id), 300000); 
    }
    setWarningModalOpen(false);
    setWarningSale(null);
    setWarningExpectedTime(null);
  };

  const handleOpenAddonModal = useCallback((sale: Sale) => {
    setWarningModalOpen(false);
    setWarningSale(null);
    setWarningExpectedTime(null);
    setAddonModalOpen(true);
    setSelectedSale(sale);
  }, []);

  const handleCloseAddonModal = useCallback(() => {
    setAddonModalOpen(false);
    setSelectedSale(null);
  }, []);

  const handleConfirmAddon = useCallback(async (saleId: string, extraMinutes: number, extraAmount: number, currentSale: Sale) => {
    if (extraMinutes <= 0 && extraAmount <= 0) return handleCloseAddonModal();

    try {
      const extraHours = extraMinutes / 60;
      const newHours = (currentSale.session_hours || 0) + extraHours;
      const newAmount = (currentSale.amount_paid || 0) + extraAmount * 100;

      const { error } = await supabase.from('customers').update({
        session_hours: newHours,
        amount_paid: newAmount,
        treatment: `${currentSale.treatment} (+${extraMinutes}m addon, ₹${extraAmount})` 
      }).eq('id', saleId);

      if (error) throw error;
      console.log('Add-on saved successfully.');
      handleCloseAddonModal();
    } catch (err: any) {
      console.error(`Error saving add-on: ${err.message}`);
    }
  }, [handleCloseAddonModal]);


  // --- Computed Values (Totals Breakdown) ---
  const completedSales = useMemo(() => 
    sales.filter(sale => sale.check_out_time), 
    [sales]
  );
  
  const totalSales = useMemo(
    () => completedSales.reduce((a, s) => a + (s.took_package ? s.package_amount : s.amount_paid), 0),
    [completedSales]
  );

  const totalCashSales = useMemo(
    () => completedSales.filter((s) => s.payment_method === 'cash').reduce((a, s) => a + s.amount_paid, 0),
    [completedSales]
  );

  const totalUpiSales = useMemo(
    () => completedSales.filter((s) => s.payment_method === 'upi').reduce((a, s) => a + s.amount_paid, 0),
    [completedSales]
  );

  const totalCardSales = useMemo(
    () => completedSales.filter((s) => s.payment_method === 'card').reduce((a, s) => a + s.amount_paid, 0),
    [completedSales]
  );

  const totalPackageSales = useMemo(
    () => completedSales.filter((s) => s.took_package).reduce((a, s) => a + s.package_amount, 0),
    [completedSales]
  );

  const activeSalesCount = sales.filter(s => !s.check_out_time).length;

  // --- Render ---
  return (
    <div className="space-y-6">

      {/* Modals */}
      <AddonModal sale={selectedSale} onClose={handleCloseAddonModal} onConfirm={handleConfirmAddon} />
      <CheckoutConfirmModal 
        sale={warningSale}
        expectedTime={warningExpectedTime}
        onClose={handleWarningModalClose}
        onCheckout={handleCheckOut}
        onAddon={handleOpenAddonModal}
      />

      <h1 className="text-2xl font-bold text-gray-800">
        {outletName} Sales & Check-out {isToday ? ' (Today)' : ` (${dateFilter})`}
      </h1>

      <div className="bg-white p-4 rounded-xl shadow-sm grid grid-cols-1 md:grid-cols-3 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Date Filter</label>
          <input
            type="date"
            value={dateFilter}
            onChange={(e) => setDateFilter(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-black"
          />
        </div>
      </div>
      
      {/* Sales Summary (Breakdown) */}
      <div className="bg-white p-6 rounded-xl shadow-sm">
        <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-6">
          <div>
            <h3 className="text-black text-sm">Total Completed Sales</h3>
            <p className="text-2xl mt-2 font-bold text-green-600">{formatCurrency(totalSales)}</p>
            <p className="text-xs text-black">{completedSales.length} sessions</p>
            <p className="text-xs text-gray-500">{activeSalesCount} active</p>
          </div>
          <div>
            <h3 className="text-black text-sm">Total Cash Sales</h3>
            <p className="text-2xl mt-2 font-bold text-blue-600">{formatCurrency(totalCashSales)}</p>
          </div>
          <div>
            <h3 className="text-black text-sm">Total UPI Sales</h3>
            <p className="text-2xl mt-2 font-bold text-purple-600">{formatCurrency(totalUpiSales)}</p>
          </div>
          <div>
            <h3 className="text-black text-sm">Total Card Sales</h3>
            <p className="text-2xl mt-2 font-bold text-indigo-600">{formatCurrency(totalCardSales)}</p>
          </div>
          <div>
            <h3 className="text-black text-sm">Total Package Value</h3>
            <p className="text-2xl mt-2 font-bold text-black">{formatCurrency(totalPackageSales)}</p>
          </div>
        </div>
      </div>

      <div className="bg-white shadow rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">

            <thead className="bg-gray-50">
              <tr>
                <th className="px-3 py-2 text-xs font-medium text-gray-600 uppercase text-left">Customer</th>
                <th className="px-3 py-2 text-xs font-medium text-gray-600 uppercase text-left">Service</th>
                <th className="px-3 py-2 text-xs font-medium text-gray-600 uppercase text-left">Duration</th>
                <th className="px-3 py-2 text-xs font-medium text-gray-600 uppercase text-left">Amount</th>
                <th className="px-3 py-2 text-xs font-medium text-gray-600 uppercase text-left">Payment</th>
                <th className="px-3 py-2 text-xs font-medium text-gray-600 uppercase text-left">Session Time</th>
                <th className="px-3 py-2 text-xs font-medium text-gray-600 uppercase text-left">Therapist</th>
                <th className="px-3 py-2 text-xs font-medium text-gray-600 uppercase text-left">Room</th>
                <th className="px-3 py-2 text-xs font-medium text-gray-600 uppercase text-left">Action</th>
              </tr>
            </thead>

            <tbody className="bg-white divide-y divide-gray-200">

              {loading ? (
                <tr><td colSpan={9} className="p-6 text-center">Loading...</td></tr>
              ) : sales.length === 0 ? (
                <tr><td colSpan={9} className="p-6 text-center">No sales found for this date.</td></tr>
              ) : (
                sales.map(sale => (
                  <tr key={sale.id} className={sale.check_out_time ? 'bg-gray-50 opacity-60' : ''}>
                    
                    {/* Customer */}
                    <td className="px-3 py-2 text-xs text-left">
                      <div className="font-medium text-gray-900">{sale.name}</div>
                      <div className="text-gray-600">{sale.mobile}</div>
                    </td>

                    {/* Service */}
                    <td className="px-3 py-2 text-xs text-gray-700 max-w-xs text-left">
                      {sale.took_package ? (
                        <span className="font-medium text-purple-700">New Package</span>
                      ) : (
                        <div className="truncate">{sale.treatment}</div>
                      )}
                    </td>

                    {/* Duration */}
                    <td className="px-3 py-2 text-xs text-gray-700 text-left">{formatDuration(sale.session_hours)}</td>

                    {/* Amount */}
                    <td className="px-3 py-2 text-xs font-medium text-green-600 text-left">
                      {formatCurrency(sale.took_package ? sale.package_amount : sale.amount_paid)} 
                    </td>

                    {/* Payment */}
                    <td className="px-3 py-2 text-xs text-gray-700 text-left">
                      {formatPaymentMethod(sale.payment_method, sale.took_package)}
                    </td>

                    {/* Times */}
                    <td className="px-3 py-2 text-xs text-gray-700 text-left">
                      In: {formatTime(sale.check_in_time)} <br />
                      {sale.check_out_time ? (
                        <>Out: {formatTime(sale.check_out_time)}</>
                      ) : (
                        (() => {
                          const expected = getExpectedCheckoutTime(sale.check_in_time, sale.session_hours);
                          return expected ? <>Est: {formatTime(expected.toISOString())}</> : <>Out: —</>;
                        })()
                      )}
                    </td>

                    {/* Therapist (READ ONLY) */}
                    <td className="px-3 py-2 text-xs text-gray-800 text-left">
                      {sale.therapist_name || '—'}
                    </td>

                    {/* Room (READ ONLY) */}
                    <td className="px-3 py-2 text-xs text-gray-800 text-left">
                      {sale.room || '—'}
                    </td>

                    {/* Action */}
                    <td className="px-3 py-2 text-xs text-left">
                      {sale.check_out_time ? (
                        <span className="px-3 py-1 bg-green-100 text-green-700 rounded-full text-xs font-medium">Completed</span>
                      ) : (
                        <div className="flex flex-col gap-1">
                          <button
                            onClick={() => handleCheckOut(sale.id)}
                            className="px-3 py-1 bg-red-600 hover:bg-red-700 text-white rounded text-xs transition duration-150"
                          >
                            Check Out
                          </button>

                          <button
                            onClick={() => handleOpenAddonModal(sale)}
                            className="px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded text-xs transition duration-150"
                          >
                            Add-on
                          </button>
                        </div>
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