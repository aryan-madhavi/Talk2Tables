import esbuild from 'esbuild';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { spawn } from 'child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const isWatch = process.argv.includes('--watch');
const mainTsPath  = resolve(__dirname, '../electron/main.ts');
const preloadTsPath = resolve(__dirname, '../electron/preload.ts');
const outDir = resolve(__dirname, '../../dist-electron');

let electronProcess = null;
let isRestarting = false;

function startElectron() {
  if (electronProcess) {
    isRestarting = true;
    electronProcess.kill();
  }
  electronProcess = spawn('node_modules/.bin/electron', ['.'], { stdio: 'inherit' });
  electronProcess.on('close', () => {
    if (isRestarting) { isRestarting = false; return; }
    console.log('[electron] window closed, shutting down...');
    process.exit(0);
  });
}

// Build preload
await esbuild.build({
  entryPoints: [preloadTsPath],
  outfile:  resolve(outDir, 'preload.js'),
  bundle:   true,
  platform: 'node',
  target:   'node24',
  format:   'cjs',
  external: ['electron'],
  minify:   false,
});
console.log('[success] preload.js built');

// Build main
const mainCtx = await esbuild.context({
  entryPoints: [mainTsPath],
  outfile:  resolve(outDir, 'main.cjs'),
  bundle:   true,
  platform: 'node',
  target:   'node24',
  format:   'cjs',
  external: ['electron'],
  minify:   false,
  plugins: isWatch ? [{
    name: 'restart-electron',
    setup(build) {
      build.onEnd(() => {
        console.log('[main] rebuilt — restarting electron...');
        startElectron();
      });
    }
  }] : [],
});

if (isWatch) {
  await mainCtx.watch();
  console.log('[success] main.cjs watching for changes...');
  startElectron();
} else {
  await mainCtx.rebuild();
  await mainCtx.dispose();
  console.log('[success] main.cjs built');
}
