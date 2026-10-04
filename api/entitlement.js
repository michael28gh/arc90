// Entitlement lookup — lets the app restore Premium purchased via Stripe checkout.
// The Stripe webhook (api/stripe-webhook.js) writes rows to Supabase; this reads them back.
// Required env vars: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY

const { guard } = require('./_security');
function sendJson(res, status, payload) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.status(status).send(JSON.stringify(payload));
}

module.exports = async function handler(req, res) {
  if (!guard(req, res, 'GET', 20)) return;
  const auth = req.headers.authorization;
  if (typeof auth !== 'string' || !/^Bearer [A-Za-z0-9._-]{20,4096}$/.test(auth)) {
    return sendJson(res, 401, { premium: false, error: 'Sign in to restore purchases.' });
  }

  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) {
    return sendJson(res, 503, { premium: false, error: 'Not configured — set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.' });
  }

  try {
    const userResponse = await fetch(`${supabaseUrl}/auth/v1/user`, {
      headers: { apikey: serviceKey, Authorization: auth },
      signal: AbortSignal.timeout(10000),
    });
    if (!userResponse.ok) return sendJson(res, 401, { premium: false, error: 'Invalid session.' });
    const user = await userResponse.json();
    const email = typeof user.email === 'string' ? user.email.trim().toLowerCase() : '';
    if (!email || !user.email_confirmed_at) return sendJson(res, 403, { premium: false, error: 'Verified email required.' });
    const r = await fetch(
      `${supabaseUrl}/rest/v1/entitlements?select=status&email=eq.${encodeURIComponent(email)}`,
      { headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` } }
    );
    if (!r.ok) return sendJson(res, 502, { premium: false, error: 'Lookup failed.' });
    const rows = await r.json();
    const premium = Array.isArray(rows)
      && rows.some((x) => ['active', 'trialing', 'paid'].includes(String(x.status || '').toLowerCase()));
    return sendJson(res, 200, { premium });
  } catch (e) {
    return sendJson(res, 502, { premium: false, error: 'Lookup failed.' });
  }
};
