const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

const MODELS = ['flux', 'turbo'];
const MAX_PROMPT = 300;

function buildUrl(prompt, model, seed) {
  const safe = prompt.length > MAX_PROMPT ? prompt.slice(0, MAX_PROMPT - 3) + '...' : prompt;
  return `https://image.pollinations.ai/prompt/${encodeURIComponent(safe + ', high quality')}?width=512&height=512&seed=${seed}&nologo=true&model=${model}`;
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

  let body;
  try {
    body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
  } catch {
    res.writeHead(400, { ...CORS_HEADERS, 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Invalid JSON body' }));
    return;
  }

  const { prompt } = body || {};
  if (!prompt) {
    res.writeHead(400, { ...CORS_HEADERS, 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'prompt is required' }));
    return;
  }

  const seed = Math.floor(Math.random() * 99999);
  let lastError = '';

  // Try each model once
  for (const model of MODELS) {
    const url = buildUrl(prompt, model, seed);
    try {
      const upstream = await fetch(url, {
        headers: { 'Accept': 'image/*' },
        signal: AbortSignal.timeout(30000),
      });

      if (!upstream.ok) {
        lastError = `Pollinations ${model} returned ${upstream.status}`;
        continue;
      }

      const contentType = upstream.headers.get('content-type') || 'image/jpeg';
      const buffer = await upstream.arrayBuffer();
      const base64 = Buffer.from(buffer).toString('base64');
      const dataUrl = `data:${contentType};base64,${base64}`;

      res.writeHead(200, { ...CORS_HEADERS, 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ dataUrl }));
      return;
    } catch (err) {
      lastError = err.message || `${model} failed`;
    }
  }

  // Both models failed
  res.writeHead(502, { ...CORS_HEADERS, 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: `Image generation failed: ${lastError}` }));
}
