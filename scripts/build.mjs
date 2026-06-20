import { cp, mkdir, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

const root = new URL('..', import.meta.url).pathname;
const dist = join(root, 'dist');
const entries = [
  'index.html',
  'manifest.webmanifest',
  'sw.js',
  'privacy.html',
  'terms.html',
  'assets',
  'css',
  'icons',
  'js',
  'marketing'
];

await rm(dist, { recursive: true, force: true });
await mkdir(dist, { recursive: true });

for (const entry of entries) {
  const from = join(root, entry);
  if (!existsSync(from)) continue;
  await cp(from, join(dist, entry), { recursive: true });
}

console.log(`Arc90 static build ready in ${dist}`);
