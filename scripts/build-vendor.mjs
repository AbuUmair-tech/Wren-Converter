// Bundles third-party codecs into small ES modules under src/assets/vendor/.
// They are loaded on demand, only when a file actually needs them.
import { build } from 'esbuild';
import { copyFileSync, mkdirSync, existsSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, 'src/assets/vendor');
mkdirSync(out, { recursive: true });

const entries = ['heic', 'utif', 'psd', 'gif', 'pdf', 'zip', 'pako', 'avif', 'webp', 'xlsx'];
const stamp = join(out, '.built');
const lock = statSync(join(root, 'package-lock.json')).mtimeMs;
if (existsSync(stamp) && statSync(stamp).mtimeMs > lock && process.argv[2] !== '--force') {
  process.exit(0);
}

await build({
  entryPoints: Object.fromEntries(entries.map((e) => [e, join(root, 'scripts/vendor', `${e}.js`)])),
  outdir: out,
  bundle: true,
  format: 'esm',
  minify: true,
  target: 'es2020',
  platform: 'browser',
  legalComments: 'external',
  logLevel: 'warning',
  define: { 'process.env.NODE_ENV': '"production"' },
  // Emscripten glue references node modules behind runtime checks
  external: ['module', 'fs', 'path', 'url', 'worker_threads', 'crypto'],
});

copyFileSync(join(root, 'node_modules/@jsquash/avif/codec/enc/avif_enc.wasm'), join(out, 'avif_enc.wasm'));
copyFileSync(join(root, 'node_modules/@jsquash/webp/codec/enc/webp_enc.wasm'), join(out, 'webp_enc.wasm'));
import('node:fs').then((fs) => fs.writeFileSync(stamp, new Date().toISOString()));
console.log('vendor: built', entries.length, 'modules');
