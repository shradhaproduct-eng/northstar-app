const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

function sbAuth(path, body) {
  const base = process.env.SUPABASE_URL.trim();
  const key  = process.env.SUPABASE_ANON_KEY.trim();
  return fetch(`${base}/auth/v1${path}`, {
    method: 'POST',
    headers: {
      'apikey': key,
      'Content-Type': 'application/json',
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

  let body = {};
  try {
    body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
  } catch {
    res.writeHead(400, { ...CORS_HEADERS, 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Invalid JSON body' }));
    return;
  }

  try {
    // ── POST sendMagicLink ────────────────────────────────────
    if (action === 'sendMagicLink') {
      const { email, redirectTo } = body;
      if (!email) {
        res.writeHead(400, { ...CORS_HEADERS, 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'email is required' }));
        return;
      }
      const r = await sbAuth('/magiclink', {
        email,
        ...(redirectTo ? { options: { redirectTo } } : {}),
      });
      // Supabase returns 204 No Content on success
      res.writeHead(r.ok ? 200 : 400, { ...CORS_HEADERS, 'Content-Type': 'application/json' });
      res.end(JSON.stringify(r.ok ? { ok: true } : { error: 'Failed to send magic link' }));
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
