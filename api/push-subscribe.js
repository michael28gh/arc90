// Register (or remove) a Web Push subscription with reminder preferences.
// Privacy: stores only the push endpoint + mode/time/timezone — no personal content.
// Required env vars: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY

function sendJson(res, status, payload) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.status(status).send(JSON.stringify(payload));
}

async function readBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  return new Promise((resolve) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))); }
      catch (e) { resolve(null); }
    });
    req.on('error', () => resolve(null));
  });
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return sendJson(res, 405, { error: 'POST only' });

  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) return sendJson(res, 503, { ok: false, error: 'Not configured.' });

  const body = await readBody(req);
  if (!body) return sendJson(res, 400, { ok: false, error: 'Invalid JSON.' });

  const clientId = String(body.clientId || '').trim();
  if (!/^[A-Za-z0-9_-]{8,64}$/.test(clientId)) return sendJson(res, 400, { ok: false, error: 'Invalid clientId.' });

  const headers = {
    apikey: serviceKey,
    Authorization: `Bearer ${serviceKey}`,
    'Content-Type': 'application/json',
  };

  try {
    // Unsubscribe: mode off or no subscription → delete the row.
    const mode = String(body.mode || 'daily');
    if (mode === 'off' || !body.subscription) {
      await fetch(`${supabaseUrl}/rest/v1/push_subscriptions?client_id=eq.${encodeURIComponent(clientId)}`, {
        method: 'DELETE', headers,
      });
      return sendJson(res, 200, { ok: true, subscribed: false });
    }

    if (!['daily', '4h', '2h'].includes(mode)) return sendJson(res, 400, { ok: false, error: 'Invalid mode.' });
    const sub = body.subscription;
    if (!sub || typeof sub.endpoint !== 'string' || !sub.endpoint.startsWith('https://') || sub.endpoint.length > 1024) {
      return sendJson(res, 400, { ok: false, error: 'Invalid subscription.' });
    }
    const time = /^([01]?\d|2[0-3]):[0-5]\d$/.test(String(body.time || '')) ? String(body.time) : '08:00';
    const tz = Math.max(-840, Math.min(840, Number(body.tzOffsetMin) || 0));

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
      const txt = await r.text();
      return sendJson(res, 502, { ok: false, error: `Store failed (${r.status}): ${txt.slice(0, 200)}` });
    }
    return sendJson(res, 200, { ok: true, subscribed: true });
  } catch (e) {
    return sendJson(res, 502, { ok: false, error: 'Store failed.' });
  }
};
