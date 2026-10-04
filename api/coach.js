const { guard, readBody } = require('./_security');
const { createHash } = require('node:crypto');

function send(res, status, payload) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  return res.status(status).send(JSON.stringify(payload));
}

module.exports = async function handler(req, res) {
  if (!guard(req, res, 'POST', 20)) return;
  const authorization = req.headers.authorization;
  if (typeof authorization !== 'string' || !/^Bearer [A-Za-z0-9._-]{20,4096}$/.test(authorization)) {
    return send(res, 401, { error: 'Sign in to use live coaching.' });
  }
  const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, OPENAI_API_KEY,
    UPSTASH_REDIS_REST_URL, UPSTASH_REDIS_REST_TOKEN } = process.env;
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !OPENAI_API_KEY ||
      !UPSTASH_REDIS_REST_URL || !UPSTASH_REDIS_REST_TOKEN) {
    return send(res, 503, { error: 'Live coaching is not configured.' });
  }
  let body;
  try { body = await readBody(req, 24000); } catch { return send(res, 400, { error: 'Invalid JSON body.' }); }
  if (!Array.isArray(body.messages) || body.messages.length < 1 || body.messages.length > 20 ||
      body.messages.some((m) => !m || !['user', 'assistant'].includes(m.role) ||
        typeof m.content !== 'string' || !m.content.trim() || m.content.length > 2000) ||
      body.messages.reduce((n, m) => n + m.content.length, 0) > 12000 ||
      body.messages.at(-1).role !== 'user') {
    return send(res, 400, { error: 'Invalid messages.' });
  }
  try {
    const userResponse = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: { apikey: SUPABASE_SERVICE_ROLE_KEY, Authorization: authorization },
      signal: AbortSignal.timeout(10000),
    });
    if (!userResponse.ok) return send(res, 401, { error: 'Invalid session.' });
    const user = await userResponse.json();
    if (!user.id || !user.email_confirmed_at || user.is_anonymous) {
      return send(res, 403, { error: 'A verified account is required.' });
    }
    const key = createHash('sha256').update(String(user.id)).digest('hex');
    // Atomic daily quota shared by every serverless instance, with a bounded TTL.
    const quotaResponse = await fetch(UPSTASH_REDIS_REST_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${UPSTASH_REDIS_REST_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(['EVAL', "local n=redis.call('INCR',KEYS[1]); if n==1 then redis.call('EXPIRE',KEYS[1],86400) end; return n", '1', `arc90:coach:${key}`]),
      signal: AbortSignal.timeout(5000),
    });
    if (!quotaResponse.ok) return send(res, 503, { error: 'Live coaching temporarily unavailable.' });
    const quota = await quotaResponse.json();
    if (!Number.isInteger(quota.result) || quota.result < 1) return send(res, 503, { error: 'Live coaching temporarily unavailable.' });
    if (quota.result > 30) {
      res.setHeader('Retry-After', '86400');
      return send(res, 429, { error: 'Daily coaching limit reached.' });
    }
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${OPENAI_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: process.env.COACH_MODEL || 'gpt-4o-mini',
        max_tokens: 400,
        messages: [
          { role: 'system', content: 'You are the Arc90 habit coach. Give concise, supportive, practical habit and focus guidance. Do not claim access to personal data not supplied in this conversation. Do not provide medical diagnoses.' },
          ...body.messages.map(({ role, content }) => ({ role, content })),
        ],
      }),
      signal: AbortSignal.timeout(25000),
    });
    if (!response.ok) return send(res, 502, { error: 'Live coaching temporarily unavailable.' });
    const result = await response.json();
    const reply = result.choices?.[0]?.message?.content;
    if (typeof reply !== 'string' || !reply.trim()) return send(res, 502, { error: 'No coaching reply received.' });
    return send(res, 200, { reply });
  } catch {
    return send(res, 502, { error: 'Live coaching temporarily unavailable.' });
  }
};
