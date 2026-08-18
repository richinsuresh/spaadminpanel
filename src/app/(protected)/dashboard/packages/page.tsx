'use client';

import { useState, useEffect, useCallback, FormEvent, Fragment } from 'react';
import { supabase } from '@/lib/supabase';
import { OUTLETS } from '@/lib/outlet';
import { exportToExcel } from '@/lib/exportToExcel';
import { User, Calendar as CalendarIcon, AlertTriangle, RefreshCw, CheckCircle, Edit2, Trash2 } from 'lucide-react';
import { useActivityLog } from '@/hooks/useActivityLog';
import { getISTToday } from '@/lib/dateTime';

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
  package_id?: string | null;
  _raw?: any;
};

/* ===================== HELPERS ===================== */

const toInputDate = (dateString: string | null): string => {
  if (!dateString) return '';
  try {
    return new Date(dateString).toISOString().split('T')[0];
  } catch (e) {
    return '';
  }
};

const toInputTime = (d: string | null) => {
  if (!d) return '';
  const date = new Date(d);
  if (isNaN(date.getTime())) return '';
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
};

const formatDate = (dateString: string | null) => {
  if (!dateString) return '—';
  return new Date(dateString).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'numeric',
    year: 'numeric',
  });
};

const fmtDate = (iso: string | null) => {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return 'Invalid';
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
};

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
    package_id: maybeStr(r.package_id ?? r.packageId ?? null),
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
  const [amountFilter, setAmountFilter] = useState<string>('all');
  const [outletFilter, setOutletFilter] = useState('all');
  
  const [loading, setLoading] = useState(true);
  const [isExporting, setIsExporting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const outlets = ['all', ...OUTLETS.map((o) => o.name)];

  // Selection State
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Modal States
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [isDetailsModalOpen, setIsDetailsModalOpen] = useState(false);
  const [isBulkEditModalOpen, setIsBulkEditModalOpen] = useState(false);
  const [selectedPackage, setSelectedPackage] = useState<PackageCustomer | null>(null);

  // Form States
  const [editFormData, setEditFormData] = useState<any>({});
  const [editPassword, setEditPassword] = useState('');
  const [editRemark, setEditRemark] = useState('');
  const [saveError, setSaveError] = useState<string | null>(null);

  const [deletePassword, setDeletePassword] = useState('');
  const [deleteRemark, setDeleteRemark] = useState('');
  const [deleteError, setDeleteError] = useState<string | null>(null);
  
  // Bulk Edit Form States
  const [bulkExpiryDate, setBulkExpiryDate] = useState('');
  const [bulkPassword, setBulkPassword] = useState('');
  const [bulkRemark, setBulkRemark] = useState('');
  const [bulkError, setBulkError] = useState<string | null>(null);
  const [isBulkSaving, setIsBulkSaving] = useState(false);

  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  
  // History State
  const [historyRows, setHistoryRows] = useState<HistoryRow[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);

  // --- HISTORY EDIT / DELETE STATES ---
  const [isHistoryEditOpen, setIsHistoryEditOpen] = useState(false);
  const [historyEditForm, setHistoryEditForm] = useState<any>({});
  const [editingHistoryRow, setEditingHistoryRow] = useState<HistoryRow | null>(null);

  const [isHistoryDeleteOpen, setIsHistoryDeleteOpen] = useState(false);
  const [deletingHistoryRow, setDeletingHistoryRow] = useState<HistoryRow | null>(null);

  const [historyActionPassword, setHistoryActionPassword] = useState('');
  const [historyActionRemark, setHistoryActionRemark] = useState('');
  const [historyActionError, setHistoryActionError] = useState<string | null>(null);
  const [isHistoryActionLoading, setIsHistoryActionLoading] = useState(false);


  const normalizeRow = (row: any): PackageCustomer => {
    const safeNumber = (v: any) => {
      const n = Number(v);
      return Number.isFinite(n) ? n : 0;
    };
    const total_hours = safeNumber(
      row.total_hours ?? row.totalPackageHours ?? row.total_hours
    );
    const used_hours = safeNumber(row.used_hours ?? row.usedPackageHours ?? 0);
    const remaining_hours = safeNumber(
      row.remaining_hours ?? total_hours - used_hours
    );
    
    let currentStatus = row.status ?? 'active';

    // Recompute what the status SHOULD be from the actual data, every time.
    // Important: this has to be able to go BOTH ways. A package that was
    // marked 'expired' (old expiry date, or hours ran out) can become valid
    // again later — e.g. staff extends the expiry date, or a usage-hours
    // correction frees up remaining hours. Only ever flipping active -> expired
    // and never expired -> active is what left corrected/renewed packages
    // stuck showing EXPIRED.
    if (currentStatus === 'active' || currentStatus === 'expired') {
        const todayStr = getISTToday();
        const isPastExpiry = !!(row.expiry_date && row.expiry_date < todayStr);
        const isOutOfHours = remaining_hours <= 0;
        const correctStatus = (isPastExpiry || isOutOfHours) ? 'expired' : 'active';

        if (correctStatus !== currentStatus) {
            currentStatus = correctStatus;
            supabase.from('packages').update({ status: correctStatus }).eq('id', row.id).then();
        }
    }

    return {
      id: String(row.id),
      name: row.name ?? '—',
      mobile: row.mobile ?? '—',
      package_amount: safeNumber(
        row.package_amount ?? row.packageAmount ?? 0
      ),
      total_hours: total_hours,
      used_hours: used_hours,
      remaining_hours: remaining_hours,
      start_date: row.start_date ?? null,
      expiry_date: row.expiry_date ?? null,
      status: currentStatus,
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

    // Amount Filter Logic
    if (amountFilter !== 'all') {
        result = result.filter((p) => {
            const amt = p.package_amount / 100; 
            if (amountFilter === '0-5000') return amt <= 5000;
            if (amountFilter === '5000-10000') return amt > 5000 && amt <= 10000;
            if (amountFilter === '10000-25000') return amt > 10000 && amt <= 25000;
            if (amountFilter === '25000-50000') return amt > 25000 && amt <= 50000;
            if (amountFilter === '50000+') return amt > 50000;
            return true;
        });
    }

    setFilteredPackages(result);
  }, [searchTerm, statusFilter, outletFilter, amountFilter, packages]);

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
        const todayStr = getISTToday();

        // Extending a package's expiry date must also re-evaluate its status.
        // Previously this only wrote expiry_date, so a package that had
        // already been auto-marked 'expired' stayed 'expired' in the DB even
        // after staff pushed its expiry into the future — the UI kept
        // showing EXPIRED on an otherwise valid, renewed package.
        const activeIds: string[] = [];
        const expiredIds: string[] = [];
        ids.forEach((id) => {
            const pkg = packages.find((p) => p.id === id);
            const remaining = pkg ? pkg.remaining_hours : 0;
            const willBeExpired = remaining <= 0 || bulkExpiryDate < todayStr;
            (willBeExpired ? expiredIds : activeIds).push(id);
        });

        if (activeIds.length) {
            const { error } = await supabase
                .from('packages')
                .update({ expiry_date: bulkExpiryDate, status: 'active' })
                .in('id', activeIds);
            if (error) throw error;
        }
        if (expiredIds.length) {
            const { error } = await supabase
                .from('packages')
                .update({ expiry_date: bulkExpiryDate, status: 'expired' })
                .in('id', expiredIds);
            if (error) throw error;
        }

        logActivity('bulk_edit_package', `Updated expiry for ${ids.length} packages to ${bulkExpiryDate}. Remark: ${bulkRemark}`);
        
        await fetchPackages();
        setIsBulkEditModalOpen(false);
        setSelectedIds(new Set()); 
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

    const { hrs: totalH, mins: totalM } = decimalToTime(pkg.total_hours);
    const { hrs: usedH, mins: usedM } = decimalToTime(pkg.used_hours);

    setEditFormData({
      name: pkg.name,
      mobile: pkg.mobile,
      package_amount: pkg.package_amount / 100,
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

      const total_hours = (Number(editFormData.total_hours_h) || 0) + (Number(editFormData.total_hours_m) || 0) / 60;
      const used_hours = (Number(editFormData.used_hours_h) || 0) + (Number(editFormData.used_hours_m) || 0) / 60;
      const remaining_hours = total_hours - used_hours;

      // Determine updated status based on new balance or expiry date
      const todayStr = getISTToday();
      let newStatus = editFormData.status;
      if (remaining_hours <= 0 || (editFormData.expiry_date && editFormData.expiry_date < todayStr)) {
        newStatus = 'expired';
      }

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
        status: newStatus,
        outlet: editFormData.outlet,
      };

      const { error } = await supabase
        .from('packages')
        .update(updates)
        .eq('id', selectedPackage.id);

      if (error) throw error;

      if (before.mobile !== updates.mobile || before.name !== updates.name) {
         const { error: syncError } = await supabase
            .from('customers')
            .update({ 
                name: updates.name, 
                mobile: updates.mobile 
            })
            .eq('mobile', before.mobile);
            
         if (syncError) {
             console.error("Warning: Failed to sync changes to sales history", syncError);
         }
      }

      const after = { ...before, ...updates };

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

  /* ========== FETCH HISTORY & AUTO-SYNC ========== */

  const fetchHistoryForPackage = async (pkg: PackageCustomer) => {
    if (!pkg.mobile) return;
    setHistoryLoading(true);
    setHistoryError(null);
    setHistoryRows([]);

    try {
      const { data, error } = await supabase
        .from('customers')
        .select('*')
        .eq('mobile', pkg.mobile)
        .order('date', { ascending: true }); 

      if (error) throw error;

      const { data: allPkgsData } = await supabase
        .from('packages')
        .select('id, created_at, start_date')
        .eq('mobile', pkg.mobile)
        .order('created_at', { ascending: true });
        
      const sortedPkgs = allPkgsData || [];

      const rawRows = (data ?? []).map(normalizeHistoryRow);
      
      const packageRows = rawRows.filter(r => {
          const isPurchase = r._raw?.took_package || r._raw?.tookPackage;
          if (isPurchase) {
              const pkgDate = pkg.start_date || pkg.created_at?.split('T')[0];
              return r.date === pkgDate; 
          }
          
          const isRedemption = r.is_package_customer;
          if (isRedemption) {
              const rPkgId = r.package_id;
              if (rPkgId) {
                  return String(rPkgId) === String(pkg.id); 
              } else {
                  let assignedPkgId = sortedPkgs[0]?.id;
                  for (const p of sortedPkgs) {
                      const pDate = p.start_date || p.created_at?.split('T')[0] || '';
                      if (r.date && pDate && r.date >= pDate) {
                          assignedPkgId = p.id;
                      }
                  }
                  return String(assignedPkgId) === String(pkg.id);
              }
          }
          return false;
      }).reverse();

      setHistoryRows(packageRows);
      
      // Calculate Bulletproof Usage (Main + Group/Guests)
      const realUsage = packageRows.reduce((acc, curr) => {
          let usage = 0;
          
          usage += (Number(curr.session_hours) || 0);
          
          let guests: any[] = [];
          const rawGuests = curr._raw?.group_customers || curr._raw?.guests;
          
          if (typeof rawGuests === 'string') {
              try { guests = JSON.parse(rawGuests); } catch (e) {}
          } else if (Array.isArray(rawGuests)) {
              guests = rawGuests;
          }

          guests.forEach((g: any) => {
              const gVal = g.sessionHours ?? g.session_hours ?? g.duration ?? 0;
              usage += (Number(gVal) || 0);
          });
          
          return acc + usage;
      }, 0);
      
      // SILENT BACKGROUND SYNC: Instantly fix the database if it doesn't match history accurately
      const newRemaining = pkg.total_hours - realUsage;
      const todayStr = getISTToday();
      const shouldBeExpired = newRemaining <= 0 || (pkg.expiry_date && pkg.expiry_date < todayStr);
      const newStatus = shouldBeExpired ? 'expired' : 'active';

      const usageOutOfSync = Math.abs(pkg.used_hours - realUsage) > 0.05;
      // Same bidirectional fix as normalizeRow: also re-sync when the status
      // itself is wrong (e.g. expiry date was extended after the package was
      // auto-expired), not only when the hours are out of sync.
      const statusOutOfSync = (pkg.status === 'active' || pkg.status === 'expired') && pkg.status !== newStatus;

      if (usageOutOfSync || statusOutOfSync) {
          await supabase.from('packages').update({
              used_hours: realUsage,
              remaining_hours: newRemaining,
              status: newStatus
          }).eq('id', pkg.id);
          
          setPackages(prev => prev.map(p => 
              p.id === pkg.id 
                  ? { ...p, used_hours: realUsage, remaining_hours: newRemaining, status: newStatus } 
                  : p
          ));
          setSelectedPackage(prev => 
              prev ? { ...prev, used_hours: realUsage, remaining_hours: newRemaining, status: newStatus } : prev
          );
      }
      
    } catch (e: any) {
      console.error('History fetch error:', e);
      setHistoryError('Unexpected error loading history');
    } finally {
      setHistoryLoading(false);
    }
  };

  const handleRowClick = (pkg: PackageCustomer) => {
    setSelectedPackage(pkg);
    setIsDetailsModalOpen(true);
    fetchHistoryForPackage(pkg);
  };
  
  const closeDetailsModal = () => {
    setIsDetailsModalOpen(false);
    setSelectedPackage(null);
    setHistoryRows([]);
    setHistoryLoading(false);
    setHistoryError(null);
  };

  /* ========== HISTORY EDIT & DELETE HANDLERS ========== */
  const handleOpenHistoryEdit = (row: HistoryRow) => {
    setEditingHistoryRow(row);
    const { hrs, mins } = decimalToTime(row.session_hours || 0);
    setHistoryEditForm({
      treatment: row.treatment || '',
      therapist_name: row.therapist_name || '',
      session_hours_h: hrs,
      session_hours_m: mins,
      date: toInputDate(row.date),
      check_in_time: toInputTime(row.check_in_time),
      check_out_time: toInputTime(row.check_out_time),
    });
    setHistoryActionPassword('');
    setHistoryActionRemark('');
    setHistoryActionError(null);
    setIsHistoryEditOpen(true);
  };

  const handleSaveHistoryEdit = async (e: FormEvent) => {
    e.preventDefault();
    if (!editingHistoryRow || !selectedPackage) return;
    
    setHistoryActionError(null);
    if (historyActionPassword !== 'admin123') {
      setHistoryActionError('Incorrect Admin Password');
      return;
    }
    if (!historyActionRemark.trim()) {
      setHistoryActionError('Remark is required');
      return;
    }

    setIsHistoryActionLoading(true);
    try {
      const totalHours = (Number(historyEditForm.session_hours_h) || 0) + (Number(historyEditForm.session_hours_m) || 0) / 60;
      
      let newCheckInTime: string | null = editingHistoryRow.check_in_time;
      if (historyEditForm.date && historyEditForm.check_in_time) {
        const combined = new Date(`${historyEditForm.date}T${historyEditForm.check_in_time}`);
        if (!isNaN(combined.getTime())) newCheckInTime = combined.toISOString();
      }
      
      let newCheckOutTime: string | null = editingHistoryRow.check_out_time;
      if (historyEditForm.date && historyEditForm.check_out_time) {
        const combinedOut = new Date(`${historyEditForm.date}T${historyEditForm.check_out_time}`);
        if (!isNaN(combinedOut.getTime())) newCheckOutTime = combinedOut.toISOString();
      } else if (!historyEditForm.check_out_time) {
        newCheckOutTime = null;
      }

      const updates = {
        treatment: historyEditForm.treatment,
        therapist_name: historyEditForm.therapist_name,
        session_hours: totalHours,
        date: historyEditForm.date,
        check_in_time: newCheckInTime,
        check_out_time: newCheckOutTime
      };

      const { error } = await supabase.from('customers').update(updates).eq('id', editingHistoryRow.id);
      if (error) throw error;

      logActivity('edit_history_row', `Edited history row for ${editingHistoryRow.name || 'Package Client'}. Remark: ${historyActionRemark}`);
      
      setIsHistoryEditOpen(false);
      setEditingHistoryRow(null);
      await fetchHistoryForPackage(selectedPackage); // Refresh history & auto-sync package!
    } catch (err: any) {
      setHistoryActionError(err.message || 'Failed to update history row');
    } finally {
      setIsHistoryActionLoading(false);
    }
  };

  const handleOpenHistoryDelete = (row: HistoryRow) => {
    setDeletingHistoryRow(row);
    setHistoryActionPassword('');
    setHistoryActionRemark('');
    setHistoryActionError(null);
    setIsHistoryDeleteOpen(true);
  };

  const handleConfirmHistoryDelete = async (e: FormEvent) => {
    e.preventDefault();
    if (!deletingHistoryRow || !selectedPackage) return;

    setHistoryActionError(null);
    if (historyActionPassword !== 'admin123') {
      setHistoryActionError('Incorrect Admin Password');
      return;
    }
    if (!historyActionRemark.trim()) {
      setHistoryActionError('Remark is required');
      return;
    }

    setIsHistoryActionLoading(true);
    try {
      const { error } = await supabase.from('customers').delete().eq('id', deletingHistoryRow.id);
      if (error) throw error;

      logActivity('delete_history_row', `Deleted history row for ${deletingHistoryRow.name || 'Package Client'}. Remark: ${historyActionRemark}`);
      
      setIsHistoryDeleteOpen(false);
      setDeletingHistoryRow(null);
      await fetchHistoryForPackage(selectedPackage); // Refresh history & auto-sync package!
    } catch (err: any) {
      setHistoryActionError(err.message || 'Failed to delete history row');
    } finally {
      setIsHistoryActionLoading(false);
    }
  };

  return (
    <div>
      {/* Header & Filters */}
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center mb-8 gap-4">
        <h1 className="text-2xl font-bold text-gray-800">All Package Clients</h1>
        <div className="flex flex-col sm:flex-row gap-3">
          
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
                <option value="0-5000">Up to ₹5,000</option>
                <option value="5000-10000">₹5,000 - ₹10,000</option>
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
                    <td className="px-4 py-4" onClick={(e) => e.stopPropagation()}>
                        <input 
                            type="checkbox"
                            checked={selectedIds.has(customer.id)}
                            onChange={(e) => {}}
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

      {/* Bulk Edit Modal */}
      {isBulkEditModalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
          <form
            onSubmit={handleBulkEditSubmit}
            className="bg-white rounded-lg shadow-xl w-full max-md p-6 space-y-4"
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
            className="bg-white rounded-lg shadow-xl w-full max-md p-6 space-y-4"
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
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-5xl p-6 relative">
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

            {/* CLIENT VISIT HISTORY SECTION */}
            <div className="border-t pt-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-lg font-semibold text-gray-800">
                  Visit History
                </h3>
                <span className="text-sm bg-gray-100 px-3 py-1 rounded font-medium text-gray-700">
                  Total Used: <strong>{fmtDuration(selectedPackage.used_hours)}</strong>
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
                        <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">
                          Actions
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200">
                      {historyRows.map((h, idx) => {
                        const isPurchase = h._raw?.took_package || h._raw?.tookPackage;
                        
                        let guests: any[] = [];
                        const rawGuests = h._raw?.group_customers || h._raw?.guests;
                        if (typeof rawGuests === 'string') {
                            try { guests = JSON.parse(rawGuests); } catch (e) {}
                        } else if (Array.isArray(rawGuests)) {
                            guests = rawGuests;
                        }

                        return (
                          <Fragment key={h.id || idx}>
                            <tr
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
                                <span className="text-gray-900 font-medium">
                                  {h.treatment ?? '—'}
                                </span>
                                {isPurchase && (
                                  <span className="ml-2 text-xs bg-green-100 text-green-800 border border-green-200 px-2 py-0.5 rounded-md font-bold">
                                    Package Taken
                                  </span>
                                )}
                                {h.is_package_customer && (
                                  <span className="ml-2 text-xs bg-red-100 text-red-700 border border-red-200 px-2 py-0.5 rounded-md">
                                    Redeemed
                                  </span>
                                )}
                              </td>
                              <td className="px-4 py-2 whitespace-nowrap text-gray-900 font-medium">
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
                              <td className="px-4 py-2 whitespace-nowrap text-right">
                                  <button onClick={() => handleOpenHistoryEdit(h)} className="text-blue-600 hover:text-blue-800 text-xs font-semibold mr-3 transition">Edit</button>
                                  <button onClick={() => handleOpenHistoryDelete(h)} className="text-red-600 hover:text-red-800 text-xs font-semibold transition">Delete</button>
                              </td>
                            </tr>

                            {/* Render Guests (Indented Rows) */}
                            {guests.map((g: any, gIdx: number) => (
                                <tr key={`${h.id}-guest-${gIdx}`} className="bg-gray-50/30">
                                    <td className="px-4 py-2 pl-10 whitespace-nowrap relative">
                                        <div className="absolute left-4 top-0 bottom-0 border-l-2 border-gray-200"></div>
                                        <div className="absolute left-4 top-1/2 w-4 border-t-2 border-gray-200"></div>
                                        <div className="font-medium text-gray-700 text-xs">
                                            {g.name || 'Guest'} <span className="text-gray-400 font-normal">(Guest)</span>
                                        </div>
                                    </td>
                                    <td className="px-4 py-2 text-xs text-gray-600">
                                        {g.treatment || '—'}
                                    </td>
                                    <td className="px-4 py-2 text-xs text-gray-600 font-medium">
                                        {fmtDuration(g.sessionHours ?? g.session_hours ?? g.duration)}
                                    </td>
                                    <td className="px-4 py-2 text-xs text-gray-600">
                                        {g.therapist_name || '—'}
                                    </td>
                                    <td className="px-4 py-2 text-xs text-gray-400">
                                        {h.outlet_name ?? '—'}
                                    </td>
                                    <td className="px-4 py-2 text-right text-xs text-gray-400">
                                        —
                                    </td>
                                    <td className="px-4 py-2"></td>
                                </tr>
                            ))}
                          </Fragment>
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
                className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 font-medium"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* --- HISTORY ACTION MODALS (Rendered on top of Details Modal z-[60]) --- */}

      {/* Edit History Modal */}
      {isHistoryEditOpen && editingHistoryRow && (
          <div className="fixed inset-0 bg-black/60 z-[60] flex items-center justify-center p-4">
            <form onSubmit={handleSaveHistoryEdit} className="bg-white rounded-xl shadow-2xl max-w-lg w-full p-6">
                <h2 className="text-xl font-bold text-gray-800 mb-4 flex items-center gap-2">
                    <Edit2 size={18} className="text-blue-600" /> Edit Treatment Row
                </h2>

                {historyActionError && (
                    <div className="mb-4 p-2 bg-red-50 border border-red-200 text-red-700 text-sm rounded font-medium">
                        {historyActionError}
                    </div>
                )}

                <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-xs font-bold text-gray-600 uppercase mb-1">Date</label>
                            <input type="date" value={historyEditForm.date || ''} onChange={e => setHistoryEditForm({...historyEditForm, date: e.target.value})} className="w-full border p-2 rounded text-sm text-black" required />
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-gray-600 uppercase mb-1">Treatment</label>
                            <input type="text" value={historyEditForm.treatment || ''} onChange={e => setHistoryEditForm({...historyEditForm, treatment: e.target.value})} className="w-full border p-2 rounded text-sm text-black" required />
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-xs font-bold text-gray-600 uppercase mb-1">Therapist</label>
                            <input type="text" value={historyEditForm.therapist_name || ''} onChange={e => setHistoryEditForm({...historyEditForm, therapist_name: e.target.value})} className="w-full border p-2 rounded text-sm text-black" />
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-gray-600 uppercase mb-1">Main Session Duration</label>
                            <div className="flex gap-2">
                                <input type="number" min="0" placeholder="Hrs" value={historyEditForm.session_hours_h ?? ''} onChange={e => setHistoryEditForm({...historyEditForm, session_hours_h: e.target.value})} className="w-full border p-2 rounded text-sm text-black" required />
                                <input type="number" min="0" max="59" placeholder="Mins" value={historyEditForm.session_hours_m ?? ''} onChange={e => setHistoryEditForm({...historyEditForm, session_hours_m: e.target.value})} className="w-full border p-2 rounded text-sm text-black" required />
                            </div>
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-xs font-bold text-gray-600 uppercase mb-1">Check In Time</label>
                            <input type="time" value={historyEditForm.check_in_time || ''} onChange={e => setHistoryEditForm({...historyEditForm, check_in_time: e.target.value})} className="w-full border p-2 rounded text-sm text-black" />
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-gray-600 uppercase mb-1">Check Out Time</label>
                            <input type="time" value={historyEditForm.check_out_time || ''} onChange={e => setHistoryEditForm({...historyEditForm, check_out_time: e.target.value})} className="w-full border p-2 rounded text-sm text-black" />
                        </div>
                    </div>

                    <div>
                        <label className="block text-xs font-bold text-gray-600 uppercase mb-1">Remark (Required)</label>
                        <textarea value={historyActionRemark} onChange={e => setHistoryActionRemark(e.target.value)} rows={2} className="w-full border p-2 rounded text-sm text-black" placeholder="Why are you editing this row?" required />
                    </div>

                    <div>
                        <label className="block text-xs font-bold text-gray-600 uppercase mb-1">Admin Password</label>
                        <input type="password" value={historyActionPassword} onChange={e => setHistoryActionPassword(e.target.value)} className="w-full border p-2 rounded text-sm text-black" placeholder="admin123" required />
                    </div>
                </div>

                <div className="mt-6 flex justify-end gap-3">
                    <button type="button" onClick={() => setIsHistoryEditOpen(false)} className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 font-medium rounded transition">Cancel</button>
                    <button type="submit" disabled={isHistoryActionLoading} className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded transition">
                        {isHistoryActionLoading ? 'Saving...' : 'Save & Recalculate Sync'}
                    </button>
                </div>
            </form>
          </div>
      )}

      {/* Delete History Modal */}
      {isHistoryDeleteOpen && deletingHistoryRow && (
          <div className="fixed inset-0 bg-black/60 z-[60] flex items-center justify-center p-4">
            <form onSubmit={handleConfirmHistoryDelete} className="bg-white rounded-xl shadow-2xl max-w-sm w-full p-6">
                <h2 className="text-xl font-bold text-red-700 mb-2 flex items-center gap-2">
                    <Trash2 size={20} /> Delete History Row
                </h2>
                
                <p className="text-sm text-gray-600 mb-4">
                    Are you sure you want to delete this visit from <strong>{fmtDate(deletingHistoryRow.date)}</strong>? <br/>
                    <span className="font-semibold text-red-600">The package balance will automatically refund these hours.</span>
                </p>

                {historyActionError && (
                    <div className="mb-4 p-2 bg-red-50 border border-red-200 text-red-700 text-sm rounded font-medium">
                        {historyActionError}
                    </div>
                )}

                <div className="space-y-4">
                    <div>
                        <label className="block text-xs font-bold text-gray-600 uppercase mb-1">Remark (Required)</label>
                        <textarea value={historyActionRemark} onChange={e => setHistoryActionRemark(e.target.value)} rows={2} className="w-full border p-2 rounded text-sm text-black" placeholder="Reason for deletion?" required />
                    </div>

                    <div>
                        <label className="block text-xs font-bold text-gray-600 uppercase mb-1">Admin Password</label>
                        <input type="password" value={historyActionPassword} onChange={e => setHistoryActionPassword(e.target.value)} className="w-full border p-2 rounded text-sm text-black" placeholder="admin123" required />
                    </div>
                </div>

                <div className="mt-6 flex justify-end gap-3">
                    <button type="button" onClick={() => setIsHistoryDeleteOpen(false)} className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 font-medium rounded transition">Cancel</button>
                    <button type="submit" disabled={isHistoryActionLoading} className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white font-medium rounded transition">
                        {isHistoryActionLoading ? 'Deleting...' : 'Confirm Delete'}
                    </button>
                </div>
            </form>
          </div>
      )}

    </div>
  );
}
