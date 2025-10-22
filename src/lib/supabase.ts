// src/lib/supabase.ts
import { createClient } from '@supabase/supabase-js';

// Prioritize non-public keys (SUPABASE_URL) for server-side stability,
// fallback to public (NEXT_PUBLIC_SUPABASE_URL) for client-side usage.
const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
