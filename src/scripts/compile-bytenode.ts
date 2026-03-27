import bytenode from 'bytenode';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const currentPath = fileURLToPath(import.meta.url);
const currentDir = path.dirname(currentPath);

// Define paths relative to this script's location
const targetFile = path.resolve(currentDir, '../../dist-electron/main.js');
const compiledFile = path.resolve(currentDir, '../../dist-electron/main.jsc');

try {
  // Compile the JS file into a JSC (bytecode) file
  bytenode.compileFile({
    filename: targetFile,
    output: compiledFile,
  });

  console.log('✅ Successfully compiled main.js to V8 bytecode (main.jsc)');

  // Overwrite the original main.js with a secure loader
  const loaderCode = `
    require('bytenode');
    require('./main.jsc');
  `;

  fs.writeFileSync(targetFile, loaderCode, 'utf8');
  console.log('✅ Secure loader injected into main.js');

} catch (error) {
  console.error('❌ Failed to compile bytecode:', error);
  process.exit(1);
}