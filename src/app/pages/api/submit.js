// pages/api/submit.js
import { readFile, writeFile } from 'fs/promises';
import { parse, utils } from 'xlsx';
import path from 'path';

const EXCEL_PATH = path.join(process.cwd(), 'data.xlsx');

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Read existing Excel file or create new data
    let existingData = [];
    try {
      const buffer = await readFile(EXCEL_PATH);
      const workbook = parse(buffer);
      const sheetName = workbook.SheetNames[0];
      existingData = utils.sheet_to_json(workbook.Sheets[sheetName]);
    } catch (e) {
      // File doesn't exist - start with empty array
      console.log('No existing Excel file found. Creating new one.');
    }

    // Add new entry
    const newData = [...existingData, req.body];

    // Sort by 'name' (case-insensitive)
    newData.sort((a, b) => 
      a.name?.toLowerCase().localeCompare(b.name?.toLowerCase())
    );

    // Create new workbook
    const worksheet = utils.json_to_sheet(newData);
    const workbook = utils.book_new();
    utils.book_append_sheet(workbook, worksheet, 'Data');

    // Write to file
    const excelBuffer = utils.write(workbook, { type: 'buffer', bookType: 'xlsx' });
    await writeFile(EXCEL_PATH, excelBuffer);

    res.status(200).json({ success: true });
  } catch (error) {
    console.error('Error saving to Excel:', error);
    res.status(500).json({ error: 'Failed to save data' });
  }
}