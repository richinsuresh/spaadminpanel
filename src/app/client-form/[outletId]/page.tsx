'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { OUTLETS, Outlet } from '@/lib/outlet';

// --- Type Definitions ---
type Treatment = { id: string; name: string; };
type ClientInfo = {
  status: 'active' | 'expired';
  name: string;
  mobile: string;
  remainingHours: number;
};

type Employee = {
  id: string;
  name: string;
  is_checked_in?: boolean;
  role?: string | null;
  outlet_id?: string | null;
  is_active?: boolean;
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
    therapistPrimary: '',         // primary therapist
    therapistSecondary: '',       // secondary therapist (hidden by default)
    showSecondaryTherapist: false,// reveal second therapist
    room: '',          
  });

  // --- State for employees list (therapists only, checked-in) ---
  const [employees, setEmployees] = useState<Employee[]>([]);

  // --- State for all staff in outlet (used for "Sold By") ---
  const [outletStaff, setOutletStaff] = useState<Employee[]>([]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

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
   * fetchStaff (OUTLET-SPECIFIC)
   * - Only therapists (role = 'therapist')
   * - Only currently checked-in (is_checked_in = true)
   * - Only for the current outlet (outlet_id)
   */
  const fetchStaff = useCallback(async () => {
    if (!outletId) {
      setEmployees([]);
      return;
    }

    try {
      const { data, error } = await supabase
        .from('employees')
        .select('id, name, is_checked_in, role, outlet_id')
        .eq('is_active', true)
        .eq('role', 'therapist')           // only therapists
        .eq('is_checked_in', true)         // only currently checked-in
        .eq('outlet_id', outletId)         // filter by current outlet
        .order('name', { ascending: true });

      if (error) {
        console.error('Error fetching therapists:', error);
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
   * - Doesn't require staff to be checked-in (business rule: anyone in outlet can sell)
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
    const outletInfo = OUTLETS.find(o => o.id === outletId);
    if (!outletInfo) {
      setError('Invalid Outlet ID.');
      setLoading(false);
      return;
    }
    setOutlet(outletInfo); 
    
    // Initial data fetch
    Promise.all([fetchTreatments(), fetchStaff(), fetchOutletStaff()]).then(() => {
      setLoading(false);
    }).catch(() => setLoading(false));

  }, [outletId, fetchTreatments, fetchStaff, fetchOutletStaff]);

  // --- Realtime listeners to keep staff/treatments fresh ---
  useEffect(() => {
    if (!outletId) return;

    const channel = supabase
      .channel(`client-form-realtime-${outletId}`)
      // listen only for employees changes for this outlet
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'employees', filter: `outlet_id=eq.${outletId}` },
        () => {
          // Refresh both therapists and outlet staff on employees change (role/active/check-in may change)
          fetchStaff();
          fetchOutletStaff();
        }
      )
      // listen attendance changes for this outlet (if your attendance table has an outlet_id column)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'attendance', filter: `outlet_id=eq.${outletId}` },
        () => { fetchStaff(); }
      )
      // treatments changes for this outlet
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'treatments', filter: `outlet_id=eq.${outletId}` },
        () => { fetchTreatments(); }
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

  // --- Client lookup (same as before) ---
  const performClientLookup = useCallback(async () => {
    if (mobile.length !== 10) return;
    try {
      setError('');
      const res = await fetch(`/api/client-lookup?mobile=${encodeURIComponent(mobile)}`);
      if (!res.ok) {
        setClientInfo(null);
        setFormData(prev => ({ ...prev, name: '' }));
        return;
      }
      const data: ClientInfo | null = await res.json();
      setClientInfo(data);
      
      if (data) {
        setFormData(prev => ({
          ...prev,
          name: data.name || '',
        }));
      } else {
        setFormData(prev => ({
          ...prev,
          name: '',
        }));
      }
    } catch (e) {
      console.error('Client lookup error:', e);
      setClientInfo(null);
      setFormData(prev => ({ ...prev, name: '' }));
    }
  }, [mobile]);

  useEffect(() => {
    setClientInfo(null);
    if (mobile.length < 10) {
        setFormData(prev => ({ ...prev, name: '' }));
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
    
    setFormData(prev => {
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
    return hours + (minutes / 60);
  }, [formData.sessionHours, formData.sessionMinutes]);

  const getFinalAmountInPaise = useCallback(() => {
    if (formData.tookPackage) {
      return (Number(formData.packageAmount) || 0) * 100;
    }
    return (Number(formData.amountPaid) || 0) * 100;
  }, [formData.tookPackage, formData.packageAmount, formData.amountPaid]);


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

    // --- Validation ---
    if ((sessionHours > 0) && !String(formData.therapistPrimary || '').trim()) {
       setError('Please select a Therapist (Primary).');
       setLoading(false);
       return;
    }

    if (formData.tookPackage) {
      if (!formData.packageAmount || formData.packageAmount <= 0 || !totalPackageHours || totalPackageHours <= 0) {
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
        setError('Please enter a valid Session Duration (e.g., 1 hour 30 mins).');
        setLoading(false);
        return;
      }
      const amountInRupees = Number(formData.amountPaid) || 0;
      if (amountInRupees <= 0) {
          setError('Please enter a valid Amount for the treatment.');
          setLoading(false);
          return;
      }
      
      const minAmount = outlet.minTreatmentAmount;
      if (amountInRupees < minAmount) {
          setError(`Amount (₹${amountInRupees}) is below the minimum of ₹${minAmount}. Redirecting...`);
          setLoading(true);
          setTimeout(() => {
              router.push(`/payment-declined?outletId=${outletId}&amount=${amountInRupees}`);
          }, 1500);
          return; 
      }
    }
    
    const treatmentName = formData.treatment;
    const finalAmountInPaise = getFinalAmountInPaise();
    
    try {
      const checkInTime: string | null = new Date().toISOString();

      // Build therapist info:
      const therapistPrimary = String(formData.therapistPrimary || '').trim() || null;
      const therapistSecondary = formData.showSecondaryTherapist ? (String(formData.therapistSecondary || '').trim() || null) : null;
      // legacy-compatible combined string
      const therapistCombined = therapistPrimary && therapistSecondary ? `${therapistPrimary} & ${therapistSecondary}` : therapistPrimary || therapistSecondary || null;

      const payload = {
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
          isPackageCustomer: false, 

          outlet: outlet!.name,
          outlet_id: outlet!.id,
          paymentMethod: formData.paymentMethod,
          finalAmountInPaise: finalAmountInPaise, 
          check_in_time: checkInTime,

          // therapists: keep both discrete fields and combined legacy field
          therapist_name: therapistCombined,
          therapist_primary: therapistPrimary,
          therapist_secondary: therapistSecondary,

          room: formData.room || null,
      };

      const res = await fetch('/api/client-form-submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Submission failed');
      }

      if (data.paymentMethod === 'upi') {
        setSuccess('Registration complete. Redirecting to payment QR...');
        const amountInRupees = data.finalAmountInPaise / 100;
        setTimeout(() => {
          router.push(`/pay/qr/${data.outlet_id}?amount=${amountInRupees}`);
        }, 1500);
      } 
      else {
        setSuccess('Registration successful! Redirecting...');
        setTimeout(() => {
          router.push(`/client-cash-success?outletId=${outletId}`);
        }, 1500);
      }

    } catch (err: any) {
      console.error('Submit error:', err);
      setError(err.message || 'An unknown error occurred.');
      setLoading(false);
    }
  };

  const showAmountField = !formData.tookPackage;
  const isSubmitDisabled = loading;

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-black to-gray-800 flex items-center justify-center p-4">
      <div className="max-w-lg w-full bg-gray-900 rounded-2xl shadow-2xl p-8 border border-gray-700">
        <h1 className="text-2xl font-bold text-white text-center mb-2">Welcome to {outlet?.name || 'Your Spa'}</h1>
        <p className="text-center text-gray-400 mb-6">Client Check-in</p>

        {error && !success && <div className="mb-4 p-3 bg-red-900/50 text-red-300 rounded-lg border border-red-700 text-sm">{error}</div>}
        {success && <div className="mb-4 p-3 bg-green-900/50 text-green-300 rounded-lg border border-green-700 text-sm">{success}</div>}

        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label htmlFor="mobile" className="block text-sm font-medium text-gray-300 mb-1">Phone Number *</label>
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
              <label htmlFor="name" className="block text-sm font-medium text-gray-300 mb-1">Full Name *</label>
              <input
                id="name"
                name="name"
                type="text"
                value={formData.name}
                onChange={handleChange}
                required
                className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg focus:ring-1 focus:ring-red-500 text-white placeholder:text-gray-500"
                placeholder="Client's full name"
                disabled={loading}
              />
            </div>
          </div>

          {clientInfo && clientInfo.status === 'active' && (
            <div className="p-3 bg-green-900/50 border border-green-700 rounded-lg text-sm text-center text-green-300">
              <strong>Active package found.</strong> (Can buy another)
            </div>
          )}
           {clientInfo && clientInfo.status !== 'active' && (
            <div className="p-3 bg-yellow-900/50 border border-yellow-700 rounded-lg text-sm text-center text-yellow-300">
              No active package found.
            </div>
          )}

          <div>
            <label htmlFor="treatment" className="block text-sm font-medium text-gray-300 mb-1">Select Treatment *</label>
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
              {treatments.map(t => (
                <option key={t.id} value={t.name}>
                  {t.name}
                </option>
              ))}
            </select>
          </div>

          {/* --- Therapist Inputs: Primary + optional Secondary reveal checkbox --- */}
          <div className="space-y-3">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">Therapist (Primary) *</label>
                <select
                  name="therapistPrimary"
                  value={formData.therapistPrimary}
                  onChange={handleChange}
                  className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg focus:ring-1 focus:ring-red-500 text-white placeholder:text-gray-500"
                  disabled={loading}
                  required={true}
                >
                  <option value="">-- Select Therapist 1 --</option>
                  {employees.map((emp) => {
                    const outletName = emp.outlet_id ? (OUTLETS.find(o => o.id === emp.outlet_id)?.name ?? emp.outlet_id) : '';
                    return (
                      <option key={emp.id} value={emp.name}>
                        {emp.is_checked_in ? '🟢 ' : ''}{emp.name}{outletName ? ` — ${outletName}` : ''}
                      </option>
                    );
                  })}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">Room Number</label>
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
              <span className="text-sm text-gray-300">Add second therapist</span>
            </label>

            {formData.showSecondaryTherapist && (
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">Therapist (Secondary) <span className="text-xs text-gray-400">(optional)</span></label>
                <select
                  name="therapistSecondary"
                  value={formData.therapistSecondary}
                  onChange={handleChange}
                  className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg focus:ring-1 focus:ring-red-500 text-white placeholder:text-gray-500"
                  disabled={loading}
                >
                  <option value="">-- Select Therapist 2 (optional) --</option>
                  {employees.map((emp) => {
                    const outletName = emp.outlet_id ? (OUTLETS.find(o => o.id === emp.outlet_id)?.name ?? emp.outlet_id) : '';
                    return (
                      <option key={emp.id} value={emp.name}>
                        {emp.is_checked_in ? '🟢 ' : ''}{emp.name}{outletName ? ` — ${outletName}` : ''}
                      </option>
                    );
                  })}
                </select>
              </div>
            )}
          </div>
          {/* --- End Therapist Inputs --- */}

          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">
              {formData.tookPackage ? 'First Session Duration (Optional)' : 'Session Duration *'}
            </label>
            <div className="flex space-x-2">
              <div className="flex-1">
                <input
                  name="sessionHours"
                  type="number" min="0" max="10" step="1"
                  placeholder="Hours"
                  value={formData.sessionHours || ''}
                  onChange={handleChange}
                  className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg focus:ring-1 focus:ring-red-500 text-white placeholder:text-gray-500"
                  disabled={loading}
                />
              </div>
              <div className="flex-1">
                <input
                  name="sessionMinutes"
                  type="number" min="0" max="59" 
                  step="1"
                  placeholder="Mins"
                  value={formData.sessionMinutes || ''}
                  onChange={handleChange}
                  className="w-full px-3 py-2 bg_gray-800 border border-gray-700 rounded-lg focus:ring-1 focus:ring-red-500 text-white placeholder:text-gray-500"
                  disabled={loading}
                />
              </div>
            </div>
          </div>

          <div className="pt-4 border-t border-gray-700 space-y-3">
            <label className="flex items-center cursor-pointer p-2 rounded-md hover:bg-gray-800">
              <input
                type="checkbox"
                name="tookPackage"
                checked={formData.tookPackage}
                onChange={handleChange}
                className="h-4 w-4 text-red-600 bg-gray-700 border-gray-600 rounded focus:ring-red-500 focus:ring-offset-gray-900"
                disabled={loading}
              />
              <span className="ml-2 text-sm text-gray-300">
                Add new package
              </span>
            </label>
            
            {formData.tookPackage && (
              <div className="p-4 bg-gray-800 rounded-lg border border-gray-700 space-y-4">
                <h3 className="text-md font-medium text-white">New Package Details</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-1">Package Amount (₹) *</label>
                    <input
                      name="packageAmount"
                      type="number"
                      min="0"
                      value={formData.packageAmount || ''}
                      onChange={handleChange}
                      required={formData.tookPackage}
                      className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg focus:ring-1 focus:ring-red-500 text-white"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-1">Total Hours *</label>
                    <input
                      name="totalPackageHours"
                      type="number"
                      min="0"
                      step="0.1"
                      value={formData.totalPackageHours || ''}
                      onChange={handleChange}
                      required={formData.tookPackage}
                      className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg focus:ring-1 focus:ring-red-500 text-white"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1">Package Validity *</label>
                  <select
                    name="packageValidity"
                    value={formData.packageValidity}
                    onChange={handleChange}
                    required={formData.tookPackage}
                    className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg focus:ring-1 focus:ring-red-500 text-white"
                  >
                    <option value="3 months">3 Months</option>
                    <option value="6 months">6 Months</option>
                    <option value="9 months">9 Months</option>
                  </select>
                </div>
                {/* --- Sold By Dropdown (All Staff in outlet) --- */}
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1">Sold By (Staff Name) *</label>
                  <select
                    name="sold_by"
                    value={formData.sold_by}
                    onChange={handleChange}
                    required={formData.tookPackage}
                    className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg focus:ring-1 focus:ring-red-500 text-white"
                  >
                     <option value="">-- Select Staff --</option>
                     {outletStaff.map(emp => (
                        <option key={emp.id} value={emp.name}>
                           {emp.name}{emp.role ? ` — ${emp.role}` : ''}
                        </option>
                     ))}
                  </select>
                </div>
              </div>
            )}
          </div>

          {showAmountField && (
            <div>
              <label htmlFor="amountPaid" className="block text-sm font-medium text-gray-300 mb-1">Amount for Treatment (₹) *</label>
              <input
                id="amountPaid"
                name="amountPaid"
                type="number"
                min="0"
                step="1"
                value={formData.amountPaid || ''}
                onChange={handleChange}
                className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg focus:ring-1 focus:ring-red-500 text-white placeholder:text-gray-500"
                placeholder="Enter amount (e.g., 500)"
                disabled={loading}
                required={!formData.tookPackage}
              />
            </div>
          )}

          {!formData.tookPackage && (
            <div>
              <label htmlFor="paymentMethod" className="block text-sm font-medium text-gray-300 mb-1">Payment Option</label>
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
          )}
          {formData.tookPackage && (
            <div>
              <label htmlFor="paymentMethod" className="block text-sm font-medium text-gray-300 mb-1">Payment Option</label>
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
          )}

          <button
            type="submit"
            disabled={isSubmitDisabled}
            className="w-full bg-red-600 hover:bg-red-700 text-white font-medium py-3 px-4 rounded-lg transition duration-300 disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {loading ? 'Processing...' :
             formData.tookPackage ? 
               (formData.paymentMethod === 'upi' ? 'Register Package & Pay UPI' : 
                formData.paymentMethod === 'cash' ? 'Register Package & Accept Cash' : 'Register Package & Accept Card') :
             formData.paymentMethod === 'upi' ? 'Proceed to UPI Payment' :
              formData.paymentMethod === 'cash' ? 'Register & Accept Cash' : 'Register & Accept Card'
            }
          </button>
        </form>
      </div>
    </div>
  );
}
