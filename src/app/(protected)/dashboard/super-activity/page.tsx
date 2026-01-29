'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { 
  Search, 
  MapPin, 
  Monitor, 
  Clock, 
  User, 
  ShieldAlert, 
  LogIn, 
  FileText, 
  CheckCircle 
} from 'lucide-react';

// --- Types ---
type ActivityRow = {
  id: string;
  action: string;
  description: string;
  username: string | null;
  created_at: string;
};

// --- Helpers ---

const formatDateTime = (iso: string) => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit', hour12: true,
  });
};

const labelForAction = (action: string) => {
  // Map raw action codes to readable labels
  if (action === 'outlet_login') return 'Outlet Login';
  if (action === 'employee_checkin') return 'Staff Check-in';
  if (action === 'mark_attendance') return 'Attendance';
  if (action === 'create_sale') return 'New Client';
  if (action === 'edit_sale') return 'Sale Edited';
  if (action === 'delete_sale') return 'Sale Deleted';
  if (action === 'login') return 'Admin Login';
  if (action === 'export_sales') return 'Data Export';
  
  // Fallback for generic actions
  return action.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
};

const getIconForAction = (action: string) => {
  if (action.includes('login') || action.includes('checkin')) return <LogIn size={14} />;
  if (action.includes('sale') || action.includes('create')) return <FileText size={14} />;
  if (action.includes('delete')) return <ShieldAlert size={14} />;
  if (action.includes('attendance')) return <CheckCircle size={14} />;
  return <Monitor size={14} />;
};

const parseDescription = (raw: string) => {
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    return { message: raw };
  }
};

export default function ActivityPage() {
  const [rows, setRows] = useState<ActivityRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');

  // --- Fetch Logs ---
  useEffect(() => {
    const fetchActivity = async () => {
      setLoading(true);
      // Fetch the last 200 logs
      const { data, error } = await supabase
        .from('activity_logs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(200);

      if (!error && data) {
        setRows(data.map((r: any) => ({
          id: String(r.id),
          action: r.action_type ?? '',
          description: r.description ?? '',
          username: r.username ?? 'System',
          created_at: r.created_at,
        })));
      }
      setLoading(false);
    };
    fetchActivity();
  }, []);

  // --- Filter Logic ---
  const filteredRows = rows.filter((row) => {
    if (!searchTerm) return true;
    const term = searchTerm.toLowerCase();
    const parsed = parseDescription(row.description);
    
    // Create a searchable string from all available data
    const content = [
        row.username, 
        row.action, 
        parsed?.message, 
        parsed?.customer_name, 
        parsed?.employee, 
        parsed?.outlet,
        parsed?.meta?.city
    ].join(' ').toLowerCase();

    return content.includes(term);
  });

  return (
    <div className="max-w-6xl mx-auto py-8 px-4 space-y-6">
      
      {/* Header Section */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
            <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
                <ShieldAlert className="text-red-600" /> Global Activity Log
            </h1>
            <p className="text-sm text-gray-500">
                Live monitoring of all outlets, staff logins, and system actions with location tracking.
            </p>
        </div>
        
        {/* Search Bar */}
        <div className="relative">
             <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
             <input 
                type="text" 
                placeholder="Search user, city, or action..." 
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                className="pl-9 pr-4 py-2 border border-gray-300 rounded-xl text-sm w-full md:w-72 bg-white text-black focus:ring-2 focus:ring-red-500 outline-none shadow-sm transition-all"
             />
        </div>
      </div>

      {/* Activity Feed */}
      <div className="space-y-4">
        {loading ? (
            <div className="text-center py-20 text-gray-500 bg-white rounded-2xl shadow-sm border border-gray-100">
                <div className="animate-pulse flex flex-col items-center gap-2">
                    <div className="h-4 w-4 bg-gray-300 rounded-full"></div>
                    Loading history...
                </div>
            </div>
        ) : filteredRows.length === 0 ? (
            <div className="text-center py-20 text-gray-500 bg-white rounded-2xl shadow-sm border border-gray-100">
                No activity found matching your criteria.
            </div>
        ) : (
            filteredRows.map((row) => {
                const parsed = parseDescription(row.description);
                const meta = parsed?.meta || {}; // The Location/Device info
                
                // Construct the main message based on the data type
                let primaryMessage = parsed?.message || 'Activity logged';
                let secondaryDetails = null;

                if (parsed?.customer_name) {
                    primaryMessage = `Added client: ${parsed.customer_name}`;
                    secondaryDetails = `${parsed.treatment} • ₹${(parsed.amount || 0)}` + (parsed.mobile ? ` • ${parsed.mobile}` : '');
                } else if (parsed?.employee) {
                    primaryMessage = `Marked ${parsed.employee} as ${parsed.status}`;
                    secondaryDetails = parsed.outlet ? `at ${parsed.outlet}` : null;
                } else if (parsed?.remark) {
                    primaryMessage = `Remark: "${parsed.remark}"`;
                }

                // Dynamic Badge Color
                let badgeColor = 'bg-gray-100 text-gray-700 border-gray-200';
                if (row.action.includes('delete')) badgeColor = 'bg-red-50 text-red-700 border-red-100';
                else if (row.action.includes('login')) badgeColor = 'bg-green-50 text-green-700 border-green-100';
                else if (row.action.includes('sale')) badgeColor = 'bg-blue-50 text-blue-700 border-blue-100';

                return (
                    <div key={row.id} className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm hover:shadow-md transition-all group">
                        <div className="flex flex-col md:flex-row justify-between gap-4">
                            
                            {/* --- LEFT: User & Action --- */}
                            <div className="flex-1">
                                <div className="flex items-center gap-3 mb-2">
                                    <div className="flex items-center gap-2">
                                        <div className="h-9 w-9 rounded-full bg-slate-900 flex items-center justify-center text-white font-bold text-xs uppercase shadow-sm">
                                            {row.username ? row.username.charAt(0) : 'S'}
                                        </div>
                                        <div className="flex flex-col">
                                            <span className="font-bold text-gray-900 text-sm leading-none">{row.username || 'System'}</span>
                                            <span className="text-[10px] text-gray-400 font-medium">User / Source</span>
                                        </div>
                                    </div>
                                    
                                    {/* Action Badge */}
                                    <span className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[10px] font-bold uppercase tracking-wide border ${badgeColor}`}>
                                        {getIconForAction(row.action)}
                                        {labelForAction(row.action)}
                                    </span>
                                </div>
                                
                                {/* Content details */}
                                <div className="pl-11">
                                    <div className="text-sm font-medium text-gray-800">
                                        {primaryMessage}
                                    </div>
                                    {secondaryDetails && (
                                        <div className="text-xs text-gray-500 mt-0.5 font-medium">
                                            {secondaryDetails}
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* --- RIGHT: Metadata (Location, IP, Time) --- */}
                            <div className="flex flex-col items-end gap-2 min-w-[200px] pl-4 border-l border-gray-100 md:border-l-0 md:pl-0">
                                 {/* Time */}
                                 <div className="flex items-center gap-1.5 text-xs font-bold text-gray-500 bg-gray-50 px-2 py-1 rounded-md">
                                     <Clock size={12} />
                                     {formatDateTime(row.created_at)}
                                 </div>
                                 
                                 {/* Location (If Available) */}
                                 {meta.city ? (
                                     <div className="flex items-center gap-1.5 text-xs font-bold text-indigo-600 bg-indigo-50 px-2 py-1 rounded-md border border-indigo-100">
                                         <MapPin size={12} />
                                         {meta.city}, {meta.region}
                                     </div>
                                 ) : (
                                     <div className="text-[10px] text-gray-400 italic">Location N/A</div>
                                 )}
                                 
                                 {/* IP & Device */}
                                 {meta.ip && (
                                     <div className="text-[10px] text-gray-400 font-mono flex items-center gap-1 mt-1 opacity-60 group-hover:opacity-100 transition-opacity" title={meta.device || 'Unknown Device'}>
                                         <Monitor size={10} /> {meta.ip}
                                     </div>
                                 )}
                            </div>
                        </div>
                    </div>
                );
            })
        )}
      </div>
    </div>
  );
}