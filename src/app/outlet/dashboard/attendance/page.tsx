'use client';

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { useActivityLog } from '@/hooks/useActivityLog';
import { 
  Loader2, 
  Calendar as CalendarIcon, 
  Search,
  XCircle,
  CalendarOff,
  MapPin,
  Clock
} from 'lucide-react';

// --- Types ---
type Employee = {
  id: string;
  name: string;
  role: string;
  outlet_id?: string;
  join_date?: string | null;
  exit_date?: string | null;
  is_active?: boolean;
  // Added fields to track global status
  is_checked_in?: boolean;
  current_outlet_name?: string | null;
};

type AttendanceRecord = {
  id: string; 
  date: string;
  employee_id: string;
  employee_name: string;
  outlet_name: string;
  outlet_id: string; 
  check_in_time: string | null;
  check_out_time: string | null;
  status: string; 
  early_checkout_requested: boolean;
  early_checkout_request_time: string | null;
};

const IST_OFFSET_MINUTES = 5.5 * 60; 

const getISTDateString = (date?: Date): string => {
    const now = date || new Date();
    const localOffset = now.getTimezoneOffset(); 
    const istTime = new Date(now.getTime() + (IST_OFFSET_MINUTES + localOffset) * 60 * 1000);
    return istTime.toISOString().split('T')[0];
};

const formatTime = (dateStr: string | null | undefined) => {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleTimeString('en-IN', { 
    hour: '2-digit', 
    minute: '2-digit', 
    timeZone: 'Asia/Kolkata' 
  });
};

export default function OutletAttendancePage() {
  const { logActivity } = useActivityLog();
  const [currentISTDate] = useState(getISTDateString());
  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [markingId, setMarkingId] = useState<string | null>(null);
  
  const [dateFilter, setDateFilter] = useState(currentISTDate);
  const [searchTerm, setSearchTerm] = useState('');
  
  const [outletId, setOutletId] = useState<string | null>(null);
  const [outletName, setOutletName] = useState('My Outlet');

  useEffect(() => {
    async function fetchOutletSession() {
      try {
        const res = await fetch('/api/outlet');
        const data = await res.json();
        if (data.outletId) {
          setOutletId(data.outletId);
          setOutletName(data.outletName || 'My Outlet');
        }
      } catch (err) {
        console.error("Could not fetch outlet session", err);
      }
    }
    fetchOutletSession();
  }, []);

  const fetchEmployees = useCallback(async () => {
    // Included is_checked_in and current_outlet_name to see global status
    const { data } = await supabase
      .from('employees')
      .select('id, name, role, outlet_id, join_date, exit_date, is_active, is_checked_in, current_outlet_name')
      .order('name'); 
    setEmployees(data || []);
  }, []);

  const fetchAttendance = useCallback(async () => {
    if (!outletId) return;
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('attendance')
        .select(`*`)
        .eq('date', dateFilter)
        .eq('outlet_id', outletId);

      if (error) throw error;
      setRecords(data || []);
    } catch (err) {
      console.error('Error fetching attendance:', err);
    } finally {
      setLoading(false);
    }
  }, [dateFilter, outletId]);

  useEffect(() => {
    fetchEmployees();
    
    // Real-time subscription so if Gayathri logs in elsewhere, the UI updates immediately
    const channel = supabase.channel('global-roster')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'employees' }, fetchEmployees)
      .subscribe();
      
    return () => { supabase.removeChannel(channel); };
  }, [fetchEmployees]);

  useEffect(() => {
    if (outletId) {
      fetchAttendance();
    }
  }, [fetchAttendance, outletId]);

  const handleMarkStatus = async (emp: Employee, status: 'Absent' | 'Weekly Off') => {
    if (!outletId) return;
    setMarkingId(emp.id);
    
    try {
        const { error } = await supabase.from('attendance').insert({
            employee_id: emp.id,
            employee_name: emp.name,
            outlet_id: outletId,
            outlet_name: outletName,
            date: dateFilter,
            status: status,
            check_in_time: null,
            check_out_time: null
        });

        if (error) throw error;

        await logActivity('mark_attendance', {
            employee: emp.name,
            status: status,
            outlet: outletName,
            message: `Marked ${emp.name} as ${status}`
        });

        await fetchAttendance();
    } catch (err: any) {
        alert('Failed to mark status: ' + err.message);
    } finally {
        setMarkingId(null);
    }
  };

  const filteredData = employees.map(emp => ({
    employee: emp,
    record: records.find(r => r.employee_id === emp.id) || null
  })).filter(item => {
    const nameMatch = item.employee.name.toLowerCase().includes(searchTerm.toLowerCase());
    if (!nameMatch) return false;

    // Show if they belong to this outlet OR they have a record here today
    const belongsToOutlet = item.employee.outlet_id === outletId;
    const hasRecordHere = !!item.record;
    
    if (!belongsToOutlet && !hasRecordHere) return false;

    const filterDateStr = dateFilter; 
    if (item.employee.join_date && filterDateStr < item.employee.join_date.split('T')[0]) return false;
    if (item.employee.exit_date && filterDateStr > item.employee.exit_date.split('T')[0]) return false;
    if (item.employee.is_active === false && !item.record) {
         if (!item.employee.exit_date) return false;
    }

    return true;
  });

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">{outletName} Attendance</h1>
          <p className="text-sm text-gray-500">View daily staff logs & mark attendance.</p>
        </div>
        
        <div className="flex flex-wrap gap-3 items-center">
            <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
                <input 
                    type="text" 
                    placeholder="Search staff..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-9 pr-4 py-2 text-sm border border-gray-200 rounded-xl bg-white text-gray-900 outline-none focus:ring-2 focus:ring-indigo-500 w-full md:w-64 shadow-sm"
                />
            </div>

            <div className="flex items-center px-4 py-2 border border-gray-200 rounded-xl bg-white gap-2 shadow-sm">
              <CalendarIcon size={16} className="text-gray-900" />
              <input 
                type="date" 
                value={dateFilter}
                onChange={(e) => setDateFilter(e.target.value)}
                className="text-sm text-gray-900 font-bold outline-none bg-transparent"
                max={currentISTDate}
              />
            </div>
        </div>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-gray-50/50 border-b border-gray-200 text-gray-900">
                <th className="px-6 py-4 text-xs font-bold uppercase tracking-wider">Employee</th>
                <th className="px-6 py-4 text-xs font-bold uppercase tracking-wider">In Time</th>
                <th className="px-6 py-4 text-xs font-bold uppercase tracking-wider">Out Time</th>
                <th className="px-6 py-4 text-xs font-bold uppercase tracking-wider">Status / Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading ? (
                <tr><td colSpan={4} className="py-20 text-center"><Loader2 className="animate-spin mx-auto text-indigo-500" /></td></tr>
              ) : filteredData.length === 0 ? (
                <tr><td colSpan={4} className="py-20 text-center text-gray-600 font-bold italic">No staff found for this outlet.</td></tr>
              ) : (
                filteredData.map(({ employee, record }) => {
                    const isProcessing = markingId === employee.id;
                    
                    // Logic to check if they are currently working at a different outlet
                    const isWorkingElsewhere = employee.is_checked_in && employee.current_outlet_name !== outletName;

                    return (
                      <tr key={employee.id} className="hover:bg-gray-50/50 transition-colors">
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-3">
                              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-white font-bold text-xs ${employee.is_checked_in ? 'bg-indigo-600 shadow-md shadow-indigo-100' : 'bg-gray-900'}`}>
                                  {employee.name.charAt(0)}
                              </div>
                              <div>
                                  <div className="text-sm font-bold text-gray-900">{employee.name}</div>
                                  <div className="text-[10px] text-gray-500 font-bold uppercase tracking-tight">{employee.role || 'Therapist'}</div>
                              </div>
                          </div>
                        </td>
                        <td className="px-6 py-4 text-sm font-bold text-emerald-700">
                          {formatTime(record?.check_in_time)}
                        </td>
                        <td className="px-6 py-4 text-sm font-bold text-gray-900">
                          {formatTime(record?.check_out_time)}
                        </td>
                        <td className="px-6 py-4">
                           {/* STATUS LOGIC */}
                           {record ? (
                               // A record exists for this specific outlet today
                               record.status === 'Absent' ? (
                                   <span className="px-2 py-1 rounded-md bg-rose-50 text-rose-700 text-[10px] font-bold uppercase border border-rose-100 flex items-center gap-1 w-fit">
                                       <XCircle size={12} /> Absent
                                   </span>
                               ) : record.status === 'Weekly Off' ? (
                                   <span className="px-2 py-1 rounded-md bg-gray-100 text-gray-600 text-[10px] font-bold uppercase border border-gray-200 flex items-center gap-1 w-fit">
                                       <CalendarOff size={12} /> Weekly Off
                                   </span>
                               ) : record.check_out_time ? (
                                   <span className="px-2 py-1 rounded-md bg-emerald-50 text-emerald-700 text-[10px] font-bold uppercase border border-emerald-100">Shift End</span>
                               ) : (
                                   <span className="px-2 py-1 rounded-md bg-indigo-50 text-indigo-700 text-[10px] font-bold uppercase border border-indigo-100 animate-pulse">On Duty</span>
                               )
                           ) : isWorkingElsewhere ? (
                               // Priority: If logged in at another outlet (like Gayathri at Kaggadasapura)
                               <div className="flex flex-col gap-1">
                                   <span className="px-2 py-1 rounded-md bg-amber-50 text-amber-700 text-[10px] font-extrabold uppercase border border-amber-200 w-fit flex items-center gap-1">
                                       Working Elsewhere
                                   </span>
                                   <span className="text-[10px] font-bold text-indigo-600 flex items-center gap-1">
                                       <MapPin size={10} /> {employee.current_outlet_name}
                                   </span>
                               </div>
                           ) : (
                               // No record and not logged in elsewhere: Show Action Buttons
                               <div className="flex items-center gap-2">
                                   <button 
                                       disabled={isProcessing}
                                       onClick={() => handleMarkStatus(employee, 'Absent')}
                                       className="px-2.5 py-1.5 bg-white border border-rose-200 text-rose-700 rounded-lg text-[10px] font-bold uppercase hover:bg-rose-50 transition-all shadow-sm disabled:opacity-50"
                                   >
                                       {isProcessing ? '...' : 'Mark Absent'}
                                   </button>
                                   <button 
                                       disabled={isProcessing}
                                       onClick={() => handleMarkStatus(employee, 'Weekly Off')}
                                       className="px-2.5 py-1.5 bg-white border border-gray-300 text-gray-700 rounded-lg text-[10px] font-bold uppercase hover:bg-gray-100 transition-all shadow-sm disabled:opacity-50"
                                   >
                                       {isProcessing ? '...' : 'Mark Off'}
                                   </button>
                               </div>
                           )}
                        </td>
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