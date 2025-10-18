'use client';

import { useState, useEffect } from 'react';
import { OUTLETS } from '@/lib/outlet';

type Employee = {
  id: string;
  name: string;
  role: string;
  outlet: string;
};

type AttendanceRecord = {
  employeeId: string;
  date: string;
  status: 'present' | 'absent' | 'leave';
};

// Full list of employees (copied from Admin attendance page)
const ALL_EMPLOYEES: Employee[] = [
  // Indiranagar
  { id: '1', name: 'Aisha Khan', role: 'Therapist', outlet: 'Indiranagar' },
  { id: '2', name: 'Rajesh Mehta', role: 'Receptionist', outlet: 'Indiranagar' },
  { id: '3', name: 'Priya Nair', role: 'Manager', outlet: 'Indiranagar' },
  
  // Kaggadaspura
  { id: '4', name: 'Vikram Singh', role: 'Therapist', outlet: 'Kaggadaspura' },
  { id: '5', name: 'Meera Patel', role: 'Receptionist', outlet: 'Kaggadaspura' },
  
  // Kalyan Nagar
  { id: '6', name: 'Arjun Reddy', role: 'Therapist', outlet: 'Kalyan Nagar' },
  { id: '7', name: 'Sneha Gupta', role: 'Manager', outlet: 'Kalyan Nagar' },
  
  // Cunningham Road
  { id: '8', name: 'Karan Malhotra', role: 'Therapist', outlet: 'Cunningham Road' },
  { id: '9', name: 'Divya Sharma', role: 'Receptionist', outlet: 'Cunningham Road' },
  
  // HSR Layout
  { id: '10', name: 'Neha Joshi', role: 'Therapist', outlet: 'HSR Layout' },
  { id: '11', name: 'Rohan Desai', role: 'Manager', outlet: 'HSR Layout' },
  
  // Malleswaram
  { id: '12', name: 'Ananya Iyer', role: 'Therapist', outlet: 'Malleswaram' },
  { id: '13', name: 'Sanjay Rao', role: 'Receptionist', outlet: 'Malleswaram' },
  
  // Marathahalli
  { id: '14', name: 'Deepak Verma', role: 'Therapist', outlet: 'Marathahalli' },
  { id: '15', name: 'Kavita Menon', role: 'Manager', outlet: 'Marathahalli' }
];

export default function OutletAttendancePage() {
  const [outletName, setOutletName] = useState('Outlet');
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [attendance, setAttendance] = useState<AttendanceRecord[]>([]);
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    // Determine the current outlet and filter employees
    const outletId = document.cookie.split('; ').find(row => row.startsWith('outlet_id='))?.split('=')[1];
    let currentOutletName = 'Outlet';

    if (outletId) {
      const outlet = OUTLETS.find(o => o.id === outletId);
      if (outlet) {
        currentOutletName = outlet.name;
        setOutletName(currentOutletName);
        
        // Filter the master employee list to only show staff from this outlet
        const filtered = ALL_EMPLOYEES.filter(emp => emp.outlet === currentOutletName);
        setEmployees(filtered);
      }
    }

    // Load attendance from localStorage (in production, use API)
    const saved = localStorage.getItem('attendance');
    if (saved) {
      setAttendance(JSON.parse(saved));
    }
  }, []); // Run only once on mount

  // Save attendance to localStorage
  const saveAttendance = () => {
    setSaving(true);
    try {
      localStorage.setItem('attendance', JSON.stringify(attendance));
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch (error) {
      alert('Failed to save attendance');
    } finally {
      setSaving(false);
    }
  };

  const updateAttendance = (employeeId: string, status: 'present' | 'absent' | 'leave') => {
    setAttendance(prev => {
      const existingIndex = prev.findIndex(
        record => record.employeeId === employeeId && record.date === selectedDate
      );
      
      if (existingIndex >= 0) {
        const newAttendance = [...prev];
        newAttendance[existingIndex] = { ...newAttendance[existingIndex], status };
        return newAttendance;
      } else {
        return [...prev, { employeeId, date: selectedDate, status }];
      }
    });
  };

  const getAttendanceStatus = (employeeId: string): 'present' | 'absent' | 'leave' | null => {
    const record = attendance.find(
      r => r.employeeId === employeeId && r.date === selectedDate
    );
    return record ? record.status : null;
  };

  const getStats = () => {
    const todayRecords = attendance.filter(r => r.date === selectedDate);
    const outletEmployeeIds = employees.map(e => e.id);
    
    // Filter attendance records to only count current outlet's staff
    const filteredRecords = todayRecords.filter(r => outletEmployeeIds.includes(r.employeeId));

    const presentCount = filteredRecords.filter(r => r.status === 'present').length;
    const absentCount = filteredRecords.filter(r => r.status === 'absent').length;
    const leaveCount = filteredRecords.filter(r => r.status === 'leave').length;
    
    return { presentCount, absentCount, leaveCount, total: employees.length };
  };

  const stats = getStats();

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold text-gray-800">{outletName} - Staff Attendance</h1>
        <button
          onClick={saveAttendance}
          disabled={saving}
          className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
        >
          {saving ? 'Saving...' : '💾 Save Attendance'}
        </button>
      </div>

      {success && (
        <div className="p-4 bg-green-50 text-green-700 rounded-lg border border-green-200">
          ✅ Attendance saved successfully!
        </div>
      )}

      {/* Date Filter */}
      <div className="bg-white p-6 rounded-xl shadow max-w-sm">
        <label htmlFor="date" className="block text-sm font-medium text-gray-700 mb-1">
          Date
        </label>
        <input
          id="date"
          type="date"
          value={selectedDate}
          onChange={(e) => setSelectedDate(e.target.value)}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-gray-900"
        />
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white p-4 rounded-lg shadow">
          <h3 className="text-gray-500 text-sm">Total Staff</h3>
          <p className="text-2xl font-bold mt-1">{stats.total}</p>
        </div>
        <div className="bg-white p-4 rounded-lg shadow">
          <h3 className="text-gray-500 text-sm text-green-600">Present</h3>
          <p className="text-2xl font-bold mt-1 text-green-600">{stats.presentCount}</p>
        </div>
        <div className="bg-white p-4 rounded-lg shadow">
          <h3 className="text-gray-500 text-sm text-red-600">Absent</h3>
          <p className="text-2xl font-bold mt-1 text-red-600">{stats.absentCount}</p>
        </div>
        <div className="bg-white p-4 rounded-lg shadow">
          <h3 className="text-gray-500 text-sm text-yellow-600">On Leave</h3>
          <p className="text-2xl font-bold mt-1 text-yellow-600">{stats.leaveCount}</p>
        </div>
      </div>

      {/* Attendance Table */}
      <div className="bg-white shadow rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Employee</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Role</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {employees.length === 0 ? (
                <tr>
                  <td colSpan={3} className="px-6 py-4 text-center text-gray-500">
                    No staff information found for {outletName}.
                  </td>
                </tr>
              ) : (
                employees.map((employee) => {
                  const currentStatus = getAttendanceStatus(employee.id);
                  return (
                    <tr key={employee.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap font-medium text-gray-900">
                        {employee.name}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {employee.role}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex space-x-2">
                          <button
                            onClick={() => updateAttendance(employee.id, 'present')}
                            className={`px-3 py-1 text-xs rounded-full ${
                              currentStatus === 'present'
                                ? 'bg-green-100 text-green-800 border-2 border-green-600'
                                : 'bg-gray-100 text-gray-800 hover:bg-green-50'
                            }`}
                          >
                            Present
                          </button>
                          <button
                            onClick={() => updateAttendance(employee.id, 'absent')}
                            className={`px-3 py-1 text-xs rounded-full ${
                              currentStatus === 'absent'
                                ? 'bg-red-100 text-red-800 border-2 border-red-600'
                                : 'bg-gray-100 text-gray-800 hover:bg-red-50'
                            }`}
                          >
                            Absent
                          </button>
                          <button
                            onClick={() => updateAttendance(employee.id, 'leave')}
                            className={`px-3 py-1 text-xs rounded-full ${
                              currentStatus === 'leave'
                                ? 'bg-yellow-100 text-yellow-800 border-2 border-yellow-600'
                                : 'bg-gray-100 text-gray-800 hover:bg-yellow-50'
                            }`}
                          >
                            Leave
                          </button>
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

      <div className="p-4 bg-blue-50 rounded-lg border border-blue-200">
        <p className="text-blue-700">
          💡 Note: Attendance is saved to your browser's local storage for demo purposes.
        </p>
      </div>
    </div>
  );
}
