'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { OUTLETS } from '@/lib/outlet';
import { useRouter } from 'next/navigation';
import { 
    Loader2, Search, Filter, History, 
    Package, X, Calendar, MapPin, 
    Clock, Tag, ChevronRight, ExternalLink,
    AlertCircle, CheckCircle
} from 'lucide-react';

// --- Types ---
type CustomerVisit = {
  id: string;
  name: string;
  mobile: string;
  date: string;
  treatment: string;
  session_hours: number;
  outlet_name: string;
  therapist_name?: string;
  // Package Data (Merged for Table View)
  active_package?: string | null;
  remaining_hours?: number | null;
  package_status?: string | null;
  total_hours?: number | null;
  used_hours?: number | null;
};

type HistoryRow = {
    id: string;
    date: string | null;
    eventType: 'visit' | 'package_purchase' | 'audit_log';
    name: string;
    description: string;
    amount: number | null;
    outlet_name: string | null;
    staff_name: string | null;
    status?: string | null;
    total_hours?: number | null;
    used_hours?: number | null;
    remaining_hours?: number | null;
    session_hours?: number | null;
    is_package_redemption?: boolean;
};

type PackageSummary = {
    hasPackage: boolean;
    name: string;
    status: string;
    startDate: string | null;
    expiryDate: string | null;
    totalHours: number;
    usedHours: number;
    remainingHours: number;
    value: number;
};

// --- Helpers ---
const formatDate = (dateString: string | null) => {
  if (!dateString) return '—';
  return new Date(dateString).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
};

const pickBestPackage = (pkgs: any[]) => {
    if (!pkgs || pkgs.length === 0) return null;
    const active = pkgs.find((p) => String((p.status ?? '')).toLowerCase() === 'active');
    if (active) return active;
    const sorted = pkgs.slice().sort((a, b) => {
      const ta = a.expiry_date ? new Date(a.expiry_date).getTime() : a.created_at ? new Date(a.created_at).getTime() : 0;
      const tb = b.expiry_date ? new Date(b.expiry_date).getTime() : b.created_at ? new Date(b.created_at).getTime() : 0;
      return tb - ta;
    });
    return sorted[0] ?? pkgs[0];
};

const toNum = (v: any) => (v === undefined || v === null || v === '' ? 0 : Number(v));

export default function CustomersPage() {
  const router = useRouter();
  
  // Data State
  const [uniqueCustomers, setUniqueCustomers] = useState<CustomerVisit[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Filter State
  const [searchTerm, setSearchTerm] = useState('');
  const [outletFilter, setOutletFilter] = useState('all');

  // Modal State
  const [selectedCustomer, setSelectedCustomer] = useState<CustomerVisit | null>(null);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [customerHistory, setCustomerHistory] = useState<HistoryRow[]>([]);
  const [pkgSummary, setPkgSummary] = useState<PackageSummary | null>(null);

  const outlets = ['all', ...OUTLETS.map(o => o.name)];

  // --- Fetch Main List ---
  const fetchCustomers = async () => {
    try {
      setLoading(true);
      
      const { data: visitData, error: visitError } = await supabase
        .from('customers')
        .select('id, name, mobile, date, treatment, session_hours, outlet_name, therapist_name')
        .order('date', { ascending: false });
      
      if (visitError) throw visitError;

      const { data: packageData, error: pkgError } = await supabase.from('packages').select('*');
      if (pkgError) throw pkgError;

      const pkgMap: Record<string, any[]> = {};
      (packageData || []).forEach((p: any) => {
          if (!p.mobile) return;
          if (!pkgMap[p.mobile]) pkgMap[p.mobile] = [];
          pkgMap[p.mobile].push(p);
      });

      const visitMap = new Map<string, CustomerVisit>();
      (visitData as any[] || []).forEach((v) => {
          const existing = visitMap.get(v.mobile);
          if (!existing) { visitMap.set(v.mobile, v); } 
      });

      const mergedList: CustomerVisit[] = Array.from(visitMap.values()).map(cust => {
          const userPkgs = pkgMap[cust.mobile] || [];
          const bestPkg = pickBestPackage(userPkgs);

          if (bestPkg) {
              const total = toNum(bestPkg.total_hours || bestPkg.totalHours);
              const used = toNum(bestPkg.used_hours || bestPkg.usedHours);
              const remaining = Math.max(0, total - used);
              
              return {
                  ...cust,
                  active_package: bestPkg.package_name || bestPkg.name,
                  package_status: bestPkg.status,
                  total_hours: total,
                  used_hours: used,
                  remaining_hours: remaining
              };
          }
          return cust;
      });

      setUniqueCustomers(mergedList);
    } catch (err) {
      console.error('Error fetching customers:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCustomers();
  }, []);

  // --- Fetch Modal Data ---
  const fetchCustomerHistory = useCallback(async (mobile: string) => {
      setHistoryLoading(true);
      setCustomerHistory([]);
      setPkgSummary(null);

      try {
          // 1. Fetch Raw Data
          const { data: visits } = await supabase.from('customers').select('*').eq('mobile', mobile);
          const { data: pkgs } = await supabase.from('packages').select('*').eq('mobile', mobile);
          
          // 2. Calculate Package Summary Stats (Best Package Logic)
          if (pkgs && pkgs.length > 0) {
              const bestPkg = pickBestPackage(pkgs);
              const total = toNum(bestPkg.total_hours || bestPkg.totalHours);
              const used = toNum(bestPkg.used_hours || bestPkg.usedHours);
              
              // Recalculate used based on actual visits if needed, but trusting DB for now
              const dbRemaining = Math.max(0, total - used);

              setPkgSummary({
                  hasPackage: true,
                  name: bestPkg.package_name || bestPkg.name || 'Unnamed Package',
                  status: bestPkg.status || 'Active',
                  startDate: bestPkg.created_at || null,
                  expiryDate: bestPkg.expiry_date || null,
                  totalHours: total,
                  usedHours: used,
                  remainingHours: dbRemaining,
                  value: toNum(bestPkg.package_amount || bestPkg.amount)
              });
          } else {
              setPkgSummary({ hasPackage: false } as PackageSummary);
          }

          // 3. Normalize History Rows
          const normalizedVisits: HistoryRow[] = (visits || []).map((v: any) => ({
              id: v.id,
              date: v.date || v.created_at,
              eventType: 'visit',
              name: v.treatment || 'Visit',
              description: v.treatment,
              amount: v.amount_paid,
              outlet_name: v.outlet_name || v.outlet,
              staff_name: v.therapist_name,
              status: 'completed',
              session_hours: v.session_hours,
              is_package_redemption: !!(v.took_package || v.is_package_customer)
          }));

          const normalizedPkgs: HistoryRow[] = (pkgs || []).map((p: any) => ({
            id: p.id,
            date: p.created_at,
            eventType: 'package_purchase',
            name: p.package_name || 'Package',
            description: `Purchase: ${p.package_name}`,
            amount: p.package_amount || p.amount,
            outlet_name: p.outlet_name || p.outlet,
            staff_name: p.employee_name || p.sold_by,
            status: p.status,
            total_hours: toNum(p.total_hours),
            used_hours: toNum(p.used_hours),
            remaining_hours: Math.max(0, toNum(p.total_hours) - toNum(p.used_hours))
        }));

        const combined = [...normalizedVisits, ...normalizedPkgs].sort((a,b) => 
            new Date(b.date || 0).getTime() - new Date(a.date || 0).getTime()
        );

        setCustomerHistory(combined);

      } catch (e) {
          console.error(e);
      } finally {
          setHistoryLoading(false);
      }
  }, []);

  const handleOpenHistory = (e: React.MouseEvent, cust: CustomerVisit) => {
      e.stopPropagation(); 
      setSelectedCustomer(cust);
      fetchCustomerHistory(cust.mobile);
  };

  // --- Filtering ---
  const filteredCustomers = uniqueCustomers.filter(customer => {
    const matchesSearch = !searchTerm || 
      customer.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      customer.mobile.includes(searchTerm);
    const matchesOutlet = outletFilter === 'all' || customer.outlet_name === outletFilter;
    return matchesSearch && matchesOutlet;
  });

  return (
    <div className="min-h-screen bg-gray-50/50 p-4 lg:p-6">
      {/* Header & Filter Controls (Same as before) */}
      <div className="flex flex-col lg:flex-row lg:justify-between lg:items-center mb-6 gap-4">
        <div><h1 className="text-2xl font-bold text-gray-800 tracking-tight">Customer Directory</h1><p className="text-gray-500 text-sm mt-1">Manage clients, view balances, and track history</p></div>
        <div className="flex flex-wrap gap-3"><button onClick={fetchCustomers} className="px-4 py-2 bg-white border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors flex items-center gap-2 shadow-sm font-medium"><History size={16} /> Refresh</button><Link href="/form" className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-all shadow-md hover:shadow-lg flex items-center gap-2 font-medium"><span>+</span> Add Customer</Link></div>
      </div>
      <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-200 mb-6 sticky top-0 z-10">
        <div className="flex flex-col md:flex-row gap-4">
          <div className="flex-1 relative"><Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} /><input type="text" placeholder="Search by name or mobile number..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="w-full pl-10 pr-4 py-2.5 bg-gray-50 border border-gray-200 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none transition-all" /></div>
          <div className="w-full md:w-64 relative"><Filter className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} /><select value={outletFilter} onChange={(e) => setOutletFilter(e.target.value)} className="w-full pl-10 pr-4 py-2.5 bg-gray-50 border border-gray-200 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none appearance-none cursor-pointer">{outlets.map(outlet => (<option key={outlet} value={outlet}>{outlet === 'all' ? 'All Outlets' : outlet}</option>))}</select></div>
        </div>
      </div>

      {/* Main Table (Same as before) */}
      {loading ? (
        <div className="flex flex-col items-center justify-center py-20 bg-white rounded-xl border border-gray-100 shadow-sm"><Loader2 className="w-10 h-10 text-indigo-600 animate-spin mb-4" /><p className="text-gray-500 font-medium">Loading customer database...</p></div>
      ) : (
        <div className="bg-white shadow-sm border border-gray-200 rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-100">
              <thead className="bg-gray-50/80">
                <tr>
                  <th className="px-6 py-4 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Client Details</th>
                  <th className="px-6 py-4 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Latest Visit</th>
                  <th className="px-6 py-4 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Active Package</th>
                  <th className="px-6 py-4 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Package Stats</th>
                  <th className="px-6 py-4 text-right text-xs font-bold text-gray-500 uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-100">
                {filteredCustomers.map((customer) => (
                  <tr key={customer.id} onClick={() => router.push(`/dashboard/customers/${customer.mobile}`)} className="hover:bg-indigo-50/30 cursor-pointer transition-colors group">
                    <td className="px-6 py-4 whitespace-nowrap"><div className="flex flex-col"><span className="text-sm font-bold text-gray-900 group-hover:text-indigo-600 transition-colors">{customer.name}</span><span className="text-xs text-gray-500 font-mono mt-0.5">{customer.mobile}</span></div></td>
                    <td className="px-6 py-4 whitespace-nowrap"><div className="flex flex-col"><span className="text-sm text-gray-700 font-medium">{formatDate(customer.date)}</span><div className="flex items-center gap-1 text-xs text-gray-500 mt-0.5"><MapPin size={10} />{customer.outlet_name}</div></div></td>
                    <td className="px-6 py-4 whitespace-nowrap">{customer.active_package ? (<span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${customer.package_status === 'active' ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-600'}`}>{customer.active_package}</span>) : (<span className="text-xs text-gray-400 italic">No Active Package</span>)}</td>
                    <td className="px-6 py-4 whitespace-nowrap">{customer.total_hours && customer.total_hours > 0 ? (<div className="flex flex-col gap-1"><div className="flex items-center gap-2 text-xs"><span className="font-bold text-green-600 bg-green-50 px-1.5 py-0.5 rounded border border-green-100">{customer.remaining_hours}h Left</span><span className="font-bold text-indigo-600 bg-indigo-50 px-1.5 py-0.5 rounded border border-indigo-100">{customer.used_hours}h Used</span></div><span className="text-[10px] text-gray-400 font-medium pl-0.5">Total: {customer.total_hours}h</span></div>) : (<span className="text-sm text-gray-300">—</span>)}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-right"><div className="flex items-center justify-end gap-2"><button onClick={(e) => handleOpenHistory(e, customer)} className="px-3 py-1.5 text-xs font-semibold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 rounded-md transition-all shadow-sm flex items-center gap-1"><History size={14} className="text-indigo-600"/> Show History</button><ChevronRight size={18} className="text-gray-300 group-hover:text-indigo-400 group-hover:translate-x-1 transition-all" /></div></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* --- RICH HISTORY MODAL --- */}
      {selectedCustomer && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 backdrop-blur-sm" onClick={() => setSelectedCustomer(null)}>
            <div className="bg-gray-50 rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200" onClick={e => e.stopPropagation()}>
                
                {/* 1. Modal Header */}
                <div className="bg-white px-8 py-6 border-b border-gray-100 flex justify-between items-start">
                    <div className="flex items-center gap-4">
                        <div className="h-12 w-12 rounded-full bg-green-100 text-green-600 flex items-center justify-center text-xl font-bold">
                            {selectedCustomer.name.charAt(0).toUpperCase()}
                        </div>
                        <div>
                            <h2 className="text-2xl font-bold text-gray-900 capitalize">{selectedCustomer.name}</h2>
                            <div className="flex items-center gap-3 mt-1">
                                <span className="text-sm text-gray-500 font-mono bg-gray-100 px-2 py-0.5 rounded">{selectedCustomer.mobile}</span>
                                <span className="text-sm text-gray-400 flex items-center gap-1"><MapPin size={12}/> {selectedCustomer.outlet_name}</span>
                            </div>
                        </div>
                    </div>
                    
                    <div className="text-right">
                         {pkgSummary?.hasPackage && (
                            <>
                                <div className="text-xs text-gray-400 font-bold uppercase tracking-wider mb-1">Package Value</div>
                                <div className="text-xl font-bold text-gray-800">₹{(pkgSummary.value / 100).toLocaleString('en-IN')}</div>
                                <div className="text-xs text-red-500 font-medium mt-1">Expires on {formatDate(pkgSummary.expiryDate)}</div>
                            </>
                         )}
                         <button onClick={() => setSelectedCustomer(null)} className="absolute top-4 right-4 p-2 hover:bg-gray-100 rounded-full text-gray-400 hover:text-gray-600 transition-colors">
                            <X size={24} />
                        </button>
                    </div>
                </div>

                {/* 2. Scrollable Content Area */}
                <div className="flex-1 overflow-y-auto p-8 space-y-8">
                    
                    {historyLoading ? (
                        <div className="flex flex-col items-center justify-center h-48 space-y-3">
                            <Loader2 className="w-8 h-8 text-indigo-600 animate-spin" />
                            <p className="text-gray-500 text-sm">Loading complete history...</p>
                        </div>
                    ) : (
                        <>
                            {/* SECTION: PACKAGE SUMMARY CARDS */}
                            {pkgSummary?.hasPackage && (
                                <div className="space-y-6">
                                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                        {/* Status Card */}
                                        <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100">
                                            <div className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Status</div>
                                            <div className="text-lg font-bold text-green-600 flex items-center gap-2">
                                                {pkgSummary.status.toUpperCase()} <CheckCircle size={18} />
                                            </div>
                                        </div>
                                        {/* Start Date Card */}
                                        <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100">
                                            <div className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Start Date</div>
                                            <div className="text-lg font-bold text-gray-800">
                                                {formatDate(pkgSummary.startDate)}
                                            </div>
                                        </div>
                                        {/* Remaining Hours Card */}
                                        <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100 bg-gradient-to-br from-white to-blue-50">
                                            <div className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Remaining Hours</div>
                                            <div className="text-2xl font-bold text-indigo-700">
                                                {pkgSummary.remainingHours}h
                                            </div>
                                        </div>
                                    </div>

                                    {/* Progress Bar */}
                                    <div className="bg-white p-5 rounded-xl shadow-sm border border-gray-100">
                                        <div className="flex justify-between items-end mb-2">
                                            <h3 className="text-sm font-semibold text-gray-700">Usage Progress</h3>
                                            <span className="text-sm font-bold text-gray-900">{pkgSummary.usedHours}h / {pkgSummary.totalHours}h</span>
                                        </div>
                                        <div className="w-full bg-gray-100 rounded-full h-3 overflow-hidden">
                                            <div 
                                                className="bg-blue-600 h-full rounded-full transition-all duration-500 ease-out"
                                                style={{ width: `${Math.min(100, (pkgSummary.usedHours / pkgSummary.totalHours) * 100)}%` }}
                                            />
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* SECTION: VISIT HISTORY TABLE */}
                            <div>
                                <div className="flex justify-between items-center mb-4">
                                    <h3 className="text-lg font-bold text-gray-800">Visit History</h3>
                                    <Link 
                                        href={`/dashboard/customers/${selectedCustomer.mobile}`}
                                        className="text-sm font-medium text-indigo-600 hover:text-indigo-800 flex items-center gap-1 hover:underline"
                                    >
                                        Full Edit Mode <ExternalLink size={14} />
                                    </Link>
                                </div>
                                
                                <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                                    {customerHistory.length === 0 ? (
                                        <div className="p-8 text-center text-gray-400 italic">No visits recorded yet.</div>
                                    ) : (
                                        <table className="w-full text-left">
                                            <thead className="bg-gray-50 border-b border-gray-100">
                                                <tr>
                                                    <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase tracking-wider">Date & Time</th>
                                                    <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase tracking-wider">Treatment</th>
                                                    <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase tracking-wider">Duration</th>
                                                    <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase tracking-wider">Therapist</th>
                                                    <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase tracking-wider">Outlet</th>
                                                    <th className="px-6 py-4 text-right text-xs font-bold text-gray-500 uppercase tracking-wider">Amount</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-gray-100">
                                                {customerHistory.map(item => (
                                                    <tr key={item.id} className="hover:bg-gray-50/50 transition-colors">
                                                        <td className="px-6 py-4">
                                                            <div className="flex flex-col">
                                                                <span className="font-bold text-gray-800 text-sm">{formatDate(item.date)}</span>
                                                                <span className="text-xs text-gray-400">
                                                                    {new Date(item.date || '').toLocaleTimeString('en-US', {hour: 'numeric', minute: '2-digit', hour12: true})}
                                                                </span>
                                                            </div>
                                                        </td>
                                                        <td className="px-6 py-4">
                                                            <div className="flex items-center gap-2">
                                                                <span className="text-sm font-medium text-gray-800">{item.name}</span>
                                                                {item.is_package_redemption && (
                                                                    <span className="bg-green-100 text-green-700 text-[10px] font-bold px-2 py-0.5 rounded-full uppercase">Package</span>
                                                                )}
                                                                {item.eventType === 'package_purchase' && (
                                                                    <span className="bg-blue-100 text-blue-700 text-[10px] font-bold px-2 py-0.5 rounded-full uppercase">Purchased</span>
                                                                )}
                                                            </div>
                                                            {item.is_package_redemption && <span className="text-xs text-green-600 font-medium bg-green-50 px-1 rounded mt-1 inline-block">Redeemed</span>}
                                                        </td>
                                                        <td className="px-6 py-4 text-sm font-medium text-gray-600">
                                                            {item.session_hours ? `${item.session_hours}h` : item.total_hours ? `${item.total_hours}h` : '—'}
                                                        </td>
                                                        <td className="px-6 py-4 text-sm text-gray-600 capitalize">
                                                            {item.staff_name || '—'}
                                                        </td>
                                                        <td className="px-6 py-4 text-sm text-gray-500">
                                                            {item.outlet_name}
                                                        </td>
                                                        <td className="px-6 py-4 text-right text-sm font-mono font-medium text-gray-800">
                                                            {item.amount ? `₹${(item.amount / 100).toLocaleString('en-IN')}` : '—'}
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    )}
                                </div>
                            </div>
                        </>
                    )}
                </div>
                
                {/* 3. Footer Actions */}
                <div className="bg-gray-50 border-t border-gray-200 p-4 flex justify-end gap-3">
                    <button onClick={() => setSelectedCustomer(null)} className="px-5 py-2.5 bg-white border border-gray-300 text-gray-700 font-medium rounded-lg hover:bg-gray-100 transition-colors">Close</button>
                    <Link href={`/dashboard/customers/${selectedCustomer.mobile}`} className="px-5 py-2.5 bg-indigo-600 text-white font-bold rounded-lg hover:bg-indigo-700 transition-colors shadow-sm flex items-center gap-2">
                        View Full Details & Edit <ChevronRight size={16} />
                    </Link>
                </div>
            </div>
        </div>
      )}
    </div>
  );
}