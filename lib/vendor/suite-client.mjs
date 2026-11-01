/**
 * First-party OAuth client for jonathantipper.com applications.
 * Keep credentials on the application's own origin. The central site's cookies
 * and the upstream-provider PKCE verifier never enter this adapter.
 */
export class SuiteAuthError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'SuiteAuthError';
    this.code = code;
  }
}

const transactionLifetime = 10 * 60 * 1000;
const sessionLimit = 64 * 1024;
const localHosts = new Set(['localhost', '127.0.0.1', '[::1]']);

export function safeReturnPath(value, fallback = '/') {
  if (typeof value !== 'string' || value.length > 2048 || !value.startsWith('/') || value.startsWith('//')) return fallback;
  let decoded = value;
  for (let i = 0; i < 3; i++) {
    if (/[\\\u0000-\u0020\u007f]/.test(decoded) || decoded.startsWith('//') || !decoded.startsWith('/')) return fallback;
    try {
      const next = decodeURIComponent(decoded);
      if (next === decoded) break;
      decoded = next;
    } catch { return fallback; }
  }
  try {
    const u = new URL(value, 'https://app.invalid');
    return u.origin === 'https://app.invalid' ? u.pathname + u.search + u.hash : fallback;
  } catch { return fallback; }
}

function trustedUrl(value, name) {
  let url;
  try { url = new URL(value); } catch { throw new SuiteAuthError('configuration', `${name} must be an absolute URL.`); }
  if (url.username || url.password || url.hash || url.search || (url.protocol !== 'https:' && !(url.protocol === 'http:' && localHosts.has(url.hostname)))) {
    throw new SuiteAuthError('configuration', `${name} must use HTTPS or a loopback development origin.`);
  }
  return url;
}

function randomValue() {
  return Array.from(crypto.getRandomValues(new Uint8Array(32)), (b) => b.toString(16).padStart(2, '0')).join('');
}

async function challenge(verifier) {
  const bytes = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier)));
  return btoa(String.fromCharCode(...bytes)).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
}

function parseStored(value) {
  if (typeof value !== 'string' || value.length > sessionLimit) return null;
  try { return JSON.parse(value); } catch { return null; }
}

function validSession(value) {
  return value && typeof value.accessToken === 'string' && value.accessToken.length > 0 &&
    typeof value.refreshToken === 'string' && value.refreshToken.length > 0 &&
    Number.isFinite(value.expiresAt) && typeof value.revision === 'string';
}

/** Use sessionStorage for transactions; localStorage for app-owned sessions. */
export function browserSuiteStore(namespace = 'jt-suite') {
  return {
    async get(key) { return (key.includes(':transaction:') ? sessionStorage : localStorage).getItem(`${namespace}:${key}`); },
    async set(key, value) { (key.includes(':transaction:') ? sessionStorage : localStorage).setItem(`${namespace}:${key}`, value); },
    async remove(key) { (key.includes(':transaction:') ? sessionStorage : localStorage).removeItem(`${namespace}:${key}`); }
  };
}

/**
 * store: async { get(key), set(key,value), remove(key) }.
 * Server clients should provide their own host-only session store and lock.
 * Browser clients use Web Locks where available, with an in-instance fallback.
 * Never use these tokens as proof of identity without server-side verification.
 */
export function createSuiteClient(config) {
  const issuer = trustedUrl(config.supabaseUrl, 'supabaseUrl');
  if (issuer.pathname !== '/') throw new SuiteAuthError('configuration', 'supabaseUrl must be a project origin.');
  const callback = trustedUrl(config.redirectUri, 'redirectUri');
  if (typeof config.clientId !== 'string' || !config.clientId || config.clientId.length > 200) throw new SuiteAuthError('configuration', 'A registered client ID is required.');
  const store = config.store ?? browserSuiteStore();
  const transport = config.fetch ?? globalThis.fetch;
  const now = config.now ?? Date.now;
  const prefix = `suite:${issuer.origin}:${config.clientId}:${callback.origin}`;
  const sessionKey = `${prefix}:session`;
  const epochKey = `${prefix}:epoch`;
  const tokenUrl = `${issuer.origin}/auth/v1/oauth/token`;
  const headers = { 'Content-Type': 'application/x-www-form-urlencoded', ...(config.publishableKey ? { apikey: config.publishableKey } : {}) };
  let renewal = null;
  let mutationQueue = Promise.resolve();

  async function session() {
    const s = parseStored(await store.get(sessionKey));
    return validSession(s) ? s : null;
  }

  async function tokenRequest(body) {
    let response;
    try {
      response = await transport(tokenUrl, { method: 'POST', headers, body: new URLSearchParams(body).toString(), cache: 'no-store', credentials: 'omit', redirect: 'error', signal: AbortSignal.timeout(15000) });
    } catch {
      throw new SuiteAuthError('network', 'Sign-in could not reach the account service. Try again.');
    }
    if (!response.ok) throw new SuiteAuthError(response.status >= 500 ? 'service' : 'session_expired', 'This sign-in session could not be renewed. Sign in again.');
    let data;
    try { data = await response.json(); } catch { throw new SuiteAuthError('response', 'The account service returned an invalid response.'); }
    if (typeof data.access_token !== 'string' || !data.access_token || typeof data.refresh_token !== 'string' || !data.refresh_token ||
      !Number.isFinite(data.expires_in) || data.expires_in < 1 || data.expires_in > 604800 || String(data.token_type).toLowerCase() !== 'bearer') {
      throw new SuiteAuthError('response', 'The account service returned an invalid session.');
    }
    return { accessToken: data.access_token, refreshToken: data.refresh_token, expiresAt: now() + data.expires_in * 1000, revision: randomValue() };
  }

  async function locked(task) {
    const work = mutationQueue.then(() => {
      if (config.lock) return config.lock(sessionKey, task);
      if (globalThis.navigator?.locks) return navigator.locks.request(sessionKey, task);
      return task();
    });
    mutationQueue = work.catch(() => {});
    return work;
  }

  async function epoch() {
    let value = await store.get(epochKey);
    if (!value) { value = randomValue(); await store.set(epochKey, value); }
    return value;
  }

  async function refresh() {
    if (renewal) return renewal;
    renewal = (async () => {
      const original = await session();
      if (!original) throw new SuiteAuthError('signed_out', 'Sign in to continue.');
      return locked(async () => {
      const current = await session();
      if (!current) throw new SuiteAuthError('signed_out', 'Sign in to continue.');
      // Another tab may have renewed while this tab waited for the lock.
      if (current.revision !== original.revision) return current;
      try {
        const next = await tokenRequest({ grant_type: 'refresh_token', client_id: config.clientId, refresh_token: current.refreshToken });
        const latest = await session();
        if (!latest || latest.revision !== current.revision) {
          if (latest) return latest;
          throw new SuiteAuthError('signed_out', 'You signed out while the session was renewing.');
        }
        await store.set(sessionKey, JSON.stringify(next));
        return next;
      } catch (error) {
        if (error instanceof SuiteAuthError && error.code === 'session_expired') {
          const latest = await session();
          if (latest?.revision === current.revision) await store.remove(sessionKey);
        }
        throw error;
      }
      });
    })().finally(() => { renewal = null; });
    return renewal;
  }

  return {
    async authorisationUrl(next = '/') {
      const state = randomValue();
      const verifier = randomValue();
      const nonce = randomValue();
      await locked(async () => {
        const record = { state, verifier, nonce, epoch: await epoch(), clientId: config.clientId, redirectUri: callback.href, issuer: issuer.origin, next: safeReturnPath(next), expiresAt: now() + transactionLifetime };
        await store.set(`${prefix}:transaction:${state}`, JSON.stringify(record));
      });
      const url = new URL('/auth/v1/oauth/authorize', issuer);
      url.search = new URLSearchParams({ response_type: 'code', client_id: config.clientId, redirect_uri: callback.href, scope: 'openid email profile', state, nonce, code_challenge_method: 'S256', code_challenge: await challenge(verifier) }).toString();
      return url.href;
    },

    async complete(callbackUrl) {
      let url;
      try { url = new URL(callbackUrl); } catch { throw new SuiteAuthError('callback', 'The sign-in return URL is invalid.'); }
      if (url.origin !== callback.origin || url.pathname !== callback.pathname || url.hash || url.username || url.password) throw new SuiteAuthError('callback', 'The sign-in return URL is not registered for this app.');
      const state = url.searchParams.get('state');
      if (!state || !/^[a-f0-9]{64}$/.test(state) || url.searchParams.getAll('state').length !== 1) throw new SuiteAuthError('state', 'This sign-in request could not be matched. Start again in this browser.');
      const key = `${prefix}:transaction:${state}`;
      const record = await locked(async () => {
        const transaction = parseStored(await store.get(key));
        if (!transaction || transaction.state !== state || transaction.clientId !== config.clientId || transaction.redirectUri !== callback.href || transaction.issuer !== issuer.origin || transaction.epoch !== await epoch() || !Number.isFinite(transaction.expiresAt) || transaction.expiresAt <= now()) throw new SuiteAuthError('state', 'This sign-in request has expired or was opened in another browser. Start again.');
        await store.remove(key);
        return transaction;
      });
      if (url.searchParams.has('error')) throw new SuiteAuthError('cancelled', 'Sign-in was cancelled. You can start again when you are ready.');
      const code = url.searchParams.get('code');
      if (!code || code.length > 4096 || url.searchParams.getAll('code').length !== 1) throw new SuiteAuthError('callback', 'The account service did not return a valid sign-in code.');
      const nextSession = await tokenRequest({ grant_type: 'authorization_code', client_id: config.clientId, redirect_uri: callback.href, code_verifier: record.verifier, code });
      await locked(async () => {
        if (record.epoch !== await epoch()) throw new SuiteAuthError('signed_out', 'This sign-in request was cancelled by sign-out. Start a new sign-in.');
        await store.set(sessionKey, JSON.stringify(nextSession));
      });
      return { next: safeReturnPath(record.next), session: nextSession };
    },

    getSession: session,
    refresh,
    async accessToken() {
      const current = await session();
      if (!current) return null;
      return (current.expiresAt > now() + 30000 ? current : await refresh()).accessToken;
    },

    async signOut({ scope = 'local' } = {}) {
      if (!['local', 'global'].includes(scope)) throw new SuiteAuthError('scope', 'Choose a supported sign-out scope.');
      await locked(async () => {
        let current = await session();
        // Share the final-write lock with refresh/completion, including async
        // stores. A persistent epoch also cancels callbacks on other tabs.
        await store.set(epochKey, randomValue());
        await store.remove(sessionKey);
        if (!current) return;
        if (current.expiresAt <= now() + 5000) {
          try { current = await tokenRequest({ grant_type: 'refresh_token', client_id: config.clientId, refresh_token: current.refreshToken }); }
          catch { throw new SuiteAuthError('logout_service', 'This app has signed out locally. Account-service revocation could not be confirmed.'); }
        }
        let response;
        try {
          response = await transport(`${issuer.origin}/auth/v1/logout?scope=${scope}`, { method: 'POST', headers: { Authorization: `Bearer ${current.accessToken}`, ...(config.publishableKey ? { apikey: config.publishableKey } : {}) }, cache: 'no-store', credentials: 'omit', redirect: 'error', signal: AbortSignal.timeout(15000) });
        } catch { throw new SuiteAuthError('logout_network', 'This app has signed out locally. The account service could not be reached to revoke the session.'); }
        if (!response.ok) throw new SuiteAuthError('logout_service', 'This app has signed out locally. Account-service revocation could not be confirmed.');
      });
      // A global request revokes refresh tokens. Other origins must clear their
      // own cookies/state; issued access JWTs retain their documented lifetime.
    }
  };
}
