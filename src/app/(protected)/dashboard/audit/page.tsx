'use client';

import { useState, useCallback, useMemo } from 'react';
import Link from 'next/link';
import { useUser } from '@/context/UserContext';
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
  X,
  EyeOff,
  Pencil,
  Info,
  History,
  CheckCircle2,
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
  check_in_time?: string | null;
  created_at?: string;
};

type Severity = 'high' | 'medium' | 'low';

type FixAction =
  | { type: 'recompute_remaining_hours'; packageId: string }
  | { type: 'mark_expired'; packageId: string }
  | { type: 'zero_amount_paid'; customerId: string };

type EditFieldType = 'text' | 'number' | 'currency' | 'select' | 'date' | 'time';

type EditFieldDef = {
  key: string;
  label: string;
  type: EditFieldType;
  value: any;
  options?: { value: string; label: string }[];
};

type EditConfig = {
  table: 'packages' | 'customers';
  recordId: string;
  fields: EditFieldDef[];
};

type DuplicateColumn = { key: string; label: string; format?: (v: any) => string };

type DuplicateGroupConfig = {
  table: 'packages' | 'customers' | 'attendance';
  columns: DuplicateColumn[];
  rows: Record<string, any>[];
  recommendedKeepId: string;
};

type Issue = {
  id: string;
  category: string;
  severity: Severity;
  title: string;
  detail: string;
  table: 'packages' | 'customers' | 'attendance';
  recordIds: string[];
  mobile?: string | null;
  name?: string | null;
  linkHref?: string;
  fix?: FixAction;
  edit?: EditConfig;
  duplicateGroup?: DuplicateGroupConfig;
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

const toInputTime = (d: string | null | undefined) => {
  if (!d) return '';
  const date = new Date(d);
  if (isNaN(date.getTime())) return '';
  const h = String(date.getHours()).padStart(2, '0');
  const m = String(date.getMinutes()).padStart(2, '0');
  return `${h}:${m}`;
};

const fmtCurrency = (paise: number | null | undefined) =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', minimumFractionDigits: 0 }).format(
    (paise || 0) / 100,
  );

const fmtDateTime = (d: string | null | undefined) => {
  if (!d) return '—';
  const date = new Date(d);
  if (isNaN(date.getTime())) return '—';
  return date.toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
};

const SEVERITY_STYLES: Record<Severity, string> = {
  high: 'bg-red-50 text-red-700 border-red-200',
  medium: 'bg-amber-50 text-amber-700 border-amber-200',
  low: 'bg-gray-100 text-gray-700 border-gray-200',
};

const ADMIN_PASSWORD = 'admin123';

const CATEGORY_HELP: Record<string, string> = {
  'Package hour mismatch':
    "total_hours minus used_hours should always equal remaining_hours. When it doesn't, either the package was edited by hand at some point, or a redemption updated one field without updating the other. \"Fix\" recalculates remaining_hours from the other two — use \"Edit\" instead if you know total_hours or used_hours itself is the wrong number.",
  'Used hours exceed total':
    "The customer has used more hours than the package was sold with. Usually this means total_hours was typed wrong when the package was sold, or a redemption was applied twice. There's no safe automatic fix here since either number could be the mistake — open \"Edit\" and correct whichever field is actually wrong.",
  'Active but exhausted':
    'The package has 0 hours left but is still marked "active", so it will keep showing up as redeemable. "Fix" marks it expired.',
  'Active past expiry date':
    'The expiry date has already passed but the package is still marked "active". "Fix" marks it expired.',
  'Invalid mobile number':
    "Mobile numbers should be exactly 10 digits. This usually comes from a typo at check-in, a country code accidentally included, or a placeholder value. Edit the record to correct it.",
  'Zero or missing package amount':
    'A package with ₹0 recorded usually means the amount field was left blank or 0 was typed by mistake at the point of sale.',
  'Possible duplicate package':
    "These packages share the same mobile number, amount, hours, and start date — almost certainly created by the double-submission bug that existed before the client_uuid fix was deployed. Don't delete blindly: if a customer has already redeemed sessions against one of these packages, deleting the wrong one will orphan that session record. Review the \"used_hours\" column below — the one with usage on it is very likely the real one to keep.",
  'Redemption logged as paid':
    'A package redemption (is_package_customer = true) should never have a cash/UPI amount attached — hours come out of the package, not the wallet. This was the signature symptom of a bug where the redemption lookup silently failed and the visit got logged as a regular paid session instead. "Fix" zeroes the amount out; if the customer actually did pay for something extra on top of their package, use "Edit" instead so you don't lose that context.',
  'Package sale with zero amount':
    'A package sale was recorded with ₹0. Check whether the amount was left blank at the point of sale.',
  'Checkout before check-in':
    'The recorded checkout timestamp is earlier than the check-in timestamp — almost always a manual time-entry mistake. Edit the record to set the correct times.',
  'Negative session hours':
    'session_hours is stored as a negative number, which should never happen from the normal booking flow. Likely a manual edit gone wrong.',
  'Missing payment method':
    'The customer paid an amount but no payment method (cash/UPI/card) was recorded against it.',
  'Unknown outlet':
    "This record's outlet_id doesn't match any outlet currently configured in the app — possibly an outlet that was renamed or removed after this sale was recorded.",
  'Possible duplicate sale entry':
    'These entries share the same mobile, date, treatment, hours and amount, checked in within the same minute — the fingerprint of a double-submitted form before the client_uuid fix was deployed. Review and keep only the real one.',
  'Duplicate attendance entries':
    'More than one attendance row exists for the same employee on the same day — the fingerprint of the "Half Day not reflecting" bug, where marking a second status inserted a new row instead of updating the existing one. Keep the correct status and delete the rest.',
};

/* ===================== PER-RECORD CHECKS (reused for full audit + single-row recheck) ===================== */

function checkOnePackage(pkg: PackageRow): Issue[] {
  const issues: Issue[] = [];
  const today = getToday();
  const total = Number(pkg.total_hours) || 0;
  const used = Number(pkg.used_hours) || 0;
  const rem = Number(pkg.remaining_hours) || 0;
  const expected = round2(total - used);

  const editFields = (): EditFieldDef[] => [
    { key: 'name', label: 'Customer Name', type: 'text', value: pkg.name || '' },
    { key: 'mobile', label: 'Mobile', type: 'text', value: pkg.mobile || '' },
    { key: 'package_amount', label: 'Package Amount (₹)', type: 'currency', value: round2((pkg.package_amount || 0) / 100) },
    { key: 'total_hours', label: 'Total Hours', type: 'number', value: total },
    { key: 'used_hours', label: 'Used Hours', type: 'number', value: used },
    { key: 'remaining_hours', label: 'Remaining Hours', type: 'number', value: rem },
    {
      key: 'status',
      label: 'Status',
      type: 'select',
      value: pkg.status,
      options: [
        { value: 'active', label: 'Active' },
        { value: 'expired', label: 'Expired' },
      ],
    },
    { key: 'expiry_date', label: 'Expiry Date', type: 'date', value: pkg.expiry_date || '' },
  ];

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
      edit: { table: 'packages', recordId: pkg.id, fields: editFields() },
    });
  }

  if (used > total + 0.01) {
    issues.push({
      id: `pkg-overused-${pkg.id}`,
      category: 'Used hours exceed total',
      severity: 'high',
      title: `${pkg.name || 'Unknown'} — used more hours than the package had`,
      detail: `used_hours (${used}) is greater than total_hours (${total}).`,
      table: 'packages',
      recordIds: [pkg.id],
      mobile: pkg.mobile,
      name: pkg.name,
      edit: { table: 'packages', recordId: pkg.id, fields: editFields() },
    });
  }

  if (pkg.status === 'active' && rem <= 0.01) {
    issues.push({
      id: `pkg-stale-active-${pkg.id}`,
      category: 'Active but exhausted',
      severity: 'medium',
      title: `${pkg.name || 'Unknown'} — marked active with 0 hours left`,
      detail: `remaining_hours is ${rem} but status is still "active".`,
      table: 'packages',
      recordIds: [pkg.id],
      mobile: pkg.mobile,
      name: pkg.name,
      fix: { type: 'mark_expired', packageId: pkg.id },
      edit: { table: 'packages', recordId: pkg.id, fields: editFields() },
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
      edit: { table: 'packages', recordId: pkg.id, fields: editFields() },
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
      edit: { table: 'packages', recordId: pkg.id, fields: editFields() },
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
      edit: { table: 'packages', recordId: pkg.id, fields: editFields() },
    });
  }

  return issues;
}

function checkOneCustomer(c: CustomerRow): Issue[] {
  const issues: Issue[] = [];

  const editFields = (): EditFieldDef[] => [
    { key: 'name', label: 'Customer Name', type: 'text', value: c.name || '' },
    { key: 'mobile', label: 'Mobile', type: 'text', value: c.mobile || '' },
    { key: 'treatment', label: 'Treatment', type: 'text', value: c.treatment || '' },
    { key: 'amount_paid', label: 'Amount Paid (₹)', type: 'currency', value: round2((c.amount_paid || 0) / 100) },
    { key: 'package_amount', label: 'Package Amount (₹)', type: 'currency', value: round2((c.package_amount || 0) / 100) },
    {
      key: 'payment_method',
      label: 'Payment Method',
      type: 'select',
      value: c.payment_method || '',
      options: [
        { value: '', label: '—' },
        { value: 'cash', label: 'Cash' },
        { value: 'upi', label: 'UPI' },
        { value: 'card', label: 'Card' },
        { value: 'bank_transfer', label: 'Bank Transfer' },
      ],
    },
    { key: 'session_hours', label: 'Session Hours', type: 'number', value: c.session_hours ?? 0 },
    {
      key: 'outlet_id',
      label: 'Outlet',
      type: 'select',
      value: c.outlet_id || '',
      options: OUTLETS.map((o) => ({ value: o.id, label: o.name })),
    },
    { key: 'date', label: 'Date', type: 'date', value: c.date },
    { key: 'check_in_time', label: 'Check-in Time', type: 'time', value: toInputTime(c.check_in_time) },
    { key: 'check_out_time', label: 'Check-out Time', type: 'time', value: toInputTime(c.check_out_time) },
  ];

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
      edit: { table: 'customers', recordId: c.id, fields: editFields() },
    });
  }

  if (c.is_package_customer && Number(c.amount_paid) > 0) {
    issues.push({
      id: `cust-redemption-paid-${c.id}`,
      category: 'Redemption logged as paid',
      severity: 'high',
      title: `${c.name || 'Unknown'} — package redemption shows an amount paid`,
      detail: `is_package_customer is true (redemption), but amount_paid is ${fmtCurrency(c.amount_paid)}.`,
      table: 'customers',
      recordIds: [c.id],
      mobile: c.mobile,
      name: c.name,
      linkHref: `/dashboard/sales/${c.id}`,
      fix: { type: 'zero_amount_paid', customerId: c.id },
      edit: { table: 'customers', recordId: c.id, fields: editFields() },
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
      edit: { table: 'customers', recordId: c.id, fields: editFields() },
    });
  }

  if (c.check_in_time && c.check_out_time && new Date(c.check_out_time) < new Date(c.check_in_time)) {
    issues.push({
      id: `cust-badtimes-${c.id}`,
      category: 'Checkout before check-in',
      severity: 'high',
      title: `${c.name || 'Unknown'} — checkout time is before check-in time`,
      detail: `check_in_time: ${fmtDateTime(c.check_in_time)}, check_out_time: ${fmtDateTime(c.check_out_time)}.`,
      table: 'customers',
      recordIds: [c.id],
      mobile: c.mobile,
      name: c.name,
      linkHref: `/dashboard/sales/${c.id}`,
      edit: { table: 'customers', recordId: c.id, fields: editFields() },
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
      edit: { table: 'customers', recordId: c.id, fields: editFields() },
    });
  }

  if (!c.is_package_customer && !c.took_package && Number(c.amount_paid || 0) > 0 && !c.payment_method) {
    issues.push({
      id: `cust-nopaymentmethod-${c.id}`,
      category: 'Missing payment method',
      severity: 'medium',
      title: `${c.name || 'Unknown'} — amount paid but no payment method recorded`,
      detail: `amount_paid = ${fmtCurrency(c.amount_paid)}, payment_method is empty.`,
      table: 'customers',
      recordIds: [c.id],
      mobile: c.mobile,
      name: c.name,
      linkHref: `/dashboard/sales/${c.id}`,
      edit: { table: 'customers', recordId: c.id, fields: editFields() },
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
      edit: { table: 'customers', recordId: c.id, fields: editFields() },
    });
  }

  return issues;
}

/* ===================== FULL-SET CHECKS (adds duplicate detection) ===================== */

function checkPackages(packages: PackageRow[]): Issue[] {
  const issues = packages.flatMap(checkOnePackage);

  const dupMap = new Map<string, PackageRow[]>();
  for (const pkg of packages) {
    const key = `${pkg.mobile}|${pkg.package_amount}|${pkg.total_hours}|${pkg.start_date}`;
    if (!dupMap.has(key)) dupMap.set(key, []);
    dupMap.get(key)!.push(pkg);
  }
  for (const group of dupMap.values()) {
    if (group.length > 1) {
      const recommended = [...group].sort((a, b) => Number(b.used_hours || 0) - Number(a.used_hours || 0))[0];
      issues.push({
        id: `pkg-dup-${group.map((g) => g.id).join('-')}`,
        category: 'Possible duplicate package',
        severity: 'high',
        title: `${group[0].name || 'Unknown'} — ${group.length} nearly-identical packages`,
        detail: `Same mobile, amount (${fmtCurrency(group[0].package_amount)}), total hours (${group[0].total_hours}), and start date (${group[0].start_date}).`,
        table: 'packages',
        recordIds: group.map((g) => g.id),
        mobile: group[0].mobile,
        name: group[0].name,
        duplicateGroup: {
          table: 'packages',
          recommendedKeepId: recommended.id,
          columns: [
            { key: 'name', label: 'Name' },
            { key: 'mobile', label: 'Mobile' },
            { key: 'package_amount', label: 'Amount', format: (v) => fmtCurrency(v) },
            { key: 'total_hours', label: 'Total Hrs' },
            { key: 'used_hours', label: 'Used Hrs' },
            { key: 'remaining_hours', label: 'Remaining Hrs' },
            { key: 'status', label: 'Status' },
            { key: 'start_date', label: 'Start Date' },
            { key: 'created_at', label: 'Created', format: (v) => fmtDateTime(v) },
          ],
          rows: group,
        },
      });
    }
  }

  return issues;
}

function checkCustomers(customers: CustomerRow[]): Issue[] {
  const issues = customers.flatMap(checkOneCustomer);

  const dupMap = new Map<string, CustomerRow[]>();
  for (const c of customers) {
    const minuteBucket = c.check_in_time ? c.check_in_time.slice(0, 16) : 'none';
    const key = `${c.mobile}|${c.date}|${c.treatment}|${c.session_hours}|${c.amount_paid}|${c.package_amount}|${minuteBucket}`;
    if (!dupMap.has(key)) dupMap.set(key, []);
    dupMap.get(key)!.push(c);
  }
  for (const group of dupMap.values()) {
    if (group.length > 1) {
      const recommended = [...group].sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''))[0];
      issues.push({
        id: `cust-dup-${group.map((g) => g.id).join('-')}`,
        category: 'Possible duplicate sale entry',
        severity: 'high',
        title: `${group[0].name || 'Unknown'} — ${group.length} nearly-identical sale entries`,
        detail: `Same mobile, date, treatment, hours and amount, checked in within the same minute.`,
        table: 'customers',
        recordIds: group.map((g) => g.id),
        mobile: group[0].mobile,
        name: group[0].name,
        duplicateGroup: {
          table: 'customers',
          recommendedKeepId: recommended.id,
          columns: [
            { key: 'name', label: 'Name' },
            { key: 'mobile', label: 'Mobile' },
            { key: 'date', label: 'Date' },
            { key: 'treatment', label: 'Treatment' },
            { key: 'session_hours', label: 'Hrs' },
            { key: 'amount_paid', label: 'Paid', format: (v) => fmtCurrency(v) },
            { key: 'package_amount', label: 'Pkg Amt', format: (v) => fmtCurrency(v) },
            { key: 'payment_method', label: 'Payment' },
            { key: 'check_in_time', label: 'Check-in', format: (v) => fmtDateTime(v) },
          ],
          rows: group,
        },
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
      const recommended = [...group].sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''))[0];
      issues.push({
        id: `att-dup-${group.map((g) => g.id).join('-')}`,
        category: 'Duplicate attendance entries',
        severity: 'high',
        title: `${group[0].employee_name || 'Unknown'} — ${group.length} attendance rows for ${group[0].date}`,
        detail: `Statuses recorded: ${group.map((g) => g.status).join(', ')}.`,
        table: 'attendance',
        recordIds: group.map((g) => g.id),
        name: group[0].employee_name,
        duplicateGroup: {
          table: 'attendance',
          recommendedKeepId: recommended.id,
          columns: [
            { key: 'employee_name', label: 'Employee' },
            { key: 'date', label: 'Date' },
            { key: 'status', label: 'Status' },
            { key: 'check_in_time', label: 'Check-in', format: (v) => fmtDateTime(v) },
            { key: 'created_at', label: 'Created', format: (v) => fmtDateTime(v) },
          ],
          rows: group,
        },
      });
    }
  }

  return issues;
}

/* ===================== SMALL UI PRIMITIVES ===================== */

function FieldInput({ field, value, onChange }: { field: EditFieldDef; value: any; onChange: (v: any) => void }) {
  const base = 'w-full p-2 border rounded text-black bg-white text-sm';
  if (field.type === 'select') {
    return (
      <select className={base} value={value ?? ''} onChange={(e) => onChange(e.target.value)}>
        {(field.options || []).map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    );
  }
  if (field.type === 'number' || field.type === 'currency') {
    return (
      <input
        type="number"
        step="any"
        className={base}
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value === '' ? '' : Number(e.target.value))}
      />
    );
  }
  return (
    <input
      type={field.type === 'date' ? 'date' : field.type === 'time' ? 'time' : 'text'}
      className={base}
      value={value ?? ''}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}

/* ===================== PAGE ===================== */

export default function DataAuditPage() {
  const { user } = useUser();

  const [isRunning, setIsRunning] = useState(false);
  const [hasRun, setHasRun] = useState(false);
  const [fromDate, setFromDate] = useState(daysAgo(90));
  const [toDate, setToDate] = useState(getToday());
  const [allTime, setAllTime] = useState(false);

  const [issues, setIssues] = useState<Issue[]>([]);
  const [expandedCategories, setExpandedCategories] = useState<Record<string, boolean>>({});
  const [expandedHelp, setExpandedHelp] = useState<Record<string, boolean>>({});
  const [fixingIds, setFixingIds] = useState<Set<string>>(new Set());
  const [resolvedIds, setResolvedIds] = useState<Set<string>>(new Set());
  const [dismissedKeys, setDismissedKeys] = useState<Set<string>>(new Set());
  const [runError, setRunError] = useState<string | null>(null);
  const [sessionLog, setSessionLog] = useState<{ label: string; kind: 'fixed' | 'edited' | 'deleted' | 'dismissed' }[]>([]);
  const [showSessionLog, setShowSessionLog] = useState(false);

  // Edit modal
  const [editingIssue, setEditingIssue] = useState<Issue | null>(null);
  const [editValues, setEditValues] = useState<Record<string, any>>({});
  const [editPassword, setEditPassword] = useState('');
  const [editRemark, setEditRemark] = useState('');
  const [editError, setEditError] = useState<string | null>(null);
  const [isSavingEdit, setIsSavingEdit] = useState(false);

  // Dismiss modal
  const [dismissingIssue, setDismissingIssue] = useState<Issue | null>(null);
  const [dismissRemark, setDismissRemark] = useState('');
  const [isDismissing, setIsDismissing] = useState(false);

  // Duplicate review modal
  const [reviewingIssue, setReviewingIssue] = useState<Issue | null>(null);
  const [keepId, setKeepId] = useState<string>('');
  const [reviewPassword, setReviewPassword] = useState('');
  const [reviewRemark, setReviewRemark] = useState('');
  const [reviewError, setReviewError] = useState<string | null>(null);
  const [isResolvingDup, setIsResolvingDup] = useState(false);

  const fetchDismissed = useCallback(async () => {
    try {
      const { data } = await supabase
        .from('activity_logs')
        .select('description')
        .eq('action_type', 'audit_dismiss_issue')
        .limit(2000);
      const keys = new Set<string>();
      (data || []).forEach((row: any) => {
        try {
          const parsed = JSON.parse(row.description);
          if (parsed?.issue_id) keys.add(parsed.issue_id);
        } catch {
          // ignore unparsable rows
        }
      });
      setDismissedKeys(keys);
      return keys;
    } catch (err) {
      console.warn('Could not load dismissed audit issues:', err);
      return new Set<string>();
    }
  }, []);

  const runAudit = useCallback(async () => {
    setIsRunning(true);
    setRunError(null);
    setResolvedIds(new Set());
    setSessionLog([]);
    try {
      let customerQuery = supabase.from('customers').select('*').limit(20000);
      let attendanceQuery = supabase.from('attendance').select('*').limit(20000);

      if (!allTime) {
        customerQuery = customerQuery.gte('date', fromDate).lte('date', toDate);
        attendanceQuery = attendanceQuery.gte('date', fromDate).lte('date', toDate);
      }

      const [dismissed, pkgRes, custRes, attRes] = await Promise.all([
        fetchDismissed(),
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

      const all = [...packageIssues, ...customerIssues, ...attendanceIssues].filter((i) => !dismissed.has(i.id));

      setIssues(all);
      setHasRun(true);
    } catch (err: any) {
      console.error('Audit failed:', err);
      setRunError(err.message || 'Audit failed');
    } finally {
      setIsRunning(false);
    }
  }, [fromDate, toDate, allTime, fetchDismissed]);

  const grouped = useMemo(() => {
    const map = new Map<string, Issue[]>();
    for (const issue of issues) {
      if (resolvedIds.has(issue.id)) continue;
      if (!map.has(issue.category)) map.set(issue.category, []);
      map.get(issue.category)!.push(issue);
    }
    return [...map.entries()].sort((a, b) => {
      const sevRank = { high: 0, medium: 1, low: 2 };
      const aSev = Math.min(...a[1].map((i) => sevRank[i.severity]));
      const bSev = Math.min(...b[1].map((i) => sevRank[i.severity]));
      if (aSev !== bSev) return aSev - bSev;
      return b[1].length - a[1].length;
    });
  }, [issues, resolvedIds]);

  const totalOpenIssues = issues.length - resolvedIds.size;
  const highCount = issues.filter((i) => i.severity === 'high' && !resolvedIds.has(i.id)).length;

  const toggleCategory = (cat: string) => setExpandedCategories((prev) => ({ ...prev, [cat]: !prev[cat] }));
  const toggleHelp = (cat: string) => setExpandedHelp((prev) => ({ ...prev, [cat]: !prev[cat] }));

  const logActivity = async (action_type: string, payload: any) => {
    try {
      await supabase.from('activity_logs').insert({
        action_type,
        description: JSON.stringify(payload),
        username: user?.username || 'System',
      });
    } catch (err) {
      console.warn('Failed to write activity log:', err);
    }
  };

  /* ---------- Deterministic quick fix ---------- */

  const applyFix = async (issue: Issue) => {
    if (!issue.fix) return;
    setFixingIds((prev) => new Set(prev).add(issue.id));
    try {
      const fix = issue.fix;

      if (fix.type === 'recompute_remaining_hours') {
        const { data: row, error: fetchErr } = await supabase
          .from('packages')
          .select('total_hours, used_hours')
          .eq('id', fix.packageId)
          .single();
        if (fetchErr) throw fetchErr;
        const newRemaining = Math.max(0, round2((row?.total_hours || 0) - (row?.used_hours || 0)));
        const { error } = await supabase.from('packages').update({ remaining_hours: newRemaining }).eq('id', fix.packageId);
        if (error) throw error;
        await logActivity('audit_auto_fix', { issue_id: issue.id, category: issue.category, action: 'recompute_remaining_hours', new_remaining: newRemaining });
      }

      if (fix.type === 'mark_expired') {
        const { error } = await supabase.from('packages').update({ status: 'expired' }).eq('id', fix.packageId);
        if (error) throw error;
        await logActivity('audit_auto_fix', { issue_id: issue.id, category: issue.category, action: 'mark_expired' });
      }

      if (fix.type === 'zero_amount_paid') {
        const { error } = await supabase.from('customers').update({ amount_paid: 0 }).eq('id', fix.customerId);
        if (error) throw error;
        await logActivity('audit_auto_fix', { issue_id: issue.id, category: issue.category, action: 'zero_amount_paid' });
      }

      setResolvedIds((prev) => new Set(prev).add(issue.id));
      setSessionLog((prev) => [...prev, { label: issue.title, kind: 'fixed' }]);
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

  /* ---------- Edit & resolve ---------- */

  const openEdit = (issue: Issue) => {
    if (!issue.edit) return;
    setEditingIssue(issue);
    const values: Record<string, any> = {};
    issue.edit.fields.forEach((f) => { values[f.key] = f.value; });
    setEditValues(values);
    setEditPassword('');
    setEditRemark('');
    setEditError(null);
  };

  const buildUpdatePayload = (table: 'packages' | 'customers', values: Record<string, any>) => {
    const update: Record<string, any> = {};
    for (const [k, v] of Object.entries(values)) {
      if (k === 'check_in_time' || k === 'check_out_time') continue; // handled below
      if (k === 'package_amount' || k === 'amount_paid') {
        update[k] = Math.round(Number(v || 0) * 100);
      } else if (k === 'total_hours' || k === 'used_hours' || k === 'remaining_hours' || k === 'session_hours') {
        update[k] = Number(v) || 0;
      } else {
        update[k] = v === '' ? null : v;
      }
    }
    if (table === 'customers') {
      const dateVal = values['date'];
      if (values['check_in_time'] && dateVal) {
        const combined = new Date(`${dateVal}T${values['check_in_time']}`);
        update['check_in_time'] = isNaN(combined.getTime()) ? null : combined.toISOString();
      } else if ('check_in_time' in values) {
        update['check_in_time'] = null;
      }
      if (values['check_out_time'] && dateVal) {
        const combined = new Date(`${dateVal}T${values['check_out_time']}`);
        update['check_out_time'] = isNaN(combined.getTime()) ? null : combined.toISOString();
      } else if ('check_out_time' in values) {
        update['check_out_time'] = null;
      }
    }
    return update;
  };

  const saveEdit = async () => {
    if (!editingIssue?.edit) return;
    if (editPassword !== ADMIN_PASSWORD) {
      setEditError('Wrong admin password');
      return;
    }
    if (!editRemark.trim()) {
      setEditError('Please note a reason for this change');
      return;
    }
    setIsSavingEdit(true);
    setEditError(null);
    try {
      const { table, recordId } = editingIssue.edit;
      const update = buildUpdatePayload(table, editValues);

      const { error } = await supabase.from(table).update(update).eq('id', recordId);
      if (error) throw error;

      await logActivity('audit_manual_fix', {
        issue_id: editingIssue.id,
        category: editingIssue.category,
        table,
        record_id: recordId,
        remark: editRemark,
        changes: update,
      });

      // Re-check just this record to see if the edit actually resolved it.
      const { data: freshRow, error: refetchErr } = await supabase.from(table).select('*').eq('id', recordId).single();
      if (refetchErr) throw refetchErr;

      const stillFlagged =
        table === 'packages'
          ? checkOnePackage(freshRow as PackageRow).some((i) => i.id === editingIssue.id)
          : checkOneCustomer(freshRow as CustomerRow).some((i) => i.id === editingIssue.id);

      if (!stillFlagged) {
        setResolvedIds((prev) => new Set(prev).add(editingIssue.id));
        setSessionLog((prev) => [...prev, { label: editingIssue.title, kind: 'edited' }]);
        setEditingIssue(null);
      } else {
        setEditError('Saved — but this still doesn\u2019t fully resolve the issue based on the new values. Check the numbers and try again, or close this and leave it flagged.');
        setIsSavingEdit(false);
        return;
      }
    } catch (err: any) {
      setEditError(err.message || 'Failed to save');
    } finally {
      setIsSavingEdit(false);
    }
  };

  /* ---------- Dismiss (ignore) ---------- */

  const openDismiss = (issue: Issue) => {
    setDismissingIssue(issue);
    setDismissRemark('');
  };

  const confirmDismiss = async () => {
    if (!dismissingIssue) return;
    setIsDismissing(true);
    try {
      await logActivity('audit_dismiss_issue', {
        issue_id: dismissingIssue.id,
        category: dismissingIssue.category,
        title: dismissingIssue.title,
        remark: dismissRemark || '(no reason given)',
      });
      setResolvedIds((prev) => new Set(prev).add(dismissingIssue.id));
      setSessionLog((prev) => [...prev, { label: dismissingIssue.title, kind: 'dismissed' }]);
      setDismissingIssue(null);
    } catch (err: any) {
      alert('Failed to dismiss: ' + (err.message || 'Unknown error'));
    } finally {
      setIsDismissing(false);
    }
  };

  /* ---------- Duplicate review & resolve ---------- */

  const openReview = (issue: Issue) => {
    if (!issue.duplicateGroup) return;
    setReviewingIssue(issue);
    setKeepId(issue.duplicateGroup.recommendedKeepId);
    setReviewPassword('');
    setReviewRemark('');
    setReviewError(null);
  };

  const resolveDuplicates = async () => {
    if (!reviewingIssue?.duplicateGroup) return;
    if (reviewPassword !== ADMIN_PASSWORD) {
      setReviewError('Wrong admin password');
      return;
    }
    if (!reviewRemark.trim()) {
      setReviewError('Please note a reason for this deletion');
      return;
    }
    setIsResolvingDup(true);
    setReviewError(null);
    try {
      const { table, rows } = reviewingIssue.duplicateGroup;
      const toDelete = rows.map((r) => r.id).filter((id) => id !== keepId);

      const { error } = await supabase.from(table).delete().in('id', toDelete);
      if (error) throw error;

      await logActivity('audit_resolve_duplicates', {
        issue_id: reviewingIssue.id,
        category: reviewingIssue.category,
        table,
        kept_id: keepId,
        deleted_ids: toDelete,
        remark: reviewRemark,
      });

      setResolvedIds((prev) => new Set(prev).add(reviewingIssue.id));
      setSessionLog((prev) => [...prev, { label: reviewingIssue.title, kind: 'deleted' }]);
      setReviewingIssue(null);
    } catch (err: any) {
      setReviewError(err.message || 'Failed to delete');
    } finally {
      setIsResolvingDup(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Data Health Check</h1>
          <p className="text-sm text-gray-500 mt-1 max-w-2xl">
            Scans packages, sales, and attendance for inconsistent or suspicious data. Every issue can be
            fixed automatically, edited by hand, or dismissed as a false positive — right here. Every
            change is written to Activity Logs.
          </p>
        </div>
        {sessionLog.length > 0 && (
          <button
            onClick={() => setShowSessionLog((s) => !s)}
            className="text-sm px-3 py-2 border rounded-lg text-gray-600 hover:bg-gray-50 flex items-center gap-2 shrink-0"
          >
            <History className="h-4 w-4" /> {sessionLog.length} resolved this run
          </button>
        )}
      </div>

      {showSessionLog && sessionLog.length > 0 && (
        <div className="bg-white rounded-xl shadow-sm p-4 space-y-2">
          {sessionLog.map((entry, idx) => (
            <div key={idx} className="flex items-center gap-2 text-sm text-gray-700">
              <CheckCircle2 className="h-4 w-4 text-green-600 shrink-0" />
              <span className="capitalize text-xs font-bold text-gray-400 w-16">{entry.kind}</span>
              {entry.label}
            </div>
          ))}
        </div>
      )}

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
          All time (slower)
        </label>
        <button
          onClick={runAudit}
          disabled={isRunning}
          className="px-5 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2"
        >
          {isRunning ? <Loader2 className="animate-spin h-4 w-4" /> : <RefreshCw className="h-4 w-4" />}
          {isRunning ? 'Scanning…' : hasRun ? 'Run Again' : 'Run Audit'}
        </button>
        <p className="text-xs text-gray-400 mb-1">Packages are always checked in full regardless of this range.</p>
      </div>

      {runError && <div className="p-4 bg-red-50 text-red-700 border border-red-200 rounded-xl text-sm">{runError}</div>}

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
                  {highCount > 0 && <span className="ml-2 text-sm font-semibold text-red-600">({highCount} high priority)</span>}
                </p>
                <p className="text-sm text-gray-500">Expand a category, then Fix, Edit, Review, or Dismiss each issue.</p>
              </div>
            </>
          )}
        </div>
      )}

      {/* Results */}
      {grouped.map(([category, categoryIssues]) => {
        const isOpen = !!expandedCategories[category];
        const isHelpOpen = !!expandedHelp[category];
        const worstSeverity = categoryIssues.reduce<Severity>((worst, i) => {
          const rank = { high: 0, medium: 1, low: 2 };
          return rank[i.severity] < rank[worst] ? i.severity : worst;
        }, 'low');
        const help = CATEGORY_HELP[category];

        return (
          <div key={category} className="bg-white rounded-xl shadow-sm overflow-hidden">
            <div className="w-full flex items-center justify-between p-4 hover:bg-gray-50">
              <button onClick={() => toggleCategory(category)} className="flex items-center gap-3 text-left flex-1">
                <span className={`text-xs font-bold uppercase px-2 py-1 rounded border ${SEVERITY_STYLES[worstSeverity]}`}>
                  {worstSeverity}
                </span>
                <span className="font-semibold text-gray-800">{category}</span>
                <span className="text-sm text-gray-400">({categoryIssues.length})</span>
              </button>
              <div className="flex items-center gap-2">
                {help && (
                  <button
                    onClick={() => toggleHelp(category)}
                    className="text-xs px-2 py-1 rounded border text-blue-700 border-blue-200 hover:bg-blue-50 flex items-center gap-1"
                  >
                    <Info className="h-3 w-3" /> Explain
                  </button>
                )}
                <button onClick={() => toggleCategory(category)}>
                  {isOpen ? <ChevronUp className="h-5 w-5 text-gray-400" /> : <ChevronDown className="h-5 w-5 text-gray-400" />}
                </button>
              </div>
            </div>

            {isHelpOpen && help && (
              <div className="px-4 pb-4 -mt-2">
                <div className="bg-blue-50 border border-blue-100 text-blue-900 text-sm rounded-lg p-3">{help}</div>
              </div>
            )}

            {isOpen && (
              <div className="border-t divide-y">
                {categoryIssues.map((issue) => (
                  <div key={issue.id} className="p-4 flex items-start justify-between gap-4 flex-wrap">
                    <div className="flex-1 min-w-[240px]">
                      <p className="font-medium text-gray-800 text-sm">{issue.title}</p>
                      <p className="text-xs text-gray-500 mt-1">{issue.detail}</p>
                      {issue.mobile && <p className="text-xs text-gray-400 mt-1">Mobile: {issue.mobile}</p>}
                    </div>
                    <div className="flex flex-wrap items-center gap-2 shrink-0">
                      {issue.linkHref && (
                        <Link
                          href={issue.linkHref}
                          className="text-xs px-3 py-1.5 border rounded-lg text-blue-700 border-blue-200 hover:bg-blue-50 flex items-center gap-1"
                        >
                          <ExternalLink className="h-3 w-3" /> View
                        </Link>
                      )}
                      {issue.duplicateGroup && (
                        <button
                          onClick={() => openReview(issue)}
                          className="text-xs px-3 py-1.5 border rounded-lg text-indigo-700 border-indigo-200 hover:bg-indigo-50 flex items-center gap-1"
                        >
                          <Trash2 className="h-3 w-3" /> Review Duplicates
                        </button>
                      )}
                      {issue.edit && (
                        <button
                          onClick={() => openEdit(issue)}
                          className="text-xs px-3 py-1.5 border rounded-lg text-gray-700 border-gray-300 hover:bg-gray-50 flex items-center gap-1"
                        >
                          <Pencil className="h-3 w-3" /> Edit
                        </button>
                      )}
                      {issue.fix && (
                        <button
                          onClick={() => applyFix(issue)}
                          disabled={fixingIds.has(issue.id)}
                          className="text-xs px-3 py-1.5 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 flex items-center gap-1"
                        >
                          {fixingIds.has(issue.id) ? <Loader2 className="h-3 w-3 animate-spin" /> : <Wrench className="h-3 w-3" />}
                          {fixingIds.has(issue.id) ? 'Fixing…' : 'Quick Fix'}
                        </button>
                      )}
                      <button
                        onClick={() => openDismiss(issue)}
                        className="text-xs px-3 py-1.5 border rounded-lg text-gray-500 border-gray-200 hover:bg-gray-50 flex items-center gap-1"
                      >
                        <EyeOff className="h-3 w-3" /> Dismiss
                      </button>
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

      {/* ===================== EDIT MODAL ===================== */}
      {editingIssue?.edit && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center p-4 z-50">
          <div className="bg-white text-black rounded-xl w-full max-w-lg p-6 shadow-xl border border-gray-200 space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold">Edit & Resolve</h2>
              <button onClick={() => setEditingIssue(null)} className="text-gray-400 hover:text-gray-600">
                <X className="h-5 w-5" />
              </button>
            </div>
            <p className="text-sm text-gray-600">{editingIssue.title}</p>
            {editError && <div className="p-2 bg-red-100 text-red-700 border border-red-300 rounded text-sm">{editError}</div>}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {editingIssue.edit.fields.map((field) => (
                <div key={field.key} className={field.type === 'text' && field.key === 'name' ? 'sm:col-span-2' : ''}>
                  <label className="text-xs font-semibold text-gray-600 block mb-1">{field.label}</label>
                  <FieldInput
                    field={field}
                    value={editValues[field.key]}
                    onChange={(v) => setEditValues((prev) => ({ ...prev, [field.key]: v }))}
                  />
                </div>
              ))}
            </div>

            <div>
              <label className="text-xs font-semibold text-black">Admin Password</label>
              <input
                type="password"
                className="w-full p-2 border border-gray-300 rounded bg-white text-black"
                value={editPassword}
                onChange={(e) => setEditPassword(e.target.value)}
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-black">Reason for this correction</label>
              <textarea
                rows={2}
                className="w-full p-2 border border-gray-300 rounded bg-white text-black"
                value={editRemark}
                onChange={(e) => setEditRemark(e.target.value)}
              />
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <button onClick={() => setEditingIssue(null)} className="px-4 py-2 bg-gray-200 rounded text-black">
                Cancel
              </button>
              <button onClick={saveEdit} disabled={isSavingEdit} className="px-4 py-2 bg-blue-600 text-white rounded disabled:opacity-50">
                {isSavingEdit ? 'Saving…' : 'Save & Recheck'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ===================== DISMISS MODAL ===================== */}
      {dismissingIssue && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center p-4 z-50">
          <div className="bg-white text-black rounded-xl w-full max-w-md p-6 shadow-xl border border-gray-200 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold">Dismiss Issue</h2>
              <button onClick={() => setDismissingIssue(null)} className="text-gray-400 hover:text-gray-600">
                <X className="h-5 w-5" />
              </button>
            </div>
            <p className="text-sm text-gray-600">
              "{dismissingIssue.title}" won't be shown again on future audit runs. This doesn't change any
              data — use it for false positives only.
            </p>
            <div>
              <label className="text-xs font-semibold text-black">Why is this not actually an issue? (optional)</label>
              <textarea
                rows={2}
                className="w-full p-2 border border-gray-300 rounded bg-white text-black"
                value={dismissRemark}
                onChange={(e) => setDismissRemark(e.target.value)}
              />
            </div>
            <div className="flex justify-end gap-3 pt-2">
              <button onClick={() => setDismissingIssue(null)} className="px-4 py-2 bg-gray-200 rounded text-black">
                Cancel
              </button>
              <button
                onClick={confirmDismiss}
                disabled={isDismissing}
                className="px-4 py-2 bg-gray-700 text-white rounded disabled:opacity-50"
              >
                {isDismissing ? 'Dismissing…' : 'Dismiss'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ===================== DUPLICATE REVIEW MODAL ===================== */}
      {reviewingIssue?.duplicateGroup && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center p-4 z-50">
          <div className="bg-white text-black rounded-xl w-full max-w-3xl p-6 shadow-xl border border-gray-200 space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold">Review Duplicates</h2>
              <button onClick={() => setReviewingIssue(null)} className="text-gray-400 hover:text-gray-600">
                <X className="h-5 w-5" />
              </button>
            </div>
            <p className="text-sm text-gray-600">
              Pick the row to keep. Everything else in this group will be permanently deleted. The
              recommended row is pre-selected based on which one has activity against it.
            </p>
            {reviewError && <div className="p-2 bg-red-100 text-red-700 border border-red-300 rounded text-sm">{reviewError}</div>}

            <div className="overflow-x-auto">
              <table className="min-w-full text-xs border">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="p-2 text-left">Keep?</th>
                    {reviewingIssue.duplicateGroup.columns.map((col) => (
                      <th key={col.key} className="p-2 text-left">{col.label}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {reviewingIssue.duplicateGroup.rows.map((row) => (
                    <tr
                      key={row.id}
                      className={`border-t ${row.id === keepId ? 'bg-green-50' : ''} ${row.id === reviewingIssue.duplicateGroup!.recommendedKeepId ? '' : ''}`}
                    >
                      <td className="p-2">
                        <input type="radio" name="keepRow" checked={keepId === row.id} onChange={() => setKeepId(row.id)} />
                        {row.id === reviewingIssue.duplicateGroup!.recommendedKeepId && (
                          <span className="ml-1 text-[10px] text-green-700 font-bold uppercase">Suggested</span>
                        )}
                      </td>
                      {reviewingIssue.duplicateGroup!.columns.map((col) => (
                        <td key={col.key} className="p-2 whitespace-nowrap">
                          {col.format ? col.format(row[col.key]) : String(row[col.key] ?? '—')}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div>
              <label className="text-xs font-semibold text-black">Admin Password</label>
              <input
                type="password"
                className="w-full p-2 border border-gray-300 rounded bg-white text-black"
                value={reviewPassword}
                onChange={(e) => setReviewPassword(e.target.value)}
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-black">Reason for deleting the others</label>
              <textarea
                rows={2}
                className="w-full p-2 border border-gray-300 rounded bg-white text-black"
                value={reviewRemark}
                onChange={(e) => setReviewRemark(e.target.value)}
              />
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <button onClick={() => setReviewingIssue(null)} className="px-4 py-2 bg-gray-200 rounded text-black">
                Cancel
              </button>
              <button
                onClick={resolveDuplicates}
                disabled={isResolvingDup}
                className="px-4 py-2 bg-red-700 text-white rounded disabled:opacity-50"
              >
                {isResolvingDup
                  ? 'Deleting…'
                  : `Keep 1, Delete ${reviewingIssue.duplicateGroup.rows.length - 1}`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
