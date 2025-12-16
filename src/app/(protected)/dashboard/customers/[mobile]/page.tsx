// src/app/(protected)/dashboard/customers/[mobile]/page.tsx
'use client'; 

import React, { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { Loader2, Calendar, Clock, Tag, MapPin, User, FileText, Gift, Edit, Trash, ChevronDown, ChevronUp, AlertTriangle, Package, Users } from 'lucide-react';
import Link from 'next/link';
import { useRouter, usePathname } from 'next/navigation'; 

/* ---------------- types ---------------- */
type HistoryRow = {
  id: string; date: string | null; name: string | null; mobile: string | null; treatment: string | null;
  session_hours: number | null; amount_paid: number | null; took_package: boolean | null;
  package_amount: number | null; check_in_time: string | null; check_out_time: string | null;
  therapist_name: string | null; outlet_name: string | null;
  status?: string | null; package_status?: string | null; 
  used_hours?: number | null; remaining_hours?: number | null; expiry_date?: string | null;
  start_date?: string | null; package_name?: string | null; is_package_customer?: boolean | null;
  _raw?: any; _raw_pkg?: any; [k: string]: any; eventType: 'visit' | 'package_purchase' | 'client_edit' | 'package_edit' | 'other_activity'; 
  user_name?: string | null; related_table?: string | null;
};
type PackagePurchaseEvent = HistoryRow & { eventType: 'package_purchase' };
type ActivityLogEvent = HistoryRow & { eventType: 'client_edit' | 'package_edit' | 'other_activity' };
type ClientHistoryEvent = HistoryRow | PackagePurchaseEvent | ActivityLogEvent; 
type ClientSummary = {
  mobile: string; name: string; latestVisitDate: string | null;
  latestPackageName: string; remaining_hours: number | null; used_hours: number | null; 
  total_hours: number | null; expiry_date: string | null; package_status: string | null;
  history: ClientHistoryEvent[]; profileData?: any; 
};

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
  return d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });
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
const initials = (name?: string | null) =>
  (name || '')
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => s[0]?.toUpperCase() ?? '')
    .join('') || '?';
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
    outlet_name: maybeStr(r.outlet_name ?? r.outlet ?? null), is_package_customer: !!(r.is_package_customer ?? r.isPackageCustomer ?? r.package_redeemed ?? false),
    status: maybeStr(r.status ?? null), _raw: r, eventType: 'visit',
  };
};

/* ---------------- Main Component ---------------- */
export default function ClientDetailPage({ params }: { params: { mobile: string } }) {
  
  const router = useRouter();
  const pathname = usePathname(); 
  
  const segments = pathname.split('/');
  const mobile = segments[segments.length - 1]; 
  
  const [summary, setSummary] = useState<ClientSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [warning, setWarning] = useState<string | null>(null);
  const [expandedHistory, setExpandedHistory] = useState<string[]>([]);
  const [isHistoryExpanded, setIsHistoryExpanded] = useState(false);

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
      // 1. Fetch Client Profile (to get latest name, etc.)
      const { data: profileData } = await supabase.from('customers').select('name').eq('mobile', mobile).order('date', { ascending: false }).limit(1).single();
      
      // 2. Fetch All Visits (History)
      const { data: custData } = await supabase.from('customers').select('*').eq('mobile', mobile).order('date', { ascending: false }).limit(500);
      const visits = Array.isArray(custData) ? custData.map(normalizeCustomerRow) : [];

      // 3. Fetch All Packages (Hardened Query for Hours/Status/Name)
      let packageMap: Record<string, any> = {};
      let packagePurchases: PackagePurchaseEvent[] = [];
      
      // FIX 1: Explicitly listing ALL possible column names for hours/status/name to ensure data retrieval
      const { data: pkgData } = await supabase.from('packages')
          .select(`id, mobile, created_at, expiry_date, outlet_name, employee_name, 
                   status, package_name, 
                   total_hours, totalHours, totalPackageHours, 
                   used_hours, consumed_hours, usedHours, 
                   amount, package_amount`) 
          .eq('mobile', mobile);

      // Helper function to simplify Array.isArray check
      function ArrayOf(data: any): data is any[] { return Array.isArray(data); }

      if (ArrayOf(pkgData)) { 
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
        })) as PackagePurchaseEvent[];
      }
      
      // 3b. Fetch Activity Logs (Edits)
      let activityLogs: ActivityLogEvent[] = [];
      try {
          // FIX 2: Broaden the activity query (fetch all, filter client-side)
          // Fetching *all* logs is expensive; ensure your database query is optimized if performance suffers.
          const { data: activityData } = await supabase.from('activity')
              .select(`id, created_at, table, op, payload, user_name, outlet_name, related_mobile`); 
          
          if (ArrayOf(activityData)) { 
              activityLogs = activityData
                  // Client-side filtering for the specific mobile number
                  .filter(a => String(a.related_mobile ?? a.payload?.mobile ?? '').trim() === mobile)
                  .map((a: any) => {
                      const op = String(a.op ?? 'edit');
                      const table = String(a.table ?? 'unknown');
                      let treatment = '';
                      let eventType: ActivityLogEvent['eventType'] = 'other_activity';

                      if (table === 'customers') { treatment = `Client Profile ${op.toUpperCase()}`; eventType = 'client_edit'; } 
                      else if (table === 'packages') { treatment = `Package ${op.toUpperCase()}`; eventType = 'package_edit'; } 
                      else if (table === 'sales') { treatment = `Sale/Visit ${op.toUpperCase()}`; eventType = 'client_edit'; } 
                      
                      return {
                          id: String(a.id ?? a.op_uuid ?? a.created_at), date: String(a.created_at ?? null),
                          name: profileData?.name || visits[0]?.name || 'Unknown Client', mobile: mobile,
                          eventType: eventType, treatment: treatment, session_hours: null, amount_paid: null,
                          took_package: false, package_amount: null,
                          user_name: String(a.user_name ?? 'System/Admin'), related_table: table,
                          therapist_name: null, outlet_name: String(a.outlet_name ?? null),
                          check_in_time: String(a.created_at ?? null), check_out_time: null,
                          is_package_customer: false, _raw: a,
                      } as ActivityLogEvent;
                  });
          }
      } catch (activityEx) { console.warn('Activity fetch error', activityEx); }


      // 4. Combine History
      const combinedHistory: ClientHistoryEvent[] = [...visits, ...packagePurchases, ...activityLogs];
      combinedHistory.sort((a, b) => {
          const dateA = a.date ? new Date(a.date).getTime() : 0;
          const dateB = b.date ? new Date(b.date).getTime() : 0;
          return dateB - dateA;
      });

      // 5. Create Summary
      const pkg = packageMap[mobile];
      
      // Calculate total hours using all fallback columns
      const total = pkg ? (pkg.total_hours ?? pkg.totalHours ?? pkg.totalPackageHours ?? pkg.total ?? null) : null;
      const totalNum = total !== undefined && total !== null && Number.isFinite(Number(total)) ? Number(total) : 0;

      // Calculate consumed hours by summing all redeemed visits
      const consumedFromVisits = visits
          .filter(v => v.is_package_customer)
          .reduce((sum, v) => sum + (v.session_hours || 0), 0);
          
      // Use the max of the database's reported consumed hours OR the hours calculated from visits.
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
    } catch (error: any) {
      console.error('Error fetching client data:', error);
      setWarning('Failed to load client history. Check console for details. (Likely a Postgrest network error or schema mismatch).');
      setSummary(null);
    } finally {
      setLoading(false);
    }
  }, [mobile]);

  useEffect(() => {
    fetchClientData();
  }, [fetchClientData]);

  // Handle Loading/Error States
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

  // Helper for rendering history items
  const renderHistoryItem = (item: ClientHistoryEvent, isExpanded: boolean) => {
    const isVisit = item.eventType === 'visit';
    const isPurchase = item.eventType === 'package_purchase';
    const isEdit = item.eventType === 'client_edit' || item.eventType === 'package_edit' || item.eventType === 'other_activity';

    const isRedeemedVisit = isVisit && item.is_package_customer; 
    
    const bgColor = isEdit ? 'bg-yellow-50' : isRedeemedVisit ? 'bg-indigo-100/70' : isVisit ? 'bg-indigo-50' : isPurchase ? 'bg-green-50' : 'bg-gray-50';
    const icon = isEdit ? <Edit size={18} className='text-yellow-700' /> : isRedeemedVisit ? <Gift size={18} className='text-indigo-700' /> : isVisit ? <Calendar size={18} /> : isPurchase ? <Package size={18} /> : <FileText size={18} />;
    
    const title = isEdit ? item.treatment : isVisit ? item.treatment : isPurchase ? item.package_name : 'Activity Log';
    
    const employee = isEdit ? item.user_name : isPurchase ? item.therapist_name : item.therapist_name;
    
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
                    {isEdit && (
                        <span className="text-xs font-medium text-yellow-700 bg-yellow-200 px-2 py-0.5 rounded-full ml-2">{item.related_table}</span>
                    )}
                </div>
                <div className="flex items-center gap-4">
                    <span className="text-sm text-gray-600">{fmtDate(item.date)}</span>
                </div>
            </div>

            {/* Details */}
            {(isExpanded || isHistoryExpanded) && (
                <div className="mt-3 pt-3 border-t border-gray-200 grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                    
                    {/* Common Details */}
                    <DetailItem icon={MapPin} label="Outlet" value={item.outlet_name} />
                    <DetailItem icon={Users} label={isEdit ? 'User' : isPurchase ? 'Seller' : 'Therapist'} value={employee} />
                    
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
                    
                    {isEdit && (
                         <DetailItem icon={FileText} label="Table/Record" value={item.related_table} />
                    )}
                    
                    {/* Time/Date Details */}
                    {isVisit && (
                        <>
                            <DetailItem icon={Clock} label="Time In" value={timeIn} />
                            <DetailItem icon={Clock} label="Time Out" value={item.check_out_time ? fmtTime(item.check_out_time) : 'N/A'} />
                        </>
                    )}
                    
                    {(isPurchase || isEdit) && (
                        <DetailItem icon={Clock} label={isPurchase ? 'Purchase Time' : 'Log Time'} value={fmtTime(item.check_in_time)} />
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
                <div 
                    className={`h-3 ${barColor}`} 
                    style={{ width: `${Math.max(0, Math.min(100, pctUsed))}%` }} 
                />
            </div>
            <div className="flex justify-between text-xs text-gray-500">
                <span>{usedNum}h Used</span>
                <span>{remainingNum}h Remaining</span>
            </div>
        </div>
    );
};

// Simple array check helper
function ArrayOf(data: any): data is any[] {
    return Array.isArray(data);
}


  return (
    <div className="p-4 lg:p-8 bg-gray-50 min-h-screen space-y-8">
      
      {/* Header & Basic Info */}
      <div className="flex justify-between items-start border-b pb-4">
        <div>
          <h1 className="text-3xl font-bold text-gray-800 capitalize">{summary.name}</h1>
          <p className="text-gray-500 text-lg mt-1">{summary.mobile}</p>
        </div>
        <div className="flex gap-3">
          <Link href={`/dashboard/customers/edit/${mobile}`}>
            <button className="px-3 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors flex items-center gap-2">
              <Edit size={16} /> Edit Profile
            </button>
          </Link>
          {/* Placeholder for Delete button or quick action */}
          <button className="px-3 py-2 bg-red-100 text-red-600 rounded-lg hover:bg-red-200 transition-colors flex items-center gap-2">
              <Trash size={16} /> Delete
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
        
        {/* Progress Bar (if needed) */}
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
            <div className="p-6 text-center text-gray-500 bg-white rounded-lg">No visits or package purchases found for this client.</div>
        ) : (
            <div className="space-y-4">
                {summary.history.map(item => renderHistoryItem(item, expandedHistory.includes(item.id)))}
            </div>
        )}
      </div>
      
    </div>
  );
}