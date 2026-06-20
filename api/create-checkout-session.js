function sendJson(res, status, payload) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.status(status).send(JSON.stringify(payload));
}

function siteUrl(req) {
  const configured = process.env.SITE_URL;
  if (configured && /^https?:\/\//.test(configured)) return configured.replace(/\/+$/, '');

  const origin = req.headers.origin;
  if (origin && /^https?:\/\//.test(origin)) return origin.replace(/\/+$/, '');

  const host = req.headers['x-forwarded-host'] || req.headers.host;
  const proto = req.headers['x-forwarded-proto'] || 'https';
  return `${proto}://${host}`;
}

module.exports = async function handler(req, res) {
  if (req.method === 'OPTIONS') return sendJson(res, 200, { ok: true });
  if (req.method !== 'POST') return sendJson(res, 405, { error: 'Method not allowed' });

  const secretKey = process.env.STRIPE_SECRET_KEY;
  const priceId = process.env.STRIPE_PRICE_ID;

  if (!secretKey || !priceId) {
    return sendJson(res, 503, {
      error: 'Stripe is not configured yet. Add STRIPE_SECRET_KEY and STRIPE_PRICE_ID in production.'
    });
  }

  const baseUrl = siteUrl(req);
  const params = new URLSearchParams();
  params.set('mode', 'subscription');
  params.set('line_items[0][price]', priceId);
  params.set('line_items[0][quantity]', '1');
  params.set('allow_promotion_codes', 'true');
  params.set('billing_address_collection', 'auto');
  params.set('success_url', `${baseUrl}/index.html?checkout=success`);
  params.set('cancel_url', `${baseUrl}/index.html?checkout=canceled`);
  params.set('metadata[app]', 'arc90');

  try {
    const stripeRes = await fetch('https://api.stripe.com/v1/checkout/sessions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${secretKey}`,
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: params
    });

    const text = await stripeRes.text();
    let payload;
    try {
      payload = JSON.parse(text);
    } catch (e) {
      payload = { raw: text };
    }

    if (!stripeRes.ok) {
      return sendJson(res, 502, {
        error: payload.error && payload.error.message ? payload.error.message : 'Stripe Checkout failed.'
      });
    }

    if (!payload.url) return sendJson(res, 502, { error: 'Stripe did not return a Checkout URL.' });
    return sendJson(res, 200, { url: payload.url });
  } catch (err) {
    return sendJson(res, 500, { error: 'Could not reach Stripe Checkout.' });
  }
};
