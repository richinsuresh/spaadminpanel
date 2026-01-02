// src/app/(protected)/form/page.tsx
'use client';

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { OUTLETS } from '@/lib/outlet';
import { supabase } from '@/lib/supabase';
import { Trash2, UserPlus, Calendar, Clock } from 'lucide-react';

// --- Type Definitions ---
type ClientInfo = {
  status: 'active' | 'expired';
  name: string;
  mobile: string;
  packageAmount: number;
  totalPackageHours: number;
  usedPackageHours: number;
  remainingHours: number;
  expiryDate: string;
  packageId: string | null;
};

type Employee = { id: string; name: string; role: string; };
type Treatment = { id: string; name: string; };

type AdditionalCustomer = {
  id: string;
  name: string;
  treatment: string;
  sessionHours: number;
  sessionMinutes: number;
  therapistName: string;
  therapistName2: string;
  room: string;
};

const outletsList = OUTLETS.map((o: any) => o.name);

export default function ClientForm() {
  const router = useRouter();

  const [mobile, setMobile] = useState('');
  const [clientInfo, setClientInfo] = useState<ClientInfo | null>(null);
  
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [treatments, setTreatments] = useState<Treatment[]>([]);

  // Helper for current time HH:mm
  const getCurrentTime = () => {
    const now = new Date();
    return now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  };

  const [formData, setFormData] = useState({
    name: '',
    date: new Date().toISOString().split('T')[0],
    checkInTime: getCurrentTime(), // Added Check-In Time State
    treatment: '',
    amountPaid: 0,
    sessionHours: 0,
    sessionMinutes: 0,
    tookPackage: false,
    isPackageCustomer: false,
    packageAmount: 0,
    totalPackageHours: 0,
    outlet: '',
    paymentMethod: 'cash',
    sold_by: '',
    packageValidity: '3 months', 
    therapistName: '', 
    therapistName2: '', 
    room: '',
  });

  const [additionalCustomers, setAdditionalCustomers] = useState<AdditionalCustomer[]>([]);
  
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [inputError, setInputError] = useState('');
  const lookupTimeout = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (outletsList.length > 0) {
      setFormData(prev => ({ ...prev, outlet: outletsList[0] }));
    }
    return () => {
      if (lookupTimeout.current) clearTimeout(lookupTimeout.current);
    };
  }, []);

  useEffect(() => {
    const fetchStaff = async () => {
      try {
        const { data } = await supabase.from('employees').select('id, name, role').eq('is_active', true).order('name');
        setEmployees(data || []);
      } catch (e) {
        console.error('Failed to fetch employees', e);
        setEmployees([]);
      }
    };
    fetchStaff();
  }, []);

  useEffect(() => {
    async function fetchTreatments() {
        const selectedOutletObj = OUTLETS.find(o => o.name === formData.outlet);
        if (!selectedOutletObj) return;
        try {
            const { data } = await supabase.from('treatments').select('id, name').eq('outlet_id', selectedOutletObj.id).order('name');
            setTreatments(data || []);
            setFormData(prev => ({ ...prev, treatment: '' }));
        } catch (error) {
            console.error('Error fetching treatments:', error);
            setTreatments([]);
        }
    }
    if (formData.outlet) {
        fetchTreatments();
    }
  }, [formData.outlet]);

  const therapistOptions = useMemo(() => 
    employees.filter(e => e.role === 'therapist' || e.role === 'Therapist'), 
  [employees]);

  const allStaffOptions = employees;

  useEffect(() => {
    if (lookupTimeout.current) clearTimeout(lookupTimeout.current);
    setClientInfo(null);
    setInputError('');

    if (mobile.length === 10) {
      const lookup = async () => {
        try {
          setInputError('');
          const res = await fetch(`/api/client-lookup?mobile=${encodeURIComponent(mobile)}`);
          if (!res.ok) {
            setClientInfo(null);
            setFormData(prev => ({ ...prev, name: '', isPackageCustomer: false, tookPackage: false }));
            return;
          }
          const data: ClientInfo | null = await res.json();
          setClientInfo(data);
          if (data) {
            setFormData(prev => ({ ...prev, name: data.name, isPackageCustomer: data.status === 'active' }));
          } else {
            setFormData(prev => ({ ...prev, name: '', isPackageCustomer: false, tookPackage: false }));
          }
        } catch (e) {
          console.error('Lookup error', e);
          setClientInfo(null);
          setFormData(prev => ({ ...prev, name: '', isPackageCustomer: false, tookPackage: false }));
        }
      };
      lookupTimeout.current = setTimeout(lookup, 500);
    } else if (mobile.length < 10) {
      setFormData(prev => ({ ...prev, name: '', isPackageCustomer: false, tookPackage: false }));
    }
  }, [mobile]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value, type } = e.target;
    const checked = (e.target as HTMLInputElement).checked;
    setFormData(prev => {
      const updated = {
        ...prev,
        [name]: type === 'checkbox' ? checked : (type === 'number' ? (value === '' ? 0 : Number(value)) : value)
      };
      if (name === 'isPackageCustomer' && checked) updated.tookPackage = false;
      if (name === 'tookPackage' && checked) updated.isPackageCustomer = false;
      return updated;
    });
  };

  const addAdditionalCustomer = () => {
    setAdditionalCustomers(prev => [
      ...prev,
      {
        id: crypto.randomUUID(),
        name: '',
        treatment: '',
        sessionHours: formData.sessionHours,
        sessionMinutes: formData.sessionMinutes,
        therapistName: '',
        therapistName2: '',
        room: ''
      }
    ]);
  };

  const removeAdditionalCustomer = (id: string) => {
    setAdditionalCustomers(prev => prev.filter(c => c.id !== id));
  };

  const updateAdditionalCustomer = <K extends keyof AdditionalCustomer>(id: string, field: K, value: AdditionalCustomer[K]) => {
    setAdditionalCustomers(prev => prev.map(c => c.id === id ? { ...c, [field]: value } : c));
  };

  const getSessionDuration = useCallback(() => {
    const hours = Number(formData.sessionHours) || 0;
    const minutes = Number(formData.sessionMinutes) || 0;
    return hours + (minutes / 60);
  }, [formData.sessionHours, formData.sessionMinutes]);

  const getFinalAmountInPaise = useCallback(() => {
    if (formData.isPackageCustomer) return 0;
    if (formData.tookPackage) {
      return (Number(formData.packageAmount) || 0) * 100;
    }
    return (Number(formData.amountPaid) || 0) * 100;
  }, [formData.isPackageCustomer, formData.tookPackage, formData.packageAmount, formData.amountPaid]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setInputError('');

    const sessionHours = getSessionDuration();
    if (formData.isPackageCustomer && sessionHours <= 0) {
      setInputError('Please enter Session Duration when using package credits.');
      setIsSubmitting(false);
      return;
    }
    
    if ((sessionHours > 0 || formData.isPackageCustomer) && !String(formData.therapistName || '').trim()) {
      setInputError("Please select at least one Therapist for the Main Customer.");
      setIsSubmitting(false);
      return;
    }

    for (let i = 0; i < additionalCustomers.length; i++) {
        const c = additionalCustomers[i];
        const dur = (Number(c.sessionHours) || 0) + (Number(c.sessionMinutes) || 0) / 60;
        if (!c.name || !c.treatment || dur <= 0) {
            setInputError(`Please complete details for Guest ${i + 1} (Name, Treatment, Duration).`);
            setIsSubmitting(false);
            return;
        }
        if(!c.therapistName) {
            setInputError(`Please select a therapist for Guest ${i + 1} (${c.name}).`);
            setIsSubmitting(false);
            return;
        }
    }

    if (formData.tookPackage) {
      if (!formData.packageAmount || formData.packageAmount <= 0 || !formData.totalPackageHours || formData.totalPackageHours <= 0) {
        setInputError('Please enter a valid Package Amount and Total Hours for the new package.');
        setIsSubmitting(false);
        return;
      }
      if (!String(formData.sold_by || '').trim()) {
        setInputError('Please enter the name of the person who sold the package.');
        setIsSubmitting(false);
        return;
      }
    }

    if (!formData.isPackageCustomer && !formData.tookPackage && (Number(formData.amountPaid) <= 0 || !formData.amountPaid)) {
        setInputError('Please enter a valid Amount for the treatment.');
        setIsSubmitting(false);
        return;
    }
    if (!formData.outlet) {
      setInputError('Please select an outlet.');
      setIsSubmitting(false);
      return;
    }

    const finalAmountInPaise = getFinalAmountInPaise();
    const effectivePaymentMethod = formData.isPackageCustomer ? 'package' : formData.paymentMethod;
    
    const outlet = OUTLETS.find(o => o.name === formData.outlet);
    const outlet_id = outlet ? outlet.id : 'unknown';

    let combinedTherapistName = formData.therapistName;
    if (formData.therapistName2) {
        combinedTherapistName = `${formData.therapistName} & ${formData.therapistName2}`;
    }

    // --- Time Calculation Logic (Calculated from Form Inputs) ---
    // Combine Date + CheckInTime
    const checkInDateTime = new Date(`${formData.date}T${formData.checkInTime}`);
    
    if (isNaN(checkInDateTime.getTime())) {
        setInputError("Invalid Date or Time selection.");
        setIsSubmitting(false);
        return;
    }

    const formatTimeHM = (date: Date) => date.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });

    // Main Customer Times
    const mainCheckInStr = formData.checkInTime;
    const mainOutTime = new Date(checkInDateTime.getTime() + sessionHours * 60 * 60 * 1000);
    const mainCheckOutStr = formatTimeHM(mainOutTime);

    // Build Group Payload (Uses Base Check-In Time)
    const groupCustomersPayload = additionalCustomers.map(c => {
        const dur = (Number(c.sessionHours) || 0) + (Number(c.sessionMinutes) || 0) / 60;
        const checkOut = new Date(checkInDateTime.getTime() + dur * 60 * 60 * 1000);
        
        let groupTherapist = c.therapistName;
        if(c.therapistName2) groupTherapist = `${c.therapistName} & ${c.therapistName2}`;

        return {
            name: c.name,
            treatment: c.treatment,
            sessionHours: dur,
            therapist_name: groupTherapist,
            room: c.room,
            in_time: mainCheckInStr,
            out_time: formatTimeHM(checkOut),
        }
    });

    try {
      let checkInTime: string | null = null;
      if (formData.paymentMethod === 'cash' || formData.paymentMethod === 'card' || formData.paymentMethod === 'upi' || formData.isPackageCustomer) {
        checkInTime = checkInDateTime.toISOString();
      }
      
      const payload: any = {
        name: String(formData.name || '').trim(),
        mobile: mobile,
        date: formData.date,
        treatment: formData.treatment,
        amountPaid: (formData.isPackageCustomer || formData.tookPackage) ? 0 : finalAmountInPaise,
        sessionHours: sessionHours,
        isPackageCustomer: formData.isPackageCustomer,
        packageId: formData.isPackageCustomer ? (clientInfo?.packageId || null) : null,
        tookPackage: formData.tookPackage,
        packageAmount: formData.tookPackage ? (Number(formData.packageAmount) || 0) * 100 : 0,
        totalPackageHours: formData.tookPackage ? Number(formData.totalPackageHours) || 0 : 0,
        outlet: formData.outlet,
        outlet_id: outlet_id,
        paymentMethod: effectivePaymentMethod,
        finalAmountInPaise: finalAmountInPaise, 
        check_in_time: checkInTime,
        packageSoldBy: formData.tookPackage ? formData.sold_by : null, 
        packageValidity: formData.tookPackage ? formData.packageValidity : null, 
        therapist_name: combinedTherapistName, 
        room: formData.room,
        
        // --- Send calculated strings for Dashboard display ---
        in_time: mainCheckInStr,
        out_time: mainCheckOutStr, 

        group_customers: groupCustomersPayload.length > 0 ? groupCustomersPayload : null
      };

      const response = await fetch('/api/client-form-submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const text = await response.text();
      let data: any = null;
      try { data = text ? JSON.parse(text) : null; } catch (parseErr) {
        console.warn('client-form-submit: response not JSON:', text);
      }

      if (response.ok) {
        if (data && typeof data.ok !== 'undefined') {
          if (data.ok) {
            setSuccess(true);
            setIsSubmitting(false);
            setTimeout(() => {
              router.refresh();
              router.push('/dashboard/sales');
            }, 900);
            return;
          } else {
            const err = data.error || data.message || 'Server rejected the request';
            setInputError(String(err));
            setIsSubmitting(false);
            return;
          }
        }
        setSuccess(true);
        setIsSubmitting(false);
        setTimeout(() => {
          router.refresh();
          router.push('/dashboard/sales');
        }, 900);
        return;
      }

      const serverMsg = data?.error ?? data?.message ?? text ?? `${response.status} ${response.statusText}`;
      setInputError(String(serverMsg));
      setIsSubmitting(false);

    } catch (err: any) {
      console.error('Error saving record:', err);
      setInputError('An unexpected error occurred.');
      setIsSubmitting(false);
    }
  };
  
  const showAmountField = !formData.tookPackage && !formData.isPackageCustomer;
  const showPaymentSelector = formData.tookPackage || showAmountField;

  return (
    <div className="max-w-3xl mx-auto p-6 bg-white rounded-xl shadow-md mt-8 relative">
      <h1 className="text-2xl font-bold text-gray-800 mb-6">
        Add New Customer / Package (Admin)
      </h1>
      <button
        type="button"
        onClick={() => router.push('/dashboard')}
        className="absolute top-6 right-6 text-gray-500 hover:text-gray-700 text-2xl"
        aria-label="Close"
      >
        &times;
      </button>

      {success && (
        <div className="mb-6 p-4 bg-green-50 text-green-700 rounded-lg border border-green-200">
          ✅ Client added successfully! Redirecting...
        </div>
      )}

      {inputError && (
        <div className="mb-4 p-3 bg-red-50 text-red-700 rounded-lg border border-red-200">
          {inputError}
        </div>
      )}

      <div className="mb-6">
        <label className="block text-sm font-medium text-gray-700 mb-2">Mobile Number *</label>
        <input
          type="tel"
          value={mobile}
          onChange={(e) => setMobile(e.target.value.replace(/\D/g, ''))}
          required
          maxLength={10}
          className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-black"
          placeholder="Enter 10-digit mobile to lookup client"
        />
      </div>

      {clientInfo && (
        <div className={`mb-6 p-4 rounded-lg border ${clientInfo.status === 'active' ? 'bg-green-50 border-green-200' : 'bg-yellow-50 border-yellow-200'}`}>
          <div className="flex justify-between items-center">
            <div>
              <span className="font-medium">{clientInfo.status === 'active' ? '✅ Active Package' : '⚠️ Package Expired/None'}</span>
              <span className="ml-2 font-semibold">{clientInfo.name}</span>
            </div>
            {clientInfo.status === 'active' && (
              <span className="px-2 py-1 bg-green-100 text-green-800 rounded-full text-sm">
                Remaining: {clientInfo.remainingHours.toFixed(1)} hrs
              </span>
            )}
          </div>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-5">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Full Name (Main Customer) *</label>
            <input
              name="name"
              type="text"
              value={formData.name}
              onChange={handleChange}
              required
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-black"
              placeholder={clientInfo ? '' : 'Enter name or lookup via mobile'}
            />
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Outlet *</label>
            <select
              name="outlet"
              value={formData.outlet}
              onChange={handleChange}
              required
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-black bg-white"
            >
              <option value="">-- Select Outlet --</option>
              {outletsList.map((o) => <option key={o} value={o}>{o}</option>)}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Treatment *</label>
            <select
              name="treatment"
              value={formData.treatment}
              onChange={handleChange}
              required
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-black bg-white"
            >
              <option value="">-- Select Treatment --</option>
              {treatments.map((t) => (
                <option key={t.id} value={t.name}>{t.name}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Room</label>
            <input
              name="room"
              type="text"
              value={formData.room}
              onChange={handleChange}
              placeholder="Enter room no."
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-black"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Primary Therapist</label>
            <select
              name="therapistName"
              value={formData.therapistName}
              onChange={handleChange}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-black bg-white"
            >
              <option value="">-- Select Therapist --</option>
              {therapistOptions.map((emp) => (
                <option key={emp.id} value={emp.name}>{emp.name}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Secondary Therapist (Optional)</label>
            <select
              name="therapistName2"
              value={formData.therapistName2}
              onChange={handleChange}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-black bg-white"
            >
              <option value="">-- None --</option>
              {therapistOptions.map((emp) => (
                <option key={`sec-${emp.id}`} value={emp.name}>{emp.name}</option>
              ))}
            </select>
          </div>

          {showAmountField && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Amount Paid (₹) *</label>
              <input
                name="amountPaid"
                type="number"
                min="0"
                step="1"
                value={formData.amountPaid || ''}
                onChange={handleChange}
                required={!formData.isPackageCustomer && !formData.tookPackage}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-black"
              />
            </div>
          )}

          {showPaymentSelector && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Payment Method *</label>
              <select
                name="paymentMethod"
                value={formData.paymentMethod}
                onChange={handleChange}
                required
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-black bg-white"
              >
                <option value="cash">Cash</option>
                <option value="card">Card</option>
                <option value="upi">UPI</option>
              </select>
            </div>
          )}

          {/* DURATION + TIME FIELDS */}
          <div className="md:col-span-2 grid grid-cols-1 md:grid-cols-2 gap-5">
            <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Session Duration {formData.isPackageCustomer ? '*' : ''}</label>
                <div className="flex space-x-3">
                <div className="flex-1">
                    <input
                    name="sessionHours"
                    type="number"
                    min="0"
                    placeholder="Hrs"
                    value={formData.sessionHours || ''}
                    onChange={handleChange}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-black"
                    />
                </div>
                <div className="flex-1">
                    <input
                    name="sessionMinutes"
                    type="number"
                    min="0"
                    max="59"
                    step="15"
                    placeholder="Mins"
                    value={formData.sessionMinutes || ''}
                    onChange={handleChange}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-black"
                    />
                </div>
                </div>
            </div>

            <div className="flex gap-3">
                <div className="flex-1">
                    <label className="block text-sm font-medium text-gray-700 mb-1 flex items-center gap-1">
                        <Calendar size={14} /> Date
                    </label>
                    <input
                        name="date"
                        type="date"
                        value={formData.date}
                        onChange={handleChange}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-black"
                    />
                </div>
                <div className="flex-1">
                    <label className="block text-sm font-medium text-gray-700 mb-1 flex items-center gap-1">
                        <Clock size={14} /> Check In
                    </label>
                    <input
                        name="checkInTime"
                        type="time"
                        value={formData.checkInTime}
                        onChange={handleChange}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-black"
                    />
                </div>
            </div>
          </div>
        </div>

        {/* --- GROUP CUSTOMERS UI --- */}
        {!formData.tookPackage && (
            <div className="border border-gray-200 bg-gray-50 rounded-lg p-4 space-y-4">
                <div className="flex items-center justify-between">
                    <div>
                        <h3 className="text-sm font-bold text-gray-700">Additional Customers (Group)</h3>
                        <p className="text-xs text-gray-500">Same bill, different treatments.</p>
                    </div>
                    <button
                        type="button"
                        onClick={addAdditionalCustomer}
                        className="text-xs px-3 py-1.5 rounded-md border border-blue-600 text-blue-600 hover:bg-blue-600 hover:text-white transition flex items-center gap-1"
                    >
                        <UserPlus size={14} /> Add Guest
                    </button>
                </div>

                {additionalCustomers.map((c, index) => (
                    <div key={c.id} className="p-3 bg-white border border-gray-200 rounded-lg space-y-3 relative">
                        <div className="flex justify-between items-center mb-1">
                            <span className="text-xs font-bold text-gray-500 uppercase">Guest {index + 1}</span>
                            <button type="button" onClick={() => removeAdditionalCustomer(c.id)} className="text-red-500 hover:text-red-700">
                                <Trash2 size={16} />
                            </button>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                            <div>
                                <label className="block text-xs font-medium text-gray-600">Guest Name</label>
                                <input
                                    type="text"
                                    className="w-full px-2 py-1.5 border rounded text-sm text-black"
                                    value={c.name}
                                    onChange={(e) => updateAdditionalCustomer(c.id, 'name', e.target.value)}
                                    placeholder="Name"
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-medium text-gray-600">Treatment</label>
                                <select
                                    className="w-full px-2 py-1.5 border rounded text-sm text-black bg-white"
                                    value={c.treatment}
                                    onChange={(e) => updateAdditionalCustomer(c.id, 'treatment', e.target.value)}
                                >
                                    <option value="">Select...</option>
                                    {treatments.map(t => <option key={t.id} value={t.name}>{t.name}</option>)}
                                </select>
                            </div>
                            <div>
                                <label className="block text-xs font-medium text-gray-600">Therapist 1</label>
                                <select
                                    className="w-full px-2 py-1.5 border rounded text-sm text-black bg-white"
                                    value={c.therapistName}
                                    onChange={(e) => updateAdditionalCustomer(c.id, 'therapistName', e.target.value)}
                                >
                                    <option value="">Select...</option>
                                    {therapistOptions.map(e => <option key={e.id} value={e.name}>{e.name}</option>)}
                                </select>
                            </div>
                            <div>
                                <label className="block text-xs font-medium text-gray-600">Therapist 2 (Opt)</label>
                                <select
                                    className="w-full px-2 py-1.5 border rounded text-sm text-black bg-white"
                                    value={c.therapistName2}
                                    onChange={(e) => updateAdditionalCustomer(c.id, 'therapistName2', e.target.value)}
                                >
                                    <option value="">None</option>
                                    {therapistOptions.map(e => <option key={`g-${e.id}`} value={e.name}>{e.name}</option>)}
                                </select>
                            </div>
                            <div>
                                <label className="block text-xs font-medium text-gray-600">Room</label>
                                <input
                                    type="text"
                                    className="w-full px-2 py-1.5 border rounded text-sm text-black"
                                    value={c.room}
                                    onChange={(e) => updateAdditionalCustomer(c.id, 'room', e.target.value)}
                                    placeholder="Room No"
                                />
                            </div>
                            <div className="flex gap-2">
                                <div className="flex-1">
                                    <label className="block text-xs font-medium text-gray-600">Hrs</label>
                                    <input type="number" min="0" className="w-full px-2 py-1.5 border rounded text-sm text-black" value={c.sessionHours} onChange={(e) => updateAdditionalCustomer(c.id, 'sessionHours', Number(e.target.value))} />
                                </div>
                                <div className="flex-1">
                                    <label className="block text-xs font-medium text-gray-600">Mins</label>
                                    <input type="number" min="0" step="15" className="w-full px-2 py-1.5 border rounded text-sm text-black" value={c.sessionMinutes} onChange={(e) => updateAdditionalCustomer(c.id, 'sessionMinutes', Number(e.target.value))} />
                                </div>
                            </div>
                        </div>
                    </div>
                ))}
            </div>
        )}

        <div className="pt-4 border-t border-gray-200 space-y-3">
          <label className="flex items-center cursor-pointer">
            <div className="relative">
              <input
                type="checkbox"
                name="isPackageCustomer"
                checked={formData.isPackageCustomer}
                onChange={handleChange}
                className="sr-only"
                disabled={!clientInfo || clientInfo.status !== 'active'}
              />
              <div className={`block w-14 h-8 rounded-full ${formData.isPackageCustomer ? 'bg-blue-500' : 'bg-gray-300'} ${(!clientInfo || clientInfo.status !== 'active') ? 'opacity-50 cursor-not-allowed' : ''}`}></div>
              <div className={`absolute left-1 top-1 bg-white w-6 h-6 rounded-full transition-transform ${formData.isPackageCustomer ? 'transform translate-x-6' : ''}`}></div>
            </div>
            <div className={`ml-3 text-gray-700 text-sm ${(!clientInfo || clientInfo.status !== 'active') ? 'opacity-50' : ''}`}>
              Existing package customer (use package credits)
            </div>
          </label>

          <label className="flex items-center cursor-pointer">
            <div className="relative">
              <input
                type="checkbox"
                name="tookPackage"
                checked={formData.tookPackage}
                onChange={handleChange}
                className="sr-only"
                disabled={!!clientInfo && clientInfo.status === 'active'}
              />
              <div className={`block w-14 h-8 rounded-full ${formData.tookPackage ? 'bg-purple-500' : 'bg-gray-300'} ${ (!!clientInfo && clientInfo.status === 'active') ? 'opacity-50 cursor-not-allowed' : ''}`}></div>
              <div className={`absolute left-1 top-1 bg-white w-6 h-6 rounded-full transition-transform ${formData.tookPackage ? 'transform translate-x-6' : ''}`}></div>
            </div>
            <div className={`ml-3 text-gray-700 text-sm ${ (!!clientInfo && clientInfo.status === 'active') ? 'opacity-50' : ''}`}>
              Taking a new package today
            </div>
          </label>
        </div>

        {formData.tookPackage && (
          <div className="mt-4 p-4 bg-purple-50 rounded-lg border border-purple-200 space-y-4">
            <h3 className="text-md font-semibold text-purple-800">New Package Details</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Package Amount (₹) *</label>
                <input
                  name="packageAmount"
                  type="number"
                  min="0"
                  value={formData.packageAmount || ''}
                  onChange={handleChange}
                  required={formData.tookPackage}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-1 focus:ring-purple-500 focus:border-purple-500 text-black"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Total Hours *</label>
                <input
                  name="totalPackageHours"
                  type="number"
                  min="0"
                  step="0.1"
                  value={formData.totalPackageHours || ''}
                  onChange={handleChange}
                  required={formData.tookPackage}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-1 focus:ring-purple-500 focus:border-purple-500 text-black"
                />
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Sold By (Staff Name) *</label>
                <select
                  name="sold_by"
                  value={formData.sold_by}
                  onChange={handleChange}
                  required={formData.tookPackage}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-1 focus:ring-purple-500 focus:border-purple-500 text-black bg-white"
                >
                    <option value="">-- Select Staff --</option>
                    {allStaffOptions.map(emp => (
                    <option key={emp.id} value={emp.name}>{emp.name} ({emp.role})</option>
                    ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Package Validity *</label>
                <select
                  name="packageValidity"
                  value={formData.packageValidity}
                  onChange={handleChange}
                  required={formData.tookPackage}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-1 focus:ring-purple-500 focus:border-purple-500 text-black bg-white"
                >
                  <option value="3 months">3 Months</option>
                  <option value="6 months">6 Months</option>
                  <option value="9 months">9 Months</option>
                </select>
              </div>
            </div>
          </div>
        )}

        <button
          type="submit"
          disabled={isSubmitting}
          className="w-full py-3 px-4 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-400"
        >
          {isSubmitting ? 'Saving...' : 'Save Record'}
        </button>
      </form>
    </div>
  );
}