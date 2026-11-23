// WrenConvert spreadsheet engine. Runs in the browser; nothing is uploaded.
import { ConvertError, zip } from './engine.js';

export { ConvertError, zip };

const libs = {};
const load = (name) => (libs[name] ||= import(`/assets/vendor/${name}.js`));
const xlsx = () => load('xlsx').then((m) => m.default);

export const MIME = {
  CSV: 'text/csv;charset=utf-8', TSV: 'text/tab-separated-values;charset=utf-8',
  XLSX: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  XLSM: 'application/vnd.ms-excel.sheet.macroEnabled.12', XLS: 'application/vnd.ms-excel',
  ODS: 'application/vnd.oasis.opendocument.spreadsheet', HTML: 'text/html;charset=utf-8', PDF: 'application/pdf',
};
const EXT = { CSV: 'csv', TSV: 'tsv', XLSX: 'xlsx', XLSM: 'xlsm', XLS: 'xls', ODS: 'ods', HTML: 'html', PDF: 'pdf' };
const BOOK_TYPE = { XLSX: 'xlsx', XLSM: 'xlsm', XLS: 'biff8', ODS: 'ods' };
export const INPUTS = ['CSV', 'TSV', 'XLSX', 'XLSM', 'XLS', 'ODS', 'NUMBERS'];
export const OUTPUTS = Object.keys(EXT);

const extOf = (name) => (name.includes('.') ? name.split('.').pop() : '').toUpperCase();
const baseName = (name) => name.replace(/\.[^.]+$/, '') || 'sheet';
const safe = (s) => String(s).replace(/[\\/:*?"<>|]+/g, '_').trim() || 'Sheet';

/** Work out the real format from the first bytes, falling back to the extension */
export async function sniff(file) {
  const b = new Uint8Array(await file.slice(0, 8).arrayBuffer());
  const ext = extOf(file.name);
  if (b[0] === 0xd0 && b[1] === 0xcf && b[2] === 0x11 && b[3] === 0xe0) return 'XLS'; // OLE2 (also encrypted xlsx)
  if (b[0] === 0x50 && b[1] === 0x4b) return ['XLSX', 'XLSM', 'ODS', 'NUMBERS'].includes(ext) ? ext : 'XLSX'; // ZIP container
  if (ext === 'TSV' || ext === 'TAB') return 'TSV';
  if (['CSV', 'TXT'].includes(ext)) return 'CSV';
  return INPUTS.includes(ext) ? ext : null;
}

// ---------------------------------------------------------------- reading

/** Decode text as UTF-8, or Windows-1252 if it is not valid UTF-8 (old Excel CSV exports) */
async function readText(file) {
  const buf = await file.arrayBuffer();
  try { return new TextDecoder('utf-8', { fatal: true }).decode(buf).replace(/^﻿/, ''); }
  catch (e) { return new TextDecoder('windows-1252').decode(buf); }
}

/** Guess the separator from the first lines: comma, semicolon, tab or pipe */
function guessSeparator(text) {
  const sample = text.slice(0, 20000).split(/\r?\n/).slice(0, 20).filter(Boolean);
  let best = ',', bestScore = -1;
  for (const sep of [',', ';', '\t', '|']) {
    const counts = sample.map((l) => l.split(sep).length - 1);
    const first = counts[0] || 0;
    if (!first) continue;
    // A real separator appears the same number of times on most lines
    const steady = counts.filter((c) => c === first).length / counts.length;
    const score = first * steady;
    if (score > bestScore) { best = sep; bestScore = score; }
  }
  return best;
}

const NUMBER = /^-?(0|[1-9]\d{0,14})([.]\d+)?$/;

/** CSV values arrive as text; turn plain numbers into numbers but keep 00123, phone numbers, IDs as text */
function typeCsvCells(XLSX, ws) {
  if (!ws['!ref']) return;
  const r = XLSX.utils.decode_range(ws['!ref']);
  for (let R = r.s.r; R <= r.e.r; R++) {
    for (let C = r.s.c; C <= r.e.c; C++) {
      const cell = ws[XLSX.utils.encode_cell({ r: R, c: C })];
      if (cell && cell.t === 's' && NUMBER.test(cell.v)) { cell.t = 'n'; cell.v = Number(cell.v); }
    }
  }
}

export async function read(file) {
  const XLSX = await xlsx();
  const fmt = await sniff(file);
  if (!fmt) throw new ConvertError('This file type is not supported. Try XLSX, XLS, ODS, CSV or Numbers files.');
  try {
    if (fmt === 'CSV' || fmt === 'TSV') {
      const text = await readText(file);
      const FS = fmt === 'TSV' ? '\t' : guessSeparator(text);
      const wb = XLSX.read(text, { type: 'string', FS, raw: true, dense: false });
      wb.SheetNames.forEach((n) => typeCsvCells(XLSX, wb.Sheets[n]));
      const old = wb.SheetNames[0], name = safe(baseName(file.name)).slice(0, 31);
      if (name !== old) { wb.Sheets[name] = wb.Sheets[old]; delete wb.Sheets[old]; wb.SheetNames[0] = name; }
      return { wb, format: fmt };
    }
    const wb = XLSX.read(await file.arrayBuffer(), { type: 'array', cellDates: true, cellNF: true, bookVBA: true });
    return { wb, format: fmt };
  } catch (e) {
    const m = String(e?.message || e);
    // Real password-protected Office files say so; a damaged ZIP reports "ZIP encryption" and is just broken
    if (/password/i.test(m)) throw new ConvertError('This workbook is password-protected. Remove the password in Excel, then try again.');
    if (/numbers/i.test(m)) throw new ConvertError('This Numbers file could not be read. Files from Numbers 3 or later are supported.');
    throw new ConvertError('This spreadsheet could not be opened. It may be damaged or in an unusual variant.');
  }
}

// ---------------------------------------------------------------- writing

const sheetsToUse = (wb, which) => {
  const names = wb.SheetNames.filter((n) => wb.Sheets[n]?.['!ref']);
  if (!names.length) throw new ConvertError('This spreadsheet is empty.');
  return which === 'first' ? names.slice(0, 1) : names;
};

/** Rows of displayed text for one sheet (what you see in Excel, not raw numbers) */
const rowsOf = (XLSX, ws) => XLSX.utils.sheet_to_json(ws, { header: 1, raw: false, defval: '', blankrows: true, dateNF: 'yyyy-mm-dd' });

function textFile(text, target, name, bom) {
  return new Blob([(bom ? '﻿' : '') + text], { type: MIME[target] });
}

function htmlDoc(XLSX, wb, names, title) {
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const tables = names.map((n) => {
    const rows = rowsOf(XLSX, wb.Sheets[n]);
    const body = rows.map((r, i) => `<tr>${r.map((v) => (i === 0 ? `<th>${esc(v)}</th>` : `<td>${esc(v)}</td>`)).join('')}</tr>`).join('\n');
    return `${names.length > 1 ? `<h2>${esc(n)}</h2>\n` : ''}<div class="wrap"><table>\n${body}\n</table></div>`;
  }).join('\n');
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<style>
body{font:14px/1.45 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;margin:24px;color:#222}
h1{font-size:20px}h2{font-size:16px;margin:28px 0 8px}
.wrap{overflow-x:auto}table{border-collapse:collapse}
th,td{border:1px solid #d6d6d6;padding:5px 9px;text-align:left;vertical-align:top;white-space:nowrap}
th{background:#f3f3f3;font-weight:600}tr:nth-child(even) td{background:#fafafa}
</style></head><body>
<h1>${esc(title)}</h1>
${tables}
</body></html>`;
}

const PAGE_PX = { A4: [794, 1123], LETTER: [816, 1056] }; // 96 dpi
const PAGE_PT = { A4: [595.28, 841.89], LETTER: [612, 792] };

/** Lay sheets out as table pages on a canvas and save as PDF. Text is drawn by the browser, so every script works. */
async function toPdf(XLSX, wb, names, opts) {
  const { PDFDocument } = await load('pdf');
  const doc = await PDFDocument.create();
  const size = PAGE_PX[opts.page] ? opts.page : 'A4';
  const SCALE = 2, M = 36, ROW = 22, PAD = 7, FONT = 12;
  const font = (bold) => `${bold ? '600 ' : ''}${FONT}px Inter, system-ui, -apple-system, "Segoe UI", Roboto, "Noto Sans", sans-serif`;
  const measure = document.createElement('canvas').getContext('2d');
  let pages = 0;

  for (const n of names) {
    let rows = rowsOf(XLSX, wb.Sheets[n]);
    while (rows.length && rows[rows.length - 1].every((v) => v === '')) rows.pop();
    if (!rows.length) continue;
    if (rows.length > 20000) throw new ConvertError('This sheet has more than 20,000 rows, which is too many to lay out as a PDF in the browser. Try CSV or XLSX instead.');
    const cols = Math.max(...rows.map((r) => r.length));
    // Column widths from content, capped so one long cell does not take the page
    const widths = Array.from({ length: cols }, (_, c) => {
      let w = 30;
      for (let r = 0; r < Math.min(rows.length, 500); r++) {
        measure.font = font(r === 0);
        w = Math.max(w, measure.measureText(String(rows[r][c] ?? '')).width + PAD * 2);
      }
      return Math.min(Math.ceil(w), 280);
    });
    const total = widths.reduce((a, b) => a + b, 0);
    let [pw, ph] = PAGE_PX[size];
    if (total > pw - 2 * M) [pw, ph] = [ph, pw]; // wide sheet: landscape
    const usable = pw - 2 * M;
    // Shrink to fit the width a little; past that, split columns over several pages
    const shrink = Math.max(0.7, Math.min(1, usable / total));
    const w = widths.map((x) => x * shrink);
    const chunks = [];
    for (let c = 0; c < cols;) {
      let sum = 0, end = c;
      while (end < cols && (sum + w[end] <= usable || end === c)) sum += w[end++];
      chunks.push([c, end]);
      c = end;
    }
    const rowH = ROW * shrink;
    const perPage = Math.floor((ph - 2 * M - 22) / rowH);

    for (const [c0, c1] of chunks) {
      for (let r0 = 0; r0 < rows.length; r0 += perPage) {
        const canvas = document.createElement('canvas');
        canvas.width = pw * SCALE; canvas.height = ph * SCALE;
        const ctx = canvas.getContext('2d');
        ctx.scale(SCALE, SCALE);
        ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, pw, ph);
        ctx.fillStyle = '#888'; ctx.font = `${10}px system-ui, sans-serif`; ctx.textBaseline = 'middle';
        const part = chunks.length > 1 ? ` · columns ${c0 + 1}–${c1}` : '';
        ctx.fillText(`${n}${part}`, M, M - 14);
        let y = M;
        const slice = rows.slice(r0, r0 + perPage);
        slice.forEach((row, i) => {
          const header = r0 + i === 0;
          let x = M;
          if (header) { ctx.fillStyle = '#f1f1f1'; ctx.fillRect(M, y, w.slice(c0, c1).reduce((a, b) => a + b, 0), rowH); }
          ctx.font = font(header).replace(`${FONT}px`, `${FONT * shrink}px`);
          for (let c = c0; c < c1; c++) {
            const cw = w[c];
            ctx.strokeStyle = '#d4d4d4'; ctx.lineWidth = 0.6; ctx.strokeRect(x, y, cw, rowH);
            let text = String(row[c] ?? '');
            const max = cw - PAD * 2 * shrink;
            if (ctx.measureText(text).width > max) {
              while (text.length > 1 && ctx.measureText(`${text}…`).width > max) text = text.slice(0, -1);
              text += '…';
            }
            ctx.fillStyle = '#1d1d1d';
            ctx.save(); ctx.beginPath(); ctx.rect(x, y, cw, rowH); ctx.clip();
            // Right-align numbers like Excel does; IDs with leading zeros stay left like text
            const numeric = !header && /^-?[\d,.\s]+%?$/.test(row[c] ?? '') && !/^0\d/.test(row[c]);
            if (numeric) { ctx.textAlign = 'right'; ctx.fillText(text, x + cw - PAD * shrink, y + rowH / 2); }
            else { ctx.textAlign = 'left'; ctx.fillText(text, x + PAD * shrink, y + rowH / 2); }
            ctx.restore();
            x += cw;
          }
          y += rowH;
        });
        const jpg = await new Promise((res) => canvas.toBlob(res, 'image/jpeg', 0.9));
        const img = await doc.embedJpg(new Uint8Array(await jpg.arrayBuffer()));
        let [ptW, ptH] = PAGE_PT[size];
        if (pw > ph) [ptW, ptH] = [ptH, ptW];
        doc.addPage([ptW, ptH]).drawImage(img, { x: 0, y: 0, width: ptW, height: ptH });
        pages++;
      }
    }
  }
  if (!pages) throw new ConvertError('This spreadsheet is empty.');
  return new Blob([await doc.save()], { type: MIME.PDF });
}

/**
 * Convert one spreadsheet. opts: { sheets: 'all'|'first', separator, bom, page }
 * Returns { blob, name, sheets } — several CSVs come back together as one ZIP.
 */
export async function convert(file, target, opts = {}) {
  const XLSX = await xlsx();
  const { wb } = await read(file);
  const base = baseName(file.name);
  const names = sheetsToUse(wb, opts.sheets);
  const info = { sheets: names.length };

  if (target === 'CSV' || target === 'TSV') {
    const FS = target === 'TSV' ? '\t' : (opts.separator || ',');
    const files = names.map((n) => ({
      name: names.length > 1 ? `${base} - ${safe(n)}.${EXT[target]}` : `${base}.${EXT[target]}`,
      blob: textFile(XLSX.utils.sheet_to_csv(wb.Sheets[n], { FS, blankrows: true, dateNF: 'yyyy-mm-dd' }), target, n, opts.bom !== false && target === 'CSV'),
    }));
    if (files.length === 1) return { ...files[0], ...info };
    return { blob: await zip(files), name: `${base} (${files.length} sheets).zip`, ...info };
  }
  if (target === 'HTML') {
    return { blob: textFile(htmlDoc(XLSX, wb, names, base), 'HTML'), name: `${base}.html`, ...info };
  }
  if (target === 'PDF') {
    return { blob: await toPdf(XLSX, wb, names, opts), name: `${base}.pdf`, ...info };
  }
  if (BOOK_TYPE[target]) {
    let book = wb;
    if (opts.sheets === 'first') book = { ...wb, SheetNames: names, Sheets: { [names[0]]: wb.Sheets[names[0]] } };
    if (target !== 'XLSM') delete book.vbaraw;
    if (target === 'XLS') {
      const big = names.find((n) => { const r = XLSX.utils.decode_range(wb.Sheets[n]['!ref']); return r.e.r >= 65536 || r.e.c >= 256; });
      if (big) throw new ConvertError(`Sheet “${big}” is bigger than XLS allows (65,536 rows and 256 columns). Choose XLSX instead.`);
    }
    try {
      const out = XLSX.write(book, { bookType: BOOK_TYPE[target], type: 'array', compression: true, bookVBA: target === 'XLSM' });
      return { blob: new Blob([out], { type: MIME[target] }), name: `${base}.${EXT[target]}`, ...info };
    } catch (e) {
      throw new ConvertError(`Could not save as ${target}: ${e.message || 'unknown error'}.`);
    }
  }
  throw new ConvertError(`Saving as ${target} is not supported yet.`);
}

export function preload() { xlsx().catch(() => {}); }
