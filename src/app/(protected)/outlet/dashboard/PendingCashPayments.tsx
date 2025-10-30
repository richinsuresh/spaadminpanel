// src/app/(protected)/outlet/dashboard/PendingCashPayments.tsx
'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import type { RealtimePostgresChangesPayload } from '@supabase/supabase-js';

type Notification = {
  id: string;
  created_at: string;
  customer_name: string;
  mobile: string;
  treatment: string;
  amount: number; // in paise
};

export default function PendingCashPayments({ outletId }: { outletId: string }) {
  const [pending, setPending] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);

  // 1. Fetch initial pending payments
  useEffect(() => {
    const fetchPending = async () => {
      if (!outletId) return;
      setLoading(true);
      const { data, error } = await supabase
        .from('cash_notifications')
        .select('*')
        .eq('outlet_id', outletId)
        .eq('status', 'pending')
        .order('created_at', { ascending: true });

      if (error) {
        console.error('Error fetching pending payments:', error);
      } else {
        setPending(data || []);
      }
      setLoading(false);
    };
    fetchPending();
  }, [outletId]);

  // 2. Listen for REAL-TIME new payments
  useEffect(() => {
    if (!outletId) return;

    const channel = supabase.channel(`cash-notifications-${outletId}`)
      .on<Notification>(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'cash_notifications',
          filter: `outlet_id=eq.${outletId}`
        },
        (payload: RealtimePostgresChangesPayload<Notification>) => {
          // Add new notification to the top of the list
          setPending(currentPending => [payload.new, ...currentPending]);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [outletId]);
  
  const handleAccept = async (notificationId: string) => {
    // Optimistically remove from UI
    setPending(prev => prev.filter(n => n.id !== notificationId));

    // Update DB in the background
    const { error } = await supabase
      .from('cash_notifications')
      .update({ status: 'confirmed' })
      .eq('id', notificationId);
      
    if (error) {
      console.error('Error confirming payment:', error);
      // TODO: Add notification back to UI if update failed
    }
  };

  const formatCurrency = (amount: number) =>
    new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(amount / 100);

  return (
    <div className="bg-white rounded-lg shadow-sm border border-transparent">
      <div className="p-6 border-b border-gray-100">
        <h2 className="text-lg font-semibold text-gray-800">
          🔔 Pending Cash Payments
        </h2>
      </div>

      <div className="divide-y divide-gray-100">
        {loading && <div className="p-6 text-center text-gray-500">Loading...</div>}
        {!loading && pending.length === 0 && (
          <div className="p-6 text-center text-gray-500">No pending payments.</div>
        )}
        {pending.map((n) => (
          <div key={n.id} className="p-4 flex justify-between items-center">
            <div>
              <div className="font-medium text-gray-900">{n.customer_name}</div>
              <div className="text-sm text-gray-500">{n.treatment}</div>
              <div className="text-sm text-gray-500">{n.mobile}</div>
            </div>
            <div className="text-right">
              <div className="font-bold text-lg text-green-600">{formatCurrency(n.amount)}</div>
              <button
                onClick={() => handleAccept(n.id)}
                className="mt-1 px-3 py-1 bg-green-600 text-white text-sm rounded-lg hover:bg-green-700"
              >
                Accept
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}