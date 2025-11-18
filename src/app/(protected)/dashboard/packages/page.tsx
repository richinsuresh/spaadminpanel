'use client';

import { useState, useEffect, useCallback, FormEvent } from 'react';
import { supabase } from '@/lib/supabase';
import { OUTLETS } from '@/lib/outlet';
import { exportToExcel } from '@/lib/exportToExcel';

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

// --- Helper: Format YYYY-MM-DD for date input ---
const toInputDate = (dateString: string | null): string => {
  if (!dateString) return '';
  try {
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return '';
    return date.toISOString().split('T')[0];
  } catch (e) {
    return '';
  }
};

const formatDate = (dateString: string | null) => {
  if (!dateString) return '—';
  // Formats the date as DD/MM/YYYY
  return new Date(dateString).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'numeric',
    year: 'numeric',
  });
};

export default function PackagesPage() {
  const [packages, setPackages] = useState<PackageCustomer[]>([]);
  const [filteredPackages, setFilteredPackages] = useState<PackageCustomer[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'expired' | 'expiring_soon'>('all');
  const [loading, setLoading] = useState(true);
  const [isExporting, setIsExporting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  
  const outlets = ['all', ...OUTLETS.map(o => o.name)];
  const [outletFilter, setOutletFilter] = useState('all');

  // --- State for Modals ---
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [selectedPackage, setSelectedPackage] = useState<PackageCustomer | null>(null);
  const [editFormData, setEditFormData] = useState({
    package_amount: 0,
    total_hours: 0,
    used_hours: 0,
    expiry_date: '',
    status: 'active',
  });
  const [deletePassword, setDeletePassword] = useState('');
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  // This function ensures data from DB is clean
  const normalizeRow = (row: any): PackageCustomer => {
    const safeNumber = (v: any) => {
      const n = Number(v);
      return Number.isFinite(n) ? n : 0;
    };
    const total_hours = safeNumber(row.total_hours ?? row.totalPackageHours ?? row.total_hours);
    const used_hours = safeNumber(row.used_hours ?? row.usedPackageHours ?? 0);
    return {
      id: String(row.id ?? row.mobile ?? Math.random().toString(36).slice(2, 9)),
      name: row.name ?? '—',
      mobile: row.mobile ?? '—',
      package_amount: safeNumber(row.package_amount ?? row.packageAmount ?? row.amount ?? 0),
      total_hours: total_hours,
      used_hours: used_hours,
      remaining_hours: safeNumber(row.remaining_hours ?? (total_hours - used_hours)),
      start_date: row.start_date ?? row.startDate ?? null,
      expiry_date: row.expiry_date ?? row.expiryDate ?? null,
      status: (row.status ?? ( (row.expiry_date || row.expiryDate) ? 'active' : 'expired')) as 'active' | 'expired' | string,
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
        console.warn('Fetch packages ordering error (retrying without order):', error.message);
        const { data: fallbackData, error: fallbackErr } = await supabase
          .from('packages')
          .select('*');

        if (fallbackErr) throw fallbackErr;
        const normalized = (fallbackData ?? []).map(normalizeRow);
        setPackages(normalized);
        return;
      }

      const normalized = (data ?? []).map(normalizeRow);
      setPackages(normalized);
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

  // Real-time listener
  useEffect(() => {
    const channel = supabase
      .channel('packages-admin')
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'packages' },
        (payload) => {
          console.log('Package change detected, refreshing...', payload);
          fetchPackages(); // Re-fetch data on any change
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchPackages]);

  // Apply filters + search
  useEffect(() => {
    let result = [...packages];

    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase();
      result = result.filter((p) =>
        (p.name ?? '').toLowerCase().includes(term) ||
        (p.mobile ?? '').includes(term)
      );
    }

    if (statusFilter === 'expiring_soon') {
      const today = new Date();
      const thirtyDaysFromNow = new Date();
      thirtyDaysFromNow.setDate(today.getDate() + 30);
      today.setHours(0, 0, 0, 0);

      result = result.filter((p) => {
        if (p.status !== 'active' || !p.expiry_date) {
          return false;
        }
        try {
          const expiryDate = new Date(p.expiry_date);
          if (isNaN(expiryDate.getTime())) return false;
          return expiryDate >= today && expiryDate <= thirtyDaysFromNow;
        } catch (e) {
          return false;
        }
      });
    } else if (statusFilter !== 'all') {
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
    setIsExporting(true);
    const dataToExport = filteredPackages.map(p => ({
      'Name': p.name,
      'Mobile': p.mobile,
      'Outlet': p.outlet,
      'Status': p.status,
      'Remaining Hours': p.remaining_hours.toFixed(1),
      'Total Hours': p.total_hours,
      'Used Hours': p.used_hours.toFixed(1),
      'Package Amount': p.package_amount / 100, // Convert from paise
      'Expiry Date': formatDate(p.expiry_date),
    }));

    if (dataToExport.length === 0) {
      alert('No data to export for the current filters.');
      setIsExporting(false);
      return;
    }

    exportToExcel(dataToExport, 'Package_Clients_Report.xlsx');
    setIsExporting(false);
  };

  // --- Edit Modal Handlers ---
  const handleOpenEditModal = (pkg: PackageCustomer) => {
    setSelectedPackage(pkg);
    setEditFormData({
      package_amount: pkg.package_amount / 100, // Convert from paise to rupees
      total_hours: pkg.total_hours,
      used_hours: pkg.used_hours,
      expiry_date: toInputDate(pkg.expiry_date),
      status: pkg.status,
    });
    setIsEditModalOpen(true);
  };

  const handleCloseEditModal = () => {
    setIsEditModalOpen(false);
    setSelectedPackage(null);
    setIsSaving(false);
    setErrorMsg(null);
  };

  const handleEditFormChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setEditFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleEditSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!selectedPackage) return;

    setIsSaving(true);
    setErrorMsg(null);

    const total_hours = Number(editFormData.total_hours);
    const used_hours = Number(editFormData.used_hours);
    const remaining_hours = total_hours - used_hours;

    const payload = {
      package_amount: Number(editFormData.package_amount) * 100, // Convert back to paise
      total_hours: total_hours,
      used_hours: used_hours,
      remaining_hours: remaining_hours,
      expiry_date: editFormData.expiry_date || null,
      status: editFormData.status,
    };

    try {
      const { error } = await supabase
        .from('packages')
        .update(payload)
        .eq('id', selectedPackage.id);

      if (error) throw error;
      
      await fetchPackages(); 
      handleCloseEditModal();
    } catch (err: any) {
      console.error('Error updating package:', err);
      setErrorMsg(err.message || 'Failed to update package.');
    } finally {
      setIsSaving(false);
    }
  };

  // --- Delete Modal Handlers ---
  const handleOpenDeleteModal = (pkg: PackageCustomer) => {
    setSelectedPackage(pkg);
    setIsDeleteModalOpen(true);
    setDeletePassword('');
    setDeleteError(null);
  };

  const handleCloseDeleteModal = () => {
    setIsDeleteModalOpen(false);
    setSelectedPackage(null);
    setIsDeleting(false);
    setDeleteError(null);
  };

  const handleDeleteConfirm = async () => {
    if (!selectedPackage) return;

    setIsDeleting(true);
    setDeleteError(null);

    // --- ★★★ FIX: Simplified Password Check ★★★ ---
    // The password is now hardcoded to 'admin123'.
    const ADMIN_PASSWORD = 'admin123';

    if (deletePassword !== ADMIN_PASSWORD) {
      setDeleteError('Incorrect password.');
      setIsDeleting(false);
      return;
    }

    try {
      const { error } = await supabase
        .from('packages')
        .delete()
        .eq('id', selectedPackage.id);
      
      if (error) {
        // --- ★★★ FIX: Better Error Logging ★★★ ---
        console.error('Supabase delete error:', error);
        throw error;
      }
      
      await fetchPackages();
      handleCloseDeleteModal();
    } catch (err: any) {
      console.error('Error deleting package:', err);
      setDeleteError(err.message || 'Failed to delete package. Check console for details.');
    } finally {
      setIsDeleting(false);
    }
  };


  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center mb-8 gap-4">
        <h1 className="text-2xl font-bold text-gray-800">All Package Clients</h1>
        <div className="flex flex-col sm:flex-row gap-3">
          <button
            onClick={fetchPackages}
            disabled={loading}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed flex items-center"
          >
            {loading ? 'Refreshing...' : '🔄 Refresh Data'}
          </button>
          
          <button
            onClick={handleExport}
            disabled={loading || isExporting || filteredPackages.length === 0}
            className="px-4 py-2 bg-green-600 text-white font-medium rounded-lg hover:bg-green-700 disabled:opacity-50"
          >
            {isExporting ? 'Exporting...' : 'Export to Excel'}
          </button>

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

      {/* Filters */}
      <div className="bg-white p-6 rounded-xl shadow mb-6">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <div>
            <label htmlFor="status" className="block text-sm font-medium text-gray-700 mb-1">Status</label>
            <select
              id="status"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as any)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500 text-black bg-white"
            >
              <option value="all">All Statuses</option>
              <option value="active">Active</option>
              <option value="expiring_soon">Expiring Soon (30d)</option>
              <option value="expired">Expired</option>
            </select>
          </div>
          <div>
            <label htmlFor="outlet" className="block text-sm font-medium text-gray-700 mb-1">Outlet Filter</label>
            <select
              id="outlet"
              value={outletFilter}
              onChange={(e) => setOutletFilter(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500 text-black bg-white"
            >
              {outlets.map(outlet => (
                <option key={outlet} value={outlet}>
                  {outlet === 'all' ? 'All Outlets' : outlet}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      <div className="mb-4 text-sm text-gray-600">
        Showing {filteredPackages.length} of {packages.length} package clients
      </div>

      {errorMsg && !isEditModalOpen && !isDeleteModalOpen && (
        <div className="bg-white shadow rounded-lg p-8 text-center text-red-600">
          Error loading packages: {errorMsg}
        </div>
      )}
      {loading ? (
        <div className="bg-white shadow rounded-lg p-8 text-center">
          Loading package clients...
        </div>
      ) : filteredPackages.length === 0 ? (
        <div className="bg-white shadow rounded-lg p-8 text-center text-gray-500">
          {packages.length === 0 ? 'No package clients found.' : 'No clients match your filters.'}
        </div>
      ) : (
        <div className="bg-white shadow rounded-lg overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Name</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Mobile</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Outlet</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Package</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Total Hours</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Used Hours</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Remaining</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Expiry Date</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {filteredPackages.map((customer) => (
                  <tr key={customer.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{customer.name}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{customer.mobile}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{customer.outlet}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{formatCurrency(customer.package_amount)}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{customer.total_hours} hrs</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{customer.used_hours.toFixed(1)} hrs</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                      <span className={
                        customer.status === 'active' && customer.remaining_hours < 1
                          ? 'text-red-600'
                          : customer.status === 'active'
                          ? 'text-green-600'
                          : 'text-gray-500'
                      }>
                        {customer.remaining_hours.toFixed(1)} hrs
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {formatDate(customer.expiry_date)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                        (customer.status ?? '').toLowerCase() === 'active'
                          ? 'bg-green-100 text-green-800'
                          : 'bg-red-100 text-red-800'
                      }`}>
                        {String(customer.status).charAt(0).toUpperCase() + String(customer.status).slice(1)}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleOpenEditModal(customer)}
                          className="px-2 py-1 bg-blue-100 text-blue-700 text-xs rounded-md hover:bg-blue-200"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => handleOpenDeleteModal(customer)}
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

      {/* --- Edit Modal --- */}
      {isEditModalOpen && selectedPackage && (
        <EditPackageModal
          isOpen={isEditModalOpen}
          onClose={handleCloseEditModal}
          onSave={handleEditSubmit}
          pkgData={editFormData}
          setPkgData={setEditFormData}
          isSaving={isSaving}
          error={errorMsg}
          customerName={selectedPackage.name}
        />
      )}

      {/* --- Delete Modal --- */}
      {isDeleteModalOpen && selectedPackage && (
        <DeletePackageModal
          isOpen={isDeleteModalOpen}
          onClose={handleCloseDeleteModal}
          onConfirm={handleDeleteConfirm}
          isDeleting={isDeleting}
          error={deleteError}
          password={deletePassword}
          setPassword={setDeletePassword}
          customerName={selectedPackage.name}
          customerMobile={selectedPackage.mobile}
        />
      )}
    </div>
  );
}


// --- Edit Package Modal Component ---
function EditPackageModal({
  isOpen,
  onClose,
  onSave,
  pkgData,
  setPkgData,
  isSaving,
  error,
  customerName
}: {
  isOpen: boolean;
  onClose: () => void;
  onSave: (e: FormEvent) => Promise<void>;
  pkgData: any;
  setPkgData: (setter: (prev: any) => any) => void;
  isSaving: boolean;
  error: string | null;
  customerName: string;
}) {
  if (!isOpen) return null;

  const remainingHours = (Number(pkgData.total_hours) || 0) - (Number(pkgData.used_hours) || 0);

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
      <form onSubmit={onSave} className="bg-white rounded-lg shadow-xl w-full max-w-lg p-6 space-y-4">
        <h2 className="text-xl font-bold text-gray-800">Edit Package for {customerName}</h2>
        
        {error && (
          <div className="p-3 bg-red-50 text-red-700 rounded-lg border border-red-200 text-sm">
            {error}
          </div>
        )}
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Package Amount (₹)</label>
            <input
              type="number"
              name="package_amount"
              value={pkgData.package_amount}
              onChange={(e) => setPkgData(prev => ({ ...prev, package_amount: e.target.value }))}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-black"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Expiry Date</label>
            <input
              type="date"
              name="expiry_date"
              value={pkgData.expiry_date}
              onChange={(e) => setPkgData(prev => ({ ...prev, expiry_date: e.target.value }))}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-black"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Total Hours</label>
            <input
              type="number"
              name="total_hours"
              step="0.1"
              value={pkgData.total_hours}
              onChange={(e) => setPkgData(prev => ({ ...prev, total_hours: e.target.value }))}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-black"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Used Hours</label>
            <input
              type="number"
              name="used_hours"
              step="0.1"
              value={pkgData.used_hours}
              onChange={(e) => setPkgData(prev => ({ ...prev, used_hours: e.target.value }))}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-black"
            />
          </div>
        </div>

        <div className="p-3 bg-gray-50 rounded-md text-center">
          <span className="text-sm font-medium text-gray-700">
            Calculated Remaining Hours: <strong className="text-lg text-blue-600">{remainingHours.toFixed(1)}</strong>
          </span>
        </div>

        <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
            <select
              name="status"
              value={pkgData.status}
              onChange={(e) => setPkgData(prev => ({ ...prev, status: e.target.value }))}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-black bg-white"
            >
              <option value="active">Active</option>
              <option value="expired">Expired</option>
            </select>
          </div>

        <div className="flex justify-end gap-3 pt-4">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 bg-gray-200 text-gray-800 rounded-lg hover:bg-gray-300"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={isSaving}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
          >
            {isSaving ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      </form>
    </div>
  );
}

// --- Delete Package Modal Component ---
function DeletePackageModal({
  isOpen,
  onClose,
  onConfirm,
  isDeleting,
  error,
  password,
  setPassword,
  customerName,
  customerMobile,
}: {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => Promise<void>;
  isDeleting: boolean;
  error: string | null;
  password: string;
  setPassword: (pw: string) => void;
  customerName: string;
  customerMobile: string;
}) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-md p-6 space-y-4">
        <h2 className="text-xl font-bold text-red-700">Confirm Deletion</h2>
        <p className="text-sm text-gray-600">
          Are you sure you want to permanently delete the package for:
          <br />
          <strong className="text-gray-900">{customerName}</strong> ({customerMobile})?
          <br />
          <strong className="text-red-600">This action cannot be undone.</strong>
        </p>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Admin Password</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Enter password to confirm"
            className={`w-full px-3 py-2 border rounded-lg text-black ${error ? 'border-red-500' : 'border-gray-300'}`}
          />
          {error && (
            <p className="mt-1 text-xs text-red-600">{error}</p>
          )}
        </div>

        <div className="flex justify-end gap-3 pt-4">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 bg-gray-200 text-gray-800 rounded-lg hover:bg-gray-300"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={isDeleting}
            className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50"
          >
            {isDeleting ? 'Deleting...' : 'Confirm Delete'}
          </button>
        </div>
      </div>
    </div>
  );
}