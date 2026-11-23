import * as XLSX from 'xlsx/xlsx.mjs';
import * as cpexcel from 'xlsx/dist/cpexcel.full.mjs';
// Code pages let old .xls files in non-Latin encodings open correctly
XLSX.set_cptable(cpexcel);
export default XLSX;
