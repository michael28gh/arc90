const assert = require('node:assert/strict');
const { test, afterEach } = require('node:test');
const handler = require('../api/auth-config');
const originalUrl = process.env.SUPABASE_URL;
const originalKey = process.env.SUPABASE_ANON_KEY;
afterEach(() => {
  if (originalUrl === undefined) delete process.env.SUPABASE_URL;
  else process.env.SUPABASE_URL = originalUrl;
  if (originalKey === undefined) delete process.env.SUPABASE_ANON_KEY;
  else process.env.SUPABASE_ANON_KEY = originalKey;
});
function response() {
  return { headers: {}, setHeader(k, v) { this.headers[k] = v; },
    status(value) { this.code = value; return this; }, json(value) { this.body = value; return this; } };
}
function jwt(role) { return 'header.' + Buffer.from(JSON.stringify({ role })).toString('base64url') + '.signature'; }
test('public config refuses service credentials, malformed config and HTTP', () => {
  for (const key of [jwt('service_role'), 'sb_secret_test', 'invalid']) {
    process.env.SUPABASE_URL = 'https://example.supabase.co';
    process.env.SUPABASE_ANON_KEY = key;
    const res = response(); handler({ method: 'GET' }, res);
    assert.equal(res.code, 503);
    assert.equal(res.body.key, undefined);
  }
  process.env.SUPABASE_URL = 'http://example.supabase.co';
  process.env.SUPABASE_ANON_KEY = 'sb_publishable_test';
  const res = response(); handler({ method: 'GET' }, res);
  assert.equal(res.code, 503);
});
test('public config accepts publishable and anon keys without caching', () => {
  for (const key of ['sb_publishable_test', jwt('anon')]) {
    process.env.SUPABASE_URL = 'https://example.supabase.co';
    process.env.SUPABASE_ANON_KEY = key;
    const res = response(); handler({ method: 'GET' }, res);
    assert.equal(res.code, 200);
    assert.equal(res.body.key, key);
    assert.equal(res.headers['Cache-Control'], 'no-store');
  }
});
test('public config rejects write methods', () => {
  const res = response(); handler({ method: 'POST' }, res);
  assert.equal(res.code, 405);
  assert.equal(res.headers.Allow, 'GET');
});
