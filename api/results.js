import { Readable } from 'node:stream';

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

export default async function handler(req, res) {
  try {
    setCors(res);

    if (req.method === 'OPTIONS') {
      res.statusCode = 204;
      return res.end();
    }

    if (req.method !== 'GET') {
      res.setHeader('Allow', 'GET, OPTIONS');
      res.statusCode = 405;
      return res.end('Method Not Allowed');
    }

    const backendBase = getBackendBase();
    const url = new URL(req.url, 'http://localhost'); // base doesn't matter, we only need query
    const search = url.search || '';

    const upstream = await fetch(`${backendBase}/results${search}`, {
      method: 'GET',
      // no special headers required per contract
    });

    // Pass through status
    res.statusCode = upstream.status;

    // Handle 202 JSON { ready: false }
    if (upstream.status === 202) {
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      const j = await upstream.json();
      return res.end(JSON.stringify(j));
    }

    // Handle 200 CSV stream
    if (upstream.status === 200) {
      const ct = upstream.headers.get('content-type') || 'text/csv; charset=utf-8';
      const cd = upstream.headers.get('content-disposition');

      res.setHeader('Content-Type', ct);
      if (cd) {
        res.setHeader('Content-Disposition', cd);
      }

      // Stream if possible, fallback to buffering
      if (upstream.body && typeof Readable.fromWeb === 'function') {
        const nodeStream = Readable.fromWeb(upstream.body);
        nodeStream.on('error', (e) => {
          console.error('Streaming error (results):', e);
          if (!res.headersSent) {
            res.statusCode = 500;
            res.setHeader('Content-Type', 'application/json; charset=utf-8');
          }
          if (!res.writableEnded) {
            res.end(JSON.stringify({ error: 'Stream Error' }));
          }
        });
        return nodeStream.pipe(res);
      } else {
        const buf = Buffer.from(await upstream.arrayBuffer());
        res.setHeader('Content-Length', String(buf.length));
        return res.end(buf);
      }
    }

    // Other statuses: forward as text or JSON
    const contentType = upstream.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
      const j = await upstream.json();
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      return res.end(JSON.stringify(j));
    } else {
      const t = await upstream.text();
      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      return res.end(t);
    }
  } catch (err) {
    console.error('Proxy error (results):', err);
    setCors(res);
    res.statusCode = 500;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    return res.end(JSON.stringify({ error: 'Internal Server Error' }));
  }
}
