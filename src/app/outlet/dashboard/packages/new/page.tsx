'use client';

import { useState, useEffect, useCallback, FormEvent } from 'react';
import { supabase } from '@/lib/supabase';
import { OUTLETS, Outlet } from '@/lib/outlet';
import { useActivityLog } from '@/hooks/useActivityLog';
import { Loader2, Save, ArrowLeft, Users, Clock } from 'lucide-react';
import { useRouter } from 'next/navigation';

/* ===================== TYPES ===================== */

type Employee = { id: string; name: string; role: string | null; outlet_id?: string; };
type Treatment = { id: string; name: string };

type NewPackageForm = {
  name: string;
  mobile: string;
  treatment: string;
  packageAmount: number; 
  totalPackageHours: number;
  sessionHours: number;    // NEW
  sessionMinutes: number;  // NEW
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

const PACKAGE_VALIDITY_OPTIONS = [
    "1 month", 
    "2 months", 
    ...Array.from({ length: 22 }, (_, i) => `${i + 3} months`)
];

const getToday = () => new Date().toISOString().split('T')[0];

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
    const [allEmployees, setAllEmployees] = useState<Employee[]>([]); 
    const [outletStaff, setOutletStaff] = useState<Employee[]>([]);   
    const [outlet, setOutlet] = useState<Outlet | null>(null);
    const [form, setForm] = useState<NewPackageForm>(DEFAULT_FORM_STATE);

    const [loading, setLoading] = useState(true);
    const [submitError, setSubmitError] = useState<string | null>(null);
    const [isSubmitting, setIsSubmitting] = useState(false);

    const fetchData = useCallback(async (outletId: string) => {
        if (!outletId) return;
        try {
            const [allStaffRes, treatmentRes] = await Promise.all([
                supabase.from('employees')
                    .select('id, name, role, outlet_id')
                    .eq('is_active', true)
                    .order('name', { ascending: true }),
                supabase.from('treatments')
                    .select('id, name')
                    .eq('outlet_id', outletId)
                    .order('name', { ascending: true }),
            ]);
            
            if (allStaffRes.error) throw allStaffRes.error;
            if (treatmentRes.error) throw treatmentRes.error;

            const fullStaffList = allStaffRes.data as Employee[];
            setAllEmployees(fullStaffList);
            setOutletStaff(fullStaffList.filter(emp => emp.outlet_id === outletId));
            setTreatments((treatmentRes.data || []) as Treatment[]);
            setLoading(false);
        } catch (err) {
            console.error('Error fetching data:', err);
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        async function getOutletData() {
            try {
                const res = await fetch('/api/outlet');
                const data = await res.json();
                if (data.outletId) {
                    setOutlet(OUTLETS.find(o => o.id === data.outletId) || null);
                    fetchData(data.outletId);
                } else {
                    router.push('/outlet-login');
                }
            } catch (err) {
                router.push('/outlet-login'); 
            }
        }
        getOutletData();
    }, [fetchData, router]);

    const handleFormChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        const { name, value, type } = e.target;
        setSubmitError(null);
        setForm(prev => ({
            ...prev,
            [name]: type === 'number' ? (value === '' ? 0 : Number(value)) : value
        }));
    };

    const currentSessionDuration = getSessionDurationHours(form.sessionHours, form.sessionMinutes);
    
    const handleSubmit = async (e: FormEvent) => {
        e.preventDefault();
        setSubmitError(null);
        setIsSubmitting(true);
        
        if (currentSessionDuration <= 0) {
            setSubmitError('Please set a valid duration for the first session.');
            setIsSubmitting(false);
            return;
        }

        if (currentSessionDuration > form.totalPackageHours) {
            setSubmitError('First session duration cannot exceed total package hours.');
            setIsSubmitting(false);
            return;
        }

        try {
            const amountInPaise = Math.round(form.packageAmount * 100);
            const res = await fetch('/api/client-form-submit', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    ...form,
                    date: getToday(),
                    packageAmount: amountInPaise,
                    sessionHours: currentSessionDuration,
                    outlet: outlet?.name,
                    outlet_id: outlet?.id,
                    finalAmountInPaise: amountInPaise,
                    check_in_time: new Date().toISOString(),
                    tookPackage: true,
                    isPackageCustomer: false,
                }),
            });

            if (!res.ok) throw new Error('Submission failed');
            alert(`Success! Sale recorded.`);
            router.push('/outlet/dashboard/sales');
        } catch (err: any) {
            setSubmitError(err.message);
        } finally {
            setIsSubmitting(false);
        }
    };

    if (loading) return <div className="p-20 text-center"><Loader2 className="animate-spin mx-auto text-blue-600" /></div>;

    return (
        <div className="max-w-4xl mx-auto p-4 md:p-6">
            <div className="bg-white rounded-3xl shadow-2xl overflow-hidden border border-gray-100">
                <div className="bg-blue-700 p-6 flex justify-between items-center text-white">
                    <h1 className="text-2xl font-bold">Record Package Sale & Session</h1>
                    <button onClick={() => router.push('/outlet/dashboard/sales')} className="bg-white/20 p-2 rounded-full hover:bg-white/30"><ArrowLeft size={20} /></button>
                </div>

                <form onSubmit={handleSubmit} className="p-6 md:p-10 space-y-10">
                    {submitError && <div className="p-4 bg-red-50 text-red-600 rounded-xl text-sm border-l-4 border-red-500 font-medium">{submitError}</div>}

                    {/* Section 1: Client */}
                    <section className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="md:col-span-2 flex items-center gap-2 text-blue-900 font-black tracking-tight text-lg border-b pb-3">
                           <Users size={22} /> 1. CUSTOMER INFO
                        </div>
                        <div className="space-y-1">
                            <label className="text-xs font-bold text-gray-400 uppercase">Customer Name</label>
                            <input type="text" name="name" value={form.name} onChange={handleFormChange} required className="w-full p-4 bg-gray-50 border rounded-2xl focus:ring-2 focus:ring-blue-500 outline-none transition" placeholder="John Doe" />
                        </div>
                        <div className="space-y-1">
                            <label className="text-xs font-bold text-gray-400 uppercase">Mobile Number</label>
                            <input type="tel" name="mobile" value={form.mobile} onChange={handleFormChange} required maxLength={10} className="w-full p-4 bg-gray-50 border rounded-2xl focus:ring-2 focus:ring-blue-500 outline-none transition" placeholder="9876543210" />
                        </div>
                    </section>

                    {/* Section 2: Sale Info */}
                    <section className="grid grid-cols-1 md:grid-cols-3 gap-6">
                        <div className="md:col-span-3 flex items-center gap-2 text-blue-900 font-black tracking-tight text-lg border-b pb-3">
                           2. BILLING & VALIDITY
                        </div>
                        <div className="md:col-span-1 space-y-1">
                            <label className="text-xs font-bold text-gray-400 uppercase">Sold By</label>
                            <select name="sold_by" value={form.sold_by} onChange={handleFormChange} required className="w-full p-4 bg-blue-50 border-blue-100 border rounded-2xl focus:ring-2 focus:ring-blue-500 outline-none font-medium">
                                <option value="">Select Staff</option>
                                {allEmployees.map(emp => (
                                    <option key={emp.id} value={emp.id}>{emp.name} ({OUTLETS.find(o => o.id === emp.outlet_id)?.name || 'Admin'})</option>
                                ))}
                            </select>
                        </div>
                        <div className="space-y-1">
                            <label className="text-xs font-bold text-gray-400 uppercase">Amount (₹)</label>
                            <input type="number" name="packageAmount" value={form.packageAmount || ''} onChange={handleFormChange} required className="w-full p-4 bg-gray-50 border rounded-2xl focus:ring-2 focus:ring-blue-500 outline-none transition" />
                        </div>
                        <div className="space-y-1">
                            <label className="text-xs font-bold text-gray-400 uppercase">Package Validity</label>
                            <select name="packageValidity" value={form.packageValidity} onChange={handleFormChange} required className="w-full p-4 bg-gray-50 border rounded-2xl focus:ring-2 focus:ring-blue-500 outline-none">
                                {PACKAGE_VALIDITY_OPTIONS.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                            </select>
                        </div>
                        <div className="space-y-1">
                            <label className="text-xs font-bold text-gray-400 uppercase">Total Package Hours</label>
                            <input type="number" name="totalPackageHours" value={form.totalPackageHours || ''} onChange={handleFormChange} required step="0.5" className="w-full p-4 bg-gray-50 border rounded-2xl focus:ring-2 focus:ring-blue-500 outline-none transition" placeholder="e.g. 10.0" />
                        </div>
                        <div className="space-y-1">
                            <label className="text-xs font-bold text-gray-400 uppercase">Payment Method</label>
                            <select name="paymentMethod" value={form.paymentMethod} onChange={handleFormChange} required className="w-full p-4 bg-gray-50 border rounded-2xl focus:ring-2 focus:ring-blue-500 outline-none transition">
                                <option value="cash">Cash</option>
                                <option value="upi">UPI</option>
                                <option value="card">Card</option>
                                <option value="bank_transfer">Bank Transfer</option>
                            </select>
                        </div>
                    </section>

                    {/* Section 3: The First Session */}
                    <section className="grid grid-cols-1 md:grid-cols-2 gap-6 bg-slate-50 p-8 rounded-3xl border border-slate-100">
                        <div className="md:col-span-2 flex items-center gap-2 text-blue-900 font-black tracking-tight text-lg border-b pb-3 border-slate-200">
                           3. IMMEDIATE FIRST SESSION
                        </div>
                        <div className="space-y-1">
                            <label className="text-xs font-bold text-gray-400 uppercase">Treatment Type</label>
                            <select name="treatment" value={form.treatment} onChange={handleFormChange} required className="w-full p-4 bg-white border rounded-2xl focus:ring-2 focus:ring-blue-500 outline-none">
                                <option value="">Select Treatment</option>
                                {treatments.map(t => <option key={t.id} value={t.name}>{t.name}</option>)}
                            </select>
                        </div>
                        <div className="space-y-1">
                            <label className="text-xs font-bold text-gray-400 uppercase text-blue-600">Session Duration (Hrs & Mins)</label>
                            <div className="flex gap-2">
                                <input type="number" name="sessionHours" value={form.sessionHours || ''} onChange={handleFormChange} required min="0" placeholder="Hrs" className="w-1/2 p-4 bg-white border rounded-2xl focus:ring-2 focus:ring-blue-500 outline-none transition" />
                                <input type="number" name="sessionMinutes" value={form.sessionMinutes || ''} onChange={handleFormChange} min="0" max="59" placeholder="Mins" className="w-1/2 p-4 bg-white border rounded-2xl focus:ring-2 focus:ring-blue-500 outline-none transition" />
                            </div>
                        </div>
                        <div className="space-y-1">
                            <label className="text-xs font-bold text-gray-400 uppercase">Local Therapist</label>
                            <select name="therapistPrimary" value={form.therapistPrimary} onChange={handleFormChange} required className="w-full p-4 bg-white border rounded-2xl focus:ring-2 focus:ring-blue-500 outline-none">
                                <option value="">Select Staff</option>
                                {outletStaff.map(emp => <option key={emp.id} value={emp.name}>{emp.name}</option>)}
                            </select>
                        </div>
                        <div className="space-y-1">
                            <label className="text-xs font-bold text-gray-400 uppercase">Room Number</label>
                            <input type="text" name="room" value={form.room} onChange={handleFormChange} required className="w-full p-4 bg-white border rounded-2xl focus:ring-2 focus:ring-blue-500 outline-none transition" placeholder="Room 1" />
                        </div>
                    </section>

                    <div className="flex flex-col items-center gap-4">
                        <button
                            type="submit"
                            disabled={isSubmitting || currentSessionDuration > (form.totalPackageHours || 0)}
                            className="w-full md:w-auto px-16 py-5 bg-blue-600 text-white rounded-2xl font-black text-lg hover:bg-blue-700 disabled:opacity-50 shadow-2xl shadow-blue-200 flex items-center gap-3 transition-all hover:scale-[1.02]"
                        >
                            {isSubmitting ? <Loader2 className="animate-spin" /> : <Save size={24} />}
                            FINALIZE SALE & START SESSION
                        </button>
                        <p className="text-gray-400 text-xs font-bold">This will create a customer record, a sales entry, and start the timer for the session.</p>
                    </div>
                </form>
            </div>
        </div>
    );
}