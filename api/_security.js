const buckets = new Map();

function fail(res, status, error) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.status(status).send(JSON.stringify({ error }));
  return false;
}

function siteUrl() {
  const url = new URL(process.env.SITE_URL || 'http://localhost:5180');
  if (url.username || url.password || url.pathname !== '/' || url.search || url.hash ||
      !['http:', 'https:'].includes(url.protocol) ||
      (process.env.VERCEL && (!process.env.SITE_URL || url.protocol !== 'https:'))) {
    throw new Error('Invalid SITE_URL');
  }
  return url.origin;
}

function guard(req, res, method, limit = 30) {
  if (req.method !== method) {
    res.setHeader('Allow', method);
    return fail(res, 405, 'Method not allowed');
  }
  if (process.env.VERCEL_ENV === 'production' && req.headers['x-forwarded-proto'] !== 'https') {
    return fail(res, 403, 'HTTPS required');
  }
  if (req.headers.origin) {
    let allowed;
    try { allowed = siteUrl(); } catch { return fail(res, 503, 'Site not configured'); }
    if (![allowed, 'capacitor://localhost', 'http://localhost', 'https://localhost'].includes(req.headers.origin)) {
      return fail(res, 403, 'Origin not allowed');
    }
  }
  // Per-instance backstop only. Configure Vercel WAF for distributed enforcement.
  const now = Date.now();
  for (const [key, value] of buckets) if (value.until <= now) buckets.delete(key);
  const ip = process.env.VERCEL
    ? req.headers['x-vercel-forwarded-for'] || 'unknown'
    : req.socket?.remoteAddress || 'local';
  const key = `${String(req.url || '').split('?')[0]}:${ip}`;
  const bucket = buckets.get(key) || { count: 0, until: now + 60000 };
  if (bucket.count >= limit || (!buckets.has(key) && buckets.size >= 10000)) {
    res.setHeader('Retry-After', '60');
    return fail(res, 429, 'Too many requests. Try again later.');
  }
  bucket.count++;
  buckets.set(key, bucket);
  return true;
}

async function readBody(req, max = 16384) {
  if (!/^application\/json(?:;|$)/i.test(req.headers['content-type'] || '')) throw new Error('JSON required');
  let value = req.body;
  if (value === undefined) {
    const chunks = [];
    let size = 0;
    for await (const chunk of req) {
      size += Buffer.byteLength(chunk);
      if (size > max) throw new Error('Body too large');
      chunks.push(Buffer.from(chunk));
    }
    value = Buffer.concat(chunks).toString('utf8');
  }
  if (Buffer.isBuffer(value)) value = value.toString('utf8');
  if (Buffer.byteLength(typeof value === 'string' ? value : JSON.stringify(value)) > max) throw new Error('Body too large');
  if (typeof value === 'string') value = JSON.parse(value);
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Object required');
  return value;
}

function validSubscription(sub) {
  try {
    const url = new URL(sub.endpoint);
    const host = url.hostname;
    const allowed = host === 'fcm.googleapis.com' || host === 'updates.push.services.mozilla.com' ||
      host === 'web.push.apple.com' || host.endsWith('.push.apple.com') ||
      host.endsWith('.notify.windows.com');
    return allowed && url.protocol === 'https:' && !url.username && !url.password &&
      !url.port && !url.hash && sub.endpoint.length <= 1024 &&
      /^[A-Za-z0-9_-]{87}={0,2}$/.test(sub.keys.p256dh) &&
      /^[A-Za-z0-9_-]{22}={0,2}$/.test(sub.keys.auth);
  } catch { return false; }
}

module.exports = { guard, readBody, siteUrl, validSubscription };
