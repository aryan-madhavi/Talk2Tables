'use strict';
const bytenode = require('bytenode');
const path = require('path');

const src = process.argv[2];
const out = process.argv[3];

if (!src || !out) {
  console.error('[error] Usage: electron bytecode-helper.cjs <src> <out>');
  process.exit(1);
}

try {
  bytenode.compileFile({ filename: src, output: out });
  console.log(`[success] ${path.basename(src)} → ${path.basename(out)}`);
  process.exit(0);
} catch (err) {
  console.error('[error]', err);
  process.exit(1);
}