(() => {
  'use strict';
  const storageKey = 'arc90.auth.session';
  let configPromise;
  let refreshing;
  let generation = 0;
  let session = null;
  try { session = JSON.parse(sessionStorage.getItem(storageKey) || 'null'); } catch {}

  function remember(value) {
    session = value;
    try {
      if (value) sessionStorage.setItem(storageKey, JSON.stringify(value));
      else sessionStorage.removeItem(storageKey);
    } catch { /* Keep the session in memory when storage is unavailable. */ }
  }
  function emailValue(value) {
    const email = String(value || '').trim().toLowerCase();
    if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('Enter a valid email address.');
    return email;
  }
  async function config() {
    if (!configPromise) configPromise = fetch('/api/auth-config', { cache: 'no-store', signal: AbortSignal.timeout(10000) }).then(async (res) => {
      if (!res.ok) throw new Error('Sign-in is not available in this build yet.');
      const value = await res.json();
      if (new URL(value.url).protocol !== 'https:' || !value.key) throw new Error('Sign-in configuration is unavailable.');
      return value;
    }).catch((error) => { configPromise = null; throw error; });
    return configPromise;
  }
  async function authRequest(path, body) {
    const cfg = await config();
    const response = await fetch(`${cfg.url}/auth/v1/${path}`, {
      method: 'POST', headers: { apikey: cfg.key, 'Content-Type': 'application/json' },
      body: JSON.stringify(body), signal: AbortSignal.timeout(20000),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      if (response.status === 429) throw new Error('Too many attempts. Wait a minute and try again.');
      throw new Error(path === 'verify' ? 'That code is invalid or expired. Request a new one.' : 'Sign-in could not be completed. Please try again.');
    }
    return data;
  }
  function saveTokens(data) {
    if (!data.access_token || !data.refresh_token) throw new Error('Sign-in did not return a session.');
    remember({ access_token: data.access_token, refresh_token: data.refresh_token,
      expires_at: data.expires_at || Math.floor(Date.now() / 1000) + (data.expires_in || 3600) });
  }
  window.arc90Auth = {
    isSignedIn: () => !!session?.access_token,
    async requestCode(email) { await authRequest('otp', { email: emailValue(email), create_user: true }); },
    async verifyCode(email, code) {
      const token = String(code || '').trim();
      if (!/^\d{6,8}$/.test(token)) throw new Error('Enter the code from your email.');
      const attempt = ++generation;
      const data = await authRequest('verify', { email: emailValue(email), token, type: 'email' });
      if (attempt === generation) saveTokens(data);
    },
    async getAccessToken() {
      if (!session?.access_token) return null;
      if (session.expires_at * 1000 > Date.now() + 60000) return session.access_token;
      if (!refreshing) {
        const attempt = generation;
        const pending = authRequest('token?grant_type=refresh_token', { refresh_token: session.refresh_token })
          .then((data) => { if (attempt !== generation) return null; saveTokens(data); return session.access_token; })
          .catch(() => { if (attempt === generation) remember(null); return null; })
          .finally(() => { if (refreshing === pending) refreshing = null; });
        refreshing = pending;
      }
      return refreshing;
    },
    signOut() { generation++; refreshing = null; remember(null); },
  };
})();
