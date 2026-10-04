const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const childProcess = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const { unzipSync, strFromU8 } = require('fflate');
const live = require('../js/live-update.js');

const dist = path.join(__dirname, '../dist');
const manifest = JSON.parse(fs.readFileSync(path.join(dist, 'updates/latest.json'), 'utf8'));
const normalized = live.normalizeManifest(manifest);
assert.ok(normalized, 'generated OTA manifest is trusted');
const zipPath = path.join(dist, 'updates', path.basename(new URL(manifest.url).pathname));
const archive = fs.readFileSync(zipPath);
assert.equal(crypto.createHash('sha256').update(archive).digest('hex'), manifest.checksum);
const capacitorConfig = JSON.parse(fs.readFileSync(path.join(__dirname, '../capacitor.config.json'), 'utf8'));
const publicKey = capacitorConfig.plugins.LiveUpdate.publicKey;
assert.equal(crypto.verify('sha256', archive, publicKey, Buffer.from(manifest.signature, 'base64')), true,
  'native public key must authenticate the OTA archive');
assert.equal(crypto.verify(
  'sha256', Buffer.from(live.manifestPayload(manifest)), publicKey, Buffer.from(manifest.manifestSignature, 'base64')
), true, 'manifest signature must bind identity and compatibility metadata');
childProcess.execFileSync(process.execPath, [path.join(__dirname, 'build.mjs')], { stdio: 'pipe' });
const rebuiltManifest = JSON.parse(fs.readFileSync(path.join(dist, 'updates/latest.json'), 'utf8'));
const rebuiltArchive = fs.readFileSync(path.join(dist, 'updates', path.basename(new URL(rebuiltManifest.url).pathname)));
assert.deepEqual(rebuiltManifest, manifest, 'identical content must produce the same manifest');
assert.equal(Buffer.compare(rebuiltArchive, archive), 0, 'identical content must produce identical ZIP bytes');
const files = unzipSync(archive);
assert.ok(files['index.html']);
const appScript = fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8').match(/src="(js\/app\.js\?v=\d+)"/);
assert.ok(appScript, 'source declares a versioned app entry point');
assert.ok(strFromU8(files['index.html']).includes(`src="${appScript[1]}"`), 'OTA uses the current app entry point');
assert.equal(strFromU8(files['js/app.js']), fs.readFileSync(path.join(__dirname, '../js/app.js'), 'utf8'), 'OTA packages current app code');
assert.doesNotMatch(strFromU8(files['index.html']), /Architecture as a living system/i);
assert.equal(files['marketing/arc90-trio-vertical.webp'], undefined);

const nativePrepare = fs.readFileSync(path.join(__dirname, 'prepare-native-public.mjs'), 'utf8');
assert.match(nativePrepare, /rm\(join\(nativePublic, 'updates'\)/);
assert.equal(fs.existsSync(path.join(__dirname, '../ios/App/App/public/updates')), false);
const appSource = fs.readFileSync(path.join(__dirname, '../js/app.js'), 'utf8');
const bootRender = appSource.lastIndexOf('\nrender();');
const readyConfirmation = appSource.lastIndexOf('Arc90LiveUpdate.confirmReady()');
assert.ok(bootRender >= 0 && readyConfirmation > bootRender,
  'the rollback watchdog must be cleared only after the first render succeeds');

for (const value of [
  null,
  {},
  { ...manifest, bundleId: '../escape' },
  { ...manifest, checksum: 'bad' },
  { ...manifest, nativeBridgeVersion: 0 },
  { ...manifest, signature: 'bad' },
  { ...manifest, manifestSignature: 'bad' },
  { ...manifest, size: 0 },
  { ...manifest, url: manifest.url.replace(manifest.bundleId, 'arc90-0000000000000000') },
  { ...manifest, url: manifest.url.replace('https:', 'http:') },
  { ...manifest, url: manifest.url.replace('arc90.vercel.app', 'evil.example') },
  { ...manifest, url: 'https://user:pass@arc90.vercel.app/updates/file.zip' },
]) assert.equal(live.normalizeManifest(value), null);

async function run() {
  let fetched = false;
  assert.equal(await live.verifyManifestSignature(manifest, crypto.webcrypto), true);
  assert.equal(await live.verifyManifestSignature({
    ...manifest, nativeBridgeVersion: manifest.nativeBridgeVersion + 1,
  }, crypto.webcrypto), false);
  assert.equal(await live.verifyManifestSignature({
    ...manifest,
    bundleId: 'arc90-0000000000000000',
    url: 'https://arc90.vercel.app/updates/arc90-0000000000000000.zip',
  }, crypto.webcrypto), false);
  assert.deepEqual(await live.confirmReady({
    capacitor: { isNativePlatform: () => false },
  }), { status: 'web' });
  assert.deepEqual(await live.syncNativeUpdate({
    capacitor: { isNativePlatform: () => false },
    fetchImpl: async () => { fetched = true; },
  }), { status: 'web' });
  assert.equal(fetched, false);

  const calls = [];
  const nativeInfoPlugin = {
    async nativeInfo() { calls.push('native-info'); return { bridgeVersion: 1 }; },
  };
  const plugin = {
    async ready() { calls.push('ready'); },
    async getBlockedBundles() { calls.push('blocked'); return { bundleIds: [] }; },
    async getCurrentBundle() { calls.push('current'); return { bundleId: 'default' }; },
    async downloadBundle(options) { calls.push(['download', options]); },
    async setNextBundle(options) { calls.push(['next', options]); },
  };
  assert.deepEqual(await live.confirmReady({
    capacitor: { isNativePlatform: () => true, Plugins: { LiveUpdate: plugin } },
  }), { status: 'confirmed' });
  const result = await live.syncNativeUpdate({
    capacitor: { isNativePlatform: () => true, Plugins: { LiveUpdate: plugin } },
    nativeInfoPlugin,
    fetchImpl: async () => ({ ok: true, async json() { return manifest; } }),
  });
  assert.equal(result.status, 'ready');
  assert.equal(calls[0], 'ready');
  assert.equal(calls[1], 'native-info');
  assert.equal(calls[2], 'blocked');
  assert.deepEqual(calls[4], ['download', {
    url: normalized.url,
    bundleId: normalized.bundleId,
    checksum: normalized.checksum,
    signature: normalized.signature,
  }]);
  assert.deepEqual(calls[5], ['next', { bundleId: manifest.bundleId }]);

  assert.equal((await live.syncNativeUpdate({
    capacitor: { isNativePlatform: () => true, Plugins: { LiveUpdate: plugin } },
    nativeInfoPlugin: { async nativeInfo() { return { bridgeVersion: 2 }; } },
    fetchImpl: async () => ({ ok: true, async json() { return manifest; } }),
  })).status, 'incompatible');

  calls.length = 0;
  plugin.getBlockedBundles = async () => ({ bundleIds: [manifest.bundleId] });
  assert.equal((await live.syncNativeUpdate({
    capacitor: { isNativePlatform: () => true, Plugins: { LiveUpdate: plugin } },
    nativeInfoPlugin,
    fetchImpl: async () => ({ ok: true, async json() { return manifest; } }),
  })).status, 'blocked');
  assert.equal(calls.some((call) => Array.isArray(call) && call[0] === 'download'), false);

  calls.length = 0;
  plugin.getBlockedBundles = async () => ({ bundleIds: [] });
  plugin.getCurrentBundle = async () => ({ bundleId: manifest.bundleId });
  assert.equal((await live.syncNativeUpdate({
    capacitor: { isNativePlatform: () => true, Plugins: { LiveUpdate: plugin } },
    nativeInfoPlugin,
    fetchImpl: async () => ({ ok: true, async json() { return manifest; } }),
  })).status, 'current');
  assert.equal(calls.some((call) => Array.isArray(call) && call[0] === 'download'), false);
}

run().then(() => console.log('Live update checks passed: deterministic bundle, checksum, trusted host, native gating and activation.'))
  .catch((error) => { console.error(error); process.exitCode = 1; });
