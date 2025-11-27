'use client';

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { OUTLETS } from '@/lib/outlet';
import { Loader2, MapPin, User, LogIn, LogOut, CalendarX, Coffee, Clock, ChevronRight } from 'lucide-react';

type Employee = {
  id: string;
  name: string;
  outlet_id: string;
  is_checked_in: boolean;
  current_attendance_id: string | null;
};

// Added fields to track the status of the current attendance record
type CurrentAttendanceRecord = {
    id: string;
    check_out_time: string | null;
    early_checkout_requested: boolean;
    early_checkout_request_time: string | null;
} | null;


export default function EmployeeCheckInPage() {
  const [loading, setLoading] = useState(false);
  const [selectedOutlet, setSelectedOutlet] = useState('');
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [selectedEmpId, setSelectedEmpId] = useState('');
  const [statusMsg, setStatusMsg] = useState<{ type: 'success' | 'error', text: string } | null>(null);
  const [currentTime, setCurrentTime] = useState(new Date());
  
  // --- NEW STATE: Tracks the current attendance record details ---
  const [currentAttendanceRecord, setCurrentAttendanceRecord] = useState<CurrentAttendanceRecord>(null);


  // --- Helper to determine if it's after 7:30 PM IST (19:30) ---
  const isAfterCutoffTime = (date: Date) => {
      const cutoffHour = 19; // 7 PM
      const cutoffMinute = 30; // 30 minutes

      // Create a date object for 19:30 today
      const cutoffTime = new Date(date);
      cutoffTime.setHours(cutoffHour, cutoffMinute, 0, 0);

      return date.getTime() >= cutoffTime.getTime();
  };

  
  // --- Initialization and Real-time Time Update ---
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);

    const fetchStaff = async () => {
      try {
        const { data } = await supabase
          .from('employees')
          .select('id, name, outlet_id, is_checked_in, current_attendance_id')
          .eq('is_active', true)
          .order('name');
        setEmployees(data || []);
      } catch (e) {
        console.error('Failed to fetch employees', e);
      }
    };
    fetchStaff();

    return () => clearInterval(timer);
  }, []);
  
  const selectedEmployee = employees.find(e => e.id === selectedEmpId);

  // --- NEW useEffect: Fetch the current attendance record for status check ---
  useEffect(() => {
      if (selectedEmployee && selectedEmployee.is_checked_in && selectedEmployee.current_attendance_id) {
          const fetchCurrentRecord = async () => {
              const { data } = await supabase
                  .from('attendance')
                  .select(`id, check_out_time, early_checkout_requested, early_checkout_request_time`)
                  .eq('id', selectedEmployee.current_attendance_id)
                  .single();
              setCurrentAttendanceRecord(data as CurrentAttendanceRecord);
          };
          fetchCurrentRecord();
      } else {
          setCurrentAttendanceRecord(null);
      }
  }, [selectedEmployee]); // Reruns when the selected employee changes


  const handleCheckIn = async () => {
    if (!selectedEmployee) {
      setStatusMsg({ type: 'error', text: 'Please select your name.' });
      return;
    }
    if (!selectedOutlet) {
      setStatusMsg({ type: 'error', text: 'Please select your outlet.' });
      return;
    }

    setLoading(true);
    setStatusMsg(null);

    const outletObj = OUTLETS.find(o => o.id === selectedOutlet);
    const checkInTime = new Date().toISOString();

    try {
      const { data: attData, error: attError } = await supabase
        .from('attendance')
        .insert({
          employee_id: selectedEmployee.id,
          employee_name: selectedEmployee.name,
          outlet_id: selectedOutlet,
          outlet_name: outletObj?.name,
          check_in_time: checkInTime,
          status: 'checked_in',
          // Set new fields to default false/null
          early_checkout_requested: false, 
          early_checkout_request_time: null
        })
        .select('id')
        .single();

      if (attError) throw attError;

      const { error: empError } = await supabase
        .from('employees')
        .update({ is_checked_in: true, current_attendance_id: attData.id })
        .eq('id', selectedEmployee.id);

      if (empError) throw empError;

      setStatusMsg({ type: 'success', text: `✅ Welcome, ${selectedEmployee.name}! Logged in at ${outletObj?.name} — ${new Date(checkInTime).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}.` });

      setEmployees(prev => prev.map(e =>
        e.id === selectedEmployee.id
          ? { ...e, is_checked_in: true, current_attendance_id: attData.id }
          : e
      ));
      
      // Update the current record state immediately
      setCurrentAttendanceRecord({ 
          id: attData.id, 
          check_out_time: null, 
          early_checkout_requested: false, 
          early_checkout_request_time: null 
      });

    } catch (err: any) {
      setStatusMsg({ type: 'error', text: err?.message || 'Check-in failed' });
    } finally {
      setLoading(false);
    }
  };

  // --- RENAMED: Performs the final, approved checkout ---
  const performFinalCheckOut = async () => {
      if (!selectedEmployee || !selectedEmployee.current_attendance_id) {
          setStatusMsg({ type: 'error', text: 'No active check-in found to log out from.' });
          return false;
      }

      setLoading(true);
      setStatusMsg(null);

      const checkOutTime = new Date().toISOString();

      try {
          const { error: attError } = await supabase
              .from('attendance')
              .update({
                  check_out_time: checkOutTime,
                  status: 'completed',
                  early_checkout_requested: false, // Ensure request status is false on completion
              })
              .eq('id', selectedEmployee.current_attendance_id);

          if (attError) throw attError;

          const { error: empError } = await supabase
              .from('employees')
              .update({ is_checked_in: false, current_attendance_id: null })
              .eq('id', selectedEmployee.id);

          if (empError) throw empError;

          setStatusMsg({ type: 'success', text: `👋 Goodbye, ${selectedEmployee.name}! Logged out at ${new Date(checkOutTime).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}.` });

          setEmployees(prev => prev.map(e =>
              e.id === selectedEmployee.id
                  ? { ...e, is_checked_in: false, current_attendance_id: null }
                  : e
          ));
          setCurrentAttendanceRecord(null);
          return true;
      } catch (err: any) {
          setStatusMsg({ type: 'error', text: err?.message || 'Check-out failed' });
          return false;
      } finally {
          setLoading(false);
      }
  };

  // --- NEW: Function to submit an early request ---
  const submitEarlyCheckoutRequest = async () => {
      if (!selectedEmployee || !selectedEmployee.current_attendance_id) return;
      
      setLoading(true);
      setStatusMsg(null);

      try {
          const requestTime = new Date().toISOString();
          
          const { error } = await supabase
              .from('attendance')
              .update({
                  early_checkout_requested: true,
                  early_checkout_request_time: requestTime,
                  status: 'request_pending' // Helps admin see pending status
              })
              .eq('id', selectedEmployee.current_attendance_id);

          if (error) throw error;
          
          // Manually update the local record state
          setCurrentAttendanceRecord(prev => prev ? {...prev, early_checkout_requested: true, early_checkout_request_time: requestTime} : null);
          setStatusMsg({ type: 'success', text: `⏳ Early checkout requested at ${new Date(requestTime).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}. Waiting for Admin approval.` });

      } catch (err: any) {
          setStatusMsg({ type: 'error', text: err?.message || 'Request failed.' });
      } finally {
          setLoading(false);
      }
  };


  // --- NEW: Main handler for Log Out button click (checks time) ---
  const handleAttemptCheckOut = () => {
      if (!selectedEmployee) {
          setStatusMsg({ type: 'error', text: 'Please select your name.' });
          return;
      }

      const now = new Date();
      
      // 1. If it's after 7:30 PM, allow normal checkout
      if (isAfterCutoffTime(now)) {
          performFinalCheckOut();
          return;
      }

      // 2. If it's before 7:30 PM, prompt for request
      if (confirm(`The required minimum shift time is until 7:30 PM. Would you like to submit a request for an early log out?`)) {
          submitEarlyCheckoutRequest();
      } else {
          setStatusMsg({ type: 'error', text: 'Checkout cancelled. Please log out after 7:30 PM, or submit a request.' });
      }
  };


  const handleMarkStatus = async (status: 'leave' | 'off') => {
    if (!selectedEmployee) {
      setStatusMsg({ type: 'error', text: 'Please select your name.' });
      return;
    }
    if (!confirm(`Are you sure you want to mark today as ${status === 'leave' ? 'LEAVE' : 'WEEKLY OFF'}?`)) return;

    setLoading(true);
    setStatusMsg(null);

    try {
      const { error } = await supabase
        .from('attendance')
        .insert({
          employee_id: selectedEmployee.id,
          employee_name: selectedEmployee.name,
          outlet_id: null,
          outlet_name: status === 'leave' ? 'On Leave' : 'Weekly Off',
          check_in_time: null,
          check_out_time: null,
          status: status
        });

      if (error) throw error;

      setStatusMsg({ type: 'success', text: `✅ Marked as ${status === 'leave' ? 'Leave' : 'Weekly Off'}` });
    } catch (err: any) {
      setStatusMsg({ type: 'error', text: err?.message || 'Failed to mark status' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col md:flex-row">
      {/* Left Panel */}
      <div className="hidden md:flex w-1/2 bg-gradient-to-br from-blue-600 to-purple-700 text-white flex-col justify-between p-12 relative overflow-hidden">
        <div className="z-10">
          <h1 className="text-4xl font-bold tracking-tight">Staff Portal</h1>
          <p className="text-blue-100 mt-2">Manage your daily attendance.</p>
        </div>

        <div className="absolute -top-20 -right-20 w-96 h-96 bg-white/10 rounded-full blur-3xl"></div>
        <div className="absolute top-1/2 -left-20 w-72 h-72 bg-purple-500/20 rounded-full blur-3xl"></div>

        <div className="z-10 backdrop-blur-sm bg-white/10 p-6 rounded-2xl border border-white/20">
          <p className="text-blue-100 text-sm uppercase tracking-widest mb-1">Current Time</p>
          <div className="text-5xl font-mono font-bold">
            {currentTime.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
          </div>
          <p className="text-xl mt-1 opacity-90">
            {currentTime.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' })}
          </p>
        </div>
      </div>

      {/* Right Panel */}
      <div className="w-full md:w-1/2 flex flex-col justify-center p-6 md:p-12 bg-gray-50">
        <div className="max-w-md mx-auto w-full space-y-8">
          <div className="text-center md:text-left">
            <h2 className="text-3xl font-bold text-gray-900">Log In / Log Out</h2>
            <p className="text-gray-500 mt-2">Select your name to begin.</p>
          </div>

          {statusMsg && (
            <div className={`p-4 rounded-xl flex items-center gap-3 ${statusMsg.type === 'success' ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-700 border border-red-200'}`}>
              <div className={`w-2 h-2 rounded-full ${statusMsg.type === 'success' ? 'bg-green-500' : 'bg-red-500'}`}></div>
              <p className="text-sm font-medium">{statusMsg.text}</p>
            </div>
          )}

          <div className="space-y-5">
            {/* Name Select */}
            <div className="space-y-2">
              <label className="text-sm font-semibold text-gray-700">Who are you?</label>
              <div className="relative">
                <select
                  value={selectedEmpId}
                  onChange={(e) => setSelectedEmpId(e.target.value)}
                  className="w-full p-4 pl-12 bg-white border-gray-200 rounded-xl text-gray-900 font-medium shadow-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all appearance-none"
                >
                  <option value="">Select your name...</option>
                  {employees.map(e => (
                    <option key={e.id} value={e.id}>
                      {e.name} {e.is_checked_in ? '(Logged In)' : ''}
                    </option>
                  ))}
                </select>
                <User className="absolute left-4 top-4 text-gray-400 h-5 w-5 pointer-events-none" />
                <div className="absolute right-4 top-4 pointer-events-none">
                  <ChevronRight className="text-gray-400 h-5 w-5 rotate-90" />
                </div>
              </div>
            </div>

            {/* Outlet Select (only when logging in) */}
            {selectedEmployee && !selectedEmployee.is_checked_in && (
              <div className="space-y-2 animate-in fade-in slide-in-from-top-4 duration-300">
                <label className="block text-sm font-semibold text-gray-700">Where are you today?</label>
                <div className="relative">
                  <select
                    value={selectedOutlet}
                    onChange={(e) => setSelectedOutlet(e.target.value)}
                    className="w-full p-4 pl-12 bg-white border-gray-200 rounded-xl text-gray-900 font-medium shadow-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all appearance-none"
                  >
                    <option value="">Select location...</option>
                    {OUTLETS.map(o => (
                      <option key={o.id} value={o.id}>{o.name}</option>
                    ))}
                  </select>
                  <MapPin className="absolute left-4 top-4 text-gray-400 h-5 w-5 pointer-events-none" />
                </div>
              </div>
            )}

            {/* Display current action time (read-only) */}
            {selectedEmployee && (
              <div className="space-y-2 animate-in fade-in slide-in-from-top-4 duration-300">
                <label className="block text-sm font-semibold text-gray-700">
                  {selectedEmployee.is_checked_in ? 'Time of Departure' : 'Time of Arrival'}
                </label>
                <div className="relative">
                  <div className="w-full p-4 pl-12 bg-white border border-gray-200 rounded-xl text-gray-900 font-medium shadow-sm">
                    <Clock className="absolute left-4 top-4 text-gray-400 h-5 w-5 pointer-events-none" />
                    <div className="ml-8">{currentTime.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })} — {currentTime.toLocaleDateString('en-IN')}</div>
                  </div>
                </div>
              </div>
            )}

            {/* Actions */}
            {selectedEmployee && (
              <div className="pt-4 space-y-3 animate-in fade-in slide-in-from-bottom-4 duration-500">
                {selectedEmployee.is_checked_in ? (
                    // --- LOGOUT ACTIONS (UPDATED) ---
                    <>
                        {/* 1. Show PENDING status if request is active */}
                        {currentAttendanceRecord?.early_checkout_requested ? (
                            <button
                                disabled
                                className="w-full py-4 bg-yellow-500 text-white rounded-xl font-bold text-lg shadow-lg shadow-yellow-200 flex items-center justify-center gap-2 disabled:opacity-80 disabled:cursor-wait"
                            >
                                <Loader2 className="animate-spin" /> Early Checkout Request Pending...
                            </button>
                        ) : (
                            // 2. Default Log Out button, which uses the time check logic
                            <button
                                onClick={handleAttemptCheckOut} // <--- NEW ENTRY POINT
                                disabled={loading}
                                className="w-full py-4 bg-red-600 hover:bg-red-700 text-white rounded-xl font-bold text-lg shadow-lg shadow-red-200 transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                {loading ? <Loader2 className="animate-spin" /> : <><LogOut size={20} /> Log Out</>}
                            </button>
                        )}
                    </>
                ) : (
                  // --- LOGIN ACTIONS (UNCHANGED) ---
                  <div className="space-y-3">
                    <button
                      onClick={handleCheckIn}
                      disabled={loading || !selectedOutlet}
                      className="w-full py-4 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold text-lg shadow-lg shadow-blue-200 transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {loading ? <Loader2 className="animate-spin" /> : <><LogIn size={20} /> Log In Now</>}
                    </button>

                    <div className="grid grid-cols-2 gap-3">
                      <button
                        onClick={() => handleMarkStatus('leave')}
                        disabled={loading}
                        className="py-3 bg-white border border-gray-200 hover:bg-gray-50 text-gray-700 rounded-xl font-semibold flex items-center justify-center gap-2 transition-all"
                      >
                        <CalendarX size={18} className="text-orange-500" /> Mark Leave
                      </button>
                      <button
                        onClick={() => handleMarkStatus('off')}
                        disabled={loading}
                        className="py-3 bg-white border border-gray-200 hover:bg-gray-50 text-gray-700 rounded-xl font-semibold flex items-center justify-center gap-2 transition-all"
                      >
                        <Coffee size={18} className="text-gray-500" /> Weekly Off
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}