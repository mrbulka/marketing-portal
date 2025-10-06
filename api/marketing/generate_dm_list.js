const ALLOWED_HEADERS = ['userName,userLink,directMessage', 'userName,userLink'];
const MAX_TARGETS = 300;

function setCors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Max-Age', '86400');
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
  // Fallback: still route through proxy without token (backend will error accordingly)
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

function validateCsv(csvText) {
  const text = csvText.replace(/^\uFEFF/, ''); // strip BOM if present
  const lines = text.split(/\r?\n/);
  const header = (lines[0] || '').trim();
  if (!ALLOWED_HEADERS.includes(header)) {
    return {
      ok: false,
      error: `Invalid header. Expected one of: ${ALLOWED_HEADERS.join(' | ')}`,
      code: 'INVALID_HEADER',
    };
  }
  // Count non-empty lines excluding header
  const count = lines.slice(1).filter((l) => l.trim().length > 0).length;
  if (count === 0) {
    return { ok: false, error: 'No rows found after header.', code: 'EMPTY_ROWS' };
  }
  if (count > MAX_TARGETS) {
    return {
      ok: false,
      error: `Too many rows: ${count}. Maximum allowed is ${MAX_TARGETS}.`,
      code: 'TOO_MANY_ROWS',
    };
  }
  return { ok: true, count };
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

    // Read CSV body as text
    const csvText = await readTextBody(req);

    // Minimal content-type check (allow some browser variations)
    const ct = (req.headers['content-type'] || '').toLowerCase();
    if (!ct.includes('text/csv')) {
      // Not hard failing solely on content-type; the body must be valid CSV
      // but encourage correct content-type in error message if invalid.
    }

    // Validate header and size
    const validation = validateCsv(csvText);
    if (!validation.ok) {
      res.statusCode = 400;
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      return res.end(JSON.stringify({ error: validation.error, code: validation.code }));
    }

    // If header is "userName,userLink", add an empty "directMessage" column to satisfy backend contract.
    let csvToSend = csvText;
    try {
      const lines = csvText.replace(/^\uFEFF/, '').split(/\r?\n/);
      const header = (lines[0] || '').trim();
      if (header === 'userName,userLink') {
        const transformed = ['userName,userLink,directMessage'];
        for (let i = 1; i < lines.length; i++) {
          const line = lines[i];
          if (!line || !line.trim()) {
            transformed.push(line);
          } else {
            transformed.push(line.endsWith(',') ? line : line + ',');
          }
        }
        csvToSend = transformed.join('\n');
      }
    } catch {
      // best-effort; fall back to original csvText
      csvToSend = csvText;
    }

    // Forward to backend
    const upstream = await fetch(`${backendBase}/marketing/generate_dm_list`, {
      method: 'POST',
      headers: {
        'Content-Type': 'text/csv',
      },
      body: csvToSend,
    });

    // Pass through non-202 responses as-is (map to JSON/text)
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

    // Expected: 202 JSON { turnId, resultUrl, count?, batchSize? }
    const data = await upstream.json();
    const rewritten = {
      ...data,
      resultUrl: rewriteResultUrl(data.resultUrl),
    };

    res.statusCode = 202;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    return res.end(JSON.stringify(rewritten));
  } catch (err) {
    console.error('Proxy error (generate_dm_list):', err);
    setCors(res);
    res.statusCode = 500;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    return res.end(JSON.stringify({ error: 'Internal Server Error' }));
  }
}
