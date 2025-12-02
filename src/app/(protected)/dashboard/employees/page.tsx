'use client';

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { OUTLETS } from '@/lib/outlet';
import { 
  Loader2, UserPlus, Phone, Briefcase, Search, 
  MapPin, Calendar, TrendingUp, User, Filter, X, Edit3, Trash2
} from 'lucide-react';

// --- Types ---
type Employee = {
  id: string;
  name: string;
  mobile?: string | null;
  role: 'therapist' | 'manager' | 'housekeeping';
  outlet_name: string; // The employee's designated HOME outlet
  outlet_id: string; // The employee's designated HOME outlet ID
  is_active?: boolean;
  // NEW FIELD: Used to store the active outlet from the attendance page
  current_outlet_name?: string | null; 
};

type StatRow = {
  id: string;
  date: string;
  name: string;
  treatment: string;
  amount: number;
  type: 'Service' | 'Package Sold';
};

const formatCurrency = (val: number) =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', minimumFractionDigits: 0 }).format(val / 100);

// --- Page Component ---
export default function EmployeesPage() {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [filteredEmployees, setFilteredEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);

  // Selection & Filters
  const [selectedEmployee, setSelectedEmployee] = useState<Employee | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [outletFilter, setOutletFilter] = useState('all');

  // Stats State
  const [startDate, setStartDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [endDate, setEndDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [statsLoading, setStatsLoading] = useState(false);
  const [history, setHistory] = useState<StatRow[]>([]);
  const [totalRevenue, setTotalRevenue] = useState(0);

  // Live Metrics
  const [todaySalesMap, setTodaySalesMap] = useState<Record<string, number>>({});

  // Add Modal
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [newEmpName, setNewEmpName] = useState('');
  const [newEmpMobile, setNewEmpMobile] = useState('');
  const [newEmpRole, setNewEmpRole] = useState<Employee['role']>('therapist');
  const [newEmpOutlet, setNewEmpOutlet] = useState(OUTLETS[0]?.id ?? '');
  const [isAdding, setIsAdding] = useState(false);

  // Edit Modal
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editName, setEditName] = useState('');
  const [editMobile, setEditMobile] = useState('');
  const [editRole, setEditRole] = useState<Employee['role']>('therapist');
  const [editOutlet, setEditOutlet] = useState('');
  const [isSavingEdit, setIsSavingEdit] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);

  // --- Fetch initial data ---
  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      // Fetch the new current_outlet_name column
      const { data: empData } = await supabase
        .from('employees')
        .select('*, current_outlet_name') // Include the new column
        .eq('is_active', true)
        .order('name', { ascending: true });

      const emps = (empData || []) as Employee[];

      setEmployees(emps);

      let filtered = emps;
      if (outletFilter !== 'all') filtered = filtered.filter(e => e.outlet_id === outletFilter);
      if (searchTerm) {
        const t = searchTerm.toLowerCase();
        filtered = filtered.filter(e =>
          e.name.toLowerCase().includes(t) || (e.mobile || '').includes(t)
        );
      }

      setFilteredEmployees(filtered);

      setSelectedEmployee(prev => {
        if (!prev) return filtered[0] ?? null;
        const found = emps.find(e => e.id === prev.id) ?? null;
        if (!found) return filtered[0] ?? null;

        return prev.name === found.name &&
          prev.mobile === found.mobile &&
          prev.role === found.role &&
          prev.outlet_id === found.outlet_id &&
          prev.current_outlet_name === found.current_outlet_name // Include new field check
          ? prev
          : found;
      });

      const today = new Date().toISOString().split('T')[0];
      const { data: salesData } = await supabase
        .from('customers')
        .select('amount_paid, package_amount, took_package, therapist_name, package_sold_by')
        .eq('date', today);

      const map: Record<string, number> = {};
      (salesData || []).forEach(s => {
        const amt = s.took_package ? s.package_amount || 0 : s.amount_paid || 0;
        if (s.took_package && s.package_sold_by)
          map[s.package_sold_by] = (map[s.package_sold_by] || 0) + amt;
        if (!s.took_package && s.therapist_name)
          map[s.therapist_name] = (map[s.therapist_name] || 0) + amt;
      });

      setTodaySalesMap(map);
    } finally {
      setLoading(false);
    }
  }, [outletFilter, searchTerm]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);
  
  // --- Real-time Subscription ---
  useEffect(() => {
    const channel = supabase
      .channel('employees-page-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'employees' }, () => {
        // Refresh data whenever the employee table changes (including current_outlet_name)
        fetchData(); 
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchData]);


  // --- Filtering UI reaction ---
  useEffect(() => {
    let r = employees;
    if (outletFilter !== 'all') r = r.filter(e => e.outlet_id === outletFilter);
    if (searchTerm) {
      const t = searchTerm.toLowerCase();
      r = r.filter(e => e.name.toLowerCase().includes(t) || (e.mobile || '').includes(t));
    }
    setFilteredEmployees(r);
    setSelectedEmployee(prev => {
      if (!prev) return r[0] ?? null;
      return r.find(e => e.id === prev.id) ? prev : (r[0] ?? null);
    });
  }, [searchTerm, outletFilter, employees]);

  // --- Fetch history ---
  useEffect(() => {
    if (!selectedEmployee) {
      setHistory([]);
      setTotalRevenue(0);
      return;
    }

    const fetchHistory = async () => {
      setStatsLoading(true);
      try {
        const { data } = await supabase
          .from('customers')
          .select('*')
          .gte('date', startDate)
          .lte('date', endDate)
          .or(
            `therapist_name.eq.${selectedEmployee.name},package_sold_by.eq.${selectedEmployee.name}`
          );

        const rows: StatRow[] = [];
        let total = 0;

        (data || []).forEach((row: any) => {
          if (row.therapist_name === selectedEmployee.name) {
            if (row.took_package) {
              rows.push({
                id: row.id + '_svc_pkg',
                date: row.date,
                name: row.name,
                treatment: `(Pkg Start) ${row.treatment}`,
                amount: 0,
                type: 'Service',
              });
            } else {
              rows.push({
                id: row.id + '_svc',
                date: row.date,
                name: row.name,
                treatment: row.treatment,
                amount: row.amount_paid || 0,
                type: 'Service',
              });
              total += row.amount_paid || 0;
            }
          }

          if (row.package_sold_by === selectedEmployee.name && row.took_package) {
            rows.push({
              id: row.id + '_pkg',
              date: row.date,
              name: row.name,
              treatment: 'New Package Sales',
              amount: row.package_amount || 0,
              type: 'Package Sold',
            });
            total += row.package_amount || 0;
          }
        });

        rows.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
        setHistory(rows);
        setTotalRevenue(total);
      } finally {
        setStatsLoading(false);
      }
    };

    fetchHistory();
  }, [selectedEmployee, startDate, endDate]);

  // --- Add Employee ---
  const handleAddEmployee = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newEmpName.trim()) return alert('Enter a name');

    setIsAdding(true);
    try {
      const outletObj = OUTLETS.find(o => o.id === newEmpOutlet);

      await supabase.from('employees').insert({
        name: newEmpName.trim(),
        mobile: newEmpMobile.trim() || null,
        role: newEmpRole,
        outlet_id: newEmpOutlet,
        outlet_name: outletObj?.name || 'Unknown',
        is_active: true,
        // Initialize current_outlet_name to null on creation
        current_outlet_name: null, 
      });

      await fetchData();
      setIsAddModalOpen(false);

      setNewEmpName('');
      setNewEmpMobile('');
      setNewEmpRole('therapist');
      setNewEmpOutlet(OUTLETS[0]?.id ?? '');
    } finally {
      setIsAdding(false);
    }
  };

  // --- Edit Modal Setup ---
  const openEditModalFor = (emp: Employee) => {
    setSelectedEmployee(emp);
    setEditName(emp.name);
    setEditMobile(emp.mobile || '');
    setEditRole(emp.role);
    setEditOutlet(emp.outlet_id);
    setIsEditModalOpen(true);
  };
  // --- Save edits ---
  const saveEdit = async () => {
    if (!selectedEmployee) return;
    if (!editName.trim()) return alert('Name cannot be empty');
    setIsSavingEdit(true);

    const oldName = selectedEmployee.name;
    const newName = editName.trim();

    try {
      const outletObj = OUTLETS.find(o => o.id === editOutlet);
      const { error: updErr } = await supabase
        .from('employees')
        .update({
          name: newName,
          mobile: editMobile.trim() || null,
          role: editRole,
          outlet_id: editOutlet,
          outlet_name: outletObj?.name || editOutlet,
          // NOTE: We do NOT update current_outlet_name here, as that is managed by AttendancePage
        })
        .eq('id', selectedEmployee.id);

      if (updErr) throw updErr;

      // Update name references in customers table if name changed
      if (oldName !== newName) {
        const { error: c1 } = await supabase
          .from('customers')
          .update({ therapist_name: newName })
          .eq('therapist_name', oldName);
        if (c1) throw c1;

        const { error: c2 } = await supabase
          .from('customers')
          .update({ package_sold_by: newName })
          .eq('package_sold_by', oldName);
        if (c2) throw c2;
      }

      await fetchData();
      const refreshed = (await supabase.from('employees').select('*, current_outlet_name').eq('id', selectedEmployee.id)).data?.[0] ?? null;
      setSelectedEmployee(refreshed);
      setIsEditModalOpen(false);
    } catch (err: any) {
      console.error('saveEdit error', err);
      alert(err.message || 'Failed to save changes');
    } finally {
      setIsSavingEdit(false);
    }
  };

  // --- Delete employee ---
  const deleteEmployee = async () => {
    if (!selectedEmployee) return;
    setIsDeleting(true);
    try {
      const { error: delErr } = await supabase
        .from('employees')
        .update({ 
            is_active: false,
            // Reset active status just in case
            is_checked_in: false, 
            current_attendance_id: null,
            current_outlet_name: null // Clear active outlet upon deactivation
        })
        .eq('id', selectedEmployee.id);
      if (delErr) throw delErr;

      // Clear references in customers table
      const { error: c1 } = await supabase
        .from('customers')
        .update({ therapist_name: null })
        .eq('therapist_name', selectedEmployee.name);
      if (c1) throw c1;

      const { error: c2 } = await supabase
        .from('customers')
        .update({ package_sold_by: null })
        .eq('package_sold_by', selectedEmployee.name);
      if (c2) throw c2;

      await fetchData();
      setSelectedEmployee(null);
      setConfirmDeleteOpen(false);
    } catch (err: any) {
      console.error('deleteEmployee error', err);
      alert(err.message || 'Failed to delete employee');
    } finally {
      setIsDeleting(false);
    }
  };

  // --- Helpers ---
  const getRoleBadge = (role: string) => {
    switch (role) {
      case 'manager': return <span className="px-2 py-0.5 rounded text-[10px] bg-purple-100 text-purple-700 font-semibold uppercase tracking-wide">Manager</span>;
      case 'housekeeping': return <span className="px-2 py-0.5 rounded text-[10px] bg-gray-100 text-gray-600 font-semibold uppercase tracking-wide">HK</span>;
      default: return <span className="px-2 py-0.5 rounded text-[10px] bg-blue-100 text-blue-700 font-semibold uppercase tracking-wide">Therapist</span>;
    }
  };
  
  // NEW HELPER: Determines the display outlet and status
  const getOutletDisplay = (employee: Employee) => {
      const activeOutlet = employee.current_outlet_name;
      const homeOutlet = employee.outlet_name;

      if (activeOutlet) {
          return (
              <span className="flex items-center gap-1 text-sm font-semibold text-green-700">
                  <MapPin size={12}/> **{activeOutlet}** (Active)
              </span>
          );
      }
      
      return (
          <span className="flex items-center gap-1 text-xs text-black">
              <MapPin size={12}/> {homeOutlet} (Home)
          </span>
      );
  };

  return (
    <>
      <div className="flex h-[calc(100vh-64px)] bg-white overflow-hidden">
        {/* LEFT: List */}
        <div className="w-full md:w-1/3 lg:w-80 bg-white border-r border-gray-200 flex flex-col z-10">
          <div className="p-4 border-b">
            <div className="flex justify-between items-center mb-3">
              <h2 className="font-bold text-black">Team ({filteredEmployees.length})</h2>
              <button onClick={() => setIsAddModalOpen(true)} className="p-2 bg-blue-600 text-white rounded-full hover:bg-blue-700">
                <UserPlus size={16} />
              </button>
            </div>

            <div className="space-y-2">
              <div className="relative">
                <Search className="absolute left-3 top-3 text-black h-4 w-4" />
                <input
                  className="w-full pl-9 pr-3 py-2 bg-white border rounded-lg text-sm text-black"
                  placeholder="Search staff..."
                  value={searchTerm}
                  onChange={e => setSearchTerm(e.target.value)}
                />
              </div>

              <div className="relative">
                <Filter className="absolute left-3 top-3 text-black h-4 w-4" />
                <select
                  className="w-full pl-9 pr-3 py-2 bg-white border rounded-lg text-sm text-black"
                  value={outletFilter}
                  onChange={e => setOutletFilter(e.target.value)}
                >
                  <option value="all">All Locations</option>
                  {OUTLETS.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
                </select>
              </div>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto">
            {loading ? (
              <div className="p-6 text-center text-black">Loading...</div>
            ) : filteredEmployees.length === 0 ? (
              <div className="p-6 text-center text-black">No staff found.</div>
            ) : (
              <div className="divide-y">
                {filteredEmployees.map(emp => {
                  const isSelected = selectedEmployee?.id === emp.id;
                  const rev = todaySalesMap[emp.name] || 0;
                  return (
                    <div
                      key={emp.id}
                      onClick={() => setSelectedEmployee(emp)}
                      className={`p-4 cursor-pointer hover:bg-gray-50 ${isSelected ? 'bg-blue-50 border-l-4 border-blue-600' : ''}`}
                    >
                      <div className="flex justify-between">
                        <div>
                          <div className="font-semibold text-black">{emp.name}</div>
                          <div className="flex items-center gap-2 mt-1 text-xs text-black">
                            {getRoleBadge(emp.role)}
                            {/* Display the dynamically determined outlet */}
                            {getOutletDisplay(emp)}
                          </div>
                        </div>
                        <div className="text-right">
                          {rev > 0 && <div className="text-xs font-bold text-black">{formatCurrency(rev)}</div>}
                          <div className="text-[10px] text-black mt-1">Details →</div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* RIGHT: Details */}
        <div className="flex-1 flex flex-col bg-white overflow-hidden relative">
          {selectedEmployee ? (
            <>
              <div className="bg-white border-b p-6 flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="h-14 w-14 bg-gradient-to-br from-blue-500 to-purple-600 rounded-full flex items-center justify-center text-white text-xl font-bold">
                    {selectedEmployee.name.charAt(0)}
                  </div>
                  <div>
                    <h1 className="text-2xl font-bold text-black">{selectedEmployee.name}</h1>
                    <div className="flex items-center gap-4 text-sm text-black mt-1">
                      <span className="flex items-center gap-1"><Briefcase size={14} /> {selectedEmployee.role}</span>
                      <span className="flex items-center gap-1"><Phone size={14} /> {selectedEmployee.mobile || 'N/A'}</span>
                      {/* Detailed Outlet Display */}
                      <span className="flex items-center gap-1">
                         <MapPin size={14} /> 
                         <span className={selectedEmployee.current_outlet_name ? 'font-bold text-green-700' : 'text-black'}>
                             {selectedEmployee.current_outlet_name || selectedEmployee.outlet_name}
                         </span>
                         {selectedEmployee.current_outlet_name && 
                            <span className="text-xs text-green-600 bg-green-50 px-1.5 py-0.5 rounded-md font-semibold ml-1">Working Now</span>
                         }
                      </span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button onClick={() => openEditModalFor(selectedEmployee)} className="flex items-center gap-2 px-3 py-2 bg-white border rounded hover:bg-gray-50">
                    <Edit3 size={14} /> <span className="text-black">Edit</span>
                  </button>
                  <button onClick={() => setConfirmDeleteOpen(true)} className="flex items-center gap-2 px-3 py-2 bg-red-50 text-red-700 border rounded hover:bg-red-100">
                    <Trash2 size={14} /> <span className="text-black">Delete</span>
                  </button>
                </div>
              </div>
              {/* Stat cards */}
              <div className="p-6 grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="bg-white p-4 rounded-xl shadow-sm border">
                  <div className="flex items-center gap-3">
                    <TrendingUp size={20} />
                    <div>
                      <div className="text-xs text-black">Total Revenue</div>
                      <div className="text-xl font-bold text-black">{formatCurrency(totalRevenue)}</div>
                    </div>
                  </div>
                </div>

                <div className="bg-white p-4 rounded-xl shadow-sm border">
                  <div className="flex items-center gap-3">
                    <Briefcase size={20} />
                    <div>
                      <div className="text-xs text-black">Services Done</div>
                      <div className="text-xl font-bold text-black">{history.filter(h => h.type === 'Service').length}</div>
                    </div>
                  </div>
                </div>

                <div className="bg-white p-4 rounded-xl shadow-sm border">
                  <div className="flex items-center gap-3">
                    <User size={20} />
                    <div>
                      <div className="text-xs text-black">Packages Sold</div>
                      <div className="text-xl font-bold text-black">{history.filter(h => h.type === 'Package Sold').length}</div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Activity */}
              <div className="flex-1 px-6 pb-6 overflow-auto">
                <div className="bg-white rounded-xl shadow-sm border">
                  <div className="px-6 py-4 border-b">
                    <div className="flex items-center justify-between">
                      <h3 className="font-semibold text-black">Activity History</h3>
                      <div className="flex items-center gap-2">
                        <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="px-2 py-1 border rounded text-black" />
                        <span className="text-black">to</span>
                        <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className="px-2 py-1 border rounded text-black" />
                      </div>
                    </div>
                  </div>

                  <div className="overflow-auto">
                    <table className="w-full text-left">
                      <thead className="bg-gray-50 sticky top-0">
                        <tr>
                          <th className="px-6 py-3 text-xs text-black">Date</th>
                          <th className="px-6 py-3 text-xs text-black">Type</th>
                          <th className="px-6 py-3 text-xs text-black">Details</th>
                          <th className="px-6 py-3 text-xs text-black text-right">Revenue</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {statsLoading ? (
                          <tr><td colSpan={4} className="p-8 text-center text-black">Loading...</td></tr>
                        ) : history.length === 0 ? (
                          <tr><td colSpan={4} className="p-8 text-center text-black">No records found.</td></tr>
                        ) : (
                          history.map(r => (
                            <tr key={r.id} className="hover:bg-gray-50">
                              <td className="px-6 py-3 text-sm text-black">
                                {new Date(r.date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                              </td>
                              <td className="px-6 py-3 text-sm text-black">{r.type}</td>
                              <td className="px-6 py-3 text-sm text-black">
                                <div className="font-medium text-black">{r.name}</div>
                                <div className="text-xs text-black">{r.treatment}</div>
                              </td>
                              <td className="px-6 py-3 text-sm font-bold text-right text-black">{formatCurrency(r.amount)}</td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            </>
          ) : (
            <div className="h-full flex items-center justify-center text-black">
              <div className="text-center">
                <Briefcase size={48} className="mx-auto text-black mb-4" />
                <div className="text-black">Select an employee to view details</div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Add Employee Modal */}
      {isAddModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-bold text-black">Add Employee</h2>
              <button onClick={() => setIsAddModalOpen(false)}><X className="text-black" /></button>
            </div>
            <form onSubmit={handleAddEmployee} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-black mb-1">Name</label>
                <input className="w-full p-2 border rounded text-black" value={newEmpName} onChange={e => setNewEmpName(e.target.value)} required />
              </div>
              <div>
                <label className="block text-sm font-medium text-black mb-1">Mobile</label>
                <input className="w-full p-2 border rounded text-black" value={newEmpMobile} onChange={e => setNewEmpMobile(e.target.value)} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-black mb-1">Role</label>
                  <select className="w-full p-2 border rounded text-black" value={newEmpRole} onChange={e => setNewEmpRole(e.target.value as any)}>
                    <option value="therapist">Therapist</option>
                    <option value="manager">Manager</option>
                    <option value="housekeeping">Housekeeping</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-black mb-1">Home Outlet</label>
                  <select className="w-full p-2 border rounded text-black" value={newEmpOutlet} onChange={e => setNewEmpOutlet(e.target.value)}>
                    {OUTLETS.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
                  </select>
                </div>
              </div>

              <div className="flex gap-3">
                <button type="submit" disabled={isAdding} className="flex-1 py-2 bg-blue-600 text-white rounded">
                  {isAdding ? 'Saving...' : 'Add Employee'}
                </button>
                <button type="button" onClick={() => setIsAddModalOpen(false)} className="flex-1 py-2 border rounded text-black">Cancel</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Employee Modal */}
      {isEditModalOpen && selectedEmployee && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-bold text-black">Edit Employee</h2>
              <button onClick={() => setIsEditModalOpen(false)}><X className="text-black" /></button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-black mb-1">Name</label>
                <input className="w-full p-2 border rounded text-black" value={editName} onChange={e => setEditName(e.target.value)} />
              </div>
              <div>
                <label className="block text-sm font-medium text-black mb-1">Mobile</label>
                <input className="w-full p-2 border rounded text-black" value={editMobile} onChange={e => setEditMobile(e.target.value)} />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-black mb-1">Role</label>
                  <select className="w-full p-2 border rounded text-black" value={editRole} onChange={e => setEditRole(e.target.value as any)}>
                    <option value="therapist">Therapist</option>
                    <option value="manager">Manager</option>
                    <option value="housekeeping">Housekeeping</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-black mb-1">Home Outlet</label>
                  <select className="w-full p-2 border rounded text-black" value={editOutlet} onChange={e => setEditOutlet(e.target.value)}>
                    {OUTLETS.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
                  </select>
                </div>
              </div>

              <div className="flex gap-3">
                <button onClick={saveEdit} disabled={isSavingEdit} className="flex-1 py-2 bg-green-600 text-white rounded">
                  {isSavingEdit ? 'Saving...' : 'Save Changes'}
                </button>
                <button type="button" onClick={() => { setIsEditModalOpen(false); }} className="flex-1 py-2 border rounded text-black">Cancel</button>
              </div>

              <div className="border-t pt-3">
                <button onClick={() => setConfirmDeleteOpen(true)} className="w-full py-2 bg-red-50 text-red-700 border rounded flex items-center justify-center gap-2">
                  <Trash2 size={14} /> <span className="text-black">Delete Employee</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Confirm Delete Modal */}
      {confirmDeleteOpen && selectedEmployee && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-sm p-6">
            <h3 className="text-lg font-semibold text-black mb-3">Confirm Delete</h3>
            <p className="text-sm text-black mb-4">Are you sure you want to remove <strong>{selectedEmployee.name}</strong>? This will deactivate the employee and clear their references from activity records.</p>
            <div className="flex gap-3">
              <button onClick={deleteEmployee} disabled={isDeleting} className="flex-1 py-2 bg-red-600 text-white rounded">
                {isDeleting ? 'Deleting...' : 'Yes, Delete'}
              </button>
              <button onClick={() => setConfirmDeleteOpen(false)} className="flex-1 py-2 border rounded text-black">Cancel</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}