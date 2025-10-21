import dotenv from "dotenv";
import Redis from "ioredis";

dotenv.config();

/**
 * Cleanup endpoint to remove stuck BullMQ jobs from Redis
 * Use this to clear accumulated Redis keys when worker isn't running
 * 
 * Usage: GET https://yourapp.vercel.app/api/cleanup?secret=YOUR_SECRET
 */
export default async function handler(req: any, res: any) {
  // Add basic authentication
  const secret = req.query.secret;
  if (secret !== process.env.CLEANUP_SECRET) {
    return res.status(401).json({ 
      error: "Unauthorized",
      message: "Add ?secret=YOUR_SECRET to URL"
    });
  }

  try {
    if (!process.env.REDIS_URL) {
      throw new Error("REDIS_URL not configured");
    }

    const redis = new Redis(process.env.REDIS_URL, {
      maxRetriesPerRequest: null,
      enableReadyCheck: false,
    });

    console.log("🔍 Scanning for Bull queue keys...");
    
    const keys = await redis.keys("bull:chapter-processing:*");
    
    if (keys.length === 0) {
      await redis.quit();
      return res.json({ 
        message: "No keys found to clean",
        deleted: 0 
      });
    }

    console.log(`🗑️  Found ${keys.length} keys to delete`);
    console.log("Keys:", keys);

    // Delete all keys
    await redis.del(...keys);
    await redis.quit();

    console.log("✅ Cleanup completed");

    res.json({ 
      message: "Cleanup successful",
      deleted: keys.length,
      keys: keys
    });
  } catch (error: any) {
    console.error("❌ Cleanup error:", error);
    res.status(500).json({ 
      error: "Cleanup failed",
      message: error.message 
    });
  }
}
