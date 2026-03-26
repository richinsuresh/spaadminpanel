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

const formatTime = (d: string | null) => {
  if (!d) return '—';
  const dt = new Date(d);
  if (isNaN(dt.getTime())) return '—';
  return dt.toLocaleTimeString('en-IN', {
    hour: '2-digit',
    minute: '2-digit',
  });
};

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

const getToday = () => new Date().toISOString().split('T')[0];

/* ===================== MAIN COMPONENT ===================== */

export default function AdminSalesPage() {
  const { logActivity } = useActivityLog();
  const { user } = useUser();

  const [sales, setSales] = useState<Sale[]>([]);
  const [loading, setLoading] = useState(true);
  const [isExporting, setIsExporting] = useState(false);
  const [therapists, setTherapists] = useState<Employee[]>([]); 

  const [startDate, setStartDate] = useState<string>(getToday());
  const [endDate, setEndDate] = useState<string>(getToday());
  const [selectedOutletId, setSelectedOutletId] = useState<string>('all');

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

    const { data } = await query;
    setSales((data as Sale[]) || []);
    setLoading(false);
  }, [startDate, endDate, selectedOutletId]);

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

  /* ===================== TOTALS ===================== */

  const activeSales = useMemo(() => sales.filter((s) => s.check_out_time), [sales]);

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

  const handleDelete = async () => {
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

    const { error } = await supabase
      .from('customers')
      .delete()
      .eq('id', selectedSaleForDelete.id);

    if (error) {
      setDeleteError(error.message);
      setIsDeleting(false);
      return;
    }

    await supabase.from('activity_logs').insert({
      action_type: 'delete_sale',
      description: JSON.stringify({
        remark: deleteRemark,
        before,
        after: null,
      }),
      username: user?.username || 'System',
    });

    setIsDeleteModalOpen(false);
    setSelectedSaleForDelete(null);
    await fetchSales();
    setIsDeleting(false);
  };

  /* ===================== EXPORT ===================== */

  const handleExport = async () => {
    if (sales.length === 0) {
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
          ? new Date(sale.check_in_time).toLocaleTimeString('en-IN', {
              hour: '2-digit',
              minute: '2-digit',
            })
          : '';

        const mainOutDisplay = sale.out_time
          ? sale.out_time
          : sale.check_out_time
          ? new Date(sale.check_out_time).toLocaleTimeString('en-IN', {
              hour: '2-digit',
              minute: '2-digit',
            })
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

      const allSalesRows = sales.map(buildRow);

      const outletSheets: Record<string, any[]> = {};
      sales.forEach((sale) => {
        const key = sale.outlet_name || 'Unknown Outlet';
        if (!outletSheets[key]) outletSheets[key] = [];
        outletSheets[key].push(buildRow(sale));
      });

      const summaryRows = [
        { Metric: 'Date Range', Value: `${startDate} to ${endDate}` },
        { Metric: 'Outlet Filter', Value: selectedOutletId === 'all' ? 'All Outlets' : OUTLETS.find((o) => o.id === selectedOutletId)?.name || selectedOutletId },
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

      {/* Filters */}
      <div className="bg-white p-4 rounded-xl shadow-sm grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 items-end">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Outlet
          </label>
          <select
            value={selectedOutletId}
            onChange={(e) => setSelectedOutletId(e.target.value)}
            className="w-full px-3 py-2 border rounded-lg bg-white text-black focus:outline-none focus:ring-0 focus:text-black"
            aria-label="Select outlet"
          >
            <option value="all" className="text-black">
              All Outlets
            </option>
            {OUTLETS.map((o) => (
              <option key={o.id} value={o.id} className="text-black">
                {o.name}
              </option>
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
                  Customer
                </th>
                <th className="px-3 py-2 text-left text-xs font-bold text-gray-600 uppercase">
                  Type
                </th>
                <th className="px-3 py-2 text-left text-xs font-bold text-gray-600 uppercase">
                  Outlet
                </th>
                <th className="px-3 py-2 text-left text-xs font-bold text-gray-600 uppercase">
                  Sale Date
                </th>
                <th className="px-3 py-2 text-left text-xs font-bold text-gray-600 uppercase">
                  Service / Group Details
                </th>
                <th className="px-3 py-2 text-left text-xs font-bold text-gray-600 uppercase">
                  Amount
                </th>
                <th className="px-3 py-2 text-left text-xs font-bold text-gray-600 uppercase">
                  Payment
                </th>
                <th className="px-3 py-2 text-left text-xs font-bold text-gray-600 uppercase">
                  Time (Main)
                </th>
                <th className="px-3 py-2 text-left text-xs font-bold text-gray-600 uppercase">
                  Therapist (Main)
                </th>
                <th className="px-3 py-2 text-left text-xs font-bold text-gray-600 uppercase">
                  Room (Main)
                </th>
                <th className="px-3 py-2 text-left text-xs font-bold text-gray-600 uppercase">
                  Action
                </th>
              </tr>
            </thead>

            <tbody className="bg-white divide-y divide-gray-200">
              {loading ? (
                <tr>
                  <td colSpan={11} className="p-6 text-center text-gray-500">
                    Loading…
                  </td>
                </tr>
              ) : sales.length === 0 ? (
                <tr>
                  <td colSpan={11} className="p-6 text-center text-gray-500">
                    No sales found.
                  </td>
                </tr>
              ) : (
                sales.map((sale) => {
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
                    <tr key={sale.id} className={sale.check_out_time ? 'bg-gray-50 opacity-60' : ''}>
                      <td className="px-3 py-2 text-xs align-top">
                        <div className="font-medium text-black">{customerLabel}</div>
                        <div className="text-black">{sale.mobile}</div>
                        {totalGuests > 1 && <div className="text-[11px] text-gray-500 mt-0.5">Group of {totalGuests}</div>}
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

      {/* EDIT MODAL */}
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

            <p className="text-sm text-gray-700">
              You are deleting: <strong className="text-black">{selectedSaleForDelete?.name}</strong>
            </p>

            <div>
              <label className="text-xs font-semibold text-black">Admin Password</label>
              <input type="password" className="w-full p-2 border border-gray-300 rounded bg-white text-black placeholder-gray-500" value={deletePassword} onChange={(e) => setDeletePassword(e.target.value)} />
            </div>

            <div>
              <label className="text-xs font-semibold text-black">Reason for deleting</label>
              <textarea rows={3} className="w-full p-2 border border-gray-300 rounded bg-white text-black placeholder-gray-500" value={deleteRemark} onChange={(e) => setDeleteRemark(e.target.value)} required />
            </div>

            <div className="flex justify-end gap-3 pt-2 mt-4">
              <button onClick={() => setIsDeleteModalOpen(false)} className="px-4 py-2 bg-gray-200 rounded hover:bg-gray-300 text-black">Cancel</button>
              <button onClick={handleDelete} disabled={isDeleting} className="px-4 py-2 bg-red-700 text-white rounded hover:bg-red-800">
                {isDeleting ? 'Deleting…' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}