// Register (or remove) a Web Push subscription with reminder preferences.
// Privacy: stores only the push endpoint + mode/time/timezone — no personal content.
// Required env vars: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY

const { guard, readBody, validSubscription } = require('./_security');
function sendJson(res, status, payload) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.status(status).send(JSON.stringify(payload));
}

module.exports = async function handler(req, res) {
  if (!guard(req, res, 'POST', 10)) return;

  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) return sendJson(res, 503, { ok: false, error: 'Not configured.' });

  let body;
  try { body = await readBody(req); } catch { return sendJson(res, 400, { ok: false, error: 'Invalid JSON.' }); }

  const clientId = String(body.clientId || '').trim();
  // A random UUID acts as a private per-installation capability, not an account ID.
  if (!/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(clientId)) return sendJson(res, 400, { ok: false, error: 'Invalid clientId.' });

  const headers = {
    apikey: serviceKey,
    Authorization: `Bearer ${serviceKey}`,
    'Content-Type': 'application/json',
  };

  try {
    // Unsubscribe: mode off or no subscription → delete the row.
    const mode = String(body.mode || 'daily');
    if (mode === 'off') {
      const deleted = await fetch(`${supabaseUrl}/rest/v1/push_subscriptions?client_id=eq.${encodeURIComponent(clientId)}`, {
        method: 'DELETE', headers,
      });
      if (!deleted.ok) return sendJson(res, 502, { ok: false, error: 'Store failed.' });
      return sendJson(res, 200, { ok: true, subscribed: false });
    }

    if (!['daily', '4h', '2h'].includes(mode)) return sendJson(res, 400, { ok: false, error: 'Invalid mode.' });
    const sub = body.subscription;
    if (!validSubscription(sub)) {
      return sendJson(res, 400, { ok: false, error: 'Invalid subscription.' });
    }
    const time = body.time === undefined ? '08:00' : body.time;
    const tz = body.tzOffsetMin === undefined ? 0 : body.tzOffsetMin;
    if (typeof time !== 'string' || !/^([01]?\d|2[0-3]):[0-5]\d$/.test(time) ||
        !Number.isInteger(tz) || Math.abs(tz) > 840) {
      return sendJson(res, 400, { ok: false, error: 'Invalid reminder preferences.' });
    }

    const r = await fetch(`${supabaseUrl}/rest/v1/push_subscriptions?on_conflict=client_id`, {
      method: 'POST',
      headers: { ...headers, Prefer: 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify({
        client_id: clientId,
        subscription: sub,
        mode,
        remind_time: time,
        tz_offset_min: tz,
        updated_at: new Date().toISOString(),
      }),
    });
    if (!r.ok) {
      return sendJson(res, 502, { ok: false, error: 'Store failed.' });
    }
    return sendJson(res, 200, { ok: true, subscribed: true });
  } catch (e) {
    return sendJson(res, 502, { ok: false, error: 'Store failed.' });
  }
};
