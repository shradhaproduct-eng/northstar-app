const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

function sbPost(path, body, token) {
  const base = process.env.SUPABASE_URL.trim();
  const key  = process.env.SUPABASE_ANON_KEY.trim();
  return fetch(`${base}/auth/v1${path}`, {
    method: 'POST',
    headers: {
      'apikey': key,
      'Content-Type': 'application/json',
      ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
}

function sbPut(path, body, token) {
  const base = process.env.SUPABASE_URL.trim();
  const key  = process.env.SUPABASE_ANON_KEY.trim();
  return fetch(`${base}/auth/v1${path}`, {
    method: 'PUT',
    headers: {
      'apikey': key,
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });
}

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    res.writeHead(204, CORS_HEADERS);
    res.end();
    return;
  }

  if (req.method !== 'POST') {
    res.writeHead(405, { ...CORS_HEADERS, 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Method not allowed' }));
    return;
  }

  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_ANON_KEY) {
    res.writeHead(500, { ...CORS_HEADERS, 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Supabase env vars not set' }));
    return;
  }

  const urlObj = new URL(req.url, 'http://localhost');
  const action = urlObj.searchParams.get('action');
  const userToken = (req.headers['authorization'] || '').replace(/^Bearer\s+/i, '') || null;

  let body = {};
  try {
    body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
  } catch {
    res.writeHead(400, { ...CORS_HEADERS, 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Invalid JSON body' }));
    return;
  }

  try {
    // ── POST signUp ───────────────────────────────────────────
    if (action === 'signUp') {
      const { email, password } = body;
      if (!email || !password) {
        res.writeHead(400, { ...CORS_HEADERS, 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Email and password are required' }));
        return;
      }
      const r = await sbPost('/signup', { email, password });
      const data = await r.json();
      if (!r.ok) {
        res.writeHead(400, { ...CORS_HEADERS, 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: data.msg || data.message || 'Sign up failed' }));
        return;
      }
      res.writeHead(200, { ...CORS_HEADERS, 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        access_token: data.access_token,
        refresh_token: data.refresh_token,
        user_id: data.user?.id,
      }));
      return;
    }

    // ── POST signIn ───────────────────────────────────────────
    if (action === 'signIn') {
      const { email, password } = body;
      if (!email || !password) {
        res.writeHead(400, { ...CORS_HEADERS, 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Email and password are required' }));
        return;
      }
      const r = await sbPost('/token?grant_type=password', { email, password });
      const data = await r.json();
      if (!r.ok) {
        res.writeHead(400, { ...CORS_HEADERS, 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: data.error_description || data.msg || 'Invalid email or password' }));
        return;
      }
      res.writeHead(200, { ...CORS_HEADERS, 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        access_token: data.access_token,
        refresh_token: data.refresh_token,
        user_id: data.user?.id,
      }));
      return;
    }

    // ── POST forgotPassword ───────────────────────────────────
    if (action === 'forgotPassword') {
      const { email, redirectTo } = body;
      if (!email) {
        res.writeHead(400, { ...CORS_HEADERS, 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Email is required' }));
        return;
      }
      const r = await sbPost('/recover', { email, ...(redirectTo ? { redirectTo } : {}) });
      res.writeHead(200, { ...CORS_HEADERS, 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true })); // always 200 to avoid email enumeration
      return;
    }

    // ── POST resetPassword ────────────────────────────────────
    // Requires Authorization: Bearer {recovery_token}
    if (action === 'resetPassword') {
      const { password } = body;
      if (!password) {
        res.writeHead(400, { ...CORS_HEADERS, 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Password is required' }));
        return;
      }
      if (!userToken) {
        res.writeHead(401, { ...CORS_HEADERS, 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'No auth token provided' }));
        return;
      }
      const r = await sbPut('/user', { password }, userToken);
      const data = await r.json();
      if (!r.ok) {
        res.writeHead(400, { ...CORS_HEADERS, 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: data.msg || data.message || 'Password reset failed' }));
        return;
      }
      res.writeHead(200, { ...CORS_HEADERS, 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true }));
      return;
    }

    res.writeHead(400, { ...CORS_HEADERS, 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: `Unknown action: ${action}` }));

  } catch (err) {
    console.error('[/api/auth] error:', err);
    res.writeHead(500, { ...CORS_HEADERS, 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: err.message }));
  }
}
