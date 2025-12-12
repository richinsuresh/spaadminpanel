// src/app/client-form/[outletId]/page.tsx
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
  totalPackageHours: number;
  usedPackageHours: number;
};

// NEW: Additional customer type for group entries (SIMPLIFIED)
type AdditionalCustomer = {
  id: string;
  name: string;
  treatment: string;
  sessionHours: number;
  sessionMinutes: number;
  // Removed therapist and room fields
};

// New Type for Visit History (RETAINED)
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

// --- Helper Functions (RETAINED) ---
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

// --- Package History Modal Component (RETAINED) ---
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

  // --- Main (primary) customer form data ---
  const [formData, setFormData] = useState({
    name: '',
    treatment: '',
    amountPaid: 0,
    sessionHours: 0,
    sessionMinutes: 0,
    paymentMethod: 'cash',
  });
  
  // --- State for Package Redemption ---
  const [usePackageCredit, setUsePackageCredit] = useState(false);

  // --- NEW: State for additional customers ---
  const [additionalCustomers, setAdditionalCustomers] = useState<AdditionalCustomer[]>([]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // --- NEW: Modal State ---
  const [isHistoryModalOpen, setIsHistoryModalOpen] = useState(false);

  // --- Data Fetching Functions (SIMPLIFIED) ---
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

  // --- Initial Load & Outlet Validation (SIMPLIFIED) ---
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

    fetchTreatments()
      .then(() => {
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [outletId, fetchTreatments]);

  // --- Realtime listeners (SIMPLIFIED) ---
  useEffect(() => {
    if (!outletId) return;

    const channel = supabase
      .channel(`client-form-realtime-${outletId}`)
      
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
  }, [fetchTreatments, outletId]);

  // --- Client lookup (Unchanged logic) ---
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
        if (finalClientInfo.status === 'active') {
            setUsePackageCredit(true);
        }
      } else {
        setFormData((prev) => ({
          ...prev,
          name: '',
        }));
        setUsePackageCredit(false);
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
    setUsePackageCredit(false); // Reset package usage on number change
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
      return updated;
    });
  };
  
  // Handle checkbox change specifically
  const handlePackageCreditToggle = (e: React.ChangeEvent<HTMLInputElement>) => {
      setUsePackageCredit(e.target.checked);
      setError('');
  }

  // --- NEW: Group Customer Helpers ---
  const addAdditionalCustomer = () => {
    setAdditionalCustomers((prev) => [
      ...prev,
      {
        id: uuidv4(),
        name: '',
        treatment: '',
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
  // --- END Group Customer Helpers ---


  const getSessionDuration = useCallback(() => {
    const hours = Number(formData.sessionHours) || 0;
    const minutes = Number(formData.sessionMinutes) || 0;
    return hours + minutes / 60;
  }, [formData.sessionHours, formData.sessionMinutes]);

  const getFinalAmountInPaise = useCallback(() => {
    if (usePackageCredit) return 0;
    
    return (Number(formData.amountPaid) || 0) * 100;
  }, [usePackageCredit, formData.amountPaid]);


  // --- UPDATED handleSubmit (RE-INCLUDES GROUP) ---
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

    // ✅ Snapshot values
    const paymentMethod = formData.paymentMethod;
    const finalAmountInPaise = getFinalAmountInPaise();
    const amountInRupees = finalAmountInPaise / 100;
    const outletIdForRedirect = outlet.id;
    const isPackageRedemption = usePackageCredit && clientInfo?.status === 'active';
    
    // --- Validation: Main Customer ---
    if (sessionHours <= 0) {
      setError('Please enter a valid Session Duration (Main Customer).');
      setLoading(false);
      return;
    }
    
    if (!formData.name.trim()) {
        setError('Please enter the Main Customer\'s full name.');
        setLoading(false);
        return;
    }

    if (isPackageRedemption) {
        // Additional check for package hours
        if (sessionHours > (clientInfo?.remainingHours || 0)) {
            setError(`Main customer duration (${formatDuration(sessionHours)}) exceeds remaining package hours.`);
            setLoading(false);
            return;
        }
    } else {
        // Paid session validation
        const MIN_AMOUNT_RUPEES = 1500;
        if (amountInRupees < MIN_AMOUNT_RUPEES) {
            setError(
                `Amount (₹${amountInRupees}) is below the minimum of ₹${MIN_AMOUNT_RUPEES}.`,
            );
            setLoading(false);
            return;
        }
    }

    // --- Validation: Group Customers (SIMPLIFIED) ---
    for (let i = 0; i < additionalCustomers.length; i++) {
      const c = additionalCustomers[i];
      const duration = (Number(c.sessionHours) || 0) + (Number(c.sessionMinutes) || 0) / 60;

      if (!c.name || !c.treatment || duration <= 0) {
        setError(
          `Please fill name, treatment, and duration for Customer ${i + 2}.`,
        );
        setLoading(false);
        return;
      }
    }


    const treatmentName = formData.treatment;

    const clientUuid =
      typeof uuidv4 === 'function' ? uuidv4() : `${Date.now()}-${Math.random()}`;

    try {
      const checkInTime: string | null = new Date().toISOString();
      const checkInDate = new Date(checkInTime);
      const mainOutDate = new Date(
        checkInDate.getTime() + sessionHours * 60 * 60 * 1000,
      );
      const mainInTimeStr = formatTimeHM(checkInDate);
      const mainOutTimeStr = formatTimeHM(mainOutDate);

      // --- Group Customers Payload Building (Simplified for client form) ---
      const groupCustomersPayload = additionalCustomers.map((c) => {
        const dur = (Number(c.sessionHours) || 0) + (Number(c.sessionMinutes) || 0) / 60;
        const outDate = new Date(checkInDate.getTime() + dur * 60 * 60 * 1000);
        return {
          name: c.name.trim(),
          treatment: c.treatment,
          sessionHours: dur,
          // Placeholder values for staff fields the staff will fill in later
          therapist_name: 'CLIENT_FORM_PENDING', 
          room: 'CLIENT_FORM_PENDING',
          in_time: mainInTimeStr,
          out_time: formatTimeHM(outDate),
        };
      });

      // --- FINAL PAYLOAD ---
      const payload = {
        client_uuid: clientUuid,
        name: String(formData.name || '').trim(),
        mobile: mobile,
        date: new Date().toISOString().split('T')[0],
        treatment: treatmentName,

        // Package Redemption Fields
        tookPackage: false, 
        packageAmount: 0,
        totalPackageHours: 0,
        packageSoldBy: null,
        packageValidity: null,

        // Amount and Package Use
        amountPaid: isPackageRedemption ? 0 : finalAmountInPaise,
        sessionHours: sessionHours,
        isPackageCustomer: isPackageRedemption,
        packageId: isPackageRedemption ? clientInfo?.packageId : null,

        // Outlet/Payment Info
        outlet: outlet.name,
        outlet_id: outlet.id,
        paymentMethod: paymentMethod,
        finalAmountInPaise: finalAmountInPaise,
        check_in_time: checkInTime,
        
        // Therapist/Room fields are null, must be filled by staff later
        therapist_name: null,
        therapist_primary: null,
        therapist_secondary: null,
        room: null,
        in_time: mainInTimeStr,
        out_time: mainOutTimeStr,
        
        // --- Group Data ---
        group_customers: groupCustomersPayload.length > 0 ? groupCustomersPayload : null,
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

      // Handle Redirection
      if (paymentMethod === 'upi' && !isPackageRedemption) {
        setSuccess('Registration complete. Redirecting to payment QR...');
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

        // OFFLINE FALLBACK
        try {
            const localPayload: OfflineClientPayload = {
              client_uuid: clientUuid,
              name: String(formData.name || '').trim(),
              mobile,
              date: new Date().toISOString().split('T')[0],
              treatment: formData.treatment,
              tookPackage: false,
              packageAmount: 0,
              totalPackageHours: 0,
              packageSoldBy: null,
              packageValidity: null,
              amountPaid: isPackageRedemption ? 0 : finalAmountInPaise,
              sessionHours: getSessionDuration(),
              isPackageCustomer: isPackageRedemption,
              packageId: isPackageRedemption ? clientInfo?.packageId : null,
              outlet: outlet.name,
              outlet_id: outlet.id,
              paymentMethod: paymentMethod,
              finalAmountInPaise: finalAmountInPaise,
              check_in_time: new Date().toISOString(),
              therapist_name: null,
              therapist_primary: null,
              therapist_secondary: null,
              room: null,
              created_local_at: new Date().toISOString(),
              status: 'pending',
              sync_error: String(err?.message || err),
              // Group customers cannot be saved in the simple local payload type. Staff must fix.
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
            });
            setMobile('');
            setClientInfo(null);
            setUsePackageCredit(false);
            setAdditionalCustomers([]); // Clear group members
          } catch (dexErr) {
            console.error('Failed to save offline:', dexErr);
            setError(err?.message || 'An unknown error occurred and local save failed.');
            setLoading(false);
          }
    }
  };

  const isSubmitDisabled = loading;
  const isPaidSession = !usePackageCredit;
  const isPackageActive = clientInfo?.status === 'active';

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
        <p className="text-center text-gray-400 mb-6">Client Check-in</p>

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
                
                <button
                    type="button"
                    onClick={() => setIsHistoryModalOpen(true)}
                    className="w-full sm:w-auto px-4 py-3 bg-red-600 hover:bg-red-700 text-white rounded-lg font-medium text-sm transition flex items-center justify-center gap-2"
                    disabled={loading}
                  >
                    <Calendar size={16} /> View History
                </button>
              </div>

              {/* Package Redemption Checkbox */}
              {isPackageActive && (
                 <label className="inline-flex items-center gap-2 mt-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={usePackageCredit}
                      onChange={handlePackageCreditToggle}
                      className="h-4 w-4 text-red-600 bg-gray-700 border-gray-600 rounded focus:ring-red-500"
                      disabled={loading}
                    />
                    <span className="text-sm font-medium text-green-400">
                      Use Package Credit for this Session
                    </span>
                  </label>
              )}


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

          {/* SERVICE DETAILS (Main Customer) */}
          <div>
            <label
              htmlFor="treatment"
              className="block text-sm font-medium text-gray-300 mb-1"
            >
              Treatment *
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
          
          {/* --- Session Duration (Main Customer) --- */}
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

          {/* --- GROUP CUSTOMERS (RE-ADDED) --- */}
          <div className="border border-gray-700 rounded-lg p-4 space-y-3 bg-gray-900/60">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-semibold text-gray-100">
                  Additional Customers (Same Sale)
                </h3>
                <p className="text-xs text-gray-400">
                  For friends in the same group.
                </p>
              </div>
              <button
                type="button"
                onClick={addAdditionalCustomer}
                className="text-xs px-3 py-1.5 rounded-md border border-red-600 text-red-400 hover:bg-red-600 hover:text-white transition"
                disabled={loading}
              >
                + Add customer
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
                          Name *
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
                          required
                        />
                      </div>
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
                          required
                        >
                          <option value="">-- Select Treatment --</option>
                          {treatments.map((t) => (
                            <option key={t.id} value={t.name}>
                              {t.name}
                            </option>
                          ))}
                        </select>
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
                          required
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
                          required
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
          {/* --- END GROUP CUSTOMERS --- */}


          {/* --- Amount Paid & Payment Method (CONDITIONAL) --- */}
          {isPaidSession && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label
                  htmlFor="amountPaid"
                  className="block text-sm font-medium text-gray-300 mb-1"
                >
                  Total Amount (₹) *
                </label>
                <input
                  id="amountPaid"
                  name="amountPaid"
                  type="number"
                  step="1"
                  min="1500"
                  value={formData.amountPaid || ''}
                  onChange={handleChange}
                  required={isPaidSession}
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
                  Payment Option *
                </label>
                <select
                  name="paymentMethod"
                  value={formData.paymentMethod}
                  onChange={handleChange}
                  className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg focus:ring-1 focus:ring-red-500 text-white"
                  disabled={loading}
                  required={isPaidSession}
                >
                  <option value="cash">Pay with Cash</option>
                  <option value="card">Pay with Card</option>
                  <option value="upi">Pay with UPI</option>
                </select>
              </div>
            </div>
          )}
          {/* --- End Amount Paid & Payment Method --- */}

          <button
            type="submit"
            disabled={isSubmitDisabled}
            className="w-full bg-red-600 hover:bg-red-700 text-white font-medium py-3 px-4 rounded-lg transition duration-300 disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {loading
              ? 'Processing...'
              : usePackageCredit
              ? 'Redeem Session'
              : formData.paymentMethod === 'upi'
              ? 'Proceed to UPI Payment'
              : 'Register Group & Proceed'}
          </button>
        </form>
      </div>

      {/* Small indicator — local queue */}
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