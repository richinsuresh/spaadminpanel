'use client';

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { OUTLETS } from '@/lib/outlet';
import { Trash2, AlertTriangle, Loader2, X } from 'lucide-react';

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
  outlet_id: string; // <-- ADDED THIS MISSING FIELD
  check_in_time: string | null;
  check_out_time: string | null;
  status: string; 
};

const getStatusBadge = (status: string, checkOutTime: string | null) => {
  if (status === 'leave') return <span className="px-2 py-1 bg-red-100 text-red-700 text-xs rounded-full">On Leave</span>;
  if (status === 'off') return <span className="px-2 py-1 bg-gray-200 text-gray-700 text-xs rounded-full">Weekly Off</span>;
  if (checkOutTime) return <span className="px-2 py-1 bg-blue-100 text-blue-700 text-xs rounded-full">Completed</span>;
  return <span className="px-2 py-1 bg-green-100 text-green-800 text-xs rounded-full animate-pulse">Working Now</span>;
};

const formatTime = (dateStr: string | null) => {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
};

export default function AttendancePage() {
  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [dateFilter, setDateFilter] = useState(new Date().toISOString().split('T')[0]);
  const [outletFilter, setOutletFilter] = useState('all');

  // --- Clear History State ---
  const [isClearModalOpen, setIsClearModalOpen] = useState(false);
  const [clearPassword, setClearPassword] = useState('');
  const [clearError, setClearError] = useState('');
  const [isClearing, setIsClearing] = useState(false);

  const fetchEmployees = useCallback(async () => {
    const { data } = await supabase.from('employees').select('id, name, role').eq('is_active', true).order('name');
    setEmployees(data || []);
  }, []);

  const fetchAttendance = useCallback(async () => {
    // Don't set loading to true here to avoid flashing on auto-refresh
    try {
      let query = supabase
        .from('attendance')
        .select('*')
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

  // Initial Load
  useEffect(() => {
    setLoading(true);
    fetchEmployees();
    fetchAttendance();
  }, [fetchEmployees, fetchAttendance]);

  // --- Real-time Auto Refresh ---
  useEffect(() => {
    const channel = supabase
      .channel('admin-attendance-realtime')
      // Listen for new check-ins/outs
      .on('postgres_changes', { event: '*', schema: 'public', table: 'attendance' }, () => {
        console.log('Attendance update detected, refreshing...');
        fetchAttendance();
      })
      // Listen for new employees
      .on('postgres_changes', { event: '*', schema: 'public', table: 'employees' }, () => {
        console.log('Employee update detected, refreshing...');
        fetchEmployees();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchAttendance, fetchEmployees]);


  // --- Handle Clear History ---
  const handleClearHistory = async () => {
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
      // fetchAttendance() will be called automatically by the realtime listener
    } catch (err: any) {
      console.error('Clear error:', err);
      setClearError(err.message || 'Failed to clear history');
    } finally {
      setIsClearing(false);
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

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row justify-between items-end md:items-center gap-4">
        <h1 className="text-2xl font-bold text-gray-800">Staff Attendance</h1>
        
        <div className="flex gap-4 items-center">
          {/* Clear History Button */}
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
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {loading ? (
                <tr><td colSpan={5} className="p-6 text-center text-gray-500">Loading...</td></tr>
              ) : filteredData.length === 0 ? (
                <tr><td colSpan={5} className="p-6 text-center text-gray-500">No records found.</td></tr>
              ) : (
                filteredData.map(({ employee, record }) => {
                  const outletName = record?.outlet_name || '—';
                  const inTime = record?.check_in_time ? formatTime(record.check_in_time) : '—';
                  const outTime = record?.check_out_time ? formatTime(record.check_out_time) : '—';
                  
                  let statusDisplay = <span className="px-2 py-1 bg-gray-100 text-gray-500 text-xs rounded-full">Not Checked In</span>;
                  if (record) {
                    statusDisplay = getStatusBadge(record.status, record.check_out_time);
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
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* --- Clear History Modal --- */}
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

    </div>
  );
}