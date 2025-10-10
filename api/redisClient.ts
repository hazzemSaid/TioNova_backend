import { Redis } from "@upstash/redis";

export const redisClient = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
});

// Example functions
export async function setCache(key: string, value: string, ttl?: number) {
  if (ttl !== undefined) {
    await redisClient.set(key, value, { ex: ttl });
  } else {
    await redisClient.set(key, value);
  }
}

export async function getCache(key: string): Promise<string | null> {
  return await redisClient.get(key);
}

export async function delCache(key: string) {
  await redisClient.del(key);
}