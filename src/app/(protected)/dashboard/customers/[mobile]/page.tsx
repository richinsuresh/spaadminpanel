'use client'; 

import React, { useCallback, useEffect, useState, use } from 'react';
import { supabase } from '@/lib/supabase';
import { OUTLETS } from '@/lib/outlet';
import { 
    Loader2, Calendar, Clock, Tag, MapPin, 
    User, FileText, Gift, Edit, Trash, 
    ChevronDown, ChevronUp, AlertTriangle, 
    Package, Users, Save, History, ArrowRight,
    X, IndianRupee, Eye
} from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation'; 
import { useActivityLog } from '@/hooks/useActivityLog';

/* ---------------- types ---------------- */
type HistoryRow = {
  id: string; date: string | null; name: string | null; mobile: string | null; treatment: string | null;
  session_hours: number | null; amount_paid: number | null; took_package: boolean | null;
  package_amount: number | null; check_in_time: string | null; check_out_time: string | null;
  therapist_name: string | null; 
  outlet_name: string | null; outlet_id: string | null; 
  status?: string | null; package_status?: string | null; 
  used_hours?: number | null; remaining_hours?: number | null; expiry_date?: string | null;
  start_date?: string | null; package_name?: string | null; is_package_customer?: boolean | null;
  _raw?: any; _raw_pkg?: any; [k: string]: any; eventType: 'visit' | 'package_purchase' | 'audit_log'; 
  user_name?: string | null; related_table?: string | null;
  audit_details?: { before: any; after: any; remark: string };
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
  return d.toLocaleTimeString('en-IN', { 
      hour: 'numeric', 
      minute: '2-digit', 
      hour12: true 
  }).toUpperCase();
};

const fmtDuration = (h: number | null | undefined) => {
  if (h === null || h === undefined) return '—';
  const n = Number(h);
  if (!Number.isFinite(n) || n === 0) return '—';
  const m = Math.round(n * 60);
  if (m < 60) return `${m}m`;
  const hrs = Math.floor(m / 60);
  const mins = m - hrs * 60;
  return mins === 0 ? `${hrs}h` : `${hrs}h ${mins}m`;
};

const decimalToTime = (decimal: number) => {
  const safeDecimal = Number(decimal) || 0;
  const hrs = Math.floor(safeDecimal);
  const mins = Math.round((safeDecimal - hrs) * 60);
  return { hrs, mins };
};

const toNum = (v: any) => (v === undefined || v === null || v === '' ? null : (Number.isFinite(Number(v)) ? Number(v) : null));

const fmtAuditValue = (key: string, val: any) => {
    if (val === null || val === undefined || val === '') return '—';
    const s = String(val);
    if (s.match(/^\d{4}-\d{2}-\d{2}/)) {
        const d = new Date(s);
        if (!isNaN(d.getTime())) {
            if (s.includes('T') || s.includes(':')) {
                return d.toLocaleString('en-IN', {
                    day: 'numeric', month: 'short', 
                    hour: 'numeric', minute: '2-digit', hour12: true
                }).toUpperCase();
            }
            return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
        }
    }
    return s;
};

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
    outlet_name: maybeStr(r.outlet_name ?? r.outlet ?? null),
    outlet_id: maybeStr(r.outlet_id ?? null),
    is_package_customer: !!(r.is_package_customer ?? r.isPackageCustomer ?? r.package_redeemed ?? false),
    status: maybeStr(r.status ?? null), _raw: r, eventType: 'visit',
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
  const [expandedHistory, setExpandedHistory] = useState<string[]>([]);
  const [isHistoryExpanded, setIsHistoryExpanded] = useState(false);
  
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
      date: '',
      treatment: '', 
      amount: '',
      therapist: '', 
      hours_h: '', 
      hours_m: '',
      outlet_id: '',
  });
  const [historyEditPassword, setHistoryEditPassword] = useState('');
  const [isSavingHistory, setIsSavingHistory] = useState(false);

  // HISTORY TABLE & DELETE STATE
  const [isHistoryTableOpen, setIsHistoryTableOpen] = useState(false);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [deleteItem, setDeleteItem] = useState<HistoryRow | null>(null);
  const [deletePassword, setDeletePassword] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);

  const toggleHistoryExpand = () => setIsHistoryExpanded(!isHistoryExpanded);
  
  const fetchDropdowns = async () => {
      const { data: empData } = await supabase.from('employees').select('id, name').eq('is_active', true).order('name');
      setEmployees((empData as Employee[]) || []);

      const { data: treatData } = await supabase.from('treatments').select('id, name, outlet_id').order('name');
      setTreatments((treatData as Treatment[]) || []);
  };

  const fetchClientData = useCallback(async () => {
    setLoading(true);
    setWarning(null);

    const mobileRegex = /^\d+$/; 
    if (!mobile || !mobileRegex.test(mobile)) { 
      setWarning('Mobile number is missing or invalid in the URL.');
      setLoading(false);
      return;
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
        if (bestPkg) { packageMap[mobile] = bestPkg; }

        packagePurchases = pkgData.map((p: any) => ({
            id: String(p.id ?? p.package_id ?? p.created_at), date: String(p.created_at ?? p.date ?? null),
            name: String(p.customer_name ?? p.name ?? null), mobile: String(p.mobile ?? null),
            eventType: 'package_purchase' as const, treatment: String(p.package_name ?? p.name ?? 'Package Purchase'),
            session_hours: toNum(p.total_hours ?? p.totalHours ?? p.totalPackageHours ?? null), amount_paid: toNum(p.package_amount ?? p.amount ?? null),
            package_amount: toNum(p.package_amount ?? p.amount ?? null), package_name: String(p.package_name ?? p.name ?? 'Package'),
            therapist_name: String(p.employee_name ?? p.sold_by ?? null), 
            outlet_name: String(p.outlet_name ?? p.outlet ?? null), outlet_id: String(p.outlet_id ?? null),
            status: String(p.status ?? p.package_status ?? null), took_package: true, 
            check_in_time: String(p.created_at ?? null), check_out_time: null, is_package_customer: false, _raw: p,
        }));
      }
      
      let auditLogs: HistoryRow[] = [];
      try {
          const { data: logData } = await supabase.from('activity_logs').select('*').ilike('description', `%${mobile}%`).order('created_at', { ascending: false });
          if (Array.isArray(logData)) {
             auditLogs = logData.map(log => {
                let details = { before: {}, after: {}, remark: '' };
                try { details = JSON.parse(log.description); } catch (e) {}
                return {
                    id: log.id, date: log.created_at, name: 'System Log', mobile: mobile,
                    eventType: 'audit_log', treatment: `Audit: ${log.action_type.replace(/_/g, ' ').toUpperCase()}`,
                    therapist_name: log.username, outlet_name: 'Admin Panel', outlet_id: null,
                    check_in_time: log.created_at, check_out_time: null, session_hours: null, amount_paid: null, 
                    took_package: false, package_amount: null, audit_details: details
                } as HistoryRow;
             });
          }
      } catch (logErr) { console.warn('Log fetch error', logErr); }

      const combinedHistory: HistoryRow[] = [...visits, ...packagePurchases, ...auditLogs];
      combinedHistory.sort((a, b) => {
          const dateA = a.date ? new Date(a.date).getTime() : 0;
          const dateB = b.date ? new Date(b.date).getTime() : 0;
          return dateB - dateA;
      });

      const pkg = packageMap[mobile];
      const total = pkg ? (pkg.total_hours ?? pkg.totalHours ?? pkg.totalPackageHours ?? pkg.total ?? null) : null;
      const totalNum = total !== undefined && total !== null && Number.isFinite(Number(total)) ? Number(total) : 0;
      const consumedFromVisits = visits.filter(v => v.is_package_customer).reduce((sum, v) => sum + (v.session_hours || 0), 0);
      const dbUsed = pkg ? (pkg.used_hours ?? pkg.consumed_hours ?? pkg.usedHours ?? null) : null;
      const dbUsedNum = dbUsed !== undefined && dbUsed !== null && Number.isFinite(Number(dbUsed)) ? Number(dbUsed) : 0;
      const finalUsedNum = Math.max(dbUsedNum, consumedFromVisits);
      const calculatedRemaining = Math.max(0, totalNum - finalUsedNum);
      
      const finalSummary: ClientSummary = {
          mobile: mobile, name: profileData?.name || visits[0]?.name || 'Unknown Client', latestVisitDate: visits[0]?.date || null,
          latestPackageName: pkg ? (pkg.package_name ?? pkg.name ?? 'N/A') : 'None',
          remaining_hours: totalNum > 0 ? calculatedRemaining : null, used_hours: finalUsedNum, total_hours: totalNum,
          expiry_date: pkg?.expiry_date ?? null, package_status: pkg?.status ?? null, history: combinedHistory, profileData: profileData || null,
      };

      setSummary(finalSummary);
      setEditName(finalSummary.name);
      setEditMobile(mobile);

    } catch (error: any) {
      console.error('Error fetching client data:', error);
      setWarning('Failed to load client history. ' + error.message);
      setSummary(null);
    } finally {
      setLoading(false);
    }
  }, [mobile]);

  useEffect(() => {
    fetchDropdowns();
    fetchClientData();
  }, [fetchClientData]);

  // --- GLOBAL EDIT PROFILE ---
  const handleSaveProfile = async () => {
    if (editPassword !== 'admin123') { setSaveError('Incorrect password'); return; }
    if (!editName.trim() || !editMobile.trim()) { setSaveError('Name and Mobile are required'); return; }
    setIsSavingProfile(true); setSaveError('');
    try {
        const oldMobile = summary?.mobile;
        const { error: custError } = await supabase.from('customers').update({ name: editName, mobile: editMobile }).eq('mobile', oldMobile);
        if (custError) throw custError;
        const { error: pkgError } = await supabase.from('packages').update({ name: editName, mobile: editMobile }).eq('mobile', oldMobile);
        if (pkgError) throw pkgError;
        await logActivity('global_client_edit', JSON.stringify({ before: { name: summary?.name, mobile: oldMobile }, after: { name: editName, mobile: editMobile }, remark: 'Global profile update' }));
        if (oldMobile !== editMobile) { alert('Profile updated! Redirecting...'); router.push(`/dashboard/customers/${editMobile}`); } 
        else { alert('Profile updated.'); setIsEditProfileOpen(false); fetchClientData(); }
    } catch (err: any) { setSaveError('Update failed: ' + err.message); } finally { setIsSavingProfile(false); }
  };

  // --- HISTORY EDIT HANDLERS ---
  const handleOpenHistoryEdit = (item: HistoryRow) => {
      if (item.eventType === 'audit_log') return;

      setHistoryEditItem(item);
      const isPkg = item.eventType === 'package_purchase';
      
      const { hrs, mins } = decimalToTime(item.session_hours || 0);

      // Try to find the Outlet ID if it wasn't saved, using name matching
      let currentOutletId = item.outlet_id;
      if (!currentOutletId && item.outlet_name) {
          const matched = OUTLETS.find(o => o.name === item.outlet_name);
          if (matched) currentOutletId = matched.id;
      }

      setHistoryForm({
          date: item.date ? new Date(item.date).toISOString().split('T')[0] : '',
          treatment: isPkg ? (item.package_name || '') : (item.treatment || ''),
          amount: isPkg ? String(item.package_amount ? item.package_amount/100 : 0) : String(item.amount_paid ? item.amount_paid/100 : 0),
          therapist: item.therapist_name || '',
          hours_h: String(hrs),
          hours_m: String(mins),
          outlet_id: currentOutletId || ''
      });
      setHistoryEditPassword('');
      setIsHistoryEditOpen(true);
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

          if (historyForm.outlet_id) {
              const matchedOutlet = OUTLETS.find(o => o.id === historyForm.outlet_id);
              if (matchedOutlet) {
                  updates.outlet_id = matchedOutlet.id;
                  updates.outlet_name = matchedOutlet.name; 
                  if (!isPkg) updates.outlet = matchedOutlet.name; 
              }
          }

          const amt = parseFloat(historyForm.amount) * 100; 
          if (!isNaN(amt)) {
              if (isPkg) updates.package_amount = amt;
              else updates.amount_paid = amt;
          }

          const totalHours = (Number(historyForm.hours_h) || 0) + (Number(historyForm.hours_m) || 0) / 60;
          if (!isNaN(totalHours)) {
              if (isPkg) updates.total_hours = totalHours;
              else updates.session_hours = totalHours;
          }

          if (isPkg) {
              updates.package_name = historyForm.treatment;
              updates.sold_by = historyForm.therapist;
          } else {
              updates.treatment = historyForm.treatment;
              updates.therapist_name = historyForm.therapist;
          }

          const { error } = await supabase.from(table).update(updates).eq('id', historyEditItem.id);
          if (error) throw error;

          await logActivity('history_edit_individual', JSON.stringify({
              id: historyEditItem.id,
              type: historyEditItem.eventType,
              before: historyEditItem._raw,
              after: updates,
              remark: 'Edited via Client History Timeline'
          }));

          setIsHistoryEditOpen(false);
          setHistoryEditItem(null);
          fetchClientData();

      } catch (err: any) {
          alert('Failed to update: ' + err.message);
      } finally {
          setIsSavingHistory(false);
      }
  };

  // --- HISTORY DELETE HANDLERS ---
  const handleOpenDelete = (item: HistoryRow) => {
    if (item.eventType === 'audit_log') {
        alert("Cannot delete audit logs.");
        return;
    }
    setDeleteItem(item);
    setDeletePassword('');
    setIsDeleteOpen(true);
  };

  const handleExecuteDelete = async () => {
    if (deletePassword !== 'admin123') { alert('Incorrect Password'); return; }
    if (!deleteItem) return;

    setIsDeleting(true);
    try {
        const table = deleteItem.eventType === 'package_purchase' ? 'packages' : 'customers';
        const { error } = await supabase.from(table).delete().eq('id', deleteItem.id);
        
        if (error) throw error;

        await logActivity('history_delete', JSON.stringify({
            id: deleteItem.id,
            type: deleteItem.eventType,
            deleted_record: deleteItem._raw,
            remark: 'Deleted via Full History Table'
        }));

        setIsDeleteOpen(false);
        setDeleteItem(null);
        fetchClientData(); // Refresh data
    } catch (err: any) {
        alert('Failed to delete: ' + err.message);
    } finally {
        setIsDeleting(false);
    }
  };

  // --- RENDER HELPERS ---
  const renderAuditDiff = (before: any, after: any) => {
      if (!before || !after) return null;
      const changes = [];
      const allKeys = Array.from(new Set([...Object.keys(before), ...Object.keys(after)]));
      
      for (const key of allKeys) {
          if (['updated_at', 'created_at', 'id', 'outlet_id'].includes(key)) continue;
          const valBefore = before[key];
          const valAfter = after[key];
          if (String(valBefore) === String(valAfter)) continue;
          const sBefore = fmtAuditValue(key, valBefore);
          const sAfter = fmtAuditValue(key, valAfter);
          changes.push(
              <div key={key} className="text-xs flex items-center gap-2 py-0.5">
                  <span className="font-bold text-gray-600 capitalize min-w-[100px]">{key.replace(/_/g, ' ')}:</span>
                  <span className="text-red-500 line-through opacity-75">{sBefore}</span>
                  <ArrowRight size={12} className="text-gray-400" />
                  <span className="text-green-600 font-bold bg-green-50 px-1 rounded">{sAfter}</span>
              </div>
          );
      }
      return changes.length === 0 ? <div className="text-xs text-gray-400 italic">No specific field changes detected.</div> : <div className="col-span-2 md:col-span-4 mt-2 p-3 bg-white border border-orange-200 rounded-lg shadow-sm"><div className="text-xs font-bold text-orange-800 mb-2 uppercase tracking-wide flex items-center gap-2"><Edit size={12} /> Changes Made</div><div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-1">{changes}</div></div>;
  };

  const renderHistoryItem = (item: HistoryRow, isExpanded: boolean) => {
    const isVisit = item.eventType === 'visit';
    const isPurchase = item.eventType === 'package_purchase';
    const isAudit = item.eventType === 'audit_log';
    const isRedeemedVisit = isVisit && item.is_package_customer; 
    
    const bgColor = isAudit ? 'bg-orange-50' : isRedeemedVisit ? 'bg-indigo-100/70' : isVisit ? 'bg-indigo-50' : isPurchase ? 'bg-green-50' : 'bg-gray-50';
    const icon = isAudit ? <History size={18} className='text-orange-700' /> : isRedeemedVisit ? <Gift size={18} className='text-indigo-700' /> : isVisit ? <Calendar size={18} /> : isPurchase ? <Package size={18} /> : <FileText size={18} />;
    const title = isAudit ? item.treatment : isVisit ? item.treatment : isPurchase ? item.package_name : 'Activity Log';
    
    return (
        <div key={item.id} className={`${bgColor} p-4 rounded-lg shadow-sm border border-gray-200 relative group`}>
            {!isAudit && (
                <button 
                    onClick={(e) => { e.stopPropagation(); handleOpenHistoryEdit(item); }}
                    className="absolute top-4 right-4 p-1.5 bg-white text-gray-500 rounded-full hover:text-blue-600 hover:bg-blue-50 shadow-sm border border-gray-200 opacity-0 group-hover:opacity-100 transition-opacity"
                    title="Edit Record"
                >
                    <Edit size={14} />
                </button>
            )}

            <div className="flex items-center justify-between cursor-pointer pr-10" onClick={() => setExpandedHistory(prev => prev.includes(item.id) ? prev.filter(id => id !== item.id) : [...prev, item.id])}>
                <div className="flex items-center gap-3">
                    {icon}
                    <div className="font-semibold text-gray-800">{title}</div>
                    {isRedeemedVisit && <span className="text-xs font-medium text-indigo-700 bg-indigo-200 px-2 py-0.5 rounded-full ml-2">Redeemed</span>}
                    {isPurchase && <span className="text-xs font-medium text-green-700 bg-green-200 px-2 py-0.5 rounded-full ml-2">Purchased</span>}
                    {isAudit && <span className="text-xs font-medium text-orange-700 bg-orange-200 px-2 py-0.5 rounded-full ml-2">System Log</span>}
                </div>
                <div className="flex items-center gap-4">
                    <span className="text-sm text-gray-600">{fmtDate(item.date)}</span>
                </div>
            </div>

            {(isExpanded || isHistoryExpanded) && (
                <div className="mt-3 pt-3 border-t border-gray-200 grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                    {!isAudit && <DetailItem icon={MapPin} label="Outlet" value={item.outlet_name} />}
                    <DetailItem icon={Users} label={isAudit ? 'Performed By' : isPurchase ? 'Seller' : 'Therapist'} value={item.therapist_name} />
                    
                    {isVisit && (
                        <>
                            <DetailItem icon={Clock} label="Duration" value={fmtDuration(item.session_hours)} />
                            <DetailItem icon={Tag} label="Paid (₹)" value={item.amount_paid ? (item.amount_paid / 100).toFixed(0) : '—'} />
                            <DetailItem icon={Clock} label="Time In" value={item.check_in_time ? fmtTime(item.check_in_time) : 'N/A'} />
                            <DetailItem icon={Clock} label="Time Out" value={item.check_out_time ? fmtTime(item.check_out_time) : 'N/A'} />
                        </>
                    )}

                    {isPurchase && (
                        <>
                            <DetailItem icon={Gift} label="Total Hours" value={item.session_hours ? `${item.session_hours}h` : '—'} />
                            <DetailItem icon={Tag} label="Amount (₹)" value={item.package_amount ? (item.package_amount / 100).toFixed(0) : '—'} />
                            <DetailItem icon={FileText} label="Status" value={item.status ? String(item.status).toUpperCase() : 'N/A'} /> 
                        </>
                    )}
                    
                    {(isPurchase || isAudit) && <DetailItem icon={Clock} label="Log Time" value={fmtTime(item.check_in_time)} />}

                    {isAudit && item.audit_details && (
                        <>
                            <div className="col-span-2 md:col-span-4 mt-2 mb-1 p-2 bg-orange-100 rounded text-orange-900 italic text-xs">" {item.audit_details.remark} "</div>
                            {renderAuditDiff(item.audit_details.before, item.audit_details.after)}
                        </>
                    )}
                </div>
            )}
        </div>
    );
  };
  
  const DetailItem = ({ icon: Icon, label, value }: { icon: React.ElementType, label: string, value: string | number | null | undefined }) => (
    <div className="flex flex-col"><div className="text-xs font-medium text-gray-500 flex items-center gap-1"><Icon size={12} /> {label}</div><div className="text-sm font-semibold text-gray-800">{value ?? '—'}</div></div>
  );
  
  const InfoBox = ({ label, value, isLarge = false, isHighlight = false, isAlert = false }: { label: string, value: string | number, isLarge?: boolean, isHighlight?: boolean, isAlert?: boolean }) => (
    <div className="flex flex-col p-3 border rounded-lg bg-gray-50"><div className="text-xs font-medium text-gray-500">{label}</div><div className={`mt-1 font-bold ${isLarge ? 'text-3xl' : 'text-xl'} ${isHighlight ? 'text-green-600' : isAlert ? 'text-red-600' : 'text-gray-800'}`}>{value}</div></div>
  );

  const ProgressBar = ({ used, total }: { used: number | null, total: number | null }) => {
    // FIX: Ensure values are numbers before subtraction
    const totalNum = toNum(total) ?? 0;
    const usedNum = toNum(used) ?? 0;
    
    if (totalNum <= 0) return null;
    
    const remainingNum = Math.max(0, totalNum - usedNum);
    const pctUsed = Math.round((usedNum / totalNum) * 100); 
    const barColor = pctUsed < 80 ? 'bg-indigo-600' : 'bg-red-600';
    
    return (
        <div className="space-y-2"><div className="flex items-center justify-between text-sm font-medium"><span className="text-gray-700">Package Usage</span><span className="text-gray-700">{pctUsed}% Consumed</span></div><div className="w-full bg-gray-200 h-3 rounded-full overflow-hidden flex"><div className={`h-3 ${barColor}`} style={{ width: `${Math.max(0, Math.min(100, pctUsed))}%` }} /></div><div className="flex justify-between text-xs text-gray-500"><span>{usedNum}h Used</span><span>{remainingNum}h Remaining</span></div></div>
    );
  };

  if (loading) return <div className="p-8 flex items-center justify-center min-h-[500px]"><Loader2 className="w-10 h-10 text-blue-600 animate-spin" /><p className="ml-3 text-lg text-gray-700">Loading client history...</p></div>;
  if (warning || !summary) return <div className="p-8 text-center bg-red-50 border-l-4 border-red-500 min-h-[500px] flex flex-col items-center justify-center"><AlertTriangle className="w-8 h-8 text-red-600" /><h1 className="text-xl font-bold text-red-800 mt-3">Error Loading Client Data</h1><p className="text-red-700 mt-2">{warning || 'Client data could not be retrieved.'}</p><button onClick={() => router.back()} className="mt-4 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors">Go Back</button></div>;

  return (
    <div className="p-4 lg:p-8 bg-gray-50 min-h-screen space-y-8">
      {/* Header */}
      <div className="flex justify-between items-start border-b pb-4">
        <div><h1 className="text-3xl font-bold text-gray-800 capitalize">{summary.name}</h1><p className="text-gray-500 text-lg mt-1">{summary.mobile}</p></div>
        <div className="flex gap-2">
            <button onClick={() => setIsHistoryTableOpen(true)} className="px-3 py-2 bg-white border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors flex items-center gap-2 font-medium shadow-sm"><History size={16} /> Show History</button>
            <button onClick={() => setIsEditProfileOpen(true)} className="px-3 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors flex items-center gap-2 font-medium"><Edit size={16} /> Edit Profile</button>
        </div>
      </div>

      {/* Package Summary */}
      <div className="bg-white p-6 rounded-xl shadow-lg border border-gray-200">
        <h2 className="text-xl font-bold text-indigo-700 mb-4 flex items-center gap-2"><Package size={20} /> Latest Package Status</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
            <InfoBox label="Package Name" value={summary.latestPackageName} />
            <InfoBox label="Status" value={summary.package_status ? String(summary.package_status).toUpperCase() : 'N/A'} isHighlight={summary.package_status === 'active'} />
            <InfoBox label="Total Hours" value={summary.total_hours !== null ? `${summary.total_hours}h` : '—'} />
            <InfoBox label="Hours Used" value={summary.used_hours !== null ? `${summary.used_hours}h` : '—'} />
            <InfoBox label="Hours Remaining" value={summary.remaining_hours !== null ? `${summary.remaining_hours}h` : '—'} isLarge={true} />
            <InfoBox label="Expiry Date" value={fmtDate(summary.expiry_date ?? null)} isAlert={summary.expiry_date ? new Date(summary.expiry_date) < new Date() : false} />
        </div>
        {summary.total_hours !== null && summary.total_hours > 0 && <div className="mt-6 pt-4 border-t border-gray-100"><ProgressBar used={summary.used_hours} total={summary.total_hours} /></div>}
      </div>

      {/* Timeline */}
      <div className="space-y-4">
        <div className="flex justify-between items-center"><h2 className="text-2xl font-bold text-gray-800">History Timeline ({summary.history.length})</h2><button onClick={toggleHistoryExpand} className="text-sm text-indigo-600 hover:text-indigo-800 flex items-center gap-1">{isHistoryExpanded ? 'Collapse All' : 'Expand All'} {isHistoryExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}</button></div>
        {summary.history.length === 0 ? <div className="p-6 text-center text-gray-500 bg-white rounded-lg">No visits, purchases, or logs found.</div> : <div className="space-y-4">{summary.history.map(item => renderHistoryItem(item, expandedHistory.includes(item.id)))}</div>}
      </div>

      {/* HISTORY TABLE MODAL */}
      {isHistoryTableOpen && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-5xl h-[85vh] flex flex-col overflow-hidden">
                <div className="bg-white p-4 border-b flex justify-between items-center">
                    <h2 className="font-bold text-lg flex items-center gap-2 text-gray-800"><History size={20} className="text-indigo-600"/> Full Client History</h2>
                    <button onClick={() => setIsHistoryTableOpen(false)} className="hover:bg-gray-100 p-2 rounded-full text-gray-500"><X size={24} /></button>
                </div>
                <div className="flex-1 overflow-auto p-4 bg-gray-50">
                    <table className="w-full bg-white border border-gray-200 rounded-lg shadow-sm">
                        <thead className="bg-gray-100 sticky top-0 shadow-sm z-10">
                            <tr>
                                <th className="p-3 text-left text-xs font-bold text-gray-500 uppercase">Date</th>
                                <th className="p-3 text-left text-xs font-bold text-gray-500 uppercase">Type</th>
                                <th className="p-3 text-left text-xs font-bold text-gray-500 uppercase">Details (Treatment/Pkg)</th>
                                <th className="p-3 text-left text-xs font-bold text-gray-500 uppercase">Outlet</th>
                                <th className="p-3 text-left text-xs font-bold text-gray-500 uppercase">Therapist/Staff</th>
                                <th className="p-3 text-right text-xs font-bold text-gray-500 uppercase">Amount</th>
                                <th className="p-3 text-right text-xs font-bold text-gray-500 uppercase">Duration</th>
                                <th className="p-3 text-center text-xs font-bold text-gray-500 uppercase">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-200">
                            {summary.history.map((item) => {
                                const isAudit = item.eventType === 'audit_log';
                                return (
                                    <tr key={item.id} className="hover:bg-blue-50 transition-colors">
                                        <td className="p-3 text-sm text-gray-700 whitespace-nowrap">{fmtDate(item.date)}</td>
                                        <td className="p-3 text-sm">
                                            <span className={`px-2 py-1 rounded-full text-xs font-bold ${
                                                item.eventType === 'visit' ? (item.is_package_customer ? 'bg-indigo-100 text-indigo-700' : 'bg-blue-100 text-blue-700') :
                                                item.eventType === 'package_purchase' ? 'bg-green-100 text-green-700' : 'bg-orange-100 text-orange-700'
                                            }`}>
                                                {item.eventType === 'visit' ? 'Visit' : item.eventType === 'package_purchase' ? 'Package' : 'System'}
                                            </span>
                                        </td>
                                        <td className="p-3 text-sm font-medium text-gray-800">{isAudit ? item.treatment : (item.package_name || item.treatment)}</td>
                                        <td className="p-3 text-sm text-gray-600">{item.outlet_name || '—'}</td>
                                        <td className="p-3 text-sm text-gray-600">{item.therapist_name || '—'}</td>
                                        <td className="p-3 text-sm text-right font-mono text-gray-700">{item.amount_paid || item.package_amount ? `₹${((item.amount_paid || item.package_amount || 0)/100).toFixed(0)}` : '—'}</td>
                                        <td className="p-3 text-sm text-right text-gray-600">{fmtDuration(item.session_hours)}</td>
                                        <td className="p-3 flex justify-center gap-2">
                                            {!isAudit && (
                                                <>
                                                    <button onClick={() => handleOpenHistoryEdit(item)} className="p-1.5 text-blue-600 bg-blue-50 rounded hover:bg-blue-100" title="Edit">
                                                        <Edit size={16} />
                                                    </button>
                                                    <button onClick={() => handleOpenDelete(item)} className="p-1.5 text-red-600 bg-red-50 rounded hover:bg-red-100" title="Delete">
                                                        <Trash size={16} />
                                                    </button>
                                                </>
                                            )}
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
      )}

      {/* DELETE CONFIRMATION MODAL */}
      {isDeleteOpen && deleteItem && (
        <div className="fixed inset-0 bg-black/60 z-[60] flex items-center justify-center p-4 backdrop-blur-sm">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm overflow-hidden p-6 space-y-4">
                <div className="flex items-center gap-3 text-red-600">
                    <div className="p-2 bg-red-100 rounded-full"><AlertTriangle size={24} /></div>
                    <h3 className="font-bold text-lg">Confirm Delete</h3>
                </div>
                <p className="text-gray-600 text-sm">
                    Are you sure you want to delete this <strong>{deleteItem.eventType === 'package_purchase' ? 'Package' : 'Visit'}</strong> record dated <strong>{fmtDate(deleteItem.date)}</strong>? This action cannot be undone.
                </p>
                <div>
                    <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Admin Password</label>
                    <input 
                        type="password" 
                        value={deletePassword} 
                        onChange={(e) => setDeletePassword(e.target.value)} 
                        className="w-full p-2 border border-gray-300 rounded focus:border-red-500 focus:ring-1 focus:ring-red-500 outline-none"
                    />
                </div>
                <div className="flex gap-3 pt-2">
                    <button onClick={() => setIsDeleteOpen(false)} className="flex-1 py-2 bg-gray-100 text-gray-700 rounded font-medium">Cancel</button>
                    <button onClick={handleExecuteDelete} disabled={isDeleting} className="flex-1 py-2 bg-red-600 text-white rounded font-medium flex justify-center items-center gap-2">
                        {isDeleting ? <Loader2 className="animate-spin" size={16} /> : 'Delete Permanently'}
                    </button>
                </div>
            </div>
        </div>
      )}

      {/* GLOBAL EDIT MODAL */}
      {isEditProfileOpen && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-md overflow-hidden">
                <div className="bg-indigo-600 p-4 text-white flex justify-between items-center"><h2 className="font-bold text-lg flex items-center gap-2"><Edit size={20} /> Edit Global Profile</h2><button onClick={() => setIsEditProfileOpen(false)}><X size={20} /></button></div>
                <div className="p-6 space-y-4">
                    <div className="bg-yellow-50 border border-yellow-200 p-3 rounded text-xs text-yellow-800 mb-4"><AlertTriangle className="inline w-4 h-4 mr-1" /><strong>Warning:</strong> Updates all past records.</div>
                    <div><label className="block text-sm font-bold text-gray-700 mb-1">Client Name</label><input type="text" value={editName} onChange={(e) => setEditName(e.target.value)} className="w-full p-2 border border-gray-300 rounded" /></div>
                    <div><label className="block text-sm font-bold text-gray-700 mb-1">Mobile Number</label><input type="text" value={editMobile} onChange={(e) => setEditMobile(e.target.value)} className="w-full p-2 border border-gray-300 rounded" /></div>
                    <div><label className="block text-sm font-bold text-gray-700 mb-1">Admin Password</label><input type="password" value={editPassword} onChange={(e) => setEditPassword(e.target.value)} className="w-full p-2 border border-gray-300 rounded" />{saveError && <p className="text-red-600 text-xs mt-1 font-bold">{saveError}</p>}</div>
                    <div className="flex gap-3 pt-2"><button onClick={() => setIsEditProfileOpen(false)} className="flex-1 py-2 bg-gray-100 rounded">Cancel</button><button onClick={handleSaveProfile} disabled={isSavingProfile} className="flex-1 py-2 bg-indigo-600 text-white rounded">{isSavingProfile ? <Loader2 className="animate-spin inline" size={16} /> : 'Save'}</button></div>
                </div>
            </div>
        </div>
      )}

      {/* INDIVIDUAL HISTORY EDIT MODAL (IMPROVED UI) */}
      {isHistoryEditOpen && historyEditItem && (
        <div className="fixed inset-0 bg-black/60 z-[60] flex items-center justify-center p-4 backdrop-blur-sm">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden transform transition-all scale-100">
                
                {/* Header */}
                <div className="bg-gradient-to-r from-blue-600 to-indigo-700 p-5 text-white flex justify-between items-center">
                    <h2 className="font-bold text-lg flex items-center gap-2">
                        <Edit size={20} className="text-white/80" /> 
                        Edit {historyEditItem.eventType === 'package_purchase' ? 'Package' : 'Visit'}
                    </h2>
                    <button onClick={() => setIsHistoryEditOpen(false)} className="hover:bg-white/20 p-1.5 rounded-full transition-colors">
                        <X size={20} />
                    </button>
                </div>

                <div className="p-6 space-y-5">
                    
                    {/* Section: Date & Outlet */}
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="flex items-center gap-1.5 text-xs font-bold text-gray-500 uppercase mb-1.5">
                                <Calendar size={12} /> Date
                            </label>
                            <input 
                                type="date" 
                                value={historyForm.date} 
                                onChange={(e) => setHistoryForm({...historyForm, date: e.target.value})} 
                                className="w-full p-2.5 bg-gray-50 border border-gray-300 rounded-lg text-sm text-gray-900 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all" 
                            />
                        </div>
                        <div>
                            <label className="flex items-center gap-1.5 text-xs font-bold text-gray-500 uppercase mb-1.5">
                                <MapPin size={12} /> Outlet
                            </label>
                            <select 
                                value={historyForm.outlet_id} 
                                onChange={(e) => setHistoryForm({...historyForm, outlet_id: e.target.value})} 
                                className="w-full p-2.5 bg-gray-50 border border-gray-300 rounded-lg text-sm text-gray-900 focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                            >
                                <option value="">Select Outlet...</option>
                                {OUTLETS.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
                            </select>
                        </div>
                    </div>

                    {/* Section: Service/Treatment */}
                    <div>
                        <label className="flex items-center gap-1.5 text-xs font-bold text-gray-500 uppercase mb-1.5">
                            <FileText size={12} /> {historyEditItem.eventType === 'package_purchase' ? 'Package Name' : 'Treatment'}
                        </label>
                        {historyEditItem.eventType === 'visit' ? (
                            <select 
                                value={historyForm.treatment} 
                                onChange={(e) => setHistoryForm({...historyForm, treatment: e.target.value})} 
                                className="w-full p-2.5 bg-gray-50 border border-gray-300 rounded-lg text-sm text-gray-900 focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                            >
                                <option value="">Select Service...</option>
                                {treatments.map(t => <option key={t.id} value={t.name}>{t.name}</option>)}
                                {historyForm.treatment && !treatments.find(t => t.name === historyForm.treatment) && (
                                    <option value={historyForm.treatment}>{historyForm.treatment}</option>
                                )}
                            </select>
                        ) : (
                            <input 
                                type="text" 
                                value={historyForm.treatment} 
                                onChange={(e) => setHistoryForm({...historyForm, treatment: e.target.value})} 
                                className="w-full p-2.5 bg-gray-50 border border-gray-300 rounded-lg text-sm text-gray-900 focus:ring-2 focus:ring-blue-500 outline-none transition-all" 
                            />
                        )}
                    </div>

                    {/* Section: Financials & Hours (Grid) */}
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="flex items-center gap-1.5 text-xs font-bold text-gray-500 uppercase mb-1.5">
                                <IndianRupee size={12} /> Amount
                            </label>
                            <input 
                                type="number" 
                                value={historyForm.amount} 
                                onChange={(e) => setHistoryForm({...historyForm, amount: e.target.value})} 
                                className="w-full p-2.5 bg-gray-50 border border-gray-300 rounded-lg text-sm text-gray-900 focus:ring-2 focus:ring-blue-500 outline-none font-medium" 
                            />
                        </div>
                        
                        {/* SPLIT HR/MIN INPUTS */}
                        <div>
                            <label className="flex items-center gap-1.5 text-xs font-bold text-gray-500 uppercase mb-1.5">
                                <Clock size={12} /> Duration
                            </label>
                            <div className="flex gap-2">
                                <div className="relative w-full">
                                    <input 
                                        type="number" 
                                        placeholder="Hr"
                                        value={historyForm.hours_h} 
                                        onChange={(e) => setHistoryForm({...historyForm, hours_h: e.target.value})} 
                                        className="w-full p-2.5 bg-gray-50 border border-gray-300 rounded-lg text-sm text-gray-900 focus:ring-2 focus:ring-blue-500 outline-none font-medium text-center" 
                                    />
                                    <span className="absolute right-2 top-2.5 text-xs text-gray-400 font-bold pointer-events-none">H</span>
                                </div>
                                <div className="relative w-full">
                                    <input 
                                        type="number" 
                                        placeholder="Min"
                                        value={historyForm.hours_m} 
                                        onChange={(e) => setHistoryForm({...historyForm, hours_m: e.target.value})} 
                                        className="w-full p-2.5 bg-gray-50 border border-gray-300 rounded-lg text-sm text-gray-900 focus:ring-2 focus:ring-blue-500 outline-none font-medium text-center" 
                                    />
                                    <span className="absolute right-2 top-2.5 text-xs text-gray-400 font-bold pointer-events-none">M</span>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Section: Staff (UPDATED: Dropdown) */}
                    <div>
                        <label className="flex items-center gap-1.5 text-xs font-bold text-gray-500 uppercase mb-1.5">
                            <Users size={12} /> {historyEditItem.eventType === 'package_purchase' ? 'Sold By' : 'Therapist'}
                        </label>
                        <select 
                            value={historyForm.therapist} 
                            onChange={(e) => setHistoryForm({...historyForm, therapist: e.target.value})} 
                            className="w-full p-2.5 bg-gray-50 border border-gray-300 rounded-lg text-sm text-gray-900 focus:ring-2 focus:ring-blue-500 outline-none transition-all appearance-none"
                        >
                            <option value="">Select Employee...</option>
                            {employees.map(emp => (
                                <option key={emp.id} value={emp.name}>{emp.name}</option>
                            ))}
                            {/* Fallback if current value is not in active employees list */}
                            {historyForm.therapist && !employees.find(e => e.name === historyForm.therapist) && (
                                <option value={historyForm.therapist}>{historyForm.therapist}</option>
                            )}
                        </select>
                    </div>
                    
                    {/* Security Section */}
                    <div className="pt-4 border-t border-gray-100 mt-2">
                        <label className="block text-xs font-bold text-red-500 uppercase mb-2">Admin Security</label>
                        <input 
                            type="password" 
                            value={historyEditPassword} 
                            onChange={(e) => setHistoryEditPassword(e.target.value)} 
                            className="w-full p-3 border-2 border-red-100 bg-red-50/50 rounded-lg text-sm focus:border-red-400 focus:ring-0 outline-none transition-all placeholder:text-red-300 text-red-900" 
                            placeholder="Enter Admin Password to Save" 
                        />
                    </div>

                    {/* Actions */}
                    <div className="flex gap-3 pt-2">
                        <button 
                            onClick={() => setIsHistoryEditOpen(false)} 
                            className="flex-1 py-3 bg-gray-100 hover:bg-gray-200 rounded-lg text-sm font-bold text-gray-600 transition-colors"
                        >
                            Cancel
                        </button>
                        <button 
                            onClick={handleSaveHistoryEdit} 
                            disabled={isSavingHistory} 
                            className="flex-1 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-bold flex justify-center gap-2 transition-colors shadow-lg shadow-blue-200"
                        >
                            {isSavingHistory ? <Loader2 className="animate-spin" size={18} /> : 'Save Changes'}
                        </button>
                    </div>
                </div>
            </div>
        </div>
      )}
    </div>
  );
}