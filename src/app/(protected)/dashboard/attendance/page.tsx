'use client';

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { OUTLETS } from '@/lib/outlet';
import { Trash2, AlertTriangle, Loader2, X, Clock } from 'lucide-react'; // Added Clock icon

type Employee = {
  id: string;
  name: string;
  role: string;
};

// --- UPDATED TYPE ---
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
  // NEW FIELDS FOR REQUEST
  early_checkout_requested: boolean; // True if employee requested early checkout
  early_checkout_request_time: string | null; // Time of request
};

const getStatusBadge = (status: string, checkOutTime: string | null) => {
  if (status === 'leave') return <span className="px-2 py-1 bg-red-100 text-red-700 text-xs rounded-full">On Leave</span>;
  if (status === 'off') return <span className="px-2 py-1 bg-gray-200 text-gray-700 text-xs rounded-full">Weekly Off</span>;
  if (checkOutTime) return <span className="px-2 py-1 bg-blue-100 text-blue-700 text-xs rounded-full">Completed</span>;
  return <span className="px-2 py-1 bg-green-100 text-green-800 text-xs rounded-full animate-pulse">Working Now</span>;
};

const formatTime = (dateStr: string | null) => {
  if (!dateStr) return '—';
  // Use toLocaleTimeString for time formatting
  return new Date(dateStr).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
};

export default function AttendancePage() {
  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [dateFilter, setDateFilter] = useState(new Date().toISOString().split('T')[0]);
  const [outletFilter, setOutletFilter] = useState('all');

  // --- Clear ALL History State (Unchanged) ---
  const [isClearModalOpen, setIsClearModalOpen] = useState(false);
  const [clearPassword, setClearPassword] = useState('');
  const [clearError, setClearError] = useState('');
  const [isClearing, setIsClearing] = useState(false);
  
  // --- Single Record Clear State (Unchanged) ---
  const [isSingleDeleteModalOpen, setIsSingleDeleteModalOpen] = useState(false);
  const [recordToDelete, setRecordToDelete] = useState<AttendanceRecord | null>(null);
  const [isSingleDeleting, setIsSingleDeleting] = useState(false);
  
  // --- NEW: Early Checkout Approval State ---
  const [isApprovalModalOpen, setIsApprovalModalOpen] = useState(false);
  const [requestToApprove, setRequestToApprove] = useState<AttendanceRecord | null>(null);
  const [isApproving, setIsApproving] = useState(false);


  const fetchEmployees = useCallback(async () => {
    const { data } = await supabase.from('employees').select('id, name, role').eq('is_active', true).order('name');
    setEmployees(data || []);
  }, []);

  const fetchAttendance = useCallback(async () => {
    try {
      // NOTE: We now select the new early_checkout fields
      let query = supabase
        .from('attendance')
        .select(`*, 
                early_checkout_requested, 
                early_checkout_request_time`) // Ensure these fields are fetched
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

  // Initial Load & Real-time Auto Refresh (Unchanged)
  useEffect(() => {
    setLoading(true);
    fetchEmployees();
    fetchAttendance();
  }, [fetchEmployees, fetchAttendance]);

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


  // --- Handle Clear ALL History (Unchanged) ---
  const handleClearHistory = async () => {
    // ... (Your existing logic for clearing ALL records)
    setClearError('');
    
    if (clearPassword !== 'attend123') {
      setClearError('Incorrect password');
      return;
    }

    setIsClearing(true);
    try {
      const { error } = await supabase
        .from('attendance')
        .delete()
        .neq('id', '00000000-0000-0000-0000-000000000000');

      if (error) throw error;

      await supabase
        .from('employees')
        .update({ is_checked_in: false, current_attendance_id: null })
        .neq('id', '00000000-0000-0000-0000-000000000000');

      alert('Attendance history cleared successfully.');
      setIsClearModalOpen(false);
      setClearPassword('');
    } catch (err: any) {
      console.error('Clear error:', err);
      setClearError(err.message || 'Failed to clear history');
    } finally {
      setIsClearing(false);
    }
  };

  // --- Handle Single Record Deletion (Unchanged) ---
  const handleSingleRecordDelete = async () => {
    if (!recordToDelete) return;

    setIsSingleDeleting(true);
    
    try {
      // 1. Check if the deleted record is the employee's current check-in record
      const isCurrentRecord = records.some(r => 
        r.employee_id === recordToDelete.employee_id && 
        r.id === recordToDelete.id && 
        !r.check_out_time
      );

      // 2. Delete the specific attendance record
      const { error: deleteError } = await supabase
        .from('attendance')
        .delete()
        .eq('id', recordToDelete.id); // <-- Targets the single record by its ID

      if (deleteError) throw deleteError;

      // 3. If it was the current check-in record, reset the employee status
      if (isCurrentRecord) {
        await supabase
          .from('employees')
          .update({ is_checked_in: false, current_attendance_id: null })
          .eq('id', recordToDelete.employee_id);
      }

      alert(`Attendance record for ${recordToDelete.employee_name} on ${recordToDelete.date} deleted.`);
      
      // Close modal and clear state
      setRecordToDelete(null);
      setIsSingleDeleteModalOpen(false);
    } catch (err: any) {
      console.error('Single delete error:', err);
      alert(err.message || 'Failed to delete record.');
    } finally {
      setIsSingleDeleting(false);
    }
  };


  // --- NEW: Handle Approve Early Checkout ---
  const handleApproveEarlyCheckout = async () => {
      if (!requestToApprove || !requestToApprove.early_checkout_request_time) return;

      setIsApproving(true);

      try {
          // Use the time the request was made as the check out time to accurately record shift duration
          const checkOutTime = requestToApprove.early_checkout_request_time; 
          
          // 1. Update the Attendance record: Set check_out_time and remove the request flag
          const { error: recordError } = await supabase
              .from('attendance')
              .update({
                  check_out_time: checkOutTime, // Use request time
                  early_checkout_requested: false,
                  status: 'Completed' 
              })
              .eq('id', requestToApprove.id);

          if (recordError) throw recordError;

          // 2. Reset the employee's check-in status
          const { error: employeeError } = await supabase
              .from('employees')
              .update({ is_checked_in: false, current_attendance_id: null })
              .eq('id', requestToApprove.employee_id);

          if (employeeError) throw employeeError;

          alert(`Early checkout for ${requestToApprove.employee_name} approved and recorded.`);
          setRequestToApprove(null);
          setIsApprovalModalOpen(false);
      } catch (err: any) {
          console.error('Approval Error:', err);
          alert(`Failed to approve: ${err.message}`);
      } finally {
          setIsApproving(false);
      }
  };


  const combinedData = employees.map(emp => {
    const record = records.find(r => r.employee_id === emp.id);
    return {
      employee: emp,
      record: record || null
    };
  });

  const filteredData = outletFilter === 'all' 
    ? combinedData 
    : combinedData.filter(item => item.record?.outlet_id === outletFilter);

  // --- Function to open single delete modal (Unchanged) ---
  const openSingleDeleteModal = (record: AttendanceRecord) => {
    setRecordToDelete(record);
    setIsSingleDeleteModalOpen(true);
  };


  return (
    <div className="space-y-6">
      {/* ... (Header and Filters remain the same) */}
      <div className="flex flex-col md:flex-row justify-between items-end md:items-center gap-4">
        <h1 className="text-2xl font-bold text-gray-800">Staff Attendance</h1>
        
        <div className="flex gap-4 items-center">
          {/* Clear History Button (Optional, can be removed if not needed) */}
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
                <tr><td colSpan={6} className="p-6 text-center text-gray-500">Loading...</td></tr>
              ) : filteredData.length === 0 ? (
                <tr><td colSpan={6} className="p-6 text-center text-gray-500">No records found.</td></tr>
              ) : (
                filteredData.map(({ employee, record }) => {
                  const outletName = record?.outlet_name || '—';
                  const inTime = record?.check_in_time ? formatTime(record.check_in_time) : '—';
                  const outTime = record?.check_out_time ? formatTime(record.check_out_time) : '—';
                  
                  let statusDisplay = <span className="px-2 py-1 bg-gray-100 text-gray-500 text-xs rounded-full">Not Checked In</span>;
                  if (record) {
                    statusDisplay = getStatusBadge(record.status, record.check_out_time);
                  }
                  
                  // --- NEW: Action Element Logic ---
                  let actionElement = null;
                  
                  if (record && record.early_checkout_requested) {
                      actionElement = (
                          <button
                              onClick={() => {
                                  setRequestToApprove(record);
                                  setIsApprovalModalOpen(true);
                              }}
                              className="flex items-center gap-1 px-3 py-1 text-xs font-medium bg-yellow-500 text-white rounded-lg hover:bg-yellow-600 transition"
                              title={`Approve early checkout request from ${record.employee_name}`}
                          >
                              <Clock size={14} /> Review Request
                          </button>
                      );
                  } else if (record && record.check_in_time && !record.check_out_time) {
                      // Working but no request
                      actionElement = <span className="text-xs text-gray-500">Awaiting Checkout</span>;
                  } else if (record && record.id) {
                      // Completed or old record, show delete button
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
                        {/* Employee Name */}
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

      {/* --- Clear ALL History Modal (Retained) --- */}
      {isClearModalOpen && (
        // ... (Your existing clear all modal component)
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

      {/* --- Single Record Delete Modal (Retained) --- */}
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
                {recordToDelete.check_out_time === null && <span className="font-semibold text-red-700 block mt-2">Deleting this record will also mark the employee as **Checked Out**.</span>}
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

      {/* --- NEW: Early Checkout Approval Modal --- */}
      {isApprovalModalOpen && requestToApprove && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
              <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6 relative">
                  <h2 className="text-xl font-bold text-gray-800 mb-4 flex items-center gap-2">
                    <Clock className="text-yellow-500 h-6 w-6"/> Approve Early Checkout
                  </h2>
                  <p className="text-sm text-gray-700 mb-6">
                      **{requestToApprove.employee_name}** is requesting to check out early. 
                      The request was submitted at **{formatTime(requestToApprove.early_checkout_request_time)}**.
                      <span className="font-semibold text-red-600 block mt-2">Approving this will set their official checkout time to the time of request.</span>
                  </p>

                  <div className="flex gap-3">
                      <button 
                          onClick={() => {
                              setRequestToApprove(null);
                              setIsApprovalModalOpen(false);
                          }}
                          className="flex-1 py-2.5 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 font-medium"
                      >
                          Deny / Close
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

    </div>
  );
}