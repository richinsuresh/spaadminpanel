'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';

type ActivityRow = {
  id: string;
  action: string;
  description: string;
  username: string | null;
  created_at: string;
};

type ParsedDescription =
  | {
      remark?: string;
      before?: Record<string, any> | null;
      after?: Record<string, any> | null;
    }
  | null;

const formatDateTime = (iso: string) => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });
};

const labelForAction = (action: string) => {
  if (action.startsWith('edit_')) return 'Edited';
  if (action.startsWith('delete_')) return 'Deleted';
  if (action.startsWith('create_')) return 'Created';
  return action;
};

const entityForAction = (action: string) => {
  const parts = action.split('_');
  const last = parts[parts.length - 1] || '';
  return last.charAt(0).toUpperCase() + last.slice(1);
};

const parseDescription = (raw: string): ParsedDescription => {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object') {
      return parsed as any;
    }
    return null;
  } catch {
    // not JSON, plain text description
    return null;
  }
};

const getChangedFields = (before: any, after: any): Array<{
  field: string;
  before: any;
  after: any;
}> => {
  const allKeys = Array.from(
    new Set([
      ...Object.keys(before || {}),
      ...Object.keys(after || {}),
    ]),
  );

  return allKeys
    .map((key) => ({
      field: key,
      before: before ? before[key] : undefined,
      after: after ? after[key] : undefined,
    }))
    .filter(
      (row) =>
        JSON.stringify(row.before) !== JSON.stringify(row.after),
    );
};

export default function ActivityPage() {
  const [rows, setRows] = useState<ActivityRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [actionFilter, setActionFilter] = useState<
    'all' | 'sales' | 'packages' | 'customers' | 'attendance' | 'employees'
  >('all');

  useEffect(() => {
    const fetchActivity = async () => {
      setLoading(true);
      setErrorMsg(null);

      const { data, error } = await supabase
        .from('activity_logs')
        .select('id, action_type, description, username, created_at')
        .order('created_at', { ascending: false })
        .limit(200);

      if (error) {
        console.error(error);
        setErrorMsg('Failed to load activity');
        setRows([]);
      } else {
        const mapped: ActivityRow[] = (data || []).map((r: any) => ({
          id: String(r.id),
          action: r.action_type ?? '',
          description: r.description ?? '',
          username: r.username ?? null,
          created_at: r.created_at,
        }));
        setRows(mapped);
      }

      setLoading(false);
    };

    fetchActivity();
  }, []);

  const filteredRows = rows.filter((row) => {
    if (actionFilter === 'all') return true;
    if (actionFilter === 'sales') return row.action.includes('sale');
    if (actionFilter === 'packages') return row.action.includes('package');
    if (actionFilter === 'customers') return row.action.includes('customer');
    if (actionFilter === 'attendance') return row.action.includes('attendance');
    if (actionFilter === 'employees') return row.action.includes('employee');
    return true;
  });

  return (
    <div className="max-w-5xl mx-auto py-8 px-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-6 gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-black">
            Activity Log
          </h1>
          <p className="text-sm text-black mt-1">
            See all edits made in Sales, Packages, Customers, Attendance and Employees.
          </p>
        </div>

        <div className="flex flex-wrap gap-2 text-sm">
          <select
            value={actionFilter}
            onChange={(e) =>
              setActionFilter(e.target.value as any)
            }
            className="border border-gray-300 rounded-lg px-3 py-2 bg-white text-black"
          >
            <option value="all">All</option>
            <option value="sales">Sales</option>
            <option value="packages">Packages</option>
            <option value="customers">Customers</option>
            <option value="attendance">Attendance</option>
            <option value="employees">Employees</option>
          </select>
        </div>
      </div>

      {loading ? (
        <div className="bg-white rounded-xl shadow p-6 text-center text-black">
          Loading activity…
        </div>
      ) : errorMsg ? (
        <div className="bg-white rounded-xl shadow p-6 text-center text-red-600">
          {errorMsg}
        </div>
      ) : filteredRows.length === 0 ? (
        <div className="bg-white rounded-xl shadow p-6 text-center text-black">
          No activity found.
        </div>
      ) : (
        <div className="space-y-4">
          {filteredRows.map((row) => {
            const parsed = parseDescription(row.description);
            const remark = parsed?.remark;
            const before = parsed?.before ?? null;
            const after = parsed?.after ?? null;
            const diffs =
              before && after ? getChangedFields(before, after) : [];

            const isExpanded = expandedId === row.id;

            return (
              <div
                key={row.id}
                className="bg-white rounded-xl shadow border border-gray-100 p-4"
              >
                <div className="flex justify-between items-start gap-4">
                  <div className="flex flex-col gap-1">
                    <div className="text-sm text-black">
                      {formatDateTime(row.created_at)}
                    </div>
                    <div className="text-base font-semibold text-black">
                      {labelForAction(row.action)}{' '}
                      <span className="text-black">
                        {entityForAction(row.action)}
                      </span>
                    </div>

                    {row.username && (
                      <div className="text-xs text-black">
                        By {row.username}
                      </div>
                    )}

                    {/* Remark / description */}
                    {remark && (
                      <div className="mt-2 text-sm text-black">
                        <span className="font-medium">Remark: </span>
                        {remark}
                      </div>
                    )}
                    {!parsed && row.description && (
                      <div className="mt-2 text-sm text-black">
                        {row.description}
                      </div>
                    )}
                  </div>

                  {before && after && (
                    <button
                      onClick={() =>
                        setExpandedId(isExpanded ? null : row.id)
                      }
                      className="text-xs px-3 py-1 rounded-full border border-gray-300 text-black hover:bg-gray-50"
                    >
                      {isExpanded ? 'Hide changes' : 'View changes'}
                    </button>
                  )}
                </div>

                {before && after && isExpanded && (
                  <div className="mt-4 overflow-x-auto">
                    {diffs.length === 0 ? (
                      <div className="text-sm text-black">
                        No visible field changes (maybe only remark changed).
                      </div>
                    ) : (
                      <table className="min-w-full text-sm border border-gray-200 rounded-lg overflow-hidden">
                        <thead className="bg-gray-50">
                          <tr>
                            <th className="px-3 py-2 text-left text-xs font-medium text-black uppercase">
                              Field
                            </th>
                            <th className="px-3 py-2 text-left text-xs font-medium text-black uppercase">
                              Before
                            </th>
                            <th className="px-3 py-2 text-left text-xs font-medium text-black uppercase">
                              After
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {diffs.map((d) => (
                            <tr key={d.field} className="border-t">
                              <td className="px-3 py-2 font-medium text-black">
                                {d.field}
                              </td>
                              <td className="px-3 py-2 text-black">
                                {String(d.before ?? '—')}
                              </td>
                              <td className="px-3 py-2 text-black bg-green-50">
                                {String(d.after ?? '—')}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
