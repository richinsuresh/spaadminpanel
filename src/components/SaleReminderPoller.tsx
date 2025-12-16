// src/components/SaleReminderPoller.tsx
'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { useRouter } from 'next/navigation';
import { AlertTriangle, Clock } from 'lucide-react';

// ====================================================================
// === TYPES AND UTILITY FUNCTIONS (Must be defined at the top) ===
// ====================================================================

// Simple type for sales that need action
type DueSale = {
  id: string;
  customer_name: string;
  check_out_time: string;
};

// Utility for time formatting
const fmtTime = (iso: string | null) => {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });
};

// Simple helper to check if data is an array
function ArrayOf(data: any): data is any[] {
    return Array.isArray(data);
}

// ====================================================================
// === CONFIGURATION ===
// 🛑 IMPORTANT: This must match the identifier selected in /dev-settings
const SETTINGS_KEY_TARGET_ADMIN = 'target_admin_uid'; 
const POLLING_INTERVAL_MS = 60000; // Check every 60 seconds (1 minute)
const AUDIO_ALERT_PATH = '/audio/alert.mp3'; // <--- Set the path to your audio file

// Simple helper to fetch the target user identifier from app_settings
async function fetchTargetAdminIdentifier() {
    try {
        const { data, error } = await supabase
            .from('app_settings')
            .select('value')
            .eq('key', SETTINGS_KEY_TARGET_ADMIN)
            .single();
        
        // PGRST116 means "No rows found," which is fine, just return null.
        if (error && error.code !== 'PGRST116') throw error;
        
        return data?.value || null;
    } catch (e) {
        console.error("Error fetching target setting:", e);
        return null;
    }
}

// ====================================================================
// === MAIN COMPONENT ===
// ====================================================================

export default function SaleReminderPoller() {
  // FIX: DueSale is now defined above and can be used here
  const [dueSales, setDueSales] = useState<DueSale[]>([]); 
  const [isTargetUser, setIsTargetUser] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const router = useRouter(); 
  
  // State to hold the current user's unique identifier (e.g., username from app_users)
  const [currentUserIdentifier, setCurrentUserIdentifier] = useState<string | null>(null);
  const [targetUserIdentifier, setTargetUserIdentifier] = useState<string | null>(null);


  // 1. Setup Audio & Get Current User Identifier
  useEffect(() => {
    if (typeof window !== 'undefined' && AUDIO_ALERT_PATH) {
      audioRef.current = new Audio(AUDIO_ALERT_PATH);
    }
    
    // Get the current logged-in user's identifier (assuming you use the 'username' or similar)
    // NOTE: This must use the same unique identifier (e.g., username) as stored in app_users
    supabase.auth.getUser().then(({ data: { user } }) => {
        // Assume user metadata contains the identifier (e.g., username, or just the email/UID)
        // Adjust this if your username is stored elsewhere in the auth object!
        const identifier = user?.user_metadata?.username || user?.email || user?.id; 
        if (identifier) {
            setCurrentUserIdentifier(identifier);
        }
    });
  }, []);

  // 2. Fetch Target User Setting
  useEffect(() => {
      fetchTargetAdminIdentifier().then(targetId => {
          setTargetUserIdentifier(targetId);
      });
  }, []);
  
  // 3. Check Authorization & Set Flag
  useEffect(() => {
    // If both are loaded, check if they match
    if (currentUserIdentifier && targetUserIdentifier !== null) {
        setIsTargetUser(currentUserIdentifier === targetUserIdentifier);
    }
  }, [currentUserIdentifier, targetUserIdentifier]);


  // 4. Data Fetching and Polling Logic
  const fetchDueSales = useCallback(async () => {
    if (!isTargetUser) return;
    
    const now = new Date().toISOString();

    try {
      // Query for sales where check_out_time is due (<= now)
      // 🛑 ADJUST TABLE NAME AND STATUS COLUMN as necessary for your DB schema
      const { data, error } = await supabase
        .from('customers') // Assuming 'customers' table holds sales data with check_out_time
        .select('id, name, check_out_time')
        .lte('check_out_time', now)
        // Add status filter if necessary (e.g., .eq('status', 'checked_in'))
        .limit(10); 

      if (error) throw error;

      const salesToAlert = ArrayOf(data) ? data.map(d => ({
        id: d.id,
        customer_name: d.name || 'N/A',
        check_out_time: d.check_out_time || '',
      })) : [];
      
      // Alert only if new sales are found
      if (salesToAlert.length > 0) {
        // Prevent double alert if the set of due sales is identical
        const newSaleIds = new Set(salesToAlert.map(s => s.id));
        const oldSaleIds = new Set(dueSales.map(s => s.id));
        const hasNewAlerts = salesToAlert.some(s => !oldSaleIds.has(s.id));

        if (hasNewAlerts) {
            if (audioRef.current) {
                // Rewind and play sound
                audioRef.current.currentTime = 0;
                audioRef.current.play().catch(e => console.log("Audio play failed:", e));
            }
        }
        setDueSales(salesToAlert);

      } else if (dueSales.length > 0) {
        setDueSales([]); // Clear alert if no due sales are found
      }

    } catch (e) {
      console.error("Error fetching due sales:", e);
    }
  }, [isTargetUser, dueSales, router]);


  // 5. Start Polling Interval
  useEffect(() => {
    if (isTargetUser) {
        fetchDueSales(); 
        const intervalId = setInterval(fetchDueSales, POLLING_INTERVAL_MS);
        return () => clearInterval(intervalId);
    }
  }, [isTargetUser, fetchDueSales]);
  
  // 6. Component Gate
  if (!isTargetUser || dueSales.length === 0) {
    return null;
  }

  // 7. Modal UI
  return (
    <div className="fixed inset-0 z-50 overflow-y-auto" aria-labelledby="modal-title" role="dialog" aria-modal="true">
      <div className="flex min-h-screen items-center justify-center p-4 text-center">
        {/* Background Overlay */}
        <div className="fixed inset-0 bg-gray-500 bg-opacity-75 transition-opacity" aria-hidden="true" />
        
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
                    The following sessions are past their scheduled checkout time. Please check their status:
                  </p>
                  <ul className="list-disc list-inside text-sm text-red-700">
                    {dueSales.map((sale) => (
                      <li key={sale.id} className="font-semibold flex justify-between">
                        <Clock size={16} className="mr-2" />
                        {sale.customer_name} (Due: {fmtTime(sale.check_out_time)})
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          </div>
          <div className="bg-gray-50 px-4 py-3 sm:flex sm:flex-row-reverse sm:px-6">
            
            {/* Review Button */}
            <button
              type="button"
              className="inline-flex w-full justify-center rounded-md border border-transparent bg-indigo-600 px-4 py-2 text-base font-medium text-white shadow-sm hover:bg-indigo-700 sm:ml-3 sm:w-auto sm:text-sm"
              onClick={() => {
                // Navigate to a dedicated review page
                router.push('/dashboard/sales/review-due'); 
                setDueSales([]); // Clear alert after navigation
              }}
            >
              Review Due Sales
            </button>
            
            {/* Dismiss Button */}
            <button
              type="button"
              className="mt-3 inline-flex w-full justify-center rounded-md border border-gray-300 bg-white px-4 py-2 text-base font-medium text-gray-700 shadow-sm hover:bg-gray-50 sm:mt-0 sm:w-auto sm:text-sm"
              onClick={() => setDueSales([])}
            >
              Dismiss Alert
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}