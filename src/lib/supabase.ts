import { createClient } from '@supabase/supabase-js';

// 1. Define the two possible connections
const CLOUD_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const CLOUD_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

const LOCAL_URL = process.env.NEXT_PUBLIC_BACKUP_URL;
const LOCAL_KEY = process.env.NEXT_PUBLIC_BACKUP_ANON_KEY;

// 2. Determine which one to use
const getSupabaseConfig = () => {
  if (typeof window !== 'undefined') {
    const isBackupMode = localStorage.getItem('use_backup_db') === 'true';
    
    // Only switch if the user requested it AND we have the local keys configured
    if (isBackupMode && LOCAL_URL && LOCAL_KEY) {
      console.warn('🚨 USING LOCAL OFFLINE DATABASE 🚨');
      return { url: LOCAL_URL, key: LOCAL_KEY };
    }
  }
  return { url: CLOUD_URL, key: CLOUD_KEY };
};

const config = getSupabaseConfig();

// 3. Create the client
export const supabase = createClient(config.url, config.key, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
  },
});

// 4. Helper function to toggle modes (Call this from a button in your UI)
export const toggleDatabaseMode = () => {
  if (typeof window === 'undefined') return;
  
  const isBackup = localStorage.getItem('use_backup_db') === 'true';
  if (isBackup) {
    localStorage.removeItem('use_backup_db');
    alert('Switching back to CLOUD (Online) Database.');
  } else {
    localStorage.setItem('use_backup_db', 'true');
    alert('Switching to LOCAL (Offline) Database.');
  }
  window.location.reload();
};

export const isUsingBackup = () => {
  if (typeof window === 'undefined') return false;
  return localStorage.getItem('use_backup_db') === 'true';
};