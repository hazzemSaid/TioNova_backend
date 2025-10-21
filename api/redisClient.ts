import { Redis } from "@upstash/redis";

let redisClient: Redis | null = null;

// Lazy load Redis client only when needed
function getRedisClient(): Redis {
  if (!redisClient) {
    if (!process.env.UPSTASH_REDIS_REST_URL || !process.env.UPSTASH_REDIS_REST_TOKEN) {
      throw new Error(
        "UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN are not defined. " +
        "Required for caching operations."
      );
    }
    
    redisClient = new Redis({
      url: process.env.UPSTASH_REDIS_REST_URL,
      token: process.env.UPSTASH_REDIS_REST_TOKEN,
    });
  }
  return redisClient;
}

// Example functions
export async function setCache(key: string, value: string, ttl?: number) {
  const client = getRedisClient();
  if (ttl !== undefined) {
    await client.set(key, value, { ex: ttl });
  } else {
    await client.set(key, value);
  }
}

export async function getCache(key: string): Promise<string | null> {
  const client = getRedisClient();
  return await client.get(key);
}

export async function delCache(key: string) {
  const client = getRedisClient();
  await client.del(key);
}