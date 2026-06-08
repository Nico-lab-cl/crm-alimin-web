const fs = require('fs');
const path = require('path');
const XLSX = require('xlsx');

const files = [
  'kommo_export_leads_2025-06-20 2.xlsx',
  'kommo_export_leads_2025-06-20.xlsx',
  'LEADS BASE DE DATOS ANTIGUA.xlsx',
  'LEADS clientify.xlsx'
];

function inspectXlsx(filename) {
  const filePath = path.join(__dirname, '..', filename);
  console.log(`\n========================================`);
  console.log(`Inspecting XLSX: ${filename}`);
  if (!fs.existsSync(filePath)) {
    console.log('File does not exist.');
    return;
  }

  const workbook = XLSX.readFile(filePath);
  console.log('Sheets:', workbook.SheetNames);

  const firstSheetName = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[firstSheetName];
  
  // Convert to JSON (header row + data)
  const range = XLSX.utils.decode_range(worksheet['!ref']);
  console.log(`Sheet Range: cols: ${range.e.c + 1}, rows: ${range.e.r + 1}`);

  const rows = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
  console.log(`Total parsed rows: ${rows.length}`);
  
  if (rows.length > 0) {
    console.log('Headers:', rows[0]);
    console.log('\n--- First 3 Sample Data Rows ---');
    for (let i = 1; i <= Math.min(3, rows.length - 1); i++) {
      console.log(`Row ${i}:`, rows[i]);
    }
  }
}

for (const file of files) {
  inspectXlsx(file);
}
