// Entitlement lookup — lets the app restore Premium purchased via Stripe checkout.
// The Stripe webhook (api/stripe-webhook.js) writes rows to Supabase; this reads them back.
// Required env vars: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY

function sendJson(res, status, payload) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.status(status).send(JSON.stringify(payload));
}

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') return sendJson(res, 405, { error: 'GET only' });

  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) {
    return sendJson(res, 503, { premium: false, error: 'Not configured — set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.' });
  }

  const email = String((req.query && req.query.email) || '').trim().toLowerCase();
  if (!email || email.length > 254 || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return sendJson(res, 400, { premium: false, error: 'Valid email required.' });
  }

  try {
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
