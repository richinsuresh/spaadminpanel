'use client';

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { OUTLETS } from '@/lib/outlet';
import { 
  UserPlus, Phone, Briefcase, Search, 
  MapPin, Calendar, Edit3, Trash2, 
  UserMinus, RotateCcw, ArrowLeft, Coffee, Plane,
  Monitor
} from 'lucide-react';

// --- Types ---
type Employee = {
  id: string;
  name: string;
  mobile?: string | null;
  // Updated role type to include 'backend'
  role: 'therapist' | 'manager' | 'housekeeping' | 'backend';
  outlet_name: string; 
  outlet_id: string; 
  is_active?: boolean;
  status?: 'active' | 'inactive' | 'long_leave';
  exit_reason?: string;
  exit_type?: 'Left' | 'Removed';
  exit_date?: string;
  join_date?: string | null;
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
  const [todaySalesMap, setTodaySalesMap] = useState<Record<string, number>>({});

  // Modals
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [newEmpName, setNewEmpName] = useState('');
  const [newEmpMobile, setNewEmpMobile] = useState('');
  const [newEmpRole, setNewEmpRole] = useState<Employee['role']>('therapist');
  const [newEmpOutlet, setNewEmpOutlet] = useState(OUTLETS[0]?.id ?? '');
  const [newEmpJoinDate, setNewEmpJoinDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [isBackend, setIsBackend] = useState(false); // NEW: State for Backend Employee Checkbox
  const [isAdding, setIsAdding] = useState(false);

  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editName, setEditName] = useState('');
  const [editMobile, setEditMobile] = useState('');
  const [editRole, setEditRole] = useState<Employee['role']>('therapist');
  const [editOutlet, setEditOutlet] = useState('');
  const [editJoinDate, setEditJoinDate] = useState('');
  const [isSavingEdit, setIsSavingEdit] = useState(false);

  const [isExitModalOpen, setIsExitModalOpen] = useState(false);
  const [exitType, setExitType] = useState<'Left' | 'Removed'>('Left');
  const [exitReason, setExitReason] = useState('');
  const [isProcessingExit, setIsProcessingExit] = useState(false);

  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  // Long Leave State
  const [isLongLeaveModalOpen, setIsLongLeaveModalOpen] = useState(false);
  const [isProcessingLeave, setIsProcessingLeave] = useState(false);

  // --- Fetch Data ---
  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const { data: empData, error } = await supabase
        .from('employees')
        .select('*') 
        .order('name', { ascending: true });

      if (error) {
        console.error("Error fetching employees:", error);
        return;
      }

      const emps = (empData || []) as Employee[];
      setEmployees(emps);

      let filtered = emps;
      if (outletFilter !== 'all') filtered = filtered.filter(e => e.outlet_id === outletFilter);
      if (searchTerm) {
        const t = searchTerm.toLowerCase();
        filtered = filtered.filter(e => e.name.toLowerCase().includes(t) || (e.mobile || '').includes(t));
      }
      setFilteredEmployees(filtered);

      const isMobile = window.innerWidth < 768; 
      setSelectedEmployee(prev => {
        if (prev) {
          const found = emps.find(e => e.id === prev.id);
          return found || null;
        }
        return isMobile ? null : (filtered[0] || null);
      });

      const today = new Date().toISOString().split('T')[0];
      const { data: salesData } = await supabase
        .from('customers')
        .select('amount_paid, package_amount, took_package, therapist_name, package_sold_by')
        .eq('date', today);

      const map: Record<string, number> = {};
      (salesData || []).forEach(s => {
        const amt = s.took_package ? s.package_amount || 0 : s.amount_paid || 0;
        if (s.took_package && s.package_sold_by) map[s.package_sold_by] = (map[s.package_sold_by] || 0) + amt;
        if (!s.took_package && s.therapist_name) map[s.therapist_name] = (map[s.therapist_name] || 0) + amt;
      });
      setTodaySalesMap(map);
    } catch (err) {
      console.error("Fetch failed:", err);
    } finally {
      setLoading(false);
    }
  }, [outletFilter, searchTerm]);

  useEffect(() => { fetchData(); }, [fetchData]);

  useEffect(() => {
    const channel = supabase.channel('employees-realtime').on('postgres_changes', { event: '*', schema: 'public', table: 'employees' }, () => fetchData()).subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [fetchData]);

  useEffect(() => {
    let r = employees;
    if (outletFilter !== 'all') r = r.filter(e => e.outlet_id === outletFilter);
    if (searchTerm) {
      const t = searchTerm.toLowerCase();
      r = r.filter(e => e.name.toLowerCase().includes(t) || (e.mobile || '').includes(t));
    }
    setFilteredEmployees(r);
  }, [searchTerm, outletFilter, employees]);

  useEffect(() => {
    if (!selectedEmployee) { setHistory([]); setTotalRevenue(0); return; }
    const fetchHistory = async () => {
      setStatsLoading(true);
      try {
        // FIXED: Use .ilike to catch paired therapists (e.g., "Sarah & John")
        const { data } = await supabase.from('customers').select('*').gte('date', startDate).lte('date', endDate)
          .or(`therapist_name.ilike.%${selectedEmployee.name}%,package_sold_by.eq.${selectedEmployee.name}`);
        
        const rows: StatRow[] = [];
        let total = 0;
        (data || []).forEach((row: any) => {
          // FIXED: Use .includes() to count the service if they were part of a duo
          if (row.therapist_name && row.therapist_name.includes(selectedEmployee.name)) {
            rows.push({ 
              id: row.id + '_svc', date: row.date, name: row.name, 
              treatment: row.took_package ? `(Pkg) ${row.treatment}` : row.treatment, 
              amount: row.took_package ? 0 : (row.amount_paid || 0), type: 'Service' 
            });
            if (!row.took_package) total += row.amount_paid || 0;
          }
          if (row.package_sold_by === selectedEmployee.name && row.took_package) {
            rows.push({ id: row.id + '_pkg', date: row.date, name: row.name, treatment: 'New Package', amount: row.package_amount || 0, type: 'Package Sold' });
            total += row.package_amount || 0;
          }
        });
        rows.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
        setHistory(rows);
        setTotalRevenue(total);
      } finally { setStatsLoading(false); }
    };
    fetchHistory();
  }, [selectedEmployee, startDate, endDate]);

  const handleAddEmployee = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newEmpName.trim()) return;
    setIsAdding(true);
    try {
      const outletObj = OUTLETS.find(o => o.id === newEmpOutlet);
      
      // Determine final role and outlet based on checkbox
      const finalRole = isBackend ? 'backend' : newEmpRole;
      const finalOutletId = isBackend ? 'HEAD_OFFICE' : newEmpOutlet;
      const finalOutletName = isBackend ? 'Head Office' : (outletObj?.name || 'Unknown');

      const { error } = await supabase.from('employees').insert({
        name: newEmpName.trim(), 
        mobile: newEmpMobile.trim() || null, 
        role: finalRole,
        outlet_id: finalOutletId, 
        outlet_name: finalOutletName, 
        is_active: true, 
        status: 'active',
        join_date: newEmpJoinDate
      });

      if (error) {
        console.error("Insert failed:", error);
        alert("Failed to add employee: " + error.message);
        return;
      }

      await fetchData(); 
      setIsAddModalOpen(false); 
      setNewEmpName(''); 
      setNewEmpMobile('');
      setIsBackend(false); // Reset checkbox
    } catch (err: any) {
        console.error("Unexpected error:", err);
        alert("Error: " + err.message);
    } finally { 
        setIsAdding(false); 
    }
  };

  const saveEdit = async () => {
    if (!selectedEmployee || !editName.trim()) return;
    setIsSavingEdit(true);
    const oldName = selectedEmployee.name;
    const newName = editName.trim();
    try {
      const outletObj = OUTLETS.find(o => o.id === editOutlet);
      const { error } = await supabase.from('employees').update({
        name: newName, 
        mobile: editMobile.trim() || null, 
        role: editRole,
        outlet_id: editOutlet, 
        outlet_name: outletObj?.name || editOutlet,
        join_date: editJoinDate || null
      }).eq('id', selectedEmployee.id);

      if (error) throw error;

      if (oldName !== newName) {
        await supabase.from('customers').update({ therapist_name: newName }).eq('therapist_name', oldName);
        await supabase.from('customers').update({ package_sold_by: newName }).eq('package_sold_by', oldName);
      }
      await fetchData(); setIsEditModalOpen(false);
    } catch (err: any) { alert(err.message); } finally { setIsSavingEdit(false); }
  };

  const handleExitSubmit = async () => {
    if (!selectedEmployee) return;
    setIsProcessingExit(true);
    try {
      await supabase.from('employees').update({
        is_active: false, status: 'inactive', exit_type: exitType, exit_reason: exitReason,
        exit_date: new Date().toISOString(), current_outlet_name: null, is_checked_in: false
      }).eq('id', selectedEmployee.id);
      await fetchData(); setIsExitModalOpen(false);
    } catch (err: any) { alert(err.message); } finally { setIsProcessingExit(false); }
  };

  const handleRejoin = async () => {
    if (!selectedEmployee || !confirm(`Rejoin ${selectedEmployee.name}?`)) return;
    await supabase.from('employees').update({ 
      is_active: true, 
      status: 'active', 
      exit_type: null, 
      exit_reason: null, 
      exit_date: null 
    }).eq('id', selectedEmployee.id);
    await fetchData();
  };

  const handleLongLeave = async () => {
    if (!selectedEmployee) return;
    setIsProcessingLeave(true);
    try {
        await supabase.from('employees').update({
            status: 'long_leave',
            is_checked_in: false,
            current_outlet_name: null
        }).eq('id', selectedEmployee.id);
        await fetchData();
        setIsLongLeaveModalOpen(false);
    } finally {
        setIsProcessingLeave(false);
    }
  };

  const handleReturnFromLeave = async () => {
    if (!selectedEmployee) return;
    if (!confirm(`Mark ${selectedEmployee.name} as returned from leave?`)) return;
    await supabase.from('employees').update({ status: 'active' }).eq('id', selectedEmployee.id);
    await fetchData();
  };
  
  const deleteEmployee = async () => {
    if (!selectedEmployee) return;
    setIsDeleting(true);
    try {
        await supabase.from('employees').update({ 
          is_active: false, 
          status: 'inactive',
          exit_type: 'Removed',
          exit_reason: 'Deleted by Admin',
          exit_date: new Date().toISOString(),
          is_checked_in: false, 
          current_outlet_name: null 
        }).eq('id', selectedEmployee.id);
        
        await fetchData(); setSelectedEmployee(null); setConfirmDeleteOpen(false);
    } finally { setIsDeleting(false); }
  };

  const getRoleBadge = (role: string) => {
    switch (role) {
      case 'manager': return <span className="px-2 py-0.5 rounded text-[10px] bg-purple-100 text-purple-700 font-semibold uppercase">Manager</span>;
      case 'housekeeping': return <span className="px-2 py-0.5 rounded text-[10px] bg-gray-100 text-gray-600 font-semibold uppercase">HK</span>;
      case 'backend': return <span className="px-2 py-0.5 rounded text-[10px] bg-indigo-100 text-indigo-700 font-semibold uppercase border border-indigo-200 flex items-center gap-1"><Monitor size={10} /> Backend</span>;
      default: return <span className="px-2 py-0.5 rounded text-[10px] bg-blue-100 text-blue-700 font-semibold uppercase">Therapist</span>;
    }
  };
  const getOutletDisplay = (employee: Employee) => {
    if (employee.current_outlet_name) return <span className="flex items-center gap-1 text-xs font-semibold text-green-700 truncate"><MapPin size={10}/> {employee.current_outlet_name}</span>;
    return <span className="flex items-center gap-1 text-xs text-gray-500 truncate"><MapPin size={10}/> {employee.outlet_name}</span>;
  };

  const activeEmployees = filteredEmployees.filter(e => e.is_active !== false);
  const pastEmployees = filteredEmployees.filter(e => e.is_active === false);

  return (
    <>
      <div className="flex flex-col md:flex-row h-[calc(100vh-64px)] bg-white overflow-hidden">
        {/* --- LIST SECTION --- */}
        <div className={`w-full md:w-1/3 lg:w-80 bg-white border-r border-gray-200 flex-col z-10 ${selectedEmployee ? 'hidden md:flex' : 'flex'}`}>
          <div className="p-4 border-b">
            <div className="flex justify-between items-center mb-3">
              <h2 className="font-bold text-gray-800">Team ({filteredEmployees.length})</h2>
              <button onClick={() => { setNewEmpJoinDate(new Date().toISOString().split('T')[0]); setIsAddModalOpen(true); }} className="p-2 bg-blue-600 text-white rounded-full hover:bg-blue-700 shadow">
                <UserPlus size={16} />
              </button>
            </div>
            <div className="space-y-2">
              <div className="relative">
                <Search className="absolute left-3 top-2.5 text-gray-400 h-4 w-4" />
                <input className="w-full pl-9 pr-3 py-2 bg-gray-50 border rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none text-black" placeholder="Search..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
              </div>
              <select className="w-full px-3 py-2 bg-gray-50 border rounded-lg text-sm text-black outline-none" value={outletFilter} onChange={e => setOutletFilter(e.target.value)}>
                <option value="all">All Locations</option>
                {OUTLETS.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
              </select>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto">
            {loading ? <div className="p-6 text-center text-gray-400">Loading...</div> : (
              <div className="divide-y divide-gray-100">
                {activeEmployees.map(emp => (
                  <div key={emp.id} onClick={() => setSelectedEmployee(emp)} className={`p-4 cursor-pointer hover:bg-gray-50 ${selectedEmployee?.id === emp.id ? 'bg-blue-50 border-l-4 border-blue-600' : 'border-l-4 border-transparent'} ${emp.status === 'long_leave' ? 'bg-amber-50/50' : ''}`}>
                    <div className="flex justify-between items-center">
                      <div className="overflow-hidden">
                        <div className="font-semibold text-gray-900 truncate flex items-center gap-2">
                            {emp.name}
                            {emp.status === 'long_leave' && <Plane size={12} className="text-amber-500" />}
                        </div>
                        <div className="flex items-center gap-2 mt-1">
                          {getRoleBadge(emp.role)}
                          {getOutletDisplay(emp)}
                        </div>
                      </div>
                      {todaySalesMap[emp.name] > 0 && <div className="text-xs font-bold text-green-600 bg-green-50 px-2 py-1 rounded">{formatCurrency(todaySalesMap[emp.name])}</div>}
                    </div>
                  </div>
                ))}
                {pastEmployees.length > 0 && (
                  <>
                    <div className="px-4 py-2 bg-gray-100 text-xs font-bold text-gray-500 uppercase">Past Staff</div>
                    {pastEmployees.map(emp => (
                      <div key={emp.id} onClick={() => setSelectedEmployee(emp)} className="p-4 cursor-pointer opacity-70 hover:opacity-100 hover:bg-gray-50 border-l-4 border-transparent">
                        <div className="flex justify-between items-center">
                          <div>
                            <div className="font-medium text-gray-600 line-through">{emp.name}</div>
                            <div className="text-xs text-red-500">{emp.exit_type}</div>
                          </div>
                          <span className="text-[10px] px-2 py-0.5 bg-gray-200 rounded text-gray-600">Inactive</span>
                        </div>
                      </div>
                    ))}
                  </>
                )}
              </div>
            )}
          </div>
        </div>

        {/* --- DETAILS SECTION --- */}
        <div className={`flex-1 flex-col bg-white overflow-hidden ${!selectedEmployee ? 'hidden md:flex' : 'flex'}`}>
          {selectedEmployee ? (
            <>
              {/* Header */}
              <div className="bg-white border-b p-4 flex flex-col gap-4">
                <button onClick={() => setSelectedEmployee(null)} className="md:hidden flex items-center text-sm text-gray-500 hover:text-gray-900 self-start">
                  <ArrowLeft size={16} className="mr-1"/> Back to Team
                </button>
                
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                  <div className="flex items-center gap-4">
                    <div className={`h-14 w-14 rounded-full flex items-center justify-center text-white text-xl font-bold shadow ${selectedEmployee.is_active === false ? 'bg-gray-400' : selectedEmployee.status === 'long_leave' ? 'bg-amber-400' : 'bg-gradient-to-r from-blue-600 to-indigo-600'}`}>
                      {selectedEmployee.name.charAt(0)}
                    </div>
                    <div>
                      <h1 className="text-xl md:text-2xl font-bold text-gray-900 flex items-center gap-2">
                          {selectedEmployee.name}
                          {selectedEmployee.status === 'long_leave' && <span className="text-xs bg-amber-100 text-amber-800 px-2 py-1 rounded-full border border-amber-200 font-bold uppercase tracking-wide">On Leave</span>}
                      </h1>
                      {selectedEmployee.is_active !== false ? (
                        <div className="flex flex-wrap gap-3 text-xs md:text-sm text-gray-600 mt-1">
                          <span className="flex items-center gap-1"><Briefcase size={12}/> {selectedEmployee.role}</span>
                          <span className="flex items-center gap-1"><Phone size={12}/> {selectedEmployee.mobile || '—'}</span>
                          <span className={`flex items-center gap-1 ${selectedEmployee.current_outlet_name ? 'text-green-700 font-medium' : ''}`}>
                             <MapPin size={12}/> {selectedEmployee.current_outlet_name || selectedEmployee.outlet_name}
                          </span>
                          {selectedEmployee.join_date && (
                             <span className="flex items-center gap-1 text-indigo-600"><Calendar size={12}/> Joined: {new Date(selectedEmployee.join_date).toLocaleDateString()}</span>
                          )}
                        </div>
                      ) : (
                         <div className="text-xs text-red-600 flex items-center gap-1 mt-1"><UserMinus size={12}/> {selectedEmployee.exit_type} - {selectedEmployee.exit_reason}</div>
                      )}
                    </div>
                  </div>
                  
                  <div className="flex gap-2 self-start md:self-center">
                     {selectedEmployee.is_active !== false ? (
                       <>
                         {selectedEmployee.status === 'long_leave' ? (
                             <button onClick={handleReturnFromLeave} className="px-3 py-2 bg-amber-100 text-amber-800 border border-amber-200 rounded hover:bg-amber-200 text-sm font-bold flex items-center gap-2">
                                 <RotateCcw size={14}/> Return
                             </button>
                         ) : (
                             <button onClick={() => setIsLongLeaveModalOpen(true)} className="px-3 py-2 bg-gray-50 text-gray-600 border rounded hover:bg-gray-100 text-sm font-medium flex items-center gap-2" title="Long Leave">
                                 <Coffee size={14}/> Leave
                             </button>
                         )}
                         <button onClick={() => { setEditName(selectedEmployee.name); setEditMobile(selectedEmployee.mobile || ''); setEditRole(selectedEmployee.role); setEditOutlet(selectedEmployee.outlet_id); setEditJoinDate(selectedEmployee.join_date || ''); setIsEditModalOpen(true); }} className="p-2 border rounded hover:bg-gray-50 text-gray-700"><Edit3 size={16}/></button>
                         <button onClick={() => { setExitType('Left'); setExitReason(''); setIsExitModalOpen(true); }} className="px-3 py-2 bg-red-50 text-red-700 border border-red-200 rounded hover:bg-red-100 text-sm font-medium">Exit</button>
                       </>
                     ) : (
                       <button onClick={handleRejoin} className="px-3 py-2 bg-green-600 text-white rounded hover:bg-green-700 text-sm font-medium flex items-center gap-2"><RotateCcw size={16}/> Rejoin</button>
                     )}
                  </div>
                </div>
              </div>

              {/* Stats Grid */}
              <div className="p-4 md:p-6 grid grid-cols-2 md:grid-cols-3 gap-3 md:gap-6 bg-gray-50/50">
                 <div className="bg-white p-3 md:p-4 rounded-lg shadow-sm border text-center md:text-left">
                    <div className="text-[10px] md:text-xs text-gray-500 uppercase font-bold">Revenue</div>
                    <div className="text-lg md:text-xl font-bold text-gray-900">{formatCurrency(totalRevenue)}</div>
                 </div>
                 <div className="bg-white p-3 md:p-4 rounded-lg shadow-sm border text-center md:text-left">
                    <div className="text-[10px] md:text-xs text-gray-500 uppercase font-bold">Services</div>
                    <div className="text-lg md:text-xl font-bold text-blue-600">{history.filter(h => h.type === 'Service').length}</div>
                 </div>
                 <div className="col-span-2 md:col-span-1 bg-white p-3 md:p-4 rounded-lg shadow-sm border text-center md:text-left">
                    <div className="text-[10px] md:text-xs text-gray-500 uppercase font-bold">Packages</div>
                    <div className="text-lg md:text-xl font-bold text-purple-600">{history.filter(h => h.type === 'Package Sold').length}</div>
                 </div>
              </div>

              {/* Activity Table */}
              <div className="flex-1 p-4 md:p-6 overflow-hidden flex flex-col">
                <div className="bg-white rounded-lg shadow-sm border flex flex-col h-full">
                  <div className="p-3 border-b flex justify-between items-center bg-gray-50">
                    <h3 className="font-semibold text-gray-800 text-sm">History</h3>
                    <div className="flex items-center gap-2">
                       <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="w-24 text-xs p-1 border rounded bg-white text-black"/>
                       <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className="w-24 text-xs p-1 border rounded bg-white text-black"/>
                    </div>
                  </div>
                  <div className="overflow-auto flex-1">
                    <table className="w-full text-left text-sm min-w-[500px]"> {/* min-w forces horizontal scroll on mobile */}
                      <thead className="bg-gray-50 sticky top-0 text-xs uppercase text-gray-500">
                        <tr>
                          <th className="px-4 py-2">Date</th>
                          <th className="px-4 py-2">Service</th>
                          <th className="px-4 py-2 text-right">Amount</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y text-gray-700">
                        {history.length === 0 ? <tr><td colSpan={3} className="p-4 text-center text-gray-400">No records.</td></tr> : 
                          history.map(r => (
                            <tr key={r.id}>
                              <td className="px-4 py-2 whitespace-nowrap text-xs">{new Date(r.date).toLocaleDateString('en-IN', {day:'2-digit', month:'short'})}</td>
                              <td className="px-4 py-2">
                                <div className="font-medium text-gray-900">{r.treatment}</div>
                                <div className="text-xs text-gray-500">{r.name}</div>
                              </td>
                              <td className="px-4 py-2 text-right font-medium">{formatCurrency(r.amount)}</td>
                            </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            </>
          ) : (
            <div className="hidden md:flex h-full items-center justify-center text-gray-400 flex-col">
              <Briefcase size={40} className="mb-2 opacity-50"/>
              <p>Select a team member</p>
            </div>
          )}
        </div>
      </div>

      {/* Modals */}
      {isAddModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
           <div className="bg-white rounded-xl w-full max-w-sm p-6">
              <h3 className="font-bold text-lg mb-4 text-black">Add Staff</h3>
              <form onSubmit={handleAddEmployee} className="space-y-3">
                 <input className="w-full p-2 border rounded text-black" placeholder="Name" value={newEmpName} onChange={e => setNewEmpName(e.target.value)} required/>
                 <input className="w-full p-2 border rounded text-black" placeholder="Mobile" value={newEmpMobile} onChange={e => setNewEmpMobile(e.target.value)}/>
                 
                 {/* CHECKBOX FOR BACKEND */}
                 <div className="flex items-center gap-2 my-2">
                    <input 
                      type="checkbox" 
                      id="backendCheck" 
                      checked={isBackend} 
                      onChange={(e) => setIsBackend(e.target.checked)}
                      className="w-4 h-4 text-blue-600 rounded"
                    />
                    <label htmlFor="backendCheck" className="text-sm font-bold text-gray-700 select-none cursor-pointer">
                      BE (Back End Employee)
                    </label>
                 </div>

                 {/* Role & Outlet (Disabled if Backend) */}
                 <div className={`grid grid-cols-2 gap-2 transition-opacity ${isBackend ? 'opacity-50 pointer-events-none' : 'opacity-100'}`}>
                    <select className="p-2 border rounded text-black" value={newEmpRole} onChange={e => setNewEmpRole(e.target.value as any)}>
                        <option value="therapist">Therapist</option>
                        <option value="manager">Manager</option>
                        <option value="housekeeping">HK</option>
                    </select>
                    <select className="p-2 border rounded text-black" value={newEmpOutlet} onChange={e => setNewEmpOutlet(e.target.value)}>
                        {OUTLETS.map(o=><option key={o.id} value={o.id}>{o.name}</option>)}
                    </select>
                 </div>

                 <div>
                    <label className="text-[10px] uppercase font-bold text-gray-500">Join Date</label>
                    <input type="date" className="w-full p-2 border rounded text-black" value={newEmpJoinDate} onChange={e => setNewEmpJoinDate(e.target.value)} />
                 </div>
                 <div className="flex gap-2 mt-2"><button type="submit" className="flex-1 bg-blue-600 text-white p-2 rounded">Add</button><button onClick={() => setIsAddModalOpen(false)} type="button" className="flex-1 border p-2 rounded text-black">Cancel</button></div>
              </form>
           </div>
        </div>
      )}

      {isEditModalOpen && (
         <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
            <div className="bg-white rounded-xl w-full max-w-sm p-6">
               <h3 className="font-bold text-lg mb-4 text-black">Edit Staff</h3>
               <div className="space-y-3">
                  <input className="w-full p-2 border rounded text-black" value={editName} onChange={e => setEditName(e.target.value)}/>
                  <input className="w-full p-2 border rounded text-black" value={editMobile} onChange={e => setEditMobile(e.target.value)}/>
                  <div className="grid grid-cols-2 gap-2">
                     <select className="p-2 border rounded text-black" value={editRole} onChange={e => setEditRole(e.target.value as any)}>
                        <option value="therapist">Therapist</option>
                        <option value="manager">Manager</option>
                        <option value="housekeeping">HK</option>
                        <option value="backend">Backend</option>
                     </select>
                     <select className="p-2 border rounded text-black" value={editOutlet} onChange={e => setEditOutlet(e.target.value)}>{OUTLETS.map(o=><option key={o.id} value={o.id}>{o.name}</option>)}</select>
                  </div>
                  <div>
                    <label className="text-[10px] uppercase font-bold text-gray-500">Join Date</label>
                    <input type="date" className="w-full p-2 border rounded text-black" value={editJoinDate} onChange={e => setEditJoinDate(e.target.value)} />
                 </div>
                  <div className="flex gap-2 mt-2"><button onClick={saveEdit} className="flex-1 bg-green-600 text-white p-2 rounded">Save</button><button onClick={() => setIsEditModalOpen(false)} className="flex-1 border p-2 rounded text-black">Cancel</button></div>
                  <button onClick={() => setConfirmDeleteOpen(true)} className="w-full text-red-600 text-xs mt-2 underline">Delete Employee</button>
               </div>
            </div>
         </div>
      )}

      {isExitModalOpen && (
         <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
            <div className="bg-white rounded-xl w-full max-w-sm p-6">
               <h3 className="font-bold text-lg mb-2 text-red-800">Process Exit</h3>
               <div className="space-y-3">
                  <div className="flex gap-2"><button onClick={()=>setExitType('Left')} className={`flex-1 p-2 border rounded text-sm ${exitType==='Left'?'bg-amber-100 border-amber-500 text-black':'text-gray-500'}`}>Left</button><button onClick={()=>setExitType('Removed')} className={`flex-1 p-2 border rounded text-sm ${exitType==='Removed'?'bg-red-100 border-red-500 text-black':'text-gray-500'}`}>Removed</button></div>
                  <textarea value={exitReason} onChange={e=>setExitReason(e.target.value)} className="w-full p-2 border rounded text-black text-sm" placeholder="Reason..."/>
                  <div className="flex gap-2"><button onClick={handleExitSubmit} className="flex-1 bg-red-600 text-white p-2 rounded">Confirm</button><button onClick={()=>setIsExitModalOpen(false)} className="flex-1 border p-2 rounded text-black">Cancel</button></div>
               </div>
            </div>
         </div>
      )}

      {isLongLeaveModalOpen && selectedEmployee && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
           <div className="bg-white rounded-xl w-full max-w-sm p-6">
              <div className="flex items-center gap-3 text-amber-600 mb-4">
                 <Coffee size={24} />
                 <h3 className="font-bold text-lg text-black">Long Leave</h3>
              </div>
              <p className="text-sm text-gray-600 mb-6">
                Mark <strong>{selectedEmployee.name}</strong> as on long leave? They will stop appearing in daily attendance alerts until they return.
              </p>
              <div className="flex gap-2">
                <button onClick={handleLongLeave} disabled={isProcessingLeave} className="flex-1 bg-amber-500 text-white p-2 rounded font-bold">
                    {isProcessingLeave ? 'Processing...' : 'Confirm Leave'}
                </button>
                <button onClick={() => setIsLongLeaveModalOpen(false)} className="flex-1 border p-2 rounded text-black">Cancel</button>
              </div>
           </div>
        </div>
      )}

      {confirmDeleteOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
           <div className="bg-white rounded-xl w-full max-w-sm p-6">
              <h3 className="font-bold text-black">Remove Employee?</h3>
              <p className="text-sm text-gray-600 my-4">This will mark them as removed but keep service history.</p>
              <div className="flex gap-2"><button onClick={deleteEmployee} className="flex-1 bg-red-600 text-white p-2 rounded">Confirm Removal</button><button onClick={()=>setConfirmDeleteOpen(false)} className="flex-1 border p-2 rounded text-black">Cancel</button></div>
           </div>
        </div>
      )}
    </>
  );
}