// src/lib/supabaseServer.ts
import { createClient as createSupabaseClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY || '';

if (!supabaseUrl || !supabaseServiceKey) {
  console.warn('Supabase URL or Service Key missing for server client. Check .env.local.');
}

// Keep your existing export
export const supabaseServer = createSupabaseClient(supabaseUrl, supabaseServiceKey);

// Add this export to fix the build error
export const createClient = async () => {
  return createSupabaseClient(supabaseUrl, supabaseServiceKey);
};
