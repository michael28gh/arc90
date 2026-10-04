const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { stripTypeScriptTypes } = require('node:module');

const source = fs.readFileSync(path.join(__dirname, '../functions/categorize-brain-dump/index.ts'), 'utf8')
  .replace(/^import .*;\n/gm, '');
const compiled = stripTypeScriptTypes(source, { mode: 'transform' });
const brain = require('../../js/brain-core.js');
const goalId = 'a0000000-0000-4000-8000-000000000001';

function item(overrides = {}) {
  return { temp_id: 'one', type: 'task', title: 'Call mom', horizon: 'short',
    parent_temp_id: null, parent_goal_id: null, frequency: null, confidence: 0.9,
    excerpt: 'Call mom', ...overrides };
}

function harness(options = {}) {
  const calls = { auth: 0, quota: 0, provider: 0, client: null, providerBody: null };
  const goals = options.goals || [];
  let handler;
  const context = vm.createContext({
    Arc90Brain: brain, Headers, Request, Response, AbortController, AbortSignal,
    TextDecoder, DOMException, setTimeout, clearTimeout,
    Deno: { env: { get: (name) => ({ SUPABASE_URL: 'https://example.supabase.co',
      SUPABASE_ANON_KEY: 'anon-key', ANTHROPIC_API_KEY: 'provider-key', BRAIN_DUMP_MODEL: 'test-model' })[name] },
      serve: (fn) => { handler = fn; } },
    createClient: (url, key, config) => {
      calls.client = { url, key, config };
      return {
        auth: { getUser: async () => { calls.auth++; return options.invalidToken
          ? { data: { user: null }, error: new Error('invalid') }
          : { data: { user: { id: 'b0000000-0000-4000-8000-000000000001' } }, error: null }; } },
        from: () => ({ select: () => ({ eq: () => ({ order: () => ({ limit: async () => ({ data: goals, error: null }) }) }) }) }),
        rpc: async () => { calls.quota++; return { data: options.quotaDenied ? false : true, error: null }; },
      };
    },
    fetch: async (_url, init) => {
      calls.provider++;
      calls.providerBody = JSON.parse(init.body);
      const value = options.providerItems?.[calls.provider - 1] || [item()];
      return Response.json({ stop_reason: 'end_turn', content: [{ type: 'text', text: JSON.stringify({ items: value }) }] });
    },
  });
  vm.runInContext(compiled, context, { filename: 'categorize-brain-dump/index.ts' });
  const request = (body = { text: 'Call mom today', existing_goals: [] }, headers = {}) =>
    new Request('https://example.com/categorize', { method: 'POST', headers: {
      authorization: 'Bearer user-token', 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) });
  return { handler, request, calls };
}

test('rejects absent or invalid JWT before quota and provider calls', async () => {
  const missing = harness();
  const response = await missing.handler(missing.request(undefined, { authorization: '' }));
  assert.equal(response.status, 401);
  assert.equal(missing.calls.auth, 0);
  assert.equal(missing.calls.quota, 0);
  const invalid = harness({ invalidToken: true });
  assert.equal((await invalid.handler(invalid.request())).status, 401);
  assert.equal(invalid.calls.quota, 0);
  assert.equal(invalid.calls.provider, 0);
});

test('invalid input and exhausted quota never contact the provider', async () => {
  const invalid = harness();
  assert.equal((await invalid.handler(invalid.request({ text: 'Call mom', existing_goals: [], extra: true }))).status, 400);
  assert.equal(invalid.calls.quota, 0);
  const denied = harness({ quotaDenied: true });
  assert.equal((await denied.handler(denied.request())).status, 429);
  assert.equal(denied.calls.quota, 1);
  assert.equal(denied.calls.provider, 0);
});

test('uses authenticated cloud goals and consumes quota once', async () => {
  const cloudGoal = { id: goalId, title: 'Family', horizon: 'mid', parent_goal_id: null, status: 'active' };
  const h = harness({ goals: [cloudGoal], providerItems: [[item({ parent_goal_id: goalId })]] });
  const response = await h.handler(h.request());
  assert.equal(response.status, 200);
  assert.equal((await response.json()).items[0].parent_goal_id, goalId);
  assert.equal(h.calls.quota, 1);
  assert.equal(h.calls.provider, 1);
  assert.equal(h.calls.providerBody.messages[0].content.includes(goalId), true);
  assert.equal(h.calls.client.key, 'anon-key');
  assert.equal(h.calls.client.config.global.headers.Authorization, 'Bearer user-token');
});

test('retries unsupported excerpts, oversized IDs and titles, then fails closed', async () => {
  for (const bad of [item({ excerpt: 'Never said this' }), item({ temp_id: 'x'.repeat(101) }),
    item({ title: 'x'.repeat(201) })]) {
    const h = harness({ providerItems: [[bad], [bad]] });
    const response = await h.handler(h.request());
    assert.equal(response.status, 502);
    assert.equal(h.calls.quota, 1);
    assert.equal(h.calls.provider, 2);
  }
});
