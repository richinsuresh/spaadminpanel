'use client';

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { supabase } from '@/lib/supabase';
// 🛑 NEW IMPORT: useSearchParams for reading URL filter
import { useSearchParams } from 'next/navigation'; 
import { ChevronDown, ChevronUp, UserPlus, Save, X, RefreshCw } from 'lucide-react';

/* ===================== TYPES (FIXED) ===================== */

type Employee = {
  id: string;
  name: string;
};

type GroupCustomer = {
  name: string;
  treatment: string;
  // --- FIX APPLIED ---
  therapist_name: string | null;
  room: string | null;
  // -------------------
  sessionHours?: number | null;
  in_time?: string | null;   // plain "HH:mm"
  out_time?: string | null;  // plain "HH:mm"
};

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

  group_customers: GroupCustomer[] | null;
};

// State type for the assignment modal
type AssignmentData = {
    saleId: string;
    mainCustomerName: string;
    initialTherapist: string | null;
    initialRoom: string | null;
    groupCustomers: GroupCustomer[] | null;
};

type AddonModalProps = {
  sale: Sale | null;
  onClose: () => void;
  onConfirm: (
    saleId: string,
    extraMinutes: number,
    extraAmount: number,
    currentSale: Sale,
  ) => void;
};

type CheckoutConfirmModalProps = {
  sale: Sale | null;
  expectedTime: string | null;
  onClose: () => void;
  onCheckout: (id: string) => void;
  onAddon: (sale: Sale) => void;
};

type StaffAssignmentModalProps = {
  data: AssignmentData | null;
  employees: Employee[];
  onClose: () => void;
  onSave: (saleId: string, mainTherapist: string, mainRoom: string, groupUpdates: { index: number, therapist: string, room: string }[]) => void;
  isSaving: boolean;
};


/* ===================== HELPERS ===================== */

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

// For plain "HH:mm"
const formatPlainTime = (t: string | null | undefined) => {
  if (!t) return '—';
  try {
    const [h, m] = t.split(':');
    const dt = new Date();
    dt.setHours(Number(h), Number(m), 0, 0);
    return dt.toLocaleTimeString('en-IN', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    });
  } catch {
    return t;
  }
};

const getExpectedCheckoutTime = (
  checkIn: string | null,
  hours: number | null,
): Date | null => {
  if (!checkIn || !hours || hours <= 0) return null;
  const checkInDate = new Date(checkIn);
  const durationInMs = hours * 60 * 60 * 1000;
  return new Date(checkInDate.getTime() + durationInMs);
};

const formatDuration = (hours: number | null | undefined) => {
  if (!hours && hours !== 0) return '—';
  if (hours === 0) return '0 mins';
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


/* ===================== MODALS (UNMODIFIED) ===================== */
// (Modal bodies are unchanged to save space, assuming they work correctly)

function AddonModal({ sale, onClose, onConfirm }: AddonModalProps) {
  const [minutes, setMinutes] = useState(30);
  const [amount, setAmount] = useState(0);

  if (!sale) return null;

  const handleSubmit = () => {
    onConfirm(sale.id, minutes, amount, sale);
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-md p-6 space-y-4">
        <h2 className="text-xl font-bold text-gray-800">
          Add Add-on for {sale.name}
        </h2>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Extra Time (min)
          </label>
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
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Extra Amount (₹)
          </label>
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
            className="px-4 py-2 bg-gray-200 rounded-lg"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg"
          >
            Confirm
          </button>
        </div>
      </div>
    </div>
  );
}

function CheckoutConfirmModal({
  sale,
  expectedTime,
  onClose,
  onCheckout,
  onAddon,
}: CheckoutConfirmModalProps) {
  if (!sale) return null;

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-md p-6 space-y-4">
        <h2 className="text-xl font-bold text-gray-800">
          Session Ended for {sale.name}
        </h2>
        <p className="text-gray-600">
          Scheduled to end at <strong>{expectedTime}</strong>.
        </p>
        <p className="text-gray-800 font-medium">
          Has the client checked out?
        </p>

        <div className="flex justify-end gap-3 pt-4">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-gray-200 rounded-lg"
          >
            No (Snooze)
          </button>
          <button
            onClick={() => onAddon(sale)}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg"
          >
            Add-on
          </button>
          <button
            onClick={() => onCheckout(sale.id)}
            className="px-4 py-2 bg-green-600 text-white rounded-lg"
          >
            Checkout
          </button>
        </div>
      </div>
    </div>
  );
}

function StaffAssignmentModal({ data, employees, onClose, onSave, isSaving }: StaffAssignmentModalProps) {
    if (!data) return null;

    const [mainTherapist, setMainTherapist] = useState(data.initialTherapist || '');
    const [mainRoom, setMainRoom] = useState(data.initialRoom || '');
    const [groupAssignments, setGroupAssignments] = useState(data.groupCustomers ? 
        data.groupCustomers.map(gc => ({
            therapist: gc.therapist_name === 'CLIENT_FORM_PENDING' ? '' : gc.therapist_name || '',
            room: gc.room === 'CLIENT_FORM_PENDING' ? '' : gc.room || ''
        })) : []);

    const handleGroupChange = (index: number, field: 'therapist' | 'room', value: string) => {
        setGroupAssignments(prev => prev.map((item, i) => 
            i === index ? { ...item, [field]: value } : item
        ));
    };

    const handleSave = () => {
        const groupUpdates = groupAssignments.map((assignment, index) => ({
            index: index,
            therapist: assignment.therapist.trim(),
            room: assignment.room.trim(),
        }));

        onSave(data.saleId, mainTherapist.trim(), mainRoom.trim(), groupUpdates);
    };

    const needsAssignment = (data.initialTherapist === null || data.initialTherapist === 'CLIENT_FORM_PENDING') || 
                            (data.groupCustomers && data.groupCustomers.some(gc => gc.therapist_name === 'CLIENT_FORM_PENDING' || gc.room === 'CLIENT_FORM_PENDING'));

    return (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl p-6 space-y-4 max-h-[90vh] overflow-y-auto">
                <div className="flex justify-between items-center pb-3 border-b border-gray-200">
                    <h2 className={`text-xl font-bold ${needsAssignment ? 'text-red-600' : 'text-gray-800'}`}>
                        Staff Assignment for {data.mainCustomerName}
                    </h2>
                    <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
                        <X size={24} />
                    </button>
                </div>
                
                <p className="text-sm text-gray-600">
                    {needsAssignment ? '⚠️ These sessions are missing staff details and need to be assigned.' : 'Review/Update staff assignments.'}
                </p>

                <div className="space-y-6">
                    {/* Main Customer Assignment */}
                    <div className="border p-4 rounded-lg bg-gray-50">
                        <h3 className="text-lg font-semibold text-gray-800 mb-3">Main Customer</h3>
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Therapist (Main)</label>
                                <select
                                    value={mainTherapist}
                                    onChange={(e) => setMainTherapist(e.target.value)}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                                    disabled={isSaving}
                                >
                                    <option value="">— Select Therapist —</option>
                                    {employees.map(emp => (
                                        <option key={emp.id} value={emp.name}>{emp.name}</option>
                                    ))}
                                </select>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Room (Main)</label>
                                <input
                                    type="text"
                                    value={mainRoom}
                                    onChange={(e) => setMainRoom(e.target.value)}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-black"
                                    placeholder="Room 1, 2, etc."
                                    disabled={isSaving}
                                />
                            </div>
                        </div>
                    </div>

                    {/* Group Customers Assignment */}
                    {data.groupCustomers && data.groupCustomers.length > 0 && (
                        <div className="space-y-3">
                            <h3 className="text-lg font-semibold text-gray-800">Group Members</h3>
                            {data.groupCustomers.map((gc, index) => (
                                <div key={index} className="border p-4 rounded-lg space-y-3">
                                    <p className="font-medium text-sm text-gray-700">
                                        {gc.name || `Guest ${index + 1}`} ({formatDuration(gc.sessionHours)} for {gc.treatment})
                                    </p>
                                    <div className="grid grid-cols-2 gap-4">
                                        <div>
                                            <label className="block text-xs font-medium text-gray-700 mb-1">Therapist</label>
                                            <select
                                                value={groupAssignments[index].therapist}
                                                onChange={(e) => handleGroupChange(index, 'therapist', e.target.value)}
                                                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                                                disabled={isSaving}
                                            >
                                                <option value="">— Select Therapist —</option>
                                                {employees.map(emp => (
                                                    <option key={emp.id} value={emp.name}>{emp.name}</option>
                                                ))}
                                            </select>
                                        </div>
                                        <div>
                                            <label className="block text-xs font-medium text-gray-700 mb-1">Room</label>
                                            <input
                                                type="text"
                                                value={groupAssignments[index].room}
                                                onChange={(e) => handleGroupChange(index, 'room', e.target.value)}
                                                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-black text-sm"
                                                placeholder="Room"
                                                disabled={isSaving}
                                            />
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                <div className="flex justify-end gap-3 pt-4 border-t border-gray-200">
                    <button
                        onClick={onClose}
                        className="px-4 py-2 bg-gray-200 rounded-lg font-medium"
                        disabled={isSaving}
                    >
                        Cancel
                    </button>
                    <button
                        onClick={handleSave}
                        className="px-4 py-2 bg-green-600 text-white rounded-lg font-medium flex items-center gap-2"
                        disabled={isSaving}
                    >
                        {isSaving ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                        Save Assignment
                    </button>
                </div>
            </div>
        </div>
    );
}

/* ===================== MAIN COMPONENT ===================== */

export default function OutletSalesPage() {
  // 🛑 NEW IMPORTS AND STATE FOR OVERDUE FILTER
  const searchParams = useSearchParams();
  const statusFilter = searchParams.get('status');
  // Initialize filter state based on URL
  const [isOverdueFilterActive, setIsOverdueFilterActive] = useState(statusFilter === 'overdue');
  
  const [sales, setSales] = useState<Sale[]>([]);
  const [loading, setLoading] = useState(true);
  const [outletName, setOutletName] = useState('');
  const [outletId, setOutletId] = useState('');
  
  // --- NEW STAFF STATES ---
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [assignmentModalOpen, setAssignmentModalOpen] = useState(false);
  const [assignmentSale, setAssignmentSale] = useState<Sale | null>(null);
  const [isAssignmentSaving, setIsAssignmentSaving] = useState(false);


  const today = useMemo(
    () => new Date().toISOString().split('T')[0],
    [],
  );
  // 🛑 FIX: Use isOverdueFilterActive to set the initial dateFilter
  const [dateFilter, setDateFilter] = useState(isOverdueFilterActive ? today : today); 

  const snoozedClients = useRef<Set<string>>(new Set());
  const warningTimerRef = useRef<NodeJS.Timeout | null>(null);

  const [addonModalOpen, setAddonModalOpen] = useState(false);
  const [selectedSale, setSelectedSale] = useState<Sale | null>(null);

  const [warningModalOpen, setWarningModalOpen] = useState(false);
  const [warningSale, setWarningSale] = useState<Sale | null>(null);
  const [warningExpectedTime, setWarningExpectedTime] = useState<string | null>(
    null,
  );

  // 🛑 FIX: isToday must account for the filter date if active
  const isToday = dateFilter === today; 

  // NEW: track which group rows are expanded
  const [expandedGroups, setExpandedGroups] = useState<
    Record<string, boolean>
  >({});

  const toggleGroup = (id: string) => {
    setExpandedGroups((prev) => ({
      ...prev,
      [id]: !prev[id],
    }));
  };

  // 🛑 NEW: Effect to manage the URL parameter and filter state
  useEffect(() => {
    if (statusFilter === 'overdue' && !isOverdueFilterActive) {
        setIsOverdueFilterActive(true);
        // Force date filter to today if we are checking overdue sales
        setDateFilter(today); 
    } else if (statusFilter !== 'overdue' && isOverdueFilterActive) {
        // If the URL changes (e.g., user manually changes the URL) and no longer says 'overdue', deactivate it
        setIsOverdueFilterActive(false);
        // Do NOT reset dateFilter here, let the state handle the next fetch.
    }
  }, [statusFilter, isOverdueFilterActive, today]);


/* -------- Fetch outlet info and employees -------- */
  const fetchOutletEmployees = useCallback(async (currentOutletId: string) => {
    try {
        // Updated query to use lowercase 'therapist' to match the database schema
        const { data, error } = await supabase
            .from('employees')
            .select('id, name')
            .eq('is_active', true)
            .eq('role', 'therapist') // Changed from 'Therapist' to 'therapist'
            .order('name', { ascending: true });
        
        if (error) throw error;
        
        console.log("Employees found:", data); // Debugging line to see results in console
        setEmployees((data as Employee[]) || []);
    } catch (err) {
        console.error('Error fetching employees:', err);
    }
  }, []);
  useEffect(() => {
    async function fetchOutletSession() {
      try {
        const res = await fetch('/api/outlet');
        const data = await res.json();
        if (data.outletId) {
          setOutletId(data.outletId);
          setOutletName(data.outletName);
          fetchOutletEmployees(data.outletId); // Fetch employees once ID is known
        } else {
          console.error('Outlet ID not found in session data.');
        }
      } catch (err) {
        console.error('Error fetching outlet session:', err);
      }
    }
    fetchOutletSession();
  }, [fetchOutletEmployees]); // Dependency added

  /* -------- Fetch sales -------- */
  const fetchSales = useCallback(async () => {
    if (!outletId) return;

    setLoading(true);
    try {
      let query = supabase
        .from('customers')
        .select(
          `
          id,
          date,
          name,
          mobile,
          treatment,
          session_hours,
          amount_paid,
          took_package,
          package_amount,
          check_in_time,
          check_out_time,
          room,
          therapist_name,
          payment_method,
          group_customers
        `,
        )
        .eq('outlet_id', outletId)
        .order('check_in_time', { ascending: false });

      if (dateFilter) {
        // Apply standard date filter
        query = query.eq('date', dateFilter);
      }
      
      // 🛑 MODIFICATION 2 (Server-side): If overdue filter is active, only fetch open sales
      if (isOverdueFilterActive) {
          query = query.is('check_out_time', null);
      }


      const { data, error } = await query;
      if (error) throw error;

      let salesData = (data as Sale[]) || [];
      
      // 🛑 MODIFICATION 3 (Client-side): If overdue filter is active, filter the fetched results by time
      if (isOverdueFilterActive) {
          const now = new Date();
          salesData = salesData.filter(sale => {
              // Same exact check as in the SaleReminderPoller
              if (sale.check_in_time && sale.session_hours && !sale.check_out_time) {
                  const expected = getExpectedCheckoutTime(sale.check_in_time, sale.session_hours);
                  return expected && now >= expected;
              }
              return false;
          });
      }


      setSales(salesData);
    } catch (err) {
      console.error('Error fetching sales:', err);
    } finally {
      setLoading(false);
    }
  }, [dateFilter, outletId, isOverdueFilterActive]); // 🛑 Dependency added

  useEffect(() => {
    if (!outletId) return;
    fetchSales();

    const channel = supabase
      .channel(`customers-${outletId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'customers',
          filter: `outlet_id=eq.${outletId}`,
        },
        () => {
          fetchSales();
        },
      )
      .subscribe();

    return () => {
      try {
        supabase.removeChannel(channel);
      } catch {
        // ignore
      }
    };
  }, [fetchSales, outletId]);

  const handleCheckOut = useCallback(
    async (id: string) => {
      try {
        const { error } = await supabase
          .from('customers')
          .update({ check_out_time: new Date().toISOString() })
          .eq('id', id);
        if (error) throw error;
        if (warningSale && warningSale.id === id) {
          setWarningModalOpen(false);
          setWarningSale(null);
          setWarningExpectedTime(null);
        }
      } catch (error) {
        console.error('Error checking out:', error);
      }
    },
    [warningSale],
  );

  /* -------- Warning system (Unmodified) -------- */
  useEffect(() => {
    if (!isToday) {
      if (warningTimerRef.current) clearInterval(warningTimerRef.current);
      return;
    }

    const checkWarnings = () => {
      const now = new Date();
      if (warningModalOpen) return;

      for (const sale of sales.filter(
        (s) => s.check_in_time && !s.check_out_time && s.session_hours,
      )) {
        if (!snoozedClients.current.has(sale.id)) {
          const expected = getExpectedCheckoutTime(
            sale.check_in_time,
            sale.session_hours,
          );
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
      setTimeout(
        () => snoozedClients.current.delete(warningSale.id),
        300000,
      );
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

  const handleConfirmAddon = useCallback(
    async (
      saleId: string,
      extraMinutes: number,
      extraAmount: number,
      currentSale: Sale,
    ) => {
      if (extraMinutes <= 0 && extraAmount <= 0)
        return handleCloseAddonModal();

      try {
        const extraHours = extraMinutes / 60;
        const newHours = (currentSale.session_hours || 0) + extraHours;
        const newAmount =
          (currentSale.amount_paid || 0) + extraAmount * 100;

        const { error } = await supabase
          .from('customers')
          .update({
            session_hours: newHours,
            amount_paid: newAmount,
            treatment: `${currentSale.treatment} (+${extraMinutes}m addon, ₹${extraAmount})`,
          })
          .eq('id', saleId);

        if (error) throw error;
        console.log('Add-on saved successfully.');
        handleCloseAddonModal();
      } catch (err: any) {
        console.error(`Error saving add-on: ${err.message}`);
      }
    },
    [handleCloseAddonModal],
  );

  /* -------- NEW ASSIGNMENT HANDLERS (UNMODIFIED) -------- */

  const handleOpenAssignmentModal = useCallback((sale: Sale) => {
    setAssignmentSale(sale);
    setAssignmentModalOpen(true);
  }, []);

  const handleCloseAssignmentModal = useCallback(() => {
    setAssignmentSale(null);
    setAssignmentModalOpen(false);
    setIsAssignmentSaving(false);
  }, []);

  const handleSaveAssignment = useCallback(async (
    saleId: string, 
    mainTherapist: string, 
    mainRoom: string, 
    groupUpdates: { index: number, therapist: string, room: string }[]
  ) => {
    if (!assignmentSale) return;
    setIsAssignmentSaving(true);
    
    try {
        let newGroupCustomers = assignmentSale.group_customers ? [...assignmentSale.group_customers] : null;
        
        // 1. Update Group Customers JSON
        if (newGroupCustomers) {
            groupUpdates.forEach(update => {
                if (newGroupCustomers && newGroupCustomers[update.index]) {
                    newGroupCustomers[update.index] = {
                        ...newGroupCustomers[update.index],
                        therapist_name: update.therapist || null,
                        room: update.room || null,
                    };
                }
            });
        }
        
        // 2. Update Main Customer Record
        const { error } = await supabase
            .from('customers')
            .update({
                therapist_name: mainTherapist || null,
                room: mainRoom || null,
                group_customers: newGroupCustomers,
            })
            .eq('id', saleId);

        if (error) throw error;

        console.log('Staff assignment saved successfully.');
        handleCloseAssignmentModal();
    } catch (err: any) {
        console.error(`Error saving assignment: ${err.message}`);
        setIsAssignmentSaving(false);
    }
  }, [assignmentSale, handleCloseAssignmentModal]);


  const getAssignmentData = useMemo(() => {
    if (!assignmentSale) return null;

    return {
      saleId: assignmentSale.id,
      mainCustomerName: assignmentSale.name,
      initialTherapist: assignmentSale.therapist_name,
      initialRoom: assignmentSale.room,
      groupCustomers: assignmentSale.group_customers,
    };
  }, [assignmentSale]);


  /* -------- Totals (Unchanged) -------- */
  const completedSales = useMemo(
    () => sales.filter((sale) => sale.check_out_time),
    [sales],
  );

  const totalSales = useMemo(
    () =>
      completedSales.reduce(
        (a, s) => a + (s.took_package ? s.package_amount : s.amount_paid),
        0,
      ),
    [completedSales],
  );

  const totalCashSales = useMemo(
    () =>
      completedSales
        .filter((s) => s.payment_method === 'cash')
        .reduce((a, s) => a + s.amount_paid, 0),
    [completedSales],
  );

  const totalUpiSales = useMemo(
    () =>
      completedSales
        .filter((s) => s.payment_method === 'upi')
        .reduce((a, s) => a + s.amount_paid, 0),
    [completedSales],
  );

  const totalCardSales = useMemo(
    () =>
      completedSales
        .filter((s) => s.payment_method === 'card')
        .reduce((a, s) => a + s.amount_paid, 0),
    [completedSales],
  );

  const totalPackageSales = useMemo(
    () =>
      completedSales
        .filter((s) => s.took_package)
        .reduce((a, s) => a + s.package_amount, 0),
    [completedSales],
  );

  const activeSalesCount = sales.filter((s) => !s.check_out_time).length;

  /* ===================== RENDER ===================== */

  return (
    <div className="space-y-6">
      {/* Modals */}
      <AddonModal
        sale={selectedSale}
        onClose={handleCloseAddonModal}
        onConfirm={handleConfirmAddon}
      />
      <CheckoutConfirmModal
        sale={warningSale}
        expectedTime={warningExpectedTime}
        onClose={handleWarningModalClose}
        onCheckout={handleCheckOut}
        onAddon={handleOpenAddonModal}
      />
      {/* NEW ASSIGNMENT MODAL */}
      <StaffAssignmentModal 
        data={getAssignmentData}
        employees={employees}
        onClose={handleCloseAssignmentModal}
        onSave={handleSaveAssignment}
        isSaving={isAssignmentSaving}
      />

      <h1 className="text-2xl font-bold text-gray-800">
        {outletName} Sales &amp; Check-out{' '}
        {/* 🛑 FIX: Display filter status */}
        {isOverdueFilterActive ? ' (Overdue Sales)' : (isToday ? ' (Today)' : ` (${dateFilter})`)}
      </h1>
      
      {/* 🛑 NEW: Filter Active Indicator */}
      {isOverdueFilterActive && (
          <div className="p-3 bg-red-100 border border-red-300 text-red-700 rounded-lg text-sm flex items-center justify-between">
              <span>⚠️ Displaying only currently **Overdue Sales** for {today}.</span>
              <button 
                  onClick={() => setIsOverdueFilterActive(false)} 
                  className="text-red-700 hover:text-red-900 font-medium"
              >
                  &times; Clear Filter
              </button>
          </div>
      )}


      {/* Date Filter */}
      <div className="bg-white p-4 rounded-xl shadow-sm grid grid-cols-1 md:grid-cols-3 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Date Filter
          </label>
          <input
            type="date"
            value={dateFilter}
            onChange={(e) => {
              // 🛑 FIX: Clear overdue filter if the user manually changes the date
              if(isOverdueFilterActive) setIsOverdueFilterActive(false);
              setDateFilter(e.target.value);
            }}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-black"
            // Disable date input when overdue filter is active, as it forces today's date
            disabled={isOverdueFilterActive} 
          />
        </div>
      </div>

      {/* Totals (Unchanged) */}
      <div className="bg-white p-6 rounded-xl shadow-sm">
        <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-6">
          <div>
            <h3 className="text-black text-sm">Total Completed Sales</h3>
            <p className="text-2xl mt-2 font-bold text-green-600">
              {formatCurrency(totalSales)}
            </p>
            <p className="text-xs text-black">
              {completedSales.length} sessions
            </p>
            <p className="text-xs text-gray-500">
              {activeSalesCount} active
            </p>
          </div>
          <div>
            <h3 className="text-black text-sm">Total Cash Sales</h3>
            <p className="text-2xl mt-2 font-bold text-blue-600">
              {formatCurrency(totalCashSales)}
            </p>
          </div>
          <div>
            <h3 className="text-black text-sm">Total UPI Sales</h3>
            <p className="text-2xl mt-2 font-bold text-purple-600">
              {formatCurrency(totalUpiSales)}
            </p>
          </div>
          <div>
            <h3 className="text-black text-sm">Total Card Sales</h3>
            <p className="text-2xl mt-2 font-bold text-indigo-600">
              {formatCurrency(totalCardSales)}
            </p>
          </div>
          <div>
            <h3 className="text-black text-sm">Total Package Value</h3>
            <p className="text-2xl mt-2 font-bold text-black">
              {formatCurrency(totalPackageSales)}
            </p>
          </div>
        </div>
      </div>

      {/* Sales Table */}
      <div className="bg-white shadow rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-3 py-2 text-xs font-medium text-gray-600 uppercase text-left">
                  Customer
                </th>
                <th className="px-3 py-2 text-xs font-medium text-gray-600 uppercase text-left">
                  Service / Group Details
                </th>
                <th className="px-3 py-2 text-xs font-medium text-gray-600 uppercase text-left">
                  Duration
                </th>
                <th className="px-3 py-2 text-xs font-medium text-gray-600 uppercase text-left">
                  Amount
                </th>
                <th className="px-3 py-2 text-xs font-medium text-gray-600 uppercase text-left">
                  Payment
                </th>
                <th className="px-3 py-2 text-xs font-medium text-gray-600 uppercase text-left">
                  Session Time
                </th>
                <th className="px-3 py-2 text-xs font-medium text-gray-600 uppercase text-left">
                  Therapist & Room
                </th>
                <th className="px-3 py-2 text-xs font-medium text-gray-600 uppercase text-left">
                  Action
                </th>
              </tr>
            </thead>

            <tbody className="bg-white divide-y divide-gray-200">
              {loading ? (
                <tr>
                  <td colSpan={8} className="p-6 text-center">
                    Loading...
                  </td>
                </tr>
              ) : sales.length === 0 ? (
                <tr>
                  <td colSpan={8} className="p-6 text-center">
                    {isOverdueFilterActive 
                        ? "No overdue sales found for today." 
                        : "No sales found for this date."
                    }
                  </td>
                </tr>
              ) : (
                sales.map((sale) => {
                  const groupCount = sale.group_customers
                    ? sale.group_customers.length
                    : 0;
                  const totalGuests = 1 + groupCount;
                  const customerLabel =
                    groupCount > 0
                      ? `${sale.name} + ${groupCount} more`
                      : sale.name;
                  const isGroupExpanded = !!expandedGroups[sale.id];
                  
                  // Check if assignment is needed (null or placeholder text)
                  const needsAssignment = 
                      !sale.check_out_time && (
                          (sale.therapist_name === null || sale.room === null || sale.therapist_name === 'CLIENT_FORM_PENDING') || 
                          (sale.group_customers && sale.group_customers.some(gc => gc.therapist_name === null || gc.room === null || gc.therapist_name === 'CLIENT_FORM_PENDING' || gc.room === 'CLIENT_FORM_PENDING'))
                      );

                  const expected = getExpectedCheckoutTime(
                    sale.check_in_time,
                    sale.session_hours,
                  );

                  // 🛑 NEW: Highlight overdue sales even when the filter is not active
                  const isOverdueSale = 
                      !sale.check_out_time && expected && new Date() >= expected;


                  return (
                    <tr
                      key={sale.id}
                      className={
                        sale.check_out_time
                          ? 'bg-gray-50 opacity-60'
                          : isOverdueSale // Apply overdue style regardless of filter
                            ? 'bg-yellow-50 hover:bg-yellow-100'
                            : needsAssignment ? 'bg-red-50 hover:bg-red-100' 
                            : ''
                      }
                    >
                      {/* Customer */}
                      <td className="px-3 py-2 text-xs text-left align-top">
                        <div className="font-medium text-gray-900">
                          {customerLabel}
                        </div>
                        <div className="text-gray-600">{sale.mobile}</div>
                        {totalGuests > 1 && (
                          <div className="text-[11px] text-gray-500 mt-0.5">
                            Group of {totalGuests}
                          </div>
                        )}
                      </td>

                      {/* Service / Group */}
                      <td className="px-3 py-2 text-xs text-gray-700 max-w-xs text-left align-top">
                        {/* Top row: service + dropdown button */}
                        <div className="flex items-start justify-between gap-2">
                          <div className="text-gray-900 font-semibold">
                            {sale.took_package ? (
                              <span className="text-purple-700">
                                New Package
                              </span>
                            ) : (
                              <span>{sale.treatment}</span>
                            )}
                          </div>

                          {groupCount > 0 && (
                            <button
                              type="button"
                              onClick={() => toggleGroup(sale.id)}
                              className="flex items-center gap-1 text-[11px] px-2 py-1 rounded-full border border-gray-300 text-gray-700 hover:bg-gray-100"
                            >
                              {isGroupExpanded ? (
                                <>
                                  <ChevronUp className="h-3 w-3" />
                                  Hide group
                                </>
                              ) : (
                                <>
                                  <ChevronDown className="h-3 w-3" />
                                  View group ({groupCount})
                                </>
                              )}
                            </button>
                          )}
                        </div>

                        {/* Group members (when expanded) */}
                        {sale.group_customers &&
                          sale.group_customers.length > 0 &&
                          isGroupExpanded && (
                            <div className="mt-2 pt-2 border-t border-gray-200 space-y-1 text-[11px] text-gray-700">
                              <div className="font-semibold text-gray-800">
                                Group Members:
                              </div>
                              {sale.group_customers.map((gc, idx) => {
                                const therapistStatus = gc.therapist_name === null || gc.therapist_name === 'CLIENT_FORM_PENDING' ? <span className='text-red-500 font-bold'>PENDING</span> : gc.therapist_name || '—';
                                const roomStatus = gc.room === null || gc.room === 'CLIENT_FORM_PENDING' ? <span className='text-red-500 font-bold'>PENDING</span> : gc.room || '—';
                                
                                return (
                                  <div key={idx}>
                                    <span className="font-medium">
                                      {gc.name || `Guest ${idx + 2}`}
                                    </span>
                                    {': '}
                                    {gc.treatment || '—'} ·{' '}
                                    {formatDuration(gc.sessionHours)} ·{' '}
                                    {therapistStatus} · Room{' '}
                                    {roomStatus} · In{' '}
                                    {formatPlainTime(gc.in_time)} / Out{' '}
                                    {formatPlainTime(gc.out_time)}
                                  </div>
                                );
                              })}
                            </div>
                          )}
                      </td>

                      {/* Duration (main only) */}
                      <td className="px-3 py-2 text-xs text-gray-700 text-left align-top">
                        {formatDuration(sale.session_hours)}
                      </td>

                      {/* Amount */}
                      <td className="px-3 py-2 text-xs font-medium text-green-600 text-left align-top">
                        {formatCurrency(
                          sale.took_package
                            ? sale.package_amount
                            : sale.amount_paid,
                        )}
                      </td>

                      {/* Payment */}
                      <td className="px-3 py-2 text-xs text-gray-700 text-left align-top">
                        {formatPaymentMethod(
                          sale.payment_method,
                          sale.took_package,
                        )}
                      </td>

                      {/* Times */}
                      <td className="px-3 py-2 text-xs text-gray-700 text-left align-top">
                        In: {formatTime(sale.check_in_time)}
                        <br />
                        {sale.check_out_time ? (
                          <>Out: {formatTime(sale.check_out_time)}</>
                        ) : expected ? (
                          <span className={isOverdueSale ? "font-bold text-red-600" : "text-gray-700"}>
                            Est: {formatTime(expected.toISOString())}
                          </span>
                        ) : (
                          <>Out: —</>
                        )}
                      </td>

                      {/* Staff Assignment */}
                      <td className="px-3 py-2 text-xs text-left align-top">
                          <div className="text-gray-800 font-medium">
                              {sale.therapist_name || '—'}
                          </div>
                          <div className="text-gray-600">
                              Room: {sale.room || '—'}
                          </div>
                          
                          {needsAssignment && (
                              <button
                                  onClick={() => handleOpenAssignmentModal(sale)}
                                  className="mt-1 px-2 py-0.5 bg-red-100 text-red-700 rounded text-[10px] font-semibold hover:bg-red-200 transition"
                              >
                                  Assign Staff
                              </button>
                          )}
                      </td>
                      
                      {/* Action */}
                      <td className="px-3 py-2 text-xs text-left align-top">
                        {sale.check_out_time ? (
                          <span className="px-3 py-1 bg-green-100 text-green-700 rounded-full text-xs font-medium">
                            Completed
                          </span>
                        ) : (
                          <div className="flex flex-col gap-1">
                            
                            <button
                              onClick={() => handleCheckOut(sale.id)}
                              className="px-3 py-1 bg-green-600 hover:bg-green-700 text-white rounded text-xs transition duration-150"
                            >
                              Checkout
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
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}