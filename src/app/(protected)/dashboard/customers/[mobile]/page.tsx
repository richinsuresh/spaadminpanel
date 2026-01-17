'use client';

import { useEffect, useState, FormEvent, use, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Loader2, Edit } from 'lucide-react';
import { OUTLETS } from '@/lib/outlet';
import { useActivityLog } from '@/hooks/useActivityLog';
import Link from 'next/link';

// --- Types ---
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
  outlet_id: string;
  outlet_name: string;
  payment_method: string | null;
  is_package_customer: boolean;
  in_time: string | null;
  out_time: string | null;
};

type Employee = { id: string; name: string };
type Treatment = { id: string; name: string };

// --- Helpers ---
const toInputDate = (d: string | null): string => d ? new Date(d).toISOString().split('T')[0] : '';
const toInputTime = (d: string | null) => {
  if (!d) return '';
  const date = new Date(d);
  if (isNaN(date.getTime())) return '';
  return date.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
};

const calculateOutTime = (startTime: string, h: string | number, m: string | number) => {
  if (!startTime) return '';
  const [hours, minutes] = startTime.split(':').map(Number);
  if (isNaN(hours) || isNaN(minutes)) return '';
  const date = new Date();
  date.setHours(hours);
  date.setMinutes(minutes);
  const addH = Number(h) || 0;
  const addM = Number(m) || 0;
  date.setHours(date.getHours() + addH);
  date.setMinutes(date.getMinutes() + addM);
  return date.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
};

const decimalToTime = (decimal: number) => {
  const safeDecimal = Number(decimal) || 0;
  const hrs = Math.floor(safeDecimal);
  const mins = Math.round((safeDecimal - hrs) * 60);
  return { hrs, mins };
};

export default function CustomerHistoryPage(props: { params: Promise<{ mobile: string }> }) {
  const params = use(props.params);
  const router = useRouter();
  const { logActivity } = useActivityLog();
  
  const [sales, setSales] = useState<Sale[]>([]);
  const [loading, setLoading] = useState(true);
  const [customerName, setCustomerName] = useState('');
  
  // Dropdown Data
  const [therapists, setTherapists] = useState<Employee[]>([]);
  const [treatments, setTreatments] = useState<Treatment[]>([]);

  // Edit State
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editingSale, setEditingSale] = useState<Sale | null>(null);
  const [editForm, setEditForm] = useState<any>({});
  const [editPassword, setEditPassword] = useState('');
  const [editRemark, setEditRemark] = useState('');
  const [saveError, setSaveError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    fetchTherapists();
    fetchHistory();
  }, []);

  // Fetch treatments whenever the outlet in the edit form changes
  useEffect(() => {
    if (isEditModalOpen && editForm.outlet_id) {
        fetchTreatments(editForm.outlet_id);
    }
  }, [isEditModalOpen, editForm.outlet_id]);

  const fetchTherapists = async () => {
    const { data } = await supabase.from('employees').select('id, name').eq('is_active', true).order('name');
    setTherapists((data as Employee[]) || []);
  };

  const fetchTreatments = async (outletId: string) => {
    try {
        const { data } = await supabase
            .from('treatments')
            .select('id, name')
            .eq('outlet_id', outletId)
            .order('name');
        setTreatments((data as Treatment[]) || []);
    } catch (e) {
        console.error("Error fetching treatments", e);
    }
  };

  const fetchHistory = async () => {
    setLoading(true);
    const { data } = await supabase
      .from('customers')
      .select('*')
      .eq('mobile', params.mobile)
      .order('date', { ascending: false });

    if (data && data.length > 0) {
      setSales(data as Sale[]);
      setCustomerName(data[0].name);
    } else {
      setSales([]);
    }
    setLoading(false);
  };

  const handleOpenEdit = (sale: Sale) => {
    setEditingSale(sale);
    const tParts = (sale.therapist_name || '').split(' & ');
    const { hrs, mins } = decimalToTime(sale.session_hours || 0);

    setEditForm({
      name: sale.name || '',
      mobile: sale.mobile || '',
      date: toInputDate(sale.date),
      outlet_id: sale.outlet_id || '',
      treatment: sale.treatment || '',
      payment_method: sale.payment_method || 'cash',
      amount: (sale.took_package ? sale.package_amount : sale.amount_paid) / 100,
      therapist_name1: tParts[0] || '',
      therapist_name2: tParts[1] || '',
      room: sale.room || '',
      session_hours_h: hrs,
      session_hours_m: mins,
      check_in_time: toInputTime(sale.check_in_time),
      check_out_time: toInputTime(sale.check_out_time),
    });
    setEditRemark('');
    setEditPassword('');
    setSaveError(null);
    setIsEditModalOpen(true);
  };

  const handleEditFormChange = (e: any) => {
    const { name, value } = e.target;
    setEditForm((p: any) => ({ ...p, [name]: value }));
  };

  const handleDurationChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setEditForm((prev: any) => {
      const updated = { ...prev, [name]: value };
      if (updated.check_in_time && prev.check_out_time) {
         updated.check_out_time = calculateOutTime(updated.check_in_time, updated.session_hours_h, updated.session_hours_m);
      }
      return updated;
    });
  };

  const handleSaveEdit = async (e: FormEvent) => {
    e.preventDefault();
    setSaveError(null);

    if (editPassword !== 'admin123') {
      setSaveError('Wrong password');
      return;
    }
    if (!editRemark.trim()) {
      setSaveError('Remark required');
      return;
    }
    if (!editingSale) return;

    setIsSaving(true);

    const totalHours = (Number(editForm.session_hours_h) || 0) + (Number(editForm.session_hours_m) || 0) / 60;
    const amountNumber = Number(editForm.amount || 0);

    let newCheckInTime: string | null = editingSale.check_in_time;
    if (editForm.date && editForm.check_in_time) {
      const combined = new Date(`${editForm.date}T${editForm.check_in_time}`);
      if (!isNaN(combined.getTime())) newCheckInTime = combined.toISOString();
    }

    let newCheckOutTime: string | null = editingSale.check_out_time;
    if (editForm.check_out_time && editForm.date) {
        const combinedOut = new Date(`${editForm.date}T${editForm.check_out_time}`);
        if (!isNaN(combinedOut.getTime())) newCheckOutTime = combinedOut.toISOString();
    }

    const t1 = editForm.therapist_name1;
    const t2 = editForm.therapist_name2;
    const combinedTherapist = t1 ? (t2 ? `${t1} & ${t2}` : t1) : null;

    // Get Outlet Name for consistency
    const selectedOutlet = OUTLETS.find(o => o.id === editForm.outlet_id);
    const outletName = selectedOutlet ? selectedOutlet.name : editingSale.outlet_name;

    const updates = {
      name: editForm.name,
      mobile: editForm.mobile,
      treatment: editForm.treatment,
      therapist_name: combinedTherapist,
      room: editForm.room || null,
      session_hours: totalHours,
      payment_method: editForm.payment_method,
      amount_paid: editingSale.took_package ? 0 : Math.round(amountNumber * 100),
      package_amount: editingSale.took_package ? Math.round(amountNumber * 100) : editingSale.package_amount,
      date: editForm.date,
      outlet_id: editForm.outlet_id,
      outlet_name: outletName,
      check_in_time: newCheckInTime,
      check_out_time: newCheckOutTime,
    };

    const { error } = await supabase.from('customers').update(updates).eq('id', editingSale.id);

    if (error) {
      setSaveError(error.message);
      setIsSaving(false);
      return;
    }

    await logActivity('edit_sale_history', JSON.stringify({ remark: editRemark, sale_id: editingSale.id }));
    
    setIsEditModalOpen(false);
    setEditingSale(null);
    fetchHistory();
    setIsSaving(false);
  };

  if (loading) return <div className="p-8 text-center text-gray-500">Loading history...</div>;

  return (
    <div className="max-w-6xl mx-auto p-4 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4 mb-6">
        <Link href="/dashboard/sales" className="p-2 bg-gray-100 rounded-full hover:bg-gray-200">
          <ArrowLeft size={20} className="text-gray-700" />
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-gray-800">{customerName || 'Client'} History</h1>
          <p className="text-gray-500">{params.mobile}</p>
        </div>
      </div>

      {/* History Table */}
      <div className="bg-white shadow rounded-lg overflow-hidden border border-gray-200">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-bold text-gray-500 uppercase">Date</th>
              <th className="px-4 py-3 text-left text-xs font-bold text-gray-500 uppercase">Service</th>
              <th className="px-4 py-3 text-left text-xs font-bold text-gray-500 uppercase">Outlet</th>
              <th className="px-4 py-3 text-left text-xs font-bold text-gray-500 uppercase">Therapist</th>
              <th className="px-4 py-3 text-left text-xs font-bold text-gray-500 uppercase">Amount</th>
              <th className="px-4 py-3 text-left text-xs font-bold text-gray-500 uppercase">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {sales.map((sale) => (
              <tr key={sale.id} className="hover:bg-gray-50">
                <td className="px-4 py-3 text-sm text-gray-900">{new Date(sale.date).toLocaleDateString()}</td>
                <td className="px-4 py-3 text-sm text-gray-900">
                  <div className="font-medium">{sale.treatment}</div>
                  {sale.took_package && <span className="text-xs bg-purple-100 text-purple-700 px-2 py-0.5 rounded">Package Purchase</span>}
                  {sale.is_package_customer && <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded">Redemption</span>}
                </td>
                <td className="px-4 py-3 text-sm text-gray-600">{sale.outlet_name}</td>
                <td className="px-4 py-3 text-sm text-gray-600">{sale.therapist_name || '-'}</td>
                <td className="px-4 py-3 text-sm font-bold text-gray-900">
                  ₹{((sale.took_package ? sale.package_amount : sale.amount_paid) / 100).toLocaleString()}
                </td>
                <td className="px-4 py-3 text-sm">
                  <button 
                    onClick={() => handleOpenEdit(sale)}
                    className="flex items-center gap-1 text-blue-600 hover:text-blue-800 bg-blue-50 px-3 py-1.5 rounded-md text-xs font-medium transition"
                  >
                    <Edit size={14} /> Edit
                  </button>
                </td>
              </tr>
            ))}
            {sales.length === 0 && (
                <tr>
                    <td colSpan={6} className="p-8 text-center text-gray-400">No history found for this number.</td>
                </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* EDIT MODAL */}
      {isEditModalOpen && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50 backdrop-blur-sm">
          <form onSubmit={handleSaveEdit} className="bg-white text-black rounded-xl w-full max-w-lg p-6 shadow-2xl border border-gray-200 max-h-[90vh] overflow-y-auto">
            <h2 className="text-xl font-bold border-b pb-2 text-black mb-4">Edit Past Record</h2>
            
            {saveError && <div className="p-3 mb-4 bg-red-50 text-red-700 border border-red-200 rounded-lg text-sm">{saveError}</div>}

            {/* Outlet & Date */}
            <div className="grid grid-cols-2 gap-4 mb-4">
                <div>
                    <label className="text-xs font-bold text-gray-500 uppercase">Date</label>
                    <input type="date" name="date" value={editForm.date} onChange={handleEditFormChange} className="w-full p-2 border rounded text-black bg-white" required />
                </div>
                <div>
                     <label className="text-xs font-bold text-gray-500 uppercase">Outlet</label>
                     <select name="outlet_id" value={editForm.outlet_id} onChange={handleEditFormChange} className="w-full p-2 border rounded bg-white text-black">
                        {OUTLETS.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
                     </select>
                </div>
            </div>

            {/* Treatment & Amount */}
            <div className="grid grid-cols-2 gap-4 mb-4">
              <div>
                <label className="text-xs font-bold text-gray-500 uppercase">Treatment</label>
                <select 
                    name="treatment" 
                    value={editForm.treatment} 
                    onChange={handleEditFormChange} 
                    className="w-full p-2 border rounded text-black bg-white focus:ring-2 focus:ring-blue-500" 
                    required
                >
                    <option value="">Select Service</option>
                    {treatments.map(t => (
                        <option key={t.id} value={t.name}>{t.name}</option>
                    ))}
                    {/* Fallback option if current treatment isn't in list */}
                    {!treatments.find(t => t.name === editForm.treatment) && editForm.treatment && (
                        <option value={editForm.treatment}>{editForm.treatment}</option>
                    )}
                </select>
              </div>
              <div>
                <label className="text-xs font-bold text-gray-500 uppercase">Amount (₹)</label>
                <input type="number" name="amount" value={editForm.amount} onChange={handleEditFormChange} className="w-full p-2 border rounded text-black bg-white focus:ring-2 focus:ring-blue-500" required />
              </div>
            </div>

            {/* Payment Method & Therapist 1 */}
            <div className="grid grid-cols-2 gap-4 mb-4">
                <div>
                     <label className="text-xs font-bold text-gray-500 uppercase">Payment Method</label>
                     <select 
                        name="payment_method" 
                        value={editForm.payment_method} 
                        onChange={handleEditFormChange} 
                        className="w-full p-2 border rounded bg-white text-black"
                     >
                        <option value="cash">Cash</option>
                        <option value="card">Card</option>
                        <option value="upi">UPI</option>
                        <option value="package">Package Redemption</option>
                        <option value="bank_transfer">Bank Transfer</option>
                     </select>
                </div>
                <div>
                    <label className="text-xs font-bold text-gray-500 uppercase">Therapist 1</label>
                    <select name="therapist_name1" value={editForm.therapist_name1} onChange={handleEditFormChange} className="w-full p-2 border rounded bg-white text-black">
                        <option value="">Select...</option>
                        {therapists.map(t => <option key={t.id} value={t.name}>{t.name}</option>)}
                    </select>
                </div>
            </div>

            {/* Therapist 2 & Duration */}
            <div className="grid grid-cols-2 gap-4 mb-4">
                 <div>
                    <label className="text-xs font-bold text-gray-500 uppercase">Therapist 2 (Optional)</label>
                    <select name="therapist_name2" value={editForm.therapist_name2} onChange={handleEditFormChange} className="w-full p-2 border rounded bg-white text-black">
                        <option value="">None</option>
                        {therapists.map(t => <option key={`t2-${t.id}`} value={t.name}>{t.name}</option>)}
                    </select>
                </div>
                <div>
                     <label className="text-xs font-bold text-gray-500 uppercase">Duration</label>
                     <div className="flex gap-1">
                        <input type="number" name="session_hours_h" placeholder="Hr" value={editForm.session_hours_h} onChange={handleDurationChange} className="w-full p-2 border rounded text-black bg-white" />
                        <input type="number" name="session_hours_m" placeholder="Min" value={editForm.session_hours_m} onChange={handleDurationChange} className="w-full p-2 border rounded text-black bg-white" />
                     </div>
                </div>
            </div>

            <div className="mb-4">
              <label className="text-xs font-bold text-gray-500 uppercase">Edit Reason (Required)</label>
              <textarea value={editRemark} onChange={(e) => setEditRemark(e.target.value)} className="w-full p-2 border rounded bg-white text-black" rows={2} required />
            </div>

            <div className="mb-6">
              <label className="text-xs font-bold text-gray-500 uppercase">Admin Password</label>
              <input type="password" value={editPassword} onChange={(e) => setEditPassword(e.target.value)} className="w-full p-2 border rounded text-black bg-white" placeholder="admin123" required />
            </div>

            <div className="flex justify-end gap-3 pt-2 border-t">
              <button type="button" onClick={() => setIsEditModalOpen(false)} className="px-4 py-2 bg-gray-100 rounded hover:bg-gray-200 text-gray-700 font-medium">Cancel</button>
              <button type="submit" disabled={isSaving} className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 font-medium flex items-center gap-2">
                {isSaving && <Loader2 size={16} className="animate-spin" />} Save Changes
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}