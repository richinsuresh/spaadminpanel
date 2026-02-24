'use client'; 

import React, { useCallback, useEffect, useState, use } from 'react';
import { supabase } from '@/lib/supabase';
import { OUTLETS } from '@/lib/outlet';
import { 
    Loader2, AlertTriangle, X, Clock, Calendar, 
    CornerDownRight, History, PackageCheck, PackageMinus, Activity,
    Edit, Trash // <-- Fixed: Added the missing icons back here
} from 'lucide-react';
import { useRouter } from 'next/navigation'; 
import { useActivityLog } from '@/hooks/useActivityLog';

/* ---------------- types ---------------- */
type GroupCustomer = {
  name?: string;
  treatment?: string;
  therapist_name?: string;
  sessionHours?: number;
  session_hours?: number;
};

type HistoryRow = {
  id: string; date: string | null; name: string | null; mobile: string | null; treatment: string | null;
  session_hours: number | null; amount_paid: number | null; took_package: boolean | null;
  package_amount: number | null; check_in_time: string | null; check_out_time: string | null;
  therapist_name: string | null; 
  outlet_name: string | null; outlet_id: string | null; 
  status?: string | null; package_status?: string | null; 
  used_hours?: number | null; remaining_hours?: number | null; expiry_date?: string | null;
  start_date?: string | null; package_name?: string | null; is_package_customer?: boolean | null;
  group_customers?: GroupCustomer[] | null;
  _raw?: any; _raw_pkg?: any; [k: string]: any; eventType: 'visit' | 'package_purchase' | 'audit_log'; 
  user_name?: string | null; related_table?: string | null;
  audit_details?: { before?: any; after?: any; remark?: string };
};

type ClientSummary = {
  mobile: string; name: string; latestVisitDate: string | null;
  latestPackageName: string; remaining_hours: number | null; used_hours: number | null; 
  total_hours: number | null; expiry_date: string | null; package_status: string | null;
  history: HistoryRow[]; profileData?: any; 
};

type Employee = { id: string; name: string };
type Treatment = { id: string; name: string; outlet_id?: string };

/* ---------------- format helpers ---------------- */
const fmtDate = (iso: string | null) => {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return 'Invalid';
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
};

const fmtTime = (iso: string | null) => {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true }).toUpperCase();
};

const fmtDuration = (h: number | null | undefined) => {
  if (h === null || h === undefined) return '—';
  const n = Number(h);
  if (!Number.isFinite(n) || n === 0) return '—';
  const m = Math.round(n * 60);
  if (m < 60) return `${m} mins`;
  const hrs = Math.floor(m / 60);
  const mins = m - hrs * 60;
  return mins === 0 ? `${hrs} Hrs` : `${hrs} Hr ${mins} Min`;
};

const formatCurrency = (v: number | null) => {
    if (v === null || v === undefined) return '—';
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      minimumFractionDigits: 0,
    }).format(v / 100);
};

const decimalToTime = (decimal: number) => {
  const safeDecimal = Number(decimal) || 0;
  const hrs = Math.floor(safeDecimal);
  const mins = Math.round((safeDecimal - hrs) * 60);
  return { hrs, mins };
};

const toNum = (v: any) => (v === undefined || v === null || v === '' ? null : (Number.isFinite(Number(v)) ? Number(v) : null));

const pickBestPackage = (pkgs: any[]) => {
  if (!pkgs || pkgs.length === 0) return null;
  const active = pkgs.find((p) => String((p.status ?? '')).toLowerCase() === 'active');
  if (active) return active;
  const sorted = pkgs.slice().sort((a, b) => {
    const ta = a.expiry_date ? new Date(a.expiry_date).getTime() : a.created_at ? new Date(a.created_at).getTime() : 0;
    const tb = b.expiry_date ? new Date(b.expiry_date).getTime() : b.created_at ? new Date(b.created_at).getTime() : 0;
    return tb - ta;
  });
  return sorted[0] ?? pkgs[0];
};

const normalizeCustomerRow = (r: any): HistoryRow => {
  const maybeStr = (v: any) => (v === undefined || v === null ? null : String(v));
  return {
    id: String(r.id ?? r._id ?? ''), date: maybeStr(r.date ?? r.visit_date ?? r.created_at ?? null),
    name: maybeStr(r.name ?? r.customer_name ?? null), mobile: maybeStr(r.mobile ?? r.phone ?? r.customer_mobile ?? null),
    treatment: maybeStr(r.treatment ?? r.service ?? null), session_hours: toNum(r.session_hours ?? r.sessionHours ?? null),
    amount_paid: toNum(r.amount_paid ?? r.amountPaid ?? null), took_package: !!(r.took_package ?? r.tookPackage ?? r.tookPackage),
    package_amount: toNum(r.package_amount ?? r.packageAmount ?? null), check_in_time: maybeStr(r.check_in_time ?? r.checkInTime ?? r.check_in ?? null),
    check_out_time: maybeStr(r.check_out_time ?? r.checkOutTime ?? r.check_out ?? null), therapist_name: maybeStr(r.therapist_name ?? r.therapist ?? null),
    outlet_name: maybeStr(r.outlet_name ?? r.outlet ?? null), outlet_id: maybeStr(r.outlet_id ?? null),
    is_package_customer: !!(r.is_package_customer ?? r.isPackageCustomer ?? r.package_redeemed ?? false),
    status: maybeStr(r.status ?? null), 
    group_customers: Array.isArray(r.group_customers) ? r.group_customers : null,
    _raw: r, eventType: 'visit',
  };
};

/* ---------------- Main Component ---------------- */
export default function ClientDetailPage({ params }: { params: Promise<{ mobile: string }> }) {
  
  const router = useRouter();
  const unwrappedParams = use(params);
  const mobile = unwrappedParams.mobile;
  const { logActivity } = useActivityLog();
  
  const [summary, setSummary] = useState<ClientSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [warning, setWarning] = useState<string | null>(null);
  
  // Data for Dropdowns
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [treatments, setTreatments] = useState<Treatment[]>([]);

  // Edit Profile State
  const [isEditProfileOpen, setIsEditProfileOpen] = useState(false);
  const [editName, setEditName] = useState('');
  const [editMobile, setEditMobile] = useState('');
  const [editPassword, setEditPassword] = useState('');
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const [saveError, setSaveError] = useState('');

  // INDIVIDUAL HISTORY EDIT STATE
  const [isHistoryEditOpen, setIsHistoryEditOpen] = useState(false);
  const [historyEditItem, setHistoryEditItem] = useState<HistoryRow | null>(null);
  const [historyForm, setHistoryForm] = useState({
      date: '', treatment: '', amount: '', therapist: '', hours_h: '', hours_m: '', outlet_id: '', check_in_time: ''
  });
  const [historyEditPassword, setHistoryEditPassword] = useState('');
  const [isSavingHistory, setIsSavingHistory] = useState(false);

  // HISTORY DELETE STATE
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [deleteItem, setDeleteItem] = useState<HistoryRow | null>(null);
  const [deletePassword, setDeletePassword] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);

  const fetchDropdowns = async () => {
      const { data: empData } = await supabase.from('employees').select('id, name').eq('is_active', true).order('name');
      setEmployees((empData as Employee[]) || []);
      const { data: treatData } = await supabase.from('treatments').select('id, name, outlet_id').order('name');
      setTreatments((treatData as Treatment[]) || []);
  };

  const fetchClientData = useCallback(async () => {
    setLoading(true); setWarning(null);

    if (!mobile || !/^\d+$/.test(mobile)) { 
      setWarning('Mobile number is missing or invalid.'); setLoading(false); return;
    }

    try {
      const { data: profileData } = await supabase.from('customers').select('name').eq('mobile', mobile).order('date', { ascending: false }).limit(1).maybeSingle();
      const { data: custData } = await supabase.from('customers').select('*').eq('mobile', mobile).order('date', { ascending: false }).limit(500);
      const visits = Array.isArray(custData) ? custData.map(normalizeCustomerRow) : [];

      let packageMap: Record<string, any> = {};
      let packagePurchases: HistoryRow[] = [];
      const { data: pkgData } = await supabase.from('packages').select(`*`).eq('mobile', mobile);

      if (Array.isArray(pkgData)) { 
        const bestPkg = pickBestPackage(pkgData);
        if (bestPkg) packageMap[mobile] = bestPkg;

        packagePurchases = pkgData.map((p: any) => ({
            id: String(p.id ?? p.package_id ?? p.created_at), date: String(p.created_at ?? p.date ?? null),
            name: String(p.customer_name ?? p.name ?? null), mobile: String(p.mobile ?? null),
            eventType: 'package_purchase' as const, treatment: String(p.package_name ?? p.name ?? 'Package Purchase'),
            session_hours: toNum(p.total_hours ?? p.totalHours ?? p.totalPackageHours ?? null), amount_paid: toNum(p.package_amount ?? p.amount ?? null),
            package_amount: toNum(p.package_amount ?? p.amount ?? null), package_name: String(p.package_name ?? p.name ?? 'Package'),
            therapist_name: String(p.employee_name ?? p.sold_by ?? null), outlet_name: String(p.outlet_name ?? p.outlet ?? null), outlet_id: String(p.outlet_id ?? null),
            status: String(p.status ?? p.package_status ?? null), took_package: true, check_in_time: String(p.created_at ?? null), check_out_time: null, is_package_customer: false, _raw: p,
        }));
      }

      // FETCH AUDIT LOGS (Edit History)
      let auditLogs: HistoryRow[] = [];
      try {
          const { data: logData } = await supabase.from('activity_logs').select('*').ilike('description', `%${mobile}%`).order('created_at', { ascending: false });
          if (Array.isArray(logData)) {
             auditLogs = logData.map(log => {
                let details = { remark: '' };
                try { details = JSON.parse(log.description); } catch (e) {}
                return {
                    id: log.id, date: log.created_at, name: 'System Log', mobile: mobile,
                    eventType: 'audit_log', treatment: `Audit: ${log.action_type.replace(/_/g, ' ').toUpperCase()}`,
                    therapist_name: log.username, outlet_name: 'Admin Panel', outlet_id: null,
                    check_in_time: log.created_at, check_out_time: null, session_hours: null, amount_paid: null, 
                    took_package: false, package_amount: null, audit_details: details, _raw: log
                } as HistoryRow;
             });
          }
      } catch (logErr) { console.warn('Log fetch error', logErr); }
      
      const combinedHistory: HistoryRow[] = [...visits, ...packagePurchases, ...auditLogs].sort((a, b) => {
          const dateA = a.date ? new Date(a.date).getTime() : 0;
          const dateB = b.date ? new Date(b.date).getTime() : 0;
          return dateB - dateA;
      });

      const pkg = packageMap[mobile];
      const totalNum = pkg ? toNum(pkg.total_hours ?? pkg.totalHours ?? pkg.totalPackageHours ?? pkg.total) || 0 : 0;
      const consumedFromVisits = visits.filter(v => v.is_package_customer).reduce((sum, v) => sum + (v.session_hours || 0), 0);
      const dbUsedNum = pkg ? toNum(pkg.used_hours ?? pkg.consumed_hours ?? pkg.usedHours) || 0 : 0;
      const finalUsedNum = Math.max(dbUsedNum, consumedFromVisits);
      
      setSummary({
          mobile: mobile, name: profileData?.name || visits[0]?.name || 'Unknown Client', latestVisitDate: visits[0]?.date || null,
          latestPackageName: pkg ? (pkg.package_name ?? pkg.name ?? 'N/A') : 'None',
          remaining_hours: totalNum > 0 ? Math.max(0, totalNum - finalUsedNum) : null, used_hours: finalUsedNum, total_hours: totalNum,
          expiry_date: pkg?.expiry_date ?? null, package_status: pkg?.status ?? null, history: combinedHistory, profileData: profileData || null,
      });
      setEditName(profileData?.name || visits[0]?.name || ''); setEditMobile(mobile);

    } catch (error: any) {
      setWarning('Failed to load history: ' + error.message);
    } finally { setLoading(false); }
  }, [mobile]);

  useEffect(() => { fetchDropdowns(); fetchClientData(); }, [fetchClientData]);

  // --- HANDLERS ---
  const handleSaveProfile = async () => {
    if (editPassword !== 'admin123') { setSaveError('Incorrect password'); return; }
    if (!editName.trim() || !editMobile.trim()) { setSaveError('Name and Mobile required'); return; }
    setIsSavingProfile(true); setSaveError('');
    try {
        const oldMobile = summary?.mobile;
        await supabase.from('customers').update({ name: editName, mobile: editMobile }).eq('mobile', oldMobile);
        await supabase.from('packages').update({ name: editName, mobile: editMobile }).eq('mobile', oldMobile);
        if (oldMobile !== editMobile) { alert('Updated! Redirecting...'); router.push(`/dashboard/customers/${editMobile}`); } 
        else { setIsEditProfileOpen(false); fetchClientData(); }
    } catch (err: any) { setSaveError('Update failed.'); } finally { setIsSavingProfile(false); }
  };

  const handleOpenHistoryEdit = (item: HistoryRow) => {
      setHistoryEditItem(item);
      const isPkg = item.eventType === 'package_purchase';
      const { hrs, mins } = decimalToTime(item.session_hours || 0);
      let oid = item.outlet_id;
      if (!oid && item.outlet_name) oid = OUTLETS.find(o => o.name === item.outlet_name)?.id || '';
      
      let checkInTimeStr = '';
      if (item.check_in_time) {
          const d = new Date(item.check_in_time);
          if (!isNaN(d.getTime())) {
              checkInTimeStr = d.toTimeString().slice(0,5); // HH:MM
          }
      }

      setHistoryForm({
          date: item.date ? new Date(item.date).toISOString().split('T')[0] : '',
          treatment: isPkg ? (item.package_name || '') : (item.treatment || ''),
          amount: isPkg ? String(item.package_amount ? item.package_amount/100 : 0) : String(item.amount_paid ? item.amount_paid/100 : 0),
          therapist: item.therapist_name || '', hours_h: String(hrs), hours_m: String(mins), outlet_id: oid || '',
          check_in_time: checkInTimeStr
      });
      setHistoryEditPassword(''); setIsHistoryEditOpen(true);
  };

  const handleSaveHistoryEdit = async () => {
      if (historyEditPassword !== 'admin123') { alert('Incorrect Password'); return; }
      if (!historyEditItem) return;
      setIsSavingHistory(true);
      try {
          const isPkg = historyEditItem.eventType === 'package_purchase';
          const table = isPkg ? 'packages' : 'customers';
          const updates: any = {};
          
          if (historyForm.date) { 
              if (isPkg) updates.created_at = historyForm.date; 
              else updates.date = historyForm.date; 
          }

          if (historyForm.date && historyForm.check_in_time) {
              updates.check_in_time = new Date(`${historyForm.date}T${historyForm.check_in_time}`).toISOString();
          }

          if (historyForm.outlet_id) {
              const matchedOutlet = OUTLETS.find(o => o.id === historyForm.outlet_id);
              if (matchedOutlet) { updates.outlet_id = matchedOutlet.id; updates.outlet_name = matchedOutlet.name; if (!isPkg) updates.outlet = matchedOutlet.name; }
          }
          const amt = parseFloat(historyForm.amount) * 100; 
          if (!isNaN(amt)) { if (isPkg) updates.package_amount = amt; else updates.amount_paid = amt; }
          const totalHours = (Number(historyForm.hours_h) || 0) + (Number(historyForm.hours_m) || 0) / 60;
          if (!isNaN(totalHours)) { if (isPkg) updates.total_hours = totalHours; else updates.session_hours = totalHours; }
          if (isPkg) { updates.package_name = historyForm.treatment; updates.sold_by = historyForm.therapist; } else { updates.treatment = historyForm.treatment; updates.therapist_name = historyForm.therapist; }

          await supabase.from(table).update(updates).eq('id', historyEditItem.id);
          
          await logActivity('history_edit_individual', JSON.stringify({
              id: historyEditItem.id,
              type: historyEditItem.eventType,
              remark: 'Edited via Client History Timeline'
          }));

          setIsHistoryEditOpen(false); setHistoryEditItem(null); fetchClientData();
      } catch (err: any) { alert('Update failed.'); } finally { setIsSavingHistory(false); }
  };

  const handleOpenDelete = (item: HistoryRow) => { setDeleteItem(item); setDeletePassword(''); setIsDeleteOpen(true); };
  const handleExecuteDelete = async () => {
    if (deletePassword !== 'admin123') { alert('Incorrect Password'); return; }
    if (!deleteItem) return;
    setIsDeleting(true);
    try {
        const table = deleteItem.eventType === 'package_purchase' ? 'packages' : 'customers';
        await supabase.from(table).delete().eq('id', deleteItem.id);
        setIsDeleteOpen(false); setDeleteItem(null); fetchClientData();
    } catch (err: any) { alert('Delete failed.'); } finally { setIsDeleting(false); }
  };

  // --- RENDER ---
  if (loading) return <div className="p-8 flex flex-col items-center justify-center text-gray-700 text-lg"><Loader2 className="w-8 h-8 animate-spin text-blue-600 mb-3" />Loading Client Data...</div>;
  if (warning || !summary) return <div className="p-8 text-center text-red-600 font-bold text-xl"><AlertTriangle className="w-12 h-12 mx-auto mb-3" />{warning || 'Client not found'}</div>;

  return (
    <div className="max-w-6xl mx-auto p-4 md:p-6 space-y-6 bg-gray-50 min-h-screen">
      
      {/* --- HEADER --- */}
      <div className="bg-white p-5 rounded-xl shadow-sm border border-gray-200 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 capitalize">{summary.name}</h1>
          <p className="text-sm text-gray-600 font-medium mt-1">
            Phone: {summary.mobile}
          </p>
        </div>
        <button 
            onClick={() => setIsEditProfileOpen(true)} 
            className="px-4 py-2 bg-blue-50 text-blue-700 border border-blue-200 hover:bg-blue-600 hover:text-white rounded-lg text-sm font-semibold transition-colors flex items-center gap-2"
        >
            <Edit size={14} /> Edit Client Info
        </button>
      </div>

      {/* --- PACKAGE BANNER --- */}
      {summary.total_hours !== null && summary.total_hours > 0 && (
        <div className="bg-white p-5 rounded-xl shadow-sm border-2 border-indigo-100">
            <h2 className="text-lg font-bold text-indigo-900 mb-4 border-b border-indigo-50 pb-2">
                Active Package Information
            </h2>
            
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                <div className="bg-gray-50 p-3 rounded-lg border border-gray-100">
                    <span className="block text-gray-500 text-xs font-bold uppercase mb-1">Package Name</span>
                    <strong className="text-base text-gray-900">{summary.latestPackageName}</strong>
                </div>
                <div className="bg-gray-50 p-3 rounded-lg border border-gray-100">
                    <span className="block text-gray-500 text-xs font-bold uppercase mb-1">Total Hours</span>
                    <strong className="text-base text-gray-900">{summary.total_hours} Hours</strong>
                </div>
                <div className="bg-gray-50 p-3 rounded-lg border border-gray-100">
                    <span className="block text-gray-500 text-xs font-bold uppercase mb-1">Used Hours</span>
                    <strong className="text-base text-gray-900">{summary.used_hours} Hours</strong>
                </div>
                <div className="bg-indigo-50 p-3 rounded-lg border border-indigo-200">
                    <span className="block text-indigo-700 text-xs font-bold uppercase mb-1">Remaining Hours</span>
                    <strong className="text-xl font-black text-indigo-800">{summary.remaining_hours} Hours</strong>
                </div>
            </div>
        </div>
      )}

      {/* --- HISTORY TABLE --- */}
      <div className="bg-white shadow-sm border border-gray-200 rounded-xl overflow-hidden">
        <div className="p-4 bg-gray-50 border-b border-gray-200">
            <h2 className="text-lg font-bold text-gray-800">Client Visit & Edit History</h2>
        </div>

        {summary.history.length === 0 ? (
          <div className="p-8 text-center text-sm text-gray-500 font-medium">No activity recorded yet.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-left border-collapse">
              <thead>
                <tr className="bg-gray-100 border-b border-gray-300">
                  <th className="px-4 py-3 font-semibold text-sm text-gray-600 uppercase tracking-wider">Date & Time</th>
                  <th className="px-4 py-3 font-semibold text-sm text-gray-600 uppercase tracking-wider">Duration</th>
                  <th className="px-4 py-3 font-semibold text-sm text-gray-600 uppercase tracking-wider">Type</th>
                  <th className="px-4 py-3 font-semibold text-sm text-gray-600 uppercase tracking-wider">Service & Location</th>
                  <th className="px-4 py-3 font-semibold text-sm text-gray-600 uppercase tracking-wider">Staff</th>
                  <th className="px-4 py-3 font-semibold text-sm text-gray-600 uppercase tracking-wider">Amount</th>
                  <th className="px-4 py-3 font-semibold text-sm text-gray-600 uppercase tracking-wider text-center">Actions</th>
                </tr>
              </thead>
              <tbody className="text-sm">
                {summary.history.map((row) => {
                  
                  // --- HANDLE SYSTEM AUDIT LOGS ---
                  if (row.eventType === 'audit_log') {
                      return (
                          <tr key={row.id} className="border-b border-gray-100 bg-orange-50/40 hover:bg-orange-50 transition-colors">
                              <td className="px-4 py-3">
                                  <div className="font-bold text-gray-900 flex items-center gap-1.5 text-sm">
                                      <Calendar size={14} className="text-gray-500" /> {fmtDate(row.date)}
                                  </div>
                                  <div className="text-gray-500 font-medium text-xs mt-1 flex items-center gap-1.5">
                                      <Clock size={12} /> {row.check_in_time ? fmtTime(row.check_in_time) : ''}
                                  </div>
                              </td>
                              <td className="px-4 py-3 text-gray-500">—</td>
                              <td className="px-4 py-3">
                                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-bold bg-orange-100 text-orange-800 border border-orange-200">
                                      <History size={14} /> System Log
                                  </span>
                              </td>
                              <td className="px-4 py-3" colSpan={2}>
                                  <div className="font-semibold text-gray-800 text-sm">Record Edited / Updated</div>
                                  <div className="text-gray-600 text-xs mt-1 italic">"{row.audit_details?.remark || 'No remark provided'}"</div>
                              </td>
                              <td className="px-4 py-3 text-gray-500">—</td>
                              <td className="px-4 py-3 text-center text-xs text-gray-400 font-medium">Log Record</td>
                          </tr>
                      );
                  }

                  // --- HANDLE VISITS & PURCHASES ---
                  const isPurchase = row.eventType === 'package_purchase';
                  const isRedemption = !!row.is_package_customer;
                  const hasGroup = row.group_customers && row.group_customers.length > 0;
                  
                  // Setup Badges
                  let typeLabel = hasGroup ? `Group Visit (+${row.group_customers?.length})` : "Visit";
                  let typeColor = "text-blue-700 bg-blue-50 border-blue-200";
                  
                  if (isPurchase) {
                      typeLabel = "Bought Package";
                      typeColor = "text-green-700 bg-green-50 border-green-200";
                  } else if (isRedemption) {
                      typeLabel = hasGroup ? `Group Redemption (+${row.group_customers?.length})` : "Redeemed";
                      typeColor = "text-purple-700 bg-purple-50 border-purple-200";
                  }

                  return (
                    <React.Fragment key={row.id}>
                        {/* MAIN ROW */}
                        <tr className={`border-b ${hasGroup ? 'border-dashed border-gray-200' : 'border-gray-100'} hover:bg-gray-50 transition-colors`}>
                          
                          {/* Date & Time */}
                          <td className="px-4 py-3">
                            <div className="font-bold text-gray-900 flex items-center gap-1.5 text-sm">
                                <Calendar size={14} className="text-gray-500" /> {fmtDate(row.date)}
                            </div>
                            <div className="text-gray-500 font-medium text-xs mt-1 flex items-center gap-1.5">
                                <Clock size={12} /> {row.check_in_time ? fmtTime(row.check_in_time) : 'Time Not Set'}
                            </div>
                          </td>

                          {/* Duration */}
                          <td className="px-4 py-3">
                            <div className="font-bold text-sm text-indigo-800 bg-indigo-50 border border-indigo-200 inline-block px-2 py-1 rounded">
                              {fmtDuration(row.session_hours)}
                            </div>
                          </td>

                          {/* Type */}
                          <td className="px-4 py-3">
                            <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-bold border ${typeColor}`}>
                              {isPurchase ? <PackageCheck size={14} /> : isRedemption ? <PackageMinus size={14} /> : <Activity size={14} />}
                              {typeLabel}
                            </span>
                          </td>

                          {/* Treatment & Location */}
                          <td className="px-4 py-3">
                            <div className="font-semibold text-gray-800 text-sm">
                                {isPurchase ? row.package_name : (hasGroup ? 'Main: ' + row.treatment : row.treatment)}
                            </div>
                            <div className="text-gray-500 font-medium text-xs mt-0.5">
                                {row.outlet_name || 'No Outlet Selected'}
                            </div>
                          </td>

                          {/* Staff */}
                          <td className="px-4 py-3 text-gray-700 font-medium">
                            {row.therapist_name || '—'}
                          </td>

                          {/* Value / Amount */}
                          <td className="px-4 py-3">
                            {isPurchase ? (
                              <div className="font-semibold text-green-600 text-sm">{formatCurrency(row.package_amount)}</div>
                            ) : isRedemption ? (
                              <div className="font-semibold text-gray-400 text-sm">—</div>
                            ) : (
                              <div className="font-semibold text-gray-800 text-sm">{formatCurrency(row.amount_paid)}</div>
                            )}
                          </td>

                          {/* Actions */}
                          <td className="px-4 py-3 text-center space-x-2 whitespace-nowrap">
                            <button 
                                onClick={() => handleOpenHistoryEdit(row)} 
                                className="px-3 py-1.5 bg-white border border-gray-300 text-gray-600 text-xs font-semibold rounded hover:bg-gray-100 hover:text-blue-600 transition-colors"
                            >
                                Edit
                            </button>
                            <button 
                                onClick={() => handleOpenDelete(row)} 
                                className="px-3 py-1.5 bg-red-50 border border-red-200 text-red-600 text-xs font-semibold rounded hover:bg-red-100 transition-colors"
                            >
                                Delete
                            </button>
                          </td>
                        </tr>

                        {/* SUB-ROWS FOR GROUP CUSTOMERS */}
                        {hasGroup && row.group_customers?.map((guest, idx) => (
                            <tr key={`${row.id}-guest-${idx}`} className="bg-gray-50/50 border-b border-gray-100 text-xs">
                                <td className="px-4 py-2 text-gray-400 text-right"><CornerDownRight size={14} className="inline ml-auto" /></td>
                                <td className="px-4 py-2 font-bold text-indigo-700">{fmtDuration(guest.sessionHours || guest.session_hours)}</td>
                                <td className="px-4 py-2 font-medium text-gray-600">Guest: {guest.name || `Friend ${idx + 1}`}</td>
                                <td className="px-4 py-2 font-medium text-gray-800">{guest.treatment || '—'}</td>
                                <td className="px-4 py-2 text-gray-600">{guest.therapist_name || '—'}</td>
                                <td className="px-4 py-2 text-gray-400">—</td>
                                <td className="px-4 py-2"></td>
                            </tr>
                        ))}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* --- MODALS --- */}
      
      {/* 1. Global Profile Edit Modal */}
      {isEditProfileOpen && (
        <div className="fixed inset-0 bg-gray-900/50 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
            <div className="bg-white rounded-xl shadow-lg w-full max-w-sm p-6">
                <div className="flex justify-between items-center mb-4 border-b pb-2">
                    <h2 className="font-bold text-lg text-gray-900">Edit Client</h2>
                    <button onClick={() => setIsEditProfileOpen(false)} className="p-1 text-gray-500 hover:bg-gray-100 rounded"><X size={18}/></button>
                </div>
                
                <div className="space-y-4 text-sm">
                    <div>
                        <label className="block font-semibold text-gray-700 mb-1">Client Name</label>
                        <input type="text" value={editName} onChange={(e) => setEditName(e.target.value)} className="w-full p-2 border border-gray-300 rounded text-gray-900 bg-white" />
                    </div>
                    <div>
                        <label className="block font-semibold text-gray-700 mb-1">Mobile Number</label>
                        <input type="text" value={editMobile} onChange={(e) => setEditMobile(e.target.value)} className="w-full p-2 border border-gray-300 rounded text-gray-900 bg-white" />
                    </div>
                    <div>
                        <label className="block font-semibold text-red-600 mb-1">Admin Password</label>
                        <input type="password" value={editPassword} onChange={(e) => setEditPassword(e.target.value)} className="w-full p-2 border border-red-300 rounded text-gray-900 bg-red-50 focus:bg-white" placeholder="Required" />
                    </div>
                    
                    {saveError && <p className="text-red-600 font-medium text-xs">{saveError}</p>}
                    
                    <button onClick={handleSaveProfile} disabled={isSavingProfile} className="w-full py-2.5 bg-blue-600 text-white rounded font-semibold text-sm hover:bg-blue-700 mt-2">
                        {isSavingProfile ? 'Saving...' : 'Save Profile Changes'}
                    </button>
                </div>
            </div>
        </div>
      )}

      {/* 2. History Edit Modal */}
      {isHistoryEditOpen && historyEditItem && (
        <div className="fixed inset-0 bg-gray-900/50 z-[60] flex items-center justify-center p-4 overflow-y-auto">
            <div className="bg-white rounded-xl shadow-lg w-full max-w-xl my-8">
                <div className="p-4 border-b border-gray-200 flex justify-between items-center bg-gray-50 rounded-t-xl">
                    <h3 className="font-bold text-lg text-gray-900">Edit Record</h3>
                    <button onClick={() => setIsHistoryEditOpen(false)} className="p-1 text-gray-500 hover:bg-gray-200 rounded"><X size={18}/></button>
                </div>
                
                <div className="p-6 space-y-4 text-sm">
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block font-semibold text-gray-700 mb-1">Date</label>
                            <input type="date" value={historyForm.date} onChange={e => setHistoryForm({...historyForm, date: e.target.value})} className="w-full p-2 border border-gray-300 rounded bg-white text-gray-900" />
                        </div>
                        <div>
                            <label className="block font-semibold text-gray-700 mb-1">Check-in Time</label>
                            <input type="time" value={historyForm.check_in_time} onChange={e => setHistoryForm({...historyForm, check_in_time: e.target.value})} className="w-full p-2 border border-gray-300 rounded bg-white text-gray-900" />
                        </div>
                    </div>
                    
                    <div>
                        <label className="block font-semibold text-gray-700 mb-1">Service / Package Name</label>
                        <input type="text" value={historyForm.treatment} onChange={e => setHistoryForm({...historyForm, treatment: e.target.value})} className="w-full p-2 border border-gray-300 rounded bg-white text-gray-900" />
                    </div>
                    
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block font-semibold text-gray-700 mb-1">Amount (₹)</label>
                            <input type="number" value={historyForm.amount} onChange={e => setHistoryForm({...historyForm, amount: e.target.value})} className="w-full p-2 border border-gray-300 rounded bg-white text-gray-900" />
                        </div>
                        <div>
                            <label className="block font-semibold text-gray-700 mb-1">Duration (Hours / Mins)</label>
                            <div className="flex gap-2">
                                <input type="number" value={historyForm.hours_h} onChange={e=>setHistoryForm({...historyForm, hours_h: e.target.value})} className="w-1/2 p-2 border border-gray-300 rounded bg-white text-gray-900 text-center" placeholder="Hr"/>
                                <input type="number" value={historyForm.hours_m} onChange={e=>setHistoryForm({...historyForm, hours_m: e.target.value})} className="w-1/2 p-2 border border-gray-300 rounded bg-white text-gray-900 text-center" placeholder="Min"/>
                            </div>
                        </div>
                    </div>
                    
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block font-semibold text-gray-700 mb-1">Outlet</label>
                            <select value={historyForm.outlet_id} onChange={e => setHistoryForm({...historyForm, outlet_id: e.target.value})} className="w-full p-2 border border-gray-300 rounded bg-white text-gray-900">
                                <option value="">Select Outlet...</option>
                                {OUTLETS.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
                            </select>
                        </div>
                        <div>
                            <label className="block font-semibold text-gray-700 mb-1">Staff / Therapist</label>
                            <select value={historyForm.therapist} onChange={e => setHistoryForm({...historyForm, therapist: e.target.value})} className="w-full p-2 border border-gray-300 rounded bg-white text-gray-900">
                                <option value="">Select Staff...</option>
                                {employees.map(e => <option key={e.id} value={e.name}>{e.name}</option>)}
                            </select>
                        </div>
                    </div>
                    
                    <div className="pt-4 border-t border-gray-200 mt-4">
                        <label className="block font-semibold text-red-600 mb-1">Admin Password</label>
                        <input type="password" value={historyEditPassword} onChange={e => setHistoryEditPassword(e.target.value)} className="w-full p-2 border border-red-300 rounded bg-red-50 text-gray-900 focus:bg-white" placeholder="Required" />
                    </div>
                </div>
                
                <div className="p-4 bg-gray-50 border-t border-gray-200 flex justify-end gap-3 rounded-b-xl">
                    <button onClick={() => setIsHistoryEditOpen(false)} className="px-4 py-2 font-semibold text-sm text-gray-600 bg-white border border-gray-300 rounded hover:bg-gray-100">Cancel</button>
                    <button onClick={handleSaveHistoryEdit} disabled={isSavingHistory} className="px-5 py-2 bg-blue-600 text-white text-sm font-semibold rounded hover:bg-blue-700">{isSavingHistory ? 'Saving...' : 'Save Changes'}</button>
                </div>
            </div>
        </div>
      )}

      {/* 3. Delete Modal */}
      {isDeleteOpen && (
        <div className="fixed inset-0 bg-gray-900/50 z-[60] flex items-center justify-center p-4">
            <div className="bg-white rounded-xl shadow-lg w-full max-w-sm p-6 text-center">
                <h3 className="font-bold text-xl text-red-600 mb-2">Delete Record?</h3>
                <p className="text-sm text-gray-600 mb-6">This action cannot be undone. Enter password to confirm.</p>
                
                <input type="password" value={deletePassword} onChange={(e) => setDeletePassword(e.target.value)} className="w-full p-2 border border-gray-300 rounded text-center mb-6 text-sm" placeholder="Admin Password" />
                
                <div className="flex gap-3">
                    <button onClick={() => setIsDeleteOpen(false)} className="flex-1 py-2 bg-gray-100 text-gray-700 border border-gray-300 rounded font-semibold text-sm hover:bg-gray-200">Cancel</button>
                    <button onClick={handleExecuteDelete} disabled={isDeleting} className="flex-1 py-2 bg-red-600 text-white rounded font-semibold text-sm hover:bg-red-700">{isDeleting ? 'Deleting...' : 'Delete'}</button>
                </div>
            </div>
        </div>
      )}

    </div>
  );
}