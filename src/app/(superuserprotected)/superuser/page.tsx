'use client';

import { useState, useEffect, ChangeEvent, FormEvent } from 'react';
import { supabase } from '@/lib/supabase';

// Icon for the edit button
const PencilIcon = () => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 20 20"
    fill="currentColor"
    className="w-5 h-5"
  >
    <path d="M5.433 13.917l1.262-3.155A4 4 0 017.58 9.42l6.92-6.918a2.121 2.121 0 013 3l-6.92 6.918c-.383.383-.84.685-1.343.886l-3.154 1.262a.5.5 0 01-.65-.65z" />
    <path d="M3.5 5.75c0-.69.56-1.25 1.25-1.25H10A.75.75 0 0010 3H4.75A2.75 2.75 0 002 5.75v9.5A2.75 2.75 0 004.75 18h9.5A2.75 2.75 0 0017 15.25V10a.75.75 0 00-1.5 0v5.25c0 .69-.56 1.25-1.25 1.25h-9.5c-.69 0-1.25-.56-1.25-1.25v-9.5z" />
  </svg>
);

// Type for customer data from 'packages' table
type CustomerPackage = {
  id: string;
  name: string;
  mobile: string;
  // Add other fields if you want to display/edit them
};

// Type for the edit modal
type EditModalData = {
  id: string;
  name: string;
  mobile: string;
};

export default function SuperUserPage() {
  const [customers, setCustomers] = useState<CustomerPackage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [searchTerm, setSearchTerm] = useState('');

  // Modal state
  const [modalData, setModalData] = useState<EditModalData | null>(null);
  const [modalLoading, setModalLoading] = useState(false);
  const [modalError, setModalError] = useState('');

  const fetchCustomers = async () => {
    setLoading(true);
    setError('');
    try {
      // Fetching from 'packages' table as the primary customer record
      const { data, error } = await supabase
        .from('packages')
        .select('id, name, mobile')
        .order('name', { ascending: true });

      if (error) throw error;
      setCustomers(data || []);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCustomers();
  }, []);

  const handleEditClick = (customer: CustomerPackage) => {
    setModalData({
      id: customer.id,
      name: customer.name,
      mobile: customer.mobile,
    });
    setModalError('');
    setModalLoading(false);
  };

  const handleModalClose = () => {
    setModalData(null);
  };

  const handleModalChange = (e: ChangeEvent<HTMLInputElement>) => {
    if (modalData) {
      setModalData({ ...modalData, [e.target.name]: e.target.value });
    }
  };

  const handleModalSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!modalData) return;

    setModalLoading(true);
    setModalError('');

    try {
      const res = await fetch('/api/superuser/update-customer', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          id: modalData.id,
          name: modalData.name,
          mobile: modalData.mobile,
        }),
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.message || 'Failed to update');
      }

      // Success: update state and close modal
      setCustomers(
        customers.map((c) =>
          c.id === modalData.id
            ? { ...c, name: modalData.name, mobile: modalData.mobile }
            : c
        )
      );
      handleModalClose();
    } catch (err: any) {
      setModalError(err.message);
    } finally {
      setModalLoading(false);
    }
  };

  const filteredCustomers = customers.filter(
    (c) =>
      c.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      c.mobile.includes(searchTerm)
  );

  return (
    <div className="p-4 md:p-8">
      <h1 className="text-2xl font-bold text-gray-800 mb-6">
        Super User - Edit Customers
      </h1>
      
      {/* Search */}
      <div className="mb-4 max-w-lg">
        <input
          type="text"
          placeholder="Search by name or mobile..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500 text-gray-900"
        />
      </div>

      {/* Table */}
      {loading && <p>Loading customers...</p>}
      {error && <p className="text-red-600">Error: {error}</p>}
      {!loading && !error && (
        <div className="bg-white shadow rounded-lg overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Name</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Mobile</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Edit</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {filteredCustomers.map((customer) => (
                  <tr key={customer.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap font-medium text-gray-900">
                      {customer.name}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {customer.mobile}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm">
                      <button
                        onClick={() => handleEditClick(customer)}
                        className="text-purple-600 hover:text-purple-800"
                        title="Edit Customer"
                      >
                        <PencilIcon />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Edit Modal */}
      {modalData && (
        <div 
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50"
          onClick={handleModalClose}
        >
          <div
            className="bg-white rounded-lg shadow-2xl w-full max-w-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <form onSubmit={handleModalSubmit}>
              <div className="p-6 border-b">
                <h2 className="text-xl font-bold text-gray-900">Edit Customer</h2>
              </div>
              <div className="p-6 space-y-4">
                <div>
                  <label htmlFor="name" className="block text-sm font-medium text-gray-700">Name</label>
                  <input
                    id="name"
                    name="name"
                    type="text"
                    value={modalData.name}
                    onChange={handleModalChange}
                    className="w-full px-3 py-2 mt-1 border border-gray-300 rounded-lg"
                  />
                </div>
                <div>
                  <label htmlFor="mobile" className="block text-sm font-medium text-gray-700">Mobile</label>
                  <input
                    id="mobile"
                    name="mobile"
                    type="text"
                    value={modalData.mobile}
                    onChange={handleModalChange}
                    className="w-full px-3 py-2 mt-1 border border-gray-300 rounded-lg"
                  />
                </div>
                {modalError && <p className="text-sm text-red-600">{modalError}</p>}
              </div>
              <div className="p-4 bg-gray-50 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={handleModalClose}
                  className="px-4 py-2 bg-white border border-gray-300 rounded-lg text-sm font-medium hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={modalLoading}
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