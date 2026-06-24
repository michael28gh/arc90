// Server-verified premium: confirm a Stripe Checkout session was actually PAID before the
// app grants premium. Closes the honor-system leak (a bare ?checkout=success can no longer
// unlock premium — the app must present a real, paid session_id Stripe issued).
function sendJson(res, status, payload) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.status(status).send(JSON.stringify(payload));
}

module.exports = async function handler(req, res) {
  if (req.method === 'OPTIONS') return sendJson(res, 200, { ok: true });

  const sessionId = (req.query && req.query.session_id) || '';
  if (!sessionId || !/^cs_[A-Za-z0-9_]+$/.test(sessionId)) return sendJson(res, 400, { error: 'Missing or invalid session_id' });

  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) return sendJson(res, 503, { error: 'Stripe is not configured.' });

  try {
    const r = await fetch(`https://api.stripe.com/v1/checkout/sessions/${encodeURIComponent(sessionId)}`, {
      headers: { Authorization: `Bearer ${secretKey}` }
    });
    const s = await r.json();
    if (!r.ok) return sendJson(res, 502, { error: (s.error && s.error.message) || 'Stripe lookup failed.' });

    const paid = s.payment_status === 'paid' || s.status === 'complete';
    const email = (s.customer_details && s.customer_details.email) || s.customer_email || '';
    return sendJson(res, 200, { paid: !!paid, email });
  } catch (e) {
    return sendJson(res, 500, { error: 'Could not reach Stripe.' });
  }
};
