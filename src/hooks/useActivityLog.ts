import { useCallback } from 'react';
import { supabase } from '@/lib/supabase';
// We assume you have a UserContext, if not, we can simplify this
// For now, let's make it robust but optional if context is missing

export function useActivityLog() {
  const logActivity = useCallback(async (actionType: string, description: string) => {
    try {
      // Ideally, get the current user from your Auth context here
      // For now, we'll try to get it from localStorage or session
      let username = 'Unknown';
      const storedUser = localStorage.getItem('app_user');
      if (storedUser) {
         const user = JSON.parse(storedUser);
         username = user.username;
         // Skip logging for developer
         if (user.role === 'developer') return; 
      }

      const { error } = await supabase.from('activity_logs').insert({
        username: username,
        action_type: actionType,
        description: description,
        // created_at is auto-set by DB
      });

      if (error) console.error('Log error:', error);
    } catch (err) {
      console.error('Failed to log activity', err);
    }
  }, []);

  return { logActivity };
}