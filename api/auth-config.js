module.exports = function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'GET') { res.setHeader('Allow', 'GET'); return res.status(405).json({ error: 'Method not allowed.' }); }
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_ANON_KEY;
  let valid = false;
  try { valid = new URL(url).protocol === 'https:'; } catch {}
  // Only the public/anon client credential may be delivered to a browser.
  let publicKey = typeof key === 'string' && key.startsWith('sb_publishable_');
  if (typeof key === 'string' && key.split('.').length === 3) {
    try { publicKey = JSON.parse(Buffer.from(key.split('.')[1], 'base64url')).role === 'anon'; } catch {}
  }
  if (!valid || !publicKey) return res.status(503).json({ error: 'Sign-in is not configured yet.' });
  return res.status(200).json({ url, key });
};
