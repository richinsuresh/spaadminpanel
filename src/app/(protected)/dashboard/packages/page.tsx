'use client';

import { useState, useEffect, useCallback, FormEvent } from 'react';
import { supabase } from '@/lib/supabase';
import { OUTLETS } from '@/lib/outlet';
import { exportToExcel } from '@/lib/exportToExcel';
import { User, Loader2 } from 'lucide-react';
import { useActivityLog } from '@/hooks/useActivityLog';

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

const toInputDate = (dateString: string | null): string => {
  if (!dateString) return '';
  try { return new Date(dateString).toISOString().split('T')[0]; } catch (e) { return ''; }
};

const formatDate = (dateString: string | null) => {
  if (!dateString) return '—';
  return new Date(dateString).toLocaleDateString('en-IN', { day: 'numeric', month: 'numeric', year: 'numeric' });
};

export default function PackagesPage() {
  const { logActivity } = useActivityLog();
  const [packages, setPackages] = useState<PackageCustomer[]>([]);
  const [filteredPackages, setFilteredPackages] = useState<PackageCustomer[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'expired' | 'expiring_soon'>('all');
  const [loading, setLoading] = useState(true);
  const [isExporting, setIsExporting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  
  const outlets = ['all', ...OUTLETS.map(o => o.name)];
  const [outletFilter, setOutletFilter] = useState('all');

  // Modal States
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [isDetailsModalOpen, setIsDetailsModalOpen] = useState(false); // NEW
  const [selectedPackage, setSelectedPackage] = useState<PackageCustomer | null>(null);
  
  // Form States
  const [editFormData, setEditFormData] = useState<any>({});
  const [deletePassword, setDeletePassword] = useState('');
  const [deleteRemark, setDeleteRemark] = useState('');
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const normalizeRow = (row: any): PackageCustomer => {
    const safeNumber = (v: any) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
    const total_hours = safeNumber(row.total_hours ?? row.totalPackageHours ?? row.total_hours);
    const used_hours = safeNumber(row.used_hours ?? row.usedPackageHours ?? 0);
    return {
      id: String(row.id),
      name: row.name ?? '—',
      mobile: row.mobile ?? '—',
      package_amount: safeNumber(row.package_amount ?? row.packageAmount ?? 0),
      total_hours: total_hours,
      used_hours: used_hours,
      remaining_hours: safeNumber(row.remaining_hours ?? (total_hours - used_hours)),
      start_date: row.start_date ?? null,
      expiry_date: row.expiry_date ?? null,
      status: (row.status ?? 'active'),
      outlet: row.outlet ?? '—',
      created_at: row.created_at ?? null,
    };
  };

  const fetchPackages = useCallback(async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const { data, error } = await supabase.from('packages').select('*').order('created_at', { ascending: false });
      if (error) {
        const { data: fallbackData, error: fallbackErr } = await supabase.from('packages').select('*');
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

  useEffect(() => { fetchPackages(); }, [fetchPackages]);

  useEffect(() => {
    const channel = supabase.channel('packages-admin')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'packages' }, () => fetchPackages())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [fetchPackages]);

  useEffect(() => {
    let result = [...packages];
    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase();
      result = result.filter((p) => (p.name ?? '').toLowerCase().includes(term) || (p.mobile ?? '').includes(term));
    }
    if (statusFilter === 'expiring_soon') {
      const today = new Date();
      const thirtyDaysFromNow = new Date();
      thirtyDaysFromNow.setDate(today.getDate() + 30);
      today.setHours(0, 0, 0, 0);
      result = result.filter((p) => {
        if (p.status !== 'active' || !p.expiry_date) return false;
        try { const expiryDate = new Date(p.expiry_date); return expiryDate >= today && expiryDate <= thirtyDaysFromNow; } catch (e) { return false; }
      });
    } else if (statusFilter !== 'all') {
      result = result.filter((p) => (p.status ?? '').toLowerCase() === statusFilter);
    }
    if (outletFilter !== 'all') {
      result = result.filter((p) => (p.outlet ?? '').toLowerCase() === outletFilter.toLowerCase());
    }
    setFilteredPackages(result);
  }, [searchTerm, statusFilter, outletFilter, packages]);

  const formatCurrency = (amount: number) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', minimumFractionDigits: 0 }).format(amount / 100);

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
      'Package Amount': p.package_amount / 100,
      'Expiry Date': formatDate(p.expiry_date),
    }));
    if (dataToExport.length === 0) { alert('No data to export.'); setIsExporting(false); return; }
    exportToExcel(dataToExport, 'Package_Clients_Report.xlsx');
    setIsExporting(false);
    logActivity('export_packages', 'Downloaded Package Report');
  };

  const handleOpenEditModal = (pkg: PackageCustomer, e: React.MouseEvent) => {
    e.stopPropagation(); 
    setSelectedPackage(pkg);
    setEditFormData({
      package_amount: pkg.package_amount / 100,
      total_hours: pkg.total_hours,
      used_hours: pkg.used_hours,
      expiry_date: toInputDate(pkg.expiry_date),
      status: pkg.status,
    });
    setIsEditModalOpen(true);
  };

  const handleCloseEditModal = () => { setIsEditModalOpen(false); setSelectedPackage(null); setIsSaving(false); setErrorMsg(null); };

  const handleEditSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!selectedPackage) return;
    setIsSaving(true);
    setErrorMsg(null);
    
    const total_hours = Number(editFormData.total_hours);
    const used_hours = Number(editFormData.used_hours);
    const remaining_hours = total_hours - used_hours;
    
    const payload = {
      package_amount: Number(editFormData.package_amount) * 100,
      total_hours: total_hours,
      used_hours: used_hours,
      remaining_hours: remaining_hours,
      expiry_date: editFormData.expiry_date || null,
      status: editFormData.status,
    };
    try {
      const { error } = await supabase.from('packages').update(payload).eq('id', selectedPackage.id);
      if (error) throw error;
      
      logActivity('edit_package', `Edited package for ${selectedPackage.name}`);
      await fetchPackages(); 
      handleCloseEditModal();
    } catch (err: any) { setErrorMsg(err.message || 'Failed to update package.'); } finally { setIsSaving(false); }
  };

  const handleOpenDeleteModal = (pkg: PackageCustomer, e: React.MouseEvent) => {
    e.stopPropagation(); 
    setSelectedPackage(pkg);
    setDeletePassword('');
    setDeleteRemark('');
    setDeleteError(null);
    setIsDeleteModalOpen(true);
  };

  const handleCloseDeleteModal = () => { setIsDeleteModalOpen(false); setSelectedPackage(null); setIsDeleting(false); setDeleteError(null); };

  const handleDeleteConfirm = async (e: FormEvent) => {
    e.preventDefault();
    if (!selectedPackage) return;
    if (deletePassword !== 'admin123') { setDeleteError('Incorrect password.'); return; }
    if (!deleteRemark.trim()) { setDeleteError('Remark required.'); return; }

    setIsDeleting(true);
    try {
      const { error } = await supabase.from('packages').delete().eq('id', selectedPackage.id);
      if (error) throw error;
      
      logActivity('delete_package', `Deleted package for ${selectedPackage.name}. Remark: ${deleteRemark}`);
      await fetchPackages();
      handleCloseDeleteModal();
    } catch (err: any) { setDeleteError(err.message || 'Failed to delete package.'); } finally { setIsDeleting(false); }
  };

  // --- ROW CLICK HANDLER ---
  const handleRowClick = (pkg: PackageCustomer) => {
    setSelectedPackage(pkg);
    setIsDetailsModalOpen(true);
  };

  return (
    <div>
      {/* Header & Filters */}
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center mb-8 gap-4">
        <h1 className="text-2xl font-bold text-gray-800">All Package Clients</h1>
        <div className="flex flex-col sm:flex-row gap-3">
          <button onClick={fetchPackages} disabled={loading} className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-400 flex items-center">{loading ? 'Refreshing...' : '🔄 Refresh Data'}</button>
          <button onClick={handleExport} disabled={loading || isExporting || filteredPackages.length === 0} className="px-4 py-2 bg-green-600 text-white font-medium rounded-lg hover:bg-green-700 disabled:opacity-50">{isExporting ? 'Exporting...' : 'Export to Excel'}</button>
          <div className="relative">
            <input type="text" placeholder="Search..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 text-black" />
          </div>
        </div>
      </div>

      <div className="bg-white p-6 rounded-xl shadow mb-6">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
            <select id="status" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as any)} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-black bg-white">
              <option value="all">All Statuses</option>
              <option value="active">Active</option>
              <option value="expiring_soon">Expiring Soon (30d)</option>
              <option value="expired">Expired</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Outlet Filter</label>
            <select id="outlet" value={outletFilter} onChange={(e) => setOutletFilter(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-black bg-white">
              {outlets.map(outlet => <option key={outlet} value={outlet}>{outlet === 'all' ? 'All Outlets' : outlet}</option>)}
            </select>
          </div>
        </div>
      </div>

      {/* Table */}
      {loading ? <div className="bg-white shadow rounded-lg p-8 text-center">Loading...</div> : 
       filteredPackages.length === 0 ? <div className="bg-white shadow rounded-lg p-8 text-center text-gray-500">No clients found.</div> : (
        <div className="bg-white shadow rounded-lg overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  {['Name', 'Mobile', 'Outlet', 'Package', 'Total Hours', 'Used Hours', 'Remaining', 'Expiry Date', 'Status', 'Actions'].map(h => (
                     <th key={h} className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {filteredPackages.map((customer) => (
                  <tr 
                    key={customer.id} 
                    className="hover:bg-gray-50 cursor-pointer" 
                    onClick={() => handleRowClick(customer)} 
                  >
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{customer.name}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{customer.mobile}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{customer.outlet}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{formatCurrency(customer.package_amount)}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{customer.total_hours} hrs</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{customer.used_hours.toFixed(1)} hrs</td>
                    
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                       <div className="w-24">
                         <div className="flex justify-between text-xs mb-1"><span className={customer.status === 'active' ? 'text-green-700' : 'text-red-700'}>{customer.remaining_hours.toFixed(1)} hrs</span></div>
                         <div className="w-full bg-gray-200 rounded-full h-1.5"><div className={`h-1.5 rounded-full ${customer.status === 'active' ? 'bg-green-500' : 'bg-red-500'}`} style={{ width: `${Math.min(100, (customer.remaining_hours / customer.total_hours) * 100)}%` }}></div></div>
                       </div>
                    </td>

                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{formatDate(customer.expiry_date)}</td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${customer.status === 'active' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>{String(customer.status).toUpperCase()}</span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                      <div className="flex gap-2">
                        <button onClick={(e) => handleOpenEditModal(customer, e)} className="px-2 py-1 bg-blue-100 text-blue-700 text-xs rounded-md hover:bg-blue-200">Edit</button>
                        <button onClick={(e) => handleOpenDeleteModal(customer, e)} className="px-2 py-1 bg-red-100 text-red-700 text-xs rounded-md hover:bg-red-200">Delete</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Edit Modal */}
      {isEditModalOpen && selectedPackage && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
          <form onSubmit={handleEditSubmit} className="bg-white rounded-lg shadow-xl w-full max-w-lg p-6 space-y-4">
            <h2 className="text-xl font-bold text-gray-800">Edit Package</h2>
            <div className="grid grid-cols-2 gap-4">
              <div><label className="text-xs uppercase font-bold text-gray-500">Amount</label><input type="number" value={editFormData.package_amount} onChange={(e) => setEditFormData({...editFormData, package_amount: e.target.value})} className="w-full p-2 border rounded text-black"/></div>
              <div><label className="text-xs uppercase font-bold text-gray-500">Expires</label><input type="date" value={editFormData.expiry_date} onChange={(e) => setEditFormData({...editFormData, expiry_date: e.target.value})} className="w-full p-2 border rounded text-black"/></div>
              <div><label className="text-xs uppercase font-bold text-gray-500">Total Hrs</label><input type="number" step="0.1" value={editFormData.total_hours} onChange={(e) => setEditFormData({...editFormData, total_hours: e.target.value})} className="w-full p-2 border rounded text-black"/></div>
              <div><label className="text-xs uppercase font-bold text-gray-500">Used Hrs</label><input type="number" step="0.1" value={editFormData.used_hours} onChange={(e) => setEditFormData({...editFormData, used_hours: e.target.value})} className="w-full p-2 border rounded text-black"/></div>
            </div>
            <div className="flex justify-end gap-2"><button type="button" onClick={handleCloseEditModal} className="px-4 py-2 bg-gray-200 rounded text-black">Cancel</button><button type="submit" disabled={isSaving} className="px-4 py-2 bg-blue-600 text-white rounded">{isSaving ? 'Saving...' : 'Save'}</button></div>
          </form>
        </div>
      )}

      {/* Delete Modal */}
      {isDeleteModalOpen && selectedPackage && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
          <form onSubmit={handleDeleteConfirm} className="bg-white rounded-lg shadow-xl w-full max-w-md p-6 space-y-4">
            <h2 className="text-xl font-bold text-red-700">Delete Package</h2>
            <p className="text-sm text-gray-600">Deleting package for <strong>{selectedPackage.name}</strong>.</p>
            <div><label className="text-xs uppercase font-bold text-gray-500">Reason</label><textarea value={deleteRemark} onChange={e => setDeleteRemark(e.target.value)} className="w-full p-2 border rounded text-black" required/></div>
            <div><label className="text-xs uppercase font-bold text-gray-500">Password</label><input type="password" value={deletePassword} onChange={e => setDeletePassword(e.target.value)} className="w-full p-2 border rounded text-black" placeholder="Enter admin123"/>{deleteError && <p className="text-red-600 text-xs">{deleteError}</p>}</div>
            <div className="flex justify-end gap-2"><button type="button" onClick={handleCloseDeleteModal} className="px-4 py-2 bg-gray-200 rounded text-black">Cancel</button><button type="submit" disabled={isDeleting} className="px-4 py-2 bg-red-600 text-white rounded">{isDeleting ? 'Deleting...' : 'Confirm'}</button></div>
          </form>
        </div>
      )}

      {/* Details Modal (Re-integrated) */}
      {isDetailsModalOpen && selectedPackage && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg p-6 relative">
            <button onClick={() => setIsDetailsModalOpen(false)} className="absolute top-4 right-4 text-gray-400 hover:text-gray-600">&times;</button>
            
            <div className="flex items-center gap-4 mb-6">
               <div className={`p-3 rounded-full ${selectedPackage.status === 'active' ? 'bg-green-100 text-green-600' : 'bg-red-100 text-red-600'}`}>
                 <User size={24} />
               </div>
               <div>
                 <h2 className="text-xl font-bold text-gray-800">{selectedPackage.name}</h2>
                 <p className="text-sm text-gray-500">{selectedPackage.mobile}</p>
               </div>
            </div>

            <div className="grid grid-cols-2 gap-4 mb-6">
               <div className="p-4 bg-gray-50 rounded-lg">
                  <p className="text-xs text-gray-500 uppercase">Status</p>
                  <p className={`font-bold ${selectedPackage.status === 'active' ? 'text-green-600' : 'text-red-600'}`}>
                    {String(selectedPackage.status).toUpperCase()}
                  </p>
               </div>
               <div className="p-4 bg-gray-50 rounded-lg">
                  <p className="text-xs text-gray-500 uppercase">Expires</p>
                  <p className="font-bold text-gray-800">{formatDate(selectedPackage.expiry_date)}</p>
               </div>
            </div>

            <div className="space-y-4">
               <div>
                 <div className="flex justify-between text-sm mb-1">
                   <span className="text-gray-600">Usage Progress</span>
                   <span className="font-medium text-gray-900">{selectedPackage.used_hours.toFixed(1)} / {selectedPackage.total_hours} Hours</span>
                 </div>
                 <div className="w-full bg-gray-200 rounded-full h-3">
                    <div 
                      className="h-3 rounded-full bg-blue-600" 
                      style={{ width: `${Math.min(100, (selectedPackage.used_hours / selectedPackage.total_hours) * 100)}%` }}
                    ></div>
                 </div>
               </div>
               
               <div className="grid grid-cols-2 gap-4 text-sm pt-2 border-t">
                  <div>
                    <p className="text-gray-500">Package Value</p>
                    <p className="font-medium text-gray-900">₹{(selectedPackage.package_amount / 100).toLocaleString()}</p>
                  </div>
                  <div>
                    <p className="text-gray-500">Outlet</p>
                    <p className="font-medium text-gray-900">{selectedPackage.outlet}</p>
                  </div>
                  <div>
                    <p className="text-gray-500">Start Date</p>
                    <p className="font-medium text-gray-900">{formatDate(selectedPackage.start_date)}</p>
                  </div>
               </div>
            </div>

            <div className="mt-8 flex justify-end">
               <button onClick={() => setIsDetailsModalOpen(false)} className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200">Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}