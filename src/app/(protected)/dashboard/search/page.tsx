'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { exportToExcel } from '@/lib/exportToExcel';
import { Search, Loader2, FileText } from 'lucide-react';

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
  [k: string]: any;
};

const formatDateTime = (iso: string | null) => {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return 'Invalid';
  return d.toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hour12: true });
};

const formatDateOnly = (iso: string | null) => {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return 'Invalid';
  return d.toLocaleDateString('en-IN');
};

/**
 * Format duration stored as decimal hours (e.g. 1.5 => "1 hr 30 min", 0.75 => "45 mins")
 * Careful numeric handling (digit-by-digit reasoning):
 * - Convert to Number
 * - If < 1 hour: round(n*60) -> minutes
 * - Else split integer hours and remainder minutes
 */
const formatDuration = (h: number | null | undefined): string => {
  if (h === null || h === undefined) return '—';
  const n = Number(h);
  if (!Number.isFinite(n) || n === 0) return '—';

  // compute minutes precisely
  const totalMinutes = Math.round(n * 60); // e.g. 1.5 * 60 = 90
  if (totalMinutes < 60) return `${totalMinutes} mins`;

  const hours = Math.floor(totalMinutes / 60); // integer hours
  const minutes = totalMinutes - hours * 60; // remaining minutes (digit-by-digit safe)
  if (minutes === 0) return `${hours} hr${hours > 1 ? 's' : ''}`;
  return `${hours} hr ${minutes} min`;
};

/** If check-in exists and session_hours provided, estimate checkout Date object or null */
const getExpectedCheckoutTime = (checkInIso: string | null, hrs: number | null | undefined): Date | null => {
  if (!checkInIso || !hrs) return null;
  const dt = new Date(checkInIso);
  if (Number.isNaN(dt.getTime())) return null;
  const msToAdd = Math.round(hrs * 60 * 60 * 1000); // hours -> ms (digit-by-digit)
  return new Date(dt.getTime() + msToAdd);
};

export default function ClientHistoryPage() {
  const [history, setHistory] = useState<HistoryRow[]>([]);
  const [filtered, setFiltered] = useState<HistoryRow[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [isExporting, setIsExporting] = useState(false);

  const fetchHistory = useCallback(async (filterMobile?: string | null) => {
    setLoading(true);
    try {
      // select fields including session_hours
      const selectFields = [
        'id',
        'date',
        'name',
        'mobile',
        'treatment',
        'session_hours',
        'amount_paid',
        'took_package',
        'package_amount',
        'check_in_time',
        'check_out_time',
        'therapist_name',
        'outlet_name'
      ].join(', ');

      let query = supabase
        .from('customers')
        .select(selectFields)
        .order('date', { ascending: false })
        .limit(1000);

      if (filterMobile) {
        query = query.eq('mobile', filterMobile);
      }

      const { data, error } = await query;

      if (error) {
        console.error('Error fetching client history', error);
        setHistory([]);
        setFiltered([]);
        setLoading(false);
        return;
      }

      const rows = Array.isArray(data) ? data.map((r: any) => ({
        id: String(r.id),
        date: r.date ?? null,
        name: r.name ?? null,
        mobile: r.mobile ?? null,
        treatment: r.treatment ?? null,
        session_hours: r.session_hours !== undefined && r.session_hours !== null ? Number(r.session_hours) : null,
        amount_paid: r.amount_paid !== undefined && r.amount_paid !== null ? Number(r.amount_paid) : null,
        took_package: !!r.took_package,
        package_amount: r.package_amount !== undefined && r.package_amount !== null ? Number(r.package_amount) : null,
        check_in_time: r.check_in_time ?? null,
        check_out_time: r.check_out_time ?? null,
        therapist_name: r.therapist_name ?? null,
        outlet_name: r.outlet_name ?? null,
        ...r
      })) : [];

      setHistory(rows);
      setFiltered(rows);
    } catch (e) {
      console.error('fetchHistory failed', e);
      setHistory([]);
      setFiltered([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // initially fetch all history (or you may prefer to fetch by a particular mobile)
    fetchHistory().catch((e) => console.warn(e));
  }, [fetchHistory]);

  // simple search across name / mobile / treatment
  useEffect(() => {
    if (!searchTerm) {
      setFiltered(history);
      return;
    }
    const lower = searchTerm.toLowerCase();
    setFiltered(history.filter((r) =>
      (r.name ?? '').toLowerCase().includes(lower) ||
      (r.mobile ?? '').toLowerCase().includes(lower) ||
      (r.treatment ?? '').toLowerCase().includes(lower) ||
      (r.therapist_name ?? '').toLowerCase().includes(lower) ||
      (r.outlet_name ?? '').toLowerCase().includes(lower)
    ));
  }, [searchTerm, history]);

  const handleExport = async () => {
    setIsExporting(true);
    try {
      const data = filtered.map((r) => ({
        Date: formatDateOnly(r.date),
        'Check-in': formatDateTime(r.check_in_time),
        'Check-out': formatDateTime(r.check_out_time),
        Name: r.name ?? '-',
        Mobile: r.mobile ?? '-',
        Service: r.treatment ?? '-',
        Duration: formatDuration(r.session_hours),
        'Therapist': r.therapist_name ?? '-',
        'Outlet': r.outlet_name ?? '-',
        'Amount (INR)': r.took_package ? (r.package_amount ?? 0) / 100 : (r.amount_paid ?? 0) / 100,
      }));
      if (data.length === 0) {
        alert('No history to export');
        setIsExporting(false);
        return;
      }
      exportToExcel(data, `Client_History_${new Date().toISOString().split('T')[0]}.xlsx`);
    } catch (e) {
      console.error('Export failed', e);
      alert('Export failed — check console');
    } finally {
      setIsExporting(false);
    }
  };

  const rows = useMemo(() => filtered, [filtered]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Client History</h1>
          <p className="text-sm text-gray-500">Recent visits and treatments</p>
        </div>

        <div className="flex items-center gap-3">
          <div className="relative">
            <Search className="absolute left-3 top-2.5 text-gray-400 h-4 w-4" />
            <input
              type="text"
              placeholder="Search by name, mobile or treatment..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10 pr-3 py-2 border rounded-lg text-sm w-96 text-black"
            />
          </div>

          <button
            onClick={() => fetchHistory().catch((e) => console.warn(e))}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm"
          >
            Refresh
          </button>

          <button
            onClick={handleExport}
            className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 text-sm flex items-center gap-2"
            disabled={isExporting || loading || rows.length === 0}
          >
            {isExporting ? <Loader2 className="animate-spin h-4 w-4" /> : <FileText size={16} />} Export
          </button>
        </div>
      </div>

      <div className="bg-white shadow rounded-lg overflow-hidden border border-gray-200">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Service</th>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Duration</th>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Times</th>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Therapist</th>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Outlet</th>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Amount</th>
              </tr>
            </thead>

            <tbody className="bg-white divide-y divide-gray-200">
              {loading ? (
                <tr><td colSpan={7} className="p-6 text-center text-gray-500">Loading…</td></tr>
              ) : rows.length === 0 ? (
                <tr><td colSpan={7} className="p-6 text-center text-gray-500">No history found.</td></tr>
              ) : (
                rows.map((r) => {
                  const expected = getExpectedCheckoutTime(r.check_in_time, r.session_hours);
                  const displayAmount = r.took_package ? (r.package_amount ?? 0) / 100 : (r.amount_paid ?? 0) / 100;
                  return (
                    <tr key={r.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 text-sm text-gray-700 whitespace-nowrap">{formatDateOnly(r.date)}</td>

                      <td className="px-4 py-3 text-sm text-gray-900 max-w-xs">
                        <div className="font-medium">{r.treatment ?? '—'}</div>
                        <div className="text-xs text-gray-500">{r.name ?? '—'} • {r.mobile ?? '—'}</div>
                      </td>

                      <td className="px-4 py-3 text-sm text-gray-700 whitespace-nowrap">{formatDuration(r.session_hours)}</td>

                      <td className="px-4 py-3 text-sm text-gray-700">
                        <div>In: {r.check_in_time ? new Date(r.check_in_time).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true }) : '—'}</div>
                        <div>Out: {r.check_out_time ? new Date(r.check_out_time).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true }) : '—'}</div>
                        {!r.check_out_time && (
                          <div className="text-xs text-gray-400">Est: {expected ? expected.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true }) : '—'}</div>
                        )}
                      </td>

                      <td className="px-4 py-3 text-sm text-gray-700 whitespace-nowrap">{r.therapist_name ?? '—'}</td>

                      <td className="px-4 py-3 text-sm text-gray-700 whitespace-nowrap">{r.outlet_name ?? '—'}</td>

                      <td className="px-4 py-3 text-sm text-gray-900 whitespace-nowrap font-medium">₹{(displayAmount).toLocaleString()}</td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
