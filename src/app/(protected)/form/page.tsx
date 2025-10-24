// src/app/(protected)/form/page.tsx
'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function OutletAddCustomerPage() {
  const router = useRouter();

  const [name, setName] = useState('');
  const [mobile, setMobile] = useState('');
  const [treatment, setTreatment] = useState('');
  const [tookPackage, setTookPackage] = useState(false);
  const [sessionHours, setSessionHours] = useState<number | ''>('');
  const [packageAmount, setPackageAmount] = useState<number | ''>('');
  const [totalPackageHours, setTotalPackageHours] = useState<number | ''>('');
  const [amountPaid, setAmountPaid] = useState<number | ''>('');
  const [date, setDate] = useState<string>(() => new Date().toISOString().split('T')[0]);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault(); // prevents browser full-page navigation
    setError(null);
    setSuccess(null);
    setLoading(true);

    try {
      const outlet = document.cookie.split('; ').find(row => row.trim().startsWith('outlet_id='))?.split('=')[1];

      const payload = {
        name,
        mobile,
        treatment,
        tookPackage,
        isPackageCustomer: !!tookPackage,
        sessionHours: typeof sessionHours === 'number' ? sessionHours : Number(sessionHours || 0),
        packageAmount: typeof packageAmount === 'number' ? packageAmount : Number(packageAmount || 0),
        totalPackageHours: typeof totalPackageHours === 'number' ? totalPackageHours : Number(totalPackageHours || 0),
        amountPaid: typeof amountPaid === 'number' ? amountPaid : Number(amountPaid || 0),
        date,
        outlet, // server expects body.outlet
      };

      const res = await fetch('/api/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      console.log('submit response status:', res.status, 'redirected:', res.redirected, 'url:', res.url);

      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || `Request failed with status ${res.status}`);
      }

      const data = await res.json().catch(() => null);
      setSuccess('Customer saved successfully');

      // Do not route to /admin here - keep user in outlet area.
      // Uncomment/adjust below if you want to navigate after save:
      // router.push('/outlet'); 
      // Or just clear form and optionally refresh local dashboard data:
      setName(''); setMobile(''); setTreatment(''); setTookPackage(false);
      setSessionHours(''); setPackageAmount(''); setTotalPackageHours(''); setAmountPaid('');
    } catch (err: any) {
      console.error('Save failed', err);
      setError(err?.message || 'Failed to save customer');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto p-6 bg-white rounded-md shadow">
      <h1 className="text-2xl font-semibold mb-4">Add Customer</h1>

      <form onSubmit={handleSubmit} className="grid gap-4">
        <label>
          <div className="text-sm text-gray-600">Name</div>
          <input value={name} onChange={e => setName(e.target.value)} className="mt-1 w-full border px-3 py-2 rounded-md" required />
        </label>

        <label>
          <div className="text-sm text-gray-600">Mobile</div>
          <input value={mobile} onChange={e => setMobile(e.target.value)} className="mt-1 w-full border px-3 py-2 rounded-md" required />
        </label>

        <label>
          <div className="text-sm text-gray-600">Treatment</div>
          <input value={treatment} onChange={e => setTreatment(e.target.value)} className="mt-1 w-full border px-3 py-2 rounded-md" />
        </label>

        <label className="flex items-center gap-2">
          <input type="checkbox" checked={tookPackage} onChange={e => setTookPackage(e.target.checked)} />
          <span className="text-sm">Took Package</span>
        </label>

        {tookPackage && (
          <>
            <label>
              <div className="text-sm text-gray-600">Package Amount</div>
              <input type="number" value={packageAmount ?? ''} onChange={e => setPackageAmount(Number(e.target.value))} className="mt-1 w-full border px-3 py-2 rounded-md" />
            </label>

            <label>
              <div className="text-sm text-gray-600">Total Package Hours</div>
              <input type="number" value={totalPackageHours ?? ''} onChange={e => setTotalPackageHours(Number(e.target.value))} className="mt-1 w-full border px-3 py-2 rounded-md" />
            </label>
          </>
        )}

        <label>
          <div className="text-sm text-gray-600">Session Hours</div>
          <input type="number" value={sessionHours ?? ''} onChange={e => setSessionHours(Number(e.target.value))} className="mt-1 w-full border px-3 py-2 rounded-md" />
        </label>

        <label>
          <div className="text-sm text-gray-600">Amount Paid</div>
          <input type="number" value={amountPaid ?? ''} onChange={e => setAmountPaid(Number(e.target.value))} className="mt-1 w-full border px-3 py-2 rounded-md" />
        </label>

        <label>
          <div className="text-sm text-gray-600">Date</div>
          <input type="date" value={date} onChange={e => setDate(e.target.value)} className="mt-1 w-full border px-3 py-2 rounded-md" />
        </label>

        <div className="flex items-center gap-3">
          <button type="submit" disabled={loading} className="px-4 py-2 bg-purple-600 text-white rounded-md">
            {loading ? 'Saving...' : 'Save'}
          </button>

          {error && <div className="text-red-600 text-sm">{error}</div>}
          {success && <div className="text-green-600 text-sm">{success}</div>}
        </div>
      </form>
    </div>
  );
}
