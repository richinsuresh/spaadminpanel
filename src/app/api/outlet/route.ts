// src/app/api/outlet/route.ts
import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { OUTLETS } from '@/lib/outlet'; // <--- matches your file: src/lib/outlets.ts

export async function GET() {
  try {
    const cookieStore = cookies();
    const outletCookie = cookieStore.get('outlet_id')?.value;

    if (!outletCookie) {
      // No cookie server-side
      return NextResponse.json({}, { status: 204 });
    }

    // Try to find by id first, then by name (case-insensitive for name)
    const foundById = OUTLETS.find(o => o.id === outletCookie);
    if (foundById) {
      return NextResponse.json({ outletId: foundById.id, outletName: foundById.name }, { status: 200 });
    }

    const foundByName = OUTLETS.find(o => o.name.toLowerCase() === outletCookie.toLowerCase());
    if (foundByName) {
      return NextResponse.json({ outletId: foundByName.id, outletName: foundByName.name }, { status: 200 });
    }

    // If the cookie contains some other value, return it as fallback (treated as name)
    return NextResponse.json({ outletId: outletCookie, outletName: outletCookie }, { status: 200 });
  } catch (err) {
    console.error('/api/outlet error', err);
    return NextResponse.json({ error: 'server_error' }, { status: 500 });
  }
}
