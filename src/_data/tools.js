// Every tool page on the site. Image conversions are generated from the
// format catalog; hand-written entries in toolsCurated.json override the text.
const catalog = require('./catalog.json');
const curated = require('./toolsCurated.json');

const LABEL = { WEBP: 'WebP' };
const label = (f) => LABEL[f] || f;
const groupOf = (f) => catalog.groups.find((g) => g.formats.includes(f));

function targetsFor(from) {
  if (from === 'PDF') return catalog.pdfTargets.slice();
  const g = groupOf(from);
  const own = g.formats.filter((f) => f !== from && !catalog.inputOnly.includes(f));
  const extra = (catalog.extraTargets[g.slug] || []).filter((f) => f !== from && !own.includes(f));
  return own.concat(extra);
}

// Categories whose converters run today
const LIVE = ['image', 'spreadsheet'];

const RAW = ['ARW', 'CR2', 'CR3', 'DNG', 'NEF', 'ORF', 'RW2'];
const ALPHA = ['PNG', 'WEBP', 'AVIF', 'GIF', 'TIFF', 'TGA', 'ICO', 'SVG', 'PSD', 'HEIC', 'HEIF'];
const NO_ALPHA = ['JPG', 'JFIF', 'BMP', 'PDF'];

function summary(from, to) {
  const F = label(from), T = label(to);
  if (groupOf(from).slug === 'spreadsheet') {
    if (to === 'PDF') return `Turn ${F} spreadsheets into a PDF table you can print or share. Converted in your browser; the file is never uploaded.`;
    if (to === 'HTML') return `Turn a ${F} spreadsheet into a web page table you can open in any browser or paste into a website.`;
    if (to === 'CSV' || to === 'TSV') return `Save ${F} sheets as ${T} plain text for importing into other apps and databases. Free, private, no upload.`;
    return `Convert ${F} spreadsheets to ${T} in your browser, with every sheet carried over. Free, no sign-up, never uploaded.`;
  }
  if (RAW.includes(from)) return `Turn ${F} camera RAW files into ${T} without photo software. Your files are converted inside your browser and never uploaded.`;
  if (to === 'PDF') return `Put one or many ${F} images into a PDF, one image per page. Everything happens in your browser, so nothing is uploaded.`;
  if (to === 'ICO') return `Make a Windows icon or favicon from a ${F} image, with all the standard sizes from 16 to 256 pixels in one file.`;
  if (from === 'SVG') return `Render SVG graphics as ${T} images at the exact width you need. Converted in your browser, never uploaded.`;
  if (from === 'HEIC' || from === 'HEIF') return `Convert iPhone ${F} photos to ${T} so they open everywhere. Your photos stay on your device the whole time.`;
  return `Convert ${F} images to ${T} right in your browser. Free, no sign-up, and your files are never uploaded.`;
}

const tools = [];
const seen = new Set();
for (const c of curated) {
  if (c.from) seen.add(c.slug);
  tools.push({ ...c, live: true });
}
for (const g of catalog.groups.filter((g) => LIVE.includes(g.slug))) {
  for (const from of g.formats) {
    for (const to of targetsFor(from)) {
      const slug = `${from}-to-${to}`.toLowerCase();
      if (seen.has(slug)) continue;
      seen.add(slug);
      tools.push({ slug, category: g.slug, from, to, popular: false, live: true, summary: summary(from, to) });
    }
  }
}

// Pair-specific facts shown on each page, so every page says something useful about its own conversion
function notes(t) {
  if (!t.from) return [];
  const { from, to } = t; const F = label(from), T = label(to);
  const n = [];
  if (t.category === 'spreadsheet') {
    const BOOKS = ['XLSX', 'XLSM', 'XLS', 'ODS'];
    if (from === 'CSV' || from === 'TSV') n.push(`We detect whether your ${F} uses commas, semicolons or tabs. Plain numbers become real numbers, while values with leading zeros, like 00123 or phone numbers, stay exactly as written.`);
    if (from === 'NUMBERS') n.push(`Works with files from Numbers 3 and later. Values come across; formulas arrive as their results, and colours and charts are not kept.`);
    if (to === 'CSV' || to === 'TSV') n.push(`${T} holds plain values for a single sheet: formulas become their results, and colours, fonts and charts are dropped. A workbook with several sheets gives one ${T} per sheet, delivered together in a ZIP, or choose “First sheet only”.`);
    if (to === 'CSV') n.push(`Keep “Excel-friendly” ticked so Excel shows accents and non-English text correctly. Pick “Semicolon” if your Excel uses commas for decimals, as in much of Europe.`);
    if (BOOKS.includes(from) && BOOKS.includes(to)) n.push(`Sheets, cell values, ${to === 'XLS' ? '' : 'formulas, '}number formats, merged cells and column widths carry over. Colours, fonts, borders, charts, images and pivot tables are not kept.`);
    if (to === 'XLS') n.push(`XLS is the Excel 97–2003 format and is limited to 65,536 rows and 256 columns. Formulas are saved as their results, so the numbers are right but will not recalculate. Only use XLS for old software that cannot open XLSX.`);
    if (from === 'XLSM' && to !== 'XLSM') n.push(`Macros cannot be stored in ${T}, so they are left out. Everything else in the workbook comes across.`);
    if (to === 'XLSM' && from !== 'XLSM') n.push(`Converting does not add macros; the workbook is simply saved in the macro-enabled format.`);
    if (to === 'PDF') n.push(`Each sheet is laid out as a table on A4 or US Letter pages, switching to landscape for wide sheets. The PDF shows the sheet as a picture of the table, so its text cannot be selected or searched.`);
    if (to === 'HTML') n.push(`You get one web page with a table for each sheet. Open it in any browser, or copy the table into a website or email.`);
    return n;
  }
  if (RAW.includes(from)) n.push(`Cameras store a full-size JPEG preview inside every ${F} file. We convert that preview, which already has your camera's colour and white balance applied. If you need full RAW editing (exposure recovery, 16-bit output), use a RAW editor like Lightroom or darktable.`);
  if (from === 'HEIC' || from === 'HEIF') n.push(`${F} is what iPhones save photos as by default. Photos are turned the right way up automatically, using the orientation your phone recorded.`);
  if (from === 'PSD') n.push(`We use the flattened image Photoshop saves inside the file, so you get exactly what you see in Photoshop with all layers merged. If you get an error, re-save the file with “Maximize compatibility” turned on.`);
  if (from === 'SVG') n.push(`SVG is a vector format, so it can be drawn at any size without blurring. Type the width you need before converting; the height follows automatically.`);
  if (from === 'GIF' || from === 'WEBP') n.push(`If your ${F} is animated, only the first frame is converted.`);
  if (ALPHA.includes(from) && NO_ALPHA.includes(to)) n.push(`${T} cannot store transparency. Transparent areas are filled with a background colour, white unless you pick another one.`);
  if (['JPG', 'JFIF', 'WEBP', 'AVIF', 'HEIC', 'HEIF'].includes(from) && ['PNG', 'TIFF', 'BMP', 'TGA'].includes(to)) n.push(`${T} is lossless, so the converted file is usually bigger than the ${F}. It will not bring back detail the ${F} compression already removed, but no further quality is lost if you edit and save again.`);
  if (['JPG', 'JFIF', 'WEBP', 'AVIF'].includes(to)) n.push(`Use the quality slider to trade file size for sharpness. 80 to 90% looks the same as the original to most people.`);
  if (to === 'AVIF') n.push(`AVIF files are often half the size of a JPG that looks the same. Saving AVIF takes a few seconds per photo because the format is complex to compress.`);
  if (to === 'GIF') n.push(`GIF can only show 256 colours, so photos may look slightly grainy. GIF is best for simple graphics and logos.`);
  if (to === 'BMP' || to === 'TGA' || to === 'TIFF') n.push(`${T} is saved without compression, so expect a large file.`);
  if (to === 'ICO') n.push(`The icon contains every standard size up to 256 × 256 pixels. Non-square images are centred on a transparent square.`);
  if (to === 'SVG') n.push(`The image is placed inside an SVG file so it can be used where only SVG is accepted. It is not traced into vector shapes, so it will still blur if you enlarge it.`);
  if (to === 'PDF') n.push(`Choose “Same as image” for pages that match each picture, or A4 or US Letter for printing. With several images you can make one PDF or a separate PDF for each.`);
  return n;
}
tools.forEach((t) => (t.notes = notes(t)));

module.exports = tools;
