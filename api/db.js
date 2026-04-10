const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

function sb(path, opts = {}, userToken) {
  const base = process.env.SUPABASE_URL.trim();
  const key  = process.env.SUPABASE_ANON_KEY.trim();
  const { prefer, method = 'GET', body } = opts;
  // Use user's JWT if provided (enables RLS per-user scoping), else fall back to anon key
  const authHeader = userToken ? `Bearer ${userToken}` : `Bearer ${key}`;
  return fetch(`${base}/rest/v1${path}`, {
    method,
    headers: {
      'apikey': key,
      'Authorization': authHeader,
      'Content-Type': 'application/json',
      'Prefer': prefer || 'return=representation',
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
}

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    res.writeHead(204, CORS_HEADERS);
    res.end();
    return;
  }

  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_ANON_KEY) {
    res.writeHead(500, { ...CORS_HEADERS, 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'SUPABASE_URL and SUPABASE_ANON_KEY env vars are not set' }));
    return;
  }

  // Extract user JWT from Authorization header (sent by authenticated frontend)
  const userToken = (req.headers['authorization'] || '').replace(/^Bearer\s+/i, '') || null;

  const urlObj = new URL(req.url, 'http://localhost');
  const action = urlObj.searchParams.get('action');

  let body = {};
  if (req.method === 'POST') {
    try {
      body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
    } catch {
      res.writeHead(400, { ...CORS_HEADERS, 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Invalid JSON body' }));
      return;
    }
  }

  try {
    // ── POST saveSession ──────────────────────────────────────
    if (action === 'saveSession' && req.method === 'POST') {
      const { session_id } = body;
      const r = await sb('/sessions', {
        method: 'POST',
        prefer: 'resolution=ignore-duplicates,return=representation',
        body: { session_id },
      }, userToken);
      const data = await r.json();
      res.writeHead(r.ok ? 200 : 400, { ...CORS_HEADERS, 'Content-Type': 'application/json' });
      res.end(JSON.stringify(data));
      return;
    }

    // ── POST saveGoal ─────────────────────────────────────────
    if (action === 'saveGoal' && req.method === 'POST') {
      const { session_id, goal_id, original_goal, refined_goal, target_date } = body;
      const payload = { session_id, original_goal, refined_goal, target_date };
      let r;
      if (goal_id) {
        r = await sb(`/goals?id=eq.${goal_id}`, { method: 'PATCH', body: payload }, userToken);
      } else {
        r = await sb('/goals', { method: 'POST', body: payload }, userToken);
      }
      const data = await r.json();
      res.writeHead(r.ok ? 200 : 400, { ...CORS_HEADERS, 'Content-Type': 'application/json' });
      res.end(JSON.stringify(data));
      return;
    }

    // ── POST saveMilestones ───────────────────────────────────
    if (action === 'saveMilestones' && req.method === 'POST') {
      const { session_id, goal_id, milestones = [] } = body;
      const results = [];
      for (const ms of milestones) {
        let r;
        if (ms.db_id) {
          r = await sb(`/milestones?id=eq.${ms.db_id}`, {
            method: 'PATCH',
            body: { title: ms.title, target_date: ms.target_date || null, status: ms.status },
          }, userToken);
        } else {
          r = await sb('/milestones', {
            method: 'POST',
            body: {
              session_id,
              goal_id,
              title: ms.title,
              target_date: ms.target_date || null,
              status: ms.status || 'not_started',
            },
          }, userToken);
        }
        const data = await r.json();
        results.push(Array.isArray(data) ? data[0] : data);
      }
      res.writeHead(200, { ...CORS_HEADERS, 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ milestones: results }));
      return;
    }

    // ── POST saveTasks ────────────────────────────────────────
    if (action === 'saveTasks' && req.method === 'POST') {
      const { session_id, milestone_id, date, tasks = [], alignment_feedback, task_db_id } = body;
      const payload = {
        session_id,
        milestone_id: milestone_id || null,
        date,
        task_1: tasks[0]?.text || null,
        task_2: tasks[1]?.text || null,
        task_3: tasks[2]?.text || null,
        done_1: tasks[0]?.done ?? false,
        done_2: tasks[1]?.done ?? false,
        done_3: tasks[2]?.done ?? false,
        alignment_feedback: alignment_feedback || null,
      };
      let r;
      if (task_db_id) {
        r = await sb(`/daily_tasks?id=eq.${task_db_id}`, { method: 'PATCH', body: payload }, userToken);
      } else {
        r = await sb('/daily_tasks', { method: 'POST', body: payload }, userToken);
      }
      const data = await r.json();
      res.writeHead(r.ok ? 200 : 400, { ...CORS_HEADERS, 'Content-Type': 'application/json' });
      res.end(JSON.stringify(Array.isArray(data) ? data[0] : data));
      return;
    }

    // ── POST markDone ─────────────────────────────────────────
    if (action === 'markDone' && req.method === 'POST') {
      const { task_db_id, task_index, done } = body; // task_index: 1, 2, or 3
      const r = await sb(`/daily_tasks?id=eq.${task_db_id}`, {
        method: 'PATCH',
        body: { [`done_${task_index}`]: done },
      }, userToken);
      const data = await r.json();
      res.writeHead(r.ok ? 200 : 400, { ...CORS_HEADERS, 'Content-Type': 'application/json' });
      res.end(JSON.stringify(data));
      return;
    }

    // ── GET getGoal ───────────────────────────────────────────
    if (action === 'getGoal' && req.method === 'GET') {
      const session_id = urlObj.searchParams.get('session_id');
      const r = await sb(`/goals?session_id=eq.${encodeURIComponent(session_id)}&order=created_at.asc`, {}, userToken);
      const data = await r.json();
      res.writeHead(r.ok ? 200 : 400, { ...CORS_HEADERS, 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ goals: Array.isArray(data) ? data : [] }));
      return;
    }

    // ── GET getMilestones ─────────────────────────────────────
    if (action === 'getMilestones' && req.method === 'GET') {
      const session_id = urlObj.searchParams.get('session_id');
      const goal_id    = urlObj.searchParams.get('goal_id');
      let path = `/milestones?session_id=eq.${encodeURIComponent(session_id)}&order=created_at.asc`;
      if (goal_id) path += `&goal_id=eq.${encodeURIComponent(goal_id)}`;
      const r = await sb(path, {}, userToken);
      const data = await r.json();
      res.writeHead(r.ok ? 200 : 400, { ...CORS_HEADERS, 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ milestones: Array.isArray(data) ? data : [] }));
      return;
    }

    // ── GET getTasks ──────────────────────────────────────────
    if (action === 'getTasks' && req.method === 'GET') {
      const session_id = urlObj.searchParams.get('session_id');
      const date       = urlObj.searchParams.get('date');
      let path = `/daily_tasks?session_id=eq.${encodeURIComponent(session_id)}&order=created_at.asc`;
      if (date) path += `&date=eq.${date}`;
      const r = await sb(path, {}, userToken);
      const data = await r.json();
      res.writeHead(r.ok ? 200 : 400, { ...CORS_HEADERS, 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ tasks: Array.isArray(data) ? data : [] }));
      return;
    }

    res.writeHead(400, { ...CORS_HEADERS, 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: `Unknown action: ${action}` }));

  } catch (err) {
    console.error('[/api/db] error:', err);
    res.writeHead(500, { ...CORS_HEADERS, 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: err.message }));
  }
}
