// Stripe webhook — writes premium entitlements to Supabase on subscription events.
// Required env vars: STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY

function sendJson(res, status, payload) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.status(status).send(JSON.stringify(payload));
}

async function rawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(typeof c === 'string' ? Buffer.from(c) : c));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

async function stripeGet(path, secret) {
  const r = await fetch(`https://api.stripe.com/v1${path}`, {
    headers: { Authorization: `Bearer ${secret}` },
  });
  return r.json();
}

async function upsertEntitlement(supabaseUrl, serviceKey, row) {
  const r = await fetch(`${supabaseUrl}/rest/v1/entitlements`, {
    method: 'POST',
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      'Content-Type': 'application/json',
      Prefer: 'resolution=merge-duplicates,return=minimal',
    },
    body: JSON.stringify(row),
  });
  if (!r.ok) {
    const txt = await r.text();
    throw new Error(`Supabase upsert failed (${r.status}): ${txt}`);
  }
}

function constructEvent(payload, sig, secret) {
  // Manually verify the Stripe webhook signature without the SDK.
  // Header format: t=<ts>,v1=<sig>[,v1=<older>,v0=<legacy>] — parse defensively
  // and accept if ANY v1 matches (Stripe sends multiple during secret rotation).
  const crypto = require('crypto');
  let ts = '';
  const v1s = [];
  for (const part of String(sig).split(',')) {
    const i = part.indexOf('=');
    if (i < 0) continue;
    const key = part.slice(0, i).trim();
    const val = part.slice(i + 1).trim();
    if (key === 't') ts = val;
    else if (key === 'v1') v1s.push(val);
  }
  if (!ts || !v1s.length) throw new Error('Malformed stripe-signature header.');
  const expected = crypto.createHmac('sha256', secret).update(`${ts}.${payload}`, 'utf8').digest();
  const match = v1s.some((v) => {
    try {
      const candidate = Buffer.from(v, 'hex');
      // timing-safe comparison — string !== leaks timing information
      return candidate.length === expected.length && crypto.timingSafeEqual(candidate, expected);
    } catch (e) { return false; }
  });
  if (!match) throw new Error('Webhook signature verification failed.');
  const tolerance = 300; // 5 minutes
  if (Math.abs(Date.now() / 1000 - Number(ts)) > tolerance) throw new Error('Webhook timestamp too old.');
  return JSON.parse(payload);
}

module.exports = async function handler(req, res) {
  if (req.method === 'OPTIONS') return sendJson(res, 200, { ok: true });
  if (req.method !== 'POST') return sendJson(res, 405, { error: 'Method not allowed' });

  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  const stripeKey = process.env.STRIPE_SECRET_KEY;
  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!webhookSecret || !stripeKey || !supabaseUrl || !serviceKey) {
    return sendJson(res, 503, { error: 'Webhook not configured — set STRIPE_WEBHOOK_SECRET, STRIPE_SECRET_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY in environment.' });
  }

  const sig = req.headers['stripe-signature'];
  if (!sig) return sendJson(res, 400, { error: 'Missing stripe-signature header.' });

  let buf;
  try {
    buf = await rawBody(req);
  } catch {
    return sendJson(res, 400, { error: 'Could not read request body.' });
  }

  let event;
  try {
    event = constructEvent(buf.toString('utf8'), sig, webhookSecret);
  } catch (err) {
    return sendJson(res, 400, { error: err.message });
  }

  const obj = event.data.object;

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        if (obj.mode !== 'subscription') break;
        const sub = await stripeGet(`/subscriptions/${obj.subscription}`, stripeKey);
        await upsertEntitlement(supabaseUrl, serviceKey, {
          stripe_customer_id: obj.customer,
          stripe_subscription_id: obj.subscription,
          email: obj.customer_details?.email || obj.customer_email || null,
          status: 'active',
          plan: 'premium',
          current_period_end: sub.current_period_end
            ? new Date(sub.current_period_end * 1000).toISOString()
            : null,
        });
        break;
      }

      case 'customer.subscription.updated': {
        const isActive = obj.status === 'active' || obj.status === 'trialing';
        await upsertEntitlement(supabaseUrl, serviceKey, {
          stripe_customer_id: obj.customer,
          stripe_subscription_id: obj.id,
          status: isActive ? 'active' : 'inactive',
          current_period_end: obj.current_period_end
            ? new Date(obj.current_period_end * 1000).toISOString()
            : null,
        });
        break;
      }

      case 'customer.subscription.deleted': {
        await upsertEntitlement(supabaseUrl, serviceKey, {
          stripe_customer_id: obj.customer,
          stripe_subscription_id: obj.id,
          status: 'cancelled',
          current_period_end: null,
        });
        break;
      }

      case 'invoice.payment_failed': {
        // Mark inactive so the app can surface a payment warning
        await upsertEntitlement(supabaseUrl, serviceKey, {
          stripe_customer_id: obj.customer,
          status: 'payment_failed',
        });
        break;
      }
    }
  } catch (err) {
    console.error('arc90 webhook handler error:', err);
    return sendJson(res, 500, { error: 'Internal error processing event.' });
  }

  return sendJson(res, 200, { received: true });
};
