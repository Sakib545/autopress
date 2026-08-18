import { getRedis } from './redis';

const memory = new Map<string, { count: number; resetAt: number }>();

/**
 * Fixed-window limiter. Uses Redis when available so limits hold across
 * instances, and falls back to per-process memory for local development.
 */
export async function rateLimit(key: string, limit: number, windowSeconds: number): Promise<boolean> {
  const redis = getRedis();

  if (redis) {
    try {
      const redisKey = `rl:${key}`;
      const count = await redis.incr(redisKey);
      if (count === 1) await redis.expire(redisKey, windowSeconds);
      return count <= limit;
    } catch {
      // Fall through to the in-memory limiter if Redis misbehaves.
    }
  }

  const now = Date.now();
  const entry = memory.get(key);
  if (!entry || entry.resetAt < now) {
    memory.set(key, { count: 1, resetAt: now + windowSeconds * 1000 });
    if (memory.size > 5000) {
      for (const [k, v] of memory) if (v.resetAt < now) memory.delete(k);
    }
    return true;
  }
  entry.count++;
  return entry.count <= limit;
}
