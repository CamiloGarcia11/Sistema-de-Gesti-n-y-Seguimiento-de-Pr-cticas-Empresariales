// ==============================================================================
// SIGETRAP - Caché en memoria con TTL para consultas analíticas (RN02)
// ==============================================================================

import { CACHE_TTL_MS } from './constants';

interface CacheEntry {
  value: unknown;
  expiresAt: number;
}

const MAX_ENTRIES = 300;
const store = new Map<string, CacheEntry>();

function prune(now: number) {
  for (const [key, entry] of store) {
    if (entry.expiresAt <= now) store.delete(key);
  }
  while (store.size > MAX_ENTRIES) {
    const oldest = store.keys().next().value;
    if (oldest === undefined) break;
    store.delete(oldest);
  }
}

/**
 * Devuelve el valor cacheado si sigue vigente; de lo contrario ejecuta el loader.
 * `refresh = true` ignora la caché y recalcula.
 */
export async function withCache<T>(
  key: string,
  loader: () => Promise<T>,
  options: { refresh?: boolean; ttlMs?: number } = {}
): Promise<{ value: T; cached: boolean }> {
  const now = Date.now();
  const ttl = options.ttlMs ?? CACHE_TTL_MS;

  if (!options.refresh) {
    const hit = store.get(key);
    if (hit && hit.expiresAt > now) {
      return { value: hit.value as T, cached: true };
    }
  }

  const value = await loader();
  store.set(key, { value, expiresAt: Date.now() + ttl });
  prune(Date.now());
  return { value, cached: false };
}