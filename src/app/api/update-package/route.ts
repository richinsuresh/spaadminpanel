import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { supabase } from '@/lib/supabase';

export async function POST(request: NextRequest) {
  try {
    // 1. Check SuperUser Authentication
    const cookieStore = cookies();
    const authCookie = cookieStore.get('superuser-auth');

    if (!authCookie || authCookie.value !== 'true') {
      return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
    }

    // 2. Get data from request
    const { id, data: packageData } = await request.json();

    if (!id || !packageData) {
      return NextResponse.json(
        { message: 'Missing required fields: id, data' },
        { status: 400 }
      );
    }

    // 3. Update the 'packages' table
    const { data, error } = await supabase
      .from('packages')
      .update(packageData) // packageData is the object with { name, mobile, status, etc. }
      .eq('id', id)
      .select();

    if (error) {
      console.error('Supabase update error:', error);
      return NextResponse.json(
        { message: 'Database error', details: error.message },
        { status: 500 }
      );
    }

    // 4. Return success
    return NextResponse.json(data, { status: 200 });

  } catch (err: any) {
    console.error('Update API error:', err);
    return NextResponse.json(
      { message: 'An unknown error occurred', details: err.message },
      { status: 500 }
    );
  }
}