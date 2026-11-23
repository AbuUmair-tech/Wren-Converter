// WrenConvert font engine. Runs in the browser; nothing is uploaded.
//
// Every font is first unpacked to a plain OpenType (sfnt) font, then packed
// into the target format. Packing is lossless (WOFF, WOFF2, OTF container);
// the only real conversion is CFF (PostScript) outlines to TrueType outlines
// for TTF output, where all other tables are copied across unchanged.
import { ConvertError, zip } from './engine.js';

export { ConvertError, zip };

const libs = {};
const load = (name) => (libs[name] ||= import(`/assets/vendor/${name}.js`));
let woff2Ready;
const woff2 = () => (woff2Ready ||= load('fonts').then(async (m) => { await m.woff2.init('/assets/vendor/woff2.wasm'); return m.woff2; }));

export const MIME = { TTF: 'font/ttf', OTF: 'font/otf', WOFF: 'font/woff', WOFF2: 'font/woff2' };
const EXT = { TTF: 'ttf', OTF: 'otf', WOFF: 'woff', WOFF2: 'woff2' };
export const INPUTS = ['TTF', 'OTF', 'WOFF', 'WOFF2', 'EOT'];
export const OUTPUTS = Object.keys(EXT);

const extOf = (name) => (name.includes('.') ? name.split('.').pop() : '').toUpperCase();
const tag = (u, o) => String.fromCharCode(u[o], u[o + 1], u[o + 2], u[o + 3]);
const u16 = (u, o) => (u[o] << 8) | u[o + 1];
const u32 = (u, o) => ((u[o] << 24) | (u[o + 1] << 16) | (u[o + 2] << 8) | u[o + 3]) >>> 0;
const le32 = (u, o) => (u[o] | (u[o + 1] << 8) | (u[o + 2] << 16) | (u[o + 3] << 24)) >>> 0;
const pad4 = (n) => (n + 3) & ~3;

export async function sniff(file) {
  const u = new Uint8Array(await file.slice(0, 40).arrayBuffer());
  const t = tag(u, 0);
  if (t === 'wOFF') return 'WOFF';
  if (t === 'wOF2') return 'WOFF2';
  if (t === 'OTTO') return 'OTF';
  if (t === 'true' || u32(u, 0) === 0x00010000) return extOf(file.name) === 'OTF' ? 'OTF' : 'TTF';
  if (t === 'ttcf') return 'TTC';
  if (u[34] === 0x4c && u[35] === 0x50) return 'EOT';
  const e = extOf(file.name);
  return INPUTS.includes(e) ? e : null;
}

// ---------------------------------------------------------------- sfnt read / write

const FLAVORS = new Set([0x00010000, 0x4f54544f /* OTTO */, 0x74727565 /* true */]);

function readSfnt(u) {
  if (u.length < 12) throw new ConvertError('This font could not be read. It may be damaged.');
  const flavor = u32(u, 0), n = u16(u, 4);
  if (!FLAVORS.has(flavor) || !n || n > 200 || 12 + n * 16 > u.length) throw new ConvertError('This file is not a valid font. It may be damaged or not really a font.');
  const tables = [];
  for (let i = 0; i < n; i++) {
    const d = 12 + i * 16;
    const off = u32(u, d + 8), len = u32(u, d + 12);
    if (off + len > u.length) throw new ConvertError('This font file is damaged: a table runs past the end of the file.');
    tables.push({ tag: tag(u, d), data: u.subarray(off, off + len) });
  }
  return { flavor, tables };
}

function checksum(u) {
  let sum = 0;
  const n = u.length;
  for (let i = 0; i < n; i += 4) {
    sum = (sum + (((u[i] << 24) | ((u[i + 1] || 0) << 16) | ((u[i + 2] || 0) << 8) | (u[i + 3] || 0)) >>> 0)) >>> 0;
  }
  return sum;
}

/** Assemble a standards-compliant sfnt: sorted directory, 4-byte alignment, checksums, head adjustment */
function writeSfnt(flavor, tables) {
  tables = tables.slice().sort((a, b) => (a.tag < b.tag ? -1 : 1));
  const n = tables.length;
  let entry = 1, pow = 0;
  while (entry * 2 <= n) { entry *= 2; pow++; }
  const headerLen = 12 + 16 * n;
  const total = headerLen + tables.reduce((a, t) => a + pad4(t.data.length), 0);
  const out = new Uint8Array(total), v = new DataView(out.buffer);
  v.setUint32(0, flavor); v.setUint16(4, n); v.setUint16(6, entry * 16); v.setUint16(8, pow); v.setUint16(10, n * 16 - entry * 16);
  let off = headerLen, headOff = -1;
  tables.forEach((t, i) => {
    let data = t.data;
    if (t.tag === 'head') { data = data.slice(); data.fill(0, 8, 12); headOff = off; }
    const d = 12 + i * 16;
    for (let k = 0; k < 4; k++) out[d + k] = t.tag.charCodeAt(k);
    v.setUint32(d + 4, checksum(data)); v.setUint32(d + 8, off); v.setUint32(d + 12, data.length);
    out.set(data, off);
    off += pad4(data.length);
  });
  if (headOff >= 0) v.setUint32(headOff + 8, (0xb1b0afba - checksum(out)) >>> 0);
  return out;
}

// ---------------------------------------------------------------- WOFF 1.0

async function decodeWoff(u) {
  const { inflate } = await load('pako');
  const flavor = u32(u, 4), n = u16(u, 12);
  const tables = [];
  for (let i = 0; i < n; i++) {
    const d = 44 + i * 20;
    const off = u32(u, d + 4), comp = u32(u, d + 8), orig = u32(u, d + 12);
    const raw = u.subarray(off, off + comp);
    tables.push({ tag: tag(u, d), data: comp < orig ? inflate(raw) : raw });
  }
  return writeSfnt(flavor, tables);
}

async function encodeWoff(sfnt) {
  const { deflate } = await load('pako');
  const { flavor, tables } = readSfnt(sfnt);
  tables.sort((a, b) => (a.tag < b.tag ? -1 : 1));
  const n = tables.length;
  const packed = tables.map((t) => {
    const z = deflate(t.data, { level: 9 });
    return { ...t, out: z.length < t.data.length ? z : t.data, checksum: checksum(t.data) };
  });
  const headerLen = 44 + 20 * n;
  const total = headerLen + packed.reduce((a, t) => a + pad4(t.out.length), 0);
  const sfntSize = 12 + 16 * n + tables.reduce((a, t) => a + pad4(t.data.length), 0);
  const out = new Uint8Array(total), v = new DataView(out.buffer);
  out.set([0x77, 0x4f, 0x46, 0x46]); // wOFF
  v.setUint32(4, flavor); v.setUint32(8, total); v.setUint16(12, n); v.setUint32(16, sfntSize); v.setUint16(20, 1);
  let off = headerLen;
  packed.forEach((t, i) => {
    const d = 44 + i * 20;
    for (let k = 0; k < 4; k++) out[d + k] = t.tag.charCodeAt(k);
    v.setUint32(d + 4, off); v.setUint32(d + 8, t.out.length); v.setUint32(d + 12, t.data.length); v.setUint32(d + 16, t.checksum);
    out.set(t.out, off);
    off += pad4(t.out.length);
  });
  return out;
}

// ---------------------------------------------------------------- EOT (read only)

function decodeEot(u) {
  const eotSize = le32(u, 0), dataSize = le32(u, 4), flags = le32(u, 12);
  if (flags & 0x4) throw new ConvertError('This EOT font uses MicroType Express compression, which cannot be unpacked in the browser yet.');
  const start = Math.min(eotSize, u.length) - dataSize;
  if (start < 36) throw new ConvertError('This EOT file is damaged.');
  const data = u.slice(start, start + dataSize);
  if (flags & 0x10000000) for (let i = 0; i < data.length; i++) data[i] ^= 0x50;
  return data;
}

// ---------------------------------------------------------------- outlines

const isCff = (sfnt) => tag(sfnt, 0) === 'OTTO';

/**
 * CFF (PostScript) outlines -> TrueType outlines. The glyph shapes are rebuilt as
 * quadratic curves; every other table (names, cmap, GSUB ligatures and shaping,
 * GPOS kerning, OS/2 metrics) is copied over unchanged.
 */
async function cffToTrueType(sfnt) {
  const font = readSfnt(sfnt);
  const has = (t) => font.tables.some((x) => x.tag === t);
  if (has('CFF2')) throw new ConvertError('This is a variable OTF font (CFF2). Converting it to TTF is not supported yet; WOFF and WOFF2 work.');
  const { otf2ttfobject, TTFWriter } = await load('fonts');
  let rebuilt;
  try {
    const obj = otf2ttfobject(sfnt.slice().buffer);
    rebuilt = readSfnt(new Uint8Array(new TTFWriter({ hinting: false, kerning: false }).write(obj)));
  } catch (e) {
    throw new ConvertError('The outlines in this OTF font could not be converted to TrueType.');
  }
  const get = (f, t) => f.tables.find((x) => x.tag === t)?.data;
  const origMaxp = get(font, 'maxp'), newMaxp = get(rebuilt, 'maxp');
  if (!newMaxp || !get(rebuilt, 'glyf') || u16(origMaxp, 4) !== u16(newMaxp, 4)) {
    throw new ConvertError('The outlines in this OTF font could not be converted to TrueType without changing the glyphs.');
  }
  // Original head, with the bounding box and loca format of the new outlines
  const head = get(font, 'head').slice(), nh = get(rebuilt, 'head');
  head.set(nh.subarray(36, 44), 36);
  head.set(nh.subarray(50, 52), 50);
  const drop = new Set(['CFF ', 'CFF2', 'VORG', 'DSIG', 'head', 'maxp']);
  const tables = font.tables.filter((t) => !drop.has(t.tag))
    .concat([{ tag: 'head', data: head }, { tag: 'maxp', data: newMaxp }, { tag: 'glyf', data: get(rebuilt, 'glyf') }, { tag: 'loca', data: get(rebuilt, 'loca') }]);
  return writeSfnt(0x00010000, tables);
}

// ---------------------------------------------------------------- names

/** Family and style from the name table, for showing in the file list */
export function describe(sfnt) {
  try {
    const name = readSfnt(sfnt).tables.find((t) => t.tag === 'name')?.data;
    if (!name) return {};
    const count = u16(name, 2), strOff = u16(name, 4);
    const found = {};
    for (let i = 0; i < count; i++) {
      const r = 6 + i * 12;
      const platform = u16(name, r), enc = u16(name, r + 2), lang = u16(name, r + 4), id = u16(name, r + 6);
      const len = u16(name, r + 8), off = strOff + u16(name, r + 10);
      if (![1, 2, 4, 16, 17].includes(id)) continue;
      const bytes = name.subarray(off, off + len);
      let s = null;
      if (platform === 3 && (enc === 1 || enc === 10) && (lang === 0x409 || !found[id])) {
        s = ''; for (let k = 0; k + 1 < bytes.length; k += 2) s += String.fromCharCode((bytes[k] << 8) | bytes[k + 1]);
      } else if (platform === 1 && enc === 0 && !found[id]) {
        s = String.fromCharCode(...bytes);
      }
      if (s) found[id] = s;
    }
    return { family: found[16] || found[1], style: found[17] || found[2], full: found[4] };
  } catch (e) { return {}; }
}

// ---------------------------------------------------------------- public API

/** Unpack any supported font to a plain sfnt (TTF or CFF-flavoured OTF) */
export async function toSfnt(file) {
  const fmt = await sniff(file);
  if (fmt === 'TTC') throw new ConvertError('This is a font collection (TTC) with several fonts inside. Collections are not supported yet.');
  if (!fmt) throw new ConvertError('This file type is not supported. Try TTF, OTF, WOFF, WOFF2 or EOT fonts.');
  const u = new Uint8Array(await file.arrayBuffer());
  try {
    if (fmt === 'WOFF') return await decodeWoff(u);
    if (fmt === 'WOFF2') return (await woff2()).decode(u);
    if (fmt === 'EOT') return decodeEot(u);
    // Validate the table directory and the tables every usable font needs
    const tags = new Set(readSfnt(u).tables.map((t) => t.tag));
    if (!tags.has('head') || !tags.has('cmap') || !(tags.has('glyf') || tags.has('CFF ') || tags.has('CFF2'))) {
      throw new ConvertError('This font is missing required parts and cannot be converted.');
    }
    return u;
  } catch (e) {
    if (e instanceof ConvertError) throw e;
    throw new ConvertError('This font could not be read. It may be damaged.');
  }
}

export async function convert(file, target) {
  let sfnt = await toSfnt(file);
  const info = describe(sfnt);
  let out;
  switch (target) {
    case 'TTF': out = isCff(sfnt) ? await cffToTrueType(sfnt) : sfnt; break;
    case 'OTF': out = sfnt; break; // OpenType holds TrueType or CFF outlines; both are kept exactly
    case 'WOFF': out = await encodeWoff(sfnt); break;
    case 'WOFF2':
      try { out = (await woff2()).encode(sfnt); } catch (e) { throw new ConvertError('This font could not be compressed to WOFF2.'); }
      if (!out?.length) throw new ConvertError('This font could not be compressed to WOFF2.');
      break;
    default: throw new ConvertError(`Saving as ${target} is not supported yet.`);
  }
  const base = file.name.replace(/\.[^.]+$/, '') || 'font';
  return { blob: new Blob([out], { type: MIME[target] }), name: `${base}.${EXT[target]}`, font: [info.family, info.style].filter(Boolean).join(' ') };
}

export function preload(fmt) {
  if (fmt === 'WOFF2') woff2().catch(() => {});
  else load('pako').catch(() => {});
}
