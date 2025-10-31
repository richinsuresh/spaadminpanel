// src/lib/supabaseServer.ts
import { createClient } from '@supabase/supabase-js';

// This file creates a SUPABASE SERVICE_ROLE_KEY client.
// This client bypasses all Row Level Security (RLS) and should
// ONLY be used in secure, server-side API routes (like webhooks).
// DO NOT expose this key to the client-side.

const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY || '';

if (!supabaseUrl || !supabaseServiceKey) {
  console.warn('Supabase URL or Service Key missing for server client. Check .env.local.');
}

export const supabaseServer = createClient(supabaseUrl, supabaseServiceKey);