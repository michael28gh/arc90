function sendJson(res, status, payload) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.status(status).send(JSON.stringify(payload));
}

const { guard, siteUrl } = require('./_security');

module.exports = async function handler(req, res) {
  if (!guard(req, res, 'POST', 5)) return;

  const secretKey = process.env.STRIPE_SECRET_KEY;
  const priceId = process.env.STRIPE_PRICE_ID;

  if (!secretKey || !priceId) {
    return sendJson(res, 503, {
      error: 'Stripe is not configured yet. Add STRIPE_SECRET_KEY and STRIPE_PRICE_ID in production.'
    });
  }

  let baseUrl;
  try { baseUrl = siteUrl(); } catch { return sendJson(res, 503, { error: 'Site not configured.' }); }
  const params = new URLSearchParams();
  params.set('mode', 'subscription');
  params.set('line_items[0][price]', priceId);
  params.set('line_items[0][quantity]', '1');
  params.set('allow_promotion_codes', 'true');
  params.set('billing_address_collection', 'auto');
  params.set('success_url', `${baseUrl}/app?checkout=success&session_id={CHECKOUT_SESSION_ID}`);
  params.set('cancel_url', `${baseUrl}/app?checkout=canceled`);
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
        error: 'Stripe Checkout failed.'
      });
    }

    if (!payload.url) return sendJson(res, 502, { error: 'Stripe did not return a Checkout URL.' });
    return sendJson(res, 200, { url: payload.url });
  } catch (err) {
    return sendJson(res, 500, { error: 'Could not reach Stripe Checkout.' });
  }
};
