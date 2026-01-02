'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import { OUTLETS } from '@/lib/outlet';
import { 
  Trash2, 
  Loader2, 
  MapPin, 
  Calendar as CalendarIcon, 
  ShieldAlert,
  Search,
  LogOut,
  XCircle,
  CalendarOff,
  User,
  BarChart3,
  AlertTriangle
} from 'lucide-react';

// --- Types ---
type Employee = {
  id: string;
  name: string;
  role: string;
  outlet_id?: string; // Added to help assign attendance when filter is 'All'
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

const ADMIN_PASSWORD = 'attend123';

export default function AttendancePage() {
  const [currentISTDate] = useState(getISTDateString());
  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [dateFilter, setDateFilter] = useState(currentISTDate);
  const [outletFilter, setOutletFilter] = useState('all');
  const [searchTerm, setSearchTerm] = useState('');

  // --- NEW: Monthly Off Tracking ---
  const [monthlyOffCounts, setMonthlyOffCounts] = useState<Record<string, number>>({});

  // Modals State
  const [isSingleDeleteModalOpen, setIsSingleDeleteModalOpen] = useState(false);
  const [isApprovalModalOpen, setIsApprovalModalOpen] = useState(false);
  const [isOutletChangeModalOpen, setIsOutletChangeModalOpen] = useState(false);
  const [isForceLogoutModalOpen, setIsForceLogoutModalOpen] = useState(false);
  
  // Bulk Action Modals
  const [isBulkLogoutModalOpen, setIsBulkLogoutModalOpen] = useState(false);
  const [isBulkDeleteModalOpen, setIsBulkDeleteModalOpen] = useState(false);

  // Summary Modal State
  const [isSummaryModalOpen, setIsSummaryModalOpen] = useState(false);
  const [summaryEmployee, setSummaryEmployee] = useState<Employee | null>(null);
  const [summaryMonth, setSummaryMonth] = useState(new Date().toISOString().slice(0, 7)); // YYYY-MM
  const [summaryStats, setSummaryStats] = useState({ present: 0, absent: 0, weeklyOff: 0 });
  const [isStatsLoading, setIsStatsLoading] = useState(false);

  // Data State
  const [recordToDelete, setRecordToDelete] = useState<AttendanceRecord | null>(null);
  const [requestToApprove, setRequestToApprove] = useState<AttendanceRecord | null>(null);
  const [recordToTransfer, setRecordToTransfer] = useState<AttendanceRecord | null>(null);
  const [recordToLogout, setRecordToLogout] = useState<AttendanceRecord | null>(null);
  
  // Form/Action State
  const [adminPassword, setAdminPassword] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [newOutletId, setNewOutletId] = useState('');
  const [markingId, setMarkingId] = useState<string | null>(null); // For marking absent/off loading state

  const fetchEmployees = useCallback(async () => {
    // Added outlet_id to selection
    const { data } = await supabase.from('employees').select('id, name, role, outlet_id').eq('is_active', true).order('name');
    setEmployees(data || []);
  }, []);

  const fetchAttendance = useCallback(async () => {
    setLoading(true);
    try {
      let query = supabase.from('attendance').select(`*`).eq('date', dateFilter);
      if (outletFilter !== 'all') query = query.eq('outlet_id', outletFilter);
      const { data, error } = await query;
      if (error) throw error;
      setRecords(data || []);
    } catch (err) {
      console.error('Error fetching attendance:', err);
    } finally {
      setLoading(false);
    }
  }, [dateFilter, outletFilter]);

  // --- NEW: Fetch Monthly Off Counts ---
  const fetchMonthlyOffs = useCallback(async () => {
      // Calculate start and end of the currently filtered month
      const [year, month] = dateFilter.split('-').map(Number);
      const startOfMonth = `${year}-${String(month).padStart(2, '0')}-01`;
      // Get last day of month
      const endOfMonth = new Date(year, month, 0).toISOString().split('T')[0];

      try {
          const { data, error } = await supabase
              .from('attendance')
              .select('employee_id')
              .eq('status', 'Weekly Off')
              .gte('date', startOfMonth)
              .lte('date', endOfMonth);
          
          if (error) throw error;

          // Aggregate counts
          const counts: Record<string, number> = {};
          data?.forEach((r) => {
              counts[r.employee_id] = (counts[r.employee_id] || 0) + 1;
          });
          setMonthlyOffCounts(counts);

      } catch (err) {
          console.error("Error fetching monthly offs:", err);
      }
  }, [dateFilter]);

  // --- Fetch Employee Stats (Individual Summary) ---
  const fetchEmployeeStats = useCallback(async (empId: string, monthStr: string) => {
      setIsStatsLoading(true);
      try {
          const startOfMonth = `${monthStr}-01`;
          const [y, m] = monthStr.split('-').map(Number);
          const endOfMonth = new Date(y, m, 0).toISOString().split('T')[0];

          const { data, error } = await supabase
              .from('attendance')
              .select('status, check_in_time')
              .eq('employee_id', empId)
              .gte('date', startOfMonth)
              .lte('date', endOfMonth);

          if (error) throw error;

          const stats = { present: 0, absent: 0, weeklyOff: 0 };
          data?.forEach(r => {
              if (r.status === 'Absent') stats.absent++;
              else if (r.status === 'Weekly Off') stats.weeklyOff++;
              else if (r.status === 'Present' || r.check_in_time) stats.present++;
          });
          setSummaryStats(stats);
      } catch (err) {
          console.error("Error fetching stats:", err);
      } finally {
          setIsStatsLoading(false);
      }
  }, []);

  // --- NEW: Mark Status Manually ---
  const handleMarkStatus = async (emp: Employee, status: 'Absent' | 'Weekly Off') => {
    setMarkingId(emp.id);
    try {
        // Determine correct outlet. 
        // 1. Use the filter if selected. 
        // 2. Use employee's default outlet if filter is 'all'.
        const targetOutletId = outletFilter !== 'all' ? outletFilter : emp.outlet_id;
        
        if (!targetOutletId) {
            alert("Please select a specific Outlet Filter to mark attendance for this employee, or ensure they have a default outlet assigned.");
            setMarkingId(null);
            return;
        }

        const targetOutlet = OUTLETS.find(o => o.id === targetOutletId);

        const { error } = await supabase.from('attendance').insert({
            employee_id: emp.id,
            employee_name: emp.name,
            outlet_id: targetOutletId,
            outlet_name: targetOutlet?.name || 'Unknown',
            date: dateFilter,
            status: status,
            check_in_time: null,
            check_out_time: null
        });

        if (error) throw error;
        
        await fetchAttendance();
        fetchMonthlyOffs(); // Refresh limits
    } catch (err: any) {
        alert('Failed to mark status: ' + err.message);
    } finally {
        setMarkingId(null);
    }
  };

  useEffect(() => {
    fetchEmployees();
    fetchAttendance();
    fetchMonthlyOffs(); 
  }, [fetchEmployees, fetchAttendance, fetchMonthlyOffs]);

  useEffect(() => {
      if (isSummaryModalOpen && summaryEmployee) {
          fetchEmployeeStats(summaryEmployee.id, summaryMonth);
      }
  }, [summaryMonth, isSummaryModalOpen, summaryEmployee, fetchEmployeeStats]);

  const handleOpenSummary = (emp: Employee) => {
      setSummaryEmployee(emp);
      setSummaryMonth(new Date().toISOString().slice(0, 7));
      setIsSummaryModalOpen(true);
  };

  // --- HELPERS FOR LIMIT LOGIC ---
  const getOffLimit = (role: string) => {
      const r = role.toLowerCase();
      if (r.includes('manager')) return 4;
      return 2; // Therapist, Housekeeping, etc.
  };

  // --- ACTIONS (Unchanged) ---
  const handleForceLogout = async () => {
    if (!recordToLogout || adminPassword !== ADMIN_PASSWORD) {
        setErrorMsg('Incorrect admin password');
        return;
    }
    setIsProcessing(true);
    try {
        const now = new Date().toISOString();
        const { error: attError } = await supabase.from('attendance').update({ check_out_time: now, status: 'Present' }).eq('id', recordToLogout.id);
        if (attError) throw attError;
        const { error: empError } = await supabase.from('employees').update({ is_checked_in: false, current_attendance_id: null, current_outlet_name: null }).eq('id', recordToLogout.employee_id);
        if (empError) throw empError;

        setIsForceLogoutModalOpen(false);
        setRecordToLogout(null);
        setAdminPassword('');
        fetchAttendance();
    } catch (err: any) {
        setErrorMsg(err.message || 'Failed to logout employee');
    } finally {
        setIsProcessing(false);
    }
  };

  const handleSingleRecordDelete = async () => {
    if (!recordToDelete || adminPassword !== ADMIN_PASSWORD) {
        setErrorMsg('Incorrect admin password');
        return;
    }
    setIsProcessing(true);
    try {
      const { data: emp } = await supabase.from('employees').select('current_attendance_id').eq('id', recordToDelete.employee_id).single();
      const { error: delErr } = await supabase.from('attendance').delete().eq('id', recordToDelete.id);
      if (delErr) throw delErr;
      
      if (emp?.current_attendance_id === recordToDelete.id) {
        await supabase.from('employees').update({ is_checked_in: false, current_attendance_id: null, current_outlet_name: null }).eq('id', recordToDelete.employee_id);
      }
      setIsSingleDeleteModalOpen(false);
      setRecordToDelete(null);
      setAdminPassword('');
      fetchAttendance(); 
    } catch (err: any) {
      alert(err.message || 'Failed to delete record.');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleOutletTransfer = async () => {
      if (!recordToTransfer || !newOutletId || adminPassword !== ADMIN_PASSWORD) { setErrorMsg('Incorrect password'); return; }
      setIsProcessing(true);
      const newOutletName = OUTLETS.find(o => o.id === newOutletId)?.name;
      try {
          await supabase.from('attendance').update({ outlet_id: newOutletId, outlet_name: newOutletName }).eq('id', recordToTransfer.id);
          await supabase.from('employees').update({ current_outlet_name: newOutletName }).eq('id', recordToTransfer.employee_id);
          setIsOutletChangeModalOpen(false);
          setRecordToTransfer(null);
          setAdminPassword('');
          fetchAttendance();
      } finally { setIsProcessing(false); }
  };

  const handleBulkLogout = async () => {
    if (adminPassword !== ADMIN_PASSWORD) { setErrorMsg('Incorrect password'); return; }
    setIsProcessing(true);
    try {
        const now = new Date().toISOString();
        let query = supabase.from('attendance').select('id, employee_id').eq('date', dateFilter).is('check_out_time', null);
        if (outletFilter !== 'all') query = query.eq('outlet_id', outletFilter);
        const { data: activeRecords, error: fetchError } = await query;
        if (fetchError) throw fetchError;

        if (activeRecords && activeRecords.length > 0) {
            const ids = activeRecords.map(r => r.id);
            const empIds = activeRecords.map(r => r.employee_id);
            await supabase.from('attendance').update({ check_out_time: now, status: 'Present' }).in('id', ids);
            await supabase.from('employees').update({ is_checked_in: false, current_attendance_id: null, current_outlet_name: null }).in('id', empIds);
        }
        setIsBulkLogoutModalOpen(false);
        setAdminPassword('');
        fetchAttendance();
    } catch (err: any) { setErrorMsg(err.message); } finally { setIsProcessing(false); }
  };

  const handleBulkDelete = async () => {
    if (adminPassword !== ADMIN_PASSWORD) { setErrorMsg('Incorrect password'); return; }
    setIsProcessing(true);
    try {
        let query = supabase.from('attendance').select('id, employee_id').eq('date', dateFilter);
        if (outletFilter !== 'all') query = query.eq('outlet_id', outletFilter);
        const { data: targetRecords, error: fetchError } = await query;
        if (fetchError) throw fetchError;

        if (targetRecords && targetRecords.length > 0) {
            const ids = targetRecords.map(r => r.id);
            const empIds = targetRecords.map(r => r.employee_id);
            await supabase.from('attendance').delete().in('id', ids);
            await supabase.from('employees').update({ is_checked_in: false, current_attendance_id: null, current_outlet_name: null }).in('id', empIds);
        }
        setIsBulkDeleteModalOpen(false);
        setAdminPassword('');
        fetchAttendance();
    } catch (err: any) { setErrorMsg(err.message); } finally { setIsProcessing(false); }
  };

  const filteredData = employees.map(emp => ({
    employee: emp,
    record: records.find(r => r.employee_id === emp.id) || null
  })).filter(item => {
    const outletMatch = outletFilter === 'all' || item.record?.outlet_id === outletFilter;
    const nameMatch = item.employee.name.toLowerCase().includes(searchTerm.toLowerCase());
    return outletMatch && nameMatch;
  });

  return (
    <div className="max-w-7xl mx-auto p-4 md:p-8 space-y-6 bg-slate-50/50 min-h-screen">
      
      {/* 1. HEADER */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Attendance Logs</h1>
          <p className="text-sm text-slate-500 font-medium">Manage and monitor branch performance.</p>
        </div>
        
        <div className="flex flex-wrap gap-3 items-center">
            {/* BULK ACTIONS UI Unchanged */}
            <button 
                onClick={() => { setIsBulkLogoutModalOpen(true); setErrorMsg(''); setAdminPassword(''); }}
                className="px-4 py-2 bg-amber-100 hover:bg-amber-200 text-amber-900 rounded-xl text-sm font-bold flex items-center gap-2 transition-colors border border-amber-200"
            >
                <LogOut size={16} /> Logout All
            </button>
            <button 
                onClick={() => { setIsBulkDeleteModalOpen(true); setErrorMsg(''); setAdminPassword(''); }}
                className="px-4 py-2 bg-rose-100 hover:bg-rose-200 text-rose-900 rounded-xl text-sm font-bold flex items-center gap-2 transition-colors border border-rose-200"
            >
                <Trash2 size={16} /> Delete All
            </button>

            <div className="h-8 w-px bg-slate-200 mx-1 hidden md:block"></div>

            <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                <input 
                    type="text" 
                    placeholder="Search staff..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-9 pr-4 py-2 text-sm border border-slate-200 rounded-xl bg-white text-slate-900 outline-none focus:ring-2 focus:ring-indigo-500 w-full md:w-64 transition-all"
                />
            </div>

            <select 
              value={outletFilter}
              onChange={(e) => setOutletFilter(e.target.value)}
              className="px-4 py-2 text-sm border border-slate-200 rounded-xl bg-white text-slate-900 font-medium outline-none focus:ring-2 focus:ring-indigo-500 transition-all cursor-pointer"
            >
              <option value="all">All Outlets</option>
              {OUTLETS.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
            </select>

            <div className="flex items-center px-4 py-2 border border-slate-200 rounded-xl bg-white gap-2">
              <CalendarIcon size={16} className="text-slate-900" />
              <input 
                type="date" 
                value={dateFilter}
                onChange={(e) => setDateFilter(e.target.value)}
                className="text-sm text-slate-900 font-bold outline-none bg-transparent"
                max={currentISTDate}
              />
            </div>
        </div>
      </div>

      {/* 2. MAIN DATA TABLE */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50/50 border-b border-slate-200 text-slate-900">
                <th className="px-6 py-4 text-xs font-bold uppercase tracking-wider">Employee</th>
                <th className="px-6 py-4 text-xs font-bold uppercase tracking-wider">Outlet</th>
                <th className="px-6 py-4 text-xs font-bold uppercase tracking-wider">In Time</th>
                <th className="px-6 py-4 text-xs font-bold uppercase tracking-wider">Out Time</th>
                <th className="px-6 py-4 text-xs font-bold uppercase tracking-wider">Status</th>
                <th className="px-6 py-4 text-right text-xs font-bold uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr><td colSpan={6} className="py-20 text-center"><Loader2 className="animate-spin mx-auto text-indigo-500" /></td></tr>
              ) : filteredData.length === 0 ? (
                <tr><td colSpan={6} className="py-20 text-center text-slate-600 font-bold italic">No records found.</td></tr>
              ) : (
                filteredData.map(({ employee, record }) => {
                  const isWorking = record?.check_in_time && !record?.check_out_time;
                  
                  // --- NEW: LOGIC FOR NO RECORD ---
                  let noRecordStatus = null;
                  if (!record) {
                      const offsUsed = monthlyOffCounts[employee.id] || 0;
                      const offLimit = getOffLimit(employee.role);
                      
                      if (offsUsed >= offLimit) {
                          noRecordStatus = (
                              <span className="px-2 py-1 rounded bg-rose-100 text-rose-800 text-[10px] font-bold uppercase border border-rose-200 flex items-center gap-1 w-fit">
                                  <AlertTriangle size={12} /> Absent (Limit Exceeded)
                              </span>
                          );
                      } else {
                          // Still have quota left
                          noRecordStatus = (
                              <span className="px-2 py-1 rounded bg-slate-100 text-slate-600 text-[10px] font-bold uppercase flex items-center gap-1 w-fit">
                                  <CalendarOff size={12} /> Auto Weekly Off ({offLimit - offsUsed} left)
                              </span>
                          );
                      }
                  }

                  return (
                    <tr key={employee.id} className="hover:bg-slate-50/30 transition-colors">
                      <td className="px-6 py-4">
                        <div 
                            className="flex items-center gap-3 cursor-pointer group"
                            onClick={() => handleOpenSummary(employee)}
                            title="Click to view attendance summary"
                        >
                            <div className="w-10 h-10 rounded-full bg-slate-900 flex items-center justify-center text-white font-bold text-sm group-hover:bg-indigo-600 transition-colors shadow-sm">
                                {employee.name.charAt(0)}
                            </div>
                            <div>
                                <div className="text-sm font-bold text-slate-900 group-hover:text-indigo-600 transition-colors flex items-center gap-1">
                                    {employee.name}
                                    <BarChart3 size={12} className="opacity-0 group-hover:opacity-100 transition-opacity" />
                                </div>
                                <div className="text-[10px] text-slate-600 font-bold uppercase tracking-tight">{employee.role || 'Therapist'}</div>
                            </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-sm font-bold text-slate-800">
                        {record?.outlet_name || '—'}
                      </td>
                      <td className="px-6 py-4 text-sm font-bold text-emerald-700">
                        {formatTime(record?.check_in_time)}
                      </td>
                      <td className="px-6 py-4 text-sm font-bold text-slate-900">
                        {formatTime(record?.check_out_time)}
                      </td>
                      <td className="px-6 py-4">
                         {!record ? (
                           <div className="flex flex-col gap-2">
                                {/* Auto Status Display */}
                                <div>{noRecordStatus}</div>
                                
                                {/* Manual Mark Buttons */}
                                <div className="flex items-center gap-2">
                                   <button 
                                       disabled={!!markingId}
                                       onClick={() => handleMarkStatus(employee, 'Absent')}
                                       className="px-2 py-1 bg-white border border-rose-200 text-rose-700 rounded text-[10px] font-bold uppercase hover:bg-rose-50 transition-colors disabled:opacity-50"
                                   >
                                       {markingId === employee.id ? '...' : 'Mark Absent'}
                                   </button>
                                   <button 
                                       disabled={!!markingId}
                                       onClick={() => handleMarkStatus(employee, 'Weekly Off')}
                                       className="px-2 py-1 bg-white border border-gray-300 text-gray-700 rounded text-[10px] font-bold uppercase hover:bg-gray-100 transition-colors disabled:opacity-50"
                                   >
                                       Mark Off
                                   </button>
                               </div>
                           </div>
                         ) : record.status === 'Absent' ? (
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
                         )}
                      </td>
                      <td className="px-6 py-4 text-right">
                        <div className="flex items-center justify-end gap-2">
                            {/* Action buttons remain unchanged */}
                            {record?.early_checkout_requested && (
                                <button onClick={() => { setRequestToApprove(record); setIsApprovalModalOpen(true); }} className="px-3 py-1.5 bg-amber-500 text-black rounded-lg text-[10px] font-bold uppercase">Review</button>
                            )}
                            
                            {isWorking && record && record.status !== 'Absent' && record.status !== 'Weekly Off' && (
                                <>
                                  <button onClick={() => { setRecordToLogout(record); setErrorMsg(''); setAdminPassword(''); setIsForceLogoutModalOpen(true); }} className="p-2 text-amber-600 hover:bg-amber-50 rounded-lg transition-all"><LogOut size={18} /></button>
                                  <button onClick={() => { setRecordToTransfer(record); setNewOutletId(record.outlet_id); setIsOutletChangeModalOpen(true); setErrorMsg(''); setAdminPassword(''); }} className="p-2 text-slate-900 hover:bg-slate-100 rounded-lg transition-all"><MapPin size={18} /></button>
                                </>
                            )}

                            {record && (
                                <button onClick={() => { setRecordToDelete(record); setErrorMsg(''); setAdminPassword(''); setIsSingleDeleteModalOpen(true); }} className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-all"><Trash2 size={18} /></button>
                            )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* --- MODALS Section (Unchanged, Summary Modal Added Above) --- */}
      {/* Existing modals for Logout/Delete/Transfer are preserved here */}
      
      {/* SUMMARY MODAL IS ABOVE */}
      {isSummaryModalOpen && summaryEmployee && (
        <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden border border-slate-200">
                <div className="p-6 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="w-12 h-12 rounded-full bg-slate-900 flex items-center justify-center text-white font-bold text-lg shadow-sm">
                            {summaryEmployee.name.charAt(0)}
                        </div>
                        <div>
                            <h2 className="text-lg font-bold text-slate-900">{summaryEmployee.name}</h2>
                            <p className="text-xs text-slate-500 font-bold uppercase tracking-wide">{summaryEmployee.role}</p>
                        </div>
                    </div>
                    <button onClick={() => setIsSummaryModalOpen(false)} className="text-slate-400 hover:text-slate-600 transition-colors">
                        <XCircle size={28} />
                    </button>
                </div>
                
                <div className="p-6 space-y-6">
                    <div>
                        <label className="text-[10px] font-extrabold text-slate-500 uppercase mb-2 block tracking-wider">Select Month</label>
                        <input
                            type="month"
                            value={summaryMonth}
                            onChange={(e) => setSummaryMonth(e.target.value)}
                            className="w-full px-4 py-3 border border-slate-200 rounded-xl text-sm font-bold text-slate-800 bg-slate-50 focus:bg-white outline-none focus:ring-2 focus:ring-indigo-500 transition-all"
                        />
                    </div>

                    {isStatsLoading ? (
                        <div className="py-8 flex justify-center">
                            <Loader2 className="animate-spin text-indigo-600 h-8 w-8" />
                        </div>
                    ) : (
                        <div className="grid grid-cols-2 gap-4">
                            <div className="p-5 bg-rose-50 rounded-2xl border border-rose-100 flex flex-col items-center justify-center gap-1 group hover:border-rose-200 transition-colors">
                                <div className="text-3xl font-black text-rose-600 group-hover:scale-110 transition-transform">{summaryStats.absent}</div>
                                <div className="text-[10px] font-bold text-rose-800 uppercase tracking-widest flex items-center gap-1">
                                    <XCircle size={12} /> Absents
                                </div>
                            </div>
                            
                            <div className="p-5 bg-amber-50 rounded-2xl border border-amber-100 flex flex-col items-center justify-center gap-1 group hover:border-amber-200 transition-colors">
                                <div className="text-3xl font-black text-amber-600 group-hover:scale-110 transition-transform">{summaryStats.weeklyOff}</div>
                                <div className="text-[10px] font-bold text-amber-800 uppercase tracking-widest flex items-center gap-1">
                                    <CalendarOff size={12} /> Weekly Offs
                                </div>
                            </div>

                            <div className="col-span-2 p-5 bg-emerald-50 rounded-2xl border border-emerald-100 flex flex-col items-center justify-center gap-1 group hover:border-emerald-200 transition-colors">
                                <div className="text-3xl font-black text-emerald-600 group-hover:scale-110 transition-transform">{summaryStats.present}</div>
                                <div className="text-[10px] font-bold text-emerald-800 uppercase tracking-widest flex items-center gap-1">
                                    <User size={12} /> Days Present
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
      )}

      {/* Preserve existing modals: Force Logout, Bulk Logout, Bulk Delete, Single Delete, Transfer */}
      {isForceLogoutModalOpen && recordToLogout && (
        <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden border border-slate-200">
            <div className="p-6 bg-amber-50 border-b border-amber-100 flex items-center gap-3 text-amber-900 font-bold">
                <LogOut size={20} />
                <h2 className="text-slate-900">Force Staff Logout</h2>
            </div>
            <div className="p-6 space-y-4">
                <p className="text-sm text-slate-900 font-medium">
                    Manually checking out <strong className="text-black font-extrabold">{recordToLogout.employee_name}</strong>.
                </p>
                <div>
                    <label className="text-[10px] font-bold text-slate-900 uppercase mb-1 block">Admin PIN</label>
                    <input type="password" value={adminPassword} onChange={(e) => {setAdminPassword(e.target.value); setErrorMsg('');}} className="w-full px-4 py-3 bg-slate-50 border border-slate-900 rounded-xl text-sm font-bold text-black outline-none" placeholder="••••••••" />
                    {errorMsg && <p className="text-[10px] text-rose-600 font-bold mt-1 uppercase">{errorMsg}</p>}
                </div>
                <div className="flex gap-3 pt-2">
                    <button onClick={() => setIsForceLogoutModalOpen(false)} className="flex-1 py-2.5 text-slate-900 font-bold text-xs uppercase bg-slate-100 rounded-xl transition-colors">Cancel</button>
                    <button onClick={handleForceLogout} disabled={isProcessing || !adminPassword} className="flex-1 py-2.5 bg-amber-600 text-white rounded-xl font-bold text-xs uppercase hover:bg-amber-700">
                        {isProcessing ? <Loader2 className="animate-spin h-3 w-3 inline" /> : 'Confirm Logout'}
                    </button>
                </div>
            </div>
          </div>
        </div>
      )}

      {isBulkLogoutModalOpen && (
        <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden border border-slate-200">
            <div className="p-6 bg-amber-50 border-b border-amber-100 flex items-center gap-3 text-amber-900 font-bold">
                <LogOut size={20} />
                <h2 className="text-slate-900">Bulk Logout</h2>
            </div>
            <div className="p-6 space-y-4">
                <p className="text-sm text-slate-900 font-medium">
                    You are about to force logout <strong>ALL active staff</strong> visible in the current filter.
                </p>
                <div>
                    <label className="text-[10px] font-bold text-slate-900 uppercase mb-1 block">Admin PIN</label>
                    <input type="password" value={adminPassword} onChange={(e) => {setAdminPassword(e.target.value); setErrorMsg('');}} className="w-full px-4 py-3 bg-slate-50 border border-slate-900 rounded-xl text-sm font-bold text-black outline-none" placeholder="••••••••" />
                    {errorMsg && <p className="text-[10px] text-rose-600 font-bold mt-1 uppercase">{errorMsg}</p>}
                </div>
                <div className="flex gap-3 pt-2">
                    <button onClick={() => setIsBulkLogoutModalOpen(false)} className="flex-1 py-2.5 text-slate-900 font-bold text-xs uppercase bg-slate-100 rounded-xl transition-colors">Cancel</button>
                    <button onClick={handleBulkLogout} disabled={isProcessing || !adminPassword} className="flex-1 py-2.5 bg-amber-600 text-white rounded-xl font-bold text-xs uppercase hover:bg-amber-700">
                        {isProcessing ? <Loader2 className="animate-spin h-3 w-3 inline" /> : 'Logout All'}
                    </button>
                </div>
            </div>
          </div>
        </div>
      )}

      {isBulkDeleteModalOpen && (
        <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden border border-slate-200">
            <div className="p-6 bg-rose-50 border-b border-rose-100 flex items-center gap-3 text-rose-900 font-bold">
                <Trash2 size={20} />
                <h2 className="text-slate-900">Delete All Logs</h2>
            </div>
            <div className="p-6 space-y-4">
                <p className="text-sm text-slate-900 font-medium">
                    <strong>Warning:</strong> This will permanently delete ALL attendance records for the selected date/outlet.
                </p>
                <div>
                    <label className="text-[10px] font-bold text-slate-900 uppercase mb-1 block">Admin PIN</label>
                    <input type="password" value={adminPassword} onChange={(e) => {setAdminPassword(e.target.value); setErrorMsg('');}} className="w-full px-4 py-3 bg-slate-50 border border-slate-900 rounded-xl text-sm font-bold text-black outline-none" placeholder="••••••••" />
                    {errorMsg && <p className="text-[10px] text-rose-600 font-bold mt-1 uppercase">{errorMsg}</p>}
                </div>
                <div className="flex gap-3 pt-2">
                    <button onClick={() => setIsBulkDeleteModalOpen(false)} className="flex-1 py-2.5 text-slate-900 font-bold text-xs uppercase bg-slate-100 rounded-xl transition-colors">Cancel</button>
                    <button onClick={handleBulkDelete} disabled={isProcessing || !adminPassword} className="flex-1 py-2.5 bg-rose-600 text-white rounded-xl font-bold text-xs uppercase hover:bg-rose-700">
                        {isProcessing ? <Loader2 className="animate-spin h-3 w-3 inline" /> : 'Delete All'}
                    </button>
                </div>
            </div>
          </div>
        </div>
      )}

      {isSingleDeleteModalOpen && recordToDelete && (
        <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden border border-slate-200">
            <div className="p-6 bg-rose-50 border-b border-rose-100 flex items-center gap-3 text-rose-900 font-bold">
                <ShieldAlert size={20} />
                <h2 className="text-slate-900">Security Confirmation</h2>
            </div>
            <div className="p-6 space-y-4">
                <p className="text-sm text-slate-900 font-medium">
                    You are permanently deleting the attendance record for <strong className="text-black font-extrabold">{recordToDelete.employee_name}</strong>.
                </p>
                <div>
                    <label className="text-[10px] font-bold text-slate-900 uppercase mb-1 block">Admin PIN</label>
                    <input type="password" value={adminPassword} onChange={(e) => {setAdminPassword(e.target.value); setErrorMsg('');}} className="w-full px-4 py-3 bg-slate-50 border border-slate-900 rounded-xl text-sm font-bold text-black outline-none" placeholder="••••••••" />
                    {errorMsg && <p className="text-[10px] text-rose-600 font-bold mt-1 uppercase">{errorMsg}</p>}
                </div>
                <div className="flex gap-3 pt-2">
                    <button onClick={() => setIsSingleDeleteModalOpen(false)} className="flex-1 py-2.5 text-slate-900 font-bold text-xs uppercase bg-slate-100 rounded-xl transition-colors">Cancel</button>
                    <button onClick={handleSingleRecordDelete} disabled={isProcessing || !adminPassword} className="flex-1 py-2.5 bg-rose-600 text-white rounded-xl font-bold text-xs uppercase">
                        {isProcessing ? <Loader2 className="animate-spin h-3 w-3 inline" /> : 'Confirm Delete'}
                    </button>
                </div>
            </div>
          </div>
        </div>
      )}

      {isOutletChangeModalOpen && recordToTransfer && (
        <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden border border-slate-200">
            <div className="p-6 bg-slate-900 border-b border-slate-800 flex items-center gap-3 text-white">
                <MapPin size={20} className="text-indigo-400" />
                <h2 className="font-bold uppercase tracking-tight">Branch Transfer</h2>
            </div>
            <div className="p-6 space-y-4">
                <p className="text-sm text-slate-900 font-bold leading-relaxed">
                    Move <strong className="text-indigo-600 underline font-extrabold">{recordToTransfer.employee_name}</strong> to a different location.
                </p>
                <div className="space-y-4 pt-2">
                    <div>
                        <label className="text-[10px] font-extrabold text-slate-900 uppercase mb-1 block">New Destination</label>
                        <select value={newOutletId} onChange={(e) => setNewOutletId(e.target.value)} className="w-full px-4 py-2.5 bg-white border-2 border-slate-900 rounded-xl text-sm font-black text-black outline-none">
                            <option value="">Select Outlet...</option>
                            {OUTLETS.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
                        </select>
                    </div>
                    <div>
                        <label className="text-[10px] font-extrabold text-slate-900 uppercase mb-1 block">Security PIN</label>
                        <input type="password" value={adminPassword} onChange={(e) => {setAdminPassword(e.target.value); setErrorMsg('');}} className="w-full px-4 py-3 bg-white border-2 border-slate-900 rounded-xl text-sm font-black text-black outline-none" placeholder="••••••••" />
                        {errorMsg && <p className="text-[10px] text-rose-600 font-extrabold mt-1 uppercase">{errorMsg}</p>}
                    </div>
                </div>
                <div className="flex gap-3 pt-4">
                    <button onClick={() => setIsOutletChangeModalOpen(false)} className="flex-1 py-2.5 text-slate-900 border-2 border-slate-900 font-bold text-xs uppercase bg-white rounded-xl transition-colors hover:bg-slate-50">Cancel</button>
                    <button onClick={handleOutletTransfer} disabled={isProcessing || !adminPassword || !newOutletId} className="flex-1 py-2.5 bg-slate-900 text-white font-bold text-xs uppercase rounded-xl transition-colors hover:bg-slate-800 shadow-lg">
                        Execute Transfer
                    </button>
                </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}