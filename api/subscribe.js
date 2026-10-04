// Server-only email capture. Remove public INSERT policies in Supabase so clients
// cannot bypass this endpoint's validation and abuse controls.
const { guard, readBody } = require('./_security');
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function sendJson(res, status, payload) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.status(status).send(JSON.stringify(payload));
}

module.exports = async function handler(req, res) {
  if (!guard(req, res, 'POST', 5)) return;

  let body;
  try { body = await readBody(req); } catch { return sendJson(res, 400, { error: 'Invalid JSON body.' }); }
  if (body.hp) return sendJson(res, 200, { ok: true }); // honeypot caught a bot — fake success

  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
  const consent = body.consent === true;
  const source = body.source === undefined ? 'app' : body.source;
  if (typeof source !== 'string' || source.length > 40 || !/^[A-Za-z0-9 _-]+$/.test(source)) {
    return sendJson(res, 400, { error: 'Invalid source.' });
  }

  if (!EMAIL_RE.test(email) || email.length > 254) return sendJson(res, 400, { error: 'Enter a valid email address.' });
  if (!consent) return sendJson(res, 400, { error: 'Check the box to confirm you want updates.' });
  const SUPABASE_URL = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!SUPABASE_URL || !serviceKey) return sendJson(res, 503, { error: 'Not configured.' });

  try {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/subscribers`, {
      method: 'POST',
      headers: {
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`,
        'Content-Type': 'application/json',
        Prefer: 'return=minimal'
      },
      body: JSON.stringify({ email, consent: true, consent_at: new Date().toISOString(), source })
    });
    if (r.status === 200 || r.status === 201 || r.status === 409) return sendJson(res, 200, { ok: true });
    return sendJson(res, 502, { error: 'Could not save right now. Please try again.' });
  } catch (e) {
    return sendJson(res, 500, { error: 'Network error. Please try again.' });
  }
};
