import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DIST = path.resolve(__dirname, '../../dist-electron');
const electronBin = path.resolve('node_modules/.bin/electron');
const helperScript = path.resolve(__dirname, 'bytecode-helper.cjs');

const LOADER = (jscFile: string) => `\
'use strict';
const path = require('path');
const { app } = require('electron');
const bytenodeIndex = app.isPackaged
  ? path.join(process.resourcesPath, 'node_modules', 'bytenode', 'lib', 'index.js')
  : path.join(__dirname, '../../node_modules/bytenode/lib/index.js');
require(bytenodeIndex);
require('./${jscFile}');
`;

/* const PRELOAD_LOADER = (jscFile: string) => `\
'use strict';
const path = require('path');
const bytenodeIndex = __dirname.includes('app.asar')
  ? path.join(process.resourcesPath, 'node_modules', 'bytenode', 'lib', 'index.js')
  : path.join(__dirname, '../../node_modules/bytenode/lib/index.js');
require(bytenodeIndex);
require('./${jscFile}');
`; */

const PRELOAD_LOADER = (jscFile: string) => `\
'use strict';
const path = require('path');
const bytenodeIndex = process.resourcesPath
  ? path.join(process.resourcesPath, 'node_modules', 'bytenode', 'lib', 'index.js')
  : path.join(__dirname, '../../node_modules/bytenode/lib/index.js');
require(bytenodeIndex);
require(path.join(__dirname, '${jscFile}'));
`;

function compileBytecode(
  src: string,
  out: string,
  jscFile: string,
  loaderFn: (jscFile: string) => string = LOADER
) {
  console.log(`[info] Compiling ${src} → ${out}`);
  execSync(
    `"${electronBin}" "${helperScript}" "${src}" "${out}"`,
    { stdio: 'inherit' }
  );
  fs.writeFileSync(src, loaderFn(jscFile), 'utf8');
  console.log(`[success] Loader injected into ${path.basename(src)}`);
}

compileBytecode(
  path.join(DIST, 'main.cjs'),
  path.join(DIST, 'main.jsc'),
  'main.jsc'
);

if (fs.existsSync(path.join(DIST, 'preload.js'))) {
  compileBytecode(
    path.join(DIST, 'preload.js'),
    path.join(DIST, 'preload.jsc'),
    'preload.jsc',
    PRELOAD_LOADER
  );
}

console.log('[success] Bytecode complete. Ready for electron-builder!');