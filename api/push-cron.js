// Scheduled push sender — invoked by Vercel Cron (Authorization: Bearer CRON_SECRET
// is attached automatically by Vercel when the CRON_SECRET env var is set).
// Sends a generic nudge per subscriber based on their reminder mode/time/timezone.
// Payloads never contain personal content.
// Required env vars: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
//                    VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT, CRON_SECRET

const webpush = require('web-push');

function sendJson(res, status, payload) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.status(status).send(JSON.stringify(payload));
}

const COPY = {
  daily: { title: 'Arc90', body: 'Your reps are waiting. One small action keeps the arc alive.' },
  '4h':  { title: 'Arc90 · Pulse', body: 'Quick check-in — is today’s arc still moving?' },
  '2h':  { title: 'Arc90 · Hardcore', body: 'No slipping. Log the next rep.' },
};

// Slots in local minutes-of-day for a subscriber, mirroring the in-app reminderSlots().
function slotsFor(mode, remindTime) {
  const [hh, mm] = String(remindTime || '08:00').split(':').map((n) => Number(n) || 0);
  const start = Math.max(0, Math.min(23 * 60 + 59, hh * 60 + mm));
  if (mode === 'daily') return [start];
  const step = mode === '2h' ? 120 : 240;
  const slots = [];
  for (let m = start; m <= 22 * 60; m += step) slots.push(m);
  return slots.length ? slots : [start];
}

module.exports = async function handler(req, res) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers && req.headers.authorization;
  if (!secret || auth !== `Bearer ${secret}`) return sendJson(res, 401, { error: 'Unauthorized' });

  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const vapidPub = process.env.VAPID_PUBLIC_KEY;
  const vapidPriv = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT || 'mailto:michael28gh@gmail.com';
  if (!supabaseUrl || !serviceKey || !vapidPub || !vapidPriv) {
    return sendJson(res, 503, { error: 'Not configured.' });
  }
  webpush.setVapidDetails(subject, vapidPub, vapidPriv);

  const headers = { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, 'Content-Type': 'application/json' };

  try {
    const r = await fetch(`${supabaseUrl}/rest/v1/push_subscriptions?select=*`, { headers });
    if (!r.ok) return sendJson(res, 502, { error: 'Load failed.' });
    const subs = await r.json();

    let sent = 0, skipped = 0, removed = 0;

    for (const row of subs) {
      // This cron runs ONCE a day (Hobby-plan limit), so the old "past the slot"
      // gate (localMin >= slot) meant a reminder set later than the cron hour
      // could NEVER send. On a daily cron the only correct behavior is one nudge
      // per subscriber per run, deduped to ~20h. (Sub-daily modes need a more
      // frequent trigger — e.g. an external pinger hitting this endpoint.)
      const last = row.last_sent_at ? new Date(row.last_sent_at).getTime() : 0;
      const fresh = Date.now() - last < 20 * 60 * 60 * 1000;
      if (fresh) { skipped++; continue; }

      const copy = COPY[row.mode] || COPY.daily;
      try {
        await webpush.sendNotification(row.subscription, JSON.stringify({ ...copy, url: '/app' }), { TTL: 4 * 3600 });
        sent++;
        await fetch(`${supabaseUrl}/rest/v1/push_subscriptions?client_id=eq.${encodeURIComponent(row.client_id)}`, {
          method: 'PATCH', headers, body: JSON.stringify({ last_sent_at: new Date().toISOString() }),
        });
      } catch (err) {
        // Gone/expired subscription → clean up.
        if (err && (err.statusCode === 404 || err.statusCode === 410)) {
          removed++;
          await fetch(`${supabaseUrl}/rest/v1/push_subscriptions?client_id=eq.${encodeURIComponent(row.client_id)}`, {
            method: 'DELETE', headers,
          });
        }
      }
    }
    return sendJson(res, 200, { ok: true, sent, skipped, removed, total: subs.length });
  } catch (e) {
    return sendJson(res, 502, { error: 'Cron failed.' });
  }
};
