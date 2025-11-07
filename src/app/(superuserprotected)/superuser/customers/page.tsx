'use client';

import { useState, useEffect, FormEvent, ChangeEvent } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { OUTLETS } from '@/lib/outlet';

// --- (Pencil Icon) ---
const PencilIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
    <path d="M5.433 13.917l1.262-3.155A4 4 0 017.58 9.42l6.92-6.918a2.121 2.121 0 013 3l-6.92 6.918c-.383.383-.84.685-1.343.886l-3.154 1.262a.5.5 0 01-.65-.65z" />
    <path d="M3.5 5.75c0-.69.56-1.25 1.25-1.25H10A.75.75 0 0010 3H4.75A2.75 2.75 0 002 5.75v9.5A2.75 2.75 0 004.75 18h9.5A2.75 2.75 0 0017 15.25V10a.75.75 0 00-1.5 0v5.25c0 .69-.56 1.25-1.25 1.25h-9.5c-.69 0-1.25-.56-1.25-1.25v-9.5z" />
  </svg>
);

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
};

type PackageInfo = {
  id?: string;
  name: string;
  mobile: string;
  packageAmount: number;
  totalPackageHours: number;
  usedPackageHours: number;
  remainingHours: number;
  expiryDate: string;
  status: 'active' | 'expired';
  outlet?: string;
};

type CustomerDetails = {
  name: string;
  mobile: string;
  packageInfo: PackageInfo | null;
  visits: any[]; 
};

// --- (NEW) Type for Edit Modal ---
type EditVisitData = {
  id: string;
  name: string;
  mobile: string;
  date: string;
  treatment: string;
  session_hours: string; // Use string for form input
  outlet_name: string;
  therapist_name: string;
};

// --- Helper Functions ---
const formatCurrency = (amountInPaise: number) =>
  new Intl.NumberFormat('en-IN', {
    style: 'currency', currency: 'INR', minimumFractionDigits: 0, maximumFractionDigits: 0,
  }).format(amountInPaise / 100);

const formatDuration = (hours: number | null) => {
  if (!hours || hours === 0) return '—';
  if (hours < 1) return `${Math.round(hours * 60)} mins`;
  const h = Math.floor(hours);
  const m = Math.round((hours % 1) * 60);
  if (m === 0) return `${h} hr${h > 1 ? 's' : ''}`;
  if (h === 0) return `${m} mins`;
  return `${h}hr ${m}m`;
};

const formatDate = (dateString: string | null) => {
  if (!dateString) return '—';
  return new Date(dateString).toLocaleDateString('en-IN', {
    day: 'numeric', month: 'short', year: 'numeric',
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


export default function SuperUserCustomersPage() {
  const [customers, setCustomers] = useState<CustomerVisit[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [outletFilter, setOutletFilter] = useState('all');

  const [modalLoading, setModalLoading] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState<CustomerDetails | null>(null);
  const [modalError, setModalError] = useState('');

  // --- (NEW) State for Edit Modal ---
  const [editModalData, setEditModalData] = useState<EditVisitData | null>(null);
  const [editModalLoading, setEditModalLoading] = useState(false);
  const [editModalError, setEditModalError] = useState('');

  const outlets = ['all', ...OUTLETS.map(o => o.name)];

  const fetchCustomers = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('customers')
        .select('id, name, mobile, date, treatment, session_hours, outlet_name, therapist_name, check_in_time, check_out_time')
        .order('date', { ascending: false });
      
      if (error) throw error;
      setCustomers(data as CustomerVisit[] || []);
    } catch (err) {
      console.error('Error fetching customers:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCustomers();
  }, []);

  // This opens the (READ-ONLY) details modal
  const handleCustomerClick = async (customer: CustomerVisit) => {
    setSelectedCustomer({ name: customer.name, mobile: customer.mobile, packageInfo: null, visits: [] });
    setModalLoading(true);
    setModalError('');

    try {
      const [pkgRes, visitsRes] = await Promise.all([
        fetch(`/api/client-lookup?mobile=${encodeURIComponent(customer.mobile)}`),
        supabase
          .from('customers')
          .select('id, date, treatment, outlet_name, therapist_name, session_hours')
          .eq('mobile', customer.mobile)
          .order('date', { ascending: false })
          .limit(3)
      ]);

      const packageInfo: PackageInfo | null = await pkgRes.json();
      if (visitsRes.error) throw new Error(`Visits Error: ${visitsRes.error.message}`);

      setSelectedCustomer({
        name: customer.name,
        mobile: customer.mobile,
        packageInfo: packageInfo,
        visits: visitsRes.data as CustomerVisit[] || []
      });

    } catch (err: any) {
      setModalError(err.message);
    } finally {
      setModalLoading(false);
    }
  };

  // --- (NEW) Edit Modal Handlers ---
  const handleEditClick = (visit: CustomerVisit) => {
    setEditModalError('');
    setEditModalData({
      id: visit.id,
      name: visit.name,
      mobile: visit.mobile,
      date: formatDateForInput(visit.date),
      treatment: visit.treatment,
      session_hours: visit.session_hours.toString(),
      outlet_name: visit.outlet_name,
      therapist_name: visit.therapist_name || '',
    });
  };

  const handleEditModalClose = () => setEditModalData(null);

  const handleEditModalChange = (e: ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    if (editModalData) {
      setEditModalData({ ...editModalData, [e.target.name]: e.target.value });
    }
  };

  const handleEditModalSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!editModalData) return;

    setEditModalLoading(true);
    setEditModalError('');

    try {
      const visitUpdates = {
        name: editModalData.name,
        mobile: editModalData.mobile,
        date: editModalData.date,
        treatment: editModalData.treatment,
        session_hours: Number(editModalData.session_hours),
        outlet_name: editModalData.outlet_name,
        therapist_name: editModalData.therapist_name,
      };

      const res = await fetch('/api/superuser/update-visit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: editModalData.id, data: visitUpdates }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || 'Failed to update visit');
      }

      await fetchCustomers(); // Refresh list
      handleEditModalClose();

    } catch (err: any) {
      setEditModalError(err.message);
    } finally {
      setEditModalLoading(false);
    }
  };


  const filteredCustomers = customers.filter(customer => {
    const matchesSearch = !searchTerm || 
      customer.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      customer.mobile.includes(searchTerm);
    const matchesOutlet = outletFilter === 'all' || customer.outlet_name === outletFilter;
    return matchesSearch && matchesOutlet;
  });
  
  const uniqueCustomers = Array.from(new Map(filteredCustomers.map(c => [c.mobile, c])).values())
    .sort((a,b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  return (
    <div>
      {/* Page Header */}
      <div className="flex flex-col lg:flex-row lg:justify-between lg:items-start mb-8 gap-4">
        <h1 className="text-2xl font-bold text-gray-800">SuperUser - All Customers</h1>
        <div className="flex flex-col sm:flex-row gap-3">
          <button
            onClick={fetchCustomers}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center"
          >
            🔄 Refresh Data
          </button>
          <Link
            href="/form" // This link is fine, it goes to the shared form
            className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700"
          >
            ➕ Add New Customer
          </Link>
        </div>
      </div>

      {/* Filters (Same as admin) */}
      <div className="bg-white p-6 rounded-xl shadow mb-6">
        {/* ... (filter inputs) ... */}
      </div>

      <div className="mb-4 text-sm text-gray-600">
        Showing {uniqueCustomers.length} unique customers. Click row for details, pencil to edit.
      </div>

      {loading ? (
        <div className="bg-white shadow rounded-lg p-8 text-center">Loading customers...</div>
      ) : uniqueCustomers.length === 0 ? (
        <div className="bg-white shadow rounded-lg p-8 text-center text-gray-500">No customers match.</div>
      ) : (
        <div className="bg-white shadow rounded-lg overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  {/* --- (NEW) Edit Column --- */}
                  <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase">Edit</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Name</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Mobile</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Last Visit Date</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Last Outlet</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {uniqueCustomers.map((customer) => (
                  <tr key={customer.id}>
                    {/* --- (NEW) Edit Button Cell --- */}
                    <td className="px-3 py-4 whitespace-nowrap">
                       <button
                        onClick={(e) => {
                          e.stopPropagation(); // Prevent row click
                          handleEditClick(customer);
                        }}
                        className="text-purple-600 hover:text-purple-800"
                        title="Edit This Visit Record"
                      >
                        <PencilIcon />
                      </button>
                    </td>
                    <td 
                      onClick={() => handleCustomerClick(customer)}
                      className="px-6 py-4 whitespace-nowrap font-medium text-gray-900 cursor-pointer hover:bg-gray-50"
                    >
                      {customer.name}
                    </td>
                    <td 
                      onClick={() => handleCustomerClick(customer)}
                      className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 cursor-pointer hover:bg-gray-50"
                    >
                      {customer.mobile}
                    </td>
                    <td 
                      onClick={() => handleCustomerClick(customer)}
                      className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 cursor-pointer hover:bg-gray-50"
                    >
                      {formatDate(customer.date)}
                    </td>
                    <td 
                      onClick={() => handleCustomerClick(customer)}
                      className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 cursor-pointer hover:bg-gray-50"
                    >
                      {customer.outlet_name}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* --- (READ-ONLY) Details Modal (Same as admin) --- */}
      {selectedCustomer && (
        <div 
          className="fixed inset-0 z-40 flex items-center justify-center p-4 bg-black/30"
          onClick={() => setSelectedCustomer(null)}
        >
          {/* ... (Read-only modal content) ... */}
        </div>
      )}

      {/* --- (NEW) Edit Visit Modal --- */}
      {editModalData && (
        <div 
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50"
          onClick={handleEditModalClose}
        >
          <div
            className="bg-white rounded-lg shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <form onSubmit={handleEditModalSubmit}>
              <div className="p-6 border-b">
                <h2 className="text-xl font-bold text-gray-900">Edit Visit Record</h2>
                <p className="text-sm text-gray-500">Visit ID: {editModalData.id}</p>
              </div>
              
              <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label htmlFor="name" className="block text-sm font-medium text-gray-700">Name</label>
                  <input id="name" name="name" type="text" value={editModalData.name} onChange={handleEditModalChange}
                    className="w-full px-3 py-2 mt-1 border border-gray-300 rounded-lg"
                  />
                </div>
                <div>
                  <label htmlFor="mobile" className="block text-sm font-medium text-gray-700">Mobile</label>
                  <input id="mobile" name="mobile" type="text" value={editModalData.mobile} onChange={handleEditModalChange}
                    className="w-full px-3 py-2 mt-1 border border-gray-300 rounded-lg"
                  />
                </div>
                <div>
                  <label htmlFor="date" className="block text-sm font-medium text-gray-700">Visit Date</label>
                  <input id="date" name="date" type="date" value={editModalData.date} onChange={handleEditModalChange}
                    className="w-full px-3 py-2 mt-1 border border-gray-300 rounded-lg"
                  />
                </div>
                 <div>
                  <label htmlFor="outlet_name" className="block text-sm font-medium text-gray-700">Outlet</label>
                  <select id="outlet_name" name="outlet_name" value={editModalData.outlet_name} onChange={handleEditModalChange}
                    className="w-full px-3 py-2 mt-1 border border-gray-300 rounded-lg bg-white"
                  >
                    {OUTLETS.map(o => <option key={o.id} value={o.name}>{o.name}</option>)}
                  </select>
                </div>
                <div className="col-span-2">
                  <label htmlFor="treatment" className="block text-sm font-medium text-gray-700">Treatment / Service</label>
                  <input id="treatment" name="treatment" type="text" value={editModalData.treatment} onChange={handleEditModalChange}
                    className="w-full px-3 py-2 mt-1 border border-gray-300 rounded-lg"
                  />
                </div>
                 <div>
                  <label htmlFor="session_hours" className="block text-sm font-medium text-gray-700">Session Hours (e.g., 1.5)</label>
                  <input id="session_hours" name="session_hours" type="number" step="0.5" value={editModalData.session_hours} onChange={handleEditModalChange}
                    className="w-full px-3 py-2 mt-1 border border-gray-300 rounded-lg"
                  />
                </div>
                <div>
                  <label htmlFor="therapist_name" className="block text-sm font-medium text-gray-700">Therapist Name</label>
                  <input id="therapist_name" name="therapist_name" type="text" value={editModalData.therapist_name} onChange={handleEditModalChange}
                    className="w-full px-3 py-2 mt-1 border border-gray-300 rounded-lg"
                  />
                </div>
                {editModalError && <p className="col-span-2 text-sm text-red-600">{editModalError}</p>}
              </div>
              
              <div className="p-4 bg-gray-50 flex justify-end gap-3">
                <button type="button" onClick={handleEditModalClose}
                  className="px-4 py-2 bg-white border border-gray-300 rounded-lg text-sm font-medium hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button type="submit" disabled={editModalLoading}
                  className="px-4 py-2 bg-purple-600 text-white rounded-lg text-sm font-medium hover:bg-purple-700 disabled:opacity-50"
                >
                  {editModalLoading ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}