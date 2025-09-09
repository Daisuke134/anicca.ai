const lastMap = new Map<string, number>();

export function shouldLog(key: string, windowMs = 30000): boolean {
  const now = Date.now();
  const last = lastMap.get(key) ?? 0;
  if (now - last >= windowMs) {
    lastMap.set(key, now);
    return true;
  }
  return false;
}

