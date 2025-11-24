'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { OUTLETS } from '@/lib/outlet';

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

const formatPaymentMethod = (method: string | null, tookPackage: boolean) => {
  if (tookPackage) return 'Package';
  if (method === 'card') return 'UPI / Card';
  if (method === 'cash') return 'Cash';
  if (method === 'package') return 'Package';
  if (!method) return 'N/A';
  return method.charAt(0).toUpperCase() + method.slice(1);
};


// --- Add-on Modal Component ---
function AddonModal({
  sale,
  onClose,
  onConfirm,
}: {
  sale: Sale | null;
  onClose: () => void;
  onConfirm: (saleId: string, extraMinutes: number, extraAmount: number, currentSale: Sale) => void;
}) {
  const [minutes, setMinutes] = useState(30);
  const [amount, setAmount] = useState(0);

  if (!sale) return null;

  const handleSubmit = () => {
    onConfirm(sale.id, minutes, amount, sale);
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-md p-6 space-y-4">
        <h2 className="text-xl font-bold text-gray-800">Add Add-on for {sale.name}</h2>
        
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Extra Time (in minutes)</label>
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
          <label className="block text-sm font-medium text-gray-700 mb-1">Extra Amount (in ₹)</label>
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
          <button
            onClick={onClose}
            className="px-4 py-2 bg-gray-200 text-gray-800 rounded-lg hover:bg-gray-300"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            Confirm Add-on
          </button>
        </div>
      </div>
    </div>
  );
}

// --- Checkout Confirmation Modal Component ---
function CheckoutConfirmModal({
  sale,
  expectedTime,
  onClose,
  onCheckout,
  onAddon,
}: {
  sale: Sale | null;
  expectedTime: string | null;
  onClose: () => void; 
  onCheckout: (saleId: string) => void;
  onAddon: (sale: Sale) => void;
}) {
  if (!sale) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-md p-6 space-y-4">
        <h2 className="text-xl font-bold text-gray-800">Session Ended for {sale.name}</h2>
        <p className="text-gray-600">
          {sale.name}'s session was scheduled to end at {expectedTime || '...'}
          .
        </p>
        <p className="text-gray-800 font-medium">Has the client checked out?</p>

        <div className="flex justify-end gap-3 pt-4">
          <button
            onClick={onClose} 
            className="px-4 py-2 bg-gray-200 text-gray-800 rounded-lg hover:bg-gray-300"
          >
            No (Snooze 5m)
          </button>
          <button
            onClick={() => onAddon(sale)}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            Add-on
          </button>
          <button
            onClick={() => onCheckout(sale.id)}
            className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700"
          >
            Yes, Check Out
          </button>
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
  const [dateFilter, setDateFilter] = useState(new Date().toISOString().split('T')[0]);
  const [roomInputs, setRoomInputs] = useState<{[key: string]: string}>({});
  const [therapistInputs, setTherapistInputs] = useState<{[key: string]: string}>({});
  
  const warningTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const snoozedClients = useRef<Set<string>>(new Set());
  
  const [addonModalOpen, setAddonModalOpen] = useState(false);
  const [selectedSale, setSelectedSale] = useState<Sale | null>(null);
  
  const [warningModalOpen, setWarningModalOpen] = useState(false);
  const [warningSale, setWarningSale] = useState<Sale | null>(null);
  const [warningExpectedTime, setWarningExpectedTime] = useState<string | null>(null);

  useEffect(() => {
    async function fetchOutletSession() {
      try {
        const res = await fetch('/api/outlet');
        if (!res.ok) throw new Error('Could not fetch outlet session');
        
        const data = await res.json();
        if (data.outletId && data.outletName) {
          setOutletId(data.outletId);
          setOutletName(data.outletName);
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
    if (!outletId) return; 
    
    try {
      let query = supabase
        .from('customers')
        .select('id, date, name, mobile, treatment, session_hours, amount_paid, took_package, package_amount, check_in_time, check_out_time, room, therapist_name, payment_method')
        .eq('outlet_id', outletId) 
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
  }, [dateFilter, outletId]);

  useEffect(() => {
    if (!outletId) return;
    
    fetchSales();
    
    const channel = supabase
      .channel(`customers-sales-outlet-${outletId}`)
      .on('postgres_changes', 
        { 
          event: '*', 
          schema: 'public', 
          table: 'customers',
          filter: `outlet_id=eq.${outletId}` 
        },
        (payload) => {
          fetchSales(); 
        }
      )
      .subscribe();
      
    return () => {
      supabase.removeChannel(channel);
    };
    
  }, [fetchSales, outletId]);

  
  const handleCheckOut = async (id: string) => {
    await supabase.from('customers').update({ check_out_time: new Date().toISOString() }).eq('id', id);
  };

  useEffect(() => {
    const checkClientWarnings = () => {
      const now = new Date();
      
      if (warningModalOpen) return; 

      for (const sale of sales) {
        if (!sale.check_out_time && sale.check_in_time && sale.session_hours && !snoozedClients.current.has(sale.id)) {
          const expectedCheckout = getExpectedCheckoutTime(sale.check_in_time, sale.session_hours);
          
          if (expectedCheckout && now >= expectedCheckout) {
            setWarningExpectedTime(formatTime(expectedCheckout.toISOString()));
            setWarningSale(sale);
            setWarningModalOpen(true);
            break; 
          }
        }
      }
    };

    const WARNING_CHECK_MS = 30000;
    if (warningTimerRef.current) clearInterval(warningTimerRef.current);
    warningTimerRef.current = setInterval(checkClientWarnings, WARNING_CHECK_MS);

    return () => {
      if (warningTimerRef.current) clearInterval(warningTimerRef.current);
    };
  }, [sales, fetchSales, warningModalOpen]);


  const handleRoomInputChange = (id: string, room: string) => {
    setRoomInputs(prev => ({ ...prev, [id]: room }));
  };
  const handleRoomSave = async (id: string, room: string) => {
    if (!room) return;
    await supabase.from('customers').update({ room }).eq('id', id);
  };
  const handleTherapistInputChange = (id: string, name: string) => {
    setTherapistInputs(prev => ({ ...prev, [id]: name }));
  };
  const handleTherapistSave = async (id: string, therapistName: string) => {
    if (!therapistName) return;
    await supabase.from('customers').update({ therapist_name: therapistName }).eq('id', id);
  };
  
  
  const handleWarningModalClose = () => {
    if (warningSale) {
      snoozedClients.current.add(warningSale.id);
      console.log(`Snoozing client ${warningSale.id} for 5 minutes.`);
      setTimeout(() => {
        if (snoozedClients.current.has(warningSale.id)) {
          snoozedClients.current.delete(warningSale.id);
          console.log(`Snooze ended for ${warningSale.id}.`);
        }
      }, 300000); 
    }
    setWarningModalOpen(false);
    setWarningSale(null);
    setWarningExpectedTime(null);
  };

  const handleWarningModalCheckout = (saleId: string) => {
    handleCheckOut(saleId); 
    setWarningModalOpen(false);
    setWarningSale(null);
    setWarningExpectedTime(null);
  };

  const handleWarningModalAddon = (sale: Sale) => {
    setWarningModalOpen(false);
    setWarningSale(null);
    setWarningExpectedTime(null);
    
    handleOpenAddonModal(sale);
  };
  
  const handleOpenAddonModal = (sale: Sale) => {
    setSelectedSale(sale);
    setAddonModalOpen(true);
  };

  const handleCloseAddonModal = () => {
    setAddonModalOpen(false);
    setSelectedSale(null);
  };

  const handleConfirmAddon = async (
    saleId: string,
    extraMinutes: number,
    extraAmount: number,
    currentSale: Sale
  ) => {
    if (extraMinutes <= 0 && extraAmount <= 0) {
      handleCloseAddonModal();
      return;
    }

    try {
      const extraHours = extraMinutes / 60;
      const newSessionHours = (currentSale.session_hours || 0) + extraHours;
      
      const extraAmountInPaise = extraAmount * 100;
      const newAmountPaid = (currentSale.amount_paid || 0) + extraAmountInPaise;
      
      const newTreatment = `${currentSale.treatment} (+${extraMinutes}m addon)`;

      const { error } = await supabase
        .from('customers')
        .update({
          session_hours: newSessionHours,
          amount_paid: newAmountPaid, 
          treatment: newTreatment,
        })
        .eq('id', saleId);
      
      if (error) throw error;

      alert('Add-on saved successfully!');
      handleCloseAddonModal();
    } catch (err: any) {
      console.error('Error saving add-on:', err);
      alert(`Error saving add-on: ${err.message}`);
    }
  };


  const totalSales = sales
    .filter(sale => !!sale.check_out_time) 
    .reduce((sum, sale) => {
      const amount = sale.took_package ? sale.package_amount : sale.amount_paid;
      return sum + (amount || 0);
    }, 0);

  const activeSalesCount = sales.filter(s => !!s.check_out_time).length; 

  return (
    <div className="space-y-6">
      <AddonModal
        sale={selectedSale}
        onClose={handleCloseAddonModal}
        onConfirm={handleConfirmAddon}
      />

      <CheckoutConfirmModal
        sale={warningSale}
        expectedTime={warningExpectedTime}
        onClose={handleWarningModalClose}
        onCheckout={handleWarningModalCheckout}
        onAddon={handleWarningModalAddon}
      />

      <h1 className="text-2xl font-bold text-gray-800">{outletName} Sales & Check-out</h1>

      <div className="bg-white p-4 rounded-xl shadow-sm grid grid-cols-1 md:grid-cols-3 gap-4">
        <div>
          <label htmlFor="date" className="block text-sm font-medium text-gray-700 mb-1">Date</label>
          <input
            id="date"
            type="date"
            value={dateFilter}
            onChange={(e) => setDateFilter(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-black"
          />
        </div>
      </div>

      {/* --- UI FIX: Smaller Padding and Font Size --- */}
      <div className="bg-white p-4 rounded-xl shadow-sm">
        <h3 className="text-gray-500 text-sm font-medium">Total Active Sales (Filtered)</h3>
        <p className="text-2xl font-bold mt-2 text-green-600">
          {formatCurrency(totalSales)}
        </p>
        <p className="text-gray-500 text-sm">{activeSalesCount} completed transaction(s)</p>
      </div>

      <div className="bg-white shadow rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                {/* --- UI FIX: Smaller Padding --- */}
                <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Customer</th>
                <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Service</th>
                <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Duration</th>
                <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Amount</th>
                <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Payment</th>
                <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Session Time</th>
                <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Therapist</th>
                <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Room</th>
                <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Action</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {loading ? (
                <tr><td colSpan={9} className="p-6 text-center text-gray-500">Loading...</td></tr>
              ) : sales.length === 0 ? (
                <tr><td colSpan={9} className="p-6 text-center text-gray-500">No sales found for these filters.</td></tr>
              ) : (
                sales.map(sale => (
                  <tr key={sale.id} className={sale.check_out_time ? 'bg-gray-50 opacity-60' : 'bg-white'}>
                    
                    {/* --- UI FIX: Smaller Padding, Text, and allows wrapping --- */}
                    <td className="px-3 py-2 text-xs">
                      <div className="font-medium text-gray-900">{sale.name}</div>
                      <div className="text-gray-500">{sale.mobile}</div>
                    </td>
                    
                    {/* --- UI FIX: Smaller Padding, Text, and allows wrapping --- */}
                    <td className="px-3 py-2 text-xs text-gray-500 max-w-xs">
                      {sale.took_package ? (
                        <span className="font-medium text-purple-700">New Package</span>
                      ) : (
                        <div className="truncate" title={sale.treatment}>{sale.treatment}</div>
                      )}
                    </td>
                    
                    {/* --- UI FIX: Smaller Padding and Text --- */}
                    <td className="px-3 py-2 whitespace-nowrap text-xs text-gray-500">
                      {formatDuration(sale.session_hours)}
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap text-xs font-medium text-green-600">
                      {formatCurrency(sale.took_package ? sale.package_amount : sale.amount_paid)}
                    </td>
                    
                    <td className="px-3 py-2 whitespace-nowrap text-xs text-gray-500">
                      {formatPaymentMethod(sale.payment_method, sale.took_package)}
                    </td>
                    
                    <td className="px-3 py-2 whitespace-nowrap text-xs text-gray-500">
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
                    
                    {/* --- UI FIX: Smaller Padding, Inputs, and Text --- */}
                    <td className="px-3 py-2 whitespace-nowrap">
                      {sale.check_out_time ? (
                        <span className="text-xs text-gray-500">{sale.therapist_name || 'N/A'}</span>
                      ) : (
                        <div className="flex">
                          <input 
                            type="text"
                            value={therapistInputs[sale.id] || ''}
                            onChange={(e) => handleTherapistInputChange(sale.id, e.target.value)}
                            placeholder="Therapist"
                            className="w-20 px-2 py-1 border border-gray-300 rounded-l-md text-xs text-black"
                          />
                          <button
                            onClick={() => handleTherapistSave(sale.id, therapistInputs[sale.id])}
                            className="px-2 py-1 bg-gray-200 text-gray-700 rounded-r-md text-xs hover:bg-gray-300"
                          >
                            Save
                          </button>
                        </div>
                      )}
                    </td>

                    <td className="px-3 py-2 whitespace-nowrap">
                      {sale.check_out_time ? (
                        <span className="text-xs text-gray-500">{sale.room || 'N/A'}</span>
                      ) : (
                        <div className="flex">
                          <input 
                            type="text"
                            value={roomInputs[sale.id] || ''}
                            onChange={(e) => handleRoomInputChange(sale.id, e.target.value)}
                            placeholder="Room name"
                            className="w-16 px-2 py-1 border border-gray-300 rounded-l-md text-xs text-black"
                          />
                          <button
                            onClick={() => handleRoomSave(sale.id, roomInputs[sale.id])}
                            className="px-2 py-1 bg-gray-200 text-gray-700 rounded-r-md text-xs hover:bg-gray-300"
                          >
                            Save
                          </button>
                        </div>
                      )}
                    </td>
                    
                    <td className="px-3 py-2 whitespace-nowrap">
                      {sale.check_out_time ? (
                         <span className="px-3 py-1 bg-green-100 text-green-700 text-xs rounded-full font-medium">
                          Completed
                        </span>
                      ) : (
                        <div className="flex flex-row gap-2">
                          <button
                            onClick={() => handleCheckOut(sale.id)}
                            className="px-3 py-1 bg-red-500 text-white text-xs rounded-lg hover:bg-red-600"
                          >
                            Check Out
                          </button>
                          <button
                            onClick={() => handleOpenAddonModal(sale)}
                            className="px-3 py-1 bg-blue-500 text-white text-xs rounded-lg hover:bg-blue-600"
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