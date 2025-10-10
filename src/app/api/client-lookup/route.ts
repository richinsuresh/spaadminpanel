// src/app/api/client-lookup/route.ts
import { readFile } from 'fs/promises';
import * as XLSX from 'xlsx';
import path from 'path';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const mobileParam = searchParams.get('mobile');
    
    if (!mobileParam) {
      return new Response(JSON.stringify({ error: 'Mobile required' }), { status: 400 });
    }

    const mobile = mobileParam.replace(/\D/g, '');
    const EXCEL_PATH = path.join(process.cwd(), 'data.xlsx');
    
    let data: any[] = [];
    try {
      const buffer = await readFile(EXCEL_PATH);
      const workbook = XLSX.read(buffer);
      const sheetName = workbook.SheetNames[0];
      data = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName]) as any[];
    } catch (e) {
      return new Response(JSON.stringify(null), { status: 200 });
    }

    // Find all records for this mobile
    const clientRecords = data.filter((row: any) => 
      row.mobile?.toString().replace(/\D/g, '') === mobile
    );

    if (clientRecords.length === 0) {
      return new Response(JSON.stringify(null), { status: 200 });
    }

    // Get latest record for basic info
    const latestRecord = clientRecords.reduce((latest: any, current: any) => 
      new Date(current.date) > new Date(latest.date) ? current : latest
    );

    // Calculate total used hours from ALL sessions (not just package sessions)
    const totalUsedHours = clientRecords.reduce((sum: number, session: any) => {
      // Only count sessions that happened AFTER package purchase
      const packageSessions = clientRecords.filter((s: any) => s.tookPackage);
      if (packageSessions.length === 0) return sum;
      
      const firstPackageDate = new Date(
        packageSessions.reduce((earliest: any, s: any) => 
          new Date(s.date) < new Date(earliest.date) ? s : earliest
        ).date
      );
      
      return new Date(session.date) >= firstPackageDate 
        ? sum + (session.sessionHours || 0) 
        : sum;
    }, 0);

    // Check if client has active package
    const packageSessions = clientRecords.filter((s: any) => s.tookPackage);
    if (packageSessions.length === 0) {
      return new Response(JSON.stringify(null), { status: 200 });
    }

    const firstPackage = packageSessions.reduce((earliest: any, s: any) => 
      new Date(s.date) < new Date(earliest.date) ? s : earliest
    );

    const startDate = new Date(firstPackage.date);
    const expiry = new Date(startDate);
    expiry.setMonth(expiry.getMonth() + 2);
    
    const now = new Date();
    const hoursExhausted = totalUsedHours >= (firstPackage.totalPackageHours || 0);
    const timeExpired = now > expiry;
    const status = (hoursExhausted || timeExpired) ? 'expired' : 'active';

    return new Response(JSON.stringify({
      status,
      name: latestRecord.name,
      mobile: latestRecord.mobile,
      packageAmount: firstPackage.packageAmount,
      totalPackageHours: firstPackage.totalPackageHours,
      usedPackageHours: totalUsedHours,
      remainingHours: Math.max(0, (firstPackage.totalPackageHours || 0) - totalUsedHours),
      expiryDate: expiry.toISOString().split('T')[0]
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    console.error('Lookup error:', error);
    return new Response(JSON.stringify(null), { status: 200 });
  }
}