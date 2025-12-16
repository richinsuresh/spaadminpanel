// src/app/(protected)/dashboard/search/page.tsx
'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { exportToExcel } from '@/lib/exportToExcel';
import { Search, Loader2, FileText, ExternalLink, ChevronDown, ChevronUp } from 'lucide-react';
import Link from 'next/link'; // <-- IMPORTANT: Link imported

/**
 * 🎯 Goal: Client Search Page with Visual Progress Bar
 *
 * - Groups data by client (mobile).
 * - Shows Client Name, latest Package, Remaining Hours, and Expiry.
 * - FIX: Restores navigation via <Link> while keeping history toggle via button.
 */

/* ---------------- types ---------------- */
// HistoryRow remains the source data structure for individual visits
type HistoryRow = {
  id: string;
  date: string | null;
  name: string | null;
  mobile: string | null;
  treatment: string | null;
  session_hours: number | null;
  amount_paid: number | null;
  took_package: boolean | null; 
  package_amount: number | null; 
  check_in_time: string | null;
  check_out_time: string | null;
  therapist_name: string | null;
  outlet_name: string | null;

  used_hours?: number | null;
  remaining_hours?: number | null;
  expiry_date?: string | null;
  start_date?: string | null;
  status?: string | null; // <-- Included for pkg status display
  package_name?: string | null;

  is_package_customer?: boolean | null;

  _raw?: any;
  _raw_pkg?: any;
  [k: string]: any;
};

// Updated type for the grouped client summary list
type ClientSummary = {
  mobile: string;
  name: string;
  latestVisitDate: string | null;

  // Latest Package Info
  latestPackageName: string;
  remaining_hours: number | null;
  used_hours: number | null; 
  total_hours: number | null; 
  expiry_date: string | null;
  package_status: string | null;

  history: HistoryRow[];
};

type OutletRow = { id: string; name: string };
type EmployeeRow = { id: string; name: string; is_active?: boolean };

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

/* ---------------- DB helpers ---------------- */
const toNum = (v: any) => (v === undefined || v === null || v === '' ? null : (Number.isFinite(Number(v)) ? Number(v) : null));

const normalizeCustomerRow = (r: any): HistoryRow => {
  const maybeStr = (v: any) => (v === undefined || v === null ? null : String(v));
  return {
    id: String(r.id ?? r._id ?? ''),
    date: maybeStr(r.date ?? r.visit_date ?? r.created_at ?? null),
    name: maybeStr(r.name ?? r.customer_name ?? null),
    mobile: maybeStr(r.mobile ?? r.phone ?? r.customer_mobile ?? null),
    treatment: maybeStr(r.treatment ?? r.service ?? null),
    session_hours: toNum(r.session_hours ?? r.sessionHours ?? null),
    amount_paid: toNum(r.amount_paid ?? r.amountPaid ?? null),
    took_package: !!(r.took_package ?? r.tookPackage ?? r.tookPackage),
    package_amount: toNum(r.package_amount ?? r.packageAmount ?? null),
    check_in_time: maybeStr(r.check_in_time ?? r.checkInTime ?? r.check_in ?? null),
    check_out_time: maybeStr(r.check_out_time ?? r.checkOutTime ?? r.check_out ?? null),
    therapist_name: maybeStr(r.therapist_name ?? r.therapist ?? null),
    outlet_name: maybeStr(r.outlet_name ?? r.outlet ?? null),
    is_package_customer: !!(r.is_package_customer ?? r.isPackageCustomer ?? r.package_redeemed ?? false),
    _raw: r,
  };
};

const pickBestPackage = (pkgs: any[]) => {
  if (!pkgs || pkgs.length === 0) return null;
  // Prioritize an 'active' package
  const active = pkgs.find((p) => String((p.status ?? '')).toLowerCase() === 'active');
  if (active) return active;
  // Otherwise, pick the one with the latest expiry date
  const sorted = pkgs.slice().sort((a, b) => {
    const ta = a.expiry_date ? new Date(a.expiry_date).getTime() : a.created_at ? new Date(a.created_at).getTime() : 0;
    const tb = b.expiry_date ? new Date(b.expiry_date).getTime() : b.created_at ? new Date(b.created_at).getTime() : 0;
    return tb - ta; // latest one first
  });
  return sorted[0] ?? pkgs[0];
};

/* ---------------- Progress Bar Component ---------------- */
const PackageProgressBar = ({ used, total }: { used: number | null, total: number | null }) => {
    const toNum = (val: any) => (val !== null && val !== undefined && Number.isFinite(Number(val)) ? Number(val) : 0);
    const totalNum = toNum(total);
    const usedNum = toNum(used);

    if (totalNum <= 0) return null; 

    const pct = Math.round((usedNum / totalNum) * 100);
    const barColor = pct < 80 ? 'bg-indigo-600' : 'bg-red-600';

    return (
        <div className="mt-1">
            <div className="flex items-center justify-between mb-1">
                <div className="text-xs text-black/60">Hours Used</div>
                <div className="text-xs text-black/80">
                    <span className="font-semibold">{usedNum}h</span> used / <span className="font-semibold">{totalNum}h</span> total
                </div>
            </div>

            <div className="w-full bg-gray-200 h-2 rounded-full overflow-hidden">
                <div className={`h-2 ${barColor}`} style={{ width: `${Math.max(0, Math.min(100, pct))}%` }} />
            </div>
        </div>
    );
};


/* ---------------- Main Component ---------------- */
export default function ClientSearchPage() {
  const [rows, setRows] = useState<HistoryRow[]>([]); // Full history of all visits
  const [summaries, setSummaries] = useState<ClientSummary[]>([]); // Grouped list for display
  const [filteredSummaries, setFilteredSummaries] = useState<ClientSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [outlets, setOutlets] = useState<OutletRow[]>([]);
  const [outletFilter, setOutletFilter] = useState<string>('all');
  const [employees, setEmployees] = useState<EmployeeRow[]>([]);
  const [therapistFilter, setTherapistFilter] = useState<string>('all');
  const [isExporting, setIsExporting] = useState(false);
  const [expandedMobile, setExpandedMobile] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);

  const fetchMeta = useCallback(async () => {
    try {
      const { data: outData } = await supabase.from('outlets').select('id, name');
      setOutlets(Array.isArray(outData) ? outData : []);
    } catch (e) { console.warn('Outlets fetch failed', e); }
    try {
      const { data: empData } = await supabase.from('employees').select('id, name, is_active').eq('is_active', true);
      setEmployees(Array.isArray(empData) ? empData : []);
    } catch (e) { console.warn('Employees fetch failed', e); }
  }, []);

  const fetchHistoryAndSummarize = useCallback(async () => {
    setLoading(true);
    setWarning(null);
    try {
      // 1. Fetch ALL Customer Visits (History)
      const { data: custData, error: custErr } = await supabase.from('customers').select('*').order('date', { ascending: false }).limit(1000);
      if (custErr) {
        console.error('Customers fetch error:', JSON.stringify(custErr, Object.getOwnPropertyNames(custErr)));
        setWarning('Could not load customers — check console.');
        setRows([]); setSummaries([]); setLoading(false);
        return;
      }
      const customers = Array.isArray(custData) ? custData.map(normalizeCustomerRow) : [];

      // 2. Fetch Packages for all unique mobiles
      const mobiles = Array.from(new Set(customers.map((c) => (c.mobile ?? '').trim()).filter(Boolean)));
      let packageMap: Record<string, any> = {};

      if (mobiles.length > 0) {
        try {
          // FIX: Changed .select('*') to specify fields, and the essential .in() for array matching
          const { data: pkgData } = await supabase.from('packages').select(`*, package_name, total_hours, used_hours, expiry_date, status`).in('mobile', mobiles);
          
          if (Array.isArray(pkgData)) {
            const grouped: Record<string, any[]> = {};
            pkgData.forEach((p: any) => {
              const m = (p.mobile ?? '').toString().trim();
              if (!m) return;
              grouped[m] = grouped[m] || [];
              grouped[m].push(p);
            });
            Object.keys(grouped).forEach((m) => {
              packageMap[m] = pickBestPackage(grouped[m]); // Pick the best/latest package
            });
          }
        } catch (pkgEx) { console.warn('Package enrichment error', pkgEx); }
      }

      // 3. Group and Create Summaries
      const groupedData: Record<string, { history: HistoryRow[]; name: string; latestVisitDate: string | null; }> = {};

      customers.forEach((c) => {
        const mobileKey = (c.mobile ?? '').trim();
        if (!mobileKey) return;

        groupedData[mobileKey] = groupedData[mobileKey] || { history: [], name: c.name || 'Unknown Client', latestVisitDate: null };
        groupedData[mobileKey].history.push(c);

        // Update name and latest visit date
        if (c.name) groupedData[mobileKey].name = c.name;
        if (c.date) {
            if (!groupedData[mobileKey].latestVisitDate || new Date(c.date) > new Date(groupedData[mobileKey].latestVisitDate!)) {
                groupedData[mobileKey].latestVisitDate = c.date;
            }
        }
      });

      const clientSummaries: ClientSummary[] = Object.keys(groupedData).map((mobile) => {
        const client = groupedData[mobile];
        const pkg = packageMap[mobile] ?? null;

        // Apply package details for the summary
        
        // Use fallbacks for pkg properties
        const used = pkg ? (pkg.used_hours ?? pkg.usedHours ?? null) : null;
        const total = pkg ? (pkg.total_hours ?? pkg.totalHours ?? pkg.totalPackageHours ?? pkg.total ?? null) : null;
        const expiry = pkg ? (pkg.expiry_date ?? pkg.expiryDate ?? pkg.expiry ?? null) : null;
        const status = pkg ? (pkg.status ?? pkg.package_status ?? null) : null;
        const pkgName = pkg ? (pkg.package_name ?? pkg.name ?? pkg.treatment ?? 'N/A') : 'None';

        // --- FIX: Client-side calculation logic ---
        const usedNum = used !== undefined && used !== null && Number.isFinite(Number(used)) ? Number(used) : 0;
        const totalNum = total !== undefined && total !== null && Number.isFinite(Number(total)) ? Number(total) : 0;
        const calculatedRemaining = Math.max(0, totalNum - usedNum);
        // ------------------------------------------

        // Sort history by date descending (latest first)
        client.history.sort((a, b) => {
            const dateA = a.date ? new Date(a.date).getTime() : 0;
            const dateB = b.date ? new Date(b.date).getTime() : 0;
            return dateB - dateA;
        });

        // Ensure hours are treated as numbers
        // We use the calculated remaining hours if total > 0
        const finalRemaining = totalNum > 0 ? calculatedRemaining : null;

        return {
          mobile: mobile,
          name: client.name,
          latestVisitDate: client.latestVisitDate,
          latestPackageName: pkgName,
          remaining_hours: finalRemaining,
          used_hours: usedNum,
          total_hours: totalNum,
          expiry_date: expiry ? String(expiry) : null,
          package_status: status ? String(status) : null,
          history: client.history,
        };
      });

      // Sort summaries by latest visit date descending
      clientSummaries.sort((a, b) => {
          const dateA = a.latestVisitDate ? new Date(a.latestVisitDate).getTime() : 0;
          const dateB = b.latestVisitDate ? new Date(b.latestVisitDate).getTime() : 0;
          return dateB - dateA;
      });

      setRows(customers); // Keep full history
      setSummaries(clientSummaries);
    } catch (e) {
      console.error('fetchHistoryAndSummarize unexpected error:', e);
      setWarning('Unexpected error loading history — check console.');
      setRows([]); setSummaries([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchMeta();
    fetchHistoryAndSummarize().catch((e) => console.warn(e));
  }, [fetchMeta, fetchHistoryAndSummarize]);

  // Filtering logic (kept the same)
  useEffect(() => {
    const lower = (search || '').trim().toLowerCase();
    setFilteredSummaries(
      summaries.filter((s) => {
        const matches =
          (s.name ?? '').toLowerCase().includes(lower) ||
          (s.mobile ?? '').toLowerCase().includes(lower) ||
          (s.latestPackageName ?? '').toLowerCase().includes(lower) ||
          s.history.some(
            (h) =>
              (h.treatment ?? '').toLowerCase().includes(lower) ||
              (h.therapist_name ?? '').toLowerCase().includes(lower) ||
              (h.outlet_name ?? '').toLowerCase().includes(lower)
          );

        if (!matches) return false;

        if (outletFilter && outletFilter !== 'all') {
          if (!s.history.some((h) => h.outlet_name?.toLowerCase() === outletFilter.toLowerCase())) return false;
        }
        if (therapistFilter && therapistFilter !== 'all') {
          if (!s.history.some((h) => h.therapist_name?.toLowerCase() === therapistFilter.toLowerCase())) return false;
        }
        return true;
      })
    );
  }, [summaries, search, outletFilter, therapistFilter]);

  const handleExport = async () => {
    // Export logic (kept the same)
    setIsExporting(true);
    try {
      const filteredMobiles = new Set(filteredSummaries.map(s => s.mobile));
      const dataToExport = rows.filter(r => filteredMobiles.has((r.mobile ?? '').trim())).map((r) => ({
        'Client Name': r.name ?? '-',
        'Mobile': r.mobile ?? '-',
        'Service': r.treatment ?? '-',
        'Date': fmtDate(r.date),
        'Time In': fmtTime(r.check_in_time),
        'Time Out': fmtTime(r.check_out_time),
        'Duration': fmtDuration(r.session_hours),
        'Outlet': r.outlet_name ?? '-',
        'Therapist': r.therapist_name ?? '-',
        'Redeemed Package': r.is_package_customer ? 'Yes' : 'No',
        'Amount Paid': r.amount_paid ? (r.amount_paid / 100) : '—',
      }));

      if (dataToExport.length === 0) {
        alert('No data to export');
        setIsExporting(false);
        return;
      }
      exportToExcel(dataToExport, `ClientHistorySummary_${new Date().toISOString().split('T')[0]}.xlsx`);
    } catch (e) {
      console.error('Export failed', e);
      alert('Export failed — check console');
    } finally {
      setIsExporting(false);
    }
  };

  const toggleExpand = (mobile: string) => setExpandedMobile((prev) => (prev === mobile ? null : mobile));
  const list = useMemo(() => filteredSummaries, [filteredSummaries]);

  return (
    <div className="p-6 bg-gray-50 min-h-screen">
      {/* Header & Controls (kept the same) */}
      <div className="mb-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-black">Client Search</h1>
          <p className="text-sm text-black/60">Search clients and view their latest package details and full history.</p>
          {warning && <div className="mt-2 text-xs text-yellow-800 bg-yellow-50 p-2 rounded text-black">{warning}</div>}
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500 h-5 w-5" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search name, mobile, package, service…"
              className="pl-12 pr-4 py-3 w-96 rounded-2xl border border-gray-200 bg-white text-black placeholder:text-gray-400 shadow-sm focus:border-indigo-400 focus:ring-1 focus:ring-indigo-100 outline-none"
            />
          </div>

          <select value={outletFilter} onChange={(e) => setOutletFilter(e.target.value)} className="px-3 py-2 border rounded-lg bg-white text-black">
            <option value="all">All Outlets</option>
            {outlets.map((o) => <option key={o.id} value={o.name}>{o.name}</option>)}
          </select>

          <select value={therapistFilter} onChange={(e) => setTherapistFilter(e.target.value)} className="px-3 py-2 border rounded-lg bg-white text-black">
            <option value="all">All Therapists</option>
            {employees.map((emp) => <option key={emp.id} value={emp.name}>{emp.name}</option>)}
          </select>

          <button onClick={() => { setOutletFilter('all'); setTherapistFilter('all'); setSearch(''); }} className="px-3 py-2 bg-gray-100 text-black rounded-lg">Reset Filters</button>

          <button onClick={() => fetchHistoryAndSummarize().catch((e) => console.warn(e))} className="px-3 py-2 bg-blue-600 text-white rounded-lg flex items-center gap-2">
            <Loader2 className="h-4 w-4" /> Refresh
          </button>

          <button onClick={handleExport} disabled={isExporting || loading || list.length === 0} className="px-3 py-2 bg-green-600 text-white rounded-lg flex items-center gap-2">
            {isExporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText size={16} />} Export Filtered History
          </button>
        </div>
      </div>

      {/* List of Clients (Summary) */}
      <div className="bg-white border rounded-lg shadow-sm divide-y">
        {loading ? (
          Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="p-4 animate-pulse flex items-center gap-4">
              <div className="w-12 h-12 rounded-lg bg-gray-200" />
              <div className="flex-1 space-y-2">
                <div className="h-3 bg-gray-200 w-1/4" />
                <div className="h-3 bg-gray-200 w-2/3" />
              </div>
              <div className="w-24 h-6 bg-gray-200 rounded" />
            </div>
          ))
        ) : list.length === 0 ? (
          <div className="p-6 text-center text-black">No clients found matching the search/filters.</div>
        ) : (
          list.map((s) => {
            const isExpired = s.expiry_date ? new Date(s.expiry_date) < new Date() : false;
            const isExpanded = expandedMobile === s.mobile;
            const history = s.history;

            return (
              <div key={s.mobile} className="group">
                {/* Client Summary Row (Clickable) */}
                <Link // <-- FIX: Replaced div with Link for navigation
                  href={`/dashboard/customers/${s.mobile}`}
                  className={`p-4 flex items-start gap-4 hover:bg-gray-50 transition-colors ${isExpanded ? 'bg-gray-50' : ''}`}
                  onClick={(e) => {
                    // Prevent navigation when the toggle button is clicked (handleToggle is below)
                    // If the user clicks anywhere *outside* the toggle button, it navigates.
                    // If the user clicks the toggle button, we prevent default action and let the button handler take over.
                    const target = e.target as HTMLElement;
                    if (target.closest('.toggle-history')) {
                      e.preventDefault();
                    }
                  }}
                >
                  {/* Avatar */}
                  <div className="w-12 shrink-0 pt-1">
                    <div className="w-12 h-12 rounded-lg bg-indigo-50 flex items-center justify-center text-indigo-700 font-semibold text-lg">
                      {initials(s.name)}
                    </div>
                  </div>

                  {/* Client Info & Package */}
                  <div className="flex-1 min-w-0">
                    <div className="text-lg font-semibold text-black truncate">{s.name ?? '—'}</div>
                    <div className="mt-1 text-sm text-black/70 truncate">{s.mobile ?? '—'}</div>
                    
                    <div className="mt-2 text-xs flex items-center gap-2">
                        <span className="font-medium text-black/80">Package:</span>
                        <span className="text-black/80">{s.latestPackageName}</span>
                        {s.package_status && (
                            <span className={`text-xs px-2 py-0.5 rounded-full ${s.package_status === 'active' ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-black'}`}>
                                {String(s.package_status).toUpperCase()}
                            </span>
                        )}
                    </div>

                    {/* NEW: Progress Bar */}
                    {s.total_hours !== null && s.total_hours > 0 && (
                        <PackageProgressBar used={s.used_hours} total={s.total_hours} />
                    )}
                  </div>

                  {/* Remaining Hours & Expiry */}
                  <div className="flex flex-col items-end shrink-0 w-32 md:w-40 pt-1">
                    <div className="text-xs text-black/60">Remaining</div>
                    <div className={`text-2xl font-bold ${isExpired ? 'text-red-600' : 'text-black'}`}>{s.remaining_hours !== null ? `${s.remaining_hours}h` : '—'}</div>
                    <div className="text-xs text-black/60 mt-1">Expiry Date</div>
                    <div className={`text-sm font-medium ${isExpired ? 'text-red-600' : 'text-black'}`}>{fmtDate(s.expiry_date ?? null)}</div>
                  </div>

                  {/* Toggle Icon */}
                  <div className="shrink-0 pl-4 pt-4">
                    <button
                      className="toggle-history p-1 rounded-full hover:bg-gray-200 transition-colors"
                      onClick={(e) => {
                        e.stopPropagation(); // Stop the click from propagating to the parent Link
                        toggleExpand(s.mobile);
                      }}
                      title={isExpanded ? "Collapse History" : "Expand History"}
                    >
                      {isExpanded ? <ChevronUp className="h-5 w-5 text-gray-500" /> : <ChevronDown className="h-5 w-5 text-gray-500" />}
                    </button>
                  </div>
                </Link>

                {/* Expanded Client History (kept the same) */}
                {isExpanded && (
                    <div className="p-4 pt-0 bg-white border-t border-gray-100">
                        <h4 className="text-md font-semibold text-black mb-3">Client History ({history.length} visits)</h4>
                        <div className="overflow-x-auto">
                            <table className="min-w-full divide-y divide-gray-200">
                                <thead className="bg-gray-50">
                                    <tr>
                                        <th className="px-4 py-2 text-left text-xs font-medium text-black/60">Date & Time</th>
                                        <th className="px-4 py-2 text-left text-xs font-medium text-black/60">Service Taken</th>
                                        <th className="px-4 py-2 text-left text-xs font-medium text-black/60">Duration</th>
                                        <th className="px-4 py-2 text-left text-xs font-medium text-black/60">Therapist</th>
                                        <th className="px-4 py-2 text-left text-xs font-medium text-black/60">Outlet</th>
                                        <th className="px-4 py-2 text-right text-xs font-medium text-black/60">Sale Link</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-200 text-sm">
                                    {history.map((h, index) => (
                                        <tr key={h.id || `${h.mobile}-${index}`} className={h.is_package_customer ? 'bg-indigo-50/50' : 'hover:bg-gray-50'}>
                                            <td className="px-4 py-3 whitespace-nowrap">
                                                <div className="font-medium text-black">{fmtDate(h.date)}</div>
                                                <div className="text-xs text-black/60">{fmtTime(h.check_in_time)}</div>
                                            </td>
                                            <td className="px-4 py-3 text-black">
                                                {h.treatment}
                                                {h.is_package_customer && <span className="ml-2 text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded-full">Redeemed</span>}
                                            </td>
                                            <td className="px-4 py-3 whitespace-nowrap text-black">{fmtDuration(h.session_hours)}</td>
                                            <td className="px-4 py-3 whitespace-nowrap text-black">{h.therapist_name ?? '—'}</td>
                                            <td className="px-4 py-3 whitespace-nowrap text-black">{h.outlet_name ?? '—'}</td>
                                            <td className="px-4 py-3 whitespace-nowrap text-right">
                                                <a href={`/sales/${h.id}`} target="_blank" rel="noreferrer" className="text-blue-600 hover:text-blue-800 text-xs flex items-center justify-end gap-1">
                                                    View <ExternalLink className="h-3 w-3" />
                                                </a>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}