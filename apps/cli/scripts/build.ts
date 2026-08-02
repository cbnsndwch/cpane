#!/usr/bin/env bun
import { $ } from 'bun';

const outfile = process.platform === 'win32' ? 'dist/cpane.exe' : 'dist/cpane';
await $`bun build --compile --minify --sourcemap ./src/index.ts --outfile ${outfile}`;
console.log(`Built ${outfile}`);
