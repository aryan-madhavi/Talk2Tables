import esbuild from 'esbuild';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

const mainTsPath = resolve(__dirname, '../electron/main.ts');
const preloadTsPath = resolve(__dirname, '../electron/preload.ts');
const outDir = resolve(__dirname, '../../dist-electron');

console.log('Resolving path for __dirname:', __dirname);
console.log('Resolving path for main.ts:', mainTsPath);
console.log('Resolving path for preload.ts:', preloadTsPath);

// Build Electron main process as true CJS
await esbuild.build({
  entryPoints: [mainTsPath],
  outfile:     resolve(outDir, 'main.cjs'),
  bundle:      true,
  platform:    'node',
  target:      'node24',
  format:      'cjs',        // true CJS — bytenode compatible
  external:    ['electron'], // don't bundle electron itself
  minify:      false,        // bytenode compiles the source, not minified output
});
console.log('[success] main.cjs built');

// Build preload as true CJS
await esbuild.build({
  entryPoints: [preloadTsPath],
  outfile:     resolve(outDir, 'preload.js'),
  bundle:      true,
  platform:    'node',
  target:      'node24',
  format:      'cjs',        // true CJS — bytenode compatible
  external:    ['electron'], // don't bundle electron itself
  minify:      false,        // bytenode compiles the source, not minified output
});
console.log('[success] preload.js built');