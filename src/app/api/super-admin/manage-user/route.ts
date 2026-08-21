// src/app/api/super-admin/manage-user/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabaseServer';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { action, payload, adminPassword } = body;

    // 1. Security Check: Verify the password matches the one used on the frontend
    if (adminPassword !== 'admin123') {
      return NextResponse.json({ error: 'Unauthorized: Invalid Admin Password' }, { status: 401 });
    }

    let result;
    let error;

    // 2. Perform the requested action using supabaseServer (service role - bypasses RLS
    //    and always sees the current schema, avoiding stale PostgREST cache issues that
    //    can hit the anon-key client)
    switch (action) {
      case 'create': {
        if (!payload?.username || !payload?.password) {
          return NextResponse.json({ error: 'Username and password are required' }, { status: 400 });
        }
        ({ data: result, error } = await supabaseServer
          .from('app_users')
          .insert({
            username: payload.username,
            password: payload.password,
            role: payload.role || 'staff',
            is_active: payload.is_active ?? true,
          })
          .select()
          .single());
        break;
      }

      case 'update': {
        if (!payload?.id) {
          return NextResponse.json({ error: 'User id is required' }, { status: 400 });
        }
        const updatePayload: Record<string, any> = {
          username: payload.username,
          role: payload.role,
          is_active: payload.is_active ?? true,
        };
        // Only touch the password if one was actually supplied
        if (payload.password) updatePayload.password = payload.password;

        ({ data: result, error } = await supabaseServer
          .from('app_users')
          .update(updatePayload)
          .eq('id', payload.id)
          .select()
          .single());
        break;
      }

      case 'delete': {
        if (!payload?.id) {
          return NextResponse.json({ error: 'User id is required' }, { status: 400 });
        }
        ({ data: result, error } = await supabaseServer
          .from('app_users')
          .delete()
          .eq('id', payload.id));
        break;
      }

      default:
        return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
    }

    if (error) {
      throw error;
    }

    return NextResponse.json({ success: true, data: result });

  } catch (err: any) {
    console.error('Super Admin User API Error:', err);
    // Return the specific DB error message so we can see it in the UI
    return NextResponse.json({ error: err.message || 'Server error' }, { status: 500 });
  }
}
