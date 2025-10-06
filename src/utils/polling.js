import { triggerBrowserDownload } from './download';

/**
 * Exponential backoff sequence roughly: 2s, 2s, 3s, 5s, 8s, 13s... capped ~10–15s.
 * We cap attempts around ~60 to avoid infinite loops.
 */
function* backoffIterator(maxAttempts = 60, capMs = 15000) {
  let a = 1000; // start from 1s, but we will return 2s for first tick
  let b = 2000; // 2s
  let attempt = 0;
  while (attempt < maxAttempts) {
    const delay = Math.min(b, capMs);
    yield delay;
    const next = a + b; // fibonacci-ish
    a = b;
    b = next;
    attempt++;
  }
}

/**
 * Poll the results endpoint until it returns 200.
 * - On 202 with {"ready": false}, keep polling with backoff.
 * - On 200, invokes onReady() and resolves.
 * - On 400/410 (invalid/expired), throws an error with { status }.
 * - On other 4xx/5xx, throws a generic error.
 */
export async function pollForReady(resultUrl, { signal, onTick } = {}) {
  const controller = new AbortController();
  const compositeSignal = signal
    ? new AbortController()
    : null;

  if (compositeSignal) {
    signal.addEventListener('abort', () => compositeSignal.abort(), { once: true });
  }

  const it = backoffIterator();

  // First, do an immediate check before waiting
  let attempt = 0;
  for (;;) {
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');

    try {
      const resp = await fetch(resultUrl, {
        method: 'GET',
        headers: {
          // Allow either JSON (202) or CSV (200)
          Accept: 'text/csv,application/json;q=0.9,*/*;q=0.8',
        },
        signal: signal ?? controller.signal,
        cache: 'no-store',
      });

      if (resp.status === 200) {
        if (onTick) onTick({ attempt, status: 200, message: 'ready' });
        return { ready: true };
      }
      if (resp.status === 202) {
        if (onTick) onTick({ attempt, status: 202, message: 'not ready' });
        // fall through to wait
      } else if (resp.status === 400) {
        const msg = 'Invalid or malformed token.';
        if (onTick) onTick({ attempt, status: 400, message: msg });
        const err = new Error(msg);
        err.status = 400;
        throw err;
      } else if (resp.status === 410) {
        const msg = 'Result expired. Please start a new job.';
        if (onTick) onTick({ attempt, status: 410, message: msg });
        const err = new Error(msg);
        err.status = 410;
        throw err;
      } else {
        const text = await resp.text().catch(() => '');
        const msg = `Unexpected status ${resp.status}${text ? ': ' + text : ''}`;
        if (onTick) onTick({ attempt, status: resp.status, message: msg });
        const err = new Error(msg);
        err.status = resp.status;
        throw err;
      }
    } catch (e) {
      if (e?.name === 'AbortError') throw e;
      // Network or other transient error, proceed with backoff
      if (onTick) onTick({ attempt, status: 0, message: e?.message || 'Network error' });
    }

    // Wait for next interval
    const delay = it.next().value;
    if (delay == null) {
      const err = new Error('Polling timed out');
      err.status = 504;
      throw err;
    }
    await new Promise((r, rej) => {
      const t = setTimeout(r, delay);
      if (signal) {
        const onAbort = () => {
          clearTimeout(t);
          signal.removeEventListener('abort', onAbort);
          rej(new DOMException('Aborted', 'AbortError'));
        };
        signal.addEventListener('abort', onAbort, { once: true });
      }
    });

    attempt++;
  }
}

/**
 * Convenience: poll until ready, then trigger browser download for the same URL.
 */
export async function waitAndDownload(resultUrl, { signal, onTick } = {}) {
  const res = await pollForReady(resultUrl, { signal, onTick });
  if (res?.ready) {
    triggerBrowserDownload(resultUrl);
  }
  return res;
}

/**
 * Poll until ready (HTTP 200), then fetch the CSV body as text and return it.
 * Useful when we need to parse the CSV in the UI instead of downloading it.
 */
export async function waitForCsvText(resultUrl, { signal, onTick } = {}) {
  const res = await pollForReady(resultUrl, { signal, onTick });
  if (!res?.ready) {
    const err = new Error('Result not ready');
    err.status = 202;
    throw err;
  }
  const resp = await fetch(resultUrl, {
    method: 'GET',
    headers: {
      Accept: 'text/csv',
    },
    signal,
    cache: 'no-store',
  });
  if (resp.status !== 200) {
    const text = await resp.text().catch(() => '');
    const err = new Error(`Unexpected status ${resp.status}${text ? ': ' + text : ''}`);
    err.status = resp.status;
    throw err;
  }
  return await resp.text();
}
