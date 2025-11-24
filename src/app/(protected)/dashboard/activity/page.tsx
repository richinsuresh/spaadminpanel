'use client';

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { useUser } from '@/context/UserContext';
import { exportToExcel } from '@/lib/exportToExcel';
import { Loader2, ShieldAlert, FileText, Search } from 'lucide-react';

type Log = {
  id: string;
  username: string;
  action_type: string;
  description: string;
  created_at: string;
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

export default function ActivityPage() {
  const { user, isLoading } = useUser();
  const [logs, setLogs] = useState<Log[]>([]);
  const [filteredLogs, setFilteredLogs] = useState<Log[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase.from('activity_logs').select('*').order('created_at', { ascending: false }).limit(500);
    if (!error) { setLogs(data || []); setFilteredLogs(data || []); }
    setLoading(false);
  }, []);

  useEffect(() => { fetchLogs(); }, [fetchLogs]);

  useEffect(() => {
    const channel = supabase.channel('activity-monitor')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'activity_logs' }, (payload) => {
         setLogs(prev => [payload.new as Log, ...prev]);
         setFilteredLogs(prev => [payload.new as Log, ...prev]);
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  useEffect(() => {
    if (!searchTerm) { setFilteredLogs(logs); } 
    else {
      const lower = searchTerm.toLowerCase();
      setFilteredLogs(logs.filter(l => l.username.toLowerCase().includes(lower) || l.action_type.toLowerCase().includes(lower) || l.description.toLowerCase().includes(lower)));
    }
  }, [searchTerm, logs]);

  const handleExport = () => {
    const data = filteredLogs.map(l => ({ Date: formatDate(l.created_at), User: l.username, Action: l.action_type, Details: l.description }));
    exportToExcel(data, `Activity_Log_${new Date().toISOString().split('T')[0]}.xlsx`);
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
      <div className="flex flex-col md:flex-row justify-between items-center gap-4">
        <div><h1 className="text-2xl font-bold text-gray-800">Activity Logs</h1><p className="text-gray-500 text-sm">Audit trail of all admin actions</p></div>
        <div className="flex gap-3">
           <div className="relative"><Search className="absolute left-3 top-2.5 text-gray-400 h-4 w-4" /><input type="text" placeholder="Search logs..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="pl-10 pr-4 py-2 border rounded-lg text-sm w-64 text-black" /></div>
           <button onClick={handleExport} className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg flex items-center gap-2 text-sm font-medium"><FileText size={16} /> Export</button>
        </div>
      </div>
      <div className="bg-white shadow rounded-lg overflow-hidden border border-gray-200">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50"><tr><th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Time</th><th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">User</th><th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Action</th><th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Details</th></tr></thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {loading ? <tr><td colSpan={4} className="p-6 text-center text-gray-500">Loading...</td></tr> : filteredLogs.length === 0 ? <tr><td colSpan={4} className="p-6 text-center text-gray-500">No logs found.</td></tr> : (
                filteredLogs.map((log) => (
                  <tr key={log.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap text-xs text-gray-500">{formatDate(log.created_at)}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900"><span className="bg-blue-100 text-blue-800 px-2 py-1 rounded-full text-xs">{log.username}</span></td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700 font-medium">{log.action_type}</td>
                    <td className="px-6 py-4 text-sm text-gray-600 max-w-md break-words">{log.description}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}