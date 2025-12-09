'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
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

export default function AdminExpensesPage() {
  const { logActivity } = useActivityLog();

  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(true);
  const [isExporting, setIsExporting] = useState(false);

  const [startDate, setStartDate] = useState<string>(getToday());
  const [endDate, setEndDate] = useState<string>(getToday());
  const [selectedOutletId, setSelectedOutletId] = useState<string>('all');

  // DELETE STATE
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [selectedExpenseForDelete, setSelectedExpenseForDelete] =
    useState<Expense | null>(null);
  const [deletePassword, setDeletePassword] = useState('');
  const [deleteRemark, setDeleteRemark] = useState('');
  const [deleteError, setDeleteError] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);

  /* ============ FETCH ============ */

  const fetchExpenses = useCallback(async () => {
    setLoading(true);
    try {
      let query = supabase
        .from('expenses')
        .select('*')
        .gte('date', startDate)
        .lte('date', endDate)
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
  }, [startDate, endDate, selectedOutletId]);

  useEffect(() => {
    fetchExpenses();
  }, [fetchExpenses]);

  /* ============ TOTALS ============ */

  const totalAmount = useMemo(
    () => expenses.reduce((sum, e) => sum + (e.amount || 0), 0),
    [expenses]
  );

  /* ============ EXPORT ============ */

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
        setIsExporting(false);
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

  /* ============ DELETE HANDLERS ============ */

  const handleOpenDelete = (expense: Expense) => {
    setSelectedExpenseForDelete(expense);
    setDeletePassword('');
    setDeleteRemark('');
    setDeleteError('');
    setIsDeleteModalOpen(true);
  };

  const handleDeleteConfirm = async () => {
    if (!selectedExpenseForDelete) return;

    if (deletePassword !== 'admin123') {
      setDeleteError('Incorrect admin password');
      return;
    }

    if (!deleteRemark.trim()) {
      setDeleteError('Please enter a reason for deleting this expense');
      return;
    }

    setIsDeleting(true);
    try {
      const before = { ...selectedExpenseForDelete };

      const { error } = await supabase
        .from('expenses')
        .delete()
        .eq('id', selectedExpenseForDelete.id);

      if (error) {
        setDeleteError(error.message);
        setIsDeleting(false);
        return;
      }

      // Log to activity_logs so it appears in Activity page with before/after
      await supabase.from('activity_logs').insert({
        action_type: 'delete_expense',
        description: JSON.stringify({
          remark: deleteRemark,
          before,
          after: null,
        }),
        username: 'admin',
      });

      setIsDeleteModalOpen(false);
      setSelectedExpenseForDelete(null);
      setDeletePassword('');
      setDeleteRemark('');
      setDeleteError('');

      fetchExpenses();
    } catch (err: any) {
      console.error(err);
      setDeleteError(err?.message ?? 'Failed to delete expense');
    } finally {
      setIsDeleting(false);
    }
  };

  const handleCloseDelete = () => {
    setIsDeleteModalOpen(false);
    setSelectedExpenseForDelete(null);
    setDeletePassword('');
    setDeleteRemark('');
    setDeleteError('');
  };

  /* ============ UI ============ */

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-800">
        Admin – Outlet Expenses
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
            className="w-full px-3 py-2 border rounded-lg bg-white text-black"
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
          <LastAction actionType="export_expenses" />
        </div>
      </div>

      {/* Totals */}
      <div className="bg-white p-6 rounded-xl shadow-sm">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div>
            <h3 className="text-gray-500 text-sm">Total Expenses</h3>
            <p className="text-2xl mt-2 font-bold text-red-600">
              {formatCurrency(totalAmount)}
            </p>
            <p className="text-xs text-gray-500">
              {expenses.length} expense entries
            </p>
          </div>
        </div>
      </div>

      {/* Expenses Table */}
      <div className="bg-white shadow rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200 text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-3 py-2 text-left text-xs font-bold text-gray-600 uppercase">
                  Date
                </th>
                <th className="px-3 py-2 text-left text-xs font-bold text-gray-600 uppercase">
                  Outlet
                </th>
                <th className="px-3 py-2 text-left text-xs font-bold text-gray-600 uppercase">
                  Category
                </th>
                <th className="px-3 py-2 text-left text-xs font-bold text-gray-600 uppercase">
                  Description
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
                <th className="px-3 py-2 text-left text-xs font-bold text-gray-600 uppercase">
                  Action
                </th>
              </tr>
            </thead>

            <tbody className="bg-white divide-y divide-gray-200">
              {loading ? (
                <tr>
                  <td
                    colSpan={8}
                    className="p-6 text-center text-gray-500"
                  >
                    Loading…
                  </td>
                </tr>
              ) : expenses.length === 0 ? (
                <tr>
                  <td
                    colSpan={8}
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
                      {e.outlet_name}
                    </td>
                    <td className="px-3 py-2 text-black">
                      {e.category || '—'}
                    </td>
                    <td className="px-3 py-2 text-black">
                      {e.description}
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
                    <td className="px-3 py-2 text-black">
                      <button
                        onClick={() => handleOpenDelete(e)}
                        className="px-3 py-1 bg-red-100 text-red-700 rounded-lg hover:bg-red-200 text-xs font-medium"
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* DELETE MODAL */}
      {isDeleteModalOpen && selectedExpenseForDelete && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl shadow-xl border border-gray-200 w-full max-w-md p-6 space-y-4">
            <h2 className="text-lg font-bold text-red-700">
              Delete Expense
            </h2>

            {deleteError && (
              <div className="p-2 bg-red-100 text-red-700 rounded border border-red-200 text-sm">
                {deleteError}
              </div>
            )}

            <p className="text-sm text-gray-700">
              You are deleting expense: <br />
              <span className="font-semibold text-black">
                {selectedExpenseForDelete.description}
              </span>{' '}
              for{' '}
              <span className="font-semibold text-black">
                {formatCurrency(selectedExpenseForDelete.amount)}
              </span>{' '}
              on {toInputDate(selectedExpenseForDelete.date)} (
              {selectedExpenseForDelete.outlet_name})
            </p>

            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">
                Admin Password
              </label>
              <input
                type="password"
                value={deletePassword}
                onChange={(e) => setDeletePassword(e.target.value)}
                className="w-full px-3 py-2 border rounded bg-white text-black text-sm"
                placeholder="Enter admin123"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">
                Reason / Remark
              </label>
              <textarea
                rows={3}
                value={deleteRemark}
                onChange={(e) => setDeleteRemark(e.target.value)}
                className="w-full px-3 py-2 border rounded bg-white text-black text-sm"
                placeholder="Why are you deleting this expense?"
              />
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={handleCloseDelete}
                className="px-4 py-2 text-sm bg-gray-200 text-gray-800 rounded-lg hover:bg-gray-300"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDeleteConfirm}
                disabled={isDeleting}
                className="px-4 py-2 text-sm bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-60"
              >
                {isDeleting ? 'Deleting…' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
