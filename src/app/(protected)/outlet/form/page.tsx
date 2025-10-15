// src/app/(protected)/outlet/form/page.tsx
'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { OUTLETS } from '@/lib/outlets';

export default function OutletCustomerForm() {
  const router = useRouter();
  const [outletName, setOutletName] = useState('');
  const [formData, setFormData] = useState({
    name: '',
    mobile: '',
    date: new Date().toISOString().split('T')[0],
    treatment: '',
    amountPaid: 0,
    sessionHours: 0,
    tookPackage: false,
    packageAmount: '',
    totalPackageHours: '',
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    const outletId = document.cookie.split('; ').find(row => row.startsWith('outlet_id='))?.split('=')[1];
    if (outletId) {
      const outlet = OUTLETS.find(o => o.id === outletId);
      if (outlet) setOutletName(outlet.name);
    }
  }, []);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value, type, checked } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : type === 'number' ? (value === '' ? 0 : Number(value)) : value
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    try {
      const submissionData = {
        ...formData,
        outlet: outletName,
        packageAmount: formData.packageAmount ? Number(formData.packageAmount) : undefined,
        totalPackageHours: formData.totalPackageHours ? Number(formData.totalPackageHours) : undefined,
      };

      const { error } = await supabase
        .from('customers')
        .insert([submissionData]);

      if (error) throw error;

      setSuccess(true);
      setFormData({
        name: '',
        mobile: '',
        date: new Date().toISOString().split('T')[0],
        treatment: '',
        amountPaid: 0,
        sessionHours: 0,
        tookPackage: false,
        packageAmount: '',
        totalPackageHours: '',
      });
    } catch (error) {
      alert('Error saving customer. Please try again.');
      console.error('Submit error:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto p-6 bg-white rounded-xl shadow-md mt-8 relative">
      <h1 className="text-2xl font-bold text-gray-800 mb-6">Add New Customer - {outletName}</h1>
      
      <button
        type="button"
        onClick={() => router.push('/outlet/dashboard')}
        className="absolute top-6 right-6 text-gray-500 hover:text-gray-700 text-2xl"
      >
        &times;
      </button>

      {success && (
        <div className="mb-6 p-4 bg-green-50 text-green-700 rounded-lg border border-green-200">
          ✅ Customer saved successfully!
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-5">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Full Name *</label>
            <input
              name="name"
              type="text"
              value={formData.name}
              onChange={handleChange}
              required
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-gray-900"
            />
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Date *</label>
            <input
              name="date"
              type="date"
              value={formData.date}
              onChange={handleChange}
              required
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-gray-900"
            />
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Treatment *</label>
            <input
              name="treatment"
              type="text"
              value={formData.treatment}
              onChange={handleChange}
              required
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-gray-900"
            />
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Amount Paid ($)</label>
            <input
              name="amountPaid"
              type="number"
              min="0"
              step="0.01"
              value={formData.amountPaid || ''}
              onChange={handleChange}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-gray-900"
            />
          </div>
        </div>

        <div className="pt-4 border-t border-gray-200">
          <label className="flex items-center cursor-pointer">
            <div className="relative">
              <input
                type="checkbox"
                name="tookPackage"
                checked={formData.tookPackage}
                onChange={handleChange}
                className="sr-only"
              />
              <div className={`block w-14 h-8 rounded-full ${formData.tookPackage ? 'bg-blue-500' : 'bg-gray-300'}`}></div>
              <div className={`absolute left-1 top-1 bg-white w-6 h-6 rounded-full transition-transform ${formData.tookPackage ? 'transform translate-x-6' : ''}`}></div>
            </div>
            <div className="ml-3 text-gray-700 text-sm">
              Did this client take a package today?
            </div>
          </label>
        </div>

        {formData.tookPackage && (
          <div className="mt-4 p-4 bg-blue-50 rounded-lg border border-blue-200 space-y-4">
            <h3 className="text-md font-semibold text-blue-800">Package Details</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm text-gray-700 mb-1">Package Amount (₹)</label>
                <input
                  name="packageAmount"
                  type="number"
                  min="0"
                  value={formData.packageAmount}
                  onChange={handleChange}
                  className="w-full px-3 py-2 border border-gray-300 rounded focus:ring-1 focus:ring-blue-500 focus:border-blue-500 text-gray-900"
                />
              </div>
              
              <div>
                <label className="block text-sm text-gray-700 mb-1">Total Hours</label>
                <input
                  name="totalPackageHours"
                  type="number"
                  min="0"
                  step="0.1"
                  value={formData.totalPackageHours}
                  onChange={handleChange}
                  className="w-full px-3 py-2 border border-gray-300 rounded focus:ring-1 focus:ring-blue-500 focus:border-blue-500 text-gray-900"
                />
              </div>
            </div>
          </div>
        )}

        <button
          type="submit"
          disabled={isSubmitting}
          className="w-full py-3 px-4 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-400"
        >
          {isSubmitting ? 'Saving...' : 'Save Customer'}
        </button>
      </form>
    </div>
  );
}