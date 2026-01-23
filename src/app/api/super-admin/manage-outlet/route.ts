// src/app/api/super-admin/manage-outlet/route.ts
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

    // 2. Perform the requested action using supabaseServer (Bypasses RLS)
    switch (action) {
      case 'create':
        // Insert new outlet
        ({ data: result, error } = await supabaseServer
          .from('outlets')
          .insert(payload)
          .select()
          .single());
        break;

      case 'update':
        // Update details (name, qr, etc.)
        ({ data: result, error } = await supabaseServer
          .from('outlets')
          .update(payload)
          .eq('id', payload.id)
          .select()
          .single());
        break;

      case 'toggle_status':
        // Mark as Sold / Active
        ({ data: result, error } = await supabaseServer
          .from('outlets')
          .update({ is_active: payload.is_active })
          .eq('id', payload.id)
          .select()
          .single());
        break;

      case 'delete':
        // Delete outlet
        ({ data: result, error } = await supabaseServer
          .from('outlets')
          .delete()
          .eq('id', payload.id));
        break;

      default:
        return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
    }

    if (error) {
      throw error;
    }

    return NextResponse.json({ success: true, data: result });

  } catch (err: any) {
    console.error('Super Admin API Error:', err);
    // Return the specific DB error message so we can see it in the UI
    return NextResponse.json({ error: err.message || 'Server error' }, { status: 500 });
  }
}