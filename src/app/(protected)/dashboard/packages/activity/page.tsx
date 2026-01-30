// src/app/(protected)/dashboard/packages/activity/page.tsx
'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { OUTLETS } from '@/lib/outlet';
import { exportToExcel } from '@/lib/exportToExcel';
import { 
  ArrowUpRight, 
  ArrowDownLeft, 
  ShieldCheck, 
  Filter, 
  SortAsc, 
  SortDesc, 
  Edit2, 
  X, 
  Save, 
  Loader2,
  Calendar,
  User,
  CreditCard,
  Briefcase,
  IndianRupee
} from 'lucide-react';
import { useActivityLog } from '@/hooks/useActivityLog';
import LastAction from '@/components/LastAction';

/* ===================== TYPES ===================== */

type PackageActivity = {
  id: string;
  date: string;
  name: string;
  mobile: string;
  treatment: string;
  
  // Package flags
  took_package: boolean;
  is_package_customer: boolean;
  
  // Amounts / Hours
  amount_paid: number;
  package_amount: number;
  session_hours: number | null;
  
  // Meta
  outlet_name: string;
  outlet_id: string;
  therapist_name: string | null;
  payment_method: string | null;
  check_in_time: string | null;
  package_sold_by: string | null;
  
  // Verification
  is_verified?: boolean;
};

type ActivityFilter = 'all' | 'purchase' | 'redemption';
type SortOption = 'date_desc' | 'date_asc' | 'amount_desc' | 'amount_asc' | 'sold_by_asc' | 'sold_by_desc';

/* ===================== HELPERS ===================== */

const formatCurrency = (v: number) =>
  new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: 0,
  }).format(v / 100);

const formatDuration = (h: number | null | undefined) => {
  if (h === null || h === undefined) return '—';
  const n = Number(h);
  if (n === 0) return '0h';

  const totalMins = Math.round(n * 60);
  const hrs = Math.floor(totalMins / 60);
  const mins = totalMins % 60;

  if (hrs === 0) return `${mins}m`;
  if (mins === 0) return `${hrs}h`;
  return `${hrs}h ${mins}m`;
};

const toInputDate = (d: string | null): string => {
  if (!d) return '';
  const dt = new Date(d);
  return isNaN(dt.getTime()) ? '' : dt.toISOString().split('T')[0];
};

const getToday = () => new Date().toISOString().split('T')[0];

/* ===================== COMPONENT ===================== */

export default function PackageActivityPage() {
  const { logActivity } = useActivityLog();

  const [data, setData] = useState<PackageActivity[]>([]);
  const [loading, setLoading] = useState(true);
  const [isExporting, setIsExporting] = useState(false);
  const [verifyingId, setVerifyingId] = useState<string | null>(null);

  // Filters & Sorting
  const [startDate, setStartDate] = useState<string>(getToday());
  const [endDate, setEndDate] = useState<string>(getToday());
  const [selectedOutletId, setSelectedOutletId] = useState<string>('all');
  const [activityType, setActivityType] = useState<ActivityFilter>('all');
  const [amountFilter, setAmountFilter] = useState<string>(''); 
  const [sortBy, setSortBy] = useState<SortOption>('date_desc');
  
  // NEW: Filter by Sold By
  const [selectedSoldBy, setSelectedSoldBy] = useState<string>('all');

  // Edit Modal State
  const [editingItem, setEditingItem] = useState<PackageActivity | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  
  // Dropdown Lists
  const [allActiveEmployees, setAllActiveEmployees] = useState<string[]>([]); // For "Sold By"
  const [activeTherapists, setActiveTherapists] = useState<string[]>([]);     // For "Therapist"
  
  // Form State for Editing
  const [editForm, setEditForm] = useState({
    package_sold_by: '',
    therapist_name: '',
    payment_method: '',
    date: '',
  });

  /* ===================== FETCH ===================== */

  // Fetch Employees List for Dropdown
  useEffect(() => {
    const fetchEmployees = async () => {
      const { data: empData } = await supabase
        .from('employees')
        .select('name, role')
        .eq('is_active', true)
        .order('name', { ascending: true });
      
      if (empData) {
        const allNames = Array.from(new Set(empData.map((e: any) => e.name)));
        setAllActiveEmployees(allNames);

        const therapistNames = Array.from(new Set(
          empData
            .filter((e: any) => e.role === 'therapist')
            .map((e: any) => e.name)
        ));
        setActiveTherapists(therapistNames);
      }
    };
    fetchEmployees();
  }, []);

  const fetchActivity = useCallback(async () => {
    setLoading(true);
    
    let query = supabase
      .from('customers')
      .select('*')
      .gte('date', startDate)
      .lte('date', endDate);

    if (selectedOutletId !== 'all') {
      query = query.eq('outlet_id', selectedOutletId);
    }

    // NEW: Filter by specific "Sold By" employee
    if (selectedSoldBy !== 'all') {
      query = query.eq('package_sold_by', selectedSoldBy);
    }

    // Amount Filter Logic (Typable)
    if (amountFilter) {
      const amountInPaise = parseFloat(amountFilter) * 100;
      if (!isNaN(amountInPaise)) {
        query = query.eq('package_amount', amountInPaise);
      }
    }

    if (activityType === 'purchase') {
      query = query.eq('took_package', true);
    } else if (activityType === 'redemption') {
      query = query.eq('is_package_customer', true);
    } else {
      query = query.or('took_package.eq.true,is_package_customer.eq.true');
    }

    switch (sortBy) {
      case 'date_asc':
        query = query.order('date', { ascending: true }).order('check_in_time', { ascending: true });
        break;
      case 'amount_desc':
        query = query.order('package_amount', { ascending: false });
        break;
      case 'amount_asc':
        query = query.order('package_amount', { ascending: true });
        break;
      case 'sold_by_asc':
        query = query.order('package_sold_by', { ascending: true });
        break;
      case 'sold_by_desc':
        query = query.order('package_sold_by', { ascending: false });
        break;
      case 'date_desc':
      default:
        query = query.order('date', { ascending: false }).order('check_in_time', { ascending: false });
        break;
    }

    const { data: rows, error } = await query;
    if (error) console.error('Error fetching package activity:', error);
    setData((rows as PackageActivity[]) || []);
    setLoading(false);
  }, [startDate, endDate, selectedOutletId, activityType, amountFilter, sortBy, selectedSoldBy]);

  useEffect(() => {
    fetchActivity();
  }, [fetchActivity]);

  useEffect(() => {
    const channel = supabase
      .channel('admin-package-activity')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'customers' },
        () => fetchActivity(),
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchActivity]);

  /* ===================== HANDLERS ===================== */

  const handleToggleVerify = async (id: string, currentStatus: boolean) => {
    setVerifyingId(id);
    try {
        const newStatus = !currentStatus;
        const { error } = await supabase
            .from('customers')
            .update({ is_verified: newStatus })
            .eq('id', id);

        if (error) throw error;

        setData(prev => prev.map(item => 
            item.id === id ? { ...item, is_verified: newStatus } : item
        ));

        if (newStatus) {
            logActivity('verify_redemption', `Verified package redemption for ID ${id}`);
        }
    } catch (err) {
        console.error("Failed to verify:", err);
        alert("Failed to update status");
    } finally {
        setVerifyingId(null);
    }
  };

  const handleEditClick = (item: PackageActivity) => {
    setEditingItem(item);
    setEditForm({
      package_sold_by: item.package_sold_by || '',
      therapist_name: item.therapist_name || '',
      payment_method: item.payment_method || '',
      date: item.date || '',
    });
  };

  const handleSaveEdit = async () => {
    if (!editingItem) return;
    setIsSaving(true);

    try {
      const { error } = await supabase
        .from('customers')
        .update({
          package_sold_by: editForm.package_sold_by,
          therapist_name: editForm.therapist_name,
          payment_method: editForm.payment_method,
          date: editForm.date,
        })
        .eq('id', editingItem.id);

      if (error) throw error;

      setData(prev => prev.map(item => 
        item.id === editingItem.id ? {
          ...item,
          package_sold_by: editForm.package_sold_by,
          therapist_name: editForm.therapist_name,
          payment_method: editForm.payment_method,
          date: editForm.date,
        } : item
      ));

      logActivity('edit_package_activity', `Edited package activity for ${editingItem.name}`);
      setEditingItem(null); 
    } catch (err) {
      console.error("Failed to update:", err);
      alert("Failed to save changes.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleExport = async () => {
    if (data.length === 0) {
      alert('No data to export.');
      return;
    }
    setIsExporting(true);
    try {
      const rows = data.map(row => {
        const isPurchase = row.took_package;
        const type = isPurchase ? 'New Package' : 'Redemption';
        return {
          Date: row.date,
          Outlet: row.outlet_name,
          Customer: row.name,
          Mobile: row.mobile,
          Type: type,
          Treatment: row.treatment,
          'Sold By': row.package_sold_by || '',
          'Hours Used': !isPurchase ? row.session_hours : 0,
          'Amount Paid': isPurchase ? (row.package_amount / 100) : 0,
          Therapist: row.therapist_name,
          Payment: row.payment_method?.toUpperCase() || '',
          Verified: row.is_verified ? 'Yes' : 'No'
        };
      });
      exportToExcel(rows, `Package_Activity_${startDate}_to_${endDate}.xlsx`);
      logActivity('export_package_activity', 'Downloaded Package Activity Report');
    } catch (e) {
      console.error(e);
      alert('Export failed');
    } finally {
      setIsExporting(false);
    }
  };

  /* ===================== UI ===================== */

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold text-gray-800">
          Package Sales & Redemptions
        </h1>
      </div>

      {/* Filters Container */}
      <div className="bg-white p-4 rounded-xl shadow-sm space-y-4">
        {/* Row 1: Primary Filters */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Outlet</label>
            <select
              value={selectedOutletId}
              onChange={(e) => setSelectedOutletId(e.target.value)}
              className="w-full px-3 py-2 border rounded-lg bg-white text-gray-900"
            >
              <option value="all">All Outlets</option>
              {OUTLETS.map((o) => (
                <option key={o.id} value={o.id}>{o.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Start Date</label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="w-full px-3 py-2 border rounded-lg text-gray-900 bg-white"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">End Date</label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="w-full px-3 py-2 border rounded-lg text-gray-900 bg-white"
            />
          </div>
           <div className="flex items-end">
            <button
              onClick={handleExport}
              disabled={loading || isExporting}
              className="w-full px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 transition-colors"
            >
              {isExporting ? 'Exporting…' : 'Export to Excel'}
            </button>
          </div>
        </div>

        {/* Row 2: Secondary Filters & Sort */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 border-t pt-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1 flex items-center gap-1">
              <Filter size={14} /> Activity Type
            </label>
            <select
              value={activityType}
              onChange={(e) => setActivityType(e.target.value as ActivityFilter)}
              className="w-full px-3 py-2 border rounded-lg bg-white text-gray-900"
            >
              <option value="all">All Activity</option>
              <option value="purchase">New Packages Only</option>
              <option value="redemption">Redemptions Only</option>
            </select>
          </div>
          
          {/* Typable Amount Input */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1 flex items-center gap-1">
              <IndianRupee size={14} /> Package Amount
            </label>
            <input
              type="number"
              value={amountFilter}
              onChange={(e) => setAmountFilter(e.target.value)}
              placeholder="e.g. 5000"
              className="w-full px-3 py-2 border rounded-lg bg-white text-gray-900 focus:ring-2 focus:ring-blue-100 outline-none transition-all placeholder:text-gray-400"
            />
          </div>

          {/* NEW: Filter by Sold By */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1 flex items-center gap-1">
              <Briefcase size={14} /> Sold By Filter
            </label>
            <select
              value={selectedSoldBy}
              onChange={(e) => setSelectedSoldBy(e.target.value)}
              className="w-full px-3 py-2 border rounded-lg bg-white text-gray-900"
            >
              <option value="all">All Staff</option>
              {allActiveEmployees.map((name) => (
                <option key={name} value={name}>{name}</option>
              ))}
            </select>
          </div>
          
          <div>
             <label className="block text-sm font-medium text-gray-700 mb-1 flex items-center gap-1">
              {sortBy.includes('asc') ? <SortAsc size={14} /> : <SortDesc size={14} />} Sort By
            </label>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as SortOption)}
              className="w-full px-3 py-2 border rounded-lg bg-white text-gray-900"
            >
              <option value="date_desc">Date (Newest First)</option>
              <option value="date_asc">Date (Oldest First)</option>
              <option value="amount_desc">Sold: Most (High to Low)</option>
              <option value="amount_asc">Sold: Least (Low to High)</option>
              <option value="sold_by_asc">Employee: Name (A-Z)</option>
              <option value="sold_by_desc">Employee: Name (Z-A)</option>
            </select>
          </div>
        </div>
        <LastAction actionType="export_package_activity" />
      </div>

      {/* Table */}
      <div className="bg-white shadow rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-bold text-gray-600 uppercase">Date</th>
                <th className="px-4 py-3 text-left text-xs font-bold text-gray-600 uppercase">Customer</th>
                <th className="px-4 py-3 text-left text-xs font-bold text-gray-600 uppercase">Outlet</th>
                <th className="px-4 py-3 text-left text-xs font-bold text-gray-600 uppercase">Type</th>
                <th className="px-4 py-3 text-left text-xs font-bold text-gray-600 uppercase">Details</th>
                <th className="px-4 py-3 text-left text-xs font-bold text-gray-600 uppercase">Sold By</th>
                <th className="px-4 py-3 text-right text-xs font-bold text-gray-600 uppercase">Impact</th>
                <th className="px-4 py-3 text-left text-xs font-bold text-gray-600 uppercase pl-6">Therapist</th>
                <th className="px-4 py-3 text-center text-xs font-bold text-gray-600 uppercase">Action</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {loading ? (
                <tr>
                  <td colSpan={9} className="p-6 text-center text-gray-500">Loading...</td>
                </tr>
              ) : data.length === 0 ? (
                <tr>
                  <td colSpan={9} className="p-6 text-center text-gray-500">No package activity found.</td>
                </tr>
              ) : (
                data.map((row) => {
                  const isPurchase = row.took_package; 
                  const isRedemption = row.is_package_customer; 
                  const isProcessing = verifyingId === row.id;
                  
                  return (
                    <tr key={row.id} className="hover:bg-gray-50 group">
                      <td className="px-4 py-3 text-sm text-gray-900 whitespace-nowrap">
                        {toInputDate(row.date)}
                      </td>
                      <td className="px-4 py-3 text-sm">
                        <div className="font-medium text-gray-900">{row.name}</div>
                        <div className="text-gray-500 text-xs">{row.mobile}</div>
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-500">
                        {row.outlet_name}
                      </td>
                      <td className="px-4 py-3 text-sm">
                        {isPurchase ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                            <ArrowDownLeft size={12} />
                            Purchase
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-indigo-100 text-indigo-800">
                            <ArrowUpRight size={12} />
                            Redemption
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-700">
                        {row.treatment}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-600 font-medium">
                        {row.package_sold_by || '—'}
                      </td>
                      <td className="px-4 py-3 text-sm text-right font-medium">
                        {isPurchase ? (
                          <div className="text-green-600">
                            {formatCurrency(row.package_amount)}
                          </div>
                        ) : (
                          <div className="text-gray-600">
                            - {formatDuration(row.session_hours)}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-500 pl-6">
                        {row.therapist_name || '—'}
                      </td>
                      
                      {/* ACTION COLUMN */}
                      <td className="px-4 py-3 text-sm text-center">
                        <div className="flex items-center justify-center gap-2">
                          <button
                            onClick={() => handleEditClick(row)}
                            className="p-1.5 rounded-md hover:bg-gray-100 text-gray-500 hover:text-blue-600 transition-colors"
                            title="Edit Details"
                          >
                            <Edit2 size={16} />
                          </button>

                          {isRedemption && (
                            <button
                                onClick={() => handleToggleVerify(row.id, !!row.is_verified)}
                                disabled={isProcessing}
                                title={row.is_verified ? "Unverify" : "Verify"}
                                className={`
                                    p-1.5 rounded-md transition-colors
                                    ${row.is_verified 
                                        ? 'bg-emerald-50 text-emerald-600' 
                                        : 'text-gray-400 hover:text-emerald-600 hover:bg-emerald-50'}
                                    ${isProcessing ? 'opacity-50 cursor-wait' : ''}
                                `}
                            >
                                {isProcessing ? <Loader2 size={16} className="animate-spin" /> : <ShieldCheck size={16} />}
                            </button>
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

      {/* ENHANCED EDIT MODAL */}
      {editingItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 transition-opacity duration-300">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden flex flex-col max-h-[90vh] animate-in fade-in zoom-in-95 duration-200">
            
            {/* Modal Header */}
            <div className="px-6 py-4 border-b border-gray-100 flex justify-between items-center bg-gray-50/50">
              <div>
                <h3 className="text-lg font-bold text-gray-800">Edit Activity Details</h3>
                <p className="text-xs text-gray-500 mt-0.5">Update transaction information for {editingItem.name}</p>
              </div>
              <button 
                onClick={() => setEditingItem(null)}
                className="p-2 bg-white rounded-full text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-all border border-transparent hover:border-gray-200"
              >
                <X size={18} />
              </button>
            </div>
            
            {/* Modal Body */}
            <div className="p-6 space-y-5 overflow-y-auto">
              
              {/* Row 1: Date & Payment */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-gray-500 uppercase flex items-center gap-1.5">
                    <Calendar size={12} /> Date
                  </label>
                  <input
                    type="date"
                    value={editForm.date}
                    onChange={e => setEditForm({ ...editForm, date: e.target.value })}
                    className="w-full px-3 py-2.5 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-100 focus:border-blue-500 outline-none text-sm transition-all bg-gray-50/30 hover:bg-white text-gray-900"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-gray-500 uppercase flex items-center gap-1.5">
                    <CreditCard size={12} /> Payment Method
                  </label>
                  <select
                    value={editForm.payment_method}
                    onChange={e => setEditForm({ ...editForm, payment_method: e.target.value })}
                    className="w-full px-3 py-2.5 border border-gray-200 rounded-lg bg-gray-50/30 hover:bg-white focus:ring-2 focus:ring-blue-100 focus:border-blue-500 outline-none text-sm transition-all text-gray-900"
                  >
                    <option value="">Select Method</option>
                    <option value="cash">Cash</option>
                    <option value="upi">UPI</option>
                    <option value="card">Card</option>
                    <option value="split">Split</option>
                    <option value="complimentary">Complimentary</option>
                  </select>
                </div>
              </div>

              {/* Row 2: Sales Person (DROPDOWN) - Shows ALL ACTIVE Staff */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-gray-500 uppercase flex items-center gap-1.5">
                   <Briefcase size={12} /> Sold By (Staff Name)
                </label>
                <div className="relative">
                  <select
                    value={editForm.package_sold_by}
                    onChange={e => setEditForm({ ...editForm, package_sold_by: e.target.value })}
                    className="w-full px-3 py-2.5 border border-gray-200 rounded-lg bg-gray-50/30 hover:bg-white focus:ring-2 focus:ring-blue-100 focus:border-blue-500 outline-none text-sm transition-all appearance-none text-gray-900"
                  >
                    <option value="">-- Select Staff --</option>
                    {allActiveEmployees.map((empName) => (
                      <option key={empName} value={empName}>
                        {empName}
                      </option>
                    ))}
                  </select>
                  <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-gray-500">
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6"/></svg>
                  </div>
                </div>
              </div>

              {/* Row 3: Therapist Dropdown - Shows ONLY ACTIVE THERAPISTS */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-gray-500 uppercase flex items-center gap-1.5">
                  <User size={12} /> Therapist
                </label>
                <div className="relative">
                  <select
                    value={editForm.therapist_name}
                    onChange={e => setEditForm({ ...editForm, therapist_name: e.target.value })}
                    className="w-full px-3 py-2.5 border border-gray-200 rounded-lg bg-gray-50/30 hover:bg-white focus:ring-2 focus:ring-blue-100 focus:border-blue-500 outline-none text-sm transition-all appearance-none text-gray-900"
                  >
                    <option value="">-- Select Therapist --</option>
                    {activeTherapists.map((therapist) => (
                      <option key={therapist} value={therapist}>
                        {therapist}
                      </option>
                    ))}
                  </select>
                  <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-gray-500">
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6"/></svg>
                  </div>
                </div>
              </div>

            </div>

            {/* Modal Footer */}
            <div className="px-6 py-4 border-t border-gray-100 bg-gray-50 flex justify-end gap-3">
              <button
                onClick={() => setEditingItem(null)}
                className="px-4 py-2 text-sm font-medium text-gray-600 hover:text-gray-800 hover:bg-gray-200/50 rounded-lg transition-colors"
                disabled={isSaving}
              >
                Cancel
              </button>
              <button
                onClick={handleSaveEdit}
                disabled={isSaving}
                className="flex items-center gap-2 px-5 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 active:bg-blue-800 transition-colors text-sm font-medium shadow-sm hover:shadow-md disabled:opacity-70 disabled:shadow-none"
              >
                {isSaving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                Save Changes
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}