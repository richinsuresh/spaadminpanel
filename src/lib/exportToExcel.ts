import * as XLSX from 'xlsx';

/**
 * Exports an array of objects to an Excel file.
 * @param data The JSON data array to export.
 * @param fileName The desired name for the .xlsx file (e.g., "report.xlsx").
 */
export const exportToExcel = (data: any[], fileName: string) => {
  // 1. Create a new workbook
  const wb = XLSX.utils.book_new();

  // 2. Convert the JSON data to a worksheet
  const ws = XLSX.utils.json_to_sheet(data);

  // 3. Add the worksheet to the workbook
  XLSX.utils.book_append_sheet(wb, ws, 'Data'); // "Data" is the sheet name

  // 4. Trigger the browser to download the file
  XLSX.writeFile(wb, fileName);
};