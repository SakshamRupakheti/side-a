// Per-isolate fallback. Counts expire together and the key set has a hard ceiling.
const counts = new Map<string, number>();
let windowStart = -1;
export function retryAfter(key: string, limit: number, now = Date.now()) {
  const minute = Math.floor(now / 60000);
  if (minute !== windowStart) {
    counts.clear();
    windowStart = minute;
  }
  const count = counts.get(key) ?? 0;
  if (count >= limit || (!count && counts.size >= 4096)) {
    return 60 - Math.floor((now % 60000) / 1000);
  }
  counts.set(key, count + 1);
  return 0;
}
