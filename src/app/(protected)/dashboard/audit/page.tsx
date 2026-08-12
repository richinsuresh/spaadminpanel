'use client';

import { useState, useCallback, useMemo } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { OUTLETS } from '@/lib/outlet';
import {
  Loader2,
  AlertTriangle,
  ShieldCheck,
  Wrench,
  ChevronDown,
  ChevronUp,
  RefreshCw,
  ExternalLink,
  Trash2,
} from 'lucide-react';

/* ===================== TYPES ===================== */

type PackageRow = {
  id: string;
  name: string;
  mobile: string;
  package_amount: number;
  total_hours: number;
  used_hours: number;
  remaining_hours: number;
  status: string;
  start_date: string | null;
  expiry_date: string | null;
  created_at?: string;
};

type CustomerRow = {
  id: string;
  name: string;
  mobile: string;
  date: string;
  treatment: string | null;
  amount_paid: number;
  took_package: boolean;
  package_amount: number | null;
  is_package_customer: boolean;
  session_hours: number | null;
  check_in_time: string | null;
  check_out_time: string | null;
  payment_method: string | null;
  outlet_id: string | null;
  outlet_name: string | null;
  created_at?: string;
};

type AttendanceRow = {
  id: string;
  employee_id: string;
  employee_name: string;
  date: string;
  status: string;
  created_at?: string;
};

type Severity = 'high' | 'medium' | 'low';

type FixAction =
  | { type: 'recompute_remaining_hours'; packageId: string }
  | { type: 'mark_expired'; packageId: string }
  | { type: 'zero_amount_paid'; customerId: string }
  | { type: 'dedupe_attendance'; keepId: string; deleteIds: string[] };

type Issue = {
  id: string; // unique key for this issue instance
  category: string;
  severity: Severity;
  title: string;
  detail: string;
  table: 'packages' | 'customers' | 'attendance';
  recordIds: string[]; // record(s) this issue refers to
  mobile?: string | null;
  name?: string | null;
  linkHref?: string;
  fix?: FixAction;
};

/* ===================== HELPERS ===================== */

const isValidMobile = (m: string | null | undefined) =>
  !!m && /^\d{10}$/.test(String(m).trim());

const round2 = (n: number) => Math.round(n * 100) / 100;

const getToday = () => new Date().toISOString().split('T')[0];

const daysAgo = (n: number) => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().split('T')[0];
};

const SEVERITY_STYLES: Record<Severity, string> = {
  high: 'bg-red-50 text-red-700 border-red-200',
  medium: 'bg-amber-50 text-amber-700 border-amber-200',
  low: 'bg-gray-100 text-gray-700 border-gray-200',
};

/* ===================== CHECKS ===================== */

function checkPackages(packages: PackageRow[]): Issue[] {
  const issues: Issue[] = [];
  const today = getToday();

  for (const pkg of packages) {
    const total = Number(pkg.total_hours) || 0;
    const used = Number(pkg.used_hours) || 0;
    const rem = Number(pkg.remaining_hours) || 0;
    const expected = round2(total - used);

    if (Math.abs(expected - round2(rem)) > 0.05) {
      issues.push({
        id: `pkg-mismatch-${pkg.id}`,
        category: 'Package hour mismatch',
        severity: 'high',
        title: `${pkg.name || 'Unknown'} — remaining hours don't add up`,
        detail: `total_hours (${total}) − used_hours (${used}) = ${expected}, but remaining_hours is stored as ${rem}.`,
        table: 'packages',
        recordIds: [pkg.id],
        mobile: pkg.mobile,
        name: pkg.name,
        fix: { type: 'recompute_remaining_hours', packageId: pkg.id },
      });
    }

    if (used > total + 0.01) {
      issues.push({
        id: `pkg-overused-${pkg.id}`,
        category: 'Used hours exceed total',
        severity: 'high',
        title: `${pkg.name || 'Unknown'} — used more hours than the package had`,
        detail: `used_hours (${used}) is greater than total_hours (${total}). This usually means total_hours was entered wrong at sale time, or a redemption double-deducted. Needs manual review — auto-fixing would guess which number is wrong.`,
        table: 'packages',
        recordIds: [pkg.id],
        mobile: pkg.mobile,
        name: pkg.name,
      });
    }

    if (pkg.status === 'active' && rem <= 0.01) {
      issues.push({
        id: `pkg-stale-active-${pkg.id}`,
        category: 'Active but exhausted',
        severity: 'medium',
        title: `${pkg.name || 'Unknown'} — marked active with 0 hours left`,
        detail: `remaining_hours is ${rem} but status is still "active". Should be "expired".`,
        table: 'packages',
        recordIds: [pkg.id],
        mobile: pkg.mobile,
        name: pkg.name,
        fix: { type: 'mark_expired', packageId: pkg.id },
      });
    } else if (pkg.status === 'active' && pkg.expiry_date && pkg.expiry_date < today) {
      issues.push({
        id: `pkg-past-expiry-${pkg.id}`,
        category: 'Active past expiry date',
        severity: 'medium',
        title: `${pkg.name || 'Unknown'} — expiry date has passed`,
        detail: `expiry_date (${pkg.expiry_date}) is before today (${today}) but status is still "active".`,
        table: 'packages',
        recordIds: [pkg.id],
        mobile: pkg.mobile,
        name: pkg.name,
        fix: { type: 'mark_expired', packageId: pkg.id },
      });
    }

    if (!isValidMobile(pkg.mobile)) {
      issues.push({
        id: `pkg-badmobile-${pkg.id}`,
        category: 'Invalid mobile number',
        severity: 'medium',
        title: `${pkg.name || 'Unknown'} — mobile number looks wrong`,
        detail: `Stored mobile is "${pkg.mobile || ''}", which isn't a valid 10-digit number.`,
        table: 'packages',
        recordIds: [pkg.id],
        mobile: pkg.mobile,
        name: pkg.name,
      });
    }

    if (!pkg.package_amount || Number(pkg.package_amount) <= 0) {
      issues.push({
        id: `pkg-badamount-${pkg.id}`,
        category: 'Zero or missing package amount',
        severity: 'medium',
        title: `${pkg.name || 'Unknown'} — package amount is ₹0 or missing`,
        detail: `package_amount = ${pkg.package_amount}.`,
        table: 'packages',
        recordIds: [pkg.id],
        mobile: pkg.mobile,
        name: pkg.name,
      });
    }
  }

  // Possible duplicate packages: same mobile + amount + total hours + start date
  const dupMap = new Map<string, PackageRow[]>();
  for (const pkg of packages) {
    const key = `${pkg.mobile}|${pkg.package_amount}|${pkg.total_hours}|${pkg.start_date}`;
    if (!dupMap.has(key)) dupMap.set(key, []);
    dupMap.get(key)!.push(pkg);
  }
  for (const group of dupMap.values()) {
    if (group.length > 1) {
      issues.push({
        id: `pkg-dup-${group.map((g) => g.id).join('-')}`,
        category: 'Possible duplicate package',
        severity: 'high',
        title: `${group[0].name || 'Unknown'} — ${group.length} nearly-identical packages`,
        detail: `${group.length} packages share the same mobile, amount (₹${(group[0].package_amount || 0) / 100}), total hours (${group[0].total_hours}), and start date (${group[0].start_date}). Package IDs: ${group.map((g) => g.id).join(', ')}. Don't auto-delete these — a redeemed session may already reference one of them. Review manually in Packages before removing.`,
        table: 'packages',
        recordIds: group.map((g) => g.id),
        mobile: group[0].mobile,
        name: group[0].name,
      });
    }
  }

  return issues;
}

function checkCustomers(customers: CustomerRow[]): Issue[] {
  const issues: Issue[] = [];

  for (const c of customers) {
    if (!isValidMobile(c.mobile)) {
      issues.push({
        id: `cust-badmobile-${c.id}`,
        category: 'Invalid mobile number',
        severity: 'medium',
        title: `${c.name || 'Unknown'} — mobile number looks wrong`,
        detail: `Stored mobile is "${c.mobile || ''}", which isn't a valid 10-digit number.`,
        table: 'customers',
        recordIds: [c.id],
        mobile: c.mobile,
        name: c.name,
        linkHref: `/dashboard/sales/${c.id}`,
      });
    }

    if (c.is_package_customer && Number(c.amount_paid) > 0) {
      issues.push({
        id: `cust-redemption-paid-${c.id}`,
        category: 'Redemption logged as paid',
        severity: 'high',
        title: `${c.name || 'Unknown'} — package redemption shows an amount paid`,
        detail: `is_package_customer is true (redemption), but amount_paid is ₹${(c.amount_paid || 0) / 100}. A redemption should not have a cash/UPI amount attached — this is the exact symptom of the "redemption shows as payment" bug. Safe to zero out.`,
        table: 'customers',
        recordIds: [c.id],
        mobile: c.mobile,
        name: c.name,
        linkHref: `/dashboard/sales/${c.id}`,
        fix: { type: 'zero_amount_paid', customerId: c.id },
      });
    }

    if (c.took_package && (!c.package_amount || Number(c.package_amount) <= 0)) {
      issues.push({
        id: `cust-badpkgamount-${c.id}`,
        category: 'Package sale with zero amount',
        severity: 'medium',
        title: `${c.name || 'Unknown'} — package sale recorded with ₹0`,
        detail: `took_package is true but package_amount is ${c.package_amount}.`,
        table: 'customers',
        recordIds: [c.id],
        mobile: c.mobile,
        name: c.name,
        linkHref: `/dashboard/sales/${c.id}`,
      });
    }

    if (c.check_in_time && c.check_out_time && new Date(c.check_out_time) < new Date(c.check_in_time)) {
      issues.push({
        id: `cust-badtimes-${c.id}`,
        category: 'Checkout before check-in',
        severity: 'high',
        title: `${c.name || 'Unknown'} — checkout time is before check-in time`,
        detail: `check_in_time: ${c.check_in_time}, check_out_time: ${c.check_out_time}.`,
        table: 'customers',
        recordIds: [c.id],
        mobile: c.mobile,
        name: c.name,
        linkHref: `/dashboard/sales/${c.id}`,
      });
    }

    if (c.session_hours != null && Number(c.session_hours) < 0) {
      issues.push({
        id: `cust-negsession-${c.id}`,
        category: 'Negative session hours',
        severity: 'medium',
        title: `${c.name || 'Unknown'} — session_hours is negative`,
        detail: `session_hours = ${c.session_hours}.`,
        table: 'customers',
        recordIds: [c.id],
        mobile: c.mobile,
        name: c.name,
        linkHref: `/dashboard/sales/${c.id}`,
      });
    }

    if (
      !c.is_package_customer &&
      !c.took_package &&
      Number(c.amount_paid || 0) > 0 &&
      !c.payment_method
    ) {
      issues.push({
        id: `cust-nopaymentmethod-${c.id}`,
        category: 'Missing payment method',
        severity: 'medium',
        title: `${c.name || 'Unknown'} — amount paid but no payment method recorded`,
        detail: `amount_paid = ₹${(c.amount_paid || 0) / 100}, payment_method is empty.`,
        table: 'customers',
        recordIds: [c.id],
        mobile: c.mobile,
        name: c.name,
        linkHref: `/dashboard/sales/${c.id}`,
      });
    }

    if (c.outlet_id && !OUTLETS.find((o) => o.id === c.outlet_id)) {
      issues.push({
        id: `cust-badoutlet-${c.id}`,
        category: 'Unknown outlet',
        severity: 'medium',
        title: `${c.name || 'Unknown'} — outlet_id doesn't match any configured outlet`,
        detail: `outlet_id: "${c.outlet_id}", outlet_name: "${c.outlet_name}".`,
        table: 'customers',
        recordIds: [c.id],
        mobile: c.mobile,
        name: c.name,
        linkHref: `/dashboard/sales/${c.id}`,
      });
    }
  }

  // Possible duplicate sale entries (leftover from before the client_uuid fix)
  const dupMap = new Map<string, CustomerRow[]>();
  for (const c of customers) {
    const minuteBucket = c.check_in_time ? c.check_in_time.slice(0, 16) : 'none';
    const key = `${c.mobile}|${c.date}|${c.treatment}|${c.session_hours}|${c.amount_paid}|${c.package_amount}|${minuteBucket}`;
    if (!dupMap.has(key)) dupMap.set(key, []);
    dupMap.get(key)!.push(c);
  }
  for (const group of dupMap.values()) {
    if (group.length > 1) {
      issues.push({
        id: `cust-dup-${group.map((g) => g.id).join('-')}`,
        category: 'Possible duplicate sale entry',
        severity: 'high',
        title: `${group[0].name || 'Unknown'} — ${group.length} nearly-identical sale entries`,
        detail: `${group.length} entries share the same mobile, date, treatment, hours, and amount, checked in within the same minute. Entry IDs: ${group.map((g) => g.id).join(', ')}. Review and delete extras from the Sales page (use the bulk delete tool if several).`,
        table: 'customers',
        recordIds: group.map((g) => g.id),
        mobile: group[0].mobile,
        name: group[0].name,
      });
    }
  }

  return issues;
}

function checkAttendanceDuplicates(records: AttendanceRow[]): Issue[] {
  const issues: Issue[] = [];
  const groups = new Map<string, AttendanceRow[]>();

  for (const r of records) {
    const key = `${r.employee_id}|${r.date}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(r);
  }

  for (const group of groups.values()) {
    if (group.length > 1) {
      const sorted = [...group].sort((a, b) =>
        (b.created_at || '').localeCompare(a.created_at || ''),
      );
      const keep = sorted[0];
      const toDelete = sorted.slice(1);

      issues.push({
        id: `att-dup-${group.map((g) => g.id).join('-')}`,
        category: 'Duplicate attendance entries',
        severity: 'high',
        title: `${group[0].employee_name || 'Unknown'} — ${group.length} attendance rows for ${group[0].date}`,
        detail: `Statuses recorded: ${group.map((g) => g.status).join(', ')}. Keeping the most recent (${keep.status}) and removing the other ${toDelete.length}.`,
        table: 'attendance',
        recordIds: group.map((g) => g.id),
        name: group[0].employee_name,
        fix: {
          type: 'dedupe_attendance',
          keepId: keep.id,
          deleteIds: toDelete.map((r) => r.id),
        },
      });
    }
  }

  return issues;
}

/* ===================== PAGE ===================== */

export default function DataAuditPage() {
  const [isRunning, setIsRunning] = useState(false);
  const [hasRun, setHasRun] = useState(false);
  const [fromDate, setFromDate] = useState(daysAgo(90));
  const [toDate, setToDate] = useState(getToday());
  const [allTime, setAllTime] = useState(false);

  const [issues, setIssues] = useState<Issue[]>([]);
  const [expandedCategories, setExpandedCategories] = useState<Record<string, boolean>>({});
  const [fixingIds, setFixingIds] = useState<Set<string>>(new Set());
  const [fixedIds, setFixedIds] = useState<Set<string>>(new Set());
  const [runError, setRunError] = useState<string | null>(null);

  const runAudit = useCallback(async () => {
    setIsRunning(true);
    setRunError(null);
    setFixedIds(new Set());
    try {
      let customerQuery = supabase.from('customers').select('*').limit(20000);
      let attendanceQuery = supabase.from('attendance').select('*').limit(20000);

      if (!allTime) {
        customerQuery = customerQuery.gte('date', fromDate).lte('date', toDate);
        attendanceQuery = attendanceQuery.gte('date', fromDate).lte('date', toDate);
      }

      const [pkgRes, custRes, attRes] = await Promise.all([
        supabase.from('packages').select('*').limit(20000),
        customerQuery,
        attendanceQuery,
      ]);

      if (pkgRes.error) throw pkgRes.error;
      if (custRes.error) throw custRes.error;
      if (attRes.error) throw attRes.error;

      const packageIssues = checkPackages((pkgRes.data as PackageRow[]) || []);
      const customerIssues = checkCustomers((custRes.data as CustomerRow[]) || []);
      const attendanceIssues = checkAttendanceDuplicates((attRes.data as AttendanceRow[]) || []);

      setIssues([...packageIssues, ...customerIssues, ...attendanceIssues]);
      setHasRun(true);
    } catch (err: any) {
      console.error('Audit failed:', err);
      setRunError(err.message || 'Audit failed');
    } finally {
      setIsRunning(false);
    }
  }, [fromDate, toDate, allTime]);

  const grouped = useMemo(() => {
    const map = new Map<string, Issue[]>();
    for (const issue of issues) {
      if (fixedIds.has(issue.id)) continue;
      if (!map.has(issue.category)) map.set(issue.category, []);
      map.get(issue.category)!.push(issue);
    }
    // Sort categories by severity of their worst issue, then by count
    return [...map.entries()].sort((a, b) => {
      const sevRank = { high: 0, medium: 1, low: 2 };
      const aSev = Math.min(...a[1].map((i) => sevRank[i.severity]));
      const bSev = Math.min(...b[1].map((i) => sevRank[i.severity]));
      if (aSev !== bSev) return aSev - bSev;
      return b[1].length - a[1].length;
    });
  }, [issues, fixedIds]);

  const totalOpenIssues = issues.length - fixedIds.size;
  const highCount = issues.filter((i) => i.severity === 'high' && !fixedIds.has(i.id)).length;

  const toggleCategory = (cat: string) => {
    setExpandedCategories((prev) => ({ ...prev, [cat]: !prev[cat] }));
  };

  const applyFix = async (issue: Issue) => {
    if (!issue.fix) return;
    setFixingIds((prev) => new Set(prev).add(issue.id));
    try {
      const fix = issue.fix;

      if (fix.type === 'recompute_remaining_hours') {
        // Re-fetch the current row to compute against the latest data
        // (in case it changed between the audit run and clicking Fix).
        const { data: row, error: fetchErr } = await supabase
          .from('packages')
          .select('total_hours, used_hours')
          .eq('id', fix.packageId)
          .single();
        if (fetchErr) throw fetchErr;
        const newRemaining = Math.max(0, round2((row?.total_hours || 0) - (row?.used_hours || 0)));
        const { error } = await supabase
          .from('packages')
          .update({ remaining_hours: newRemaining })
          .eq('id', fix.packageId);
        if (error) throw error;
      }

      if (fix.type === 'mark_expired') {
        const { error } = await supabase
          .from('packages')
          .update({ status: 'expired' })
          .eq('id', fix.packageId);
        if (error) throw error;
      }

      if (fix.type === 'zero_amount_paid') {
        const { error } = await supabase
          .from('customers')
          .update({ amount_paid: 0 })
          .eq('id', fix.customerId);
        if (error) throw error;
      }

      if (fix.type === 'dedupe_attendance') {
        const { error } = await supabase
          .from('attendance')
          .delete()
          .in('id', fix.deleteIds);
        if (error) throw error;
      }

      setFixedIds((prev) => new Set(prev).add(issue.id));
    } catch (err: any) {
      alert('Fix failed: ' + (err.message || 'Unknown error'));
    } finally {
      setFixingIds((prev) => {
        const next = new Set(prev);
        next.delete(issue.id);
        return next;
      });
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-800">Data Health Check</h1>
        <p className="text-sm text-gray-500 mt-1">
          Scans packages, sales, and attendance for inconsistent or suspicious data — mismatched
          hours, duplicate entries, redemptions logged as paid, and more. Nothing is changed until
          you click "Fix" on a specific issue.
        </p>
      </div>

      {/* Controls */}
      <div className="bg-white p-4 rounded-xl shadow-sm flex flex-wrap items-end gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">From</label>
          <input
            type="date"
            value={fromDate}
            disabled={allTime}
            onChange={(e) => setFromDate(e.target.value)}
            className="px-3 py-2 border rounded-lg text-black bg-white disabled:opacity-50"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">To</label>
          <input
            type="date"
            value={toDate}
            disabled={allTime}
            onChange={(e) => setToDate(e.target.value)}
            className="px-3 py-2 border rounded-lg text-black bg-white disabled:opacity-50"
          />
        </div>
        <label className="flex items-center gap-2 text-sm text-gray-700 select-none cursor-pointer pb-2">
          <input type="checkbox" checked={allTime} onChange={(e) => setAllTime(e.target.checked)} className="h-4 w-4" />
          All time (slower — checks every sale ever recorded)
        </label>
        <button
          onClick={runAudit}
          disabled={isRunning}
          className="px-5 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2"
        >
          {isRunning ? <Loader2 className="animate-spin h-4 w-4" /> : <RefreshCw className="h-4 w-4" />}
          {isRunning ? 'Scanning…' : hasRun ? 'Run Again' : 'Run Audit'}
        </button>
        <p className="text-xs text-gray-400 mb-1">
          Note: packages are always checked in full regardless of this date range.
        </p>
      </div>

      {runError && (
        <div className="p-4 bg-red-50 text-red-700 border border-red-200 rounded-xl text-sm">
          {runError}
        </div>
      )}

      {/* Summary */}
      {hasRun && !runError && (
        <div className="bg-white p-6 rounded-xl shadow-sm flex items-center gap-4">
          {totalOpenIssues === 0 ? (
            <>
              <ShieldCheck className="text-green-600 h-10 w-10 shrink-0" />
              <div>
                <p className="font-bold text-lg text-gray-800">No issues found</p>
                <p className="text-sm text-gray-500">Everything checked out clean for this range.</p>
              </div>
            </>
          ) : (
            <>
              <AlertTriangle className="text-amber-500 h-10 w-10 shrink-0" />
              <div>
                <p className="font-bold text-lg text-gray-800">
                  {totalOpenIssues} issue{totalOpenIssues === 1 ? '' : 's'} found
                  {highCount > 0 && (
                    <span className="ml-2 text-sm font-semibold text-red-600">
                      ({highCount} high priority)
                    </span>
                  )}
                </p>
                <p className="text-sm text-gray-500">Grouped by type below — expand a category to review.</p>
              </div>
            </>
          )}
        </div>
      )}

      {/* Results */}
      {grouped.map(([category, categoryIssues]) => {
        const isOpen = !!expandedCategories[category];
        const worstSeverity = categoryIssues.reduce<Severity>((worst, i) => {
          const rank = { high: 0, medium: 1, low: 2 };
          return rank[i.severity] < rank[worst] ? i.severity : worst;
        }, 'low');

        return (
          <div key={category} className="bg-white rounded-xl shadow-sm overflow-hidden">
            <button
              onClick={() => toggleCategory(category)}
              className="w-full flex items-center justify-between p-4 hover:bg-gray-50 text-left"
            >
              <div className="flex items-center gap-3">
                <span className={`text-xs font-bold uppercase px-2 py-1 rounded border ${SEVERITY_STYLES[worstSeverity]}`}>
                  {worstSeverity}
                </span>
                <span className="font-semibold text-gray-800">{category}</span>
                <span className="text-sm text-gray-400">({categoryIssues.length})</span>
              </div>
              {isOpen ? <ChevronUp className="h-5 w-5 text-gray-400" /> : <ChevronDown className="h-5 w-5 text-gray-400" />}
            </button>

            {isOpen && (
              <div className="border-t divide-y">
                {categoryIssues.map((issue) => (
                  <div key={issue.id} className="p-4 flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-gray-800 text-sm">{issue.title}</p>
                      <p className="text-xs text-gray-500 mt-1">{issue.detail}</p>
                      {issue.mobile && (
                        <p className="text-xs text-gray-400 mt-1">Mobile: {issue.mobile}</p>
                      )}
                    </div>
                    <div className="flex flex-col items-end gap-2 shrink-0">
                      {issue.linkHref && (
                        <Link
                          href={issue.linkHref}
                          className="text-xs px-3 py-1.5 border rounded-lg text-blue-700 border-blue-200 hover:bg-blue-50 flex items-center gap-1"
                        >
                          <ExternalLink className="h-3 w-3" /> View
                        </Link>
                      )}
                      {issue.fix && (
                        <button
                          onClick={() => applyFix(issue)}
                          disabled={fixingIds.has(issue.id)}
                          className="text-xs px-3 py-1.5 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 flex items-center gap-1"
                        >
                          {fixingIds.has(issue.id) ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : issue.fix.type === 'dedupe_attendance' ? (
                            <Trash2 className="h-3 w-3" />
                          ) : (
                            <Wrench className="h-3 w-3" />
                          )}
                          {fixingIds.has(issue.id) ? 'Fixing…' : 'Fix'}
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}

      {!hasRun && !isRunning && (
        <div className="bg-white p-10 rounded-xl shadow-sm text-center text-gray-400 text-sm">
          Set a date range (or check "All time") and click "Run Audit" to scan for issues.
        </div>
      )}
    </div>
  );
}
