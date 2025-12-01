'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import { useUser } from '@/context/UserContext';
import { exportToExcel } from '@/lib/exportToExcel';
import { Loader2, ShieldAlert, FileText, Search, X, Pencil, Code } from 'lucide-react';

/* ---------------- Types ---------------- */
type Log = {
  id: string;
  username: string;
  action_type: string;
  description: string;
  created_at: string;
};

type EnrichedLog = Log & {
  clientName?: string | null;
  clientMobile?: string | null;
  outletName?: string | null;
  packageName?: string | null;
  _parsedChanges?: { field: string; before: string | null; after: string | null }[] | null;
};

/* ---------------- Format Helpers ---------------- */
const formatDate = (dateString: string) => {
  if (!dateString) return '-';
  return new Date(dateString).toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true
  });
};

// **Enhanced ID extraction** (Same as previous, finds IDs in JSON or text)
const extractSaleIds = (text: string): string[] => {
  if (!text) return [];
  const ids = new Set<string>();
  const idRegex = /([a-z0-9-]{6,80})/;
  
  // 1. Extract from plain text using explicit keys
  const explicitRegex = /(?:sale[\s-_]*id|sale|id|package[\s-_]*id|customer[\s-_]*id)\s*[:#-]?\s*([a-z0-9-]{6,80})/ig;
  let m;
  while ((m = explicitRegex.exec(text))) {
    if (m[1]) ids.add(m[1].trim());
  }

  // 2. Extract from JSON keys 
  try {
    const parsed = JSON.parse(text);
    if (parsed && typeof parsed === 'object') {
      const checkObject = (obj: any) => {
        if (!obj || typeof obj !== 'object') return;
        
        Object.keys(obj).forEach(key => {
          const value = String(obj[key]);
          const lowerKey = key.toLowerCase();
          
          if ((lowerKey.includes('id') || lowerKey.includes('ref')) && idRegex.test(value)) {
            ids.add(value.trim());
          }
          
          if (typeof obj[key] === 'object' && obj[key] !== null) {
            checkObject(obj[key]);
          }
        });
      };
      
      checkObject(parsed);
    }
  } catch (e) {
    // Not JSON, continue
  }

  return Array.from(ids);
};

/** Parse description for structured changes. (Logic kept the same) */
const parseChangesFromDescription = (desc: string): { field: string; before: string | null; after: string | null }[] => {
  if (!desc) return [];

  const safeString = (v: any) => {
    if (v === undefined || v === null) return null;
    if (typeof v === 'object') return JSON.stringify(v, null, 2);
    return String(v);
  };

  try {
    const parsed = JSON.parse(desc);
    if (parsed && typeof parsed === 'object') {
      if (parsed.before && parsed.after && typeof parsed.before === 'object' && typeof parsed.after === 'object') {
        const keys = Array.from(new Set([...Object.keys(parsed.before), ...Object.keys(parsed.after)]));
        return keys
          .map((k) => ({
            field: k,
            before: safeString(parsed.before[k]),
            after: safeString(parsed.after[k])
          }))
          .filter(c => c.before !== c.after);
      }
      if (Array.isArray((parsed as any).changes)) {
        return (parsed as any).changes.map((c: any) => ({
          field: String(c.field ?? c.key ?? 'unknown'),
          before: safeString(c.before),
          after: safeString(c.after)
        }));
      }
      if (Array.isArray(parsed) && parsed.length > 0 && parsed.every((x: any) => x.field && ('before' in x || 'after' in x))) {
        return parsed.map((c: any) => ({
          field: String(c.field),
          before: safeString(c.before),
          after: safeString(c.after)
        }));
      }
    }
  } catch (e) { /* not JSON */ }

  const results: { field: string; before: string | null; after: string | null }[] = [];
  const verbalRegex = /changed\s+([a-zA-Z0-Z0-9_\s]+?)\s+from\s+['"]?([^'"]+?)['"]?\s+to\s+['"]?([^'"]+?)['"]?/ig;
  let m;
  while ((m = verbalRegex.exec(desc))) {
    results.push({ field: (m[1] || '').trim(), before: m[2] || null, after: m[3] || null });
  }

  const arrowRegex = /([\w\s_]+?)\s*[:]\s*['"]([^'"]*?)['"]\s*[-=]>\s*['"]([^'"]*?)['"]/ig;
  while ((m = arrowRegex.exec(desc))) {
    results.push({ field: (m[1] || '').trim(), before: m[2] || null, after: m[3] || null });
  }

  const simpleRegex = /([\w\s_]+?)\s+changed\s+from\s+([^\.;,]+?)\s+to\s+([^\.;,]+?)(?:[.,;]|$)/ig;
  while ((m = simpleRegex.exec(desc))) {
    results.push({ field: (m[1] || '').trim(), before: (m[2] || '').trim(), after: (m[3] || '').trim() });
  }

  return results.filter(c => c.before !== c.after);
};


/* ---------------- Components ---------------- */

const ChangeTable = ({ changes }: { changes: { field: string; before: string | null; after: string | null }[] }) => {
  return (
    <div className="overflow-auto max-h-96 border border-gray-100 rounded-xl">
      <table className="min-w-full text-sm divide-y divide-gray-100">
        <thead className="bg-gray-50 sticky top-0">
          <tr className="text-xs text-gray-500 uppercase tracking-wider">
            <th className="px-4 py-2 text-left">Field</th>
            <th className="px-4 py-2 text-left">Before</th>
            <th className="px-4 py-2 text-left">After</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {changes.map((c, i) => (
            <tr key={i} className="hover:bg-indigo-50/20 transition-colors">
              <td className="px-4 py-3 align-top font-semibold text-gray-800">{c.field}</td>
              <td className="px-4 py-3 align-top text-gray-600 max-w-xs whitespace-pre-wrap break-words">{c.before ?? '—'}</td>
              <td className="px-4 py-3 align-top text-green-700 font-medium max-w-xs whitespace-pre-wrap break-words">{c.after ?? '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

const LogDescriptionDisplay = ({ log }: { log: EnrichedLog }) => {
  const parsed = log._parsedChanges;

  if (parsed && parsed.length > 0) {
    return (
      <div className="flex items-center gap-2 text-sm text-gray-700">
        <Pencil className="h-4 w-4 text-indigo-500 shrink-0" />
        <span className="font-medium text-indigo-700">{parsed.length} field{parsed.length > 1 ? 's' : ''} changed.</span>
        {log.packageName && <span className="text-xs text-gray-600 truncate ml-1">({log.packageName})</span>}
        <span className="text-gray-500 truncate ml-2 text-xs">({parsed.map(c => c.field).join(', ')})</span>
      </div>
    );
  }

  const isJson = (str: string) => {
    try {
      JSON.parse(str);
      return true;
    } catch (e) {
      return false;
    }
  };

  if (isJson(log.description)) {
    return (
      <div className="flex items-center gap-2 text-sm text-gray-700">
        <Code className="h-4 w-4 text-orange-500 shrink-0" />
        <span className="font-medium text-orange-700">Raw Data Log</span>
        {log.packageName && <span className="text-xs text-gray-600 truncate ml-1">({log.packageName})</span>}
        <span className="text-gray-500 truncate ml-2 text-xs">{log.action_type.includes('CREATE') ? 'Record created.' : 'Data stored as JSON.'}</span>
      </div>
    );
  }

  return (
    <div className="text-sm text-gray-600 truncate">{log.description}</div>
  );
};


/* ---------------- Main Component ---------------- */
export default function ActivityPage() {
  const { user, isLoading } = useUser();
  const [logs, setLogs] = useState<EnrichedLog[]>([]);
  const [filteredLogs, setFilteredLogs] = useState<EnrichedLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');

  const [selectedLog, setSelectedLog] = useState<EnrichedLog | null>(null);

  // **CRITICALLY UPDATED** enrichLogs function
  const enrichLogs = async (rawLogs: Log[]): Promise<EnrichedLog[]> => {
    if (!rawLogs || rawLogs.length === 0) return [];

    const allIds = new Set<string>();
    rawLogs.forEach(l => {
      extractSaleIds(l.description).forEach(id => allIds.add(id));
    });

    const uniqueIds = Array.from(allIds).filter(id => id); 
    let customersMap: Record<string, { name?: string | null; mobile?: string | null; outlet_name?: string | null; }> = {};
    let packageMap: Record<string, { package_name?: string | null, customer_id?: string | null }> = {};

    if (uniqueIds.length > 0) {
      try {
        // 1. Fetch Customer Info (The Source of Client Name/Mobile)
        const { data: customers } = await supabase
          .from('customers')
          .select('id, name, mobile, outlet_name')
          .in('id', uniqueIds);

        if (Array.isArray(customers)) {
          customers.forEach((c: any) => {
            if (c && c.id) {
              customersMap[c.id] = {
                name: c.name ?? null,
                mobile: c.mobile ?? null,
                outlet_name: c.outlet_name ?? null
              };
            }
          });
        }

        // 2. Fetch Package Info 
        const { data: packages } = await supabase
          .from('packages')
          .select('id, package_name, customer_id')
          .in('id', uniqueIds);

        if (Array.isArray(packages)) {
            packages.forEach((p: any) => {
                if (p && p.id) {
                    packageMap[p.id] = { 
                        package_name: p.package_name ?? null,
                        customer_id: p.customer_id ?? null 
                    };
                }
            });
        }

      } catch (e) {
        console.warn('Failed to enrich logs with customer/package info', e);
      }
    }

    const enriched: EnrichedLog[] = rawLogs.map((l) => {
      const ids = extractSaleIds(l.description);
      const parsedChanges = parseChangesFromDescription(l.description);
      
      let cust: { name?: string | null; mobile?: string | null; outlet_name?: string | null; } | undefined;
      let pkg: { package_name?: string | null, customer_id?: string | null } | undefined;
      let linkedCustomerId: string | null = null;
      
      // Iterate through all found IDs to find the best link
      for (const id of ids) {
          if (customersMap[id]) {
              // Found customer directly by ID
              cust = customersMap[id];
              linkedCustomerId = id;
          }
          if (packageMap[id]) {
              // Found package by ID
              pkg = packageMap[id];
              if (packageMap[id]?.customer_id) {
                  linkedCustomerId = packageMap[id]?.customer_id;
              }
          }
      }

      // Fallback: If we found a linked customer ID from a package, use that customer data if not found already
      if (linkedCustomerId && !cust) {
          cust = customersMap[linkedCustomerId];
      }

      // Prioritize Name/Mobile from the database lookup, or fall back to changes if available
      const detectedClientName = 
          cust?.name ?? 
          parsedChanges.find(c => c.field.toLowerCase().includes('client') || c.field.toLowerCase().includes('customer_name') && c.after)?.after ?? 
          null;
          
      const detectedClientMobile = 
          cust?.mobile ?? 
          parsedChanges.find(c => c.field.toLowerCase().includes('mobile') || c.field.toLowerCase().includes('phone') && c.after)?.after ?? 
          null;
          
      const detectedOutletName = cust?.outlet_name ?? null;

      // Determine the best package name source
      const detectedPackageName = 
          pkg?.package_name ?? 
          parsedChanges.find(c => c.field.toLowerCase().includes('package_name') && c.after)?.after ?? 
          null;

      return {
        ...l,
        clientName: detectedClientName, 
        clientMobile: detectedClientMobile, 
        outletName: detectedOutletName, 
        packageName: detectedPackageName,
        _parsedChanges: parsedChanges.length > 0 ? parsedChanges : null,
      };
    });

    return enriched;
  };

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('activity_logs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(500);

      if (error) {
        console.error('Error fetching activity_logs', error);
        setLogs([]);
        setFilteredLogs([]);
        setLoading(false);
        return;
      }

      const rawLogs = (data || []) as Log[];
      const enriched = await enrichLogs(rawLogs);
      setLogs(enriched);
      setFilteredLogs(enriched);
    } catch (e) {
      console.error('fetchLogs error', e);
      setLogs([]);
      setFilteredLogs([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchLogs(); }, [fetchLogs]);

  // Realtime subscription logic (kept the same)
  useEffect(() => {
    if (isLoading) return;

    const tablesToMonitor = ['activity_logs', 'employees', 'customers', 'packages'];
    const channels = tablesToMonitor.map(table => 
        supabase
          .channel(`activity-monitor-${table}`)
          .on(
            'postgres_changes',
            { event: '*', schema: 'public', table: table },
            () => {
              fetchLogs().catch((e) => console.warn(`Failed to refresh logs after ${table} change`, e));
            }
          )
          .subscribe()
    );

    return () => {
      channels.forEach(channel => {
        try {
          (supabase as any).removeChannel(channel);
        } catch (e) {
          console.warn('Failed to remove realtime channel', e);
        }
      });
    };
  }, [fetchLogs, isLoading]);

  // Search logic (kept the same)
  useEffect(() => {
    if (!searchTerm) {
      setFilteredLogs(logs);
    } else {
      const lower = searchTerm.toLowerCase();
      setFilteredLogs(
        logs.filter(l =>
          (l.username || '').toLowerCase().includes(lower)
          || (l.action_type || '').toLowerCase().includes(lower)
          || (!l._parsedChanges && (l.description || '').toLowerCase().includes(lower))
          || (l.clientName || '').toLowerCase().includes(lower)
          || (l.clientMobile || '').toLowerCase().includes(lower)
          || (l.outletName || '').toLowerCase().includes(lower)
          || (l.packageName || '').toLowerCase().includes(lower)
        )
      );
    }
  }, [searchTerm, logs]);

  const handleExport = () => {
    const data = filteredLogs.map(l => ({
      Date: formatDate(l.created_at),
      User: l.username,
      Action: l.action_type,
      'Client Name': l.clientName ?? '-',
      'Client Mobile': l.clientMobile ?? '-',
      'Package Name': l.packageName ?? '-',
      'Outlet': l.outletName ?? '-',
      Details: l.description 
    }));
    exportToExcel(data, `Activity_Log_${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  const openLogModal = (log: EnrichedLog) => {
    setSelectedLog(log);
  };

  const closeLogModal = () => {
    setSelectedLog(null);
  };

  if (isLoading) return <div className="p-10 text-center">Checking permissions...</div>;

  // Access check
  if (user?.role !== 'developer') {
    return (
      <div className="flex flex-col items-center justify-center h-[60vh] text-gray-500">
        <ShieldAlert className="h-16 w-16 text-red-500 mb-4" />
        <h2 className="text-2xl font-bold text-gray-800">Access Denied</h2>
        <p>Only the **Developer** can view the **Activity Logs**.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6">
      {/* header */}
      <div className="flex flex-col md:flex-row justify-between items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Activity Logs</h1>
          <p className="text-gray-500 text-sm">Audit trail of all administrative and package actions.</p>
        </div>

        <div className="flex gap-3">
          <div className="relative">
            <Search className="absolute left-3 top-2.5 text-gray-400 h-4 w-4" />
            <input
              type="text"
              placeholder="Search user, client, package, action..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="pl-10 pr-4 py-2 border rounded-lg text-sm w-64 text-black focus:border-indigo-500 focus:ring-1 focus:ring-indigo-100 outline-none"
            />
          </div>

          <button
            onClick={handleExport}
            className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg flex items-center gap-2 text-sm font-medium transition-colors"
            disabled={filteredLogs.length === 0}
          >
            <FileText size={16} /> **Export**
          </button>
        </div>
      </div>

      {/* table */}
      <div className="bg-white shadow rounded-lg overflow-hidden border border-gray-200">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Time</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">User</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Action</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Client & Package</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase w-1/3">Details</th>
              </tr>
            </thead>

            <tbody className="bg-white divide-y divide-gray-200">
              {loading ? (
                <tr><td colSpan={5} className="p-6 text-center text-gray-500"><Loader2 className="h-5 w-5 animate-spin inline mr-2" /> Loading logs...</td></tr>
              ) : filteredLogs.length === 0 ? (
                <tr><td colSpan={5} className="p-6 text-center text-gray-500">No logs found matching the filter.</td></tr>
              ) : (
                filteredLogs.map((log) => (
                  <tr key={log.id} className="hover:bg-gray-50 cursor-pointer" onClick={() => openLogModal(log)}>
                    <td className="px-6 py-4 whitespace-nowrap text-xs text-gray-500">{formatDate(log.created_at)}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                      <span className="bg-indigo-100 text-indigo-800 px-2 py-0.5 rounded-full text-xs font-medium">{log.username}</span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700 font-medium">{log.action_type}</td>

                    <td className="px-6 py-4 text-sm text-gray-600">
                      <div className="font-medium text-gray-800">{log.clientName ?? '—'}</div>
                      {/* NEW: Prioritizing Mobile Number */}
                      <div className="text-xs text-gray-500 font-medium">{log.clientMobile ?? '—'}</div>
                      {log.packageName && <div className="text-xs text-green-700 mt-1 font-medium bg-green-50 px-2 py-0.5 rounded-md inline-block">Package: {log.packageName}</div>}
                      {log.outletName && <div className="text-xs text-gray-400 mt-1">Outlet: {log.outletName}</div>}
                    </td>

                    <td className="px-6 py-4 max-w-lg">
                      <LogDescriptionDisplay log={log} />
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* modal */}
      {selectedLog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={closeLogModal} />
          <div className="relative bg-white rounded-xl w-full max-w-3xl p-6 shadow-2xl z-10 animate-fade-in">
            <div className="flex items-start justify-between gap-4 border-b pb-3 mb-4">
              <div>
                <h2 className="text-xl font-bold text-gray-800">{selectedLog.action_type} Details</h2>
                <div className="text-xs text-gray-500 mt-1">{formatDate(selectedLog.created_at)} — <span className="font-semibold text-gray-700">{selectedLog.username}</span></div>
                {/* NEW: Prioritizing Mobile Number display in Modal */}
                {selectedLog.clientName && <div className="mt-2 text-sm">**Client:** <span className="font-medium text-gray-800">{selectedLog.clientName}</span> (<span className="text-indigo-600 font-semibold">{selectedLog.clientMobile ?? 'N/A'}</span>)</div>}
                {selectedLog.packageName && <div className="text-sm text-green-700 font-semibold mt-1">Package: {selectedLog.packageName}</div>}
                {selectedLog.outletName && <div className="text-sm text-gray-500">Outlet: {selectedLog.outletName}</div>}
              </div>
              <button onClick={closeLogModal} className="p-2 rounded-full hover:bg-gray-100 transition-colors">
                <X className="h-6 w-6 text-gray-600" />
              </button>
            </div>

            {selectedLog._parsedChanges && selectedLog._parsedChanges.length > 0 ? (
              <div className="mt-4">
                <h3 className="text-lg font-semibold text-gray-700 mb-2 flex items-center gap-2">
                  <Pencil className="h-5 w-5 text-indigo-600" />
                  Structured Changes ({selectedLog._parsedChanges.length})
                </h3>
                <ChangeTable changes={selectedLog._parsedChanges} />
              </div>
            ) : (
              <div className="mt-4">
                <h3 className="text-lg font-semibold text-gray-700 mb-2 flex items-center gap-2">
                  <Code className="h-5 w-5 text-orange-600" />
                  Raw Log Description
                </h3>
                <pre className="bg-gray-50 p-4 rounded-lg text-sm text-gray-700 max-h-72 overflow-auto whitespace-pre-wrap border border-gray-100">{selectedLog.description}</pre>
              </div>
            )}

            <div className="flex justify-end gap-3 mt-6">
              <button onClick={closeLogModal} className="px-4 py-2 bg-gray-200 rounded-lg hover:bg-gray-300 transition-colors font-medium">Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}