function setCors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

function getBackendBase() {
  const base = process.env.MARKETING_BACKEND_URL;
  if (!base) {
    throw new Error('Environment variable MARKETING_BACKEND_URL is not set');
  }
  return base.replace(/\/+$/, '');
}

function rewriteResultUrl(resultUrl) {
  try {
    const u = new URL(resultUrl);
    const token = u.searchParams.get('token');
    if (token) return `/api/results?token=${encodeURIComponent(token)}`;
  } catch {
    // resultUrl might be relative, fallback to regex
  }
  const match = /[?&]token=([^&]+)/.exec(resultUrl || '');
  if (match) {
    return `/api/results?token=${encodeURIComponent(match[1])}`;
  }
  return '/api/results';
}

async function readTextBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.setEncoding('utf8');
    req.on('data', (chunk) => (data += chunk));
    req.on('end', () => resolve(data));
    req.on('error', reject);
  });
}

function validatePayload(payload) {
  if (typeof payload !== 'object' || payload === null) {
    return { ok: false, error: 'Body must be a JSON object.', code: 'INVALID_JSON' };
  }
  const { seedUserNames, filters } = payload;
  if (!Array.isArray(seedUserNames) || seedUserNames.length === 0) {
    return { ok: false, error: 'seedUserNames must be a non-empty array of strings.', code: 'INVALID_SEED' };
  }
  for (const u of seedUserNames) {
    if (typeof u !== 'string' || u.trim().length === 0) {
      return { ok: false, error: 'Each seed user name must be a non-empty string.', code: 'INVALID_SEED_ITEM' };
    }
  }
  if (filters !== undefined && typeof filters !== 'object') {
    return { ok: false, error: 'filters must be an object if provided.', code: 'INVALID_FILTERS' };
  }
  return { ok: true };
}

export default async function handler(req, res) {
  try {
    setCors(res);

    if (req.method === 'OPTIONS') {
      res.statusCode = 204;
      return res.end();
    }

    if (req.method !== 'POST') {
      res.setHeader('Allow', 'POST, OPTIONS');
      res.statusCode = 405;
      return res.end('Method Not Allowed');
    }

    const backendBase = getBackendBase();

    const text = await readTextBody(req);
    let json;
    try {
      json = JSON.parse(text || '{}');
    } catch {
      res.statusCode = 400;
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      return res.end(JSON.stringify({ error: 'Invalid JSON body', code: 'INVALID_JSON' }));
    }

    const validation = validatePayload(json);
    if (!validation.ok) {
      res.statusCode = 400;
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      return res.end(JSON.stringify({ error: validation.error, code: validation.code }));
    }

    // Forward to backend
    const upstream = await fetch(`${backendBase}/marketing/generate_leads`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(json),
    });

    if (upstream.status !== 202) {
      const contentType = upstream.headers.get('content-type') || '';
      res.statusCode = upstream.status;
      if (contentType.includes('application/json')) {
        const j = await upstream.json();
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        return res.end(JSON.stringify(j));
      } else {
        const t = await upstream.text();
        res.setHeader('Content-Type', 'text/plain; charset=utf-8');
        return res.end(t);
      }
    }

    const data = await upstream.json();
    const rewritten = {
      ...data,
      resultUrl: rewriteResultUrl(data.resultUrl),
    };

    res.statusCode = 202;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    return res.end(JSON.stringify(rewritten));
  } catch (err) {
    console.error('Proxy error (generate_leads):', err);
    setCors(res);
    res.statusCode = 500;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    return res.end(JSON.stringify({ error: 'Internal Server Error' }));
  }
}
