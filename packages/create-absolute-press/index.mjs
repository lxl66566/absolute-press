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

const usage = 'usage: pnpm create absolute-press [target-dir]';
const arg = argv[2];
if (!arg || arg === '-h' || arg === '--help') {
  console.log(usage);
  exit(arg ? 0 : 1);
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
for (const file of ['package.json', 'README.md']) {
  const path = resolve(target, file);
  writeFileSync(path, readFileSync(path, 'utf8').replaceAll('my-blog', name));
}

console.log(`Scaffolded an absolute-press site in ${target}`);
console.log('');
console.log('Next steps:');
console.log(`  cd ${arg}`);
console.log('  pnpm install');
console.log('  pnpm dev');
