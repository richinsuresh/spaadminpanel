'use client';

import { useState, useEffect, useCallback, FormEvent, useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import { OUTLETS } from '@/lib/outlet';
import { exportToExcel } from '@/lib/exportToExcel';
import { useActivityLog } from '@/hooks/useActivityLog';
import LastAction from '@/components/LastAction';

type Expense = {
  id: string;
  date: string;
  outlet_id: string;
  outlet_name: string;
  description: string;
  category: string | null;
  amount: number; // paise
  payment_method: string | null;
  added_by: string | null;
  notes: string | null;
  created_at: string;
};

const formatCurrency = (amountPaise: number) =>
  new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: 0,
  }).format((amountPaise || 0) / 100);

const toInputDate = (d: string | null): string => {
  if (!d) return '';
  const dt = new Date(d);
  if (isNaN(dt.getTime())) return '';
  return dt.toISOString().split('T')[0];
};

const getToday = () => new Date().toISOString().split('T')[0];

// --- NEW HELPER: Get date N days ago ---
const getNDaysAgo = (n: number) => {
  const date = new Date();
  date.setDate(date.getDate() - n);
  return date.toISOString().split('T')[0];
};

export default function OutletExpensesPage() {
  const { logActivity } = useActivityLog();

  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(true);
  const [isExporting, setIsExporting] = useState(false);

  // --- MODIFIED INITIAL STATE ---
  const [startDate, setStartDate] = useState<string>(getNDaysAgo(30)); // Default to 30 days ago
  const [endDate, setEndDate] = useState<string>(getToday()); // Default to today
  // ------------------------------
  const [selectedOutletId, setSelectedOutletId] = useState<string>(
    OUTLETS[0]?.id || 'unknown'
  );

  // ADD FORM
  const [form, setForm] = useState<{
    date: string;
    category: string;
    description: string;
    amount: string; // in ₹ as text
    payment_method: string;
    added_by: string;
    notes: string;
  }>({
    date: getToday(),
    category: '',
    description: '',
    amount: '',
    payment_method: 'cash',
    added_by: '',
    notes: '',
  });

  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  /* ============ FETCH ============ */

  const fetchExpenses = useCallback(async () => {
    setLoading(true);
    try {
      let query = supabase
        .from('expenses')
        .select('*')
        .gte('date', startDate) // Uses start date
        .lte('date', endDate)   // Uses end date
        .order('date', { ascending: false })
        .order('created_at', { ascending: false });

      if (selectedOutletId !== 'all') {
        query = query.eq('outlet_id', selectedOutletId);
      }

      const { data, error } = await query;

      if (error) {
        console.error(error);
        setExpenses([]);
      } else {
        setExpenses((data || []) as Expense[]);
      }
    } finally {
      setLoading(false);
    }
  }, [startDate, endDate, selectedOutletId]); // Dependencies already correct

  useEffect(() => {
    fetchExpenses();
  }, [fetchExpenses]);

  /* ============ TOTALS ============ */

  const totalAmount = useMemo(
    () => expenses.reduce((sum, e) => sum + (e.amount || 0), 0),
    [expenses]
  );

  /* ============ FORM HANDLERS (Unchanged) ============ */

  const handleFormChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>
  ) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleAddExpense = async (e: FormEvent) => {
    e.preventDefault();
    setSubmitError(null);

    if (!form.description.trim()) {
      setSubmitError('Please enter what was purchased (description).');
      return;
    }
    if (!form.amount || Number(form.amount) <= 0) {
      setSubmitError('Please enter a valid amount.');
      return;
    }

    const amountPaise = Math.round(Number(form.amount) * 100);

    const outlet = OUTLETS.find((o) => o.id === selectedOutletId);
    const outlet_name = outlet ? outlet.name : 'Unknown Outlet';

    setIsSubmitting(true);
    try {
      const { error } = await supabase.from('expenses').insert({
        date: form.date || getToday(),
        outlet_id: selectedOutletId,
        outlet_name,
        description: form.description.trim(),
        category: form.category || null,
        amount: amountPaise,
        payment_method: form.payment_method || null,
        added_by: form.added_by || null,
        notes: form.notes || null,
      });

      if (error) {
        console.error(error);
        setSubmitError(error.message);
        return;
      }

      // Clear form a bit
      setForm((prev) => ({
        ...prev,
        description: '',
        amount: '',
        notes: '',
      }));

      // Refresh list
      await fetchExpenses();
    } finally {
      setIsSubmitting(false);
    }
  };

  /* ============ EXPORT (Unchanged) ============ */

  const handleExport = async () => {
    setIsExporting(true);
    try {
      let query = supabase
        .from('expenses')
        .select('*')
        .gte('date', startDate)
        .lte('date', endDate)
        .order('date', { ascending: true });

      if (selectedOutletId !== 'all') {
        query = query.eq('outlet_id', selectedOutletId);
      }

      const { data, error } = await query;
      if (error) throw error;

      const rows = (data || []) as Expense[];

      if (!rows.length) {
        alert('No expenses to export for this period.');
        return;
      }

      const exportData = rows.map((e) => ({
        Date: toInputDate(e.date),
        Outlet: e.outlet_name,
        Category: e.category || '',
        Description: e.description,
        'Amount (₹)': (e.amount || 0) / 100,
        'Payment Method': e.payment_method || '',
        'Added By': e.added_by || '',
        Notes: e.notes || '',
      }));

      const outletName =
        selectedOutletId === 'all'
          ? 'AllOutlets'
          : OUTLETS.find((o) => o.id === selectedOutletId)?.name || 'Outlet';

      const fileName = `Expenses_${outletName}_${startDate}_to_${endDate}.xlsx`;
      exportToExcel(exportData, fileName);

      logActivity('export_expenses', `Downloaded Expenses Report (${fileName})`);
    } catch (err: any) {
      console.error(err);
      alert('Failed to export expenses');
    } finally {
      setIsExporting(false);
    }
  };

  /* ============ UI ============ */

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-800">Outlet Expenses</h1>

      {/* Filters & Export (Already correctly filters by the start/end date state) */}
      <div className="bg-white p-4 rounded-xl shadow-sm grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 items-end">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Outlet
          </label>
          <select
            value={selectedOutletId}
            onChange={(e) => setSelectedOutletId(e.target.value)}
            className="w-full px-3 py-2 border rounded-lg bg-white text-black"
          >
            {OUTLETS.map((o) => (
              <option key={o.id} value={o.id} className="text-black">
                {o.name}
              </option>
            ))}
          </select>
          <p className="text-xs text-gray-400 mt-1">
            (For a pure outlet panel you can fix this to that outlet.)
          </p>
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
          <LastAction actionType="export_expenses" />
        </div>
      </div>

      {/* Add Expense Form (Unchanged) */}
      <div className="bg-white p-6 rounded-xl shadow-sm">
        <h2 className="text-lg font-semibold text-gray-800 mb-4">
          Add New Expense
        </h2>

        {submitError && (
          <div className="mb-3 p-2 bg-red-100 text-red-700 rounded">
            {submitError}
          </div>
        )}

        <form onSubmit={handleAddExpense} className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="text-xs font-semibold text-black">
              Date
            </label>
            <input
              type="date"
              name="date"
              value={form.date}
              onChange={handleFormChange}
              className="w-full p-2 border rounded text-black bg-white"
            />
          </div>

          <div>
            <label className="text-xs font-semibold text-black">
              Category (optional)
            </label>
            <input
              type="text"
              name="category"
              value={form.category}
              onChange={handleFormChange}
              className="w-full p-2 border rounded text-black bg-white"
              placeholder="Rent, Supplies, Groceries, etc."
            />
          </div>

          <div className="md:col-span-2">
            <label className="text-xs font-semibold text-black">
              What did you buy? (Description)
            </label>
            <input
              type="text"
              name="description"
              value={form.description}
              onChange={handleFormChange}
              className="w-full p-2 border rounded text-black bg-white"
              placeholder="Example: Cleaning supplies for reception"
              required
            />
          </div>

          <div>
            <label className="text-xs font-semibold text-black">
              Amount (₹)
            </label>
            <input
              type="number"
              name="amount"
              value={form.amount}
              onChange={handleFormChange}
              className="w-full p-2 border rounded text-black bg-white"
              min="0"
              step="0.01"
              required
            />
          </div>

          <div>
            <label className="text-xs font-semibold text-black">
              Payment Method
            </label>
            <select
              name="payment_method"
              value={form.payment_method}
              onChange={handleFormChange}
              className="w-full p-2 border rounded text-black bg-white"
            >
              <option value="cash">Cash</option>
              <option value="upi">UPI</option>
              <option value="card">Card</option>
              <option value="bank_transfer">Bank Transfer</option>
              <option value="other">Other</option>
            </select>
          </div>

          <div>
            <label className="text-xs font-semibold text-black">
              Added By (optional)
            </label>
            <input
              type="text"
              name="added_by"
              value={form.added_by}
              onChange={handleFormChange}
              className="w-full p-2 border rounded text-black bg-white"
              placeholder="Staff name"
            />
          </div>

          <div className="md:col-span-2">
            <label className="text-xs font-semibold text-black">
              Notes (optional)
            </label>
            <textarea
              name="notes"
              rows={2}
              value={form.notes}
              onChange={handleFormChange}
              className="w-full p-2 border rounded text-black bg-white"
            />
          </div>

          <div className="md:col-span-2 flex justify-end">
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-60"
            >
              {isSubmitting ? 'Saving…' : 'Add Expense'}
            </button>
          </div>
        </form>
      </div>

      {/* Expense List (Unchanged) */}
      <div className="bg-white shadow rounded-lg overflow-hidden">
        <div className="p-4 flex justify-between items-center border-b">
          <h2 className="text-lg font-semibold text-gray-800">Expenses</h2>
          <div className="text-sm text-gray-700">
            Total:{' '}
            <span className="font-bold">
              {formatCurrency(totalAmount)}
            </span>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200 text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-3 py-2 text-left text-xs font-bold text-gray-600 uppercase">
                  Date
                </th>
                <th className="px-3 py-2 text-left text-xs font-bold text-gray-600 uppercase">
                  Description
                </th>
                <th className="px-3 py-2 text-left text-xs font-bold text-gray-600 uppercase">
                  Category
                </th>
                <th className="px-3 py-2 text-left text-xs font-bold text-gray-600 uppercase">
                  Amount
                </th>
                <th className="px-3 py-2 text-left text-xs font-bold text-gray-600 uppercase">
                  Payment
                </th>
                <th className="px-3 py-2 text-left text-xs font-bold text-gray-600 uppercase">
                  Added By
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {loading ? (
                <tr>
                  <td
                    colSpan={6}
                    className="p-6 text-center text-gray-500"
                  >
                    Loading…
                  </td>
                </tr>
              ) : expenses.length === 0 ? (
                <tr>
                  <td
                    colSpan={6}
                    className="p-6 text-center text-gray-500"
                  >
                    No expenses found.
                  </td>
                </tr>
              ) : (
                expenses.map((e) => (
                  <tr key={e.id}>
                    <td className="px-3 py-2 text-black">
                      {toInputDate(e.date)}
                    </td>
                    <td className="px-3 py-2 text-black">
                      {e.description}
                    </td>
                    <td className="px-3 py-2 text-black">
                      {e.category || '—'}
                    </td>
                    <td className="px-3 py-2 font-medium text-black">
                      {formatCurrency(e.amount)}
                    </td>
                    <td className="px-3 py-2 text-black">
                      {e.payment_method || '—'}
                    </td>
                    <td className="px-3 py-2 text-black">
                      {e.added_by || '—'}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}