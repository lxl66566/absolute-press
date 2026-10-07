import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/** Absolute fs path of the framework package root (this module's home). */
export function packageRoot(): string {
  return path.resolve(fileURLToPath(new URL('../../..', import.meta.url)));
}

/**
 * Client entry of the framework. When bundled into .vite-temp the
 * import.meta-relative path breaks, so fall back to the project layout.
 */
export function clientEntry(): string {
  const candidates = [
    fileURLToPath(new URL('../../client/runtime/entry.tsx', import.meta.url)),
    path.resolve(process.cwd(), 'src/client/runtime/entry.tsx'),
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }
  throw new Error(
    '[absolute-press] cannot locate src/client/runtime/entry.tsx',
  );
}
