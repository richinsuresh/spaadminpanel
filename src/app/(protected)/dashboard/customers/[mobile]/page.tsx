'use client'; 

import React, { useCallback, useEffect, useState, use } from 'react';
import { supabase } from '@/lib/supabase';
import { 
    Loader2, Calendar, Clock, Tag, MapPin, 
    User, FileText, Gift, Edit, Trash, 
    ChevronDown, ChevronUp, AlertTriangle, 
    Package, Users, Save, History, ArrowRight
} from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation'; 
import { useActivityLog } from '@/hooks/useActivityLog';

/* ---------------- types ---------------- */
type HistoryRow = {
  id: string; date: string | null; name: string | null; mobile: string | null; treatment: string | null;
  session_hours: number | null; amount_paid: number | null; took_package: boolean | null;
  package_amount: number | null; check_in_time: string | null; check_out_time: string | null;
  therapist_name: string | null; outlet_name: string | null;
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

/* ---------------- format helpers ---------------- */
const fmtDate = (iso: string | null) => {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return 'Invalid';
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
};

// UPDATED: Forced 12-hour format with AM/PM
const fmtTime = (iso: string | null) => {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleTimeString('en-IN', { 
      hour: 'numeric', // 'numeric' allows 2:30 PM instead of 02:30 PM (cleaner)
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
const toNum = (v: any) => (v === undefined || v === null || v === '' ? null : (Number.isFinite(Number(v)) ? Number(v) : null));

// NEW: Formatter for Audit Values (Detects Dates/Times)
const fmtAuditValue = (key: string, val: any) => {
    if (val === null || val === undefined || val === '') return '—';
    const s = String(val);
    
    // Check if it looks like an ISO Date/Time (starts with YYYY-MM-DD)
    if (s.match(/^\d{4}-\d{2}-\d{2}/)) {
        const d = new Date(s);
        if (!isNaN(d.getTime())) {
            // Check if it has time component (T or :)
            if (s.includes('T') || s.includes(':')) {
                // Return Date + 12h Time
                return d.toLocaleString('en-IN', {
                    day: 'numeric', month: 'short', 
                    hour: 'numeric', minute: '2-digit', hour12: true
                }).toUpperCase();
            }
            // Just Date
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
    outlet_name: maybeStr(r.outlet_name ?? r.outlet ?? null), is_package_customer: !!(r.is_package_customer ?? r.isPackageCustomer ?? r.package_redeemed ?? false),
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

  // Edit Profile State
  const [isEditProfileOpen, setIsEditProfileOpen] = useState(false);
  const [editName, setEditName] = useState('');
  const [editMobile, setEditMobile] = useState('');
  const [editPassword, setEditPassword] = useState('');
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const [saveError, setSaveError] = useState('');

  const toggleHistoryExpand = () => setIsHistoryExpanded(!isHistoryExpanded);
  
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
      // 1. Fetch Client Profile
      const { data: profileData } = await supabase.from('customers').select('name').eq('mobile', mobile).order('date', { ascending: false }).limit(1).maybeSingle();
      
      // 2. Fetch All Visits (History)
      const { data: custData } = await supabase.from('customers').select('*').eq('mobile', mobile).order('date', { ascending: false }).limit(500);
      const visits = Array.isArray(custData) ? custData.map(normalizeCustomerRow) : [];

      // 3. Fetch All Packages
      let packageMap: Record<string, any> = {};
      let packagePurchases: HistoryRow[] = [];
      
      const { data: pkgData } = await supabase.from('packages')
          .select(`*`) 
          .eq('mobile', mobile);

      if (Array.isArray(pkgData)) { 
        const bestPkg = pickBestPackage(pkgData);
        if (bestPkg) { packageMap[mobile] = bestPkg; }

        packagePurchases = pkgData.map((p: any) => ({
            id: String(p.id ?? p.package_id ?? p.created_at), date: String(p.created_at ?? p.date ?? null),
            name: String(p.customer_name ?? p.name ?? null), mobile: String(p.mobile ?? null),
            eventType: 'package_purchase' as const, treatment: String(p.package_name ?? p.name ?? 'Package Purchase'),
            session_hours: toNum(p.total_hours ?? p.totalHours ?? p.totalPackageHours ?? null), amount_paid: toNum(p.package_amount ?? p.amount ?? null),
            package_amount: toNum(p.package_amount ?? p.amount ?? null), package_name: String(p.package_name ?? p.name ?? 'Package'),
            therapist_name: String(p.employee_name ?? p.sold_by ?? null), outlet_name: String(p.outlet_name ?? p.outlet ?? null),
            status: String(p.status ?? p.package_status ?? null), took_package: true, 
            check_in_time: String(p.created_at ?? null), check_out_time: null, is_package_customer: false, _raw: p,
        }));
      }
      
      // 3b. Fetch Activity Logs (Audit Trail)
      let auditLogs: HistoryRow[] = [];
      try {
          const { data: logData } = await supabase
            .from('activity_logs')
            .select('*')
            .ilike('description', `%${mobile}%`)
            .order('created_at', { ascending: false });

          if (Array.isArray(logData)) {
             auditLogs = logData.map(log => {
                let details = { before: {}, after: {}, remark: '' };
                try {
                    details = JSON.parse(log.description);
                } catch (e) {}

                return {
                    id: log.id,
                    date: log.created_at,
                    name: 'System Log',
                    mobile: mobile,
                    eventType: 'audit_log',
                    treatment: `Audit: ${log.action_type.replace(/_/g, ' ').toUpperCase()}`,
                    therapist_name: log.username,
                    outlet_name: 'Admin Panel',
                    check_in_time: log.created_at,
                    check_out_time: null,
                    session_hours: null, amount_paid: null, took_package: false, package_amount: null,
                    audit_details: details
                } as HistoryRow;
             });
          }
      } catch (logErr) { console.warn('Log fetch error', logErr); }


      // 4. Combine History
      const combinedHistory: HistoryRow[] = [...visits, ...packagePurchases, ...auditLogs];
      combinedHistory.sort((a, b) => {
          const dateA = a.date ? new Date(a.date).getTime() : 0;
          const dateB = b.date ? new Date(b.date).getTime() : 0;
          return dateB - dateA;
      });

      // 5. Create Summary
      const pkg = packageMap[mobile];
      const total = pkg ? (pkg.total_hours ?? pkg.totalHours ?? pkg.totalPackageHours ?? pkg.total ?? null) : null;
      const totalNum = total !== undefined && total !== null && Number.isFinite(Number(total)) ? Number(total) : 0;

      // Consumed hours logic
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
    fetchClientData();
  }, [fetchClientData]);

  // --- GLOBAL EDIT PROFILE ---
  const handleSaveProfile = async () => {
    if (editPassword !== 'admin123') {
        setSaveError('Incorrect password');
        return;
    }
    if (!editName.trim() || !editMobile.trim()) {
        setSaveError('Name and Mobile are required');
        return;
    }

    setIsSavingProfile(true);
    setSaveError('');

    try {
        const oldMobile = summary?.mobile;
        
        // 1. Update Customers Table (All records)
        const { error: custError } = await supabase
            .from('customers')
            .update({ name: editName, mobile: editMobile })
            .eq('mobile', oldMobile);
        
        if (custError) throw custError;

        // 2. Update Packages Table (All records)
        const { error: pkgError } = await supabase
            .from('packages')
            .update({ name: editName, mobile: editMobile })
            .eq('mobile', oldMobile);

        if (pkgError) throw pkgError;

        // 3. Log Activity
        await logActivity('global_client_edit', JSON.stringify({
            before: { name: summary?.name, mobile: oldMobile },
            after: { name: editName, mobile: editMobile },
            remark: 'Global profile update from Client History Page'
        }));

        // 4. Redirect if mobile changed
        if (oldMobile !== editMobile) {
            alert('Profile updated! Redirecting to new mobile number...');
            router.push(`/dashboard/customers/${editMobile}`);
        } else {
            alert('Profile name updated successfully.');
            setIsEditProfileOpen(false);
            fetchClientData();
        }

    } catch (err: any) {
        setSaveError('Update failed: ' + err.message);
    } finally {
        setIsSavingProfile(false);
    }
  };


  if (loading) {
    return (
      <div className="p-8 flex items-center justify-center min-h-[500px]">
        <Loader2 className="w-10 h-10 text-blue-600 animate-spin" />
        <p className="ml-3 text-lg text-gray-700">Loading client history...</p>
      </div>
    );
  }

  if (warning || !summary) {
    return (
      <div className="p-8 text-center bg-red-50 border-l-4 border-red-500 min-h-[500px] flex flex-col items-center justify-center">
        <AlertTriangle className="w-8 h-8 text-red-600" />
        <h1 className="text-xl font-bold text-red-800 mt-3">Error Loading Client Data</h1>
        <p className="text-red-700 mt-2">{warning || 'Client data could not be retrieved.'}</p>
        <button onClick={() => router.back()} className="mt-4 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors">
            Go Back
        </button>
      </div>
    );
  }

  // Updated Audit Diff Render (Uses 12-hour format)
  const renderAuditDiff = (before: any, after: any) => {
      if (!before || !after) return null;
      const changes = [];
      const allKeys = Array.from(new Set([...Object.keys(before), ...Object.keys(after)]));
      
      for (const key of allKeys) {
          if (['updated_at', 'created_at', 'id', 'outlet_id'].includes(key)) continue;
          
          const valBefore = before[key];
          const valAfter = after[key];

          if (String(valBefore) === String(valAfter)) continue;
          
          // Use new formatter
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
      
      if (changes.length === 0) return <div className="text-xs text-gray-400 italic">No specific field changes detected.</div>;
      
      return (
          <div className="col-span-2 md:col-span-4 mt-2 p-3 bg-white border border-orange-200 rounded-lg shadow-sm">
              <div className="text-xs font-bold text-orange-800 mb-2 uppercase tracking-wide flex items-center gap-2">
                 <Edit size={12} /> Changes Made
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-1">
                  {changes}
              </div>
          </div>
      );
  };

  const renderHistoryItem = (item: HistoryRow, isExpanded: boolean) => {
    const isVisit = item.eventType === 'visit';
    const isPurchase = item.eventType === 'package_purchase';
    const isAudit = item.eventType === 'audit_log';

    const isRedeemedVisit = isVisit && item.is_package_customer; 
    
    const bgColor = isAudit ? 'bg-orange-50' : isRedeemedVisit ? 'bg-indigo-100/70' : isVisit ? 'bg-indigo-50' : isPurchase ? 'bg-green-50' : 'bg-gray-50';
    const icon = isAudit ? <History size={18} className='text-orange-700' /> : isRedeemedVisit ? <Gift size={18} className='text-indigo-700' /> : isVisit ? <Calendar size={18} /> : isPurchase ? <Package size={18} /> : <FileText size={18} />;
    
    const title = isAudit ? item.treatment : isVisit ? item.treatment : isPurchase ? item.package_name : 'Activity Log';
    
    const employee = item.therapist_name;
    const timeIn = item.check_in_time ? fmtTime(item.check_in_time) : 'N/A';
    
    return (
        <div key={item.id} className={`${bgColor} p-4 rounded-lg shadow-sm border border-gray-200`}>
            {/* Header Row */}
            <div className="flex items-center justify-between cursor-pointer" onClick={() => setExpandedHistory(prev => prev.includes(item.id) ? prev.filter(id => id !== item.id) : [...prev, item.id])}>
                <div className="flex items-center gap-3">
                    {icon}
                    <div className="font-semibold text-gray-800">{title}</div>
                    {isRedeemedVisit && (
                        <span className="text-xs font-medium text-indigo-700 bg-indigo-200 px-2 py-0.5 rounded-full ml-2">Redeemed</span>
                    )}
                    {isPurchase && (
                        <span className="text-xs font-medium text-green-700 bg-green-200 px-2 py-0.5 rounded-full ml-2">Purchased</span>
                    )}
                    {isAudit && (
                         <span className="text-xs font-medium text-orange-700 bg-orange-200 px-2 py-0.5 rounded-full ml-2">System Log</span>
                    )}
                </div>
                <div className="flex items-center gap-4">
                    <span className="text-sm text-gray-600">{fmtDate(item.date)}</span>
                </div>
            </div>

            {/* Details */}
            {(isExpanded || isHistoryExpanded) && (
                <div className="mt-3 pt-3 border-t border-gray-200 grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                    
                    {!isAudit && <DetailItem icon={MapPin} label="Outlet" value={item.outlet_name} />}
                    <DetailItem icon={Users} label={isAudit ? 'Performed By' : isPurchase ? 'Seller' : 'Therapist'} value={employee} />
                    
                    {isVisit && (
                        <>
                            <DetailItem icon={Clock} label="Duration" value={fmtDuration(item.session_hours)} />
                            <DetailItem icon={Tag} label="Paid (₹)" value={item.amount_paid ? (item.amount_paid / 100).toFixed(0) : '—'} />
                        </>
                    )}

                    {isPurchase && (
                        <>
                            <DetailItem icon={Gift} label="Total Hours" value={item.session_hours ? `${item.session_hours}h` : '—'} />
                            <DetailItem icon={Tag} label="Amount (₹)" value={item.package_amount ? (item.package_amount / 100).toFixed(0) : '—'} />
                            <DetailItem icon={FileText} label="Status" value={item.status ? String(item.status).toUpperCase() : 'N/A'} /> 
                        </>
                    )}
                    
                    {isVisit && (
                        <>
                            <DetailItem icon={Clock} label="Time In" value={timeIn} />
                            <DetailItem icon={Clock} label="Time Out" value={item.check_out_time ? fmtTime(item.check_out_time) : 'N/A'} />
                        </>
                    )}
                    
                    {(isPurchase || isAudit) && (
                        <DetailItem icon={Clock} label="Log Time" value={fmtTime(item.check_in_time)} />
                    )}

                    {isAudit && item.audit_details && (
                        <>
                            <div className="col-span-2 md:col-span-4 mt-2 mb-1 p-2 bg-orange-100 rounded text-orange-900 italic text-xs">
                                 " {item.audit_details.remark} "
                            </div>
                            {renderAuditDiff(item.audit_details.before, item.audit_details.after)}
                        </>
                    )}
                </div>
            )}
        </div>
    );
  };
  
  const DetailItem = ({ icon: Icon, label, value }: { icon: React.ElementType, label: string, value: string | number | null | undefined }) => (
    <div className="flex flex-col">
        <div className="text-xs font-medium text-gray-500 flex items-center gap-1">
            <Icon size={12} /> {label}
        </div>
        <div className="text-sm font-semibold text-gray-800">{value ?? '—'}</div>
    </div>
  );
  
  const InfoBox = ({ label, value, isLarge = false, isHighlight = false, isAlert = false }: { label: string, value: string | number, isLarge?: boolean, isHighlight?: boolean, isAlert?: boolean }) => (
    <div className="flex flex-col p-3 border rounded-lg bg-gray-50">
        <div className="text-xs font-medium text-gray-500">{label}</div>
        <div className={`mt-1 font-bold ${isLarge ? 'text-3xl' : 'text-xl'} ${isHighlight ? 'text-green-600' : isAlert ? 'text-red-600' : 'text-gray-800'}`}>
            {value}
        </div>
    </div>
);

const ProgressBar = ({ used, total }: { used: number | null, total: number | null }) => {
    const toNum = (val: any) => (val !== null && val !== undefined && Number.isFinite(Number(val)) ? Number(val) : 0);
    const totalNum = toNum(total);
    const usedNum = toNum(used);
    const remainingNum = Math.max(0, totalNum - usedNum);
    if (totalNum <= 0) return null;
    const pctUsed = Math.round((usedNum / totalNum) * 100);
    const barColor = pctUsed < 80 ? 'bg-indigo-600' : 'bg-red-600';
    return (
        <div className="space-y-2">
            <div className="flex items-center justify-between text-sm font-medium">
                <span className="text-gray-700">Package Usage</span>
                <span className="text-gray-700">{pctUsed}% Consumed</span>
            </div>
            <div className="w-full bg-gray-200 h-3 rounded-full overflow-hidden flex">
                <div className={`h-3 ${barColor}`} style={{ width: `${Math.max(0, Math.min(100, pctUsed))}%` }} />
            </div>
            <div className="flex justify-between text-xs text-gray-500">
                <span>{usedNum}h Used</span>
                <span>{remainingNum}h Remaining</span>
            </div>
        </div>
    );
};

  return (
    <div className="p-4 lg:p-8 bg-gray-50 min-h-screen space-y-8">
      {/* Header & Basic Info */}
      <div className="flex justify-between items-start border-b pb-4">
        <div>
          <h1 className="text-3xl font-bold text-gray-800 capitalize">{summary.name}</h1>
          <p className="text-gray-500 text-lg mt-1">{summary.mobile}</p>
        </div>
        <div className="flex gap-3">
          <button 
            onClick={() => setIsEditProfileOpen(true)}
            className="px-3 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors flex items-center gap-2 font-medium"
          >
            <Edit size={16} /> Edit Profile
          </button>
        </div>
      </div>

      {/* Package Summary Card */}
      <div className="bg-white p-6 rounded-xl shadow-lg border border-gray-200">
        <h2 className="text-xl font-bold text-indigo-700 mb-4 flex items-center gap-2">
            <Package size={20} /> Latest Package Status
        </h2>
        
        <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
            <InfoBox label="Package Name" value={summary.latestPackageName} />
            <InfoBox label="Status" value={summary.package_status ? String(summary.package_status).toUpperCase() : 'N/A'} isHighlight={summary.package_status === 'active'} />
            <InfoBox label="Total Hours" value={summary.total_hours !== null ? `${summary.total_hours}h` : '—'} />
            <InfoBox label="Hours Used" value={summary.used_hours !== null ? `${summary.used_hours}h` : '—'} />
            
            <InfoBox 
                label="Hours Remaining" 
                value={summary.remaining_hours !== null ? `${summary.remaining_hours}h` : '—'} 
                isLarge={true} 
            />
            <InfoBox 
                label="Expiry Date" 
                value={fmtDate(summary.expiry_date ?? null)}
                isAlert={summary.expiry_date ? new Date(summary.expiry_date) < new Date() : false}
            />
        </div>
        
        {summary.total_hours !== null && summary.total_hours > 0 && (
            <div className="mt-6 pt-4 border-t border-gray-100">
                <ProgressBar used={summary.used_hours} total={summary.total_hours} />
            </div>
        )}
      </div>

      {/* History Timeline */}
      <div className="space-y-4">
        <div className="flex justify-between items-center">
            <h2 className="text-2xl font-bold text-gray-800">History Timeline ({summary.history.length})</h2>
            <button 
                onClick={toggleHistoryExpand}
                className="text-sm text-indigo-600 hover:text-indigo-800 flex items-center gap-1"
            >
                {isHistoryExpanded ? 'Collapse All' : 'Expand All'} {isHistoryExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
            </button>
        </div>
        
        {summary.history.length === 0 ? (
            <div className="p-6 text-center text-gray-500 bg-white rounded-lg">No visits, purchases, or logs found for this client.</div>
        ) : (
            <div className="space-y-4">
                {summary.history.map(item => renderHistoryItem(item, expandedHistory.includes(item.id)))}
            </div>
        )}
      </div>

      {/* EDIT PROFILE MODAL */}
      {isEditProfileOpen && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-md overflow-hidden">
                <div className="bg-indigo-600 p-4 text-white flex justify-between items-center">
                    <h2 className="font-bold text-lg flex items-center gap-2"><Edit size={20} /> Edit Global Profile</h2>
                    <button onClick={() => setIsEditProfileOpen(false)} className="hover:bg-indigo-700 p-1 rounded"><ChevronDown size={20} /></button>
                </div>
                
                <div className="p-6 space-y-4">
                    <div className="bg-yellow-50 border border-yellow-200 p-3 rounded text-xs text-yellow-800 mb-4">
                        <AlertTriangle className="inline w-4 h-4 mr-1" />
                        <strong>Warning:</strong> Changing these details will update <strong>ALL</strong> past sales records and packages for this client.
                    </div>

                    <div>
                        <label className="block text-sm font-bold text-gray-700 mb-1">Client Name</label>
                        <input 
                            type="text" 
                            value={editName}
                            onChange={(e) => setEditName(e.target.value)}
                            className="w-full p-2 border border-gray-300 rounded focus:ring-2 focus:ring-indigo-500 outline-none"
                        />
                    </div>
                    
                    <div>
                        <label className="block text-sm font-bold text-gray-700 mb-1">Mobile Number</label>
                        <input 
                            type="text" 
                            value={editMobile}
                            onChange={(e) => setEditMobile(e.target.value)}
                            className="w-full p-2 border border-gray-300 rounded focus:ring-2 focus:ring-indigo-500 outline-none"
                        />
                    </div>

                    <div>
                        <label className="block text-sm font-bold text-gray-700 mb-1">Admin Password</label>
                        <input 
                            type="password" 
                            value={editPassword}
                            onChange={(e) => setEditPassword(e.target.value)}
                            placeholder="Required to save"
                            className="w-full p-2 border border-gray-300 rounded focus:ring-2 focus:ring-indigo-500 outline-none"
                        />
                        {saveError && <p className="text-red-600 text-xs mt-1 font-bold">{saveError}</p>}
                    </div>

                    <div className="flex gap-3 pt-2">
                        <button 
                            onClick={() => setIsEditProfileOpen(false)}
                            className="flex-1 py-2 bg-gray-100 text-gray-700 rounded font-medium hover:bg-gray-200"
                        >
                            Cancel
                        </button>
                        <button 
                            onClick={handleSaveProfile}
                            disabled={isSavingProfile}
                            className="flex-1 py-2 bg-indigo-600 text-white rounded font-medium hover:bg-indigo-700 flex justify-center items-center gap-2"
                        >
                            {isSavingProfile ? <Loader2 className="animate-spin" size={16} /> : <Save size={16} />}
                            Save Changes
                        </button>
                    </div>
                </div>
            </div>
        </div>
      )}
      
    </div>
  );
}