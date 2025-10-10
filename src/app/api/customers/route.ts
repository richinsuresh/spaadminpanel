// src/app/api/customers/route.ts
import { readFile } from 'fs/promises';
import * as XLSX from 'xlsx';
import path from 'path';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const mobile = searchParams.get('mobile');
    
    const EXCEL_PATH = path.join(process.cwd(), 'data.xlsx');
    const buffer = await readFile(EXCEL_PATH);
    const workbook = XLSX.read(buffer);
    const sheetName = workbook.SheetNames[0];
    const data = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName]) as any[];

    if (mobile) {
      // Find latest record for this mobile
      const clientRecords = data
        .filter((row: any) => row.mobile?.toString().includes(mobile.replace(/\D/g, '')))
        .sort((a: any, b: any) => new Date(b.date).getTime() - new Date(a.date).getTime());
      
      if (clientRecords.length > 0) {
        const latest = clientRecords[0];
        // Calculate total used hours from all package sessions
        const packageSessions = data.filter(
          (row: any) => 
            row.mobile?.toString().includes(mobile.replace(/\D/g, '')) && 
            row.tookPackage
        );
        
        const totalUsed = packageSessions.reduce(
          (sum: number, session: any) => sum + (session.sessionHours || 0), 
          0
        );

        return new Response(JSON.stringify({
          name: latest.name,
          mobile: latest.mobile,
          tookPackage: latest.tookPackage,
          totalPackageHours: latest.totalPackageHours || 0,
          usedPackageHours: totalUsed,
        }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        });
      }
      
      return new Response(JSON.stringify(null), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Return all customers (for dashboard)
    const sortedData = data.sort((a, b) => 
      new Date(b.date).getTime() - new Date(a.date).getTime()
    );
    
    return new Response(JSON.stringify(sortedData), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    console.error('Error reading customers:', error);
    return new Response(JSON.stringify([]), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}