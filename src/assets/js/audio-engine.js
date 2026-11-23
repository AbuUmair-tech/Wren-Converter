// WrenConvert audio engine: FFmpeg compiled to WebAssembly, running in a worker
// inside the visitor's browser. Files are never uploaded.
import { ConvertError, zip } from './engine.js';

export { ConvertError, zip };

const BASE = `${location.origin}/assets/vendor/ffmpeg/`;
export const OUTPUTS = ['MP3', 'WAV', 'M4A', 'AAC', 'FLAC', 'OGG', 'OPUS', 'AIFF'];
const EXT = { MP3: 'mp3', WAV: 'wav', M4A: 'm4a', AAC: 'aac', FLAC: 'flac', OGG: 'ogg', OPUS: 'opus', AIFF: 'aiff' };
const MIME = {
  MP3: 'audio/mpeg', WAV: 'audio/wav', M4A: 'audio/mp4', AAC: 'audio/aac', FLAC: 'audio/flac',
  OGG: 'audio/ogg', OPUS: 'audio/ogg', AIFF: 'audio/aiff',
};
export const LOSSY = new Set(['MP3', 'M4A', 'AAC', 'OGG', 'OPUS']);
const MAX_BYTES = 1.5e9; // the whole file has to fit in the browser's memory

let ffmpegPromise = null;
let loaded = false;
export const isLoaded = () => loaded;

async function ffmpeg() {
  ffmpegPromise ||= (async () => {
    const { FFmpeg } = await import(`${BASE}index.js`);
    const f = new FFmpeg();
    await f.load({ coreURL: `${BASE}core/ffmpeg-core.js`, wasmURL: `${BASE}core/ffmpeg-core.wasm` });
    loaded = true;
    return f;
  })().catch((e) => {
    ffmpegPromise = null;
    throw new ConvertError('The audio converter could not load. Check your connection and try again.');
  });
  return ffmpegPromise;
}

export function preload() { ffmpeg().catch(() => {}); }

const extOf = (name) => {
  const e = (name.includes('.') ? name.split('.').pop() : '').toLowerCase();
  return ({ aif: 'aiff', oga: 'ogg', jpeg: 'jpg' })[e] || e || 'bin';
};

/** Run ffmpeg and collect its log, so errors can be explained */
async function run(f, args, onProgress) {
  const log = [];
  const onLog = ({ message }) => { log.push(message); if (log.length > 400) log.shift(); };
  const onProg = ({ progress }) => { if (onProgress && progress >= 0 && progress <= 1) onProgress(progress); };
  f.on('log', onLog);
  f.on('progress', onProg);
  try {
    const code = await f.exec(args);
    return { code, log: log.join('\n') };
  } finally {
    f.off('log', onLog);
    f.off('progress', onProg);
  }
}

/** What the input contains: audio sample format and whether it has a cover picture */
async function probe(f, input) {
  const { log } = await run(f, ['-hide_banner', '-i', input]);
  const audio = log.match(/Stream #\S+.*?Audio: ([^\n]+)/);
  return {
    // No streams at all means FFmpeg could not make sense of the file
    unreadable: !/Stream #/.test(log),
    hasAudio: !!audio,
    // Only real 24/32-bit sources (FLAC, WAV, AIFF) need 24-bit output. Decoded MP3/AAC report
    // floating point ("fltp"), which carries no extra detail, so 16-bit is right for them.
    highRes: audio ? /\b(s24|s32|24 bit|32 bit)\b/.test(audio[1]) : false,
    hasCover: /Stream #\S+.*?Video: (mjpeg|png)[^\n]*\(attached pic\)/.test(log),
  };
}

function codecArgs(target, kbps, info) {
  const b = `${kbps}k`;
  switch (target) {
    case 'MP3': return ['-c:a', 'libmp3lame', '-b:a', b, '-id3v2_version', '3'];
    case 'M4A': return ['-c:a', 'aac', '-b:a', b, '-movflags', '+faststart'];
    case 'AAC': return ['-c:a', 'aac', '-b:a', b, '-f', 'adts'];
    case 'OGG': return ['-c:a', 'libvorbis', '-b:a', b];
    // libopus in ffmpeg.wasm 0.12.10 crashes the tab on stereo input; FFmpeg's own Opus encoder is stable
    case 'OPUS': return ['-c:a', 'opus', '-strict', '-2', '-ar', '48000', '-b:a', b];
    case 'FLAC': return ['-c:a', 'flac', '-sample_fmt', info.highRes ? 's32' : 's16'];
    case 'WAV': return ['-c:a', info.highRes ? 'pcm_s24le' : 'pcm_s16le'];
    case 'AIFF': return ['-c:a', info.highRes ? 'pcm_s24be' : 'pcm_s16be'];
    default: throw new ConvertError(`Saving as ${target} is not supported yet.`);
  }
}

/**
 * Convert one file. opts: { bitrate } in kbps for lossy formats.
 * onProgress(0..1) is called while FFmpeg works.
 */
export async function convert(file, target, opts = {}, onProgress) {
  if (!EXT[target]) throw new ConvertError(`Saving as ${target} is not supported yet.`);
  if (file.size > MAX_BYTES) throw new ConvertError('This file is larger than 1.5 GB, which is too big to convert in a browser.');
  const f = await ffmpeg();
  try {
    return await convertWith(f, file, target, opts, onProgress);
  } finally {
    // FFmpeg's WebAssembly memory only grows; several conversions in one instance can crash the tab.
    // A fresh instance per file keeps memory flat (reloading takes well under a second once cached).
    try { f.terminate(); } catch (e) { /* already gone */ }
    ffmpegPromise = null;
  }
}

async function convertWith(f, file, target, opts, onProgress) {
  const input = `in-${Date.now()}.${extOf(file.name)}`;
  const output = `out-${Date.now()}.${EXT[target]}`;
  await f.writeFile(input, new Uint8Array(await file.arrayBuffer()));
  try {
    const info = await probe(f, input);
    if (info.unreadable) throw new ConvertError('This file could not be opened. It may be damaged or not really an audio or video file.');
    if (!info.hasAudio) throw new ConvertError('No sound was found in this file.');
    const kbps = Math.max(32, Math.min(320, +opts.bitrate || (target === 'OPUS' ? 128 : 192)));
    const codec = codecArgs(target, kbps, info);
    // Keep album art where the format can carry it; everything else drops pictures and video
    const keepCover = info.hasCover && (target === 'MP3' || target === 'M4A');
    const attempts = keepCover
      ? [['-map', '0:a:0', '-map', '0:v:0', '-c:v', 'copy', '-disposition:v:0', 'attached_pic'], ['-map', '0:a:0', '-vn']]
      : [['-map', '0:a:0', '-vn']];
    let result;
    for (const mapping of attempts) {
      result = await run(f, ['-hide_banner', '-y', '-i', input, ...mapping, '-map_metadata', '0', ...codec, output], onProgress);
      if (result.code === 0) break;
    }
    if (result.code !== 0) {
      console.warn(result.log);
      throw new ConvertError('This file could not be converted. It may be damaged or use a sound format we cannot read.');
    }
    const data = await f.readFile(output);
    if (!data?.length) throw new ConvertError('The converted file came out empty.');
    const base = file.name.replace(/\.[^.]+$/, '') || 'audio';
    return { blob: new Blob([data], { type: MIME[target] }), name: `${base}.${EXT[target]}` };
  } finally {
    await f.deleteFile(input).catch(() => {});
    await f.deleteFile(output).catch(() => {});
  }
}
