// src/components/SaleReminderPoller.tsx - UNIVERSAL REMINDER SYSTEM (FINAL LOOP & CLOSE FIX)
'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { useRouter } from 'next/navigation';
import { AlertTriangle, Clock, Loader2 } from 'lucide-react';

// ====================================================================
// === TYPES AND UTILITY FUNCTIONS ===
// ====================================================================

type DueSale = {
  id: string;
  name: string; 
  check_in_time: string | null;
  session_hours: number | null; 
  check_out_time: string | null;
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
const POLLING_INTERVAL_MS = 30000; 
const SNOOZE_DURATION_MS = 300000; // 5 minutes
const CLOSE_SNOOZE_DURATION_MS = 5000; // 5 seconds (to break the loop)
const NAVIGATION_DELAY_MS = 50; // Critical delay for router.push()
const AUDIO_ALERT_PATH = '/audio/alert.mp3'; 

// ====================================================================
// === MAIN COMPONENT ===
// ====================================================================

export default function SaleReminderPoller() {
  const [dueSales, setDueSales] = useState<DueSale[]>([]); 
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const router = useRouter(); 
  
  const snoozedClients = useRef<Set<string>>(new Set());
  const pollingTimerRef = useRef<NodeJS.Timeout | null>(null);

  // 1. Setup Audio
  useEffect(() => {
    if (typeof window !== 'undefined' && AUDIO_ALERT_PATH) {
      audioRef.current = new Audio(AUDIO_ALERT_PATH);
    }
  }, []);


  // 2. Data Fetching and Polling Logic
  const fetchDueSales = useCallback(async () => {
    const now = new Date();
    const today = getTodayDate();
    
    try {
      const { data, error } = await supabase
        .from('customers') 
        .select('id, name, check_in_time, session_hours, check_out_time')
        .eq('date', today);
        
      if (error) throw error;

      const salesToAlert: DueSale[] = [];
      
      if (ArrayOf(data)) {
          for (const sale of data) {
              const s = sale as DueSale;

              if (
                  s.check_in_time && 
                  s.session_hours && 
                  !s.check_out_time && 
                  !snoozedClients.current.has(s.id)
              ) {
                  const expected = getExpectedCheckoutTime(s.check_in_time, s.session_hours);
                  
                  if (expected && now >= expected) {
                      salesToAlert.push(s);
                  }
              }
          }
      }

      if (salesToAlert.length > 0) {
        const oldSaleIds = new Set(dueSales.map(s => s.id));
        const hasNewAlerts = salesToAlert.some(s => !oldSaleIds.has(s.id));

        if (hasNewAlerts) {
            if (audioRef.current) {
                audioRef.current.currentTime = 0;
                audioRef.current.play().catch(e => console.log("Audio play failed:", e));
            }
        }
        setDueSales(salesToAlert);

      } else if (dueSales.length > 0) {
        setDueSales([]); 
      }

    } catch (e) {
      console.error("Error fetching due sales (Check RLS on 'customers' table!):", e);
    }
  }, [dueSales]); 

  
  // 3. Start Polling Interval and Cleanup
  useEffect(() => {
    if (pollingTimerRef.current) clearInterval(pollingTimerRef.current);
    
    fetchDueSales(); 
    pollingTimerRef.current = setInterval(fetchDueSales, POLLING_INTERVAL_MS);
    
    return () => {
        if (pollingTimerRef.current) clearInterval(pollingTimerRef.current);
    };
  }, [fetchDueSales]);

  
  // 4. Handle Snooze/Dismiss
  const handleModalClose = useCallback(() => {
    // Standard 5-minute Snooze
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
  
  // Handler for "Close" button - uses a 5-second snooze to break the loop
  const handleImmediateClose = useCallback(() => {
    if (dueSales.length > 0) {
        // Apply a very short snooze to the clients to stop the loop
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

  // 🛑 FIX: Handler for "Review Sales" button (now navigates to a specific sale page)
  const handleReviewSales = useCallback(() => {
    const saleId = dueSales[0]?.id; // Get the ID of the first due sale
    if (!saleId) {
        setDueSales([]);
        return;
    }
    
    // 1. CLEAR POLLING to prevent race condition/loop
    if (pollingTimerRef.current) clearInterval(pollingTimerRef.current);
    
    // 2. Dismiss the modal state IMMEDIATELY
    setDueSales([]); 
    
    // 3. Navigate after a brief delay (CRITICAL FIX for the looping issue)
    setTimeout(() => {
        // Navigate to the new dynamic sale dashboard page
        router.push(`/dashboard/sales/${saleId}`); 
    }, NAVIGATION_DELAY_MS);
    
    // Polling will restart when the sales page loads and the poller component remounts.
  }, [router, dueSales]);


  // 5. Component Gate
  if (dueSales.length === 0) {
    return null;
  }

  // Use the FIRST item for the title display
  const saleToDisplay = dueSales[0];
  const expectedTime = saleToDisplay.check_in_time && saleToDisplay.session_hours 
      ? fmtTime(getExpectedCheckoutTime(saleToDisplay.check_in_time, saleToDisplay.session_hours)?.toISOString() || null)
      : 'N/A';
  
  // 6. Modal UI
  return (
    <div 
      className="fixed inset-0 z-[1000] bg-black/50 flex items-center justify-center p-4" 
      role="alert" 
      aria-live="assertive"
    >
      <div className="flex min-h-screen items-center justify-center p-4 text-center">
        
        {/* Modal Panel */}
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
            
            {/* Review Button (Navigates to the specific Sale Dashboard) */}
            <button
              type="button"
              className="inline-flex w-full justify-center rounded-md border border-transparent bg-indigo-600 px-4 py-2 text-base font-medium text-white shadow-sm hover:bg-indigo-700 sm:ml-3 sm:w-auto sm:text-sm"
              onClick={handleReviewSales}
            >
              Review Sale
            </button>
            
            {/* Snooze Button */}
            <button
              type="button"
              className="mt-3 inline-flex w-full justify-center rounded-md border border-gray-300 bg-white px-4 py-2 text-base font-medium text-gray-700 shadow-sm hover:bg-gray-50 sm:mt-0 sm:w-auto sm:text-sm"
              onClick={handleModalClose}
            >
              Snooze (5 min)
            </button>
            
            {/* Close Button */}
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