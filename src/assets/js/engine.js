// WrenConvert image engine.
// Everything here runs in the visitor's browser: files are read, converted and
// handed back without any network request. Heavy codecs are loaded on demand.

const VENDOR = '/assets/vendor/';
const libs = {};
const load = (name) => (libs[name] ||= import(`${VENDOR}${name}.js`));

export const MIME = {
  JPG: 'image/jpeg', JFIF: 'image/jpeg', PNG: 'image/png', WEBP: 'image/webp', AVIF: 'image/avif',
  GIF: 'image/gif', BMP: 'image/bmp', TIFF: 'image/tiff', TGA: 'image/x-tga', ICO: 'image/x-icon',
  SVG: 'image/svg+xml', PDF: 'application/pdf',
};
export const EXT = {
  JPG: 'jpg', JFIF: 'jfif', PNG: 'png', WEBP: 'webp', AVIF: 'avif', GIF: 'gif', BMP: 'bmp',
  TIFF: 'tiff', TGA: 'tga', ICO: 'ico', SVG: 'svg', PDF: 'pdf',
};
export const OUTPUTS = Object.keys(EXT);
export const INPUTS = ['AVIF', 'BMP', 'GIF', 'HEIC', 'HEIF', 'ICO', 'JFIF', 'JPG', 'PNG', 'PSD', 'SVG', 'TGA', 'TIFF', 'WEBP',
  'ARW', 'CR2', 'CR3', 'DNG', 'NEF', 'ORF', 'RW2'];
/** Formats that cannot store transparency: transparent pixels are filled with a background colour */
export const NO_ALPHA = new Set(['JPG', 'JFIF', 'BMP', 'PDF']);
export const LOSSY = new Set(['JPG', 'JFIF', 'WEBP', 'AVIF']);
const RAW = new Set(['ARW', 'CR2', 'CR3', 'DNG', 'NEF', 'ORF', 'RW2']);
const EXT_ALIASES = { JPEG: 'JPG', JPE: 'JPG', TIF: 'TIFF', HIF: 'HEIF', ICON: 'ICO' };

export class ConvertError extends Error {}

// ---------------------------------------------------------------- detection

export const extOf = (name) => {
  const e = (name.includes('.') ? name.split('.').pop() : '').toUpperCase();
  return EXT_ALIASES[e] || e;
};

/** Work out the real format from the file's first bytes, falling back to its extension */
export async function sniff(file) {
  const b = new Uint8Array(await file.slice(0, 64).arrayBuffer());
  const ext = extOf(file.name);
  const str = (o, n) => String.fromCharCode(...b.slice(o, o + n));
  if (RAW.has(ext)) return ext; // RAW files often start like TIFF or JPEG; trust the camera extension
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return ext === 'JFIF' ? 'JFIF' : 'JPG';
  if (b[0] === 0x89 && str(1, 3) === 'PNG') return 'PNG';
  if (str(0, 4) === 'GIF8') return 'GIF';
  if (str(0, 4) === 'RIFF' && str(8, 4) === 'WEBP') return 'WEBP';
  if (str(0, 4) === '8BPS') return 'PSD';
  if (str(0, 2) === 'BM') return 'BMP';
  if (b[0] === 0 && b[1] === 0 && b[2] === 1 && b[3] === 0) return 'ICO';
  if (str(0, 4) === 'II*\0' || str(0, 4) === 'MM\0*') return 'TIFF';
  if (str(4, 4) === 'ftyp') {
    const brands = str(8, Math.min(56, b.length - 8));
    if (/avi[fs]/.test(brands)) return 'AVIF';
    if (/crx /.test(brands)) return 'CR3';
    if (/hei[cxms]|hev[cx]|mif1|msf1/.test(brands)) return ext === 'HEIF' ? 'HEIF' : 'HEIC';
  }
  if (/<svg|<\?xml/i.test(str(0, 64))) return 'SVG';
  return INPUTS.includes(ext) ? ext : null;
}

// ---------------------------------------------------------------- decoding

const blobToImg = (blob) => new Promise((resolve, reject) => {
  const url = URL.createObjectURL(blob);
  const img = new Image();
  img.decoding = 'async';
  img.onload = () => { resolve(img); setTimeout(() => URL.revokeObjectURL(url), 1000); };
  img.onerror = () => { URL.revokeObjectURL(url); reject(new ConvertError('This file could not be opened. It may be damaged.')); };
  img.src = url;
});

async function decodeNative(blob, fmt) {
  try {
    return await createImageBitmap(blob, { imageOrientation: 'from-image' });
  } catch (e) {
    try {
      return await blobToImg(blob);
    } catch (e2) {
      if (fmt === 'AVIF') throw new ConvertError('Your browser cannot open AVIF files. Please update it to the latest version.');
      throw e2;
    }
  }
}

function imageDataToCanvas(data, w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  c.getContext('2d').putImageData(new ImageData(data, w, h), 0, 0);
  return c;
}

async function decodeHeic(file) {
  const { heicTo } = await load('heic');
  try {
    return await heicTo({ blob: file, type: 'bitmap' });
  } catch (e) {
    throw new ConvertError('This HEIC file could not be read. It may be damaged or use a variant we do not support yet.');
  }
}

async function decodeTiff(file) {
  const { default: UTIF } = await load('utif');
  const buf = await file.arrayBuffer();
  const ifds = UTIF.decode(buf);
  // Pick the largest image in the file (TIFFs can hold thumbnails and several pages)
  let best = null;
  for (const ifd of ifds) {
    const w = ifd.t256?.[0]; const h = ifd.t257?.[0];
    if (w && h && (!best || w * h > best.w * best.h)) best = { ifd, w, h };
  }
  if (!best) throw new ConvertError('No image found in this TIFF file.');
  UTIF.decodeImage(buf, best.ifd, ifds);
  const rgba = new Uint8ClampedArray(UTIF.toRGBA8(best.ifd));
  return imageDataToCanvas(rgba, best.ifd.width, best.ifd.height);
}

async function decodePsd(file) {
  const { readPsd } = await load('psd');
  let psd;
  try {
    psd = readPsd(await file.arrayBuffer(), { skipLayerImageData: true, skipThumbnail: true, skipLinkedFilesData: true });
  } catch (e) {
    throw new ConvertError('This PSD file could not be read. It may be damaged or saved by an unsupported app.');
  }
  if (!psd.canvas) {
    throw new ConvertError('This PSD has no flattened image inside. Re-save it in Photoshop with “Maximize compatibility” turned on.');
  }
  return psd.canvas;
}

/** Truevision TGA: uncompressed and RLE, colour-mapped, true-colour and greyscale */
async function decodeTga(file) {
  const d = new Uint8Array(await file.arrayBuffer());
  const idLen = d[0], cmapType = d[1], type = d[2];
  const cmapStart = d[3] | (d[4] << 8), cmapLen = d[5] | (d[6] << 8), cmapDepth = d[7];
  const w = d[12] | (d[13] << 8), h = d[14] | (d[15] << 8), bpp = d[16], desc = d[17];
  if (![1, 2, 3, 9, 10, 11].includes(type) || !w || !h) throw new ConvertError('This TGA file could not be read.');
  let p = 18 + idLen;
  const cmapBytes = Math.ceil(cmapDepth / 8);
  const cmap = cmapType ? d.subarray(p, p + cmapLen * cmapBytes) : null;
  p += cmapType ? cmapLen * cmapBytes : 0;
  const alphaBits = desc & 0x0f;
  const px = Math.ceil(bpp / 8);
  const out = new Uint8ClampedArray(w * h * 4);

  const readColour = (src, o, depth, dst, k) => {
    if (depth === 8) { dst[k] = dst[k + 1] = dst[k + 2] = src[o]; dst[k + 3] = 255; }
    else if (depth === 15 || depth === 16) {
      const v = src[o] | (src[o + 1] << 8);
      dst[k] = ((v >> 10) & 31) * 255 / 31; dst[k + 1] = ((v >> 5) & 31) * 255 / 31; dst[k + 2] = (v & 31) * 255 / 31;
      dst[k + 3] = depth === 16 && alphaBits ? (v & 0x8000 ? 255 : 0) : 255;
    } else {
      dst[k] = src[o + 2]; dst[k + 1] = src[o + 1]; dst[k + 2] = src[o];
      dst[k + 3] = depth === 32 && alphaBits ? src[o + 3] : 255;
    }
  };
  const put = (i, o) => {
    const k = i * 4;
    if (type === 1 || type === 9) {
      const idx = (px === 2 ? d[o] | (d[o + 1] << 8) : d[o]) - cmapStart;
      readColour(cmap, idx * cmapBytes, cmapDepth, out, k);
    } else readColour(d, o, type === 3 || type === 11 ? 8 : bpp, out, k);
  };

  const n = w * h;
  if (type < 9) {
    for (let i = 0; i < n; i++, p += px) put(i, p);
  } else {
    let i = 0;
    while (i < n && p < d.length) {
      const hdr = d[p++];
      const count = (hdr & 0x7f) + 1;
      if (hdr & 0x80) { for (let j = 0; j < count && i < n; j++) put(i++, p); p += px; }
      else { for (let j = 0; j < count && i < n; j++, p += px) put(i++, p); }
    }
  }
  // Bottom-left origin (the default) means rows are stored upside down
  if (!(desc & 0x20)) {
    const row = w * 4, tmp = new Uint8ClampedArray(row);
    for (let y = 0; y < h >> 1; y++) {
      const a = y * row, b = (h - 1 - y) * row;
      tmp.set(out.subarray(a, a + row)); out.copyWithin(a, b, b + row); out.set(tmp, b);
    }
  }
  return imageDataToCanvas(out, w, h);
}

/** Find the end of a JPEG that starts at `s`, or -1 */
function jpegEnd(d, s) {
  let p = s + 2;
  while (p + 1 < d.length) {
    if (d[p] !== 0xff) return -1;
    const m = d[p + 1];
    if (m === 0xff) { p++; continue; }
    if (m === 0xd9) return p + 2;
    if ((m >= 0xd0 && m <= 0xd7) || m === 0x01) { p += 2; continue; }
    if (p + 3 >= d.length) return -1;
    const len = (d[p + 2] << 8) | d[p + 3];
    if (len < 2) return -1;
    p += 2 + len;
    if (m === 0xda) {
      // Entropy-coded data: runs until a marker that is not a stuffed byte or restart marker
      while (p + 1 < d.length) {
        if (d[p] === 0xff && d[p + 1] !== 0 && !(d[p + 1] >= 0xd0 && d[p + 1] <= 0xd7)) break;
        p++;
      }
    }
  }
  return -1;
}

/** Camera RAW: use the full-size JPEG preview the camera stores inside the file */
async function decodeRaw(file, fmt) {
  const d = new Uint8Array(await file.arrayBuffer());
  const found = [];
  for (let i = 0; i < d.length - 3; i++) {
    if (d[i] === 0xff && d[i + 1] === 0xd8 && d[i + 2] === 0xff) {
      const e = jpegEnd(d, i);
      if (e > 0) { found.push([i, e]); i = e - 1; }
    }
  }
  found.sort((a, b) => (b[1] - b[0]) - (a[1] - a[0]));
  for (const [s, e] of found.slice(0, 3)) {
    try {
      const bmp = await createImageBitmap(new Blob([d.subarray(s, e)], { type: 'image/jpeg' }), { imageOrientation: 'from-image' });
      if (bmp.width >= 320) return bmp;
    } catch (err) { /* lossless or damaged preview: try the next one */ }
  }
  throw new ConvertError(`This ${fmt} file has no usable preview image inside, so it cannot be converted in the browser yet.`);
}

async function decodeSvg(file) {
  const text = await file.text();
  const img = await blobToImg(new Blob([text], { type: 'image/svg+xml' }));
  let w = img.naturalWidth, h = img.naturalHeight;
  if (!w || !h) {
    const vb = text.match(/viewBox\s*=\s*["']\s*[-\d.]+[\s,]+[-\d.]+[\s,]+([\d.]+)[\s,]+([\d.]+)/i);
    const ratio = vb ? vb[2] / vb[1] : 1;
    w = 1024; h = Math.round(1024 * ratio);
  }
  return { img, width: w, height: h, vector: true };
}

/**
 * Decode any supported file into something drawable.
 * Returns { src, width, height, format, vector?, close() }
 */
export async function decode(file) {
  const fmt = await sniff(file);
  if (!fmt) throw new ConvertError('This file type is not supported. Try JPG, PNG, HEIC, WebP, TIFF and similar image files.');
  let src;
  switch (fmt) {
    case 'HEIC': case 'HEIF': src = await decodeHeic(file); break;
    case 'TIFF': src = await decodeTiff(file); break;
    case 'PSD': src = await decodePsd(file); break;
    case 'TGA': src = await decodeTga(file); break;
    case 'SVG': {
      const s = await decodeSvg(file);
      return { src: s.img, width: s.width, height: s.height, format: fmt, vector: true, close() {} };
    }
    default:
      src = RAW.has(fmt) ? await decodeRaw(file, fmt) : await decodeNative(file, fmt);
  }
  return {
    src, format: fmt,
    width: src.width || src.naturalWidth,
    height: src.height || src.naturalHeight,
    close() { src.close?.(); },
  };
}

// ---------------------------------------------------------------- drawing

/** Fit a requested size: { width, height, percent, fit: 'keep' | 'stretch' } */
export function targetSize(w, h, o = {}) {
  if (o.percent) return [Math.max(1, Math.round(w * o.percent / 100)), Math.max(1, Math.round(h * o.percent / 100))];
  const W = +o.width || 0, H = +o.height || 0;
  if (!W && !H) return [w, h];
  if (o.fit === 'stretch' && W && H) return [W, H];
  if (W && H) { const s = Math.min(W / w, H / h); return [Math.max(1, Math.round(w * s)), Math.max(1, Math.round(h * s))]; }
  if (W) return [W, Math.max(1, Math.round(h * W / w))];
  return [Math.max(1, Math.round(w * H / h)), H];
}

const MAX_PIXELS = 268e6; // browsers refuse canvases much larger than this

function draw(img, w, h, background) {
  if (w * h > MAX_PIXELS) throw new ConvertError('This image is too large for the browser to process. Try making it smaller first.');
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const ctx = c.getContext('2d', { willReadFrequently: false });
  if (background) { ctx.fillStyle = background; ctx.fillRect(0, 0, w, h); }
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  // Large downscales look sharper when done in halving steps
  let source = img.src, sw = img.width, sh = img.height;
  while (!img.vector && sw / 2 >= w && sh / 2 >= h && sw > 2) {
    const step = document.createElement('canvas');
    step.width = Math.round(sw / 2); step.height = Math.round(sh / 2);
    const sctx = step.getContext('2d');
    sctx.imageSmoothingQuality = 'high';
    sctx.drawImage(source, 0, 0, step.width, step.height);
    source = step; sw = step.width; sh = step.height;
  }
  ctx.drawImage(source, 0, 0, w, h);
  return c;
}

const pixels = (c) => c.getContext('2d').getImageData(0, 0, c.width, c.height);
const hasTransparency = (data) => { for (let i = 3; i < data.length; i += 4) if (data[i] < 255) return true; return false; };

// ---------------------------------------------------------------- encoding

const canvasBlob = (c, type, q) => new Promise((resolve, reject) =>
  c.toBlob((b) => (b ? resolve(b) : reject(new ConvertError('The browser could not save this image.'))), type, q));

async function encodeWebp(c, q) {
  const b = await canvasBlob(c, 'image/webp', q);
  if (b.type === 'image/webp') return b;
  // Safari cannot write WebP from a canvas: use the WebAssembly encoder instead
  const { default: enc } = await load('webp');
  return new Blob([await enc(pixels(c), { quality: Math.round(q * 100) })], { type: MIME.WEBP });
}

async function encodeAvif(c, q) {
  const b = await canvasBlob(c, 'image/avif', q).catch(() => null);
  if (b?.type === 'image/avif') return b;
  const { default: enc } = await load('avif');
  // AVIF quality numbers run lower than JPEG for the same look
  const quality = Math.max(1, Math.min(100, Math.round(q * 100 - 15)));
  return new Blob([await enc(pixels(c), { quality, speed: 7 })], { type: MIME.AVIF });
}

function encodeBmp(c) {
  const { data, width: w, height: h } = pixels(c);
  const row = (w * 3 + 3) & ~3;
  const size = 54 + row * h;
  const buf = new ArrayBuffer(size), v = new DataView(buf), u = new Uint8Array(buf);
  v.setUint16(0, 0x424d); v.setUint32(2, size, true); v.setUint32(10, 54, true);
  v.setUint32(14, 40, true); v.setInt32(18, w, true); v.setInt32(22, h, true);
  v.setUint16(26, 1, true); v.setUint16(28, 24, true); v.setUint32(34, row * h, true);
  v.setInt32(38, 2835, true); v.setInt32(42, 2835, true);
  for (let y = 0; y < h; y++) {
    let o = 54 + (h - 1 - y) * row, i = y * w * 4;
    for (let x = 0; x < w; x++, i += 4) { u[o++] = data[i + 2]; u[o++] = data[i + 1]; u[o++] = data[i]; }
  }
  return new Blob([buf], { type: MIME.BMP });
}

function encodeTga(c) {
  const { data, width: w, height: h } = pixels(c);
  const u = new Uint8Array(18 + w * h * 4);
  u[2] = 2; u[12] = w & 255; u[13] = w >> 8; u[14] = h & 255; u[15] = h >> 8; u[16] = 32; u[17] = 0x28;
  for (let i = 0, o = 18; i < data.length; i += 4) { u[o++] = data[i + 2]; u[o++] = data[i + 1]; u[o++] = data[i]; u[o++] = data[i + 3]; }
  return new Blob([u], { type: MIME.TGA });
}

async function encodeTiff(c) {
  const { default: UTIF } = await load('utif');
  const { data, width, height } = pixels(c);
  return new Blob([UTIF.encodeImage(data.buffer, width, height)], { type: MIME.TIFF });
}

async function encodeGif(c) {
  const { GIFEncoder, quantize, applyPalette } = await load('gif');
  const { data, width, height } = pixels(c);
  const alpha = hasTransparency(data);
  const palette = quantize(data, 256, alpha ? { format: 'rgba4444', oneBitAlpha: true } : { format: 'rgb565' });
  const index = applyPalette(data, palette, alpha ? 'rgba4444' : 'rgb565');
  const gif = GIFEncoder();
  const transparentIndex = alpha ? palette.findIndex((p) => p[3] === 0) : -1;
  gif.writeFrame(index, width, height, { palette, transparent: transparentIndex >= 0, transparentIndex: Math.max(0, transparentIndex) });
  gif.finish();
  return new Blob([gif.bytes()], { type: MIME.GIF });
}

/** ICO with PNG images at the standard icon sizes (up to 256 px) */
async function encodeIco(img) {
  const longest = Math.max(img.width, img.height);
  let sizes = [16, 24, 32, 48, 64, 128, 256].filter((s) => s <= Math.max(longest, 16));
  const pngs = [];
  for (const s of sizes) {
    const c = document.createElement('canvas');
    c.width = c.height = s;
    const ctx = c.getContext('2d');
    ctx.imageSmoothingQuality = 'high';
    const k = s / longest, w = Math.round(img.width * k), h = Math.round(img.height * k);
    const scaled = draw(img, Math.max(1, w), Math.max(1, h));
    ctx.drawImage(scaled, (s - scaled.width) >> 1, (s - scaled.height) >> 1);
    pngs.push(new Uint8Array(await (await canvasBlob(c, 'image/png')).arrayBuffer()));
  }
  const head = 6 + 16 * sizes.length;
  const total = head + pngs.reduce((a, p) => a + p.length, 0);
  const u = new Uint8Array(total), v = new DataView(u.buffer);
  v.setUint16(2, 1, true); v.setUint16(4, sizes.length, true);
  let off = head;
  sizes.forEach((s, i) => {
    const e = 6 + i * 16;
    u[e] = s === 256 ? 0 : s; u[e + 1] = s === 256 ? 0 : s;
    v.setUint16(e + 4, 1, true); v.setUint16(e + 6, 32, true);
    v.setUint32(e + 8, pngs[i].length, true); v.setUint32(e + 12, off, true);
    u.set(pngs[i], off); off += pngs[i].length;
  });
  return new Blob([u], { type: MIME.ICO });
}

async function encodeSvg(c) {
  const png = await canvasBlob(c, 'image/png');
  const b64 = await new Promise((r) => { const fr = new FileReader(); fr.onload = () => r(fr.result); fr.readAsDataURL(png); });
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${c.width}" height="${c.height}" viewBox="0 0 ${c.width} ${c.height}"><image width="${c.width}" height="${c.height}" xlink:href="${b64}" href="${b64}"/></svg>`;
  return new Blob([svg], { type: MIME.SVG });
}

// ---------------------------------------------------------------- PNG optimiser

let crcTable;
function crc32(bytes, start, end) {
  if (!crcTable) {
    crcTable = new Uint32Array(256);
    for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; crcTable[n] = c >>> 0; }
  }
  let c = 0xffffffff;
  for (let i = start; i < end; i++) c = crcTable[(c ^ bytes[i]) & 255] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/** Lossy PNG compression: reduce to a palette of `colors` and write an indexed PNG */
async function encodePngQuantized(c, colors) {
  const [{ quantize, applyPalette }, { deflate }] = await Promise.all([load('gif'), load('pako')]);
  const { data, width: w, height: h } = pixels(c);
  const palette = quantize(data, colors, { format: 'rgba4444' });
  const index = applyPalette(data, palette, 'rgba4444');
  const raw = new Uint8Array((w + 1) * h);
  for (let y = 0; y < h; y++) raw.set(index.subarray(y * w, y * w + w), y * (w + 1) + 1);
  const idat = deflate(raw, { level: 9 });
  const alpha = palette.some((p) => (p[3] ?? 255) < 255);
  const chunks = [];
  const chunk = (type, body) => {
    const u = new Uint8Array(12 + body.length), v = new DataView(u.buffer);
    v.setUint32(0, body.length);
    for (let i = 0; i < 4; i++) u[4 + i] = type.charCodeAt(i);
    u.set(body, 8);
    v.setUint32(8 + body.length, crc32(u, 4, 8 + body.length));
    chunks.push(u);
  };
  const ihdr = new Uint8Array(13), iv = new DataView(ihdr.buffer);
  iv.setUint32(0, w); iv.setUint32(4, h); ihdr[8] = 8; ihdr[9] = 3;
  chunk('IHDR', ihdr);
  chunk('PLTE', Uint8Array.from(palette.flatMap((p) => [p[0], p[1], p[2]])));
  if (alpha) chunk('tRNS', Uint8Array.from(palette.map((p) => p[3] ?? 255)));
  chunk('IDAT', idat);
  chunk('IEND', new Uint8Array(0));
  return new Blob([new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]), ...chunks], { type: MIME.PNG });
}

// ---------------------------------------------------------------- public API

/**
 * Encode a decoded image to a target format.
 * opts: { quality 0..1, background '#fff', width, height, percent, fit }
 */
export async function encode(img, target, opts = {}) {
  const q = opts.quality ?? 0.85;
  const [w, h] = targetSize(img.width, img.height, opts);
  if (target === 'ICO') return encodeIco(w === img.width && h === img.height ? img : { ...img, src: draw(img, w, h), width: w, height: h });
  const bg = NO_ALPHA.has(target) ? (opts.background || '#ffffff') : null;
  const c = draw(img, w, h, bg);
  switch (target) {
    case 'JPG': case 'JFIF': return canvasBlob(c, 'image/jpeg', q);
    case 'PNG': return canvasBlob(c, 'image/png');
    case 'WEBP': return encodeWebp(c, q);
    case 'AVIF': return encodeAvif(c, q);
    case 'GIF': return encodeGif(c);
    case 'BMP': return encodeBmp(c);
    case 'TGA': return encodeTga(c);
    case 'TIFF': return encodeTiff(c);
    case 'SVG': return encodeSvg(c);
    default: throw new ConvertError(`Saving as ${target} is not supported yet.`);
  }
}

export const outName = (name, target) => `${name.replace(/\.[^.]+$/, '') || 'image'}.${EXT[target]}`;

/** Convert one file. Returns { blob, name, width, height } */
export async function convert(file, target, opts = {}) {
  const img = await decode(file);
  try {
    const blob = await encode(img, target, opts);
    const [width, height] = targetSize(img.width, img.height, opts);
    return { blob, name: outName(file.name, target), width, height };
  } finally { img.close(); }
}

const PAGE = { A4: [595.28, 841.89], LETTER: [612, 792] };

/**
 * Put images into PDF pages. files: File[]; opts: { page: 'fit'|'A4'|'LETTER', margin, merge, quality }
 * Returns [{ blob, name }]
 */
export async function toPdf(files, opts = {}, onEach = () => {}) {
  const { PDFDocument } = await load('pdf');
  const results = [];
  let doc = null;
  const finish = async (name) => results.push({ blob: new Blob([await doc.save()], { type: MIME.PDF }), name });
  for (let i = 0; i < files.length; i++) {
    const f = files[i];
    if (!doc || !opts.merge) doc = await PDFDocument.create();
    try {
      const img = await decode(f);
      const [w, h] = targetSize(img.width, img.height, opts);
      const c = draw(img, w, h);
      const alpha = hasTransparency(pixels(c).data);
      img.close();
      const bytes = new Uint8Array(await (alpha ? canvasBlob(c, 'image/png') : canvasBlob(c, 'image/jpeg', opts.quality ?? 0.92)).then((b) => b.arrayBuffer()));
      const embedded = alpha ? await doc.embedPng(bytes) : await doc.embedJpg(bytes);
      let pw = w * 0.75, ph = h * 0.75, dx = 0, dy = 0, dw = pw, dh = ph;
      if (PAGE[opts.page]) {
        [pw, ph] = PAGE[opts.page];
        if (w > h) [pw, ph] = [ph, pw];
        const m = opts.margin ?? 36;
        const s = Math.min((pw - 2 * m) / dw, (ph - 2 * m) / dh, 1);
        dw *= s; dh *= s; dx = (pw - dw) / 2; dy = (ph - dh) / 2;
      }
      doc.addPage([pw, ph]).drawImage(embedded, { x: dx, y: dy, width: dw, height: dh });
      onEach(i, null);
    } catch (e) {
      onEach(i, e);
    }
    if (!opts.merge && doc.getPageCount()) await finish(outName(f.name, 'PDF'));
  }
  if (opts.merge && doc?.getPageCount()) await finish(files.length === 1 ? outName(files[0].name, 'PDF') : 'images.pdf');
  return results;
}

/**
 * Make an image smaller. opts: { quality 0..1, targetKB, format }
 * JPG/WebP/AVIF re-encode at lower quality (searching for a size if targetKB is set);
 * PNG is reduced to a smaller colour palette.
 */
export async function compress(file, opts = {}) {
  const img = await decode(file);
  try {
    let fmt = opts.format || img.format;
    if (fmt === 'JFIF') fmt = 'JPG';
    if (!['JPG', 'PNG', 'WEBP', 'AVIF'].includes(fmt)) fmt = 'JPG';
    const name = outName(file.name, fmt);
    let w = img.width, h = img.height;
    const make = async (q, scale = 1) => {
      const sw = Math.max(1, Math.round(w * scale)), sh = Math.max(1, Math.round(h * scale));
      const c = draw(img, sw, sh, fmt === 'JPG' ? (opts.background || '#ffffff') : null);
      if (fmt === 'PNG') return encodePngQuantized(c, Math.max(8, Math.round(256 * Math.pow(q, 2))));
      return fmt === 'JPG' ? canvasBlob(c, 'image/jpeg', q) : fmt === 'WEBP' ? encodeWebp(c, q) : encodeAvif(c, q);
    };
    let blob;
    if (opts.targetKB) {
      const limit = opts.targetKB * 1024;
      let scale = 1;
      for (let attempt = 0; attempt < 8 && !blob; attempt++) {
        // Binary search the highest quality that fits
        let lo = 0.05, hi = 0.95, best = null;
        const first = await make(lo, scale);
        if (first.size <= limit) {
          best = first;
          for (let k = 0; k < 7; k++) {
            const mid = (lo + hi) / 2;
            const b = await make(mid, scale);
            if (b.size <= limit) { best = b; lo = mid; } else hi = mid;
          }
          blob = best;
        } else scale *= 0.8; // even the lowest quality is too big: shrink the image a little and retry
      }
      if (!blob) throw new ConvertError(`Could not get this image under ${opts.targetKB} KB.`);
      w = Math.round(w * scale); h = Math.round(h * scale);
    } else {
      blob = await make(opts.quality ?? 0.75);
    }
    // Never hand back a bigger file than the one we were given, in the same format
    const same = extOf(file.name) === fmt || (fmt === 'JPG' && ['JPEG', 'JFIF'].includes(extOf(file.name)));
    if (same && blob.size >= file.size && !opts.targetKB) return { blob: file, name: file.name, width: img.width, height: img.height, unchanged: true };
    return { blob, name, width: w, height: h };
  } finally { img.close(); }
}

/** Resize an image, keeping its format where the browser can write it */
export async function resize(file, opts = {}) {
  const img = await decode(file);
  try {
    let fmt = opts.format || img.format;
    if (!OUTPUTS.includes(fmt) || fmt === 'PDF') fmt = NO_ALPHA.has(fmt) || ['HEIC', 'HEIF'].includes(fmt) || RAW.has(fmt) ? 'JPG' : 'PNG';
    const blob = await encode(img, fmt, { ...opts, quality: opts.quality ?? 0.9 });
    const [width, height] = targetSize(img.width, img.height, opts);
    return { blob, name: outName(file.name, fmt), width, height };
  } finally { img.close(); }
}

/** Start downloading the code needed for a format before it is used */
export function preload(fmt) {
  const need = { HEIC: 'heic', HEIF: 'heic', TIFF: 'utif', PSD: 'psd', GIF: 'gif', PDF: 'pdf', AVIF: null }[fmt];
  if (need) load(need).catch(() => {});
}

export async function zip(results) {
  const { default: JSZip } = await load('zip');
  const z = new JSZip();
  const used = new Set();
  for (const r of results) {
    let n = r.name, k = 1;
    while (used.has(n.toLowerCase())) n = r.name.replace(/(\.[^.]+)?$/, ` (${k++})$1`);
    used.add(n.toLowerCase());
    z.file(n, r.blob);
  }
  return z.generateAsync({ type: 'blob', compression: 'STORE' });
}
