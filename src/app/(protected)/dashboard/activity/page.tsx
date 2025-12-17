'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { Search, User } from 'lucide-react'; // Added icons for clarity

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

type EmployeeMeta = {
  id: string;
  name: string;
  role: string | null;
  username?: string; // Added to help mapping
};

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
  const [searchTerm, setSearchTerm] = useState(''); // Search state
  const [actionFilter, setActionFilter] = useState<
    'all' | 'sales' | 'packages' | 'customers' | 'attendance' | 'employees'
  >('all');

  const [employeeLabelMap, setEmployeeLabelMap] = useState<
    Record<string, string>
  >({});

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

  // Fetch employees to map usernames to real names
  useEffect(() => {
    const fetchEmployees = async () => {
      const { data, error } = await supabase
        .from('employees')
        .select('id, name, role');

      if (error) {
        console.error('Failed to load employees for activity labels', error);
        return;
      }

      const map: Record<string, string> = {};
      (data as EmployeeMeta[] | null)?.forEach((emp) => {
        const role = emp.role ? emp.role.trim() : '';
        // Map the identifier to "Name (Role)"
        map[emp.name.toLowerCase()] = role ? `${emp.name} (${role})` : emp.name;
      });

      setEmployeeLabelMap(map);
    };

    fetchEmployees();
  }, []);

  const filteredRows = rows.filter((row) => {
    // Category Filter
    let matchesCategory = true;
    if (actionFilter !== 'all') {
        const action = row.action.toLowerCase();
        if (actionFilter === 'sales') matchesCategory = action.includes('sale');
        else if (actionFilter === 'packages') matchesCategory = action.includes('package');
        else if (actionFilter === 'customers') matchesCategory = action.includes('customer');
        else if (actionFilter === 'attendance') matchesCategory = action.includes('attendance');
        else if (actionFilter === 'employees') matchesCategory = action.includes('employee');
    }

    if (!matchesCategory) return false;

    // Search Filter
    if (searchTerm.trim() === '') return true;
    
    const term = searchTerm.toLowerCase();
    const parsed = parseDescription(row.description);
    const targetName = (parsed?.after?.name || parsed?.before?.name || parsed?.after?.customer_name || parsed?.before?.customer_name || '').toLowerCase();
    const targetMobile = (parsed?.after?.mobile || parsed?.before?.mobile || parsed?.after?.phone || parsed?.before?.phone || '');
    const actionLabel = labelForAction(row.action).toLowerCase();
    const username = (row.username || '').toLowerCase();

    return (
        targetName.includes(term) || 
        targetMobile.includes(term) || 
        actionLabel.includes(term) ||
        username.includes(term)
    );
  });

  return (
    <div className="max-w-5xl mx-auto py-8 px-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-6 gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-black">
            Activity Log
          </h1>
          <p className="text-sm text-black mt-1">
            Track edits and deletions across your spa.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3 text-sm">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
            <input
              type="text"
              placeholder="Search name or mobile..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-black w-full sm:w-64"
            />
          </div>

          <select
            value={actionFilter}
            onChange={(e) => setActionFilter(e.target.value as any)}
            className="border border-gray-300 rounded-lg px-3 py-2 bg-white text-black"
          >
            <option value="all">All Categories</option>
            <option value="sales">Sales</option>
            <option value="packages">Packages</option>
            <option value="customers">Customers</option>
            <option value="attendance">Attendance</option>
            <option value="employees">Employees</option>
          </select>
        </div>
      </div>

      {loading ? (
        <div className="bg-white rounded-xl shadow p-6 text-center text-black">Loading...</div>
      ) : errorMsg ? (
        <div className="bg-white rounded-xl shadow p-6 text-center text-red-600">{errorMsg}</div>
      ) : filteredRows.length === 0 ? (
        <div className="bg-white rounded-xl shadow p-6 text-center text-black">No activity found.</div>
      ) : (
        <div className="space-y-4">
          {filteredRows.map((row) => {
            const parsed = parseDescription(row.description);
            const remark = parsed?.remark;
            const before = parsed?.before ?? null;
            const after = parsed?.after ?? null;
            
            const targetName = after?.name || before?.name || after?.customer_name || before?.customer_name;
            const targetMobile = after?.mobile || before?.mobile || after?.phone || before?.phone;

            const diffs = before && after ? getChangedFields(before, after) : [];
            const isExpanded = expandedId === row.id;

            // Resolve the name of the user who performed the action
            const rawUser = (row.username || '').toLowerCase();
            const displayUser = employeeLabelMap[rawUser] || row.username || 'System';

            return (
              <div key={row.id} className="bg-white rounded-xl shadow border border-gray-100 p-4">
                <div className="flex justify-between items-start gap-4">
                  <div className="flex flex-col gap-1">
                    <div className="text-sm text-gray-500">{formatDateTime(row.created_at)}</div>
                    <div className="text-base font-semibold text-black">
                      {labelForAction(row.action)} <span className="text-gray-700">{entityForAction(row.action)}</span>
                    </div>

                    {(targetName || targetMobile) && (
                      <div className="mt-1 text-sm font-medium text-blue-700 bg-blue-50 px-2 py-1 rounded inline-block w-fit">
                        Affected: {targetName || 'N/A'} {targetMobile ? `(${targetMobile})` : ''}
                      </div>
                    )}

                    <div className="flex items-center gap-1 text-xs text-gray-600 mt-1">
                      <User size={12} />
                      Performed by: <span className="font-semibold text-black">{displayUser}</span>
                    </div>

                    {remark && (
                      <div className="mt-2 text-sm text-gray-800">
                        <span className="font-medium">Remark: </span>{remark}
                      </div>
                    )}
                  </div>

                  {before && after && (
                    <button
                      onClick={() => setExpandedId(isExpanded ? null : row.id)}
                      className="text-xs px-3 py-1 rounded-full border border-gray-300 text-black hover:bg-gray-50"
                    >
                      {isExpanded ? 'Hide changes' : 'View changes'}
                    </button>
                  )}
                </div>

                {before && after && isExpanded && (
                  <div className="mt-4 overflow-x-auto">
                    <table className="min-w-full text-sm border border-gray-200 rounded-lg overflow-hidden">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-3 py-2 text-left text-xs font-medium text-black uppercase">Field</th>
                          <th className="px-3 py-2 text-left text-xs font-medium text-black uppercase">Before</th>
                          <th className="px-3 py-2 text-left text-xs font-medium text-black uppercase">After</th>
                        </tr>
                      </thead>
                      <tbody>
                        {diffs.map((d) => (
                          <tr key={d.field} className="border-t">
                            <td className="px-3 py-2 font-medium text-black">{d.field}</td>
                            <td className="px-3 py-2 text-gray-600">{String(d.before ?? '—')}</td>
                            <td className="px-3 py-2 text-black bg-green-50">{String(d.after ?? '—')}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
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