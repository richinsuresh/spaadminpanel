'use client';

import React, {
  useState,
  useEffect,
  useCallback,
  useMemo,
  FormEvent,
} from 'react';
import { useUser } from '@/context/UserContext';
import { supabase } from '@/lib/supabase';
import { OUTLETS } from '@/lib/outlet';
import { exportToExcel } from '@/lib/exportToExcel';
import { getISTToday, formatISTTime } from '@/lib/dateTime';
import { Loader2, ChevronDown, ChevronUp, UserPlus, Users, Stethoscope } from 'lucide-react';
import { useActivityLog } from '@/hooks/useActivityLog';
import LastAction from '@/components/LastAction';

/* ===================== TYPES ===================== */

type GroupCustomer = {
  name: string;
  treatment: string;
  therapist_name: string;
  room: string;
  sessionHours?: number | null;
  in_time?: string | null;
  out_time?: string | null;
};

type Sale = {
  id: string;
  date: string;
  name: string;
  mobile: string;
  treatment: string;
  amount_paid: number;
  took_package: boolean;
  package_amount: number;
  check_in_time: string | null;
  check_out_time: string | null;
  room: string | null;
  therapist_name: string | null;
  session_hours: number | null;
  outlet_id: string;
  outlet_name: string;
  package_sold_by: string | null;
  payment_method: string | null;
  is_package_customer: boolean;
  client_type: string | null;

  in_time: string | null;
  out_time: string | null;

  group_customers: GroupCustomer[] | null;

  // Soft-delete flag: true means this row is excluded from Sales Report /
  // totals, but still exists so the Customer List, Customer Profile, and
  // Package Activity pages (which read from this same table) keep showing
  // it. Set via "Delete Sales Only" instead of a permanent delete.
  hidden_from_sales?: boolean | null;
};

type Employee = { id: string; name: string };

/* ===================== HELPERS ===================== */

const decimalToTime = (decimal: number) => {
  const safeDecimal = Number(decimal) || 0;
  const hrs = Math.floor(safeDecimal);
  const mins = Math.round((safeDecimal - hrs) * 60);
  return { hrs, mins };
};

const formatCurrency = (v: number) =>
  new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: 0,
  }).format(v / 100);

const formatTime = (d: string | null) => formatISTTime(d);

const formatPlainTime = (t: string | null | undefined) => {
  if (!t) return '—';
  try {
    const [h, m] = t.split(':');
    const dt = new Date();
    dt.setHours(Number(h), Number(m), 0, 0);
    return dt.toLocaleTimeString('en-IN', {
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return t;
  }
};

const getExpectedCheckoutTime = (inTime: string | null, hrs: number | null) => {
  if (!inTime || !hrs) return null;
  const dt = new Date(inTime);
  if (isNaN(dt.getTime())) return null;
  return new Date(dt.getTime() + hrs * 60 * 60 * 1000);
};

const formatDuration = (h: number | null | undefined) => {
  if (h === null || h === undefined) return '—';
  const n = Number(h);
  if (n === 0) return '—';

  const totalMins = Math.round(n * 60);
  const hrs = Math.floor(totalMins / 60);
  const mins = totalMins % 60;

  if (hrs === 0) return `${mins} mins`;
  if (mins === 0) return `${hrs} hr${hrs > 1 ? 's' : ''}`;
  return `${hrs}hr ${mins}m`;
};

const formatPaymentMethod = (m: string | null, isRedemption?: boolean) => {
  if (isRedemption) return 'REDEMPTION';
  if (!m) return '—';
  return m.toUpperCase();
};

const formatService = (sale: Sale) => {
  if (sale.took_package) return `New Package - ${sale.treatment}`;
  if (sale.is_package_customer) return `Package Redeem - ${sale.treatment}`;
  return sale.treatment;
};

const toInputTime = (d: string | null) => {
  if (!d) return '';
  const date = new Date(d);
  if (isNaN(date.getTime())) return '';
  const h = String(date.getHours()).padStart(2, '0');
  const m = String(date.getMinutes()).padStart(2, '0');
  return `${h}:${m}`;
};

const calculateOutTime = (startTime: string, h: string | number, m: string | number) => {
  if (!startTime) return '';
  const [hoursStr, minutesStr] = startTime.split(':');
  const startH = parseInt(hoursStr, 10);
  const startM = parseInt(minutesStr, 10);

  if (isNaN(startH) || isNaN(startM)) return '';

  const date = new Date();
  date.setHours(startH);
  date.setMinutes(startM);

  const addH = Number(h) || 0;
  const addM = Number(m) || 0;

  date.setHours(date.getHours() + addH);
  date.setMinutes(date.getMinutes() + addM);

  const finalH = String(date.getHours()).padStart(2, '0');
  const finalM = String(date.getMinutes()).padStart(2, '0');
  return `${finalH}:${finalM}`;
};

const toInputDate = (d: string | null): string => {
  if (!d) return '';
  const dt = new Date(d);
  return isNaN(dt.getTime()) ? '' : dt.toISOString().split('T')[0];
};

const getToday = () => getISTToday();

/* ===================== MAIN COMPONENT ===================== */

export default function AdminSalesPage() {
  const { logActivity } = useActivityLog();
  const { user } = useUser();

  const [sales, setSales] = useState<Sale[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [isExporting, setIsExporting] = useState(false);
  const [therapists, setTherapists] = useState<Employee[]>([]); 

  const [startDate, setStartDate] = useState<string>(getToday());
  const [endDate, setEndDate] = useState<string>(getToday());
  const [selectedOutletId, setSelectedOutletId] = useState<string>('all');
  const [selectedTherapistFilter, setSelectedTherapistFilter] = useState<string>('all');
  const [selectedClientTypeFilter, setSelectedClientTypeFilter] = useState<string>('all'); // NEW
  const [selectedPaymentMethodFilter, setSelectedPaymentMethodFilter] = useState<string>('all'); // NEW
  const [sortBy, setSortBy] = useState<'date_desc' | 'date_asc' | 'therapist_asc' | 'therapist_desc' | 'payment_asc' | 'payment_desc'>('date_desc');
  // When on, includes rows previously removed via "Delete Sales Only" so they
  // can be reviewed/restored. These never count toward totals regardless.
  const [showHiddenFromSales, setShowHiddenFromSales] = useState(false);

  // Bulk selection / bulk delete
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isBulkDeleteModalOpen, setIsBulkDeleteModalOpen] = useState(false);
  const [bulkDeletePassword, setBulkDeletePassword] = useState('');
  const [bulkDeleteRemark, setBulkDeleteRemark] = useState('');
  const [bulkDeleteError, setBulkDeleteError] = useState('');
  const [isBulkDeleting, setIsBulkDeleting] = useState(false);
  const [bulkDeleteProgress, setBulkDeleteProgress] = useState<{ done: number; total: number } | null>(null);

  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editingSale, setEditingSale] = useState<Sale | null>(null);

  const [editForm, setEditForm] = useState<any>({});
  const [editPassword, setEditPassword] = useState('');
  const [editRemark, setEditRemark] = useState('');
  const [saveError, setSaveError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [deletePassword, setDeletePassword] = useState('');
  const [deleteRemark, setDeleteRemark] = useState('');
  const [deleteError, setDeleteError] = useState('');
  const [selectedSaleForDelete, setSelectedSaleForDelete] = useState<Sale | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isRestoring, setIsRestoring] = useState<string | null>(null);

  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({});

  const toggleGroup = (id: string) => {
    setExpandedGroups((prev) => ({
      ...prev,
      [id]: !prev[id],
    }));
  };

  /* ===================== FETCH DATA ===================== */

  const fetchTherapists = useCallback(async () => {
    try {
      const { data } = await supabase
        .from('employees')
        .select('id, name')
        .eq('is_active', true)
        .order('name', { ascending: true });
        
      setTherapists((data as Employee[]) || []);
    } catch (e) {
      console.error('Failed to fetch therapists:', e);
      setTherapists([]);
    }
  }, []);

  const fetchSales = useCallback(async () => {
    setLoading(true);
    setFetchError(null);
    try {
      let query = supabase
        .from('customers')
        .select('*')
        .gte('date', startDate)
        .lte('date', endDate)
        .order('check_in_time', { ascending: false })
        .limit(10000);

      if (selectedOutletId !== 'all') {
        query = query.eq('outlet_id', selectedOutletId);
      }

      // By default, rows removed via "Delete Sales Only" stay out of view.
      // Toggling "Show hidden" brings them back for review/restore — totals
      // still never count them (see activeSales below).
      if (!showHiddenFromSales) {
        query = query.or('hidden_from_sales.is.null,hidden_from_sales.eq.false');
      }

      const { data, error } = await query;
      if (error) throw error;
      setSales((data as Sale[]) || []);
    } catch (err: any) {
      console.error('Failed to fetch sales:', err);
      setSales([]);
      setFetchError(
        err?.message === 'Failed to fetch'
          ? 'Network request failed loading sales for this range. Try a narrower date range, or check your connection and retry.'
          : (err?.message || 'Failed to load sales.')
      );
    } finally {
      setLoading(false);
    }
  }, [startDate, endDate, selectedOutletId, showHiddenFromSales]);

  useEffect(() => {
    fetchTherapists();
    fetchSales();
  }, [fetchSales, fetchTherapists]);

  useEffect(() => {
    const channel = supabase
      .channel('admin-sales-customers')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'customers',
        },
        () => {
          fetchSales();
        },
      )
      .subscribe();

    return () => {
      try {
        supabase.removeChannel(channel);
      } catch (e) {
        console.warn('Failed to remove admin realtime channel', e);
      }
    };
  }, [fetchSales]);

  /* ===================== FILTERING & SORTING LOGIC ===================== */

  const filteredSales = useMemo(() => {
    return sales.filter((sale) => {
      // Therapist Filter
      let matchesTherapist = true;
      if (selectedTherapistFilter !== 'all') {
        const matchesMain = sale.therapist_name?.includes(selectedTherapistFilter);
        const matchesGroup = sale.group_customers?.some(gc => gc.therapist_name?.includes(selectedTherapistFilter));
        matchesTherapist = !!(matchesMain || matchesGroup);
      }

      // Client Type Filter
      let matchesClientType = true;
      if (selectedClientTypeFilter !== 'all') {
        const type = (sale.client_type || '').trim().toLowerCase() || 'new';
        matchesClientType = type === selectedClientTypeFilter;
      }

      // Payment Method Filter
      let matchesPaymentMethod = true;
      if (selectedPaymentMethodFilter !== 'all') {
        if (selectedPaymentMethodFilter === 'redemption') {
          matchesPaymentMethod = !!sale.is_package_customer;
        } else {
          const method = (sale.payment_method || '').trim().toLowerCase();
          matchesPaymentMethod = !sale.is_package_customer && method === selectedPaymentMethodFilter;
        }
      }

      return matchesTherapist && matchesClientType && matchesPaymentMethod;
    });
  }, [sales, selectedTherapistFilter, selectedClientTypeFilter, selectedPaymentMethodFilter]);
  
  const sortedSales = useMemo(() => {
    const sortableSales = [...filteredSales];
    const paymentLabel = (s: Sale) => s.is_package_customer ? 'redemption' : (s.payment_method || '').toLowerCase();
    return sortableSales.sort((a, b) => {
      if (sortBy === 'date_desc') {
        return new Date(b.check_in_time || 0).getTime() - new Date(a.check_in_time || 0).getTime();
      }
      if (sortBy === 'date_asc') {
        return new Date(a.check_in_time || 0).getTime() - new Date(b.check_in_time || 0).getTime();
      }
      if (sortBy === 'therapist_asc') {
        return (a.therapist_name || '').localeCompare(b.therapist_name || '');
      }
      if (sortBy === 'therapist_desc') {
        return (b.therapist_name || '').localeCompare(a.therapist_name || '');
      }
      if (sortBy === 'payment_asc') {
        return paymentLabel(a).localeCompare(paymentLabel(b));
      }
      if (sortBy === 'payment_desc') {
        return paymentLabel(b).localeCompare(paymentLabel(a));
      }
      return 0;
    });
  }, [filteredSales, sortBy]);

  // Clear any selections that no longer match the current filters (e.g. the
  // person filtered by "Cash", selected some rows, then switched to "UPI" —
  // selections for rows that are no longer visible get dropped automatically).
  useEffect(() => {
    setSelectedIds(prev => {
      const visibleIds = new Set(sortedSales.map(s => s.id));
      const next = new Set<string>();
      prev.forEach(id => { if (visibleIds.has(id)) next.add(id); });
      return next.size === prev.size ? prev : next;
    });
  }, [sortedSales]);

  const allVisibleSelected = sortedSales.length > 0 && sortedSales.every(s => selectedIds.has(s.id));

  const toggleSelectAll = () => {
    if (allVisibleSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(sortedSales.map(s => s.id)));
    }
  };

  const toggleSelectOne = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  /* ===================== TOTALS ===================== */

  const activeSales = useMemo(
    () => filteredSales.filter((s) => s.check_out_time && !s.hidden_from_sales),
    [filteredSales],
  );

  const totalSales = useMemo(
    () => activeSales.reduce((a, s) => a + (s.took_package ? s.package_amount : s.amount_paid), 0),
    [activeSales],
  );

  const totalCashSales = useMemo(
    () => activeSales.filter((s) => s.payment_method === 'cash' && !s.is_package_customer).reduce((a, s) => a + s.amount_paid, 0),
    [activeSales],
  );

  const totalUpiSales = useMemo(
    () => activeSales.filter((s) => s.payment_method === 'upi' && !s.is_package_customer).reduce((a, s) => a + s.amount_paid, 0),
    [activeSales],
  );

  const totalCardSales = useMemo(
    () => activeSales.filter((s) => s.payment_method === 'card' && !s.is_package_customer).reduce((a, s) => a + s.amount_paid, 0),
    [activeSales],
  );

  const totalPackageSales = useMemo(
    () => activeSales.filter((s) => s.took_package).reduce((a, s) => a + s.package_amount, 0),
    [activeSales],
  );

  const activeSalesCount = useMemo(() => activeSales.length, [activeSales]);

  const newClientsCount = useMemo(() => 
    sales.filter(s => {
      const type = (s.client_type || '').trim().toLowerCase();
      return type === 'new' || type === '';
    }).length, 
    [sales]
  );

  const regularClientsCount = useMemo(() => 
    sales.filter(s => (s.client_type || '').trim().toLowerCase() === 'regular').length, 
    [sales]
  );

  const therapistClientsCount = useMemo(() => 
    sales.filter(s => (s.client_type || '').trim().toLowerCase() === 'therapist').length, 
    [sales]
  );

  const officeClientsCount = useMemo(() => 
    sales.filter(s => (s.client_type || '').trim().toLowerCase() === 'office').length, 
    [sales]
  );

 /* ===================== EDIT ===================== */

  const handleOpenEdit = (sale: Sale) => {
    setEditingSale(sale);
    const tParts = (sale.therapist_name || '').split(' & ');
    const { hrs, mins } = decimalToTime(sale.session_hours || 0);

    let currentOutletId = sale.outlet_id;
    if (!currentOutletId && sale.outlet_name) {
       const matched = OUTLETS.find(o => o.name === sale.outlet_name);
       if (matched) currentOutletId = matched.id;
    }

    setEditForm({
      name: sale.name || '',
      mobile: sale.mobile || '',
      date: toInputDate(sale.date),
      outlet_id: currentOutletId || '',
      client_type: (sale.client_type || 'new').toLowerCase(),
      treatment: sale.treatment || '',
      payment_method: sale.payment_method || 'cash',
      amount: (sale.took_package ? sale.package_amount : sale.amount_paid) / 100,
      therapist_name1: tParts[0] || '',
      therapist_name2: tParts[1] || '',
      room: sale.room || '',
      session_hours_h: hrs,
      session_hours_m: mins,
      check_in_time: toInputTime(sale.check_in_time),
      check_out_time: toInputTime(sale.check_out_time),
    });
    
    setEditRemark('');
    setEditPassword('');
    setSaveError(null);
    setIsEditModalOpen(true);
  };

  const handleEditFormChange = (e: any) => {
    const { name, value } = e.target;
    setEditForm((p: any) => ({ ...p, [name]: value }));
  };

  const handleDurationChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setEditForm((prev: any) => {
      const updated = { ...prev, [name]: value };

      if (updated.check_in_time && prev.check_out_time) {
         updated.check_out_time = calculateOutTime(
            updated.check_in_time, 
            updated.session_hours_h, 
            updated.session_hours_m
         );
      }
      return updated;
    });
  };

  const handleCloseEdit = () => {
    setIsEditModalOpen(false);
    setEditingSale(null);
    setEditRemark('');
    setEditPassword('');
    setSaveError(null);
  };

  const handleSaveEdit = async (e: FormEvent) => {
    e.preventDefault();
    setSaveError(null);

    if (editPassword !== 'admin123') {
      setSaveError('Wrong password');
      return;
    }
    if (!editRemark.trim()) {
      setSaveError('Remark required');
      return;
    }
    if (!editingSale) return;

    const totalHours = (Number(editForm.session_hours_h) || 0) + (Number(editForm.session_hours_m) || 0) / 60;
    if (totalHours < 0) { 
      setSaveError('Duration cannot be negative.');
      return;
    }

    setIsSaving(true);

    const before = { ...editingSale };
    const amountNumber = Number(editForm.amount || 0);

    let newCheckInTime: string | null = editingSale.check_in_time;
    if (editForm.date && editForm.check_in_time) {
      const combined = new Date(`${editForm.date}T${editForm.check_in_time}`);
      if (!isNaN(combined.getTime())) {
        newCheckInTime = combined.toISOString();
      }
    }

    let newCheckOutTime: string | null = editingSale.check_out_time;
    if (editForm.check_out_time) {
        if (editForm.date) {
            const combinedOut = new Date(`${editForm.date}T${editForm.check_out_time}`);
            if (!isNaN(combinedOut.getTime())) {
                newCheckOutTime = combinedOut.toISOString();
            }
        }
    } else {
        newCheckOutTime = null;
    }

    const t1 = editForm.therapist_name1;
    const t2 = editForm.therapist_name2;
    const combinedTherapist = t1 ? (t2 ? `${t1} & ${t2}` : t1) : null;

    let newOutletName = editingSale.outlet_name; 
    const selectedOutlet = OUTLETS.find(o => o.id === editForm.outlet_id);
    if (selectedOutlet) {
        newOutletName = selectedOutlet.name;
    }

    const updates: Partial<Sale> & {
      amount_paid: number;
      package_amount: number;
    } = {
      name: editForm.name,
      mobile: editForm.mobile,
      treatment: editForm.treatment,
      client_type: editForm.client_type,
      therapist_name: combinedTherapist,
      room: editForm.room || null,
      session_hours: totalHours,
      payment_method: editForm.payment_method,
      amount_paid: editingSale.took_package ? 0 : Math.round(amountNumber * 100),
      package_amount: editingSale.took_package ? Math.round(amountNumber * 100) : editingSale.package_amount,
      date: editForm.date,
      outlet_id: editForm.outlet_id,
      outlet_name: newOutletName,
      check_in_time: newCheckInTime,
      check_out_time: newCheckOutTime,
      in_time: null,
      out_time: null,
    };

    const { error } = await supabase
      .from('customers')
      .update(updates)
      .eq('id', editingSale.id);

    if (error) {
      setSaveError(error.message);
      setIsSaving(false);
      return;
    }

    if (before.name !== editForm.name || before.mobile !== editForm.mobile) {
        const { error: pkgError } = await supabase
            .from('packages')
            .update({
                name: editForm.name,
                mobile: editForm.mobile
            })
            .eq('mobile', before.mobile);

        if (pkgError) {
            console.error('Failed to sync package update:', pkgError);
        }
    }

    const after = { ...before, ...updates };

    await supabase.from('activity_logs').insert({
      action_type: 'edit_sale',
      description: JSON.stringify({
        remark: editRemark,
        before,
        after,
      }),
      username: user?.username || 'System',
    });

    setSales(prev => prev.map(s => s.id === editingSale.id ? { ...s, ...updates } as Sale : s));

    setIsEditModalOpen(false);
    setEditingSale(null);
    setEditRemark('');
    setEditPassword('');
    setIsSaving(false);
  };
  
  /* ===================== CHECK OUT ===================== */

  const handleCheckOut = async (id: string) => {
    try {
      const { error } = await supabase
        .from('customers')
        .update({ check_out_time: new Date().toISOString() })
        .eq('id', id);

      if (error) {
        console.error(error);
        alert('Failed to check out');
        return;
      }

      await fetchSales();
    } catch (e: any) {
      console.error(e);
      alert('Failed to check out');
    }
  };

  /* ===================== DELETE ===================== */

  const handleDelete = async (mode: 'hard' | 'soft') => {
    if (!selectedSaleForDelete) return;

    if (deletePassword !== 'admin123') {
      setDeleteError('Wrong Password');
      return;
    }
    if (!deleteRemark.trim()) {
      setDeleteError('Remark required');
      return;
    }

    setIsDeleting(true);

    const before = { ...selectedSaleForDelete };

    try {
      const { error } =
        mode === 'hard'
          ? await supabase.from('customers').delete().eq('id', selectedSaleForDelete.id)
          : await supabase.from('customers').update({ hidden_from_sales: true }).eq('id', selectedSaleForDelete.id);

      if (error) throw error;

      await supabase.from('activity_logs').insert({
        action_type: mode === 'hard' ? 'delete_sale' : 'hide_sale_only',
        description: JSON.stringify({
          remark: deleteRemark,
          before,
          after: mode === 'hard' ? null : { ...before, hidden_from_sales: true },
        }),
        username: user?.username || 'System',
      });

      setIsDeleteModalOpen(false);
      setSelectedSaleForDelete(null);
      setDeletePassword('');
      setDeleteRemark('');
      setDeleteError('');
      await fetchSales();
    } catch (err: any) {
      // A raw "Failed to fetch" here means the network request itself died
      // (dropped connection, ad-blocker, etc.) rather than Supabase returning
      // a proper error — still worth surfacing instead of leaving the button
      // stuck forever.
      setDeleteError(err?.message === 'Failed to fetch'
        ? 'Network request failed — check your connection and try again.'
        : (err?.message || 'Something went wrong. Please try again.'));
    } finally {
      setIsDeleting(false);
    }
  };

  const handleRestoreToSales = async (sale: Sale) => {
    setIsRestoring(sale.id);
    try {
      const { error } = await supabase.from('customers').update({ hidden_from_sales: false }).eq('id', sale.id);
      if (error) throw error;
      await supabase.from('activity_logs').insert({
        action_type: 'restore_sale',
        description: JSON.stringify({ before: { ...sale, hidden_from_sales: true }, after: { ...sale, hidden_from_sales: false } }),
        username: user?.username || 'System',
      });
      await fetchSales();
    } catch (err: any) {
      alert('Failed to restore: ' + (err?.message === 'Failed to fetch'
        ? 'Network request failed — check your connection and try again.'
        : (err?.message || 'Unknown error')));
    } finally {
      setIsRestoring(null);
    }
  };

  /* ===================== BULK DELETE ===================== */

  // Supabase/PostgREST builds `.in('id', [...])` as a URL query parameter
  // containing every ID. With a wide date range (e.g. 9 months) that can be
  // several thousand rows — the resulting URL gets long enough that the
  // browser or a proxy in between simply refuses to send it, which surfaces
  // as a generic "TypeError: Failed to fetch" with no useful detail. Batching
  // into small chunks keeps every individual request small and reliable.
  const BULK_DELETE_CHUNK_SIZE = 150;

  const chunkArray = <T,>(arr: T[], size: number): T[][] => {
    const chunks: T[][] = [];
    for (let i = 0; i < arr.length; i += size) chunks.push(arr.slice(i, i + size));
    return chunks;
  };

  const handleBulkDelete = async (mode: 'hard' | 'soft') => {
    if (selectedIds.size === 0) return;

    if (bulkDeletePassword !== 'admin123') {
      setBulkDeleteError('Wrong Password');
      return;
    }
    if (!bulkDeleteRemark.trim()) {
      setBulkDeleteError('Remark required');
      return;
    }

    setIsBulkDeleting(true);
    setBulkDeleteError('');

    const idsToDelete = Array.from(selectedIds);
    const salesBeingDeleted = sales.filter((s) => selectedIds.has(s.id));
    const batches = chunkArray(idsToDelete, BULK_DELETE_CHUNK_SIZE);
    const succeededIds: string[] = [];

    try {
      for (let i = 0; i < batches.length; i++) {
        setBulkDeleteProgress({ done: succeededIds.length, total: idsToDelete.length });
        const batch = batches[i];

        const { error } =
          mode === 'hard'
            ? await supabase.from('customers').delete().in('id', batch)
            : await supabase.from('customers').update({ hidden_from_sales: true }).in('id', batch);

        if (error) throw error;
        succeededIds.push(...batch);
      }

      setBulkDeleteProgress({ done: succeededIds.length, total: idsToDelete.length });

      await supabase.from('activity_logs').insert({
        action_type: mode === 'hard' ? 'bulk_delete_sales' : 'bulk_hide_sales_only',
        description: JSON.stringify({
          remark: bulkDeleteRemark,
          count: succeededIds.length,
          payment_method_filter: selectedPaymentMethodFilter,
          before: salesBeingDeleted,
        }),
        username: user?.username || 'System',
      });

      setIsBulkDeleteModalOpen(false);
      setBulkDeletePassword('');
      setBulkDeleteRemark('');
      setBulkDeleteError('');
      setSelectedIds(new Set());
    } catch (err: any) {
      // Some batches may have already succeeded before this one failed —
      // log what actually went through so it isn't silently lost, and tell
      // the admin exactly how far it got instead of a generic failure.
      if (succeededIds.length > 0) {
        await supabase.from('activity_logs').insert({
          action_type: mode === 'hard' ? 'bulk_delete_sales' : 'bulk_hide_sales_only',
          description: JSON.stringify({
            remark: bulkDeleteRemark,
            count: succeededIds.length,
            partial: true,
            payment_method_filter: selectedPaymentMethodFilter,
            before: salesBeingDeleted.filter((s) => succeededIds.includes(s.id)),
          }),
          username: user?.username || 'System',
        });
        setSelectedIds((prev) => {
          const next = new Set(prev);
          succeededIds.forEach((id) => next.delete(id));
          return next;
        });
      }

      const friendly = err?.message === 'Failed to fetch'
        ? 'Network request failed partway through.'
        : (err?.message || 'Something went wrong.');
      setBulkDeleteError(
        succeededIds.length > 0
          ? `${friendly} ${succeededIds.length} of ${idsToDelete.length} were processed before this happened — those are already done, the rest are still selected. Try again for the remainder.`
          : `${friendly} Nothing was deleted — try again, or try a smaller date range / fewer selected rows at once.`
      );
    } finally {
      setBulkDeleteProgress(null);
      await fetchSales();
      setIsBulkDeleting(false);
    }
  };

  /* ===================== EXPORT ===================== */

  const handleExport = async () => {
    if (sortedSales.length === 0) {
      alert('No sales to export for the selected filters.');
      return;
    }

    setIsExporting(true);
    try {
      const buildRow = (sale: Sale) => {
        const amountPaise = sale.took_package
          ? sale.package_amount
          : sale.amount_paid;
        const amountRupees = amountPaise / 100;

        const groupCount = sale.group_customers
          ? sale.group_customers.length
          : 0;
        const totalGuests = 1 + groupCount;

        const groupDetails = sale.group_customers
          ? sale.group_customers
              .map((gc, idx) => {
                const guestName = gc.name || `Guest ${idx + 2}`;
                const dur =
                  gc.sessionHours && gc.sessionHours > 0
                    ? `${gc.sessionHours}h`
                    : '';
                return `${guestName} - ${gc.treatment || '—'}${
                  dur ? ` (${dur})` : ''
                }`;
              })
              .join(' | ')
          : '';

        const mainInDisplay = sale.in_time
          ? sale.in_time
          : sale.check_in_time
          ? formatISTTime(sale.check_in_time)
          : '';

        const mainOutDisplay = sale.out_time
          ? sale.out_time
          : sale.check_out_time
          ? formatISTTime(sale.check_out_time)
          : '';

        return {
          Date: sale.date,
          Outlet: sale.outlet_name,
          CustomerName: sale.name,
          Mobile: sale.mobile,
          ClientType: sale.client_type || 'New',
          ServiceType: formatService(sale),
          Treatment: sale.treatment,
          SessionHours: sale.session_hours ?? '',
          GuestsCount: totalGuests,
          GroupDetails: groupDetails,
          Amount: amountRupees,
          PaymentMethod: sale.is_package_customer 
            ? 'REDEMPTION' 
            : (sale.payment_method ? sale.payment_method.toUpperCase() : ''),
          TookPackage: sale.took_package ? 'YES' : 'NO',
          PackageAmount: sale.took_package ? amountRupees : '',
          IsPackageCustomer: sale.is_package_customer ? 'YES' : 'NO',
          PackageSoldBy: sale.package_sold_by || '',
          CheckIn: sale.check_in_time || '',
          CheckOut: sale.check_out_time || '',
          InTimeDisplay: mainInDisplay,
          OutTimeDisplay: mainOutDisplay,
          Therapist: sale.therapist_name || '',
          Room: sale.room || '',
        };
      };

      const allSalesRows = sortedSales.map(buildRow);

      const outletSheets: Record<string, any[]> = {};
      sortedSales.forEach((sale) => {
        const key = sale.outlet_name || 'Unknown Outlet';
        if (!outletSheets[key]) outletSheets[key] = [];
        outletSheets[key].push(buildRow(sale));
      });

      const summaryRows = [
        { Metric: 'Date Range', Value: `${startDate} to ${endDate}` },
        { Metric: 'Outlet Filter', Value: selectedOutletId === 'all' ? 'All Outlets' : OUTLETS.find((o) => o.id === selectedOutletId)?.name || selectedOutletId },
        { Metric: 'Therapist Filter', Value: selectedTherapistFilter === 'all' ? 'All Therapists' : selectedTherapistFilter },
        { Metric: 'Client Type Filter', Value: selectedClientTypeFilter === 'all' ? 'All Types' : selectedClientTypeFilter.toUpperCase() },
        {},
        { Metric: 'Total Completed Sales (₹)', Value: totalSales / 100 },
        { Metric: 'Total Cash Sales (₹)', Value: totalCashSales / 100 },
        { Metric: 'Total UPI Sales (₹)', Value: totalUpiSales / 100 },
        { Metric: 'Total Card Sales (₹)', Value: totalCardSales / 100 },
        { Metric: 'Total Package Value (₹)', Value: totalPackageSales / 100 },
        { Metric: 'Number of Completed Sessions', Value: activeSalesCount },
      ];

      const workbookData: Record<string, any[]> = {
        Summary: summaryRows,
        'All Sales': allSalesRows,
        ...outletSheets,
      };

      exportToExcel(workbookData, `Sales_${startDate}_to_${endDate}.xlsx`);
      logActivity('export_sales', 'Downloaded Sales');
    } catch (e: any) {
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
        Admin Live Dashboard &amp; Sales
      </h1>

      {fetchError && (
        <div className="p-4 bg-red-50 text-red-700 border border-red-200 rounded-xl text-sm flex items-center justify-between gap-4">
          <span>{fetchError}</span>
          <button onClick={fetchSales} className="px-3 py-1.5 bg-red-700 text-white rounded-lg text-xs font-medium shrink-0">
            Retry
          </button>
        </div>
      )}

      {/* Filters */}
      <div className="bg-white p-4 rounded-xl shadow-sm grid grid-cols-1 md:grid-cols-4 lg:grid-cols-8 gap-4 items-end">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Outlet
          </label>
          <select
            value={selectedOutletId}
            onChange={(e) => setSelectedOutletId(e.target.value)}
            className="w-full px-3 py-2 border rounded-lg bg-white text-black focus:outline-none focus:ring-0 focus:text-black"
          >
            <option value="all" className="text-black">All Outlets</option>
            {OUTLETS.map((o) => (
              <option key={o.id} value={o.id} className="text-black">{o.name}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Start Date
          </label>
          <input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="w-full px-3 py-2 border rounded-lg text-black bg-white"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            End Date
          </label>
          <input
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            className="w-full px-3 py-2 border rounded-lg text-black bg-white"
          />
        </div>

        {/* CLIENT TYPE FILTER */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Client Type
          </label>
          <select
            value={selectedClientTypeFilter}
            onChange={(e) => setSelectedClientTypeFilter(e.target.value)}
            className="w-full px-3 py-2 border rounded-lg bg-white text-black focus:outline-none focus:ring-0"
          >
            <option value="all">All Types</option>
            <option value="new">New</option>
            <option value="regular">Regular</option>
            <option value="therapist">Therapist</option>
            <option value="office">Office</option>
          </select>
        </div>

        {/* PAYMENT METHOD FILTER */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Payment Method
          </label>
          <select
            value={selectedPaymentMethodFilter}
            onChange={(e) => setSelectedPaymentMethodFilter(e.target.value)}
            className="w-full px-3 py-2 border rounded-lg bg-white text-black focus:outline-none focus:ring-0"
          >
            <option value="all">All Payment Methods</option>
            <option value="cash">Cash</option>
            <option value="upi">UPI</option>
            <option value="card">Card</option>
            <option value="bank_transfer">Bank Transfer</option>
            <option value="redemption">Redemption</option>
          </select>
        </div>

        {/* THERAPIST FILTER */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Therapist Filter
          </label>
          <select
            value={selectedTherapistFilter}
            onChange={(e) => setSelectedTherapistFilter(e.target.value)}
            className="w-full px-3 py-2 border rounded-lg bg-white text-black focus:outline-none focus:ring-0"
          >
            <option value="all" className="text-black">All Therapists</option>
            {therapists.map((t) => (
              <option key={t.id} value={t.name} className="text-black">
                {t.name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Sort By
          </label>
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as any)}
            className="w-full px-3 py-2 border rounded-lg bg-white text-black focus:outline-none focus:ring-0"
          >
            <option value="date_desc">Date (Newest First)</option>
            <option value="date_asc">Date (Oldest First)</option>
            <option value="therapist_asc">Therapist (A to Z)</option>
            <option value="therapist_desc">Therapist (Z to A)</option>
            <option value="payment_asc">Payment Method (A to Z)</option>
            <option value="payment_desc">Payment Method (Z to A)</option>
          </select>
        </div>

        <div className="flex flex-col gap-1">
          <button
            onClick={handleExport}
            disabled={loading || isExporting}
            className="w-full px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50"
          >
            {isExporting ? 'Exporting…' : 'Export to Excel'}
          </button>
          <LastAction actionType="export_sales" />
        </div>
      </div>

      {/* Bulk selection bar — appears once at least one row is checked.
          Typical flow for "delete all sales by a payment method": set the
          Payment Method filter above, click "Select all N filtered rows",
          then Delete Selected. */}
      <div className="bg-white p-4 rounded-xl shadow-sm flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-4">
          <label className="flex items-center gap-2 text-sm text-gray-700 select-none cursor-pointer">
            <input
              type="checkbox"
              checked={allVisibleSelected}
              onChange={toggleSelectAll}
              className="h-4 w-4"
            />
            {allVisibleSelected ? 'Unselect all' : `Select all ${sortedSales.length} filtered rows`}
          </label>
          <label className="flex items-center gap-2 text-sm text-gray-500 select-none cursor-pointer">
            <input
              type="checkbox"
              checked={showHiddenFromSales}
              onChange={(e) => setShowHiddenFromSales(e.target.checked)}
              className="h-4 w-4"
            />
            Show entries removed via "Delete Sales Only"
          </label>
        </div>

        {selectedIds.size > 0 && (
          <div className="flex items-center gap-3">
            <span className="text-sm font-medium text-gray-700">{selectedIds.size} selected</span>
            <button
              onClick={() => {
                setBulkDeleteError('');
                setBulkDeletePassword('');
                setBulkDeleteRemark('');
                setIsBulkDeleteModalOpen(true);
              }}
              className="px-4 py-2 bg-red-700 text-white rounded-lg hover:bg-red-800 text-sm font-medium"
            >
              Delete Selected ({selectedIds.size})
            </button>
          </div>
        )}
      </div>

      {/* Totals */}
      <div className="bg-white p-6 rounded-xl shadow-sm">
        <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-6">
          <div>
            <h3 className="text-gray-500 text-sm">Total Completed Sales</h3>
            <p className="text-2xl mt-2 font-bold text-green-600">
              {formatCurrency(totalSales)}
            </p>
            <p className="text-xs text-gray-500">
              {activeSalesCount} sessions
            </p>
          </div>
          <div>
            <h3 className="text-gray-500 text-sm">Total Cash Sales</h3>
            <p className="text-2xl mt-2 font-bold text-blue-600">
              {formatCurrency(totalCashSales)}
            </p>
          </div>
          <div>
            <h3 className="text-gray-500 text-sm">Total UPI Sales</h3>
            <p className="text-2xl mt-2 font-bold text-purple-600">
              {formatCurrency(totalUpiSales)}
            </p>
          </div>
          <div>
            <h3 className="text-gray-500 text-sm">Total Card Sales</h3>
            <p className="text-2xl mt-2 font-bold text-indigo-600">
              {formatCurrency(totalCardSales)}
            </p>
          </div>
          <div>
            <h3 className="text-gray-500 text-sm">Total Package Value</h3>
            <p className="text-2xl mt-2 font-bold text-gray-600">
              {formatCurrency(totalPackageSales)}
            </p>
          </div>
        </div>
      </div>

      {/* Client Category Counts */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <div className="bg-white p-5 rounded-xl shadow-sm border-l-4 border-orange-500 flex items-center justify-between">
          <div>
            <h3 className="text-gray-500 text-xs font-semibold uppercase">New Clients</h3>
            <p className="text-3xl font-bold text-gray-800">{newClientsCount}</p>
          </div>
          <UserPlus className="text-orange-200 h-10 w-10" />
        </div>

        <div className="bg-white p-5 rounded-xl shadow-sm border-l-4 border-blue-500 flex items-center justify-between">
          <div>
            <h3 className="text-gray-500 text-xs font-semibold uppercase">Regular</h3>
            <p className="text-3xl font-bold text-gray-800">{regularClientsCount}</p>
          </div>
          <Users className="text-blue-200 h-10 w-10" />
        </div>

        <div className="bg-white p-5 rounded-xl shadow-sm border-l-4 border-indigo-600 flex items-center justify-between">
          <div>
            <h3 className="text-gray-500 text-xs font-semibold uppercase">Therapist</h3>
            <p className="text-3xl font-bold text-gray-800">{therapistClientsCount}</p>
          </div>
          <Stethoscope className="text-indigo-200 h-10 w-10" />
        </div>

        <div className="bg-white p-5 rounded-xl shadow-sm border-l-4 border-gray-600 flex items-center justify-between">
          <div>
            <h3 className="text-gray-500 text-xs font-semibold uppercase">Office</h3>
            <p className="text-3xl font-bold text-gray-800">{officeClientsCount}</p>
          </div>
          <Users className="text-gray-200 h-10 w-10" />
        </div>
      </div>

      {/* Sales Table */}
      <div className="bg-white shadow rounded-lg overflow-hidden mt-6">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-3 py-2 text-left text-xs font-bold text-gray-600 uppercase">
                  <input
                    type="checkbox"
                    checked={allVisibleSelected}
                    onChange={toggleSelectAll}
                    className="h-4 w-4"
                  />
                </th>
                <th className="px-3 py-2 text-left text-xs font-bold text-gray-600 uppercase">Customer</th>
                <th className="px-3 py-2 text-left text-xs font-bold text-gray-600 uppercase">Type</th>
                <th className="px-3 py-2 text-left text-xs font-bold text-gray-600 uppercase">Outlet</th>
                <th className="px-3 py-2 text-left text-xs font-bold text-gray-600 uppercase">Sale Date</th>
                <th className="px-3 py-2 text-left text-xs font-bold text-gray-600 uppercase">Service / Group Details</th>
                <th className="px-3 py-2 text-left text-xs font-bold text-gray-600 uppercase">Amount</th>
                <th className="px-3 py-2 text-left text-xs font-bold text-gray-600 uppercase">Payment</th>
                <th className="px-3 py-2 text-left text-xs font-bold text-gray-600 uppercase">Time (Main)</th>
                <th className="px-3 py-2 text-left text-xs font-bold text-gray-600 uppercase">Therapist (Main)</th>
                <th className="px-3 py-2 text-left text-xs font-bold text-gray-600 uppercase">Room (Main)</th>
                <th className="px-3 py-2 text-left text-xs font-bold text-gray-600 uppercase">Action</th>
              </tr>
            </thead>

            <tbody className="bg-white divide-y divide-gray-200">
              {loading ? (
                <tr>
                  <td colSpan={12} className="p-6 text-center text-gray-500">Loading…</td>
                </tr>
              ) : sortedSales.length === 0 ? (
                <tr>
                  <td colSpan={12} className="p-6 text-center text-gray-500">No sales found for these filters.</td>
                </tr>
              ) : (
                sortedSales.map((sale) => {
                  const groupCount = sale.group_customers ? sale.group_customers.length : 0;
                  const totalGuests = 1 + groupCount;
                  const customerLabel = groupCount > 0 ? `${sale.name} + ${groupCount} more` : sale.name;
                  const isGroupExpanded = !!expandedGroups[sale.id];

                  const mainInDisplay = sale.in_time ? formatPlainTime(sale.in_time) : formatTime(sale.check_in_time);
                  const hasManualOut = !!sale.out_time;
                  const mainOutDisplay = hasManualOut
                    ? formatPlainTime(sale.out_time)
                    : sale.check_out_time
                    ? formatTime(sale.check_out_time)
                    : (() => {
                        const expected = getExpectedCheckoutTime(sale.check_in_time, sale.session_hours);
                        return expected ? formatTime(expected.toISOString()) : '—';
                      })();

                  const showEstimated = !sale.out_time && !sale.check_out_time;
                  const cType = (sale.client_type || '').trim().toLowerCase();
                  const displayType = cType === '' ? 'new' : cType;

                  return (
                    <tr key={sale.id} className={sale.hidden_from_sales ? 'bg-amber-50' : sale.check_out_time ? 'bg-gray-50 opacity-60' : ''}>
                      <td className="px-3 py-2 text-xs align-top">
                        <input
                          type="checkbox"
                          checked={selectedIds.has(sale.id)}
                          onChange={() => toggleSelectOne(sale.id)}
                          className="h-4 w-4"
                        />
                      </td>
                      <td className="px-3 py-2 text-xs align-top">
                        <div className="font-medium text-black">{customerLabel}</div>
                        <div className="text-black">{sale.mobile}</div>
                        {totalGuests > 1 && <div className="text-[11px] text-gray-500 mt-0.5">Group of {totalGuests}</div>}
                        {sale.hidden_from_sales && (
                          <div className="text-[10px] font-bold uppercase text-amber-700 bg-amber-100 inline-block px-1.5 py-0.5 rounded mt-1">
                            Removed from Sales
                          </div>
                        )}
                      </td>

                      <td className="px-3 py-2 text-xs align-top">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                          displayType === 'regular' ? 'bg-blue-100 text-blue-700' :
                          displayType === 'therapist' ? 'bg-indigo-100 text-indigo-700' :
                          displayType === 'office' ? 'bg-gray-200 text-gray-800' :
                          'bg-orange-100 text-orange-700'
                        }`}>
                          {displayType}
                        </span>
                      </td>

                      <td className="px-3 py-2 text-xs text-black align-top">{sale.outlet_name}</td>
                      <td className="px-3 py-2 text-xs text-black align-top">{toInputDate(sale.date)}</td>

                      <td className="px-3 py-2 text-xs max-w-xs text-black align-top">
                        <div className="flex items-start justify-between gap-2">
                          <div className="text-black font-semibold">{formatService(sale)}</div>
                          {groupCount > 0 && (
                            <button
                              type="button"
                              onClick={() => toggleGroup(sale.id)}
                              className="flex items-center gap-1 text-[11px] px-2 py-1 rounded-full border border-gray-300 text-gray-700 hover:bg-gray-100"
                            >
                              {isGroupExpanded ? <><ChevronUp className="h-3 w-3" />Hide group</> : <><ChevronDown className="h-3 w-3" />View group ({groupCount})</>}
                            </button>
                          )}
                        </div>

                        <div className="mt-2 space-y-1 text-[11px] text-gray-700">
                          <div>
                            <span className="font-semibold text-gray-800">Main:</span> {sale.treatment || '—'} · {formatDuration(sale.session_hours)} · {sale.therapist_name || '—'} · Room {sale.room || '—'} · In {mainInDisplay} / Out {mainOutDisplay}
                          </div>
                        </div>

                        {sale.group_customers && sale.group_customers.length > 0 && isGroupExpanded && (
                          <div className="mt-2 pt-2 border-t border-gray-200 space-y-1 text-[11px] text-gray-700">
                            <div className="font-semibold text-gray-800">Group Members:</div>
                            {sale.group_customers.map((gc, idx) => (
                              <div key={idx}>
                                <span className="font-medium">{gc.name || `Guest ${idx + 2}`}</span>{': '}
                                {gc.treatment || '—'} · {formatDuration(gc.sessionHours)} · {gc.therapist_name || '—'} · Room {gc.room || '—'} · In {formatPlainTime(gc.in_time)} / Out {formatPlainTime(gc.out_time)}
                              </div>
                            ))}
                          </div>
                        )}
                      </td>

                      <td className="px-3 py-2 text-xs font-bold text-black align-top">
                        {formatCurrency(sale.took_package ? sale.package_amount : sale.amount_paid)}
                      </td>

                      <td className="px-3 py-2 text-xs text-black align-top">
                        {formatPaymentMethod(sale.payment_method, sale.is_package_customer)}
                      </td>

                      <td className="px-3 py-2 text-xs text-black align-top">
                        <div>In: {mainInDisplay}</div>
                        {showEstimated ? <div className="text-black">Est: {mainOutDisplay}</div> : <div>Out: {mainOutDisplay}</div>}
                      </td>

                      <td className="px-3 py-2 text-xs text-black align-top">{sale.therapist_name || '—'}</td>
                      <td className="px-3 py-2 text-xs text-black align-top">{sale.room || '—'}</td>

                      <td className="px-3 py-2 text-xs align-top">
                        <div className="flex flex-col gap-1">
                          {sale.hidden_from_sales ? (
                            <button
                              onClick={() => handleRestoreToSales(sale)}
                              disabled={isRestoring === sale.id}
                              className="px-3 py-1 bg-amber-100 text-amber-800 rounded-lg hover:bg-amber-200 disabled:opacity-50"
                            >
                              {isRestoring === sale.id ? 'Restoring…' : 'Restore to Sales'}
                            </button>
                          ) : (
                            <>
                              <button onClick={() => handleOpenEdit(sale)} className="px-3 py-1 bg-blue-100 text-blue-700 rounded-lg hover:bg-blue-200">
                                Edit
                              </button>
                              {!sale.check_out_time && (
                                <button onClick={() => handleCheckOut(sale.id)} className="px-3 py-1 bg-green-600 text-white rounded-lg hover:bg-green-700">
                                  Check Out
                                </button>
                              )}
                              <button
                                onClick={() => {
                                  setSelectedSaleForDelete(sale);
                                  setDeleteError('');
                                  setDeletePassword('');
                                  setDeleteRemark('');
                                  setIsDeleteModalOpen(true);
                                }}
                                className="px-3 py-1 bg-red-700 text-white rounded-lg hover:bg-red-800"
                              >
                                Delete
                              </button>
                            </>
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

      {/* EDIT MODAL - (Unchanged, keep as provided in your original file) */}
      {isEditModalOpen && (
        <div className="fixed inset-0 bg-black/20 flex items-center justify-center p-4 z-50">
          <form onSubmit={handleSaveEdit} className="bg-white text-black rounded-xl w-full max-w-lg p-6 shadow-xl border border-gray-200">
            <h2 className="text-xl font-bold border-b pb-2 text-black">Edit Sale Details</h2>

            {saveError && <div className="p-3 bg-red-100 text-red-700 border border-red-300 rounded">{saveError}</div>}

            <div className="grid grid-cols-2 gap-4 mt-4">
              <div>
                <label className="text-xs font-semibold text-black">Name</label>
                <input type="text" name="name" value={editForm.name} onChange={handleEditFormChange} className="w-full p-2 border rounded text-black bg-white" required />
              </div>

              <div>
                <label className="text-xs font-semibold text-black">Mobile</label>
                <input type="text" name="mobile" value={editForm.mobile} onChange={handleEditFormChange} className="w-full p-2 border rounded text-black bg-white" required />
              </div>

              <div>
                <label className="text-xs font-semibold text-black">Outlet</label>
                <select name="outlet_id" value={editForm.outlet_id} onChange={handleEditFormChange} className="w-full p-2 border rounded bg-white text-black focus:outline-none focus:ring-0 focus:text-black">
                  {OUTLETS.map((o) => <option key={o.id} value={o.id} className="text-black">{o.name}</option>)}
                </select>
              </div>

              <div>
                <label className="text-xs font-semibold text-black">Date</label>
                <input type="date" name="date" value={editForm.date} onChange={handleEditFormChange} className="w-full p-2 border rounded text-black bg-white" required />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4 mt-4">
              <div>
                <label className="text-xs font-semibold text-black">Treatment</label>
                <input type="text" name="treatment" value={editForm.treatment} onChange={handleEditFormChange} className="w-full p-2 border rounded text-black bg-white" required />
              </div>

              <div>
                <label className="text-xs font-semibold text-black">Client Category</label>
                <select name="client_type" value={editForm.client_type || 'new'} onChange={handleEditFormChange} className="w-full p-2 border rounded bg-white text-black focus:outline-none focus:ring-0 focus:text-black">
                  <option value="new" className="text-black">New Client</option>
                  <option value="regular" className="text-black">Regular Client</option>
                  <option value="therapist" className="text-black">Therapist Reference</option>
                  <option value="office" className="text-black">Office Client</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4 mt-4">
              <div>
                <label className="text-xs font-semibold text-black">Amount (₹)</label>
                <input type="number" name="amount" value={editForm.amount as number | ''} onChange={handleEditFormChange} className="w-full p-2 border rounded text-black bg-white" required />
              </div>

              <div>
                <label className="text-xs font-semibold text-black">Payment Method</label>
                <select name="payment_method" value={editForm.payment_method} onChange={handleEditFormChange} className="w-full p-2 border rounded bg-white text-black">
                  <option value="cash" className="text-black">Cash</option>
                  <option value="card" className="text-black">Card</option>
                  <option value="upi" className="text-black">UPI</option>
                  <option value="package" className="text-black">Package Redemption</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-4 mt-4">
              <div className="col-span-2">
                <label className="text-xs font-semibold text-black">Therapist 1</label>
                <select name="therapist_name1" value={editForm.therapist_name1 ?? ''} onChange={handleEditFormChange} className="w-full p-2 border rounded bg-white text-black mb-2">
                  <option value="">— Select Therapist —</option>
                  {therapists.map((t) => <option key={t.id} value={t.name}>{t.name}</option>)}
                </select>

                <label className="text-xs font-semibold text-black">Therapist 2 (Optional)</label>
                <select name="therapist_name2" value={editForm.therapist_name2 ?? ''} onChange={handleEditFormChange} className="w-full p-2 border rounded bg-white text-black">
                  <option value="">— None —</option>
                  {therapists.map((t) => <option key={`edit-sec-${t.id}`} value={t.name}>{t.name}</option>)}
                </select>
              </div>

              <div>
                <label className="text-xs font-semibold text-black">Room</label>
                <input type="text" name="room" value={editForm.room ?? ''} onChange={handleEditFormChange} className="w-full p-2 border rounded text-black bg-white" />
              </div>
            </div>

            <div className="mt-4">
              <label className="text-xs font-semibold text-black">Duration</label>
              <div className="flex gap-2">
                <div className="relative w-1/2">
                  <input type="number" placeholder="Hrs" name="session_hours_h" value={editForm.session_hours_h ?? ''} onChange={handleDurationChange} className="w-full p-2 border rounded text-black bg-white pr-8" min="0" />
                  <span className="absolute right-2 top-2 text-xs text-gray-400 font-bold">HR</span>
                </div>
                <div className="relative w-1/2">
                  <input type="number" placeholder="Mins" name="session_hours_m" value={editForm.session_hours_m ?? ''} onChange={handleDurationChange} className="w-full p-2 border rounded text-black bg-white pr-8" min="0" />
                  <span className="absolute right-2 top-2 text-xs text-gray-400 font-bold">MIN</span>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4 mt-4">
              <div>
                <label className="text-xs font-semibold text-black">Check-In Time</label>
                <input type="time" name="check_in_time" value={editForm.check_in_time || ''} onChange={handleEditFormChange} className="w-full p-2 border rounded text-black bg-white" />
              </div>
              <div>
                <label className="text-xs font-semibold text-black">Check-Out Time</label>
                <input type="time" name="check_out_time" value={editForm.check_out_time || ''} onChange={handleEditFormChange} className="w-full p-2 border rounded text-black bg-white" />
              </div>
            </div>

            <div className="mt-4">
              <label className="text-xs font-semibold text-black">What did you edit? (Required)</label>
              <textarea rows={3} className="w-full p-2 border border-gray-300 rounded bg-white text-black placeholder-gray-500" value={editRemark} onChange={(e) => setEditRemark(e.target.value)} required />
            </div>

            <div className="pt-4 border-t mt-4">
              <label className="text-xs font-bold text-black">Admin Password</label>
              <input type="password" value={editPassword} onChange={(e) => setEditPassword(e.target.value)} className="w-full p-2 border rounded border-gray-300 text-black bg-white" placeholder="Enter admin123" />
            </div>

            <div className="flex justify-end gap-3 pt-2 mt-4">
              <button type="button" onClick={handleCloseEdit} className="px-4 py-2 bg-gray-200 rounded hover:bg-gray-300 text-black">Cancel</button>
              <button type="submit" disabled={isSaving} className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700">
                {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Save Changes'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* DELETE MODAL */}
      {isDeleteModalOpen && (
        <div className="fixed inset-0 bg-black/20 flex items-center justify-center p-4 z-50">
          <div className="bg-white text-black rounded-xl w-full max-w-md p-6 shadow-xl border border-gray-200 space-y-4">
            <h2 className="text-xl font-bold text-black">Delete Sale</h2>
            {deleteError && <div className="p-2 bg-red-100 text-red-700 border border-red-300 rounded">{deleteError}</div>}
            <p className="text-sm text-gray-700">You are deleting: <strong className="text-black">{selectedSaleForDelete?.name}</strong></p>
            <div className="p-3 bg-blue-50 border border-blue-100 rounded-lg text-xs text-blue-900">
              <strong>Delete Sales Only</strong> removes this entry from the Sales Report and revenue
              totals, but keeps it visible on the Customer List, Customer Profile, and Package
              Activity pages. <strong>Delete Permanently</strong> removes it everywhere and can't be undone.
            </div>
            <div>
              <label className="text-xs font-semibold text-black">Admin Password</label>
              <input type="password" className="w-full p-2 border border-gray-300 rounded bg-white text-black" value={deletePassword} onChange={(e) => setDeletePassword(e.target.value)} />
            </div>
            <div>
              <label className="text-xs font-semibold text-black">Reason for deleting</label>
              <textarea rows={3} className="w-full p-2 border border-gray-300 rounded bg-white text-black" value={deleteRemark} onChange={(e) => setDeleteRemark(e.target.value)} required />
            </div>
            <div className="flex justify-end gap-3 pt-2 mt-4 flex-wrap">
              <button onClick={() => setIsDeleteModalOpen(false)} className="px-4 py-2 bg-gray-200 rounded text-black">Cancel</button>
              <button onClick={() => handleDelete('soft')} disabled={isDeleting} className="px-4 py-2 bg-amber-600 text-white rounded disabled:opacity-50">
                {isDeleting ? 'Working…' : 'Delete Sales Only'}
              </button>
              <button onClick={() => handleDelete('hard')} disabled={isDeleting} className="px-4 py-2 bg-red-700 text-white rounded disabled:opacity-50">
                {isDeleting ? 'Working…' : 'Delete Permanently'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* BULK DELETE MODAL */}
      {isBulkDeleteModalOpen && (
        <div className="fixed inset-0 bg-black/20 flex items-center justify-center p-4 z-50">
          <div className="bg-white text-black rounded-xl w-full max-w-md p-6 shadow-xl border border-gray-200 space-y-4">
            <h2 className="text-xl font-bold text-black">Delete {selectedIds.size} Sales</h2>
            {bulkDeleteError && <div className="p-2 bg-red-100 text-red-700 border border-red-300 rounded">{bulkDeleteError}</div>}
            <p className="text-sm text-gray-700">
              Acting on <strong className="text-black">{selectedIds.size}</strong> sale record{selectedIds.size === 1 ? '' : 's'}
              {selectedPaymentMethodFilter !== 'all' && (
                <> matching payment method <strong className="text-black uppercase">{selectedPaymentMethodFilter}</strong></>
              )}.
            </p>
            <div className="p-3 bg-blue-50 border border-blue-100 rounded-lg text-xs text-blue-900">
              <strong>Delete Sales Only</strong> removes these entries from the Sales Report and revenue
              totals, but keeps them visible on the Customer List, Customer Profile, and Package
              Activity pages — package data is never touched either way. <strong>Delete Permanently</strong> removes
              them everywhere and can't be undone.
            </div>
            <div>
              <label className="text-xs font-semibold text-black">Admin Password</label>
              <input type="password" className="w-full p-2 border border-gray-300 rounded bg-white text-black" value={bulkDeletePassword} onChange={(e) => setBulkDeletePassword(e.target.value)} />
            </div>
            <div>
              <label className="text-xs font-semibold text-black">Reason for deleting</label>
              <textarea rows={3} className="w-full p-2 border border-gray-300 rounded bg-white text-black" value={bulkDeleteRemark} onChange={(e) => setBulkDeleteRemark(e.target.value)} required />
            </div>
            {bulkDeleteProgress && (
              <div className="space-y-1">
                <div className="w-full bg-gray-200 rounded-full h-2 overflow-hidden">
                  <div
                    className="bg-blue-600 h-2 transition-all"
                    style={{ width: `${Math.round((bulkDeleteProgress.done / Math.max(1, bulkDeleteProgress.total)) * 100)}%` }}
                  />
                </div>
                <p className="text-xs text-gray-500">
                  {bulkDeleteProgress.done} of {bulkDeleteProgress.total} processed — large date ranges are
                  sent in small batches so one huge request doesn't fail.
                </p>
              </div>
            )}
            <div className="flex justify-end gap-3 pt-2 mt-4 flex-wrap">
              <button onClick={() => setIsBulkDeleteModalOpen(false)} disabled={isBulkDeleting} className="px-4 py-2 bg-gray-200 rounded text-black disabled:opacity-50">Cancel</button>
              <button onClick={() => handleBulkDelete('soft')} disabled={isBulkDeleting} className="px-4 py-2 bg-amber-600 text-white rounded disabled:opacity-50">
                {isBulkDeleting ? 'Working…' : `Delete Sales Only (${selectedIds.size})`}
              </button>
              <button onClick={() => handleBulkDelete('hard')} disabled={isBulkDeleting} className="px-4 py-2 bg-red-700 text-white rounded disabled:opacity-50">
                {isBulkDeleting ? 'Working…' : `Delete Permanently (${selectedIds.size})`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
