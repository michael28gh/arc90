import { cp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { homedir } from 'node:os';
import { constants, createHash, sign } from 'node:crypto';
import { zipSync } from 'fflate';

const root = fileURLToPath(new URL('..', import.meta.url));
const dist = join(root, 'dist');
const nativeBridgeVersion = 1;
const entries = [
  'landing.html',
  'manifest.webmanifest',
  'sw.js',
  'privacy.html',
  'terms.html',
  '404.html',
  'robots.txt',
  'sitemap.xml',
  'assets/arc90-mark.svg',
  'assets/arc90-splash.svg',
  'assets/welcome-bg.jpg',
  'assets/social-preview.jpg',
  'assets/social-preview.svg',
  'assets/sounds',
  'css',
  'icons/icon-180.png',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'js',
  'marketing/arc90-trio-vertical.webp',
  'marketing/logo-concepts'
];

await rm(dist, { recursive: true, force: true });
await mkdir(dist, { recursive: true });

for (const entry of entries) {
  const from = join(root, entry);
  if (!existsSync(from)) continue;
  await mkdir(join(dist, entry, '..'), { recursive: true });
  await cp(from, join(dist, entry), { recursive: true });
}

// Homepage = marketing landing; the PWA itself lives at /app (served from app.html via cleanUrls).
await cp(join(root, 'landing.html'), join(dist, 'index.html'));
await cp(join(root, 'index.html'), join(dist, 'app.html'));
await mkdir(join(dist, 'js/vendor'), { recursive: true });
for (const library of ['d3-array', 'd3-path', 'd3-shape', 'd3-sankey']) {
  await cp(join(root, 'node_modules', library, 'dist', `${library}.min.js`), join(dist, 'js/vendor', `${library}.min.js`));
  await cp(join(root, 'node_modules', library, 'LICENSE'), join(dist, 'js/vendor', `${library}.LICENSE.txt`));
}

async function collectNativeFiles(directory, prefix = '') {
  const files = {};
  const excludedRoots = new Set(['updates', 'marketing']);
  const excludedFiles = new Set(['index.html', 'app.html', 'landing.html', '404.html', 'robots.txt', 'sitemap.xml']);
  const entries = await readdir(directory, { withFileTypes: true });
  entries.sort((a, b) => a.name < b.name ? -1 : a.name > b.name ? 1 : 0);
  for (const entry of entries) {
    if (!prefix && excludedRoots.has(entry.name)) continue;
    const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (!prefix && excludedFiles.has(entry.name)) continue;
    const absolute = join(directory, entry.name);
    if (entry.isDirectory()) Object.assign(files, await collectNativeFiles(absolute, relative));
    else if (entry.isFile()) files[relative] = new Uint8Array(await readFile(absolute));
  }
  return files;
}

const nativeFiles = await collectNativeFiles(dist);
nativeFiles['index.html'] = new Uint8Array(await readFile(join(dist, 'app.html')));
const contentHash = createHash('sha256');
for (const name of Object.keys(nativeFiles).sort()) {
  contentHash.update(name);
  contentHash.update('\0');
  contentHash.update(nativeFiles[name]);
}
const bundleId = `arc90-${contentHash.digest('hex').slice(0, 16)}`;
// A fixed ZIP timestamp keeps the archive checksum stable across machines and deploys.
const archive = zipSync(nativeFiles, { level: 9, mtime: new Date(1980, 0, 1, 0, 0, 0) });
const checksum = createHash('sha256').update(archive).digest('hex');
const encodedPrivateKey = process.env.ARC90_OTA_PRIVATE_KEY_B64;
const localPrivateKeyPath = join(homedir(), '.arc90', 'ota-private.pem');
const privateKey = encodedPrivateKey
  ? Buffer.from(encodedPrivateKey, 'base64').toString('utf8')
  : (existsSync(localPrivateKeyPath) ? await readFile(localPrivateKeyPath, 'utf8') : null);
if (!privateKey && process.env.VERCEL_ENV === 'production') {
  throw new Error('ARC90_OTA_PRIVATE_KEY_B64 is required for production OTA bundles.');
}
const signature = privateKey
  ? sign('sha256', archive, { key: privateKey, padding: constants.RSA_PKCS1_PADDING }).toString('base64')
  : null;
const updateDir = join(dist, 'updates');
const archiveName = `${bundleId}.zip`;
const bundleUrl = `https://arc90.vercel.app/updates/${archiveName}`;
const manifestPayload = [bundleId, checksum, nativeBridgeVersion, bundleUrl, archive.byteLength].join('\n');
const manifestSignature = privateKey
  ? sign('sha256', Buffer.from(manifestPayload), { key: privateKey, padding: constants.RSA_PKCS1_PADDING }).toString('base64')
  : null;
await mkdir(updateDir, { recursive: true });
await writeFile(join(updateDir, archiveName), archive);
await writeFile(join(updateDir, 'latest.json'), JSON.stringify({
  bundleId,
  checksum,
  nativeBridgeVersion,
  signature,
  manifestSignature,
  url: bundleUrl,
  size: archive.byteLength,
}, null, 2) + '\n');

console.log(`Arc90 static build ready in ${dist} (landing at /, app at /app, OTA ${bundleId})`);
