'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { useUser } from '@/context/UserContext';
import { exportToExcel } from '@/lib/exportToExcel';
import { Loader2, ShieldAlert, FileText, Search, X } from 'lucide-react';

type Log = {
  id: string;
  username: string;
  action_type: string;
  description: string;
  created_at: string;
};

// enriched fields we add if a sale ID is present in description
type EnrichedLog = Log & {
  clientName?: string | null;
  clientMobile?: string | null;
  outletName?: string | null;
};

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

const extractSaleIds = (text: string): string[] => {
  if (!text) return [];
  const ids = new Set<string>();
  const regex = /(?:sale[\s-_]*id|sale|id)\s*[:#-]?\s*([a-z0-9-]{6,80})/ig;
  let m;
  while ((m = regex.exec(text))) {
    if (m[1]) ids.add(m[1].trim());
  }
  return Array.from(ids);
};

/** Parse description for structured changes.
 * Returns array of { field, before, after } or [] if nothing parsed.
 */
const parseChangesFromDescription = (desc: string): { field: string; before: string | null; after: string | null }[] => {
  if (!desc) return [];

  // 1) If desc is JSON with { before, after } or { changes: [...] } , try to parse it
  try {
    const parsed = JSON.parse(desc);
    if (parsed && typeof parsed === 'object') {
      // case: { before: {...}, after: {...} }
      if (parsed.before && parsed.after && typeof parsed.before === 'object' && typeof parsed.after === 'object') {
        const keys = Array.from(new Set([...Object.keys(parsed.before), ...Object.keys(parsed.after)]));
        return keys.map((k) => ({
          field: k,
          before: parsed.before[k] !== undefined ? String(parsed.before[k]) : null,
          after: parsed.after[k] !== undefined ? String(parsed.after[k]) : null
        }));
      }

      // case: { changes: [{ field, before, after }, ...] }
      if (Array.isArray((parsed as any).changes)) {
        return (parsed as any).changes.map((c: any) => ({
          field: String(c.field ?? c.key ?? 'unknown'),
          before: c.before !== undefined ? String(c.before) : null,
          after: c.after !== undefined ? String(c.after) : null
        }));
      }

      // case: parsed is an array of changes
      if (Array.isArray(parsed) && parsed.length > 0 && parsed.every((x: any) => x.field && ('before' in x || 'after' in x))) {
        return parsed.map((c: any) => ({
          field: String(c.field),
          before: c.before !== undefined ? String(c.before) : null,
          after: c.after !== undefined ? String(c.after) : null
        }));
      }
    }
  } catch (e) {
    // not JSON
  }

  // 2) Attempt to extract verbal change patterns like:
  // "changed name from 'John' to 'Jane'"
  // "name: 'John' -> 'Jane'"
  const results: { field: string; before: string | null; after: string | null }[] = [];

  const verbalRegex = /changed\s+([a-zA-Z0-9_\s]+?)\s+from\s+['"]?([^'"]+?)['"]?\s+to\s+['"]?([^'"]+?)['"]?/ig;
  let m;
  while ((m = verbalRegex.exec(desc))) {
    results.push({ field: (m[1] || '').trim(), before: m[2] || null, after: m[3] || null });
  }

  // pattern: field: 'old' -> 'new'  or field: "old" -> "new"
  const arrowRegex = /([\w\s_]+?)\s*[:]\s*['"]([^'"]*?)['"]\s*[-=]>\s*['"]([^'"]*?)['"]/ig;
  while ((m = arrowRegex.exec(desc))) {
    results.push({ field: (m[1] || '').trim(), before: m[2] || null, after: m[3] || null });
  }

  // pattern: field changed from old to new (no quotes)
  const simpleRegex = /([\w\s_]+?)\s+changed\s+from\s+([^\.;,]+?)\s+to\s+([^\.;,]+?)(?:[.,;]|$)/ig;
  while ((m = simpleRegex.exec(desc))) {
    results.push({ field: (m[1] || '').trim(), before: (m[2] || '').trim(), after: (m[3] || '').trim() });
  }

  return results;
};


export default function ActivityPage() {
  const { user, isLoading } = useUser();
  const [logs, setLogs] = useState<EnrichedLog[]>([]);
  const [filteredLogs, setFilteredLogs] = useState<EnrichedLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');

  // modal state for viewing change details
  const [selectedLog, setSelectedLog] = useState<EnrichedLog | null>(null);
  const [parsedChanges, setParsedChanges] = useState<{ field: string; before: string | null; after: string | null }[] | null>(null);

  const enrichLogs = async (rawLogs: Log[]): Promise<EnrichedLog[]> => {
    if (!rawLogs || rawLogs.length === 0) return [];

    const saleIdSet = new Set<string>();
    rawLogs.forEach(l => {
      extractSaleIds(l.description).forEach(id => saleIdSet.add(id));
    });

    const saleIds = Array.from(saleIdSet);
    let customersMap: Record<string, { name?: string | null; mobile?: string | null; outlet_name?: string | null; }> = {};

    if (saleIds.length > 0) {
      try {
        const { data: customers, error } = await supabase
          .from('customers')
          .select('id, name, mobile, outlet_name')
          .in('id', saleIds);

        if (!error && Array.isArray(customers)) {
          customers.forEach((c: any) => {
            if (c && c.id) {
              customersMap[c.id] = {
                name: c.name ?? null,
                mobile: c.mobile ?? null,
                outlet_name: c.outlet_name ?? null
              };
            }
          });
        } else if (error) {
          console.warn('Error fetching customers for logs enrichment', error);
        }
      } catch (e) {
        console.warn('Failed to enrich logs with customer info', e);
      }
    }

    const enriched: EnrichedLog[] = rawLogs.map((l) => {
      const ids = extractSaleIds(l.description);
      const firstId = ids[0];
      const cust = firstId ? customersMap[firstId] : undefined;
      return {
        ...l,
        clientName: cust?.name ?? null,
        clientMobile: cust?.mobile ?? null,
        outletName: cust?.outlet_name ?? null
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

  useEffect(() => {
    const channel = supabase
      .channel('activity-monitor')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'activity_logs' },
        () => {
          fetchLogs().catch((e) => console.warn('Failed to refresh logs after insert', e));
        }
      )
      .subscribe();

    return () => {
      try {
        if ((channel as any).unsubscribe) (channel as any).unsubscribe();
        else if ((supabase as any).removeChannel) (supabase as any).removeChannel(channel);
      } catch (e) {
        console.warn('Failed to remove realtime channel', e);
      }
    };
  }, [fetchLogs]);

  useEffect(() => {
    if (!searchTerm) {
      setFilteredLogs(logs);
    } else {
      const lower = searchTerm.toLowerCase();
      setFilteredLogs(
        logs.filter(l =>
          (l.username || '').toLowerCase().includes(lower)
          || (l.action_type || '').toLowerCase().includes(lower)
          || (l.description || '').toLowerCase().includes(lower)
          || (l.clientName || '').toLowerCase().includes(lower)
          || (l.clientMobile || '').toLowerCase().includes(lower)
          || (l.outletName || '').toLowerCase().includes(lower)
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
      'Outlet': l.outletName ?? '-',
      Details: l.description
    }));
    exportToExcel(data, `Activity_Log_${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  // Open modal and parse changes
  const openLogModal = (log: EnrichedLog) => {
    setSelectedLog(log);
    const parsed = parseChangesFromDescription(log.description);
    setParsedChanges(parsed.length > 0 ? parsed : null);
  };

  const closeLogModal = () => {
    setSelectedLog(null);
    setParsedChanges(null);
  };

  if (isLoading) return <div className="p-10 text-center">Checking permissions...</div>;

  if (user?.role !== 'developer') {
    return (
      <div className="flex flex-col items-center justify-center h-[60vh] text-gray-500">
        <ShieldAlert className="h-16 w-16 text-red-500 mb-4" />
        <h2 className="text-2xl font-bold text-gray-800">Access Denied</h2>
        <p>Only the Developer can view the Activity Logs.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* header */}
      <div className="flex flex-col md:flex-row justify-between items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Activity Logs</h1>
          <p className="text-gray-500 text-sm">Audit trail of all admin actions</p>
        </div>

        <div className="flex gap-3">
          <div className="relative">
            <Search className="absolute left-3 top-2.5 text-gray-400 h-4 w-4" />
            <input
              type="text"
              placeholder="Search logs..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="pl-10 pr-4 py-2 border rounded-lg text-sm w-64 text-black"
            />
          </div>

          <button
            onClick={handleExport}
            className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg flex items-center gap-2 text-sm font-medium"
          >
            <FileText size={16} /> Export
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
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Client</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Details</th>
              </tr>
            </thead>

            <tbody className="bg-white divide-y divide-gray-200">
              {loading ? (
                <tr><td colSpan={5} className="p-6 text-center text-gray-500">Loading...</td></tr>
              ) : filteredLogs.length === 0 ? (
                <tr><td colSpan={5} className="p-6 text-center text-gray-500">No logs found.</td></tr>
              ) : (
                filteredLogs.map((log) => (
                  <tr key={log.id} className="hover:bg-gray-50 cursor-pointer" onClick={() => openLogModal(log)}>
                    <td className="px-6 py-4 whitespace-nowrap text-xs text-gray-500">{formatDate(log.created_at)}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                      <span className="bg-blue-100 text-blue-800 px-2 py-1 rounded-full text-xs">{log.username}</span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700 font-medium">{log.action_type}</td>

                    <td className="px-6 py-4 text-sm text-gray-600">
                      <div className="font-medium">{log.clientName ?? '—'}</div>
                      <div className="text-xs text-gray-500">{log.clientMobile ?? '—'}</div>
                      {log.outletName && <div className="text-xs text-gray-400">Outlet: {log.outletName}</div>}
                    </td>

                    <td className="px-6 py-4 text-sm text-gray-600 max-w-md break-words">{log.description}</td>
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
          <div className="absolute inset-0 bg-black/30" onClick={closeLogModal} />
          <div className="relative bg-white rounded-xl w-full max-w-2xl p-6 shadow-xl z-10">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-lg font-bold text-gray-800">{selectedLog.action_type}</h2>
                <div className="text-xs text-gray-500">{formatDate(selectedLog.created_at)} — {selectedLog.username}</div>
                {selectedLog.clientName && <div className="mt-2 text-sm"><strong>Client:</strong> {selectedLog.clientName} ({selectedLog.clientMobile ?? '—'})</div>}
                {selectedLog.outletName && <div className="text-sm text-gray-500">Outlet: {selectedLog.outletName}</div>}
              </div>
              <button onClick={closeLogModal} className="p-2 rounded hover:bg-gray-100">
                <X className="h-5 w-5 text-gray-600" />
              </button>
            </div>

            <div className="mt-4">
              {parsedChanges ? (
                <div className="overflow-auto max-h-72 border rounded p-2">
                  <table className="min-w-full text-sm">
                    <thead>
                      <tr className="text-xs text-gray-500">
                        <th className="py-1 text-left">Field</th>
                        <th className="py-1 text-left">Before</th>
                        <th className="py-1 text-left">After</th>
                      </tr>
                    </thead>
                    <tbody>
                      {parsedChanges.map((c, i) => (
                        <tr key={i} className="even:bg-gray-50">
                          <td className="py-2 align-top font-medium">{c.field}</td>
                          <td className="py-2 align-top text-gray-600 whitespace-pre-wrap">{c.before ?? '—'}</td>
                          <td className="py-2 align-top text-green-700 whitespace-pre-wrap">{c.after ?? '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div>
                  <h3 className="text-sm font-medium text-gray-700 mb-2">Raw Details</h3>
                  <pre className="bg-gray-50 p-3 rounded text-sm text-gray-700 max-h-72 overflow-auto whitespace-pre-wrap">{selectedLog.description}</pre>
                </div>
              )}
            </div>

            <div className="flex justify-end gap-3 mt-4">
              <button onClick={closeLogModal} className="px-4 py-2 bg-gray-200 rounded hover:bg-gray-300">Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
