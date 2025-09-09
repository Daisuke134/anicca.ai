import { PROXY_URL } from '../config';

let _lastAt = 0;
let _lastOk: boolean | null = null;

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('timeout')), ms);
    p.then(v => { clearTimeout(t); resolve(v); }).catch(e => { clearTimeout(t); reject(e); });
  });
}

export async function isOnline(timeoutMs = 1500, cacheMs = 5000): Promise<boolean> {
  const now = Date.now();
  if (_lastOk !== null && (now - _lastAt) < cacheMs) return _lastOk;
  const targets = [
    `${PROXY_URL}/health`,
    'https://dns.google/'
  ];
  for (const url of targets) {
    try {
      const ok = await withTimeout(fetch(url, { method: 'GET' }), timeoutMs)
        .then(r => r.ok)
        .catch(() => false);
      if (ok) { _lastOk = true; _lastAt = Date.now(); return true; }
    } catch { /* noop */ }
  }
  _lastOk = false; _lastAt = Date.now();
  return false;
}

export async function waitForOnline({ timeoutTotal = 15000, interval = 1000 } = {}): Promise<boolean> {
  const start = Date.now();
  while ((Date.now() - start) < timeoutTotal) {
    if (await isOnline()) return true;
    await new Promise(r => setTimeout(r, interval));
  }
  return false;
}

