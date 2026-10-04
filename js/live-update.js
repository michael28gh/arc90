(function (root, factory) {
  var api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.Arc90LiveUpdate = api;
}(typeof window !== 'undefined' ? window : null, function (root) {
  'use strict';

  var MANIFEST_URL = 'https://arc90.vercel.app/updates/latest.json';
  var TRUSTED_HOST = 'arc90.vercel.app';
  var PUBLIC_KEY_DER_B64 = 'MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAqKsmY6z6E6QMBklbg+Q0Q0GjPYvFaVsnuCEOsPzMu446MpWryAsD/uKJOcGAdsDwOYHqEQOVl5xk5j46EiYnx/ZTA7SEWNl1JpXlv0CXugePw/KDbDCpx7w2JvDQ95rob4IKB9UK+Di8axZwKyBllDQsYhIay/LeD4A1Fkt/brU5D/yklo8OLgpI9sQghfYCpNXnPKmTOM8gUWdqb98jTnsdqIiYt5Z+KdnxAgsTqZY5jE0aOJu+Gha2FzDWw7a/eiUBf2Y7whSI9BCV5+6k1dQgVIc1DPAd7i8O+jxzqFORxeoVv2dfjiPgIVFu0nze+me0s9f38IskiXDG/0Jo1QIDAQAB';

  function manifestPayload(value) {
    return [value.bundleId, value.checksum, value.nativeBridgeVersion, value.url, value.size].join('\n');
  }

  function decodeBase64(value) {
    var context = root || (typeof globalThis !== 'undefined' ? globalThis : null);
    if (!context || typeof context.atob !== 'function') return null;
    var binary = context.atob(value);
    var bytes = new Uint8Array(binary.length);
    for (var i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
    return bytes;
  }

  async function verifyManifestSignature(value, cryptoImpl) {
    var context = root || (typeof globalThis !== 'undefined' ? globalThis : null);
    var webCrypto = cryptoImpl || (context && context.crypto);
    var Encoder = context && context.TextEncoder;
    var publicKey = decodeBase64(PUBLIC_KEY_DER_B64);
    var signature = value && decodeBase64(value.manifestSignature);
    if (!webCrypto || !webCrypto.subtle || !Encoder || !publicKey || !signature) return false;
    try {
      var key = await webCrypto.subtle.importKey(
        'spki', publicKey, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']
      );
      return webCrypto.subtle.verify(
        { name: 'RSASSA-PKCS1-v1_5' }, key, signature, new Encoder().encode(manifestPayload(value))
      );
    } catch (error) {
      return false;
    }
  }

  function normalizeManifest(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    if (typeof value.bundleId !== 'string' || !/^arc90-[a-f0-9]{16}$/.test(value.bundleId)) return null;
    if (typeof value.checksum !== 'string' || !/^[a-f0-9]{64}$/.test(value.checksum)) return null;
    if (!Number.isInteger(value.nativeBridgeVersion) || value.nativeBridgeVersion < 1) return null;
    if (typeof value.signature !== 'string' || !/^[A-Za-z0-9+/]{342}==$/.test(value.signature)) return null;
    if (typeof value.manifestSignature !== 'string' || !/^[A-Za-z0-9+/]{342}==$/.test(value.manifestSignature)) return null;
    if (!Number.isSafeInteger(value.size) || value.size < 1) return null;
    try {
      var url = new URL(value.url);
      if (url.protocol !== 'https:' || url.hostname !== TRUSTED_HOST || url.username || url.password || url.port) return null;
      if (url.pathname !== `/updates/${value.bundleId}.zip`) return null;
      return {
        bundleId: value.bundleId,
        checksum: value.checksum,
        nativeBridgeVersion: value.nativeBridgeVersion,
        signature: value.signature,
        manifestSignature: value.manifestSignature,
        url: url.href,
        size: value.size,
      };
    } catch (error) {
      return null;
    }
  }

  async function confirmReady(options) {
    options = options && typeof options === 'object' ? options : {};
    var capacitor = options.capacitor || (root && root.Capacitor);
    var native = capacitor && typeof capacitor.isNativePlatform === 'function' && capacitor.isNativePlatform();
    if (!native) return { status: 'web' };
    var plugin = options.plugin || (capacitor.Plugins && capacitor.Plugins.LiveUpdate);
    if (!plugin || typeof plugin.ready !== 'function') return { status: 'unavailable' };
    try {
      await plugin.ready();
      return { status: 'confirmed' };
    } catch (error) {
      return { status: 'failed' };
    }
  }

  async function syncNativeUpdate(options) {
    options = options && typeof options === 'object' ? options : {};
    var capacitor = options.capacitor || (root && root.Capacitor);
    var fetchImpl = options.fetchImpl || (root && root.fetch && root.fetch.bind(root));
    var native = capacitor && typeof capacitor.isNativePlatform === 'function' && capacitor.isNativePlatform();
    if (!native) return { status: 'web' };
    var plugin = options.plugin || (capacitor.Plugins && capacitor.Plugins.LiveUpdate);
    if (!plugin || typeof plugin.downloadBundle !== 'function') return { status: 'unavailable' };

    try {
      if (!fetchImpl) return { status: 'unavailable' };
      var response = await fetchImpl(options.manifestUrl || MANIFEST_URL, { cache: 'no-store' });
      if (!response || !response.ok) return { status: 'manifest-unavailable' };
      var manifest = normalizeManifest(await response.json());
      if (!manifest) return { status: 'manifest-invalid' };
      if (!await verifyManifestSignature(manifest, options.cryptoImpl)) {
        return { status: 'manifest-unauthenticated' };
      }
      var nativeInfoPlugin = options.nativeInfoPlugin || (capacitor.Plugins && capacitor.Plugins.Arc90Health);
      if (!nativeInfoPlugin || typeof nativeInfoPlugin.nativeInfo !== 'function') return { status: 'native-info-unavailable' };
      var nativeInfo = await nativeInfoPlugin.nativeInfo();
      if (!nativeInfo || nativeInfo.bridgeVersion !== manifest.nativeBridgeVersion) {
        return { status: 'incompatible', bundleId: manifest.bundleId };
      }
      if (typeof plugin.getBlockedBundles === 'function') {
        var blocked = await plugin.getBlockedBundles();
        if (blocked && Array.isArray(blocked.bundleIds) && blocked.bundleIds.includes(manifest.bundleId)) {
          return { status: 'blocked', bundleId: manifest.bundleId };
        }
      }
      var current = await plugin.getCurrentBundle();
      if (current && current.bundleId === manifest.bundleId) return { status: 'current', bundleId: manifest.bundleId };
      await plugin.downloadBundle({
        url: manifest.url,
        bundleId: manifest.bundleId,
        checksum: manifest.checksum,
        signature: manifest.signature,
      });
      await plugin.setNextBundle({ bundleId: manifest.bundleId });
      return { status: 'ready', bundleId: manifest.bundleId };
    } catch (error) {
      return { status: 'failed' };
    }
  }

  return {
    manifestUrl: MANIFEST_URL,
    confirmReady: confirmReady,
    manifestPayload: manifestPayload,
    normalizeManifest: normalizeManifest,
    syncNativeUpdate: syncNativeUpdate,
    verifyManifestSignature: verifyManifestSignature,
  };
}));
