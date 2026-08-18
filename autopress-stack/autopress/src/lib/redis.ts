import IORedis from 'ioredis';
import { env, hasRedis } from './env';

const globalForRedis = globalThis as unknown as { redis?: IORedis | null };

/** Returns null when REDIS_URL is unset so the app degrades instead of crashing. */
export function getRedis(): IORedis | null {
  if (!hasRedis()) return null;
  if (globalForRedis.redis !== undefined) return globalForRedis.redis;
  const client = new IORedis(env.redisUrl, {
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
    lazyConnect: false,
  });
  client.on('error', (e) => console.error('[redis]', e.message));
  globalForRedis.redis = client;
  return client;
}

/** Best-effort distributed lock. Returns a release fn, or null if not acquired. */
export async function acquireLock(key: string, ttlMs = 60_000) {
  const redis = getRedis();
  if (!redis) return async () => {};
  const token = `${process.pid}-${Date.now()}-${Math.random()}`;
  const ok = await redis.set(`lock:${key}`, token, 'PX', ttlMs, 'NX');
  if (!ok) return null;
  return async () => {
    const current = await redis.get(`lock:${key}`);
    if (current === token) await redis.del(`lock:${key}`);
  };
}

export async function cacheGet<T>(key: string): Promise<T | null> {
  const redis = getRedis();
  if (!redis) return null;
  try {
    const raw = await redis.get(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

export async function cacheSet(key: string, value: unknown, ttlSeconds = 60) {
  const redis = getRedis();
  if (!redis) return;
  try {
    await redis.set(key, JSON.stringify(value), 'EX', ttlSeconds);
  } catch {
    /* cache is best-effort */
  }
}

export async function cacheDel(prefix: string) {
  const redis = getRedis();
  if (!redis) return;
  try {
    const keys = await redis.keys(`${prefix}*`);
    if (keys.length) await redis.del(...keys);
  } catch {
    /* noop */
  }
}
