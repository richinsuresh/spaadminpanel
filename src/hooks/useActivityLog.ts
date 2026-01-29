import { useCallback } from 'react';
import { supabase } from '@/lib/supabase';

export function useActivityLog() {
  // Added 'userOverride' parameter to handle login events where user isn't in storage yet
  const logActivity = useCallback(async (actionType: string, description: string | object, userOverride?: string) => {
    try {
      let username = userOverride || 'Unknown';
      
      if (!userOverride) {
          const storedUser = localStorage.getItem('app_user');
          if (storedUser) {
             const user = JSON.parse(storedUser);
             username = user.username;
          }
      }

      // --- NEW: Fetch Location & Device Data ---
      let locationMeta = {};
      try {
          const res = await fetch('https://ipapi.co/json/');
          if (res.ok) {
              const data = await res.json();
              locationMeta = {
                  ip: data.ip,
                  city: data.city,
                  region: data.region,
                  country: data.country_name,
                  org: data.org,
                  device: navigator.userAgent
              };
          }
      } catch (e) {
          console.warn('Could not fetch location for log:', e);
      }
      // ----------------------------------------

      // Prepare payload
      let finalDescription = '';
      if (typeof description === 'object') {
          finalDescription = JSON.stringify({ ...description, meta: locationMeta });
      } else {
          try {
              const parsed = JSON.parse(description);
              finalDescription = JSON.stringify({ ...parsed, meta: locationMeta });
          } catch {
              finalDescription = JSON.stringify({ message: description, meta: locationMeta });
          }
      }

      const { error } = await supabase.from('activity_logs').insert({
        username: username,
        action_type: actionType,
        description: finalDescription,
      });

      if (error) console.error('Log error:', error);

    } catch (err) {
      console.error('Failed to log activity', err);
    }
  }, []);

  return { logActivity };
}