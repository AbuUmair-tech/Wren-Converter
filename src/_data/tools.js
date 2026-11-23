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
const LIVE = ['image', 'spreadsheet', 'font', 'audio'];

const RAW = ['ARW', 'CR2', 'CR3', 'DNG', 'NEF', 'ORF', 'RW2'];
const ALPHA = ['PNG', 'WEBP', 'AVIF', 'GIF', 'TIFF', 'TGA', 'ICO', 'SVG', 'PSD', 'HEIC', 'HEIF'];
const NO_ALPHA = ['JPG', 'JFIF', 'BMP', 'PDF'];

function summary(from, to) {
  const F = label(from), T = label(to);
  if (groupOf(from).slug === 'audio') {
    if (['MP4', 'MOV', 'WEBM', 'MKV'].includes(from)) return `Pull the sound out of a ${F} video and save it as ${T}. The video is processed in your browser and never uploaded.`;
    return `Convert ${F} audio to ${T} in your browser. Free, no sign-up, and your recordings are never uploaded.`;
  }
  if (groupOf(from).slug === 'font') {
    if (to === 'WOFF2' || to === 'WOFF') return `Turn ${F} fonts into ${T} web fonts for your website, smaller and ready for @font-face. Converted in your browser, never uploaded.`;
    return `Convert ${F} fonts to ${T} you can install on your computer. Free, private, and your font files are never uploaded.`;
  }
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
  if (t.category === 'audio') {
    const LOSSY_A = ['MP3', 'M4A', 'AAC', 'OGG', 'OPUS'];
    const LOSSLESS_A = ['WAV', 'FLAC', 'AIFF'];
    if (['MP4', 'MOV', 'WEBM', 'MKV'].includes(from)) n.push(`Only the sound is kept; the picture is dropped. If the video has several audio tracks, the first one is used. Videos up to about 1.5 GB work, depending on your device's memory.`);
    if (LOSSY_A.includes(to)) n.push(`Pick a quality before converting. ${to === 'OPUS' ? '128 kbps' : '192 kbps'} sounds the same as the original to most people; choose more for music you care about, less for speech.`);
    if (LOSSY_A.includes(from) && LOSSLESS_A.includes(to)) n.push(`${T} is lossless, so the file will be much bigger than the ${F}. It cannot bring back detail the ${F} compression removed, but nothing more is lost when you edit and save again.`);
    if (LOSSY_A.includes(from) && LOSSY_A.includes(to)) n.push(`Converting from one compressed format to another loses a little quality each time. Use a high setting if the sound matters.`);
    if (LOSSLESS_A.includes(from) && LOSSLESS_A.includes(to)) n.push(`Both formats are lossless, so the sound is identical. 24-bit recordings stay 24-bit.`);
    if (to === 'MP3' || to === 'M4A') n.push(`Song details like title, artist and album are kept, and so is album art when the original has it.`);
    else if (!['MP4', 'MOV', 'WEBM', 'MKV'].includes(from)) n.push(`Song details like title and artist are kept where ${T} can store them. Album art is not kept in ${T} files.`);
    if (to === 'OPUS') n.push(`Opus gives the best quality at small sizes and is what WhatsApp uses for voice notes. Some older players and car stereos cannot play it.`);
    if (from === 'AMR') n.push(`AMR is a speech format from older phones, so music in it will sound thin whatever you convert it to.`);
    n.push(`The converter (about 30 MB) downloads the first time you use it and is then kept by your browser, so later conversions start at once and work offline.`);
    return n;
  }
  if (t.category === 'font') {
    if (from === 'WOFF' || from === 'WOFF2') n.push(`${F} is a packed version of a TTF or OTF font. Unpacking gives back exactly the font that was packed, with nothing changed.`);
    if (from === 'EOT') n.push(`EOT is the old Internet Explorer web font format. Plain EOT files work; EOT files squeezed with MicroType Express compression are not supported yet.`);
    if (to === 'WOFF2') n.push(`WOFF2 is the smallest font format, often less than half the size of the TTF. Every current browser supports it, so it is the only web font file most websites need.`);
    if (to === 'WOFF') n.push(`WOFF is only needed for browsers older than about 2016. For a modern website, WOFF2 alone is smaller and enough.`);
    if (to === 'WOFF' || to === 'WOFF2') n.push(`Packing is lossless: the outlines, kerning, ligatures and language support stay exactly the same.`);
    if (to === 'OTF') n.push(`OTF can hold either TrueType or PostScript (CFF) outlines. We keep your font's outlines exactly as they are, so nothing changes and the file works anywhere OTF is accepted.`);
    if (to === 'TTF' && (from === 'OTF' || from === 'WOFF' || from === 'WOFF2' || from === 'EOT')) n.push(`If the font uses PostScript (CFF) outlines, they are redrawn as TrueType curves, a difference too small to see at normal sizes. Kerning, ligatures and language features are copied across unchanged. Variable OTF fonts (CFF2) are not supported yet.`);
    n.push(`Fonts are licensed software. Check that your font's licence allows converting it and using it on the web.`);
    return n;
  }
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

// Which pages Google should index. Every pair works and stays linked for visitors,
// but only conversions people actually look for go into search, so the site is not
// flooded with near-empty pages (Google's "scaled content" spam policy).
const COMMON_IMG = ['JPG', 'PNG', 'WEBP', 'HEIC', 'AVIF', 'GIF', 'SVG', 'PDF', 'ICO', 'TIFF', 'BMP', 'PSD'];
const COMMON_AUD = ['MP3', 'WAV', 'M4A', 'AAC', 'FLAC', 'OGG', 'OPUS', 'MP4', 'WMA'];
function indexable(t) {
  if (!t.from || t.popular) return true;
  const { from, to } = t;
  switch (t.category) {
    case 'image':
      if (RAW.includes(from)) return ['JPG', 'PNG', 'TIFF'].includes(to);
      if (['JFIF', 'HEIF', 'TGA'].includes(from)) return ['JPG', 'PNG'].includes(to);
      if (['JFIF', 'TGA'].includes(to)) return false;
      return COMMON_IMG.includes(from) && COMMON_IMG.includes(to);
    case 'spreadsheet':
      return to !== 'XLSM' && !(from === 'XLSM' && ['TSV', 'ODS', 'HTML'].includes(to));
    case 'font':
      return true;
    case 'audio':
      if (['MOV', 'WEBM', 'MKV'].includes(from)) return ['MP3', 'WAV', 'M4A'].includes(to);
      if (from === 'AMR') return ['MP3', 'WAV'].includes(to);
      if (to === 'AIFF') return ['WAV', 'FLAC'].includes(from);
      if (from === 'AIFF') return ['MP3', 'WAV', 'FLAC'].includes(to);
      return COMMON_AUD.includes(from) && COMMON_AUD.includes(to);
    default:
      return false;
  }
}
tools.forEach((t) => (t.index = indexable(t)));

// Questions shown on each tool page and sent to search engines as FAQ data.
// Plain text only, so the page and the structured data always say the same thing.
const LOSSY_OUT = ['JPG', 'JFIF', 'WEBP', 'AVIF', 'MP3', 'M4A', 'AAC', 'OGG', 'OPUS'];
function quality(t) {
  const { from, to } = t; const F = label(from), T = label(to);
  if (t.category === 'image') {
    if (['JPG', 'JFIF', 'WEBP', 'AVIF'].includes(to)) return `${T} is a compressed format, so a little detail is dropped. At the default 85% quality most people cannot see any difference; move the slider up for printing.`;
    if (to === 'GIF') return `GIF can only show 256 colours, so photos may look slightly grainy. Graphics and logos usually look the same.`;
    if (to === 'ICO') return `The icon is made at the standard sizes from 16 to 256 pixels, so larger images are scaled down to fit.`;
    if (to === 'SVG') return `The picture is stored exactly, but it stays a pixel image inside the SVG file, so it will blur if you enlarge it a lot.`;
    if (to === 'PDF') return `No. Images go into the PDF at full resolution; photos are stored as high-quality JPEG and graphics with transparency as PNG.`;
    return `No. ${T} is lossless, so the result looks exactly like your ${F}${['JPG', 'JFIF', 'WEBP', 'AVIF', 'HEIC', 'HEIF'].includes(from) ? `, though it cannot restore detail the ${F} compression already removed` : ''}.`;
  }
  if (t.category === 'spreadsheet') {
    if (to === 'CSV' || to === 'TSV') return `Every value is kept exactly, but ${T} is plain text: it cannot store formulas (you get their results), formatting, or more than one sheet per file.`;
    if (to === 'PDF') return `The PDF shows each sheet as a table with the values as you would see them in Excel. Colours and charts are not included.`;
    if (to === 'HTML') return `Every value comes across as a table on a web page. Formulas show their results, and colours and charts are not included.`;
    if (from === 'CSV' || from === 'TSV') return `Every value is kept. Numbers become real numbers, and values with leading zeros such as 00123 stay exactly as written.`;
    return `Values, ${to === 'XLS' ? '' : 'formulas, '}number formats, merged cells and column widths are kept. Colours, fonts, borders and charts are not.`;
  }
  if (t.category === 'font') {
    if (to === 'TTF' && from !== 'TTF') return `Packing and unpacking is lossless. If the ${F} uses PostScript (CFF) outlines, they are redrawn as TrueType curves, a difference too small to see at normal sizes; kerning and ligatures are kept.`;
    return `No. Converting to ${T} is lossless: outlines, kerning, ligatures and language support stay exactly the same.`;
  }
  if (t.category === 'audio') {
    if (LOSSY_OUT.includes(to)) return `${T} is compressed, so some detail is removed. At the recommended setting most people cannot hear a difference; pick a higher bitrate for music you care about.`;
    if (LOSSY_OUT.includes(from)) return `No more quality is lost, but the ${T} cannot sound better than the original ${F}, and it will be a much bigger file.`;
    return `No. ${T} is lossless, so the sound is identical to the original.`;
  }
  return '';
}

function faqs(t) {
  if (t.from) {
    const F = label(t.from), T = label(t.to);
    return [
      { q: `How do I convert ${F} to ${T}?`, a: `Add your ${F} files to the converter at the top of this page, check that ${T} is selected and press Convert. Each file is converted in your browser, usually in a few seconds, and you can then download it, or all files together as a ZIP. Nothing is uploaded.` },
      { q: `Will I lose quality converting ${F} to ${T}?`, a: quality(t) },
      { q: `Is it safe to convert my ${F} files here?`, a: `Yes. The conversion runs inside your browser on your own device and your files are never sent to a server, so nobody else can see them. You can check by switching off your internet after the converter has loaded: it still works.` },
      { q: `Can I convert many ${F} files at once?`, a: `Yes. Add up to 100 files at a time, then download them one by one or all together as a ZIP file.` },
      { q: 'Does it work on my phone?', a: 'Yes, on iPhone, iPad and Android. Very large files take longer on older phones because the phone does the work.' },
    ];
  }
  if (t.action === 'Compress') return [
    { q: 'How do I make an image smaller?', a: 'Add your images, choose a quality level or type a maximum size in KB, and press Compress. Each image is made smaller in your browser and you can download the results one by one or as a ZIP.' },
    { q: 'How much smaller will my image get?', a: 'Photos usually shrink by 50 to 80% at the default quality with no difference you can see. If you need a specific size, for example for an upload form, choose “Target size” and type the limit in KB.' },
    { q: 'How does PNG compression work?', a: 'PNG is lossless, so it is made smaller by reducing the number of colours, the same idea tools like TinyPNG use. Most screenshots and graphics look identical with far fewer colours.' },
    { q: 'Are my images uploaded?', a: 'No. Compression happens in your browser on your own device; your images are never sent to a server.' },
  ];
  return [
    { q: 'How do I resize an image?', a: 'Add your images, type a new width or height in pixels or choose a percentage, and press Resize. The images are resized in your browser and you can download them one by one or as a ZIP.' },
    { q: 'Will my image be stretched?', a: 'No. If you type both a width and a height, the image is scaled to fit inside that box and keeps its shape. Type just one of them and the other is worked out for you.' },
    { q: 'Can I resize many images at once?', a: 'Yes. Every image you add gets the same settings, and you can download them all as a ZIP.' },
    { q: 'Are my images uploaded?', a: 'No. Resizing happens in your browser on your own device; your images are never sent to a server.' },
  ];
}
tools.forEach((t) => (t.faqs = faqs(t)));

module.exports = tools;
