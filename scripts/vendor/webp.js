import factory from '@jsquash/webp/codec/enc/webp_enc.js';
import { defaultOptions } from '@jsquash/webp/meta.js';
let mod;
export default async function encode(imageData, options = {}) {
  mod ||= factory({ noInitialRun: true });
  const m = await mod;
  const out = m.encode(imageData.data, imageData.width, imageData.height, { ...defaultOptions, ...options });
  if (!out) throw new Error('WebP encoding failed');
  return out.buffer;
}
