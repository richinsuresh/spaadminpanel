'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';

export default function LastAction({ actionType }: { actionType: string }) {
  const [lastLog, setLastLog] = useState<{ username: string, created_at: string } | null>(null);

  useEffect(() => {
    const fetchLast = async () => {
      const { data } = await supabase
        .from('activity_logs')
        .select('username, created_at')
        .eq('action_type', actionType)
        .order('created_at', { ascending: false })
        .limit(1)
        .single();
      
      if (data) setLastLog(data);
    };

    fetchLast();

    // Listen for new logs in real-time
    const channel = supabase.channel(`logs-${actionType}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'activity_logs', filter: `action_type=eq.${actionType}` }, (payload) => {
         setLastLog(payload.new as any);
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [actionType]);

  if (!lastLog) return null;

  // Format time
  const time = new Date(lastLog.created_at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
  const initial = lastLog.username.charAt(0).toUpperCase();

  return (
    <div className="flex items-center gap-2 text-xs text-gray-400 mt-1 animate-in fade-in">
      <div className="w-5 h-5 rounded-full bg-gray-200 flex items-center justify-center font-bold text-gray-600 text-[10px]" title={lastLog.username}>
        {initial}
      </div>
      <span>{lastLog.username} exported at {time}</span>
    </div>
  );
}