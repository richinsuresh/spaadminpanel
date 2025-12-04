'use client';

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { OUTLETS, Outlet } from '@/lib/outlet';
import { Trash2, AlertTriangle, Loader2, X, Clock, MapPin, Edit } from 'lucide-react';

// --- Types ---
type Employee = {
  id: string;
  name: string;
  role: string;
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

// --- DATE HELPERS FOR IST ---
// India Standard Time (IST) is UTC + 5:30.
const IST_OFFSET_MINUTES = 5.5 * 60; 

// Gets the current date string (YYYY-MM-DD) based on IST
const getISTDateString = (date?: Date): string => {
    const now = date || new Date();
    const localOffset = now.getTimezoneOffset(); 
    // Calculate time adjusted to IST
    const istTime = new Date(now.getTime() + (IST_OFFSET_MINUTES + localOffset) * 60 * 1000);
    
    return istTime.toISOString().split('T')[0];
};

// Gets the date string for the day *before* the current IST day
const getYesterdayISTDateString = (todayString: string): string => {
    const today = new Date(todayString);
    today.setDate(today.getDate() - 1);
    return getISTDateString(today);
};
// ----------------------------


const getStatusBadge = (status: string, checkOutTime: string | null) => {
  if (status === 'leave') return <span className="px-2 py-1 bg-red-100 text-red-700 text-xs rounded-full">On Leave</span>;
  if (status === 'off') return <span className="px-2 py-1 bg-gray-200 text-gray-700 text-xs rounded-full">Weekly Off</span>;
  if (checkOutTime) return <span className="px-2 py-1 bg-blue-100 text-blue-700 text-xs rounded-full">Completed</span>;
  return <span className="px-2 py-1 bg-green-100 text-green-800 text-xs rounded-full animate-pulse">Working Now</span>;
};

const formatTime = (dateStr: string | null) => {
  if (!dateStr) return '—';
  // Formatting in IST for consistency
  return new Date(dateStr).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata' });
};

// --- Admin Password (Change for production) ---
const ADMIN_PASSWORD = 'attend123';

export default function AttendancePage() {
  const [currentISTDate] = useState(getISTDateString());
  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [dateFilter, setDateFilter] = useState(currentISTDate); // Initialize with today's IST date
  const [outletFilter, setOutletFilter] = useState('all');

  // Clear All History State
  const [isClearModalOpen, setIsClearModalOpen] = useState(false);
  const [clearPassword, setClearPassword] = useState('');
  const [clearError, setClearError] = useState('');
  const [isClearing, setIsClearing] = useState(false);
  
  // Single Record Delete State
  const [isSingleDeleteModalOpen, setIsSingleDeleteModalOpen] = useState(false);
  const [recordToDelete, setRecordToDelete] = useState<AttendanceRecord | null>(null);
  const [isSingleDeleting, setIsSingleDeleting] = useState(false);
  
  // Early Checkout Approval State
  const [isApprovalModalOpen, setIsApprovalModalOpen] = useState(false);
  const [requestToApprove, setRequestToApprove] = useState<AttendanceRecord | null>(null);
  const [isApproving, setIsApproving] = useState(false);
  
  // --- NEW: Change Outlet State ---
  const [isOutletChangeModalOpen, setIsOutletChangeModalOpen] = useState(false);
  const [recordToTransfer, setRecordToTransfer] = useState<AttendanceRecord | null>(null);
  const [newOutletId, setNewOutletId] = useState('');
  const [transferPassword, setTransferPassword] = useState('');
  const [transferError, setTransferError] = useState('');
  const [isTransferring, setIsTransferring] = useState(false);


  const fetchEmployees = useCallback(async () => {
    const { data } = await supabase.from('employees').select('id, name, role').eq('is_active', true).order('name');
    setEmployees(data || []);
  }, []);

  const fetchAttendance = useCallback(async () => {
    try {
      let query = supabase
        .from('attendance')
        .select(`*, 
                early_checkout_requested, 
                early_checkout_request_time`)
        .eq('date', dateFilter);

      if (outletFilter !== 'all') {
        query = query.eq('outlet_id', outletFilter);
      }
      
      const { data, error } = await query;
      if (error) throw error;
      setRecords(data || []);
    } catch (err) {
      console.error('Error fetching attendance:', err);
    } finally {
      setLoading(false);
    }
  }, [dateFilter, outletFilter]);

  // --- Daily Reset/Force Logout Logic ---
  const forceLogoutPreviousDay = useCallback(async () => {
    const yesterday = getYesterdayISTDateString(currentISTDate);
    // Set the check-out time to midnight IST of the previous day
    const midnightOfYesterdayIST = `${yesterday}T23:59:59.000+05:30`; 

    try {
        // Find attendance records from previous days that are still checked in
        const { data: oldRecords, error: fetchError } = await supabase
            .from('attendance')
            .select('id, employee_id')
            .lt('date', currentISTDate) // date is less than today
            .is('check_out_time', null); // still checked in

        if (fetchError) throw fetchError;

        if (oldRecords && oldRecords.length > 0) {
            console.log(`[Auto Logout] Found ${oldRecords.length} employees checked-in on previous days.`);

            const recordIds = oldRecords.map(r => r.id);
            const employeeIds = oldRecords.map(r => r.employee_id);

            // 1. Update the old attendance records
            const { error: updateRecordsError } = await supabase
                .from('attendance')
                .update({ 
                    check_out_time: midnightOfYesterdayIST,
                    status: 'Completed (Auto Logout)',
                    early_checkout_requested: false,
                })
                .in('id', recordIds);
            
            if (updateRecordsError) throw updateRecordsError;

            // 2. Reset the employee status
            const { error: updateEmployeesError } = await supabase
                .from('employees')
                .update({ 
                    is_checked_in: false, 
                    current_attendance_id: null,
                    current_outlet_name: null 
                })
                .in('id', employeeIds);
            
            if (updateEmployeesError) throw updateEmployeesError;

            console.log('[Auto Logout] Previous day attendance reset successful.');
        }

    } catch (err) {
        console.error('[Auto Logout] Error during automatic reset:', err);
    }
  }, [currentISTDate]);
  // ---------------------------------------------


  // Initial Load & Daily Reset Trigger
  useEffect(() => {
    setLoading(true);
    fetchEmployees();
    
    // Ensure force logout runs before fetching today's attendance
    forceLogoutPreviousDay().then(() => {
        fetchAttendance();
    });
    
  }, [fetchEmployees, fetchAttendance, forceLogoutPreviousDay]);

  // Real-time Auto Refresh 
  useEffect(() => {
    const channel = supabase
      .channel('admin-attendance-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'attendance' }, () => {
        console.log('Attendance update detected, refreshing...');
        fetchAttendance();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'employees' }, () => {
        console.log('Employee update detected, refreshing...');
        fetchEmployees();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchAttendance, fetchEmployees]);


  // --- Handle Clear ALL History ---
  const handleClearHistory = async () => {
    setClearError('');
    
    // Simple admin password check
    if (clearPassword !== ADMIN_PASSWORD) {
      setClearError('Incorrect password');
      return;
    }

    setIsClearing(true);
    try {
      // 1. Delete all attendance records
      const { error: deleteError } = await supabase
        .from('attendance')
        .delete()
        .neq('id', '00000000-0000-0000-0000-000000000000'); // Delete everything

      if (deleteError) throw deleteError;

      // 2. Reset employee status
      const { error: employeeResetError } = await supabase
        .from('employees')
        .update({ 
            is_checked_in: false, 
            current_attendance_id: null,
            current_outlet_name: null 
        })
        .neq('id', '00000000-0000-0000-0000-000000000000'); // Update everything
        
      if (employeeResetError) throw employeeResetError;


      alert('Attendance history cleared successfully.');
      setIsClearModalOpen(false);
      setClearPassword('');
      // Force refresh of the page data
      fetchAttendance(); 
    } catch (err: any) {
      console.error('Clear error:', err);
      setClearError(err.message || 'Failed to clear history');
    } finally {
      setIsClearing(false);
    }
  };

  // --- Handle Single Record Deletion ---
  const handleSingleRecordDelete = async () => {
    if (!recordToDelete) return;

    setIsSingleDeleting(true);
    
    try {
      // 1. Check if the deleted record is the employee's current check-in record
      const { data: employeeData } = await supabase.from('employees').select('current_attendance_id').eq('id', recordToDelete.employee_id).single();
      const isCurrentRecord = employeeData?.current_attendance_id === recordToDelete.id;

      // 2. Delete the specific attendance record
      const { error: deleteError } = await supabase
        .from('attendance')
        .delete()
        .eq('id', recordToDelete.id); 

      if (deleteError) throw deleteError;

      // 3. If it was the current check-in record, reset the employee status and outlet
      if (isCurrentRecord) {
        await supabase
          .from('employees')
          .update({ 
              is_checked_in: false, 
              current_attendance_id: null,
              current_outlet_name: null 
          })
          .eq('id', recordToDelete.employee_id);
      }

      alert(`Attendance record for ${recordToDelete.employee_name} on ${recordToDelete.date} deleted.`);
      
      setRecordToDelete(null);
      setIsSingleDeleteModalOpen(false);
      fetchAttendance(); 
    } catch (err: any) {
      console.error('Single delete error:', err);
      alert(err.message || 'Failed to delete record.');
    } finally {
      setIsSingleDeleting(false);
    }
  };


  // --- Handle Approve Early Checkout ---
  const handleApproveEarlyCheckout = async () => {
      if (!requestToApprove || !requestToApprove.early_checkout_request_time) return;

      setIsApproving(true);

      try {
          // Use the current time (IST adjusted) as the check-out time
          const checkOutTime = new Date().toISOString(); 
          
          // 1. Update the Attendance record
          const { error: recordError } = await supabase
              .from('attendance')
              .update({
                  check_out_time: checkOutTime, 
                  early_checkout_requested: false,
                  status: 'Completed' 
              })
              .eq('id', requestToApprove.id);

          if (recordError) throw recordError;

          // 2. Reset the employee's check-in status and outlet
          const { error: employeeError } = await supabase
              .from('employees')
              .update({ 
                  is_checked_in: false, 
                  current_attendance_id: null,
                  current_outlet_name: null 
              })
              .eq('id', requestToApprove.employee_id);

          if (employeeError) throw employeeError;

          alert(`Early checkout for ${requestToApprove.employee_name} approved and recorded.`);
          setRequestToApprove(null);
          setIsApprovalModalOpen(false);
          fetchAttendance(); 
      } catch (err: any) {
          console.error('Approval Error:', err);
          alert(`Failed to approve: ${err.message}`);
      } finally {
          setIsApproving(false);
      }
  };

  // --- Handle Deny Early Checkout ---
  const handleDenyEarlyCheckout = async () => {
      if (!requestToApprove) return;

      setIsApproving(true);

      try {
          // 1. Update the Attendance record: Reset the request flag to false
          const { error: recordError } = await supabase
              .from('attendance')
              .update({
                  early_checkout_requested: false,
              })
              .eq('id', requestToApprove.id);

          if (recordError) throw recordError;

          alert(`Early checkout request for ${requestToApprove.employee_name} denied. Employee remains checked in.`);
          setRequestToApprove(null);
          setIsApprovalModalOpen(false);
          fetchAttendance(); 
      } catch (err: any) {
          console.error('Deny Error:', err);
          alert(`Failed to deny request: ${err.message}`);
      } finally {
          setIsApproving(false);
      }
  };
  
  // --- NEW: Handle Outlet Transfer ---
  const handleOutletTransfer = async () => {
      if (!recordToTransfer || !newOutletId) {
          setTransferError('Please select a new outlet.');
          return;
      }
      
      setTransferError('');

      // Admin password check
      if (transferPassword !== ADMIN_PASSWORD) {
        setTransferError('Incorrect password');
        return;
      }
      
      setIsTransferring(true);
      const newOutlet = OUTLETS.find(o => o.id === newOutletId);
      const newOutletName = newOutlet?.name || null;
      
      if (!newOutletName) {
          setTransferError('Invalid new outlet selected.');
          setIsTransferring(false);
          return;
      }

      try {
          // 1. Update the Attendance record (for historical accuracy)
          const { error: recordError } = await supabase
              .from('attendance')
              .update({
                  outlet_id: newOutletId,
                  outlet_name: newOutletName,
                  // Optionally log a note about the transfer
                  status: `${recordToTransfer.status} (Transferred to ${newOutletName})`
              })
              .eq('id', recordToTransfer.id);
          
          if (recordError) throw recordError;

          // 2. Update the Employee record (CRITICAL for client form dropdown)
          const { error: employeeError } = await supabase
              .from('employees')
              .update({ 
                  current_outlet_name: newOutletName,
              })
              .eq('id', recordToTransfer.employee_id);

          if (employeeError) throw employeeError;

          alert(`Successfully transferred ${recordToTransfer.employee_name} to ${newOutletName}.`);
          
          setRecordToTransfer(null);
          setIsOutletChangeModalOpen(false);
          setNewOutletId('');
          setTransferPassword('');
          fetchAttendance(); // Refresh to show the change
      } catch (err: any) {
          console.error('Transfer Error:', err);
          setTransferError(err.message || 'Failed to transfer outlet.');
      } finally {
          setIsTransferring(false);
      }
  };
  
  // Helper to open the outlet change modal
  const openOutletChangeModal = (record: AttendanceRecord) => {
    setRecordToTransfer(record);
    setNewOutletId(record.outlet_id); // Default to current outlet
    setTransferError('');
    setTransferPassword('');
    setIsOutletChangeModalOpen(true);
  };
  // ------------------------------------


  const combinedData = employees.map(emp => {
    // Find the record matching the filter date
    const record = records.find(r => r.employee_id === emp.id);
    return {
      employee: emp,
      record: record || null
    };
  });

  const filteredData = outletFilter === 'all' 
    ? combinedData 
    : combinedData.filter(item => item.record?.outlet_id === outletFilter);

  // Helper function to open the delete modal
  const openSingleDeleteModal = (record: AttendanceRecord) => {
    setRecordToDelete(record);
    setIsSingleDeleteModalOpen(true);
  };


  return (
    <div className="p-6 space-y-6 bg-gray-50 min-h-screen">
      {/* --- Header and Filters --- */}
      <div className="flex flex-col md:flex-row justify-between items-end md:items-center gap-4">
        <h1 className="text-2xl font-bold text-gray-800">Staff Attendance Admin Panel</h1>
        
        <div className="flex gap-4 items-center">
          <button 
            onClick={() => setIsClearModalOpen(true)}
            className="p-2 bg-red-100 text-red-600 rounded-lg hover:bg-red-200 transition-colors"
            title="Clear All History"
          >
            <Trash2 size={20} />
          </button>

          {/* Outlet Filter */}
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Filter Outlet</label>
            <select 
              value={outletFilter}
              onChange={(e) => setOutletFilter(e.target.value)}
              className="p-2 border rounded-lg text-sm text-gray-800 bg-white outline-none w-40"
            >
              <option value="all">All Outlets</option>
              {OUTLETS.map(o => (
                <option key={o.id} value={o.id}>{o.name}</option>
              ))}
            </select>
          </div>

          {/* Date Filter */}
          <div>
             <label className="block text-xs font-medium text-gray-500 mb-1">Date</label>
             <input 
              type="date" 
              value={dateFilter}
              onChange={(e) => setDateFilter(e.target.value)}
              className="p-2 border rounded-lg text-sm text-gray-800 bg-white outline-none"
              max={currentISTDate}
            />
          </div>
        </div>
      </div>
      {/* --- END Header and Filters --- */}

      <div className="bg-white shadow rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Employee</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Outlet</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Check In</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Check Out</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Action</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {loading ? (
                <tr><td colSpan={6} className="p-6 text-center text-gray-500">
                    <Loader2 className="animate-spin mx-auto h-5 w-5 text-gray-500" />
                </td></tr>
              ) : filteredData.length === 0 ? (
                <tr><td colSpan={6} className="p-6 text-center text-gray-500">No records found for this date/outlet.</td></tr>
              ) : (
                filteredData.map(({ employee, record }) => {
                  const outletName = record?.outlet_name || '—';
                  const inTime = record?.check_in_time ? formatTime(record.check_in_time) : '—';
                  const outTime = record?.check_out_time ? formatTime(record.check_out_time) : '—';
                  
                  let statusDisplay = <span className="px-2 py-1 bg-gray-100 text-gray-500 text-xs rounded-full">Not Checked In</span>;
                  if (record) {
                    statusDisplay = getStatusBadge(record.status, record.check_out_time);
                  }
                  
                  let actionElement = null;
                  const isCheckedIn = record?.check_in_time && !record?.check_out_time;
                  
                  // Action Element Logic
                  if (record && record.early_checkout_requested) {
                      actionElement = (
                          <button
                              onClick={() => {
                                  setRequestToApprove(record);
                                  setIsApprovalModalOpen(true);
                              }}
                              className="flex items-center gap-1 px-3 py-1 text-xs font-medium bg-yellow-500 text-white rounded-lg hover:bg-yellow-600 transition"
                              title={`Review early checkout request from ${record.employee_name}`}
                          >
                              <Clock size={14} /> Review
                          </button>
                      );
                  } else if (isCheckedIn && record) {
                      // Currently Working: Allow transfer
                      actionElement = (
                          <button
                              onClick={() => openOutletChangeModal(record)} 
                              className="flex items-center gap-1 text-blue-600 hover:text-blue-800 transition-colors p-1 rounded-md"
                              title={`Change current outlet for ${employee.name}`}
                          >
                              <MapPin size={16} /> Change
                          </button>
                      );
                  } else if (record && record.id) {
                      // Completed, old, or statutory leave: Allow delete
                      actionElement = (
                        <button
                            onClick={() => openSingleDeleteModal(record)} 
                            className="text-red-600 hover:text-red-900 transition-colors p-1 rounded-md"
                            title={`Delete record for ${employee.name} on ${dateFilter}`}
                         >
                            <Trash2 size={16} />
                         </button>
                      );
                  }


                  return (
                    <tr key={employee.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center">
                           <div>
                              <div className="text-sm font-medium text-gray-900">{employee.name}</div>
                              <div className="text-xs text-gray-500 capitalize">{employee.role || 'Therapist'}</div>
                           </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{outletName}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700 font-medium">{inTime}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{outTime}</td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        {statusDisplay}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                        {actionElement}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* --- Clear ALL History Modal --- */}
      {isClearModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6 relative">
            <button 
              onClick={() => setIsClearModalOpen(false)} 
              className="absolute top-4 right-4 text-gray-400 hover:text-gray-600"
            >
              <X size={20} />
            </button>
            
            <div className="flex flex-col items-center text-center mb-6">
              <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center mb-4">
                <AlertTriangle className="text-red-600 h-6 w-6" />
              </div>
              <h2 className="text-xl font-bold text-gray-800">Clear All History?</h2>
              <p className="text-sm text-gray-500 mt-2">
                This will permanently delete ALL attendance records for all employees. This action cannot be undone.
              </p>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Admin Password</label>
                <input 
                  type="password" 
                  value={clearPassword}
                  onChange={(e) => setClearPassword(e.target.value)}
                  className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 outline-none"
                  placeholder="Enter password"
                />
                {clearError && <p className="text-xs text-red-600 mt-1">{clearError}</p>}
              </div>

              <div className="flex gap-3">
                <button 
                  onClick={() => setIsClearModalOpen(false)}
                  className="flex-1 py-2.5 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 font-medium"
                >
                  Cancel
                </button>
                <button 
                  onClick={handleClearHistory}
                  disabled={isClearing || !clearPassword}
                  className="flex-1 py-2.5 bg-red-600 text-white rounded-lg hover:bg-red-700 font-medium disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {isClearing ? <Loader2 className="animate-spin h-4 w-4"/> : 'Confirm Clear'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* --- Single Record Delete Modal --- */}
      {isSingleDeleteModalOpen && recordToDelete && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6 relative">
            <button 
              onClick={() => setIsSingleDeleteModalOpen(false)} 
              className="absolute top-4 right-4 text-gray-400 hover:text-gray-600"
            >
              <X size={20} />
            </button>
            
            <div className="flex flex-col items-center text-center mb-6">
              <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center mb-4">
                <AlertTriangle className="text-red-600 h-6 w-6" />
              </div>
              <h2 className="text-xl font-bold text-gray-800">Delete Attendance Record?</h2>
              <p className="text-sm text-gray-500 mt-2">
                You are about to permanently delete the attendance record for **{recordToDelete.employee_name}** on **{recordToDelete.date}**.
                {recordToDelete.check_out_time === null && <span className="font-semibold text-red-700 block mt-2">Deleting this record will also mark the employee as **Checked Out** and reset their active outlet.</span>}
              </p>
            </div>

            <div className="flex gap-3">
              <button 
                onClick={() => setIsSingleDeleteModalOpen(false)}
                className="flex-1 py-2.5 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 font-medium"
              >
                Cancel
              </button>
              <button 
                onClick={handleSingleRecordDelete}
                disabled={isSingleDeleting}
                className="flex-1 py-2.5 bg-red-600 text-white rounded-lg hover:bg-red-700 font-medium disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {isSingleDeleting ? <Loader2 className="animate-spin h-4 w-4"/> : 'Confirm Delete'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* --- Early Checkout Approval Modal --- */}
      {isApprovalModalOpen && requestToApprove && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
              <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6 relative">
                  <button 
                      onClick={() => setIsApprovalModalOpen(false)} 
                      className="absolute top-4 right-4 text-gray-400 hover:text-gray-600"
                  >
                      <X size={20} />
                  </button>
                  <h2 className="text-xl font-bold text-gray-800 mb-4 flex items-center gap-2">
                    <Clock className="text-yellow-500 h-6 w-6"/> Review Early Checkout Request
                  </h2>
                  <p className="text-sm text-gray-700 mb-6">
                      **{requestToApprove.employee_name}** is requesting to check out early. 
                      The request was submitted at **{formatTime(requestToApprove.early_checkout_request_time)}**.
                      <span className="font-semibold text-red-600 block mt-2">
                          Approving logs them out now. Denying keeps them checked in.
                      </span>
                  </p>

                  <div className="flex gap-3">
                      <button 
                          onClick={handleDenyEarlyCheckout}
                          disabled={isApproving}
                          className="flex-1 py-2.5 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 font-medium disabled:opacity-50"
                      >
                          {isApproving ? <Loader2 className="animate-spin h-4 w-4 mx-auto"/> : 'Deny Request'}
                      </button>

                      <button 
                          onClick={handleApproveEarlyCheckout}
                          disabled={isApproving}
                          className="flex-1 py-2.5 bg-green-600 text-white rounded-lg hover:bg-green-700 font-medium disabled:opacity-50 flex items-center justify-center gap-2"
                      >
                          {isApproving ? <Loader2 className="animate-spin h-4 w-4"/> : 'Approve Checkout'}
                      </button>
                  </div>
              </div>
          </div>
      )}
      
      {/* --- NEW: Change Outlet Modal --- */}
      {isOutletChangeModalOpen && recordToTransfer && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
              <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6 relative">
                  <button 
                      onClick={() => setIsOutletChangeModalOpen(false)} 
                      className="absolute top-4 right-4 text-gray-400 hover:text-gray-600"
                  >
                      <X size={20} />
                  </button>
                  
                  <h2 className="text-xl font-bold text-gray-800 mb-4 flex items-center gap-2">
                    <MapPin className="text-blue-500 h-6 w-6"/> Change Employee Outlet
                  </h2>
                  <p className="text-sm text-gray-700 mb-4">
                      Transferring **{recordToTransfer.employee_name}** from **{recordToTransfer.outlet_name}**. This update will immediately change where they appear in the client check-in dropdowns.
                  </p>

                  <div className="space-y-4">
                      <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">New Outlet *</label>
                          <select
                              value={newOutletId}
                              onChange={(e) => setNewOutletId(e.target.value)}
                              className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                              required
                          >
                              <option value="">Select a new outlet...</option>
                              {OUTLETS.map(o => (
                                  <option key={o.id} value={o.id}>{o.name}</option>
                              ))}
                          </select>
                      </div>
                      
                      <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">Admin Password</label>
                          <input 
                              type="password" 
                              value={transferPassword}
                              onChange={(e) => setTransferPassword(e.target.value)}
                              className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 outline-none"
                              placeholder="Enter password"
                          />
                          {transferError && <p className="text-xs text-red-600 mt-1">{transferError}</p>}
                      </div>
                      
                      <div className="flex gap-3 pt-2">
                          <button 
                              onClick={() => setIsOutletChangeModalOpen(false)}
                              className="flex-1 py-2.5 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 font-medium"
                          >
                              Cancel
                          </button>
                          <button 
                              onClick={handleOutletTransfer}
                              disabled={isTransferring || !newOutletId || !transferPassword}
                              className="flex-1 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium disabled:opacity-50 flex items-center justify-center gap-2"
                          >
                              {isTransferring ? <Loader2 className="animate-spin h-4 w-4"/> : 'Confirm Transfer'}
                          </button>
                      </div>
                  </div>
              </div>
          </div>
      )}
    </div>
  );
}