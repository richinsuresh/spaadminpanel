'use client';

import { useState, useEffect, useCallback, FormEvent } from 'react';
import { supabase } from '@/lib/supabase';
import { OUTLETS } from '@/lib/outlet';
import { exportToExcel } from '@/lib/exportToExcel';
import { User, Calendar as CalendarIcon, CheckSquare, Square } from 'lucide-react'; // Added icons
import { useActivityLog } from '@/hooks/useActivityLog';

/* ===================== TYPES ===================== */

type PackageCustomer = {
  id: string;
  name: string;
  mobile: string;
  package_amount: number;
  total_hours: number;
  used_hours: number;
  remaining_hours: number;
  start_date: string | null;
  expiry_date: string | null;
  status: 'active' | 'expired' | string;
  outlet: string;
  created_at?: string | null;
};

// Same structure idea as search page, but minimal for this page
type HistoryRow = {
  id: string;
  date: string | null;
  name: string | null;
  mobile: string | null;
  treatment: string | null;
  session_hours: number | null;
  amount_paid: number | null;
  check_in_time: string | null;
  check_out_time: string | null;
  therapist_name: string | null;
  outlet_name: string | null;
  is_package_customer?: boolean | null;
  _raw?: any;
};

//* ===================== HELPERS ===================== */

const toInputDate = (dateString: string | null): string => {
  if (!dateString) return '';
  try {
    return new Date(dateString).toISOString().split('T')[0];
  } catch (e) {
    return '';
  }
};

const formatDate = (dateString: string | null) => {
  if (!dateString) return '—';
  return new Date(dateString).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'numeric',
    year: 'numeric',
  });
};

// Short date format for history table
const fmtDate = (iso: string | null) => {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return 'Invalid';
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
};

// Time format for history table
const fmtTime = (iso: string | null) => {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleTimeString('en-IN', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });
};

const fmtDuration = (h: number | null | undefined) => {
  if (h === null || h === undefined) return '0h';
  const n = Number(h);
  if (!Number.isFinite(n)) return '0h';
  
  const totalMins = Math.round(n * 60);
  
  if (totalMins === 0) return '0h';
  if (totalMins < 60) return `${totalMins}m`; 
  
  const hrs = Math.floor(totalMins / 60);
  const mins = totalMins % 60;
  
  if (mins === 0) return `${hrs}h`;
  return `${hrs}h ${mins}m`;
};

const decimalToTime = (decimal: number) => {
  const safeDecimal = Number(decimal) || 0;
  const hrs = Math.floor(safeDecimal);
  const mins = Math.round((safeDecimal - hrs) * 60);
  return { hrs, mins };
};

const normalizeHistoryRow = (r: any): HistoryRow => {
  const maybeStr = (v: any) =>
    v === undefined || v === null ? null : String(v);
  const toNum = (v: any) =>
    v === undefined || v === null || v === ''
      ? null
      : Number.isFinite(Number(v))
      ? Number(v)
      : null;

  return {
    id: String(r.id ?? r._id ?? ''),
    date: maybeStr(r.date ?? r.visit_date ?? r.created_at ?? null),
    name: maybeStr(r.name ?? r.customer_name ?? null),
    mobile: maybeStr(r.mobile ?? r.phone ?? r.customer_mobile ?? null),
    treatment: maybeStr(r.treatment ?? r.service ?? null),
    session_hours: toNum(r.session_hours ?? r.sessionHours ?? null),
    amount_paid: toNum(r.amount_paid ?? r.amountPaid ?? null),
    check_in_time: maybeStr(r.check_in_time ?? r.checkInTime ?? r.check_in ?? null),
    check_out_time: maybeStr(r.check_out_time ?? r.checkOutTime ?? r.check_out ?? null),
    therapist_name: maybeStr(r.therapist_name ?? r.therapist ?? null),
    outlet_name: maybeStr(r.outlet_name ?? r.outlet ?? null),
    is_package_customer: !!(r.is_package_customer ?? r.isPackageCustomer ?? r.package_redeemed ?? false),
    _raw: r,
  };
};

/* ===================== MAIN COMPONENT ===================== */

export default function PackagesPage() {
  const { logActivity } = useActivityLog();
  const [packages, setPackages] = useState<PackageCustomer[]>([]);
  const [filteredPackages, setFilteredPackages] = useState<PackageCustomer[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  
  // Filters
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'expired' | 'expiring_soon'>('all');
  const [amountFilter, setAmountFilter] = useState<string>('all'); // NEW: Amount Filter
  const [outletFilter, setOutletFilter] = useState('all');
  
  const [loading, setLoading] = useState(true);
  const [isExporting, setIsExporting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const outlets = ['all', ...OUTLETS.map((o) => o.name)];

  // Selection State (NEW)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Modal States
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [isDetailsModalOpen, setIsDetailsModalOpen] = useState(false);
  const [isBulkEditModalOpen, setIsBulkEditModalOpen] = useState(false); // NEW: Bulk Edit Modal
  const [selectedPackage, setSelectedPackage] = useState<PackageCustomer | null>(null);

  // Form States
  const [editFormData, setEditFormData] = useState<any>({});
  const [editPassword, setEditPassword] = useState('');
  const [editRemark, setEditRemark] = useState('');
  const [saveError, setSaveError] = useState<string | null>(null);

  const [deletePassword, setDeletePassword] = useState('');
  const [deleteRemark, setDeleteRemark] = useState('');
  const [deleteError, setDeleteError] = useState<string | null>(null);
  
  // Bulk Edit Form States (NEW)
  const [bulkExpiryDate, setBulkExpiryDate] = useState('');
  const [bulkPassword, setBulkPassword] = useState('');
  const [bulkRemark, setBulkRemark] = useState('');
  const [bulkError, setBulkError] = useState<string | null>(null);
  const [isBulkSaving, setIsBulkSaving] = useState(false);

  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  // NEW: history for the selected package client
  const [historyRows, setHistoryRows] = useState<HistoryRow[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);

  const normalizeRow = (row: any): PackageCustomer => {
    const safeNumber = (v: any) => {
      const n = Number(v);
      return Number.isFinite(n) ? n : 0;
    };
    const total_hours = safeNumber(
      row.total_hours ?? row.totalPackageHours ?? row.total_hours
    );
    const used_hours = safeNumber(row.used_hours ?? row.usedPackageHours ?? 0);
    return {
      id: String(row.id),
      name: row.name ?? '—',
      mobile: row.mobile ?? '—',
      package_amount: safeNumber(
        row.package_amount ?? row.packageAmount ?? 0
      ),
      total_hours: total_hours,
      used_hours: used_hours,
      remaining_hours: safeNumber(
        row.remaining_hours ?? total_hours - used_hours
      ),
      start_date: row.start_date ?? null,
      expiry_date: row.expiry_date ?? null,
      status: row.status ?? 'active',
      outlet: row.outlet ?? '—',
      created_at: row.created_at ?? null,
    };
  };

  const fetchPackages = useCallback(async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const { data, error } = await supabase
        .from('packages')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) {
        const { data: fallbackData, error: fallbackErr } = await supabase
          .from('packages')
          .select('*');
        if (fallbackErr) throw fallbackErr;
        setPackages((fallbackData ?? []).map(normalizeRow));
        return;
      }
      setPackages((data ?? []).map(normalizeRow));
    } catch (err: any) {
      console.error('Error fetching packages:', err);
      setErrorMsg(err?.message || 'Failed to fetch packages');
      setPackages([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPackages();
  }, [fetchPackages]);

  useEffect(() => {
    const channel = supabase
      .channel('packages-admin')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'packages' },
        () => fetchPackages()
      )
      .subscribe();
    return () => {
      try {
        if ((channel as any).unsubscribe) (channel as any).unsubscribe();
        else if ((supabase as any).removeChannel)
          (supabase as any).removeChannel(channel);
      } catch {
        /* ignore */
      }
    };
  }, [fetchPackages]);

  useEffect(() => {
    let result = [...packages];
    
    // Search
    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase();
      result = result.filter(
        (p) =>
          (p.name ?? '').toLowerCase().includes(term) ||
          (p.mobile ?? '').includes(term)
      );
    }

    // Status Filter
    if (statusFilter === 'expiring_soon') {
      const today = new Date();
      const thirtyDaysFromNow = new Date();
      thirtyDaysFromNow.setDate(today.getDate() + 30);
      today.setHours(0, 0, 0, 0);
      result = result.filter((p) => {
        if (p.status !== 'active' || !p.expiry_date) return false;
        try {
          const expiryDate = new Date(p.expiry_date);
          return expiryDate >= today && expiryDate <= thirtyDaysFromNow;
        } catch (e) {
          return false;
        }
      });
    } else if (statusFilter !== 'all') {
      result = result.filter(
        (p) => (p.status ?? '').toLowerCase() === statusFilter
      );
    }

    // Outlet Filter
    if (outletFilter !== 'all') {
      result = result.filter(
        (p) =>
          (p.outlet ?? '').toLowerCase() === outletFilter.toLowerCase()
      );
    }

    // NEW: Amount Filter Logic
    if (amountFilter !== 'all') {
        result = result.filter((p) => {
            const amt = p.package_amount / 100; // stored as paise
            if (amountFilter === '0-10000') return amt <= 10000;
            if (amountFilter === '10000-25000') return amt > 10000 && amt <= 25000;
            if (amountFilter === '25000-50000') return amt > 25000 && amt <= 50000;
            if (amountFilter === '50000+') return amt > 50000;
            return true;
        });
    }

    setFilteredPackages(result);
  }, [searchTerm, statusFilter, outletFilter, amountFilter, packages]);

  // NEW: Selection Handlers
  const handleSelectAll = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.checked) {
        setSelectedIds(new Set(filteredPackages.map(p => p.id)));
    } else {
        setSelectedIds(new Set());
    }
  };

  const handleSelectRow = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const newSet = new Set(selectedIds);
    if (newSet.has(id)) newSet.delete(id);
    else newSet.add(id);
    setSelectedIds(newSet);
  };

  // NEW: Bulk Edit Handler
  const handleBulkEditSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (selectedIds.size === 0) return;
    
    setIsBulkSaving(true);
    setBulkError(null);

    if (bulkPassword !== 'admin123') {
        setBulkError('Incorrect Admin Password');
        setIsBulkSaving(false);
        return;
    }
    if (!bulkRemark.trim()) {
        setBulkError('Remark required for audit logs');
        setIsBulkSaving(false);
        return;
    }
    if (!bulkExpiryDate) {
        setBulkError('Please select a new expiry date');
        setIsBulkSaving(false);
        return;
    }

    try {
        const ids = Array.from(selectedIds);
        const { error } = await supabase
            .from('packages')
            .update({ expiry_date: bulkExpiryDate })
            .in('id', ids);

        if (error) throw error;

        logActivity('bulk_edit_package', `Updated expiry for ${ids.length} packages to ${bulkExpiryDate}. Remark: ${bulkRemark}`);
        
        await fetchPackages();
        setIsBulkEditModalOpen(false);
        setSelectedIds(new Set()); // Clear selection
        setBulkPassword('');
        setBulkRemark('');
        setBulkExpiryDate('');
        
    } catch (err: any) {
        setBulkError(err.message || 'Bulk update failed');
    } finally {
        setIsBulkSaving(false);
    }
  };


  const formatCurrency = (amount: number) =>
    new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      minimumFractionDigits: 0,
    }).format(amount / 100);

  const handleExport = () => {
    setIsExporting(true);
    const dataToExport = filteredPackages.map((p) => ({
      Name: p.name,
      Mobile: p.mobile,
      Outlet: p.outlet,
      Status: p.status,
      'Remaining Hours': fmtDuration(p.remaining_hours),
      'Total Hours': fmtDuration(p.total_hours),
      'Used Hours': fmtDuration(p.used_hours),
      'Package Amount': p.package_amount / 100,
      'Expiry Date': formatDate(p.expiry_date),
    }));
    if (dataToExport.length === 0) {
      alert('No data to export.');
      setIsExporting(false);
      return;
    }
    exportToExcel(dataToExport, 'Package_Clients_Report.xlsx');
    setIsExporting(false);
    logActivity('export_packages', 'Downloaded Package Report');
  };

  const handleOpenEditModal = (
    pkg: PackageCustomer,
    e: React.MouseEvent
  ) => {
    e.stopPropagation();
    setSelectedPackage(pkg);

    // Convert decimals to Hours & Minutes
    const { hrs: totalH, mins: totalM } = decimalToTime(pkg.total_hours);
    const { hrs: usedH, mins: usedM } = decimalToTime(pkg.used_hours);

    setEditFormData({
      name: pkg.name,
      mobile: pkg.mobile,
      package_amount: pkg.package_amount / 100,
      
      // Store split values for the form inputs
      total_hours_h: totalH,
      total_hours_m: totalM,
      used_hours_h: usedH,
      used_hours_m: usedM,

      remaining_hours: pkg.remaining_hours,
      start_date: toInputDate(pkg.start_date),
      expiry_date: toInputDate(pkg.expiry_date),
      status: pkg.status,
      outlet: pkg.outlet,
    });
    setEditPassword('');
    setEditRemark('');
    setSaveError(null);
    setIsEditModalOpen(true);
  };

  const handleCloseEditModal = () => {
    setIsEditModalOpen(false);
    setSelectedPackage(null);
    setIsSaving(false);
    setErrorMsg(null);
    setSaveError(null);
  };

  const handleEditSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!selectedPackage) return;
    setIsSaving(true);
    setSaveError(null);

    if (editPassword !== 'admin123') {
      setSaveError('Incorrect Admin Password');
      setIsSaving(false);
      return;
    }
    if (!editRemark.trim()) {
      setSaveError('Please explain what you edited');
      setIsSaving(false);
      return;
    }

    try {
      const before = { ...selectedPackage };

      // Re-calculate decimals from the split form fields
      const total_hours = (Number(editFormData.total_hours_h) || 0) + (Number(editFormData.total_hours_m) || 0) / 60;
      const used_hours = (Number(editFormData.used_hours_h) || 0) + (Number(editFormData.used_hours_m) || 0) / 60;
      
      const remaining_hours = total_hours - used_hours;

      const updates: any = {
        name: editFormData.name,
        mobile: editFormData.mobile,
        package_amount: Math.round(
          Number(editFormData.package_amount || 0) * 100
        ),
        total_hours: total_hours,
        used_hours: used_hours,
        remaining_hours,
        start_date: editFormData.start_date || null,
        expiry_date: editFormData.expiry_date || null,
        status: editFormData.status,
        outlet: editFormData.outlet,
      };

      const { error } = await supabase
        .from('packages')
        .update(updates)
        .eq('id', selectedPackage.id);

      if (error) throw error;

      const after = {
        ...before,
        ...updates,
      };

      const description = JSON.stringify({
        remark: editRemark,
        before,
        after,
      });

      logActivity('edit_package', description);

      await fetchPackages();
      handleCloseEditModal();
    } catch (err: any) {
      console.error('Failed to update package', err);
      setSaveError(err?.message ?? 'Failed to update package');
    } finally {
      setIsSaving(false);
    }
  };

  const handleOpenDeleteModal = (
    pkg: PackageCustomer,
    e: React.MouseEvent
  ) => {
    e.stopPropagation();
    setSelectedPackage(pkg);
    setDeletePassword('');
    setDeleteRemark('');
    setDeleteError(null);
    setIsDeleteModalOpen(true);
  };

  const handleCloseDeleteModal = () => {
    setIsDeleteModalOpen(false);
    setSelectedPackage(null);
    setIsDeleting(false);
    setDeleteError(null);
  };

  const handleDeleteConfirm = async (e: FormEvent) => {
    e.preventDefault();
    if (!selectedPackage) return;
    if (deletePassword !== 'admin123') {
      setDeleteError('Incorrect password.');
      return;
    }
    if (!deleteRemark.trim()) {
      setDeleteError('Remark required.');
      return;
    }

    setIsDeleting(true);
    try {
      const { error } = await supabase
        .from('packages')
        .delete()
        .eq('id', selectedPackage.id);
      if (error) throw error;

      logActivity(
        'delete_package',
        `Deleted package for ${selectedPackage.name}. Remark: ${deleteRemark}`
      );

      await fetchPackages();
      handleCloseDeleteModal();
    } catch (err: any) {
      setDeleteError(err.message || 'Failed to delete package.');
    } finally {
      setIsDeleting(false);
    }
  };

  /* ========== FETCH HISTORY (FILTERED) ========== */

  const fetchHistoryForMobile = async (mobile: string) => {
    if (!mobile) return;
    setHistoryLoading(true);
    setHistoryError(null);
    setHistoryRows([]);

    try {
      const { data, error } = await supabase
        .from('customers')
        .select('*')
        .eq('mobile', mobile)
        .order('date', { ascending: false });

      if (error) {
        console.error('Error fetching history:', error);
        setHistoryError('Failed to load visit history');
        setHistoryRows([]);
        return;
      }

      // Filter: Only show Package Usage or Package Purchase.
      const rows = (data ?? [])
        .map(normalizeHistoryRow)
        .filter(r => {
            const isRedemption = r.is_package_customer;
            // Check raw data for purchase flag
            const isPurchase = r._raw?.took_package || r._raw?.tookPackage;
            
            return isRedemption || isPurchase;
        });

      setHistoryRows(rows);
    } catch (e: any) {
      console.error('Unexpected history fetch error:', e);
      setHistoryError('Unexpected error loading history');
      setHistoryRows([]);
    } finally {
      setHistoryLoading(false);
    }
  };

  const handleRowClick = (pkg: PackageCustomer) => {
    setSelectedPackage(pkg);
    setIsDetailsModalOpen(true);
    fetchHistoryForMobile(pkg.mobile);
  };
  
  const closeDetailsModal = () => {
    setIsDetailsModalOpen(false);
    setSelectedPackage(null);
    setHistoryRows([]);
    setHistoryLoading(false);
    setHistoryError(null);
  };

  return (
    <div>
      {/* Header & Filters */}
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center mb-8 gap-4">
        <h1 className="text-2xl font-bold text-gray-800">All Package Clients</h1>
        <div className="flex flex-col sm:flex-row gap-3">
          
          {/* NEW: Bulk Edit Button */}
          {selectedIds.size > 0 && (
              <button
                onClick={() => {
                    setBulkPassword('');
                    setBulkRemark('');
                    setBulkExpiryDate('');
                    setBulkError(null);
                    setIsBulkEditModalOpen(true);
                }}
                className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 flex items-center gap-2 animate-pulse"
              >
                <CalendarIcon size={16} /> Edit Expiry ({selectedIds.size})
              </button>
          )}

          <button
            onClick={fetchPackages}
            disabled={loading}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-400 flex items-center"
          >
            {loading ? 'Refreshing...' : '🔄 Refresh Data'}
          </button>
          <button
            onClick={handleExport}
            disabled={
              loading || isExporting || filteredPackages.length === 0
            }
            className="px-4 py-2 bg-green-600 text-white font-medium rounded-lg hover:bg-green-700 disabled:opacity-50"
          >
            {isExporting ? 'Exporting...' : 'Export to Excel'}
          </button>
          <div className="relative">
            <input
              type="text"
              placeholder="Search..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-4 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 text-black"
            />
          </div>
        </div>
      </div>

      <div className="bg-white p-6 rounded-xl shadow mb-6">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Status
            </label>
            <select
              id="status"
              value={statusFilter}
              onChange={(e) =>
                setStatusFilter(e.target.value as any)
              }
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-black bg-white"
            >
              <option value="all">All Statuses</option>
              <option value="active">Active</option>
              <option value="expiring_soon">Expiring Soon (30d)</option>
              <option value="expired">Expired</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Outlet Filter
            </label>
            <select
              id="outlet"
              value={outletFilter}
              onChange={(e) => setOutletFilter(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-black bg-white"
            >
              {outlets.map((outlet) => (
                <option key={outlet} value={outlet}>
                  {outlet === 'all' ? 'All Outlets' : outlet}
                </option>
              ))}
            </select>
          </div>
          
          {/* NEW: Amount Filter */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Package Value
            </label>
            <select
              value={amountFilter}
              onChange={(e) => setAmountFilter(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-black bg-white"
            >
                <option value="all">All Values</option>
                <option value="0-10000">Up to ₹10,000</option>
                <option value="10000-25000">₹10,000 - ₹25,000</option>
                <option value="25000-50000">₹25,000 - ₹50,000</option>
                <option value="50000+">Above ₹50,000</option>
            </select>
          </div>

        </div>
      </div>

      {/* Table */}
      {loading ? (
        <div className="bg-white shadow rounded-lg p-8 text-center">
          Loading...
        </div>
      ) : filteredPackages.length === 0 ? (
        <div className="bg-white shadow rounded-lg p-8 text-center text-gray-500">
          No clients found.
        </div>
      ) : (
        <div className="bg-white shadow rounded-lg overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  {/* NEW: Checkbox Header */}
                  <th className="px-4 py-3 text-left">
                      <input 
                        type="checkbox" 
                        className="w-4 h-4 text-blue-600 rounded"
                        onChange={handleSelectAll}
                        checked={filteredPackages.length > 0 && selectedIds.size === filteredPackages.length}
                      />
                  </th>
                  {[
                    'Name',
                    'Mobile',
                    'Outlet',
                    'Package',
                    'Total Hours',
                    'Used Hours',
                    'Remaining',
                    'Expiry Date',
                    'Status',
                    'Actions',
                  ].map((h) => (
                    <th
                      key={h}
                      className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {filteredPackages.map((customer) => (
                  <tr
                    key={customer.id}
                    className={`hover:bg-gray-50 cursor-pointer ${selectedIds.has(customer.id) ? 'bg-blue-50' : ''}`}
                    onClick={() => handleRowClick(customer)}
                  >
                    {/* NEW: Checkbox Row */}
                    <td className="px-4 py-4" onClick={(e) => e.stopPropagation()}>
                        <input 
                            type="checkbox"
                            checked={selectedIds.has(customer.id)}
                            onChange={(e) => {}} // handled by div click or manual separate handler
                            onClick={(e) => handleSelectRow(customer.id, e)}
                            className="w-4 h-4 text-blue-600 rounded cursor-pointer"
                        />
                    </td>

                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                      {customer.name}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {customer.mobile}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {customer.outlet}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {formatCurrency(customer.package_amount)}
                    </td>
                    
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {fmtDuration(customer.total_hours)}
                    </td>
                    
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {fmtDuration(customer.used_hours)}
                    </td>

                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                      <div className="w-24">
                        <div className="flex justify-between text-xs mb-1">
                          <span
                            className={
                              customer.status === 'active'
                                ? 'text-green-700'
                                : 'text-red-700'
                            }
                          >
                            {fmtDuration(customer.remaining_hours)}
                          </span>
                        </div>
                        <div className="w-full bg-gray-200 rounded-full h-1.5">
                          <div
                            className={`h-1.5 rounded-full ${
                              customer.status === 'active'
                                ? 'bg-green-500'
                                : 'bg-red-500'
                            }`}
                            style={{
                              width: `${Math.min(
                                100,
                                (customer.remaining_hours /
                                  customer.total_hours) *
                                  100
                              )}%`,
                            }}
                          ></div>
                        </div>
                      </div>
                    </td>

                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {formatDate(customer.expiry_date)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span
                        className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                          customer.status === 'active'
                            ? 'bg-green-100 text-green-800'
                            : 'bg-red-100 text-red-800'
                        }`}
                      >
                        {String(customer.status).toUpperCase()}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                      <div className="flex gap-2">
                        <button
                          onClick={(e) =>
                            handleOpenEditModal(customer, e)
                          }
                          className="px-2 py-1 bg-blue-100 text-blue-700 text-xs rounded-md hover:bg-blue-200"
                        >
                          Edit
                        </button>
                        <button
                          onClick={(e) =>
                            handleOpenDeleteModal(customer, e)
                          }
                          className="px-2 py-1 bg-red-100 text-red-700 text-xs rounded-md hover:bg-red-200"
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* NEW: Bulk Edit Modal */}
      {isBulkEditModalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
          <form
            onSubmit={handleBulkEditSubmit}
            className="bg-white rounded-lg shadow-xl w-full max-w-md p-6 space-y-4"
          >
            <h2 className="text-xl font-bold text-gray-800 flex items-center gap-2">
                <CalendarIcon className="text-purple-600" />
                Bulk Edit Expiry
            </h2>
            <p className="text-sm text-gray-600">
              Updating expiry date for <strong>{selectedIds.size}</strong> selected packages.
            </p>

            {bulkError && (
              <div className="p-2 bg-red-100 text-red-700 rounded text-sm font-bold">
                {bulkError}
              </div>
            )}

            <div>
                <label className="text-xs uppercase font-bold text-gray-500">
                  New Expiry Date
                </label>
                <input
                  type="date"
                  value={bulkExpiryDate}
                  onChange={(e) => setBulkExpiryDate(e.target.value)}
                  className="w-full p-2 border rounded text-black"
                  required
                />
            </div>

            <div>
              <label className="text-xs uppercase font-bold text-gray-500">
                Remark (Required)
              </label>
              <textarea
                value={bulkRemark}
                onChange={(e) => setBulkRemark(e.target.value)}
                className="w-full p-2 border rounded text-black"
                rows={2}
                placeholder="Why are you changing these dates?"
                required
              />
            </div>

            <div>
              <label className="text-xs uppercase font-bold text-gray-500">
                Admin Password
              </label>
              <input
                type="password"
                value={bulkPassword}
                onChange={(e) => setBulkPassword(e.target.value)}
                className="w-full p-2 border rounded text-black"
                placeholder="Enter admin123"
                required
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setIsBulkEditModalOpen(false)}
                className="px-4 py-2 bg-gray-200 rounded text-black font-medium"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isBulkSaving}
                className="px-4 py-2 bg-purple-600 text-white rounded font-medium hover:bg-purple-700"
              >
                {isBulkSaving ? 'Updating...' : 'Confirm Update'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Edit Modal (Single) */}
      {isEditModalOpen && selectedPackage && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
          <form
            onSubmit={handleEditSubmit}
            className="bg-white rounded-lg shadow-xl w-full max-w-2xl p-6 space-y-4"
          >
            <h2 className="text-xl font-bold text-gray-800">
              Edit Package - {selectedPackage.name}
            </h2>

            {saveError && (
              <div className="p-2 bg-red-100 text-red-700 rounded">
                {saveError}
              </div>
            )}

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-xs uppercase font-bold text-gray-500">
                  Client Name
                </label>
                <input
                  type="text"
                  value={editFormData.name ?? ''}
                  onChange={(e) =>
                    setEditFormData({
                      ...editFormData,
                      name: e.target.value,
                    })
                  }
                  className="w-full p-2 border rounded text-black"
                  required
                />
              </div>

              <div>
                <label className="text-xs uppercase font-bold text-gray-500">
                  Mobile
                </label>
                <input
                  type="text"
                  value={editFormData.mobile ?? ''}
                  onChange={(e) =>
                    setEditFormData({
                      ...editFormData,
                      mobile: e.target.value,
                    })
                  }
                  className="w-full p-2 border rounded text-black"
                  required
                />
              </div>

              <div>
                <label className="text-xs uppercase font-bold text-gray-500">
                  Outlet
                </label>
                <select
                  value={
                    editFormData.outlet ?? OUTLETS[0]?.name ?? ''
                  }
                  onChange={(e) =>
                    setEditFormData({
                      ...editFormData,
                      outlet: e.target.value,
                    })
                  }
                  className="w-full p-2 border rounded text-black"
                >
                  {OUTLETS.map((o) => (
                    <option key={o.id} value={o.name}>
                      {o.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-xs uppercase font-bold text-gray-500">
                  Status
                </label>
                <select
                  value={editFormData.status ?? 'active'}
                  onChange={(e) =>
                    setEditFormData({
                      ...editFormData,
                      status: e.target.value,
                    })
                  }
                  className="w-full p-2 border rounded text-black"
                >
                  <option value="active">Active</option>
                  <option value="expired">Expired</option>
                </select>
              </div>

              <div>
                <label className="text-xs uppercase font-bold text-gray-500">
                  Package Amount (₹)
                </label>
                <input
                  type="number"
                  value={editFormData.package_amount ?? 0}
                  onChange={(e) =>
                    setEditFormData({
                      ...editFormData,
                      package_amount: e.target.value,
                    })
                  }
                  className="w-full p-2 border rounded text-black"
                  required
                />
              </div>

              <div>
                <label className="text-xs uppercase font-bold text-gray-500">
                  Start Date
                </label>
                <input
                  type="date"
                  value={editFormData.start_date ?? ''}
                  onChange={(e) =>
                    setEditFormData({
                      ...editFormData,
                      start_date: e.target.value,
                    })
                  }
                  className="w-full p-2 border rounded text-black"
                />
              </div>

              <div>
                <label className="text-xs uppercase font-bold text-gray-500">
                  Expiry Date
                </label>
                <input
                  type="date"
                  value={editFormData.expiry_date ?? ''}
                  onChange={(e) =>
                    setEditFormData({
                      ...editFormData,
                      expiry_date: e.target.value,
                    })
                  }
                  className="w-full p-2 border rounded text-black"
                />
              </div>

            {/* Total Hours Split Fields */}
              <div>
                <label className="text-xs uppercase font-bold text-gray-500">Total Duration</label>
                <div className="flex gap-2">
                  <div className="relative w-1/2">
                    <input
                      type="number"
                      placeholder="Hrs"
                      value={editFormData.total_hours_h ?? 0}
                      onChange={(e) => setEditFormData({ ...editFormData, total_hours_h: e.target.value })}
                      className="w-full p-2 border rounded text-black pr-8"
                      min="0"
                    />
                    <span className="absolute right-2 top-2 text-xs text-gray-400 font-bold">HR</span>
                  </div>
                  <div className="relative w-1/2">
                    <input
                      type="number"
                      placeholder="Mins"
                      value={editFormData.total_hours_m ?? 0}
                      onChange={(e) => setEditFormData({ ...editFormData, total_hours_m: e.target.value })}
                      className="w-full p-2 border rounded text-black pr-8"
                      min="0"
                      max="59"
                    />
                    <span className="absolute right-2 top-2 text-xs text-gray-400 font-bold">MIN</span>
                  </div>
                </div>
              </div>

              {/* Used Hours Split Fields */}
              <div>
                <label className="text-xs uppercase font-bold text-gray-500">Used Duration</label>
                <div className="flex gap-2">
                  <div className="relative w-1/2">
                    <input
                      type="number"
                      placeholder="Hrs"
                      value={editFormData.used_hours_h ?? 0}
                      onChange={(e) => setEditFormData({ ...editFormData, used_hours_h: e.target.value })}
                      className="w-full p-2 border rounded text-black pr-8"
                      min="0"
                    />
                    <span className="absolute right-2 top-2 text-xs text-gray-400 font-bold">HR</span>
                  </div>
                  <div className="relative w-1/2">
                    <input
                      type="number"
                      placeholder="Mins"
                      value={editFormData.used_hours_m ?? 0}
                      onChange={(e) => setEditFormData({ ...editFormData, used_hours_m: e.target.value })}
                      className="w-full p-2 border rounded text-black pr-8"
                      min="0"
                      max="59"
                    />
                    <span className="absolute right-2 top-2 text-xs text-gray-400 font-bold">MIN</span>
                  </div>
                </div>
              </div>
            </div>

            <div>
              <label className="text-xs uppercase font-bold text-gray-500">
                Remark (Required)
              </label>
              <textarea
                value={editRemark}
                onChange={(e) => setEditRemark(e.target.value)}
                className="w-full p-2 border rounded text-black"
                rows={3}
                required
              />
            </div>

            <div>
              <label className="text-xs uppercase font-bold text-gray-500">
                Admin Password
              </label>
              <input
                type="password"
                value={editPassword}
                onChange={(e) => setEditPassword(e.target.value)}
                className="w-full p-2 border rounded text-black"
                placeholder="Enter admin123"
                required
              />
            </div>

            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={handleCloseEditModal}
                className="px-4 py-2 bg-gray-200 rounded text-black"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSaving}
                className="px-4 py-2 bg-blue-600 text-white rounded"
              >
                {isSaving ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Delete Modal */}
      {isDeleteModalOpen && selectedPackage && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
          <form
            onSubmit={handleDeleteConfirm}
            className="bg-white rounded-lg shadow-xl w-full max-w-md p-6 space-y-4"
          >
            <h2 className="text-xl font-bold text-red-700">Delete Package</h2>
            <p className="text-sm text-gray-600">
              Deleting package for <strong>{selectedPackage.name}</strong>.
            </p>
            <div>
              <label className="text-xs uppercase font-bold text-gray-500">
                Reason
              </label>
              <textarea
                value={deleteRemark}
                onChange={(e) => setDeleteRemark(e.target.value)}
                className="w-full p-2 border rounded text-black"
                required
              />
            </div>
            <div>
              <label className="text-xs uppercase font-bold text-gray-500">
                Password
              </label>
              <input
                type="password"
                value={deletePassword}
                onChange={(e) => setDeletePassword(e.target.value)}
                className="w-full p-2 border rounded text-black"
                placeholder="Enter admin123"
              />
              {deleteError && (
                <p className="text-red-600 text-xs">{deleteError}</p>
              )}
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={handleCloseDeleteModal}
                className="px-4 py-2 bg-gray-200 rounded text-black"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isDeleting}
                className="px-4 py-2 bg-red-600 text-white rounded"
              >
                {isDeleting ? 'Deleting...' : 'Confirm'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Details Modal WITH FULL HISTORY */}
      {isDetailsModalOpen && selectedPackage && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-4xl p-6 relative">
            <button
              onClick={closeDetailsModal}
              className="absolute top-4 right-4 text-gray-400 hover:text-gray-600"
            >
              &times;
            </button>

            {/* Header */}
            <div className="flex items-center justify-between gap-4 mb-6">
              <div className="flex items-center gap-4">
                <div
                  className={`p-3 rounded-full ${
                    selectedPackage.status === 'active'
                      ? 'bg-green-100 text-green-600'
                      : 'bg-red-100 text-red-600'
                  }`}
                >
                  <User size={24} />
                </div>
                <div>
                  <h2 className="text-xl font-bold text-gray-800">
                    {selectedPackage.name}
                  </h2>
                  <p className="text-sm text-gray-500">
                    {selectedPackage.mobile}
                  </p>
                  <p className="text-xs text-gray-500 mt-1">
                    Outlet: <span className="font-medium">{selectedPackage.outlet}</span>
                  </p>
                </div>
              </div>

              <div className="text-right">
                <p className="text-xs text-gray-500 uppercase">Package Value</p>
                <p className="font-bold text-gray-900 text-lg">
                  ₹{(selectedPackage.package_amount / 100).toLocaleString()}
                </p>
                <p className="text-xs text-gray-500 mt-2 uppercase">
                  Expires on
                </p>
                <p className="font-semibold text-gray-800">
                  {formatDate(selectedPackage.expiry_date)}
                </p>
              </div>
            </div>

            {/* Package summary */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
              <div className="p-4 bg-gray-50 rounded-lg">
                <p className="text-xs text-gray-500 uppercase">Status</p>
                <p
                  className={`font-bold ${
                    selectedPackage.status === 'active'
                      ? 'text-green-600'
                      : 'text-red-600'
                  }`}
                >
                  {String(selectedPackage.status).toUpperCase()}
                </p>
              </div>
              <div className="p-4 bg-gray-50 rounded-lg">
                <p className="text-xs text-gray-500 uppercase">Start Date</p>
                <p className="font-bold text-gray-800">
                  {formatDate(selectedPackage.start_date)}
                </p>
              </div>
              <div className="p-4 bg-gray-50 rounded-lg">
                <p className="text-xs text-gray-500 uppercase">
                  Remaining Hours
                </p>
                <p className="font-bold text-gray-800">
                  {fmtDuration(selectedPackage.remaining_hours)}
                </p>
              </div>
            </div>

            <div className="space-y-4 mb-8">
              <div>
                <div className="flex justify-between text-sm mb-1">
                  <span className="text-gray-600">Usage Progress</span>
                  <span className="font-medium text-gray-900">
                    {fmtDuration(selectedPackage.used_hours)} /{' '}
                    {fmtDuration(selectedPackage.total_hours)}
                  </span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-3">
                  <div
                    className="h-3 rounded-full bg-blue-600"
                    style={{
                      width: `${Math.min(
                        100,
                        (selectedPackage.used_hours /
                          (selectedPackage.total_hours || 1)) *
                          100
                      )}%`,
                    }}
                  ></div>
                </div>
              </div>
            </div>

            {/* NEW: CLIENT VISIT HISTORY SECTION */}
            <div className="border-t pt-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-lg font-semibold text-gray-800">
                  Visit History
                </h3>
                <span className="text-xs text-gray-500">
                  Mobile: {selectedPackage.mobile}
                </span>
              </div>

              {historyLoading ? (
                <div className="py-4 text-sm text-gray-600">
                  Loading visit history…
                </div>
              ) : historyError ? (
                <div className="py-4 text-sm text-red-600">
                  {historyError}
                </div>
              ) : historyRows.length === 0 ? (
                <div className="py-4 text-sm text-gray-600">
                  No visit history found for this client.
                </div>
              ) : (
                <div className="overflow-x-auto max-h-80 border rounded-lg">
                  <table className="min-w-full divide-y divide-gray-200 text-sm">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                          Date & Time
                        </th>
                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                          Treatment
                        </th>
                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                          Duration
                        </th>
                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                          Therapist
                        </th>
                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                          Outlet
                        </th>
                        <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">
                          Amount
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200">
  {historyRows.map((h, idx) => {
    const isPurchase = h._raw?.took_package || h._raw?.tookPackage;
    
    return (
      <tr
        key={h.id || `${h.mobile}-${idx}`}
        className={
          h.is_package_customer
            ? 'bg-indigo-50/50'
            : 'hover:bg-gray-50'
        }
      >
        <td className="px-4 py-2 whitespace-nowrap">
          <div className="font-medium text-gray-900">
            {fmtDate(h.date)}
          </div>
          <div className="text-xs text-gray-500">
            {fmtTime(h.check_in_time)}
          </div>
        </td>
        <td className="px-4 py-2">
          {/* 1. Show the actual treatment name */}
          <span className="text-gray-900 font-medium">
            {h.treatment ?? '—'}
          </span>

          {/* 2. Show "Package Taken" badge on the side if applicable */}
          {isPurchase && (
            <span className="ml-2 text-xs bg-green-100 text-green-800 border border-green-200 px-2 py-0.5 rounded-md font-bold">
              Package Taken
            </span>
          )}

          {/* 3. Show "Redeemed" badge if applicable */}
          {h.is_package_customer && (
            <span className="ml-2 text-xs bg-red-100 text-red-700 border border-red-200 px-2 py-0.5 rounded-md">
              Redeemed
            </span>
          )}
        </td>
        <td className="px-4 py-2 whitespace-nowrap text-gray-900">
          {fmtDuration(h.session_hours)}
        </td>
        <td className="px-4 py-2 whitespace-nowrap text-gray-900">
          {h.therapist_name ?? '—'}
        </td>
        <td className="px-4 py-2 whitespace-nowrap text-gray-900">
          {h.outlet_name ?? '—'}
        </td>
        <td className="px-4 py-2 whitespace-nowrap text-right text-gray-900">
          {h.amount_paid
            ? `₹${(h.amount_paid / 100).toLocaleString()}`
            : '—'}
        </td>
      </tr>
    );
  })}
</tbody>
                  </table>
                </div>
              )}
            </div>

            <div className="mt-6 flex justify-end">
              <button
                onClick={closeDetailsModal}
                className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}