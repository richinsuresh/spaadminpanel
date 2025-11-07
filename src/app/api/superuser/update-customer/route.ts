
import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { supabase } from '@/lib/supabase';

export async function POST(request: NextRequest) {
  try {
    // 1. Check Authentication
    const cookieStore = cookies();
    const authCookie = cookieStore.get('superuser-auth');

    if (!authCookie || authCookie.value !== 'true') {
      return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
    }

    // 2. Get data from request
    const { id, name, mobile } = await request.json();

    if (!id || !name || !mobile) {
      return NextResponse.json(
        { message: 'Missing required fields: id, name, mobile' },
        { status: 400 }
      );
    }

    // 3. Update the database
    // We update the 'packages' table.
    const { data, error } = await supabase
      .from('packages')
      .update({
        name: name,
        mobile: mobile,
      })
      .eq('id', id)
      .select();

    if (error) {
      console.error('Supabase update error:', error);
      return NextResponse.json(
        { message: 'Database error', details: error.message },
        { status: 500 }
      );
    }

    // Note: This only updates the 'packages' table.
    // Past entries in the 'customers' (visits) table will retain the old name.
    // This is generally expected behavior.

    return NextResponse.json(data, { status: 200 });
  } catch (err: any) {
    console.error('Update API error:', err);
    return NextResponse.json(
      { message: 'An unknown error occurred', details: err.message },
      { status: 500 }
    );
  }
}