import dotenv from "dotenv";

dotenv.config();

// Import the worker to start it
import "../src/workers/chapterWorker";

console.log("✅ Chapter Worker started successfully");

// Export a handler for Vercel (keeps the function warm)
export default function handler(req: any, res: any) {
  res.status(200).json({ status: "Worker is running" });
}

