'use client';

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { OUTLETS } from '@/lib/outlet';
import { 
  Loader2, UserPlus, Phone, Briefcase, Search, 
  MapPin, Calendar, TrendingUp, User, Filter, X 
} from 'lucide-react';

// --- Types ---
type Employee = {
  id: string;
  name: string;
  mobile: string;
  role: 'therapist' | 'manager' | 'housekeeping';
  outlet_name: string;
  outlet_id: string;
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
  
  // Live Dashboard Metrics for List View
  const [todaySalesMap, setTodaySalesMap] = useState<Record<string, number>>({});

  // Form State
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [newEmpName, setNewEmpName] = useState('');
  const [newEmpMobile, setNewEmpMobile] = useState('');
  const [newEmpRole, setNewEmpRole] = useState<'therapist' | 'manager' | 'housekeeping'>('therapist');
  const [newEmpOutlet, setNewEmpOutlet] = useState(OUTLETS[0].id); // Default to first outlet
  const [isAdding, setIsAdding] = useState(false);

  // --- 1. Fetch Initial Data ---
  const fetchData = useCallback(async () => {
    setLoading(true);
    // Fetch Employees
    const { data: empData } = await supabase.from('employees').select('*').eq('is_active', true).order('name');
    setEmployees(empData || []);
    setFilteredEmployees(empData || []);

    // Select first employee by default if available and none selected
    if (empData && empData.length > 0 && !selectedEmployee) {
        setSelectedEmployee(empData[0]);
    }

    // Fetch Today's Metrics (for the left sidebar list)
    const today = new Date().toISOString().split('T')[0];
    const { data: salesData } = await supabase
      .from('customers')
      .select('amount_paid, package_amount, took_package, therapist_name, package_sold_by')
      .eq('date', today);

    const salesMap: Record<string, number> = {};

    (salesData || []).forEach((sale: any) => {
      const amount = sale.took_package ? sale.package_amount : sale.amount_paid;
      // Revenue Logic: Seller gets package credit, Therapist gets service credit
      if (sale.took_package) {
        if (sale.package_sold_by) salesMap[sale.package_sold_by] = (salesMap[sale.package_sold_by] || 0) + amount;
      } else {
        if (sale.therapist_name) salesMap[sale.therapist_name] = (salesMap[sale.therapist_name] || 0) + amount;
      }
    });
    setTodaySalesMap(salesMap);
    setLoading(false);
  }, [selectedEmployee]); // Dependency ensures it doesn't reset selection unnecessarily

  useEffect(() => { fetchData(); }, [fetchData]);

  // --- 2. Filter Logic ---
  useEffect(() => {
    let result = employees;

    if (outletFilter !== 'all') {
       result = result.filter(e => e.outlet_id === outletFilter);
    }

    if (searchTerm) {
      const lowerTerm = searchTerm.toLowerCase();
      result = result.filter(e => 
        e.name.toLowerCase().includes(lowerTerm) || 
        (e.mobile && e.mobile.includes(lowerTerm))
      );
    }
    setFilteredEmployees(result);
  }, [searchTerm, outletFilter, employees]);

  // --- 3. Fetch Stats for Selected Employee ---
  useEffect(() => {
    if (!selectedEmployee) return;
    
    const fetchHistory = async () => {
        setStatsLoading(true);
        const { data, error } = await supabase
        .from('customers')
        .select('*')
        .gte('date', startDate)
        .lte('date', endDate)
        .or(`therapist_name.eq.${selectedEmployee.name},package_sold_by.eq.${selectedEmployee.name}`);

        if (error) { console.error(error); setStatsLoading(false); return; }

        const rows: StatRow[] = [];
        let total = 0;

        (data || []).forEach((row: any) => {
            // A. Services (Therapist)
            if (row.therapist_name === selectedEmployee.name) {
                if (row.took_package) {
                    // Service for New Package (No Revenue Credit)
                    rows.push({
                        id: row.id + '_svc_pkg', date: row.date, name: row.name,
                        treatment: `(Pkg Start) ${row.treatment}`, amount: 0, type: 'Service'
                    });
                } else {
                    // Regular Service
                    rows.push({
                        id: row.id + '_svc', date: row.date, name: row.name,
                        treatment: row.treatment, amount: row.amount_paid, type: 'Service'
                    });
                    total += row.amount_paid;
                }
            }
            // B. Package Sales (Seller)
            if (row.package_sold_by === selectedEmployee.name && row.took_package) {
                rows.push({
                    id: row.id + '_pkg', date: row.date, name: row.name,
                    treatment: 'New Package Sales', amount: row.package_amount, type: 'Package Sold'
                });
                total += row.package_amount;
            }
        });

        rows.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
        setHistory(rows);
        setTotalRevenue(total);
        setStatsLoading(false);
    };

    fetchHistory();
  }, [selectedEmployee, startDate, endDate]);

  // --- Add Employee ---
  const handleAddEmployee = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsAdding(true);
    
    const outletObj = OUTLETS.find(o => o.id === newEmpOutlet);
    const { error } = await supabase.from('employees').insert({
      name: newEmpName.trim(),
      mobile: newEmpMobile.trim(),
      role: newEmpRole,
      outlet_id: newEmpOutlet,   
      outlet_name: outletObj?.name || 'Unknown', 
      // Pin will be null initially, user must set it or use default logic if you have it
    });

    if (error) alert('Error: ' + error.message);
    else {
      setNewEmpName(''); setNewEmpMobile(''); setIsAddModalOpen(false);
      fetchData();
    }
    setIsAdding(false);
  };

  // --- Helpers ---
  const getRoleBadge = (role: string) => {
      switch(role) {
          case 'manager': return <span className="px-2 py-0.5 rounded text-[10px] bg-purple-100 text-purple-700 font-semibold uppercase tracking-wide">Manager</span>;
          case 'housekeeping': return <span className="px-2 py-0.5 rounded text-[10px] bg-gray-100 text-gray-600 font-semibold uppercase tracking-wide">HK</span>;
          default: return <span className="px-2 py-0.5 rounded text-[10px] bg-blue-100 text-blue-700 font-semibold uppercase tracking-wide">Therapist</span>;
      }
  }

  return (
    <>
      <div className="flex h-[calc(100vh-64px)] bg-gray-50 overflow-hidden">
        
        {/* --- LEFT SIDEBAR (List) --- */}
        <div className="w-full md:w-1/3 lg:w-80 bg-white border-r border-gray-200 flex flex-col z-10">
          {/* Header & Filters */}
          <div className="p-4 border-b border-gray-200 space-y-3">
              <div className="flex justify-between items-center">
                  <h2 className="font-bold text-gray-800 text-lg">Team ({filteredEmployees.length})</h2>
                  <button onClick={() => setIsAddModalOpen(true)} className="p-2 bg-blue-600 text-white rounded-full hover:bg-blue-700 shadow-sm">
                      <UserPlus size={16} />
                  </button>
              </div>
              
              <div className="relative">
                  <Search className="absolute left-3 top-2.5 text-gray-400 h-4 w-4" />
                  <input 
                      type="text" 
                      placeholder="Search staff..." 
                      value={searchTerm}
                      onChange={e => setSearchTerm(e.target.value)}
                      className="w-full pl-9 pr-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none text-gray-800"
                  />
              </div>

              <div className="relative">
                   <Filter className="absolute left-3 top-2.5 text-gray-400 h-4 w-4" />
                   <select 
                      value={outletFilter}
                      onChange={e => setOutletFilter(e.target.value)}
                      className="w-full pl-9 pr-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none text-gray-800 appearance-none"
                   >
                      <option value="all">All Locations</option>
                      {OUTLETS.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
                   </select>
              </div>
          </div>

          {/* Scrollable List */}
          <div className="flex-1 overflow-y-auto">
              {loading ? (
                  <div className="p-6 text-center text-gray-400 text-sm">Loading...</div>
              ) : filteredEmployees.length === 0 ? (
                  <div className="p-6 text-center text-gray-400 text-sm">No staff found.</div>
              ) : (
                  <div className="divide-y divide-gray-100">
                      {filteredEmployees.map(emp => {
                          const isSelected = selectedEmployee?.id === emp.id;
                          const rev = todaySalesMap[emp.name] || 0;
                          return (
                              <div 
                                  key={emp.id}
                                  onClick={() => setSelectedEmployee(emp)}
                                  className={`p-4 cursor-pointer hover:bg-gray-50 transition-all ${isSelected ? 'bg-blue-50 border-l-4 border-blue-600' : 'border-l-4 border-transparent'}`}
                              >
                                  <div className="flex justify-between items-start">
                                      <div>
                                          <div className="font-semibold text-gray-900">{emp.name}</div>
                                          <div className="flex items-center gap-2 mt-1">
                                              {getRoleBadge(emp.role)}
                                              <span className="text-xs text-gray-500 flex items-center gap-0.5"><MapPin size={10}/> {emp.outlet_name}</span>
                                          </div>
                                      </div>
                                      <div className="text-right">
                                          {rev > 0 && <div className="text-xs font-bold text-green-600">₹{rev/100}</div>}
                                          <div className="text-[10px] text-gray-400 mt-1">Details &rarr;</div>
                                      </div>
                                  </div>
                              </div>
                          )
                      })}
                  </div>
              )}
          </div>
        </div>

        {/* --- RIGHT PANEL (Details) --- */}
        <div className="flex-1 flex flex-col bg-gray-50 overflow-hidden relative">
          {selectedEmployee ? (
              <>
                  {/* Detail Header */}
                  <div className="bg-white border-b border-gray-200 p-6 flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-sm z-10">
                      <div className="flex items-center gap-4">
                          <div className="h-14 w-14 bg-gradient-to-br from-blue-500 to-purple-600 rounded-full flex items-center justify-center text-white text-xl font-bold shadow-md">
                              {selectedEmployee.name.charAt(0)}
                          </div>
                          <div>
                              <h1 className="text-2xl font-bold text-gray-900">{selectedEmployee.name}</h1>
                              <div className="flex items-center gap-4 text-sm text-gray-500 mt-1">
                                  <span className="flex items-center gap-1"><Briefcase size={14} /> {selectedEmployee.role}</span>
                                  <span className="flex items-center gap-1"><Phone size={14} /> {selectedEmployee.mobile || 'N/A'}</span>
                                  <span className="flex items-center gap-1"><MapPin size={14} /> {selectedEmployee.outlet_name}</span>
                              </div>
                          </div>
                      </div>
                      
                      <div className="flex items-center gap-2 bg-gray-100 p-1.5 rounded-lg border border-gray-200">
                          <input 
                              type="date" 
                              value={startDate} 
                              onChange={e => setStartDate(e.target.value)}
                              className="bg-white border border-gray-300 rounded px-2 py-1 text-sm text-gray-700 outline-none focus:border-blue-500"
                          />
                          <span className="text-gray-400 text-sm">to</span>
                          <input 
                              type="date" 
                              value={endDate} 
                              onChange={e => setEndDate(e.target.value)}
                              className="bg-white border border-gray-300 rounded px-2 py-1 text-sm text-gray-700 outline-none focus:border-blue-500"
                          />
                      </div>
                  </div>

                  {/* Stats Cards */}
                  <div className="p-6 grid grid-cols-1 md:grid-cols-3 gap-6">
                       <div className="bg-white p-5 rounded-xl shadow-sm border border-gray-100 flex items-center gap-4">
                          <div className="p-3 bg-green-50 text-green-600 rounded-lg"><TrendingUp size={24}/></div>
                          <div>
                              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Total Revenue</p>
                              <p className="text-2xl font-bold text-gray-900">{formatCurrency(totalRevenue)}</p>
                          </div>
                       </div>
                       <div className="bg-white p-5 rounded-xl shadow-sm border border-gray-100 flex items-center gap-4">
                          <div className="p-3 bg-purple-50 text-purple-600 rounded-lg"><Briefcase size={24}/></div>
                          <div>
                              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Services Done</p>
                              <p className="text-2xl font-bold text-gray-900">{history.filter(h => h.type === 'Service').length}</p>
                          </div>
                       </div>
                       <div className="bg-white p-5 rounded-xl shadow-sm border border-gray-100 flex items-center gap-4">
                          <div className="p-3 bg-orange-50 text-orange-600 rounded-lg"><User size={24}/></div>
                          <div>
                              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Packages Sold</p>
                              <p className="text-2xl font-bold text-gray-900">{history.filter(h => h.type === 'Package Sold').length}</p>
                          </div>
                       </div>
                  </div>

                  {/* Activity Table */}
                  <div className="flex-1 overflow-hidden flex flex-col px-6 pb-6">
                      <div className="bg-white rounded-xl shadow-sm border border-gray-200 flex-1 overflow-hidden flex flex-col">
                          <div className="px-6 py-4 border-b border-gray-200 bg-gray-50/50">
                              <h3 className="font-semibold text-gray-800">Activity History</h3>
                          </div>
                          <div className="flex-1 overflow-y-auto">
                              <table className="w-full text-left">
                                  <thead className="bg-gray-50 sticky top-0 z-10">
                                      <tr>
                                          <th className="px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Date</th>
                                          <th className="px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Type</th>
                                          <th className="px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Details</th>
                                          <th className="px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider text-right">Revenue Credit</th>
                                      </tr>
                                  </thead>
                                  <tbody className="divide-y divide-gray-100">
                                      {statsLoading ? (
                                          <tr><td colSpan={4} className="p-12 text-center text-gray-400">Loading data...</td></tr>
                                      ) : history.length === 0 ? (
                                          <tr><td colSpan={4} className="p-12 text-center text-gray-400">No records found.</td></tr>
                                      ) : (
                                          history.map(row => (
                                              <tr key={row.id} className="hover:bg-gray-50">
                                                  <td className="px-6 py-3 text-sm text-gray-500 whitespace-nowrap">
                                                      {new Date(row.date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}
                                                  </td>
                                                  <td className="px-6 py-3 text-sm">
                                                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${row.type === 'Service' ? 'bg-blue-100 text-blue-700' : 'bg-orange-100 text-orange-700'}`}>
                                                          {row.type}
                                                      </span>
                                                  </td>
                                                  <td className="px-6 py-3 text-sm text-gray-800">
                                                      <div className="font-medium">{row.name}</div>
                                                      <div className="text-xs text-gray-500">{row.treatment}</div>
                                                  </td>
                                                  <td className="px-6 py-3 text-sm font-bold text-gray-700 text-right">
                                                      {formatCurrency(row.amount)}
                                                  </td>
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
              <div className="h-full flex flex-col items-center justify-center text-gray-400 p-10">
                <Briefcase size={48} className="mb-4 text-gray-300" />
                <p>Select an employee from the list to view their performance stats.</p>
              </div>
            )}
        </div>
      </div>

      {/* --- Add Employee Modal --- */}
      {isAddModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
            <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6">
                <div className="flex justify-between items-center mb-4">
                    <h2 className="text-xl font-bold text-gray-800">Add Employee</h2>
                    <button onClick={() => setIsAddModalOpen(false)}><X className="text-gray-500" /></button>
                </div>
                <form onSubmit={handleAddEmployee} className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
                        <input className="w-full p-2 border rounded text-black" value={newEmpName} onChange={e => setNewEmpName(e.target.value)} required />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Mobile</label>
                        <input className="w-full p-2 border rounded text-black" value={newEmpMobile} onChange={e => setNewEmpMobile(e.target.value)} />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Role</label>
                            <select className="w-full p-2 border rounded bg-white text-black" value={newEmpRole} onChange={e => setNewEmpRole(e.target.value as any)}>
                                <option value="therapist">Therapist</option>
                                <option value="manager">Manager</option>
                                <option value="housekeeping">Housekeeping</option>
                            </select>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Home Outlet</label>
                            <select className="w-full p-2 border rounded bg-white text-black" value={newEmpOutlet} onChange={e => setNewEmpOutlet(e.target.value)}>
                                {OUTLETS.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
                            </select>
                        </div>
                    </div>
                    <button type="submit" disabled={isAdding} className="w-full py-2 bg-blue-600 text-white rounded hover:bg-blue-700 font-medium disabled:opacity-50">
                        {isAdding ? 'Saving...' : 'Add Employee'}
                    </button>
                </form>
            </div>
        </div>
      )}
    </>
  );
}