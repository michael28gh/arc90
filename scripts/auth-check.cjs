const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync(require('node:path').join(__dirname, '../js/auth.js'), 'utf8');
const storage = new Map();
const requests = [];
const context = { window: {}, URL, AbortSignal, sessionStorage: { getItem: (k) => storage.get(k), setItem: (k,v) => storage.set(k,v), removeItem: (k) => storage.delete(k) },
  fetch: async (url, options = {}) => {
    requests.push({url,options});
    if (url === '/api/auth-config') return { ok: true, json: async () => ({ url: 'https://example.supabase.co', key: 'public-test-key' }) };
    if (url.endsWith('/verify')) return { ok: true, json: async () => ({ access_token: 'test-access', refresh_token: 'test-refresh', expires_in: 3600 }) };
    return { ok: true, json: async () => ({}) };
  }};
vm.runInNewContext(source, context);
(async () => {
  const auth = context.window.arc90Auth;
  assert.equal(await auth.getAccessToken(), null);
  await assert.rejects(auth.requestCode('bad email'));
  assert.equal(requests.length, 0);
  await auth.requestCode('person@example.com');
  assert.equal(JSON.parse(requests[1].options.body).email, 'person@example.com');
  await assert.rejects(auth.verifyCode('person@example.com', 'bad'));
  await auth.verifyCode('person@example.com', '123456');
  assert.equal(await auth.getAccessToken(), 'test-access');
  assert.equal(auth.isSignedIn(), true);
  auth.signOut();
  assert.equal(await auth.getAccessToken(), null);
  assert.equal(storage.size, 0);
  storage.set('arc90.auth.session', JSON.stringify({ access_token: 'expired', refresh_token: 'refresh', expires_at: 1 }));
  vm.runInNewContext(source, context);
  const reloaded = context.window.arc90Auth;
  let release;
  context.fetch = async (url) => {
    if (url === '/api/auth-config') return { ok: true, json: async () => ({ url: 'https://example.supabase.co', key: 'public-test-key' }) };
    return new Promise((resolve) => { release = () => resolve({ ok: true, json: async () => ({ access_token: 'late', refresh_token: 'late-refresh', expires_in: 3600 }) }); });
  };
  const pending = reloaded.getAccessToken();
  while (!release) await new Promise(setImmediate);
  reloaded.signOut();
  release();
  assert.equal(await pending, null);
  assert.equal(reloaded.isSignedIn(), false);
  assert.equal(storage.size, 0);
  console.log('Auth checks passed: validation, OTP exchange, session access, sign-out and refresh race.');
})().catch((error) => { console.error(error); process.exitCode = 1; });
