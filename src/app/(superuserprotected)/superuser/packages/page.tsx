'use client';

import { useState, useEffect, useCallback, FormEvent, ChangeEvent } from 'react';
import { supabase } from '@/lib/supabase';
import { OUTLETS } from '@/lib/outlet';
import { exportToExcel } from '@/lib/exportToExcel';

// --- (Pencil Icon) ---
const PencilIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
    <path d="M5.433 13.917l1.262-3.155A4 4 0 017.58 9.42l6.92-6.918a2.121 2.121 0 013 3l-6.92 6.918c-.383.383-.84.685-1.343.886l-3.154 1.262a.5.5 0 01-.65-.65z" />
    <path d="M3.5 5.75c0-.69.56-1.25 1.25-1.25H10A.75.75 0 0010 3H4.75A2.75 2.75 0 002 5.75v9.5A2.75 2.75 0 004.75 18h9.5A2.75 2.75 0 0017 15.25V10a.75.75 0 00-1.5 0v5.25c0 .69-.56 1.25-1.25 1.25h-9.5c-.69 0-1.25-.56-1.25-1.25v-9.5z" />
  </svg>
);

// --- (Types) ---
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

// Type for the modal, handling string inputs
type EditModalData = {
  id: string;
  name: string;
  mobile: string;
  package_amount: string;
  total_hours: string;
  used_hours: string;
  expiry_date: string; 
  status: 'active' | 'expired' | string;
  outlet: string;
};

const formatDate = (dateString: string | null) => {
  if (!dateString) return '—';
  return new Date(dateString).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'numeric',
    year: 'numeric',
  });
};

// Format for date input (YYYY-MM-DD)
const formatDateForInput = (dateString: string | null) => {
  if (!dateString) return '';
  try {
    return new Date(dateString).toISOString().split('T')[0];
  } catch (e) {
    return '';
  }
};

export default function SuperUserPackagesPage() {
  const [packages, setPackages] = useState<PackageCustomer[]>([]);
  const [filteredPackages, setFilteredPackages] = useState<PackageCustomer[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'expired'>('all');
  const [loading, setLoading] = useState(true);
  const [isExporting, setIsExporting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  
  const outletOptions = ['all', ...OUTLETS.map(o => o.name)];
  const [outletFilter, setOutletFilter] = useState('all');

  // --- (Modal State) ---
  const [editModalData, setEditModalData] = useState<EditModalData | null>(null);
  const [modalLoading, setModalLoading] = useState(false);
  const [modalError, setModalError] = useState('');

  const normalizeRow = (row: any): PackageCustomer => {
    // (This function is the same as the admin page)
    const safeNumber = (v: any) => {
      const n = Number(v);
      return Number.isFinite(n) ? n : 0;
    };
    return {
      id: String(row.id ?? row.mobile ?? Math.random().toString(36).slice(2, 9)),
      name: row.name ?? '—',
      mobile: row.mobile ?? '—',
      package_amount: safeNumber(row.package_amount ?? row.packageAmount ?? row.amount ?? 0),
      total_hours: safeNumber(row.total_hours ?? row.totalPackageHours ?? row.total_hours),
      used_hours: safeNumber(row.used_hours ?? row.usedPackageHours ?? 0),
      remaining_hours: safeNumber(row.remaining_hours ?? ( (row.total_hours ?? row.totalPackageHours ?? 0) - (row.used_hours ?? 0) ) ),
      start_date: row.start_date ?? row.startDate ?? null,
      expiry_date: row.expiry_date ?? row.expiryDate ?? null,
      status: (row.status ?? ( (row.expiry_date || row.expiryDate) ? 'active' : 'expired')) as 'active' | 'expired' | string,
      outlet: row.outlet ?? '—',
      created_at: row.created_at ?? null,
    };
  };

  const fetchPackages = useCallback(async () => {
    // (This function is the same as the admin page)
    setLoading(true);
    setErrorMsg(null);
    try {
      const { data, error } = await supabase
        .from('packages')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) {
        console.warn('Fetch packages ordering error (retrying without order):', error.message);
        const { data: fallbackData, error: fallbackErr } = await supabase
          .from('packages')
          .select('*');
        if (fallbackErr) throw fallbackErr;
        setPackages((fallbackData ?? []).map(normalizeRow));
        return;
      }
      setPackages((data ?? []).map(normalizeRow));
    } catch (err: any)
    {
      console.error('Error fetching packages:', err);
      setErrorMsg(err?.message || 'Failed to fetch packages');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPackages();
  }, [fetchPackages]);

  useEffect(() => {
    // (Real-time listener is the same)
    const channel = supabase.channel('packages-admin').on('postgres_changes',
        { event: '*', schema: 'public', table: 'packages' },
        (payload) => { fetchPackages(); }
      ).subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [fetchPackages]);

  useEffect(() => {
    // (Filtering logic is the same)
    let result = [...packages];
    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase();
      result = result.filter((p) =>
        (p.name ?? '').toLowerCase().includes(term) ||
        (p.mobile ?? '').includes(term)
      );
    }
    if (statusFilter !== 'all') {
      result = result.filter((p) => (p.status ?? '').toLowerCase() === statusFilter);
    }
    if (outletFilter !== 'all') {
      result = result.filter((p) => (p.outlet ?? '').toLowerCase() === outletFilter.toLowerCase());
    }
    setFilteredPackages(result);
  }, [searchTerm, statusFilter, outletFilter, packages]);

  const formatCurrency = (amount: number) =>
    new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', minimumFractionDigits: 0 }).format(amount / 100);

  const handleExport = () => {
    // (Export logic is the same)
    setIsExporting(true);
    const dataToExport = filteredPackages.map(p => ({
      'Name': p.name, 'Mobile': p.mobile, 'Outlet': p.outlet, 'Status': p.status,
      'Remaining Hours': p.remaining_hours.toFixed(1), 'Total Hours': p.total_hours,
      'Used Hours': p.used_hours.toFixed(1), 'Package Amount': p.package_amount / 100,
      'Expiry Date': formatDate(p.expiry_date),
    }));
    if (dataToExport.length === 0) {
      alert('No data to export.');
      setIsExporting(false);
      return;
    }
    exportToExcel(dataToExport, 'Package_Clients_Report.xlsx');
    setIsExporting(false);
  };

  // --- (NEW: Edit Modal Handlers) ---
  const handleEditClick = (pkg: PackageCustomer) => {
    setModalError('');
    setEditModalData({
      id: pkg.id,
      name: pkg.name,
      mobile: pkg.mobile,
      package_amount: (pkg.package_amount / 100).toString(), // Convert paise to INR string
      total_hours: pkg.total_hours.toString(),
      used_hours: pkg.used_hours.toString(),
      expiry_date: formatDateForInput(pkg.expiry_date),
      status: pkg.status,
      outlet: pkg.outlet,
    });
  };

  const handleModalClose = () => setEditModalData(null);

  const handleModalChange = (e: ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    if (editModalData) {
      setEditModalData({ ...editModalData, [e.target.name]: e.target.value });
    }
  };

  const handleModalSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!editModalData) return;

    setModalLoading(true);
    setModalError('');

    try {
      // 1. Prepare data for Supabase
      const updatedData = {
        name: editModalData.name,
        mobile: editModalData.mobile,
        outlet: editModalData.outlet,
        status: editModalData.status,
        // Convert back to numbers / paise
        package_amount: Math.round(Number(editModalData.package_amount) * 100), 
        total_hours: Number(editModalData.total_hours),
        used_hours: Number(editModalData.used_hours),
        // Calculate remaining hours
        remaining_hours: Number(editModalData.total_hours) - Number(editModalData.used_hours),
        expiry_date: editModalData.expiry_date || null,
      };

      // 2. Call the new API route
      const res = await fetch('/api/superuser/update-package', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: editModalData.id, data: updatedData }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || 'Failed to update package');
      }

      // 3. Success: Refresh local data and close modal
      await fetchPackages(); // Refetch all data to ensure consistency
      handleModalClose();

    } catch (err: any) {
      setModalError(err.message);
    } finally {
      setModalLoading(false);
    }
  };
  // --- (End of New Handlers) ---

  return (
    <div>
      {/* (Page header and filters are identical to admin page) */}
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center mb-8 gap-4">
        {/* --- Text changed to text-black --- */}
        <h1 className="text-2xl font-bold text-black">SuperUser - All Packages</h1>
        <div className="flex flex-col sm:flex-row gap-3">
          <button onClick={fetchPackages} disabled={loading} className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-400">
            {loading ? 'Refreshing...' : '🔄 Refresh Data'}
          </button>
          <button onClick={handleExport} disabled={loading || isExporting || filteredPackages.length === 0} className="px-4 py-2 bg-green-600 text-white font-medium rounded-lg hover:bg-green-700 disabled:opacity-50">
            {isExporting ? 'Exporting...' : 'Export to Excel'}
          </button>
          {/* (Search input is the same) */}
          <div className="relative">
            <input
              type="text"
              placeholder="Search by name or mobile..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500 text-black"
            />
            <svg
              className="absolute left-3 top-2.5 h-5 w-5 text-gray-400"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </div>
        </div>
      </div>

      {/* (Filters are the same) */}
      <div className="bg-white p-6 rounded-xl shadow mb-6">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <div>
             {/* --- Text changed to text-black --- */}
            <label htmlFor="status" className="block text-sm font-medium text-black mb-1">Status</label>
            <select
              id="status"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as any)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500 text-black bg-white"
            >
              <option value="all">All Statuses</option>
              <option value="active">Active</option>
              <option value="expired">Expired</option>
            </select>
          </div>
          <div>
            {/* --- Text changed to text-black --- */}
            <label htmlFor="outlet" className="block text-sm font-medium text-black mb-1">Outlet Filter</label>
            <select
              id="outlet"
              value={outletFilter}
              onChange={(e) => setOutletFilter(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500 text-black bg-white"
            >
              {outletOptions.map(outlet => (
                <option key={outlet} value={outlet}>
                  {outlet === 'all' ? 'All Outlets' : outlet}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* --- Text changed to text-black --- */}
      <div className="mb-4 text-sm text-black">
        Showing {filteredPackages.length} of {packages.length} package clients
      </div>

      {errorMsg ? (
         <div className="bg-white shadow rounded-lg p-8 text-center text-black">Error: {errorMsg}</div>
      ) : loading ? (
         <div className="bg-white shadow rounded-lg p-8 text-center text-black">Loading...</div>
      ) : filteredPackages.length === 0 ? (
         <div className="bg-white shadow rounded-lg p-8 text-center text-black">No clients match.</div>
      ) : (
        <div className="bg-white shadow rounded-lg overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  {/* --- Text changed to text-black --- */}
                  <th className="px-3 py-3 text-left text-xs font-medium text-black uppercase">Edit</th> 
                  <th className="px-6 py-3 text-left text-xs font-medium text-black uppercase">Name</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-black uppercase">Mobile</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-black uppercase">Outlet</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-black uppercase">Package</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-black uppercase">Total Hours</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-black uppercase">Used Hours</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-black uppercase">Remaining</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-black uppercase">Expiry Date</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-black uppercase">Status</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {filteredPackages.map((customer) => (
                  <tr key={customer.id} className="hover:bg-gray-50">
                    {/* --- (NEW: Edit Button) --- */}
                    <td className="px-3 py-4 whitespace-nowrap">
                      {/* --- Text changed to text-black --- */}
                      <button
                        onClick={() => handleEditClick(customer)}
                        className="text-black hover:text-gray-700"
                        title="Edit Customer Package"
                      >
                        <PencilIcon />
                      </button>
                    </td>
                    {/* --- Text changed to text-black/gray-900 --- */}
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{customer.name}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{customer.mobile}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{customer.outlet}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{formatCurrency(customer.package_amount)}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{customer.total_hours} hrs</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{customer.used_hours.toFixed(1)} hrs</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                      {/* --- Text changed to text-black --- */}
                      <span className="text-black">
                        {customer.remaining_hours.toFixed(1)} hrs
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {formatDate(customer.expiry_date)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      {/* (Status badges left as-is for color) */}
                      <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                        (customer.status ?? '').toLowerCase() === 'active'
                          ? 'bg-green-100 text-green-800'
                          : 'bg-red-100 text-red-800'
                      }`}>
                        {String(customer.status).charAt(0).toUpperCase() + String(customer.status).slice(1)}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* --- (NEW: Edit Modal) --- */}
      {editModalData && (
        <div 
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50"
          onClick={handleModalClose}
        >
          <div
            className="bg-white rounded-lg shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <form onSubmit={handleModalSubmit}>
              <div className="p-6 border-b">
                {/* --- Text changed to text-black --- */}
                <h2 className="text-xl font-bold text-black">Edit Package Details</h2>
                <p className="text-sm text-black">ID: {editModalData.id}</p>
              </div>
              
              <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* --- Form Fields (Labels changed to text-black) --- */}
                <div>
                  <label htmlFor="name" className="block text-sm font-medium text-black">Name</label>
                  <input id="name" name="name" type="text" value={editModalData.name} onChange={handleModalChange}
                    className="w-full px-3 py-2 mt-1 border border-gray-300 rounded-lg text-black"
                  />
                </div>
                <div>
                  <label htmlFor="mobile" className="block text-sm font-medium text-black">Mobile</label>
                  <input id="mobile" name="mobile" type="text" value={editModalData.mobile} onChange={handleModalChange}
                    className="w-full px-3 py-2 mt-1 border border-gray-300 rounded-lg text-black"
                  />
                </div>
                <div>
                  <label htmlFor="outlet" className="block text-sm font-medium text-black">Outlet</label>
                  <select id="outlet" name="outlet" value={editModalData.outlet} onChange={handleModalChange}
                    className="w-full px-3 py-2 mt-1 border border-gray-300 rounded-lg bg-white text-black"
                  >
                    {OUTLETS.map(o => <option key={o.id} value={o.name}>{o.name}</option>)}
                  </select>
                </div>
                <div>
                  <label htmlFor="status" className="block text-sm font-medium text-black">Status</label>
                  <select id="status" name="status" value={editModalData.status} onChange={handleModalChange}
                    className="w-full px-3 py-2 mt-1 border border-gray-300 rounded-lg bg-white text-black"
                  >
                    <option value="active">Active</option>
                    <option value="expired">Expired</option>
                  </select>
                </div>
                 <div>
                  <label htmlFor="package_amount" className="block text-sm font-medium text-black">Package Amount (INR)</label>
                  <input id="package_amount" name="package_amount" type="number" step="1" value={editModalData.package_amount} onChange={handleModalChange}
                    className="w-full px-3 py-2 mt-1 border border-gray-300 rounded-lg text-black"
                  />
                </div>
                 <div>
                  <label htmlFor="expiry_date" className="block text-sm font-medium text-black">Expiry Date</label>
                  <input id="expiry_date" name="expiry_date" type="date" value={editModalData.expiry_date} onChange={handleModalChange}
                    className="w-full px-3 py-2 mt-1 border border-gray-300 rounded-lg text-black"
                  />
                </div>
                <div>
                  <label htmlFor="total_hours" className="block text-sm font-medium text-black">Total Hours</label>
                  <input id="total_hours" name="total_hours" type="number" step="0.5" value={editModalData.total_hours} onChange={handleModalChange}
                    className="w-full px-3 py-2 mt-1 border border-gray-300 rounded-lg text-black"
                  />
                </div>
                <div>
                  <label htmlFor="used_hours" className="block text-sm font-medium text-black">Used Hours</label>
                  <input id="used_hours" name="used_hours" type="number" step="0.5" value={editModalData.used_hours} onChange={handleModalChange}
                    className="w-full px-3 py-2 mt-1 border border-gray-300 rounded-lg text-black"
                  />
                </div>
                {/* --- Error text changed to text-black --- */}
                {modalError && <p className="col-span-2 text-sm text-black">{modalError}</p>}
              </div>
              
              <div className="p-4 bg-gray-50 flex justify-end gap-3">
                {/* --- Cancel button text changed to text-black --- */}
                <button type="button" onClick={handleModalClose}
                  className="px-4 py-2 bg-white border border-gray-300 rounded-lg text-sm font-medium text-black hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button type="submit" disabled={modalLoading}
                  className="px-4 py-2 bg-purple-600 text-white rounded-lg text-sm font-medium hover:bg-purple-700 disabled:opacity-50"
                >
                  {modalLoading ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}