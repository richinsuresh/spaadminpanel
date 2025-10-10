// src/app/api/submit/route.ts
import { readFile, writeFile } from 'fs/promises';
import * as XLSX from 'xlsx';
import path from 'path';
import { deductPackageHours, savePackage } from '../../../lib/packages';

type FormData = {
  name: string;
  mobile: string;
  date: string;
  treatment: string;
  amountPaid: number;
  sessionHours: number;
  tookPackage: boolean;
  isPackageCustomer: boolean;
  packageAmount?: number;
  totalPackageHours?: number;
  outlet: string;
};

const EXCEL_PATH = path.join(process.cwd(), 'data.xlsx');

export async function POST(request: Request) {
  try {
    const body = await request.json() as FormData;

    if (!body.name || !body.mobile || !body.date || !body.treatment) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields' }),
        { status: 400 }
      );
    }

    // Handle package logic
    if (body.tookPackage) {
      const expiry = new Date(body.date);
      expiry.setMonth(expiry.getMonth() + 2);
      
      await savePackage(body.mobile, {
        name: body.name,
        mobile: body.mobile,
        packageAmount: body.packageAmount,
        totalHours: body.totalPackageHours,
        usedHours: 0,
        remainingHours: body.totalPackageHours,
        startDate: body.date,
        expiryDate: expiry.toISOString().split('T')[0],
        status: 'active',
        outlet: body.outlet
      });
    } else if (body.isPackageCustomer) {
      await deductPackageHours(body.mobile, body.sessionHours);
    }

    // Save session to Excel
    let existingData: FormData[] = [];
    try {
      const buffer = await readFile(EXCEL_PATH);
      const workbook = XLSX.read(buffer);
      const sheetName = workbook.SheetNames[0];
      existingData = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName]) as FormData[];
    } catch (e) {
      console.log('Creating new Excel file');
    }

    const newData = [...existingData, body].sort((a, b) =>
      a.name.toLowerCase().localeCompare(b.name.toLowerCase())
    );

    const worksheet = XLSX.utils.json_to_sheet(newData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Data');
    const excelBuffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
    await writeFile(EXCEL_PATH, excelBuffer);

    return new Response(JSON.stringify({ success: true }), { status: 200 });
  } catch (error) {
    console.error('Error saving data:', error);
    return new Response(JSON.stringify({ error: 'Failed to save data' }), { status: 500 });
  }
}