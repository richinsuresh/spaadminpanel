// src/lib/exportToExcel.ts
import * as XLSX from 'xlsx';

type WorkbookInput = any[] | Record<string, any[]>;

// Helper to style one worksheet nicely
function styleWorksheet(ws: XLSX.WorkSheet) {
  if (!ws['!ref']) return;

  const range = XLSX.utils.decode_range(ws['!ref']);

  const headerRow = range.s.r; // first row
  const colCount = range.e.c - range.s.c + 1;

  // Simple column width config: based on header length
  const cols: XLSX.ColInfo[] = [];
  for (let c = 0; c < colCount; c++) {
    const addr = XLSX.utils.encode_cell({ r: headerRow, c: range.s.c + c });
    const cell = ws[addr];
    const headerText = cell && cell.v ? String(cell.v) : '';
    const baseWidth = Math.max(headerText.length + 4, 12);
    cols.push({ wch: baseWidth });
  }
  ws['!cols'] = cols;

  // Style headers
  for (let c = range.s.c; c <= range.e.c; c++) {
    const addr = XLSX.utils.encode_cell({ r: headerRow, c });
    const cell = ws[addr];
    if (!cell) continue;

    cell.s = {
      fill: {
        patternType: 'solid',
        fgColor: { rgb: 'FF1F2937' }, // dark gray (Tailwind slate-900-ish)
      },
      font: {
        name: 'Calibri',
        sz: 12,
        bold: true,
        color: { rgb: 'FFFFFFFF' }, // white
      },
      alignment: {
        horizontal: 'center',
        vertical: 'center',
        wrapText: true,
      },
      border: {
        top:    { style: 'thin', color: { rgb: 'FFCCCCCC' } },
        bottom: { style: 'thin', color: { rgb: 'FFCCCCCC' } },
        left:   { style: 'thin', color: { rgb: 'FFCCCCCC' } },
        right:  { style: 'thin', color: { rgb: 'FFCCCCCC' } },
      },
    };
  }

  // Style data rows (zebra striping + borders)
  for (let r = headerRow + 1; r <= range.e.r; r++) {
    const isEven = (r - headerRow) % 2 === 0;
    for (let c = range.s.c; c <= range.e.c; c++) {
      const addr = XLSX.utils.encode_cell({ r, c });
      const cell = ws[addr];
      if (!cell) continue;

      const existing = cell.s || {};

      cell.s = {
        ...existing,
        fill: {
          patternType: 'solid',
          fgColor: {
            rgb: isEven ? 'FFF9FAFB' : 'FFFFFFFF', // light gray / white
          },
        },
        font: {
          name: 'Calibri',
          sz: 11,
          color: { rgb: 'FF111827' }, // dark text
        },
        alignment: {
          horizontal: 'left',
          vertical: 'center',
          wrapText: true,
        },
        border: {
          top:    { style: 'thin', color: { rgb: 'FFE5E7EB' } },
          bottom: { style: 'thin', color: { rgb: 'FFE5E7EB' } },
          left:   { style: 'thin', color: { rgb: 'FFE5E7EB' } },
          right:  { style: 'thin', color: { rgb: 'FFE5E7EB' } },
        },
      };
    }
  }
}

export const exportToExcel = (data: WorkbookInput, fileName: string) => {
  const wb = XLSX.utils.book_new();

  // Single-sheet mode (backward compatible)
  if (Array.isArray(data)) {
    const ws = XLSX.utils.json_to_sheet(data || []);
    styleWorksheet(ws);
    XLSX.utils.book_append_sheet(wb, ws, 'Data');
  }
  // Multi-sheet mode: keys are sheet names
  else if (data && typeof data === 'object') {
    const sheetNames = Object.keys(data);

    if (sheetNames.length === 0) {
      const ws = XLSX.utils.aoa_to_sheet([['No data']]);
      styleWorksheet(ws);
      XLSX.utils.book_append_sheet(wb, ws, 'Data');
    } else {
      sheetNames.forEach((rawName, idx) => {
        const rows = data[rawName] || [];
        const safeName =
          (rawName && rawName.toString().slice(0, 31)) || `Sheet${idx + 1}`;

        const ws =
          Array.isArray(rows) && rows.length > 0
            ? XLSX.utils.json_to_sheet(rows)
            : XLSX.utils.aoa_to_sheet([['No data']]);

        styleWorksheet(ws);
        XLSX.utils.book_append_sheet(wb, ws, safeName);
      });
    }
  } else {
    const ws = XLSX.utils.aoa_to_sheet([['No data']]);
    styleWorksheet(ws);
    XLSX.utils.book_append_sheet(wb, ws, 'Data');
  }

  XLSX.writeFile(wb, fileName);
};
