// Email capture → Supabase `subscribers` (RLS insert-only). Newsletter SENDING is deferred.
// Uses the publishable (anon) key, which is public by design; the insert-only RLS policy
// keeps the list unreadable. No service-role secret is involved.
const SUPABASE_URL = 'https://agnnqsqjcobfmfyijsrs.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_Q_T8Qta5AgAt3aXXyDYYZw_wPTJPyz6';
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function sendJson(res, status, payload) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.status(status).send(JSON.stringify(payload));
}

function readBody(req) {
  return new Promise((resolve) => {
    if (req.body && typeof req.body === 'object') return resolve(req.body);
    if (typeof req.body === 'string') { try { return resolve(JSON.parse(req.body)); } catch (e) { return resolve({}); } }
    let data = '';
    req.on('data', (c) => { data += c; if (data.length > 1e4) req.destroy(); });
    req.on('end', () => { try { resolve(JSON.parse(data || '{}')); } catch (e) { resolve({}); } });
    req.on('error', () => resolve({}));
  });
}

module.exports = async function handler(req, res) {
  if (req.method === 'OPTIONS') return sendJson(res, 200, { ok: true });
  if (req.method !== 'POST') return sendJson(res, 405, { error: 'Method not allowed' });

  const body = await readBody(req);
  if (body.hp) return sendJson(res, 200, { ok: true }); // honeypot caught a bot — fake success

  const email = String(body.email || '').trim().toLowerCase();
  const consent = body.consent === true;
  const source = String(body.source || 'app').slice(0, 40);

  if (!EMAIL_RE.test(email) || email.length > 254) return sendJson(res, 400, { error: 'Enter a valid email address.' });
  if (!consent) return sendJson(res, 400, { error: 'Check the box to confirm you want updates.' });

  try {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/subscribers`, {
      method: 'POST',
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        'Content-Type': 'application/json',
        Prefer: 'return=minimal'
      },
      body: JSON.stringify({ email, consent: true, consent_at: new Date().toISOString(), source })
    });
    if (r.status === 200 || r.status === 201 || r.status === 409) return sendJson(res, 200, { ok: true });
    const detail = (await r.text()).slice(0, 200);
    return sendJson(res, 502, { error: 'Could not save right now. Please try again.', detail });
  } catch (e) {
    return sendJson(res, 500, { error: 'Network error. Please try again.' });
  }
};
