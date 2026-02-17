// src/components/SaleReminderPoller.tsx
'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { useRouter } from 'next/navigation';
import { AlertTriangle, Clock } from 'lucide-react';

// ====================================================================
// === TYPES AND UTILITY FUNCTIONS ===
// ====================================================================

type DueSale = {
  id: string;
  name: string; 
  check_in_time: string | null;
  session_hours: number | null; 
  check_out_time: string | null;
  group_customers?: any[] | null; // Added to identify group sales
};

const fmtTime = (dateString: string | null) => {
  if (!dateString) return '—';
  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) return 'Invalid Date';
  return date.toLocaleTimeString('en-IN', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });
};

const getExpectedCheckoutTime = (
  checkIn: string | null,
  hours: number | null,
): Date | null => {
  if (!checkIn || !hours || hours <= 0) return null;
  const checkInDate = new Date(checkIn);
  const durationInMs = hours * 60 * 60 * 1000;
  return new Date(checkInDate.getTime() + durationInMs);
};

function ArrayOf(data: any): data is any[] {
    return Array.isArray(data);
}

const getTodayDate = () => new Date().toISOString().split('T')[0];

// ====================================================================
// === CONFIGURATION ===
// ====================================================================
const POLLING_INTERVAL_MS = 10000; 
const SNOOZE_DURATION_MS = 300000; // 5 minutes
const CLOSE_SNOOZE_DURATION_MS = 5000; // 5 seconds
const NAVIGATION_DELAY_MS = 50; 
const BUFFER_MINUTES = 10; // 10 Minute Buffer

// ====================================================================
// === MAIN COMPONENT ===
// ====================================================================

export default function SaleReminderPoller() {
  const [dueSales, setDueSales] = useState<DueSale[]>([]); 
  const router = useRouter(); 
  
  const snoozedClients = useRef<Set<string>>(new Set());
  const pollingTimerRef = useRef<NodeJS.Timeout | null>(null);

  // 1. Data Fetching and Polling Logic
  const fetchDueSales = useCallback(async () => {
    const now = new Date();
    const today = getTodayDate();
    const bufferMs = BUFFER_MINUTES * 60 * 1000; 
    
    try {
      const { data, error } = await supabase
        .from('customers') 
        // FIX: Added group_customers to selection
        .select('id, name, check_in_time, session_hours, check_out_time, group_customers')
        .eq('date', today);
        
      if (error) throw error;

      const salesToAlert: DueSale[] = [];
      
      if (ArrayOf(data)) {
          for (const sale of data) {
              const s = sale as DueSale;

              // FIX: Skip alert if it is a Group Sale
              if (s.group_customers && Array.isArray(s.group_customers) && s.group_customers.length > 0) {
                  continue;
              }

              if (
                  s.check_in_time && 
                  s.session_hours && 
                  !s.check_out_time && 
                  !snoozedClients.current.has(s.id)
              ) {
                  const expected = getExpectedCheckoutTime(s.check_in_time, s.session_hours);
                  
                  if (expected) {
                      // Add buffer: Alert only if Current Time >= Expected Time + 10 mins
                      const alertTriggerTime = new Date(expected.getTime() + bufferMs);
                      
                      if (now >= alertTriggerTime) {
                          salesToAlert.push(s);
                      }
                  }
              }
          }
      }

      // Update state only if changed (prevents loop)
      setDueSales(prev => {
        const isSame = JSON.stringify(prev) === JSON.stringify(salesToAlert);
        return isSame ? prev : salesToAlert;
      });

    } catch (e: any) {
      // Enhanced logging to debug Offline Mode issues
      console.error("Error fetching due sales (Raw):", e);
      if (e?.message) console.error("Error Message:", e.message);
    }
  }, []); 

  
  // 2. Start Polling Interval and Cleanup
  useEffect(() => {
    if (pollingTimerRef.current) clearInterval(pollingTimerRef.current);
    
    // Check immediately on mount
    fetchDueSales(); 
    // Then poll at the configured interval
    pollingTimerRef.current = setInterval(fetchDueSales, POLLING_INTERVAL_MS);
    
    return () => {
        if (pollingTimerRef.current) clearInterval(pollingTimerRef.current);
    };
  }, [fetchDueSales]);

  
  // 3. Handle Snooze/Dismiss
  const handleModalClose = useCallback(() => {
    if (dueSales.length > 0) {
        dueSales.forEach(sale => {
            snoozedClients.current.add(sale.id);
            setTimeout(
                () => snoozedClients.current.delete(sale.id),
                SNOOZE_DURATION_MS
            );
        });
    }
    setDueSales([]);
  }, [dueSales]);
  
  const handleImmediateClose = useCallback(() => {
    if (dueSales.length > 0) {
        dueSales.forEach(sale => {
            snoozedClients.current.add(sale.id);
            setTimeout(
                () => snoozedClients.current.delete(sale.id),
                CLOSE_SNOOZE_DURATION_MS
            );
        });
    }
    setDueSales([]);
  }, [dueSales]);

  const handleReviewSales = useCallback(() => {
    const saleId = dueSales[0]?.id; 
    if (!saleId) {
        setDueSales([]);
        return;
    }
    
    if (pollingTimerRef.current) clearInterval(pollingTimerRef.current);
    setDueSales([]); 
    
    setTimeout(() => {
        router.push(`/dashboard/sales/${saleId}`); 
    }, NAVIGATION_DELAY_MS);
    
  }, [router, dueSales]);


  // 4. Component Gate
  if (dueSales.length === 0) {
    return null;
  }

  const saleToDisplay = dueSales[0];
  const expectedTime = saleToDisplay.check_in_time && saleToDisplay.session_hours 
      ? fmtTime(getExpectedCheckoutTime(saleToDisplay.check_in_time, saleToDisplay.session_hours)?.toISOString() || null)
      : 'N/A';
  
  // 5. Modal UI
  return (
    <div 
      className="fixed inset-0 z-[1000] bg-black/50 flex items-center justify-center p-4" 
      role="alert" 
      aria-live="assertive"
    >
      <div className="flex min-h-screen items-center justify-center p-4 text-center">
        
        <div className="inline-block align-bottom bg-white rounded-lg text-left overflow-hidden shadow-xl transform transition-all sm:align-middle sm:max-w-lg sm:w-full">
          <div className="bg-white px-4 pt-5 pb-4 sm:p-6 sm:pb-4">
            <div className="sm:flex sm:items-start">
              <div className="mx-auto flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-full bg-red-100 sm:mx-0 sm:h-10 sm:w-10">
                <AlertTriangle className="h-6 w-6 text-red-600" aria-hidden="true" />
              </div>
              <div className="mt-3 text-center sm:mt-0 sm:ml-4 sm:text-left">
                <h3 className="text-lg font-medium leading-6 text-gray-900" id="modal-title">
                  ⚠️ Action Required: Sales Due!
                </h3>
                <div className="mt-2 space-y-3">
                  <p className="text-sm text-gray-500">
                    The following sessions {dueSales.length > 1 ? 'are' : 'is'} past the scheduled end time (Est: {expectedTime}).
                  </p>
                  <ul className="list-disc list-inside text-sm text-red-700">
                    {dueSales.map((sale) => (
                      <li key={sale.id} className="font-semibold flex justify-between">
                        <Clock size={16} className="mr-2" />
                        {sale.name}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          </div>
          <div className="bg-gray-50 px-4 py-3 sm:flex sm:flex-row-reverse sm:px-6">
            
            <button
              type="button"
              className="inline-flex w-full justify-center rounded-md border border-transparent bg-indigo-600 px-4 py-2 text-base font-medium text-white shadow-sm hover:bg-indigo-700 sm:ml-3 sm:w-auto sm:text-sm"
              onClick={handleReviewSales}
            >
              Review Sale
            </button>
            
            <button
              type="button"
              className="mt-3 inline-flex w-full justify-center rounded-md border border-gray-300 bg-white px-4 py-2 text-base font-medium text-gray-700 shadow-sm hover:bg-gray-50 sm:mt-0 sm:w-auto sm:text-sm"
              onClick={handleModalClose}
            >
              Snooze (5 min)
            </button>
            
            <button
              type="button"
              className="mt-3 inline-flex w-full justify-center rounded-md border border-gray-300 bg-white px-4 py-2 text-base font-medium text-gray-700 shadow-sm hover:bg-gray-50 sm:mt-0 sm:w-auto sm:text-sm sm:mr-3"
              onClick={handleImmediateClose}
            >
              Close
            </button>

          </div>
        </div>
      </div>
    </div>
  );
}