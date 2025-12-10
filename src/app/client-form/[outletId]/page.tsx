// app/(protected)/client-entry/page.tsx
'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { OUTLETS, Outlet } from '@/lib/outlet';
import {
  Clock,
  Calendar,
  MapPin,
  User,
  Tag,
  RefreshCcw,
  X,
  Info,
} from 'lucide-react';

// OFFLINE imports
import { offlineDb } from '@/lib/offlineDb';
import { OfflineClientPayload } from '@/lib/types';
import { v4 as uuidv4 } from 'uuid';

// --- Type Definitions ---
type Treatment = { id: string; name: string };

// Extended ClientInfo type
type ClientInfo = {
  status: 'active' | 'expired' | 'not_found';
  name: string;
  mobile: string;
  remainingHours: number;
  expiryDate: string | null; // Added expiry date
  packageId: string | null; // ID of the currently active package
  // NEW FIELDS for progress bar
  totalPackageHours: number;
  usedPackageHours: number;
};

type Employee = {
  id: string;
  name: string;
  is_checked_in?: boolean;
  role?: string | null;
  outlet_id?: string | null;
  is_active?: boolean;
};

// New Type for Visit History
type VisitHistory = {
  id: string;
  date: string;
  sessionHours: number;
  treatment: string;
  outlet: string;
  therapist_name: string; // Combined therapist name field
  check_in_time: string;
  isPackageUsed: boolean;
};

// NEW: Additional customer type for group entries
type AdditionalCustomer = {
  id: string;
  name: string;
  treatment: string;
  therapist: string;
  room: string;
  sessionHours: number;
  sessionMinutes: number;
};

// --- Helper Functions ---
const formatDuration = (hours: number): string => {
  const h = Math.floor(hours);
  const m = Math.round((hours - h) * 60);
  if (h === 0 && m === 0) return '0 mins';
  const hourString = h > 0 ? `${h} hr` : '';
  const minuteString = m > 0 ? `${m} mins` : '';
  return `${hourString} ${minuteString}`.trim();
};

const formatDate = (isoString: string | null): string => {
  if (!isoString) return 'N/A';
  try {
    return new Date(isoString).toLocaleDateString('en-IN', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  } catch {
    return 'Invalid Date';
  }
};

// HH:mm helper (local time)
const formatTimeHM = (date: Date): string => {
  const h = date.getHours().toString().padStart(2, '0');
  const m = date.getMinutes().toString().padStart(2, '0');
  return `${h}:${m}`;
};

// --- Package History Modal Component ---
interface PackageHistoryModalProps {
  clientInfo: ClientInfo;
  mobile: string;
  onClose: () => void;
}

const PackageHistoryModal: React.FC<PackageHistoryModalProps> = ({
  clientInfo,
  mobile,
  onClose,
}) => {
  const [history, setHistory] = useState<VisitHistory[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const packageHoursUsed = history
    .filter((v) => v.isPackageUsed)
    .reduce((sum, v) => sum + v.sessionHours, 0);
  const totalVisits = history.length;

  const fetchPackageHistory = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const { data: visits, error: visitsError } = await supabase
        .from('customers')
        .select(`
          id, 
          date, 
          session_hours, 
          treatment, 
          outlet_name, 
          therapist_name, 
          check_in_time, 
          is_package_customer
        `)
        .eq('mobile', mobile)
        .order('check_in_time', { ascending: false });

      if (visitsError) throw visitsError;

      const formattedHistory: VisitHistory[] = (visits || []).map((visit: any) => ({
        id: visit.id,
        date: formatDate(visit.check_in_time),
        sessionHours: visit.session_hours,
        treatment: visit.treatment,
        outlet: visit.outlet_name,
        therapist_name: visit.therapist_name || 'Self/N/A',
        check_in_time: visit.check_in_time,
        isPackageUsed: visit.is_package_customer,
      }));

      setHistory(formattedHistory);
    } catch (err: any) {
      console.error('Error fetching history:', err);
      setError(err.message || 'Failed to fetch visit history.');
      setHistory([]);
    } finally {
      setLoading(false);
    }
  }, [mobile]);

  useEffect(() => {
    fetchPackageHistory();
  }, [fetchPackageHistory]);

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center p-4 z-50">
      <div className="bg-gray-900 rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col border border-red-500/50">
        <div className="p-6 border-b border-gray-700 flex justify-between items-center">
          <h2 className="text-xl font-bold text-red-500 flex items-center gap-2">
            <Tag className="h-5 w-5" /> {clientInfo.name}&apos;s Package History
          </h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white transition-colors p-1 rounded-full bg-gray-800 hover:bg-gray-700"
          >
            <X size={20} />
          </button>
        </div>

        {/* --- Summary Bar --- */}
        <div className="grid grid-cols-3 gap-3 p-4 bg-gray-800 border-b border-gray-700">
          <div className="bg-gray-700 p-3 rounded-lg text-center">
            <p className="text-xs text-gray-400 uppercase font-medium">Remaining</p>
            <p
              className={`text-lg font-bold ${
                clientInfo.remainingHours > 0 ? 'text-green-400' : 'text-yellow-400'
              }`}
            >
              {formatDuration(clientInfo.remainingHours)}
            </p>
          </div>
          <div className="bg-gray-700 p-3 rounded-lg text-center">
            <p className="text-xs text-gray-400 uppercase font-medium">Expiry Date</p>
            <p
              className={`text-lg font-bold ${
                clientInfo.status === 'active' ? 'text-white' : 'text-red-400'
              }`}
            >
              {clientInfo.expiryDate ? formatDate(clientInfo.expiryDate) : 'N/A'}
            </p>
          </div>
          <div className="bg-gray-700 p-3 rounded-lg text-center">
            <p className="text-xs text-gray-400 uppercase font-medium">Visits</p>
            <p className="text-lg font-bold text-white">
              {totalVisits} Total ({history.filter((v) => v.isPackageUsed).length} Used)
            </p>
          </div>
        </div>

        {/* --- History List --- */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {loading ? (
            <div className="text-center p-8 text-gray-400">
              <RefreshCcw className="animate-spin h-5 w-5 mx-auto mb-2" />
              Loading visits...
            </div>
          ) : error ? (
            <div className="text-center p-4 text-red-400 bg-red-900/50 rounded-lg">
              {error}
            </div>
          ) : history.length === 0 ? (
            <div className="text-center p-8 text-gray-400">
              No previous visits recorded for this number.
            </div>
          ) : (
            history.map((visit, index) => (
              <div
                key={index}
                className="bg-gray-800 p-4 rounded-lg border border-gray-700 hover:border-red-500/50 transition duration-150"
              >
                <div className="flex justify-between items-start mb-2">
                  <h3 className="text-md font-semibold text-white flex items-center gap-2">
                    <Calendar className="h-4 w-4 text-gray-400" /> {visit.date}
                  </h3>
                  <span
                    className={`px-2 py-0.5 text-xs font-medium rounded-full ${
                      visit.isPackageUsed
                        ? 'bg-red-900 text-red-300'
                        : 'bg-green-900 text-green-300'
                    }`}
                  >
                    {visit.isPackageUsed ? 'Package Used' : 'Paid Session'}
                  </span>
                </div>

                <p className="text-sm text-gray-300 mb-1 flex items-center gap-2">
                  <Clock className="h-4 w-4 text-gray-500" /> <strong>Duration:</strong>{' '}
                  {formatDuration(visit.sessionHours)}
                </p>
                <p className="text-sm text-gray-300 mb-1 flex items-center gap-2">
                  <Info className="h-4 w-4 text-gray-500" /> <strong>Treatment:</strong>{' '}
                  {visit.treatment}
                </p>
                <p className="text-sm text-gray-300 mb-1 flex items-center gap-2">
                  <User className="h-4 w-4 text-gray-500" /> <strong>Therapist:</strong>{' '}
                  {visit.therapist_name}
                </p>
                <p className="text-sm text-gray-300 flex items-center gap-2">
                  <MapPin className="h-4 w-4 text-gray-500" /> <strong>Outlet:</strong>{' '}
                  {visit.outlet}
                </p>
              </div>
            ))
          )}
        </div>

        <div className="p-4 border-t border-gray-700">
          <button
            onClick={onClose}
            className="w-full py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg font-medium transition"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

// --- Main Form Component ---
export default function ClientCheckinForm() {
  const params = useParams();
  const outletId = params.outletId as string;
  const router = useRouter();

  const [outlet, setOutlet] = useState<Outlet | null>(null);
  const [treatments, setTreatments] = useState<Treatment[]>([]);
  const [mobile, setMobile] = useState('');
  const [clientInfo, setClientInfo] = useState<ClientInfo | null>(null);
  const lookupTimeout = useRef<NodeJS.Timeout | null>(null);

  // Main (primary) customer + payment/package data
  const [formData, setFormData] = useState({
    name: '',
    treatment: '',
    amountPaid: 0,
    sessionHours: 0,
    sessionMinutes: 0,
    paymentMethod: 'cash',
    tookPackage: false,
    packageAmount: 0,
    totalPackageHours: 0,
    packageValidity: '3 months',
    sold_by: '',
    therapistPrimary: '', // primary therapist
    therapistSecondary: '', // secondary therapist (hidden by default)
    showSecondaryTherapist: false, // reveal second therapist
    room: '',
  });

  // NEW: additional customers in the same sale
  const [additionalCustomers, setAdditionalCustomers] = useState<AdditionalCustomer[]>([]);

  // --- State for employees list (therapists only, checked-in) ---
  const [employees, setEmployees] = useState<Employee[]>([]);

  // --- State for all staff in outlet (used for "Sold By") ---
  const [outletStaff, setOutletStaff] = useState<Employee[]>([]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // --- NEW: Modal State ---
  const [isHistoryModalOpen, setIsHistoryModalOpen] = useState(false);

  // --- Data Fetching Functions (Memoized for reuse) ---
  const fetchTreatments = useCallback(async () => {
    if (!outletId) return;
    try {
      const { data, error: dbError } = await supabase
        .from('treatments')
        .select('id, name')
        .eq('outlet_id', outletId);
      if (dbError) throw dbError;
      setTreatments(data || []);
    } catch (err) {
      console.error('Error fetching treatments:', err);
      setTreatments([]);
    }
  }, [outletId]);

  /**
   * fetchStaff (OUTLET-SPECIFIC, DYNAMIC)
   */
  const fetchStaff = useCallback(async () => {
    if (!outletId) {
      setEmployees([]);
      return;
    }

    // 1. Get the current outlet's name based on the URL ID
    const currentOutletName = OUTLETS.find((o) => o.id === outletId)?.name;
    if (!currentOutletName) {
      console.error('Outlet name not found for ID:', outletId);
      setEmployees([]);
      return;
    }

    try {
      const { data, error } = await supabase
        .from('employees')
        .select('id, name, is_checked_in, role, outlet_id')
        .eq('is_active', true)
        .eq('role', 'therapist') // only therapists
        .eq('is_checked_in', true) // only currently checked-in
        // *** CRITICAL CHANGE: Filter by the dynamic current_outlet_name ***
        .eq('current_outlet_name', currentOutletName)
        .order('name', { ascending: true });

      if (error) {
        console.error('Error fetching dynamic therapists:', error);
        setEmployees([]);
        return;
      }

      setEmployees(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error('Unexpected fetchStaff error:', err);
      setEmployees([]);
    }
  }, [outletId]);

  /**
   * fetchOutletStaff
   * - Loads all active staff for this outlet (used for "Sold By" dropdown)
   */
  const fetchOutletStaff = useCallback(async () => {
    if (!outletId) {
      setOutletStaff([]);
      return;
    }

    try {
      const { data, error } = await supabase
        .from('employees')
        .select('id, name, role, outlet_id, is_active')
        .eq('is_active', true)
        .eq('outlet_id', outletId)
        .order('name', { ascending: true });

      if (error) {
        console.error('Error fetching outlet staff:', error);
        setOutletStaff([]);
        return;
      }

      setOutletStaff(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error('Unexpected fetchOutletStaff error:', err);
      setOutletStaff([]);
    }
  }, [outletId]);

  // --- Initial Load & Outlet Validation ---
  useEffect(() => {
    if (!outletId) {
      setError('Outlet ID missing in URL.');
      setLoading(false);
      return;
    }
    setLoading(true);
    setError('');
    const outletInfo = OUTLETS.find((o) => o.id === outletId);
    if (!outletInfo) {
      setError('Invalid Outlet ID.');
      setLoading(false);
      return;
    }
    setOutlet(outletInfo);

    // Initial data fetch
    Promise.all([fetchTreatments(), fetchStaff(), fetchOutletStaff()])
      .then(() => {
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [outletId, fetchTreatments, fetchStaff, fetchOutletStaff]);

  // --- Realtime listeners to keep staff/treatments fresh ---
  useEffect(() => {
    if (!outletId) return;

    const channel = supabase
      .channel(`client-form-realtime-${outletId}`)

      // *** MODIFIED: Remove outletId filter from 'employees' channel ***
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'employees' }, // <-- NO FILTER
        () => {
          // Refresh both therapists and outlet staff on employees change (role/active/check-in may change)
          fetchStaff();
          fetchOutletStaff();
        },
      )
      // listen attendance changes for this outlet (if your attendance table has an outlet_id column)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'attendance', filter: `outlet_id=eq.${outletId}` },
        () => {
          fetchStaff();
        },
      )
      // treatments changes for this outlet
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'treatments', filter: `outlet_id=eq.${outletId}` },
        () => {
          fetchTreatments();
        },
      )
      .subscribe();

    return () => {
      try {
        supabase.removeChannel(channel);
      } catch (e) {
        console.warn('Failed to remove realtime channel', e);
      }
    };
  }, [fetchStaff, fetchTreatments, fetchOutletStaff, outletId]);

  // --- Client lookup (same as before, now fetches more info) ---
  const performClientLookup = useCallback(async () => {
    if (mobile.length !== 10) return;
    try {
      setError('');
      const res = await fetch(`/api/client-lookup?mobile=${encodeURIComponent(mobile)}`);
      if (!res.ok) {
        setClientInfo({
          status: 'not_found',
          name: '',
          mobile,
          remainingHours: 0,
          expiryDate: null,
          packageId: null,
          totalPackageHours: 0,
          usedPackageHours: 0,
        });
        setFormData((prev) => ({ ...prev, name: '' }));
        return;
      }

      const data: any | null = await res.json();

      const finalClientInfo: ClientInfo =
        data && data.status !== 'not_found'
          ? {
              status: data.status,
              name: data.name,
              mobile: data.mobile,
              remainingHours: data.remainingHours || 0,
              expiryDate: data.expiryDate || null,
              packageId: data.packageId || null,
              totalPackageHours: data.totalPackageHours || 0,
              usedPackageHours: data.usedPackageHours || 0,
            }
          : {
              status: 'not_found',
              name: '',
              mobile,
              remainingHours: 0,
              expiryDate: null,
              packageId: null,
              totalPackageHours: 0,
              usedPackageHours: 0,
            };

      setClientInfo(finalClientInfo);

      if (finalClientInfo.status !== 'not_found') {
        setFormData((prev) => ({
          ...prev,
          name: finalClientInfo.name || '',
        }));
      } else {
        setFormData((prev) => ({
          ...prev,
          name: '',
        }));
      }
    } catch (e) {
      console.error('Client lookup error:', e);
      setClientInfo({
        status: 'not_found',
        name: '',
        mobile,
        remainingHours: 0,
        expiryDate: null,
        packageId: null,
        totalPackageHours: 0,
        usedPackageHours: 0,
      });
      setFormData((prev) => ({ ...prev, name: '' }));
    }
  }, [mobile]);

  useEffect(() => {
    setClientInfo(null);
    if (mobile.length < 10) {
      setFormData((prev) => ({ ...prev, name: '' }));
    }
    if (lookupTimeout.current) {
      clearTimeout(lookupTimeout.current);
    }
    if (mobile.length === 10) {
      lookupTimeout.current = setTimeout(() => {
        performClientLookup();
      }, 300);
    }
    return () => {
      if (lookupTimeout.current) {
        clearTimeout(lookupTimeout.current);
      }
    };
  }, [mobile, performClientLookup]);

  // handleChange supports checkbox and number coercion
  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value, type } = e.target;
    const checked = type === 'checkbox' ? (e.target as HTMLInputElement).checked : undefined;

    setError('');

    setFormData((prev) => {
      let updatedValue: string | number | boolean;
      if (type === 'checkbox') {
        updatedValue = checked ?? false;
      } else if (type === 'number') {
        updatedValue = value === '' ? 0 : Number(value);
      } else {
        updatedValue = value;
      }
      const updated: any = { ...prev, [name]: updatedValue };

      // if user toggles off showSecondaryTherapist, clear secondary therapist selection
      if (name === 'showSecondaryTherapist' && updatedValue === false) {
        updated.therapistSecondary = '';
      }

      if (name === 'tookPackage' && checked) {
        updated.amountPaid = 0;
      }

      return updated;
    });
  };

  const getSessionDuration = useCallback(() => {
    const hours = Number(formData.sessionHours) || 0;
    const minutes = Number(formData.sessionMinutes) || 0;
    return hours + minutes / 60;
  }, [formData.sessionHours, formData.sessionMinutes]);

  const getFinalAmountInPaise = useCallback(() => {
    if (formData.tookPackage) {
      return (Number(formData.packageAmount) || 0) * 100;
    }
    return (Number(formData.amountPaid) || 0) * 100;
  }, [formData.tookPackage, formData.packageAmount, formData.amountPaid]);

  // NEW: helpers for additional customers
  const addAdditionalCustomer = () => {
    setAdditionalCustomers((prev) => [
      ...prev,
      {
        id: uuidv4(),
        name: '',
        treatment: '',
        therapist: '',
        room: '',
        sessionHours: 0,
        sessionMinutes: 0,
      },
    ]);
  };

  const removeAdditionalCustomer = (id: string) => {
    setAdditionalCustomers((prev) => prev.filter((c) => c.id !== id));
  };

  const updateAdditionalCustomer = <K extends keyof AdditionalCustomer>(
    id: string,
    field: K,
    value: AdditionalCustomer[K],
  ) => {
    setAdditionalCustomers((prev) =>
      prev.map((c) => (c.id === id ? { ...c, [field]: value } : c)),
    );
  };

  // --- UPDATED handleSubmit (uses local paymentMethod & outlet for redirect) ---
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    setLoading(true);

    if (!outlet) {
      setError('Outlet information is missing. Please refresh the page.');
      setLoading(false);
      return;
    }

    const sessionHours = getSessionDuration();
    const totalPackageHours = Number(formData.totalPackageHours) || 0;

    // ✅ Snapshot values we need for redirect logic
    const paymentMethod = formData.paymentMethod;
    const finalAmountInPaise = getFinalAmountInPaise();
    const outletIdForRedirect = outlet.id;

    // --- Validation: primary customer ---
    if (sessionHours > 0 && !String(formData.therapistPrimary || '').trim()) {
      setError('Please select a Therapist (Primary) for the main customer.');
      setLoading(false);
      return;
    }

    if (formData.tookPackage) {
      if (
        !formData.packageAmount ||
        formData.packageAmount <= 0 ||
        !totalPackageHours ||
        totalPackageHours <= 0
      ) {
        setError('Please enter a valid Package Amount and Total Hours.');
        setLoading(false);
        return;
      }
      if (!formData.sold_by.trim()) {
        setError('Please select the staff member who sold the package.');
        setLoading(false);
        return;
      }
      if (sessionHours > totalPackageHours) {
        setError('First session duration cannot be longer than the total package hours.');
        setLoading(false);
        return;
      }
    } else {
      if (sessionHours <= 0) {
        setError('Please enter a valid Session Duration (e.g., 1 hour 30 mins) for main customer.');
        setLoading(false);
        return;
      }
      const amountInRupees = Number(formData.amountPaid) || 0;
      const MIN_AMOUNT_RUPEES = 1500;

      if (amountInRupees < MIN_AMOUNT_RUPEES) {
        setError(
          `Amount (₹${amountInRupees}) is below the minimum of ₹${MIN_AMOUNT_RUPEES}. Redirecting...`,
        );
        setLoading(true);
        setTimeout(() => {
          router.push(`/payment-declined?outletId=${outletId}&amount=${amountInRupees}`);
        }, 1500);
        return;
      }
    }

    // --- Validation: additional customers in the same sale ---
    for (let i = 0; i < additionalCustomers.length; i++) {
      const c = additionalCustomers[i];
      const duration =
        (Number(c.sessionHours) || 0) + (Number(c.sessionMinutes) || 0) / 60;

      if (!c.treatment || !c.therapist || !c.room || duration <= 0) {
        setError(
          `Please fill treatment, therapist, room and duration for customer ${i + 2}.`,
        );
        setLoading(false);
        return;
      }
    }

    const treatmentName = formData.treatment;

    // generate client_uuid here and attach to payload (helps idempotency)
    const clientUuid =
      typeof uuidv4 === 'function' ? uuidv4() : `${Date.now()}-${Math.random()}`;

    try {
      // Base check-in time for the whole group
      const checkInTime: string | null = new Date().toISOString();
      const checkInDate = new Date(checkInTime);
      const mainOutDate = new Date(
        checkInDate.getTime() + sessionHours * 60 * 60 * 1000,
      );
      const mainInTimeStr = formatTimeHM(checkInDate);
      const mainOutTimeStr = formatTimeHM(mainOutDate);

      // Build therapist info:
      const therapistPrimary = String(formData.therapistPrimary || '').trim() || null;
      const therapistSecondary = formData.showSecondaryTherapist
        ? (String(formData.therapistSecondary || '').trim() || null)
        : null;
      const therapistCombined =
        therapistPrimary && therapistSecondary
          ? `${therapistPrimary} & ${therapistSecondary}`
          : therapistPrimary || therapistSecondary || null;

      const isPackageUsed = !formData.tookPackage && clientInfo?.status === 'active';

      // Build group customers payload (auto time)
      const groupCustomersPayload = additionalCustomers.map((c) => {
        const dur =
          (Number(c.sessionHours) || 0) + (Number(c.sessionMinutes) || 0) / 60;
        const outDate = new Date(
          checkInDate.getTime() + dur * 60 * 60 * 1000,
        );
        return {
          name: c.name.trim(),
          treatment: c.treatment,
          therapist_name: c.therapist,
          room: c.room,
          sessionHours: dur,
          in_time: mainInTimeStr,
          out_time: formatTimeHM(outDate),
        };
      });

      const payload = {
        client_uuid: clientUuid,
        name: String(formData.name || '').trim(),
        mobile: mobile,
        date: new Date().toISOString().split('T')[0],
        treatment: treatmentName,

        tookPackage: formData.tookPackage,
        packageAmount: formData.tookPackage ? (Number(formData.packageAmount) || 0) * 100 : 0,
        totalPackageHours: totalPackageHours,
        packageSoldBy: formData.tookPackage ? formData.sold_by.trim() : null,
        packageValidity: formData.tookPackage ? formData.packageValidity : null,

        amountPaid: formData.tookPackage ? 0 : finalAmountInPaise,
        sessionHours: sessionHours,
        isPackageCustomer: isPackageUsed,
        packageId: isPackageUsed ? clientInfo?.packageId : null,

        outlet: outlet.name,
        outlet_id: outlet.id,
        paymentMethod: paymentMethod,
        finalAmountInPaise: finalAmountInPaise,
        check_in_time: checkInTime,

        therapist_name: therapistCombined,
        therapist_primary: therapistPrimary,
        therapist_secondary: therapistSecondary,

        room: formData.room || null,

        // Auto-calculated in/out time for main customer
        in_time: mainInTimeStr,
        out_time: mainOutTimeStr,

        // full group in same sale
        group_customers: groupCustomersPayload,
      };

      const res = await fetch('/api/client-form-submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error((data as any).error || `Submission failed (${res.status})`);
      }

      // ✅ Use local paymentMethod + outlet for redirect (no dependency on API response shape)
      if (paymentMethod === 'upi') {
        setSuccess('Registration complete. Redirecting to payment QR...');
        const amountInRupees = finalAmountInPaise / 100;
        setTimeout(() => {
          router.push(
            `/pay/qr/${outletIdForRedirect}?amount=${amountInRupees}&outletId=${outletIdForRedirect}`,
          );
        }, 1500);
      } else {
        setSuccess('Registration successful! Redirecting...');
        setTimeout(() => {
          router.push(`/client-cash-success?outletId=${outletIdForRedirect}`);
        }, 1500);
      }
    } catch (err: any) {
      console.error('Submit error:', err);

      // OFFLINE FALLBACK: save to IndexedDB so the receptionist can continue working
      try {
        const localPayload: OfflineClientPayload = {
          client_uuid: clientUuid,
          name: String(formData.name || '').trim(),
          mobile,
          date: new Date().toISOString().split('T')[0],
          treatment: formData.treatment,
          tookPackage: formData.tookPackage,
          packageAmount: formData.tookPackage ? (Number(formData.packageAmount) || 0) * 100 : 0,
          totalPackageHours: Number(formData.totalPackageHours) || 0,
          packageSoldBy: formData.tookPackage ? formData.sold_by.trim() : null,
          packageValidity: formData.tookPackage ? formData.packageValidity : null,
          amountPaid: formData.tookPackage ? 0 : finalAmountInPaise,
          sessionHours: getSessionDuration(),
          isPackageCustomer: !formData.tookPackage && clientInfo?.status === 'active',
          packageId:
            !formData.tookPackage && clientInfo?.status === 'active'
              ? clientInfo?.packageId ?? null
              : null,
          outlet: outlet.name,
          outlet_id: outlet.id,
          paymentMethod: paymentMethod,
          finalAmountInPaise: finalAmountInPaise,
          check_in_time: new Date().toISOString(),
          therapist_name:
            (formData.therapistPrimary || '') +
            (formData.showSecondaryTherapist
              ? ` & ${formData.therapistSecondary || ''}`
              : ''),
          therapist_primary: formData.therapistPrimary || null,
          therapist_secondary: formData.showSecondaryTherapist
            ? formData.therapistSecondary || null
            : null,
          room: formData.room || null,
          created_local_at: new Date().toISOString(),
          status: 'pending',
          sync_error: String(err?.message || err),
        };

        await offlineDb.pending_clients.add(localPayload);

        setSuccess(
          'Saved locally — server unreachable. Entry will sync automatically when server is back.',
        );
        setLoading(false);

        // reset form for next entry
        setFormData({
          name: '',
          treatment: '',
          amountPaid: 0,
          sessionHours: 0,
          sessionMinutes: 0,
          paymentMethod: 'cash',
          tookPackage: false,
          packageAmount: 0,
          totalPackageHours: 0,
          packageValidity: '3 months',
          sold_by: '',
          therapistPrimary: '',
          therapistSecondary: '',
          showSecondaryTherapist: false,
          room: '',
        });

        setAdditionalCustomers([]);
        setMobile('');
        setClientInfo(null);
      } catch (dexErr) {
        console.error('Failed to save offline:', dexErr);
        setError(err?.message || 'An unknown error occurred and local save failed.');
        setLoading(false);
      }
    }
  };

  const showAmountField = !formData.tookPackage;
  const isSubmitDisabled = loading;

  // Conditionally render the button based on lookup status
  const showHistoryButton =
    mobile.length === 10 && clientInfo && clientInfo.status !== 'not_found';

  const packageHours:
    | { total: number; used: number; remaining: number; percentUsed: number }
    | null =
    clientInfo &&
    clientInfo.status !== 'not_found' &&
    clientInfo.totalPackageHours > 0
      ? {
          total: clientInfo.totalPackageHours,
          used: clientInfo.usedPackageHours,
          remaining: clientInfo.remainingHours,
          percentUsed:
            (clientInfo.usedPackageHours / clientInfo.totalPackageHours) * 100,
        }
      : null;

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-black to-gray-800 flex items-center justify-center p-4">
      {isHistoryModalOpen && clientInfo && (
        <PackageHistoryModal
          clientInfo={clientInfo}
          mobile={mobile}
          onClose={() => setIsHistoryModalOpen(false)}
        />
      )}

      <div className="max-w-lg w-full bg-gray-900 rounded-2xl shadow-2xl p-8 border border-gray-700">
        <h1 className="text-2xl font-bold text-white text-center mb-2">
          Welcome to {outlet?.name || 'Your Spa'}
        </h1>
        <p className="text-center text-gray-400 mb-6">Client Check-in (Group Friendly)</p>

        {error && !success && (
          <div className="mb-4 p-3 bg-red-900/50 text-red-300 rounded-lg border border-red-700 text-sm">
            {error}
          </div>
        )}
        {success && (
          <div className="mb-4 p-3 bg-green-900/50 text-green-300 rounded-lg border border-green-700 text-sm">
            {success}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label
                htmlFor="mobile"
                className="block text-sm font-medium text-gray-300 mb-1"
              >
                Phone Number (for the group) *
              </label>
              <input
                id="mobile"
                type="tel"
                value={mobile}
                onChange={(e) => setMobile(e.target.value.replace(/\D/g, ''))}
                required
                maxLength={10}
                className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg focus:ring-1 focus:ring-red-500 text-white placeholder:text-gray-500"
                placeholder="10-digit mobile"
                disabled={loading}
              />
            </div>
            <div>
              <label
                htmlFor="name"
                className="block text-sm font-medium text-gray-300 mb-1"
              >
                Main Customer Name *
              </label>
              <input
                id="name"
                name="name"
                type="text"
                value={formData.name}
                onChange={handleChange}
                required
                className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg focus:ring-1 focus:ring-red-500 text-white placeholder:text-gray-500"
                placeholder="Person giving the number"
                disabled={loading}
              />
            </div>
          </div>

          {/* --- Package Info, Progress Bar & History Button --- */}
          {clientInfo && clientInfo.status !== 'not_found' && (
            <div className="p-3 bg-gray-800 rounded-lg border border-gray-700 space-y-3">
              {/* Status Bar */}
              <div className="flex flex-col sm:flex-row gap-3">
                <div
                  className={`flex-1 p-3 rounded-lg text-sm text-center ${
                    clientInfo.status === 'active'
                      ? 'bg-green-900/50 border border-green-700 text-green-300'
                      : 'bg-yellow-900/50 border border-yellow-700 text-yellow-300'
                  }`}
                >
                  <strong className="block">
                    Package Status:{' '}
                    {clientInfo.status === 'active' ? 'ACTIVE' : 'EXPIRED'}
                  </strong>
                  <span className="block text-xs mt-1">
                    Expiry:{' '}
                    <strong>
                      {clientInfo.expiryDate
                        ? formatDate(clientInfo.expiryDate)
                        : 'N/A'}
                    </strong>
                  </span>
                </div>
                {showHistoryButton && (
                  <button
                    type="button"
                    onClick={() => setIsHistoryModalOpen(true)}
                    className="w-full sm:w-auto px-4 py-3 bg-red-600 hover:bg-red-700 text-white rounded-lg font-medium text-sm transition flex items-center justify-center gap-2"
                    disabled={loading}
                  >
                    <Calendar size={16} /> View History
                  </button>
                )}
              </div>

              {/* Progress Bar */}
              {packageHours && (
                <div className="pt-2">
                  <div className="flex justify-between text-xs font-medium text-gray-400 mb-1">
                    <span>Total Hours: {formatDuration(packageHours.total)}</span>
                    <span>
                      Used: {formatDuration(packageHours.used)} (
                      {packageHours.percentUsed.toFixed(1)}%)
                    </span>
                  </div>
                  <div className="w-full bg-gray-700 rounded-full h-2.5">
                    <div
                      className="bg-red-600 h-2.5 rounded-full transition-all duration-500 ease-out"
                      style={{
                        width: `${Math.min(
                          Math.max(packageHours.percentUsed, 0),
                          100,
                        )}%`,
                      }}
                    ></div>
                  </div>
                  <div className="text-right text-sm font-semibold text-green-400 mt-1">
                    Remaining: {formatDuration(packageHours.remaining)}
                  </div>
                </div>
              )}
            </div>
          )}
          {clientInfo && clientInfo.status === 'not_found' && mobile.length === 10 && (
            <div className="p-3 bg-yellow-900/50 border border-yellow-700 rounded-lg text-sm text-center text-yellow-300">
              No active package found.
            </div>
          )}
          {/* --- End Package Info, Progress Bar & History Button --- */}

          {/* MAIN CUSTOMER SERVICE DETAILS */}
          <div>
            <label
              htmlFor="treatment"
              className="block text-sm font-medium text-gray-300 mb-1"
            >
              Treatment for Main Customer *
            </label>
            <select
              id="treatment"
              name="treatment"
              value={formData.treatment}
              onChange={handleChange}
              required
              className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg focus:ring-1 focus:ring-red-500 text-white"
              disabled={loading || treatments.length === 0}
            >
              <option value="">-- Select a Treatment --</option>
              {treatments.map((t) => (
                <option key={t.id} value={t.name}>
                  {t.name}
                </option>
              ))}
            </select>
          </div>

          {/* --- Therapist Inputs: Primary + optional Secondary --- */}
          <div className="space-y-3">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">
                  Therapist (Primary) *
                </label>
                <select
                  name="therapistPrimary"
                  value={formData.therapistPrimary}
                  onChange={handleChange}
                  className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg focus:ring-1 focus:ring-red-500 text-white placeholder:text-gray-500"
                  disabled={loading}
                  required
                >
                  <option value="">-- Select Therapist 1 --</option>
                  {employees.map((emp) => (
                    <option key={emp.id} value={emp.name}>
                      {emp.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">
                  Room Number (Main)
                </label>
                <input
                  name="room"
                  type="text"
                  value={formData.room}
                  onChange={handleChange}
                  placeholder="Room No."
                  className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg focus:ring-1 focus:ring-red-500 text-white placeholder:text-gray-500"
                  disabled={loading}
                />
              </div>
            </div>

            <label className="inline-flex items-center gap-2">
              <input
                type="checkbox"
                name="showSecondaryTherapist"
                checked={formData.showSecondaryTherapist}
                onChange={handleChange}
                className="h-4 w-4 text-red-600 bg-gray-700 border-gray-600 rounded focus:ring-red-500"
                disabled={loading}
              />
              <span className="text-sm text-gray-300">Add second therapist for main</span>
            </label>

            {formData.showSecondaryTherapist && (
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">
                  Therapist (Secondary){' '}
                  <span className="text-xs text-gray-400">(optional)</span>
                </label>
                <select
                  name="therapistSecondary"
                  value={formData.therapistSecondary}
                  onChange={handleChange}
                  className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg focus:ring-1 focus:ring-red-500 text-white"
                  disabled={loading}
                >
                  <option value="">-- Select Therapist 2 --</option>
                  {employees
                    .filter((e) => e.name !== formData.therapistPrimary)
                    .map((emp) => (
                      <option key={emp.id} value={emp.name}>
                        {emp.name}
                      </option>
                    ))}
                </select>
              </div>
            )}
          </div>
          {/* --- End Therapist Inputs --- */}

          {/* --- Session Duration (Main) --- */}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">
              Session Duration (Main Customer) *
            </label>
            <div className="grid grid-cols-2 gap-4">
              <input
                name="sessionHours"
                type="number"
                step="1"
                min="0"
                value={formData.sessionHours}
                onChange={handleChange}
                required
                className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg focus:ring-1 focus:ring-red-500 text-white placeholder:text-gray-500"
                placeholder="Hours"
                disabled={loading}
              />
              <input
                name="sessionMinutes"
                type="number"
                step="5"
                min="0"
                max="59"
                value={formData.sessionMinutes}
                onChange={handleChange}
                required
                className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg focus:ring-1 focus:ring-red-500 text-white placeholder:text-gray-500"
                placeholder="Mins (0, 5, 10, ...)"
                disabled={loading}
              />
            </div>
            <p className="text-[11px] text-gray-400 mt-1">
              In / Out time will be auto-calculated from this duration.
            </p>
          </div>
          {/* --- End Session Duration --- */}

          {/* --- GROUP CUSTOMERS --- */}
          <div className="border border-gray-700 rounded-lg p-4 space-y-3 bg-gray-900/60">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-semibold text-gray-100">
                  Additional Customers (Same Sale)
                </h3>
                <p className="text-xs text-gray-400">
                  For friends in the same group with different therapist / room / duration.
                </p>
              </div>
              <button
                type="button"
                onClick={addAdditionalCustomer}
                className="text-xs px-3 py-1.5 rounded-md border border-red-600 text-red-400 hover:bg-red-600 hover:text-white transition"
                disabled={loading}
              >
                + Add one more customer
              </button>
            </div>

            {additionalCustomers.length > 0 && (
              <div className="space-y-3 pt-2">
                {additionalCustomers.map((c, index) => (
                  <div
                    key={c.id}
                    className="rounded-lg border border-gray-700 bg-gray-800/70 p-3 space-y-3"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-gray-300">
                        Customer {index + 2}
                      </span>
                      <button
                        type="button"
                        onClick={() => removeAdditionalCustomer(c.id)}
                        className="text-xs text-red-400 hover:text-red-300"
                        disabled={loading}
                      >
                        Remove
                      </button>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-medium text-gray-300 mb-1">
                          Name (optional)
                        </label>
                        <input
                          type="text"
                          value={c.name}
                          onChange={(e) =>
                            updateAdditionalCustomer(c.id, 'name', e.target.value)
                          }
                          className="w-full px-3 py-1.5 bg-gray-900 border border-gray-700 rounded-lg text-sm text-white"
                          placeholder="Customer name"
                          disabled={loading}
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-300 mb-1">
                          Therapist *
                        </label>
                        <select
                          value={c.therapist}
                          onChange={(e) =>
                            updateAdditionalCustomer(c.id, 'therapist', e.target.value)
                          }
                          className="w-full px-3 py-1.5 bg-gray-900 border border-gray-700 rounded-lg text-sm text-white"
                          disabled={loading}
                        >
                          <option value="">-- Select Therapist --</option>
                          {employees.map((emp) => (
                            <option key={emp.id} value={emp.name}>
                              {emp.name}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-medium text-gray-300 mb-1">
                          Treatment *
                        </label>
                        <select
                          value={c.treatment}
                          onChange={(e) =>
                            updateAdditionalCustomer(c.id, 'treatment', e.target.value)
                          }
                          className="w-full px-3 py-1.5 bg-gray-900 border border-gray-700 rounded-lg text-sm text-white"
                          disabled={loading || treatments.length === 0}
                        >
                          <option value="">-- Select Treatment --</option>
                          {treatments.map((t) => (
                            <option key={t.id} value={t.name}>
                              {t.name}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-300 mb-1">
                          Room Number *
                        </label>
                        <input
                          type="text"
                          value={c.room}
                          onChange={(e) =>
                            updateAdditionalCustomer(c.id, 'room', e.target.value)
                          }
                          className="w-full px-3 py-1.5 bg-gray-900 border border-gray-700 rounded-lg text-sm text-white"
                          placeholder="Room"
                          disabled={loading}
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-gray-300 mb-1">
                        Session Duration *
                      </label>
                      <div className="grid grid-cols-2 gap-3">
                        <input
                          type="number"
                          min={0}
                          step={1}
                          value={c.sessionHours}
                          onChange={(e) =>
                            updateAdditionalCustomer(
                              c.id,
                              'sessionHours',
                              Number(e.target.value) || 0,
                            )
                          }
                          className="w-full px-3 py-1.5 bg-gray-900 border border-gray-700 rounded-lg text-sm text-white"
                          placeholder="Hours"
                          disabled={loading}
                        />
                        <input
                          type="number"
                          min={0}
                          max={59}
                          step={5}
                          value={c.sessionMinutes}
                          onChange={(e) =>
                            updateAdditionalCustomer(
                              c.id,
                              'sessionMinutes',
                              Number(e.target.value) || 0,
                            )
                          }
                          className="w-full px-3 py-1.5 bg-gray-900 border border-gray-700 rounded-lg text-sm text-white"
                          placeholder="Mins"
                          disabled={loading}
                        />
                      </div>
                      <p className="text-[11px] text-gray-400 mt-1">
                        In / Out time will be auto-calculated from group check-in and this
                        duration.
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
          {/* --- END GROUP CUSTOMERS --- */}

          {/* --- New Package Checkbox and Fields --- */}
          <div className="space-y-4 pt-2">
            <label className="inline-flex items-center gap-2">
              <input
                type="checkbox"
                name="tookPackage"
                checked={formData.tookPackage}
                onChange={handleChange}
                className="h-4 w-4 text-red-600 bg-gray-700 border-gray-600 rounded focus:ring-red-500"
                disabled={loading}
              />
              <span className="text-sm font-medium text-gray-300">
                Add new package for this customer
              </span>
            </label>

            {formData.tookPackage && (
              <div className="space-y-4 bg-gray-800 p-4 rounded-lg border border-red-700/50">
                <h3 className="text-md font-semibold text-red-400">Package Details</h3>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-1">
                      Package Amount (₹) *
                    </label>
                    <input
                      name="packageAmount"
                      type="number"
                      step="1"
                      min="1"
                      value={formData.packageAmount || ''}
                      onChange={handleChange}
                      required={formData.tookPackage}
                      className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg focus:ring-1 focus:ring-red-500 text-white placeholder:text-gray-500"
                      placeholder="e.g., 5000"
                      disabled={loading}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-1">
                      Total Hours *
                    </label>
                    <input
                      name="totalPackageHours"
                      type="number"
                      step="0.5"
                      min={getSessionDuration()}
                      value={formData.totalPackageHours || ''}
                      onChange={handleChange}
                      required={formData.tookPackage}
                      className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg focus:ring-1 focus:ring-red-500 text-white placeholder:text-gray-500"
                      placeholder="e.g., 10"
                      disabled={loading}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-1">
                      Validity
                    </label>
                    <select
                      name="packageValidity"
                      value={formData.packageValidity}
                      onChange={handleChange}
                      className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg focus:ring-1 focus:ring-red-500 text-white"
                      disabled={loading}
                    >
                      <option value="3 months">3 months</option>
                      <option value="6 months">6 months</option>
                      <option value="12 months">12 months</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-1">
                      Sold By *
                    </label>
                    <select
                      name="sold_by"
                      value={formData.sold_by}
                      onChange={handleChange}
                      required={formData.tookPackage}
                      className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg focus:ring-1 focus:ring-red-500 text-white"
                      disabled={loading}
                    >
                      <option value="">-- Select Staff --</option>
                      {outletStaff.map((staff) => (
                        <option key={staff.id} value={staff.name}>
                          {staff.name} ({staff.role})
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>
            )}
          </div>
          {/* --- End New Package Checkbox and Fields --- */}

          {/* --- Amount Paid & Payment Method --- */}
          {showAmountField && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label
                  htmlFor="amountPaid"
                  className="block text-sm font-medium text-gray-300 mb-1"
                >
                  Total Amount for this Sale (₹) *
                </label>
                <input
                  id="amountPaid"
                  name="amountPaid"
                  type="number"
                  step="1"
                  min="1500"
                  value={formData.amountPaid || ''}
                  onChange={handleChange}
                  required
                  className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg focus:ring-1 focus:ring-red-500 text-white placeholder:text-gray-500"
                  placeholder="Enter amount"
                  disabled={loading}
                />
              </div>

              <div>
                <label
                  htmlFor="paymentMethod"
                  className="block text-sm font-medium text-gray-300 mb-1"
                >
                  Payment Option
                </label>
                <select
                  name="paymentMethod"
                  value={formData.paymentMethod}
                  onChange={handleChange}
                  className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg focus:ring-1 focus:ring-red-500 text-white"
                  disabled={loading}
                >
                  <option value="cash">Pay with Cash</option>
                  <option value="card">Pay with Card</option>
                  <option value="upi">Pay with UPI</option>
                </select>
              </div>
            </div>
          )}

          <button
            type="submit"
            disabled={isSubmitDisabled}
            className="w-full bg-red-600 hover:bg-red-700 text-white font-medium py-3 px-4 rounded-lg transition duration-300 disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {loading
              ? 'Processing...'
              : formData.tookPackage
              ? formData.paymentMethod === 'upi'
                ? 'Register Package & Pay UPI'
                : formData.paymentMethod === 'cash'
                ? 'Register Package & Accept Cash'
                : 'Register Package & Accept Card'
              : formData.paymentMethod === 'upi'
              ? 'Register Group & Proceed to UPI'
              : formData.paymentMethod === 'cash'
              ? 'Register Group & Accept Cash'
              : 'Register Group & Accept Card'}
          </button>
        </form>
      </div>

      {/* Small indicator — local queue (optional, can be removed once OfflineSync is in layout) */}
      <div
        style={{
          position: 'fixed',
          right: 12,
          bottom: 12,
          zIndex: 9999,
          background: 'rgba(0,0,0,0.7)',
          color: 'white',
          padding: 8,
          borderRadius: 8,
          fontSize: 12,
        }}
      >
        <small>
          Local queue enabled — unsynced entries are stored locally if server is unreachable.
        </small>
      </div>
    </div>
  );
}
