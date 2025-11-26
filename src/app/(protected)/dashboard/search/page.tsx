'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { exportToExcel } from '@/lib/exportToExcel';
import { Search, Loader2, FileText, ExternalLink } from 'lucide-react';

/**
 * Alternative CRM Row UI — Remaining-at-top
 *
 * - Same data strategy as previous file (customers + packages enrichment)
 * - Each row shows Remaining hours (big) at the top-right, with Expiry below it
 * - Compact CRM rows, professional list-like layout
 * - "Redeemed" badge if this visit redeemed a package
 * - All text on white backgrounds uses black text
 *
 * Replace your page with this component file.
 */

/* ---------------- types ---------------- */
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
  status?: string | null;

  is_package_customer?: boolean | null;

  _raw?: any;
  _raw_pkg?: any;
  [k: string]: any;
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
const fmtCurrency = (paise: number | null | undefined) => {
  const n = Number(paise ?? 0);
  if (!Number.isFinite(n)) return '—';
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', minimumFractionDigits: 0 }).format(n / 100);
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
const normalizeCustomerRow = (r: any): HistoryRow => {
  const maybeStr = (v: any) => (v === undefined || v === null ? null : String(v));
  const toNum = (v: any) => (v === undefined || v === null || v === '' ? null : (Number.isFinite(Number(v)) ? Number(v) : null));
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
  const active = pkgs.find((p) => String((p.status ?? '')).toLowerCase() === 'active');
  if (active) return active;
  const sorted = pkgs.slice().sort((a, b) => {
    const ta = a.expiry_date ? new Date(a.expiry_date).getTime() : a.created_at ? new Date(a.created_at).getTime() : 0;
    const tb = b.expiry_date ? new Date(b.expiry_date).getTime() : b.created_at ? new Date(b.created_at).getTime() : 0;
    return tb - ta;
  });
  return sorted[0] ?? pkgs[0];
};

/* ---------------- Component ---------------- */
export default function ClientHistoryRemainingTop() {
  const [rows, setRows] = useState<HistoryRow[]>([]);
  const [filtered, setFiltered] = useState<HistoryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [dateFrom, setDateFrom] = useState<string | null>(null);
  const [dateTo, setDateTo] = useState<string | null>(null);
  const [outlets, setOutlets] = useState<OutletRow[]>([]);
  const [outletFilter, setOutletFilter] = useState<string>('all');
  const [employees, setEmployees] = useState<EmployeeRow[]>([]);
  const [therapistFilter, setTherapistFilter] = useState<string>('all');
  const [isExporting, setIsExporting] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);

  const fetchMeta = useCallback(async () => {
    try {
      const { data: outData } = await supabase.from('outlets').select('id, name');
      setOutlets(Array.isArray(outData) ? outData : []);
    } catch (e) {
      console.warn('Outlets fetch failed', e);
    }
    try {
      const { data: empData } = await supabase.from('employees').select('id, name, is_active').eq('is_active', true);
      setEmployees(Array.isArray(empData) ? empData : []);
    } catch (e) {
      console.warn('Employees fetch failed', e);
    }
  }, []);

  const fetchHistory = useCallback(async (mobileFilter?: string | null) => {
    setLoading(true);
    setWarning(null);
    try {
      let q = supabase.from('customers').select('*').order('date', { ascending: false }).limit(1000);
      if (mobileFilter) q = q.eq('mobile', mobileFilter);
      const { data: custData, error: custErr } = await q;
      if (custErr) {
        console.error('Customers fetch error:', JSON.stringify(custErr, Object.getOwnPropertyNames(custErr)));
        setWarning('Could not load customers — check console.');
        setRows([]);
        setFiltered([]);
        setLoading(false);
        return;
      }
      const customers = Array.isArray(custData) ? custData.map(normalizeCustomerRow) : [];

      const mobiles = Array.from(new Set(customers.map((c) => (c.mobile ?? '').trim()).filter(Boolean)));
      let packageMap: Record<string, any> = {};

      if (mobiles.length > 0) {
        try {
          const { data: pkgData, error: pkgErr } = await supabase.from('packages').select('*').in('mobile', mobiles);
          if (pkgErr) {
            console.warn('Packages fetch warning:', JSON.stringify(pkgErr, Object.getOwnPropertyNames(pkgErr)));
          } else if (Array.isArray(pkgData)) {
            const grouped: Record<string, any[]> = {};
            pkgData.forEach((p: any) => {
              const m = (p.mobile ?? '').toString().trim();
              if (!m) return;
              grouped[m] = grouped[m] || [];
              grouped[m].push(p);
            });
            Object.keys(grouped).forEach((m) => {
              packageMap[m] = pickBestPackage(grouped[m]);
            });
          }
        } catch (pkgEx) {
          console.warn('Package enrichment error', pkgEx);
        }
      }

      const merged: HistoryRow[] = customers.map((c) => {
        const pkg = (c.mobile && packageMap[c.mobile.trim()]) ?? null;
        const used = pkg ? (pkg.used_hours ?? pkg.usedHours ?? pkg.used ?? null) : null;
        const remaining = pkg ? (pkg.remaining_hours ?? pkg.remainingHours ?? pkg.remaining ?? null) : null;
        const total_from_pkg = pkg ? (pkg.total_hours ?? pkg.totalHours ?? pkg.totalPackageHours ?? pkg.total ?? null) : null;
        const expiry = pkg ? (pkg.expiry_date ?? pkg.expiryDate ?? pkg.expiry ?? null) : null;
        const start = pkg ? (pkg.start_date ?? pkg.startDate ?? pkg.start ?? null) : null;
        const status = pkg ? (pkg.status ?? pkg.package_status ?? null) : null;
        const pkgAmt = pkg ? (pkg.package_amount ?? pkg.packageAmount ?? null) : null;

        let usedNum: number | null = used !== undefined && used !== null ? Number(used) : null;
        let remainingNum: number | null = remaining !== undefined && remaining !== null ? Number(remaining) : null;
        let totalNum: number | null = null;

        if (usedNum !== null && remainingNum !== null) {
          totalNum = usedNum + remainingNum;
        } else if (total_from_pkg !== null && Number.isFinite(Number(total_from_pkg))) {
          totalNum = Number(total_from_pkg);
          if (usedNum === null && remainingNum !== null) usedNum = Math.max(0, totalNum - remainingNum);
          if (remainingNum === null && usedNum !== null) remainingNum = Math.max(0, totalNum - usedNum);
          if (usedNum === null && remainingNum === null) {
            usedNum = 0;
            remainingNum = totalNum;
          }
        } else {
          if (usedNum !== null && remainingNum === null) { remainingNum = 0; totalNum = usedNum; }
          else if (remainingNum !== null && usedNum === null) { usedNum = 0; totalNum = remainingNum; }
        }

        return {
          ...c,
          used_hours: usedNum,
          remaining_hours: remainingNum,
          expiry_date: expiry ? String(expiry) : null,
          start_date: start ? String(start) : null,
          status: status ? String(status) : null,
          package_amount: c.package_amount ?? (pkgAmt !== undefined ? (pkgAmt === null ? null : Number(pkgAmt)) : null),
          _raw_pkg: pkg ?? null,
        };
      });

      setRows(merged);
      setFiltered(merged);
    } catch (e) {
      console.error('fetchHistory unexpected error:', e);
      setWarning('Unexpected error loading history — check console.');
      setRows([]);
      setFiltered([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchMeta();
    fetchHistory().catch((e) => console.warn(e));
  }, [fetchMeta, fetchHistory]);

  useEffect(() => {
    const lower = (search || '').trim().toLowerCase();
    setFiltered(
      rows.filter((r) => {
        if (lower) {
          const matches =
            (r.name ?? '').toLowerCase().includes(lower) ||
            (r.mobile ?? '').toLowerCase().includes(lower) ||
            (r.treatment ?? '').toLowerCase().includes(lower) ||
            (r.therapist_name ?? '').toLowerCase().includes(lower) ||
            (r.outlet_name ?? '').toLowerCase().includes(lower);
          if (!matches) return false;
        }
        if (dateFrom) {
          if (!r.date) return false;
          const d = new Date(r.date);
          const from = new Date(dateFrom + 'T00:00:00');
          if (d.getTime() < from.getTime()) return false;
        }
        if (dateTo) {
          if (!r.date) return false;
          const d = new Date(r.date);
          const to = new Date(dateTo + 'T23:59:59');
          if (d.getTime() > to.getTime()) return false;
        }
        if (outletFilter && outletFilter !== 'all') {
          if (!r.outlet_name) return false;
          if (r.outlet_name.toLowerCase() !== outletFilter.toLowerCase()) return false;
        }
        if (therapistFilter && therapistFilter !== 'all') {
          if (!r.therapist_name) return false;
          if (r.therapist_name.toLowerCase() !== therapistFilter.toLowerCase()) return false;
        }
        return true;
      })
    );
  }, [rows, search, dateFrom, dateTo, outletFilter, therapistFilter]);

  const handleExport = async () => {
    setIsExporting(true);
    try {
      const data = filtered.map((r) => ({
        Date: fmtDate(r.date),
        Name: r.name ?? '-',
        Mobile: r.mobile ?? '-',
        Service: r.treatment ?? '-',
        Duration: fmtDuration(r.session_hours),
        Therapist: r.therapist_name ?? '-',
        Outlet: r.outlet_name ?? '-',
        Amount: r.took_package ? (r.package_amount ?? 0) / 100 : (r.amount_paid ?? 0) / 100,
        Remaining: r.remaining_hours ?? '-',
        Expiry: fmtDate(r.expiry_date ?? null),
        Status: r.status ?? '-',
        Redeemed: r.is_package_customer ? 'Yes' : 'No',
      }));
      if (data.length === 0) {
        alert('No data to export');
        setIsExporting(false);
        return;
      }
      exportToExcel(data, `ClientHistory_${new Date().toISOString().split('T')[0]}.xlsx`);
    } catch (e) {
      console.error('Export failed', e);
      alert('Export failed — check console');
    } finally {
      setIsExporting(false);
    }
  };

  const toggleExpand = (id: string) => setExpandedId((prev) => (prev === id ? null : id));
  const list = useMemo(() => filtered, [filtered]);

  const screenshotPath = '/mnt/data/Screenshot 2025-11-24 at 5.24.45 PM.png';

  return (
    <div className="p-6 bg-gray-50 min-h-screen">
      {/* Header */}
      <div className="mb-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-black">Client History</h1>
          <p className="text-sm text-black/60">Remaining hours pinned to the top-right for quick scanning</p>
          {warning && <div className="mt-2 text-xs text-yellow-800 bg-yellow-50 p-2 rounded text-black">{warning}</div>}
        </div>

        {/* Controls */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500 h-5 w-5" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search name, mobile, treatment, therapist…"
              className="pl-12 pr-4 py-3 w-96 rounded-2xl border border-gray-200 bg-white text-black placeholder:text-gray-400 shadow-sm focus:border-indigo-400 focus:ring-1 focus:ring-indigo-100 outline-none"
            />
          </div>

          <input type="date" value={dateFrom ?? ''} onChange={(e) => setDateFrom(e.target.value || null)} className="px-3 py-2 border rounded-lg bg-white text-black" />
          <input type="date" value={dateTo ?? ''} onChange={(e) => setDateTo(e.target.value || null)} className="px-3 py-2 border rounded-lg bg-white text-black" />

          <select value={outletFilter} onChange={(e) => setOutletFilter(e.target.value)} className="px-3 py-2 border rounded-lg bg-white text-black">
            <option value="all">All Outlets</option>
            {outlets.map((o) => <option key={o.id} value={o.name}>{o.name}</option>)}
          </select>

          <select value={therapistFilter} onChange={(e) => setTherapistFilter(e.target.value)} className="px-3 py-2 border rounded-lg bg-white text-black">
            <option value="all">All Therapists</option>
            {employees.map((emp) => <option key={emp.id} value={emp.name}>{emp.name}</option>)}
          </select>

          <button onClick={() => { setDateFrom(null); setDateTo(null); setOutletFilter('all'); setTherapistFilter('all'); setSearch(''); }} className="px-3 py-2 bg-gray-100 text-black rounded-lg">Reset</button>

          <button onClick={() => fetchHistory().catch((e) => console.warn(e))} className="px-3 py-2 bg-blue-600 text-white rounded-lg flex items-center gap-2">
            <Loader2 className="h-4 w-4" /> Refresh
          </button>

          <button onClick={handleExport} disabled={isExporting || loading || list.length === 0} className="px-3 py-2 bg-green-600 text-white rounded-lg flex items-center gap-2">
            {isExporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText size={16} />} Export
          </button>

          <a href={screenshotPath} target="_blank" rel="noreferrer" className="ml-2 text-sm text-gray-600 flex items-center gap-1">
            Preview UI <ExternalLink className="h-4 w-4" />
          </a>
        </div>
      </div>

      {/* List */}
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
          <div className="p-6 text-center text-black">No history found.</div>
        ) : (
          list.map((r) => {
            const used = r.used_hours ?? (r._raw_pkg ? (r._raw_pkg.used_hours ?? r._raw_pkg.usedHours ?? r._raw_pkg.used ?? null) : null);
            const remaining = r.remaining_hours ?? (r._raw_pkg ? (r._raw_pkg.remaining_hours ?? r._raw_pkg.remainingHours ?? r._raw_pkg.remaining ?? null) : null);
            const total_from_pkg = r._raw_pkg ? (r._raw_pkg.total_hours ?? r._raw_pkg.totalHours ?? r._raw_pkg.totalPackageHours ?? r._raw_pkg.total ?? null) : null;

            let usedNum: number | null = used !== undefined && used !== null ? Number(used) : null;
            let remainingNum: number | null = remaining !== undefined && remaining !== null ? Number(remaining) : null;
            let totalNum: number | null = null;

            if (usedNum !== null && remainingNum !== null) {
              totalNum = usedNum + remainingNum;
            } else if (total_from_pkg !== null && Number.isFinite(Number(total_from_pkg))) {
              totalNum = Number(total_from_pkg);
              if (usedNum === null && remainingNum !== null) usedNum = Math.max(0, totalNum - remainingNum);
              if (remainingNum === null && usedNum !== null) remainingNum = Math.max(0, totalNum - usedNum);
              if (usedNum === null && remainingNum === null) { usedNum = 0; remainingNum = totalNum; }
            } else {
              if (usedNum !== null && remainingNum === null) { remainingNum = 0; totalNum = usedNum; }
              else if (remainingNum !== null && usedNum === null) { usedNum = 0; totalNum = remainingNum; }
            }

            const pct = totalNum && Number.isFinite(totalNum) && totalNum > 0 && usedNum !== null ? Math.round((usedNum / totalNum) * 100) : 0;
            const isExpired = r.expiry_date ? new Date(r.expiry_date) < new Date() : false;
            const lastTreatment = r.treatment ?? r._raw_pkg?.last_treatment ?? '—';
            const redeemedHere = !!r.is_package_customer || !!r._raw?.is_package_customer || !!r._raw?.isPackageCustomer || false;

            return (
              <div key={r.id} className="p-4 flex items-start gap-4">
                {/* avatar */}
                <div className="w-12 shrink-0">
                  <div className="w-12 h-12 rounded-lg bg-indigo-50 flex items-center justify-center text-indigo-700 font-semibold text-lg">
                    {initials(r.name)}
                  </div>
                </div>

                {/* content */}
                <div className="flex-1 min-w-0">
                  {/* Top row: date + remaining block */}
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <div className="text-xs text-black/60">{fmtDate(r.date)}</div>
                      <div className="mt-1 flex items-center gap-3">
                        <h3 className="text-lg font-semibold text-black truncate">{lastTreatment}</h3>
                        {redeemedHere && <span className="text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded-full">REDEEMED</span>}
                        {r.took_package && <span className="text-xs bg-yellow-100 text-yellow-800 px-2 py-0.5 rounded-full">PACKAGE</span>}
                        {r.status && <span className={`text-xs px-2 py-0.5 rounded-full ${r.status === 'active' ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-black'}`}>{String(r.status).toUpperCase()}</span>}
                      </div>
                      <div className="mt-1 text-sm text-black/70 truncate">{r.name ?? '—'} • {r.mobile ?? '—'}</div>
                    </div>

                    {/* REMAINING & EXPIRY — prominently at top */}
                    <div className="flex flex-col items-end shrink-0">
                      <div className="text-xs text-black/60">Remaining</div>
                      <div className={`text-2xl font-bold ${isExpired ? 'text-red-600' : 'text-black'}`}>{remainingNum !== null ? `${remainingNum}h` : '—'}</div>
                      <div className="text-xs text-black/60 mt-1">Expiry</div>
                      <div className={`text-sm font-medium ${isExpired ? 'text-red-600' : 'text-black'}`}>{fmtDate(r.expiry_date ?? null)}</div>
                    </div>
                  </div>

                  {/* middle: meta */}
                  <div className="mt-3 flex flex-wrap items-center gap-6 text-sm text-black/80">
                    <div><span className="text-black font-medium">{fmtDuration(r.session_hours)}</span> <span className="text-black/60">duration</span></div>
                    <div><span className="text-black font-medium">{r.therapist_name ?? '—'}</span> <span className="text-black/60">therapist</span></div>
                    <div><span className="text-black font-medium">{r.outlet_name ?? '—'}</span> <span className="text-black/60">outlet</span></div>
                    <div className="ml-auto text-sm text-black/90">{r.took_package ? fmtCurrency(r.package_amount) : fmtCurrency(r.amount_paid)}</div>
                  </div>

                  {/* package progress bar (single) */}
                  {r.took_package && (
                    <div className="mt-3 bg-gray-50 border rounded-lg p-3 text-sm text-black">
                      <div className="flex items-center justify-between mb-2">
                        <div className="text-xs text-black/60">Package progress</div>
                        <div className="text-xs text-black/80">{usedNum ?? 0}h used • {remainingNum ?? 0}h left</div>
                      </div>

                      <div className="mt-2 w-full bg-gray-200 h-2 rounded-full overflow-hidden">
                        <div className="h-2 bg-indigo-600" style={{ width: `${Math.max(0, Math.min(100, pct))}%` }} />
                      </div>
                    </div>
                  )}

                  {/* actions & expanded */}
                  <div className="mt-3 flex items-center gap-3">
                    <button onClick={() => toggleExpand(r.id)} className="px-3 py-1 text-sm rounded-md bg-gray-100 hover:bg-gray-200 text-black">
                      {expandedId === r.id ? 'Hide' : 'Details'}
                    </button>
                    <a href={`/sales/${r.id}`} className="px-3 py-1 text-sm rounded-md bg-blue-600 text-white hover:bg-blue-700 flex items-center gap-2">
                      Go to Sale <ExternalLink className="h-4 w-4" />
                    </a>
                  </div>

                  {expandedId === r.id && (
                    <div className="mt-4 border-t pt-4 text-sm text-black space-y-3">
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        <div>
                          <div className="text-xs text-black/60">Package Value</div>
                          <div className="font-medium text-black">{fmtCurrency(r.package_amount)}</div>
                        </div>
                        <div>
                          <div className="text-xs text-black/60">Used Hours</div>
                          <div className="font-medium text-black">{r.used_hours ?? '—'} hrs</div>
                        </div>
                        <div>
                          <div className="text-xs text-black/60">Remaining</div>
                          <div className="font-medium text-black">{r.remaining_hours ?? '—'} hrs</div>
                        </div>
                      </div>

                      <div>
                        <div className="text-xs text-black/60">Notes</div>
                        <div className="mt-1 text-black">{r._raw?.notes ?? r._raw?.remark ?? '—'}</div>
                      </div>

                      <details className="text-xs text-black/70">
                        <summary className="cursor-pointer">Show raw record</summary>
                        <pre className="mt-2 p-2 bg-gray-50 rounded text-xs text-black overflow-auto max-h-56 whitespace-pre-wrap">{JSON.stringify(r._raw ?? r, null, 2)}</pre>
                        {r._raw_pkg && (
                          <>
                            <div className="mt-2 text-xs text-black/70">Merged package:</div>
                            <pre className="mt-1 p-2 bg-gray-50 rounded text-xs text-black overflow-auto max-h-48 whitespace-pre-wrap">{JSON.stringify(r._raw_pkg, null, 2)}</pre>
                          </>
                        )}
                      </details>
                    </div>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
