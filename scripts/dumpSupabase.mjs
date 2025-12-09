import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

dotenv.config({ path: '.env' });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('Missing SUPABASE env vars. Set NEXT_PUBLIC_SUPABASE_URL and a key.');
  console.error('Current values:', {
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    HAS_ANON_KEY: !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    HAS_SERVICE_ROLE: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
  });
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// 👇 List only the tables we actually care about
const TABLES = [
  'customers',
  'packages',
  'sales',
  'employees',
  'attendance',
  'activity_log', // change name if your log table is different
];

async function main() {
  const result = {};

  for (const table of TABLES) {
    console.log(`\n=== ${table} ===`);

    const { data, error } = await supabase
      .from(table)
      .select('*')
      .limit(50);

    if (error) {
      console.error(`Error fetching rows for ${table}:`, error.message);
      continue;
    }

    const columns = data && data.length > 0 ? Object.keys(data[0]) : [];

    result[table] = {
      columns,
      sampleRows: data || [],
    };
  }

  console.log('\n\n========== DUMP ==========');
  console.log(JSON.stringify(result, null, 2));
}

main().catch((err) => {
  console.error('Unexpected error:', err);
  process.exit(1);
});

