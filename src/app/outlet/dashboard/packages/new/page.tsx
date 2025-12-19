'use client';

import { useState, useEffect, useCallback, FormEvent } from 'react';
import { supabase } from '@/lib/supabase';
import { OUTLETS, Outlet } from '@/lib/outlet';
import { useActivityLog } from '@/hooks/useActivityLog';
import { Loader2, Save, ArrowLeft, Users } from 'lucide-react';
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
    const [allEmployees, setAllEmployees] = useState<Employee[]>([]); // All staff for "Sold By"
    const [outletStaff, setOutletStaff] = useState<Employee[]>([]);   // Local staff for "Therapist"
    const [outlet, setOutlet] = useState<Outlet | null>(null);
    const [form, setForm] = useState<NewPackageForm>(DEFAULT_FORM_STATE);

    const [loading, setLoading] = useState(true);
    const [submitError, setSubmitError] = useState<string | null>(null);
    const [isSubmitting, setIsSubmitting] = useState(false);

    /* ============ DATA FETCHING ============ */

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

            // Filter local staff for the Therapist dropdown
            const localStaff = fullStaffList.filter(emp => emp.outlet_id === outletId);
            setOutletStaff(localStaff);

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

    /* ============ HANDLERS ============ */

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
        
        if (!outlet) { setSubmitError('Outlet session missing.'); setIsSubmitting(false); return; }

        try {
            const amountInPaise = Math.round(form.packageAmount * 100);
            const seller = allEmployees.find(s => s.id === form.sold_by);

            const packagePayload = {
                ...form,
                date: getToday(),
                packageAmount: amountInPaise,
                sessionHours: currentSessionDuration,
                outlet: outlet.name,
                outlet_id: outlet.id,
                finalAmountInPaise: amountInPaise,
                check_in_time: new Date().toISOString(),
                tookPackage: true,
                isPackageCustomer: false,
            };

            const res = await fetch('/api/client-form-submit', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(packagePayload),
            });

            if (!res.ok) throw new Error('Submission failed');

            logActivity('record_package_sale', `Package sold by ${seller?.name} at ${outlet.name}`);
            alert(`Success! Sale recorded.`);
            router.push('/outlet/dashboard/sales');
        } catch (err: any) {
            setSubmitError(err.message);
        } finally {
            setIsSubmitting(false);
        }
    };

    if (loading) return <div className="p-20 text-center"><Loader2 className="animate-spin mx-auto" /></div>;

    return (
        <div className="max-w-4xl mx-auto p-4">
            <div className="bg-white rounded-2xl shadow-xl overflow-hidden border border-gray-100">
                <div className="bg-slate-900 p-6 flex justify-between items-center text-white">
                    <div>
                        <h1 className="text-2xl font-bold">New Package Sale</h1>
                        <p className="opacity-70 text-sm">{outlet?.name} Outlet</p>
                    </div>
                    <button onClick={() => router.push('/outlet/dashboard/sales')} className="bg-white/10 p-2 rounded-full hover:bg-white/20 transition">
                        <ArrowLeft size={20} />
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="p-6 md:p-8 space-y-8">
                    {submitError && <div className="p-4 bg-red-50 text-red-600 rounded-lg text-sm border-l-4 border-red-500">{submitError}</div>}

                    {/* Section 1: Client */}
                    <section className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="md:col-span-2 flex items-center gap-2 text-slate-800 font-bold border-b pb-2 mb-2">
                           <Users size={18} /> Client Information
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Name</label>
                            <input type="text" name="name" value={form.name} onChange={handleFormChange} required className="w-full p-3 bg-gray-50 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" />
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Mobile</label>
                            <input type="tel" name="mobile" value={form.mobile} onChange={handleFormChange} required className="w-full p-3 bg-gray-50 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" />
                        </div>
                    </section>

                    {/* Section 2: Sale Info */}
                    <section className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div className="md:col-span-3 flex items-center gap-2 text-slate-800 font-bold border-b pb-2 mb-2">
                           Sale Details
                        </div>
                        <div className="md:col-span-1">
                            <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Sold By (All Staff)</label>
                            <select name="sold_by" value={form.sold_by} onChange={handleFormChange} required className="w-full p-3 bg-blue-50 border-blue-200 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none">
                                <option value="">Select Staff</option>
                                {allEmployees.map(emp => (
                                    <option key={emp.id} value={emp.id}>{emp.name} ({OUTLETS.find(o => o.id === emp.outlet_id)?.name || 'Admin'})</option>
                                ))}
                            </select>
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Amount (₹)</label>
                            <input type="number" name="packageAmount" value={form.packageAmount || ''} onChange={handleFormChange} required className="w-full p-3 bg-gray-50 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" />
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Validity</label>
                            <select name="packageValidity" value={form.packageValidity} onChange={handleFormChange} required className="w-full p-3 bg-gray-50 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none">
                                {PACKAGE_VALIDITY_OPTIONS.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                            </select>
                        </div>
                    </section>

                    {/* Section 3: The First Session */}
                    <section className="grid grid-cols-1 md:grid-cols-2 gap-4 bg-gray-50 p-6 rounded-xl border border-gray-100">
                        <div className="md:col-span-2 flex items-center gap-2 text-slate-800 font-bold border-b pb-2 mb-2">
                           Immediate First Session
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Treatment</label>
                            <select name="treatment" value={form.treatment} onChange={handleFormChange} required className="w-full p-3 bg-white border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none">
                                <option value="">Select Treatment</option>
                                {treatments.map(t => <option key={t.id} value={t.name}>{t.name}</option>)}
                            </select>
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Local Therapist</label>
                            <select name="therapistPrimary" value={form.therapistPrimary} onChange={handleFormChange} required className="w-full p-3 bg-white border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none">
                                <option value="">Select Local Staff</option>
                                {outletStaff.map(emp => <option key={emp.id} value={emp.name}>{emp.name}</option>)}
                            </select>
                        </div>
                        <div className="md:col-span-2">
                            <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Total Package Hours</label>
                            <input type="number" name="totalPackageHours" value={form.totalPackageHours || ''} onChange={handleFormChange} required className="w-full p-3 bg-white border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" placeholder="e.g. 10" />
                        </div>
                    </section>

                    <div className="flex justify-center">
                        <button
                            type="submit"
                            disabled={isSubmitting}
                            className="w-full md:w-auto px-12 py-4 bg-blue-600 text-white rounded-xl font-bold hover:bg-blue-700 disabled:opacity-50 shadow-lg flex items-center gap-2 transition"
                        >
                            {isSubmitting ? <Loader2 className="animate-spin" /> : <Save size={20} />}
                            Complete Package Sale
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}