// src/app/outlet/dashboard/packages/new/page.tsx
'use client';

import { useState, useEffect, useCallback, FormEvent, useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import { OUTLETS, Outlet } from '@/lib/outlet';
import { exportToExcel } from '@/lib/exportToExcel';
import { useActivityLog } from '@/hooks/useActivityLog';
import { Loader2, Save } from 'lucide-react';
import { useRouter } from 'next/navigation';

/* ===================== TYPES ===================== */

type Employee = { id: string; name: string; role: string | null; };
type Treatment = { id: string; name: string };

type NewPackageForm = {
  name: string;
  mobile: string;
  treatment: string;
  packageAmount: number; // in ₹
  totalPackageHours: number;
  sessionHours: number;
  sessionMinutes: number;
  packageValidity: string;
  sold_by: string;
  therapistPrimary: string;
  therapistSecondary: string;
  showSecondaryTherapist: boolean;
  room: string;
  paymentMethod: string;
};

/* ===================== HELPERS ===================== */

const formatCurrency = (amountPaise: number) =>
  new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: 0,
  }).format((amountPaise || 0) / 100);

const getSessionDurationHours = (h: number, m: number) => Number(h) + Number(m) / 60;

function calculateNewExpiryDate(currentExpiryDateStr: string | null, validityPeriod: string): string {
  const parts = validityPeriod.split(' ');
  const amount = parts[0] || '0';
  const monthsToAdd = parseInt(amount, 10);

  let baseDate: Date;
  
  if (currentExpiryDateStr) {
    const currentExpiry = new Date(currentExpiryDateStr);
    currentExpiry.setHours(0, 0, 0, 0);

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    baseDate = currentExpiry >= today ? currentExpiry : today;
  } else {
    baseDate = new Date();
  }

  const newExpiryDate = new Date(baseDate.getTime());
  newExpiryDate.setMonth(newExpiryDate.getMonth() + monthsToAdd);

  return newExpiryDate.toISOString().split('T')[0];
}

const PACKAGE_VALIDITY_OPTIONS = Array.from({ length: 22 }, (_, i) => `${i + 3} months`);
const getToday = () => new Date().toISOString().split('T')[0]; // Helper defined outside component
const DEFAULT_FORM_STATE: NewPackageForm = {
    name: '',
    mobile: '',
    treatment: '',
    packageAmount: 0,
    totalPackageHours: 0,
    sessionHours: 0,
    sessionMinutes: 0,
    packageValidity: '3 months',
    sold_by: '',
    therapistPrimary: '',
    therapistSecondary: '',
    showSecondaryTherapist: false,
    room: '',
    paymentMethod: 'cash',
};

/* ===================== PAGE COMPONENT ===================== */

export default function NewPackageSalePage() {
    const router = useRouter();
    const { logActivity } = useActivityLog();

    const [treatments, setTreatments] = useState<Treatment[]>([]);
    const [outletStaff, setOutletStaff] = useState<Employee[]>([]);
    const [outlet, setOutlet] = useState<Outlet | null>(null);
    const [form, setForm] = useState<NewPackageForm>(DEFAULT_FORM_STATE);

    const [loading, setLoading] = useState(true);
    const [submitError, setSubmitError] = useState<string | null>(null);
    const [isSubmitting, setIsSubmitting] = useState(false);
    
    const [selectedOutletId, setSelectedOutletId] = useState('');


    /* ============ DATA FETCHING ============ */

    const fetchStaffAndTreatments = useCallback(async (outletId: string) => {
        if (!outletId) return;
        try {
            const [staffRes, treatmentRes] = await Promise.all([
                supabase.from('employees').select('id, name, role').eq('outlet_id', outletId).eq('is_active', true),
                supabase.from('treatments').select('id, name').eq('outlet_id', outletId),
            ]);
            
            if (staffRes.error) throw staffRes.error;
            if (treatmentRes.error) throw treatmentRes.error;

            setOutletStaff((staffRes.data || []) as Employee[]);
            setTreatments((treatmentRes.data || []) as Treatment[]);
            setLoading(false);
        } catch (err) {
            console.error('Error fetching staff/treatments:', err);
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        async function getOutletData() {
            try {
                const res = await fetch('/api/outlet');
                const data = await res.json();
                if (data.outletId) {
                    setSelectedOutletId(data.outletId);
                    setOutlet(OUTLETS.find(o => o.id === data.outletId) || null);
                    fetchStaffAndTreatments(data.outletId);
                } else {
                    router.push('/outlet-login');
                }
            } catch (err) {
                console.error('Outlet session fetch failed', err);
                router.push('/outlet-login'); 
            }
        }
        getOutletData();
    }, [fetchStaffAndTreatments, router]);


    /* ============ FORM & SUBMISSION LOGIC ============ */

    const handleFormChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        const { name, value, type } = e.target;
        const checked = type === 'checkbox' ? (e.target as HTMLInputElement).checked : undefined;
        
        setSubmitError(null);
        setForm(prev => {
            let updatedValue: string | number | boolean;
            if (type === 'checkbox') {
                updatedValue = checked ?? false;
            } else if (type === 'number') {
                updatedValue = value === '' ? 0 : Number(value);
            } else {
                updatedValue = value;
            }
            
            const updated: any = { ...prev, [name]: updatedValue };

            if (name === 'showSecondaryTherapist' && updatedValue === false) {
                updated.therapistSecondary = '';
            }
            return updated;
        });
    };

    const currentSessionDuration = getSessionDurationHours(form.sessionHours, form.sessionMinutes);
    
    const handleSubmit = async (e: FormEvent) => {
        e.preventDefault();
        setSubmitError(null);
        setIsSubmitting(true);
        
        if (!outlet) {
            setSubmitError('Outlet information is missing. Please log in again.');
            setIsSubmitting(false);
            return;
        }

        if (currentSessionDuration <= 0) {
            setSubmitError('Please enter a valid duration for the first session (Hours and/or Minutes).');
            setIsSubmitting(false);
            return;
        }
        if (form.totalPackageHours <= 0 || currentSessionDuration > form.totalPackageHours) {
            setSubmitError(`Total package hours must be greater than the session duration (${currentSessionDuration} hrs).`);
            setIsSubmitting(false);
            return;
        }
        if (form.packageAmount <= 0) {
            setSubmitError('Please enter a valid Package Amount.');
            setIsSubmitting(false);
            return;
        }
        
        // Final submission logic
        try {
            const checkInTime = new Date().toISOString();
            const expiryDate = calculateNewExpiryDate(null, form.packageValidity);
            const amountInPaise = Math.round(form.packageAmount * 100);

            const therapistCombined = form.therapistPrimary || null; 
            
            const packagePayload = {
                name: form.name,
                mobile: form.mobile,
                // --- FIX APPLIED HERE ---
                date: getToday(), 
                // ------------------------
                packageAmount: amountInPaise,
                totalPackageHours: form.totalPackageHours,
                sessionHours: currentSessionDuration,
                packageValidity: form.packageValidity,
                sold_by: form.sold_by,
                
                tookPackage: true,
                isPackageCustomer: false,
                
                // Standard data
                outlet: outlet.name,
                outlet_id: outlet.id,
                paymentMethod: form.paymentMethod,
                finalAmountInPaise: amountInPaise,
                check_in_time: checkInTime,
                
                // Staff/Session details
                treatment: form.treatment,
                therapist_name: therapistCombined,
                therapist_primary: form.therapistPrimary,
                therapist_secondary: form.showSecondaryTherapist ? form.therapistSecondary : null,
                room: form.room,
            };

            const res = await fetch('/api/client-form-submit', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(packagePayload),
            });

            const data = await res.json();
            if (!res.ok || data.error) {
                throw new Error(data.error || 'Package submission failed');
            }

            logActivity('record_package_sale', `Recorded new package for ${form.name} at ${outlet.name}. Value: ${formatCurrency(amountInPaise)}. Expiry: ${expiryDate}`);

            alert(`Package for ${form.name} successfully recorded and session started!`);
            
            router.push('/outlet/dashboard/sales');

        } catch (err: any) {
            console.error('New Package Submission Error:', err);
            setSubmitError(err.message || 'Failed to record package due to server error.');
        } finally {
            setIsSubmitting(false);
        }
    };


    if (loading) {
        return <div className="p-10 text-center"><Loader2 className="h-8 w-8 animate-spin mx-auto text-blue-600" /> <p className="mt-2 text-gray-600">Loading required data...</p></div>;
    }


    return (
        <div className="max-w-3xl w-full mx-auto p-4">
            <div className="bg-white rounded-xl shadow-2xl p-6 space-y-6 border border-gray-200">
                <div className="flex justify-between items-center pb-3 border-b border-gray-200">
                    <h1 className="text-2xl font-bold text-blue-600">Record New Package Sale ({outlet?.name})</h1>
                    <button onClick={() => router.push('/outlet/dashboard/sales')} className="px-3 py-1 bg-gray-200 rounded-lg hover:bg-gray-300 text-gray-700 text-sm">
                        Go to Sales
                    </button>
                </div>

                {submitError && (
                    <div className="mb-3 p-2 bg-red-100 text-red-700 rounded text-sm">{submitError}</div>
                )}

                <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4">
                    
                    {/* Section 1: Client Info */}
                    <div className="md:col-span-2 border-b pb-4 mb-2">
                        <h3 className="text-sm font-semibold text-gray-700">1. Client Details</h3>
                    </div>

                    <div>
                        <label className="text-xs font-semibold text-black">Client Name *</label>
                        <input type="text" name="name" value={form.name} onChange={handleFormChange} required className="w-full p-2 border rounded text-black bg-white" placeholder="Client Name" />
                    </div>
                    <div>
                        <label className="text-xs font-semibold text-black">Client Mobile *</label>
                        <input type="tel" name="mobile" value={form.mobile} onChange={handleFormChange} required maxLength={10} className="w-full p-2 border rounded text-black bg-white" placeholder="10-digit mobile" />
                    </div>

                    {/* Section 2: Package Details */}
                    <div className="md:col-span-2 border-b pb-4 pt-2">
                        <h3 className="text-sm font-semibold text-gray-700">2. Package Value & Terms</h3>
                    </div>

                    <div>
                        <label className="text-xs font-semibold text-black">Package Amount (₹) *</label>
                        <input type="number" name="packageAmount" value={form.packageAmount || ''} onChange={handleFormChange} required min="1" step="1" className="w-full p-2 border rounded text-black bg-white" placeholder="e.g., 10000" />
                    </div>
                    <div>
                        <label className="text-xs font-semibold text-black">Total Package Hours *</label>
                        <input type="number" name="totalPackageHours" value={form.totalPackageHours || ''} onChange={handleFormChange} required min={currentSessionDuration || 0.5} step="0.5" className="w-full p-2 border rounded text-black bg-white" placeholder="e.g., 10 hours" />
                    </div>

                    <div>
                        <label className="text-xs font-semibold text-black">Package Validity *</label>
                        <select name="packageValidity" value={form.packageValidity} onChange={handleFormChange} required className="w-full p-2 border rounded text-black bg-white">
                            {PACKAGE_VALIDITY_OPTIONS.map(opt => (
                                <option key={opt} value={opt}>{opt}</option>
                            ))}
                        </select>
                    </div>
                    
                    <div>
                        <label className="text-xs font-semibold text-black">Sold By (Staff Name) *</label>
                        <select name="sold_by" value={form.sold_by} onChange={handleFormChange} required className="w-full p-2 border rounded text-black bg-white">
                            <option value="">— Select Staff —</option>
                            {outletStaff.map(emp => (
                                <option key={emp.id} value={emp.name}>
                                    {emp.name} ({emp.role || 'Staff'})
                                </option>
                            ))}
                        </select>
                    </div>
                    
                    {/* Section 3: First Session & Staff Assignment */}
                    <div className="md:col-span-2 border-b pb-4 pt-2">
                        <h3 className="text-sm font-semibold text-gray-700">3. First Session & Staff</h3>
                    </div>
                    
                    <div>
                        <label className="text-xs font-semibold text-black">Treatment Type *</label>
                        <select name="treatment" value={form.treatment} onChange={handleFormChange} required className="w-full p-2 border rounded text-black bg-white">
                            <option value="">— Select Treatment —</option>
                            {treatments.map(t => (
                                <option key={t.id} value={t.name}>{t.name}</option>
                            ))}
                        </select>
                    </div>

                    <div>
                        <label className="text-xs font-semibold text-black">Payment Method *</label>
                        <select name="paymentMethod" value={form.paymentMethod} onChange={handleFormChange} required className="w-full p-2 border rounded text-black bg-white">
                            <option value="card">Card</option>
                            <option value="upi">UPI</option>
                            <option value="bank_transfer">Bank Transfer</option>
                            <option value="cash">Cash</option>
                        </select>
                    </div>

                    <div className="md:col-span-2">
                        <label className="text-xs font-semibold text-black">First Session Duration *</label>
                        <div className="grid grid-cols-2 gap-4">
                            <input type="number" name="sessionHours" value={form.sessionHours || ''} onChange={handleFormChange} required min="0" step="1" className="p-2 border rounded text-black bg-white" placeholder="Hours" />
                            <input 
                              type="number" 
                              name="sessionMinutes" 
                              value={form.sessionMinutes || ''} 
                              onChange={handleFormChange} 
                              min="0" 
                              max="59" 
                              step="1" 
                              className="p-2 border rounded text-black bg-white" 
                              placeholder="Minutes" 
                            />
                        </div>
                        {currentSessionDuration > (form.totalPackageHours || 0) && (
                            <p className="text-xs text-red-600 mt-1">Session duration ({currentSessionDuration} hrs) exceeds total package hours.</p>
                        )}
                    </div>
                    
                    {/* Staff Assignment */}
                    <div>
                        <label className="text-xs font-semibold text-black">Therapist (Primary) *</label>
                        <select name="therapistPrimary" value={form.therapistPrimary} onChange={handleFormChange} required className="w-full p-2 border rounded text-black bg-white">
                            <option value="">— Select Therapist —</option>
                            {outletStaff.map(emp => (
                                <option key={emp.id} value={emp.name}>{emp.name}</option>
                            ))}
                        </select>
                    </div>

                    <div className="flex flex-col gap-1">
                        <label className="text-xs font-semibold text-black">Room Number *</label>
                        <input type="text" name="room" value={form.room} onChange={handleFormChange} required className="w-full p-2 border rounded text-black bg-white" placeholder="Room 1, 2, etc." />
                    </div>

                    {/* Submit Button */}
                    <div className="md:col-span-2 flex justify-end pt-4 border-t border-gray-200">
                        <button
                            type="submit"
                            disabled={isSubmitting || currentSessionDuration > (form.totalPackageHours || 0)}
                            className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-60 flex items-center gap-2"
                        >
                            {isSubmitting ? <Loader2 className="h-5 w-5 animate-spin" /> : <Save className="h-5 w-5" />}
                            Record Package & Start Session
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}