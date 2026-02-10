'use client';

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { useActivityLog } from '@/hooks/useActivityLog';
import { 
  Loader2, 
  Calendar as CalendarIcon, 
  Search,
  XCircle,
  CalendarOff
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
  const [markingId, setMarkingId] = useState<string | null>(null); // For button loading state
  
  // Filters
  const [dateFilter, setDateFilter] = useState(currentISTDate);
  const [searchTerm, setSearchTerm] = useState('');
  
  // Outlet Info
  const [outletId, setOutletId] = useState<string | null>(null);
  const [outletName, setOutletName] = useState('My Outlet');

  // 1. Fetch Outlet Session
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

  // 2. Fetch Employees (With outlet_id to filter roster)
  // FIX: Fetch is_active/join/exit fields to properly filter ex-employees
  const fetchEmployees = useCallback(async () => {
    const { data } = await supabase
      .from('employees')
      .select('id, name, role, outlet_id, join_date, exit_date, is_active')
      .order('name'); 
    setEmployees(data || []);
  }, []);

  // 3. Fetch Attendance (Filtered by this Outlet)
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
  }, [fetchEmployees]);

  useEffect(() => {
    if (outletId) {
      fetchAttendance();
    }
  }, [fetchAttendance, outletId]);

  // 4. Mark Absent / Off Logic
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

        await fetchAttendance(); // Refresh list
    } catch (err: any) {
        alert('Failed to mark status: ' + err.message);
    } finally {
        setMarkingId(null);
    }
  };

  // Combine Data & FILTER
  const filteredData = employees.map(emp => ({
    employee: emp,
    record: records.find(r => r.employee_id === emp.id) || null
  })).filter(item => {
    // 1. Must match search
    const nameMatch = item.employee.name.toLowerCase().includes(searchTerm.toLowerCase());
    if (!nameMatch) return false;

    // 2. Must be relevant to this outlet
    const belongsToOutlet = item.employee.outlet_id === outletId;
    const hasRecordHere = !!item.record;
    
    if (!belongsToOutlet && !hasRecordHere) return false;

    // 3. STRICT EX-EMPLOYEE FILTERING
    const filterDateStr = dateFilter; 
    
    // Hide if joined strictly AFTER selected date
    if (item.employee.join_date) {
        const joinDateStr = item.employee.join_date.split('T')[0];
        if (filterDateStr < joinDateStr) return false;
    }
    
    // Hide if left BEFORE selected date
    if (item.employee.exit_date) {
        const exitDateStr = item.employee.exit_date.split('T')[0];
        if (filterDateStr > exitDateStr) return false;
    }

    // Hide if explicitly inactive AND no record for today (Corrected Logic)
    // Only hide if strictly inactive (false). Undefined/null is treated as active.
    if (item.employee.is_active === false && !item.record) {
         if (!item.employee.exit_date) return false;
    }

    return true;
  });

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      
      {/* HEADER */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">{outletName} Attendance</h1>
          <p className="text-sm text-gray-500">View daily staff logs & mark attendance.</p>
        </div>
        
        <div className="flex flex-wrap gap-3 items-center">
            {/* Search */}
            <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
                <input 
                    type="text" 
                    placeholder="Search staff..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-9 pr-4 py-2 text-sm border border-gray-200 rounded-xl bg-white text-gray-900 outline-none focus:ring-2 focus:ring-indigo-500 w-full md:w-64"
                />
            </div>

            {/* Date Picker */}
            <div className="flex items-center px-4 py-2 border border-gray-200 rounded-xl bg-white gap-2">
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

      {/* DATA TABLE */}
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

                    return (
                      <tr key={employee.id} className="hover:bg-gray-50/50 transition-colors">
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-3">
                              <div className="w-8 h-8 rounded-full bg-gray-900 flex items-center justify-center text-white font-bold text-xs">
                                  {employee.name.charAt(0)}
                              </div>
                              <div>
                                  <div className="text-sm font-bold text-gray-900">{employee.name}</div>
                                  <div className="text-[10px] text-gray-500 font-bold uppercase">{employee.role || 'Therapist'}</div>
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
                           {/* LOGIC FOR STATUS DISPLAY */}
                           {record ? (
                               // Record exists: Show Status
                               record.status === 'Absent' ? (
                                   <span className="px-2 py-1 rounded bg-rose-50 text-rose-700 text-[10px] font-bold uppercase border border-rose-100 flex items-center gap-1 w-fit">
                                       <XCircle size={12} /> Absent
                                   </span>
                               ) : record.status === 'Weekly Off' ? (
                                   <span className="px-2 py-1 rounded bg-gray-100 text-gray-600 text-[10px] font-bold uppercase border border-gray-200 flex items-center gap-1 w-fit">
                                       <CalendarOff size={12} /> Weekly Off
                                   </span>
                               ) : record.check_out_time ? (
                                   <span className="px-2 py-1 rounded bg-emerald-50 text-emerald-700 text-[10px] font-bold uppercase border border-emerald-100">Shift End</span>
                               ) : (
                                   <span className="px-2 py-1 rounded bg-indigo-50 text-indigo-700 text-[10px] font-bold uppercase border border-indigo-100 animate-pulse">On Duty</span>
                               )
                           ) : (
                               // No Record: Show Buttons
                               <div className="flex items-center gap-2">
                                   <button 
                                       disabled={isProcessing}
                                       onClick={() => handleMarkStatus(employee, 'Absent')}
                                       className="px-2 py-1 bg-white border border-rose-200 text-rose-700 rounded text-[10px] font-bold uppercase hover:bg-rose-50 transition-colors disabled:opacity-50"
                                   >
                                       {isProcessing ? '...' : 'Mark Absent'}
                                   </button>
                                   <button 
                                       disabled={isProcessing}
                                       onClick={() => handleMarkStatus(employee, 'Weekly Off')}
                                       className="px-2 py-1 bg-white border border-gray-300 text-gray-700 rounded text-[10px] font-bold uppercase hover:bg-gray-100 transition-colors disabled:opacity-50"
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