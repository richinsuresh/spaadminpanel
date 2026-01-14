// src/app/(protected)/dashboard/packages/activity/page.tsx
'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { OUTLETS } from '@/lib/outlet';
import { exportToExcel } from '@/lib/exportToExcel';
import { ArrowUpRight, ArrowDownLeft, ShieldCheck, Filter, SortAsc, SortDesc } from 'lucide-react'; // Added Icons
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
  package_sold_by: string | null; // Added field
  
  // Verification
  is_verified?: boolean;
};

type ActivityFilter = 'all' | 'purchase' | 'redemption';
type SortOption = 'date_desc' | 'date_asc' | 'amount_desc' | 'amount_asc';

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

/* ===================== MAIN COMPONENT ===================== */

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
  const [activityType, setActivityType] = useState<ActivityFilter>('all'); // New Filter
  const [sortBy, setSortBy] = useState<SortOption>('date_desc'); // New Sort

  /* ===================== FETCH ===================== */

  const fetchActivity = useCallback(async () => {
    setLoading(true);
    
    // 1. Base Query
    let query = supabase
      .from('customers')
      .select('*')
      .gte('date', startDate)
      .lte('date', endDate);

    // 2. Outlet Filter
    if (selectedOutletId !== 'all') {
      query = query.eq('outlet_id', selectedOutletId);
    }

    // 3. Activity Type Filter
    if (activityType === 'purchase') {
      query = query.eq('took_package', true);
    } else if (activityType === 'redemption') {
      query = query.eq('is_package_customer', true);
    } else {
      // Default: 'all' (fetch both)
      query = query.or('took_package.eq.true,is_package_customer.eq.true');
    }

    // 4. Sorting
    switch (sortBy) {
      case 'date_asc':
        query = query.order('date', { ascending: true }).order('check_in_time', { ascending: true });
        break;
      case 'amount_desc':
        // Sort by package_amount (for purchases this is the value)
        query = query.order('package_amount', { ascending: false });
        break;
      case 'amount_asc':
        query = query.order('package_amount', { ascending: true });
        break;
      case 'date_desc':
      default:
        query = query.order('date', { ascending: false }).order('check_in_time', { ascending: false });
        break;
    }

    const { data: rows, error } = await query;
    
    if (error) {
      console.error('Error fetching package activity:', error);
    }
    
    setData((rows as PackageActivity[]) || []);
    setLoading(false);
  }, [startDate, endDate, selectedOutletId, activityType, sortBy]);

  useEffect(() => {
    fetchActivity();
  }, [fetchActivity]);

  // 🔄 Realtime auto-refresh
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

  /* ===================== ACTIONS ===================== */

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

  /* ===================== EXPORT ===================== */

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
      <h1 className="text-2xl font-bold text-gray-800">
        Package Sales & Redemptions
      </h1>

      {/* Filters Container */}
      <div className="bg-white p-4 rounded-xl shadow-sm space-y-4">
        
        {/* Row 1: Primary Filters */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Outlet</label>
            <select
              value={selectedOutletId}
              onChange={(e) => setSelectedOutletId(e.target.value)}
              className="w-full px-3 py-2 border rounded-lg bg-white text-black"
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
              className="w-full px-3 py-2 border rounded-lg text-black bg-white"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">End Date</label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="w-full px-3 py-2 border rounded-lg text-black bg-white"
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
          
          {/* Activity Type Filter */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1 flex items-center gap-1">
              <Filter size={14} /> Activity Type
            </label>
            <select
              value={activityType}
              onChange={(e) => setActivityType(e.target.value as ActivityFilter)}
              className="w-full px-3 py-2 border rounded-lg bg-white text-black"
            >
              <option value="all">All Activity</option>
              <option value="purchase">New Packages Only</option>
              <option value="redemption">Redemptions Only</option>
            </select>
          </div>

          {/* Sorting */}
          <div>
             <label className="block text-sm font-medium text-gray-700 mb-1 flex items-center gap-1">
              {sortBy.includes('asc') ? <SortAsc size={14} /> : <SortDesc size={14} />} Sort By
            </label>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as SortOption)}
              className="w-full px-3 py-2 border rounded-lg bg-white text-black"
            >
              <option value="date_desc">Date (Newest First)</option>
              <option value="date_asc">Date (Oldest First)</option>
              <option value="amount_desc">Sold: Most (High to Low)</option>
              <option value="amount_asc">Sold: Least (Low to High)</option>
            </select>
          </div>
          
          {/* Empty columns to align if needed, or remove */}
          <div className="hidden lg:block lg:col-span-2"></div>
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
                <th className="px-4 py-3 text-left text-xs font-bold text-gray-600 uppercase">Sold By</th> {/* New Column */}
                <th className="px-4 py-3 text-right text-xs font-bold text-gray-600 uppercase">Impact</th>
                <th className="px-4 py-3 text-left text-xs font-bold text-gray-600 uppercase pl-6">Therapist</th>
                <th className="px-4 py-3 text-center text-xs font-bold text-gray-600 uppercase">Status</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {loading ? (
                <tr>
                  <td colSpan={9} className="p-6 text-center text-gray-500">Loading...</td>
                </tr>
              ) : data.length === 0 ? (
                <tr>
                  <td colSpan={9} className="p-6 text-center text-gray-500">No package activity found with current filters.</td>
                </tr>
              ) : (
                data.map((row) => {
                  const isPurchase = row.took_package; 
                  const isRedemption = row.is_package_customer; 
                  const isProcessing = verifyingId === row.id;
                  
                  return (
                    <tr key={row.id} className="hover:bg-gray-50">
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
                      
                      {/* SOLD BY COLUMN */}
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
                      
                      <td className="px-4 py-3 text-sm text-center">
                        {isRedemption && (
                            <button
                                onClick={() => handleToggleVerify(row.id, !!row.is_verified)}
                                disabled={isProcessing}
                                className={`
                                    inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all border
                                    ${row.is_verified 
                                        ? 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100' 
                                        : 'bg-white text-gray-500 border-gray-300 hover:bg-gray-50 hover:text-gray-900 shadow-sm'}
                                    ${isProcessing ? 'opacity-50 cursor-wait' : ''}
                                `}
                            >
                                {isProcessing ? (
                                    '...'
                                ) : row.is_verified ? (
                                    <>
                                        <ShieldCheck size={14} /> Verified
                                    </>
                                ) : (
                                    'Verify'
                                )}
                            </button>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}