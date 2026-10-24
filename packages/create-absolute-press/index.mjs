#!/usr/bin/env node
import {
  cpSync,
  existsSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import { basename, resolve } from 'node:path';
import { argv, exit } from 'node:process';
import { fileURLToPath } from 'node:url';

import { sanitizePackageName } from './sanitize-name.mjs';

const usage = 'usage: pnpm create absolute-press [target-dir]';
const arg = argv[2];
if (!arg || arg === '-h' || arg === '--help') {
  // Wrong invocation reports on stderr; -h/--help answers on stdout.
  if (arg) {
    console.log(usage);
    exit(0);
  }
  console.error(usage);
  exit(1);
}

const target = resolve(arg);
if (existsSync(target) && readdirSync(target).length > 0) {
  console.error(
    `[create-absolute-press] ${target} already exists and is not empty`,
  );
  exit(1);
}

cpSync(fileURLToPath(new URL('./template', import.meta.url)), target, {
  recursive: true,
});

const name = basename(target);
const pkgName = sanitizePackageName(name);
if (pkgName !== name) {
  console.log(`package name: ${pkgName}`);
}
for (const file of ['package.json', 'README.md']) {
  const path = resolve(target, file);
  writeFileSync(
    path,
    readFileSync(path, 'utf8').replaceAll('my-blog', pkgName),
  );
}

console.log(`Scaffolded an absolute-press site in ${target}`);
console.log('');
console.log('Next steps:');
console.log(`  cd ${arg}`);
console.log('  pnpm install');
console.log('  pnpm dev');
