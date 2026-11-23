import factory from '@jsquash/avif/codec/enc/avif_enc.js';
import { defaultOptions } from '@jsquash/avif/meta.js';
let mod;
export default async function encode(imageData, options = {}) {
  mod ||= factory({ noInitialRun: true });
  const m = await mod;
  const out = m.encode(new Uint8Array(imageData.data.buffer), imageData.width, imageData.height, { ...defaultOptions, ...options });
  if (!out) throw new Error('AVIF encoding failed');
  return out.buffer;
}
