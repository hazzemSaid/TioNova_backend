# Vercel Limitations for BullMQ Workers

## The Problem

**Vercel serverless functions CANNOT run BullMQ workers** because:

1. ❌ **Functions are stateless** - They spin down after ~10 seconds of inactivity
2. ❌ **No long-running processes** - Workers need to continuously listen to Redis
3. ❌ **Request timeout** - Maximum execution time is 10-300 seconds depending on plan
4. ❌ **Cold starts** - Functions sleep when not invoked via HTTP

Your Redis keys (`bull:chapter-processing:*`) are accumulating because:
- Jobs are being **queued** successfully (from your API)
- Jobs are **NOT being processed** (worker isn't running)

## Solutions

### Option 1: Railway.app (Easiest - Free Tier Available) ⭐

**Deploy worker as a separate service:**

1. Create `worker.railway.json`:
```json
{
  "$schema": "https://railway.app/railway.schema.json",
  "build": {
    "builder": "NIXPACKS"
  },
  "deploy": {
    "startCommand": "npm run worker",
    "restartPolicyType": "ON_FAILURE",
    "restartPolicyMaxRetries": 10
  }
}
```

2. Add script to `package.json`:
```json
{
  "scripts": {
    "worker": "node -r ts-node/register src/workers/chapterWorker.ts"
  }
}
```

3. Deploy to Railway with same environment variables

**Cost:** Free tier includes 500 hours/month

---

### Option 2: Render.com Background Worker (Free Tier)

1. Add to `render.yaml`:
```yaml
services:
  - type: web
    name: tionova-api
    env: node
    buildCommand: npm install && npm run build
    startCommand: npm start
    
  - type: worker
    name: tionova-worker
    env: node
    buildCommand: npm install
    startCommand: npm run worker
```

2. Worker will run continuously in background

**Cost:** Free tier available

---

### Option 3: Vercel Cron + Short Jobs (Limited Solution)

**Only works for jobs that complete in < 10 seconds**

1. Create `api/cron-worker.ts`:
```typescript
import { chapterQueue } from "../src/queues/chapterQueue";
import { connectDB } from "../src/database/mongodb";

export default async function handler(req: any, res: any) {
  if (req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  await connectDB();
  
  // Process ONE job at a time
  const jobs = await chapterQueue.getWaiting(0, 0);
  
  if (jobs.length > 0) {
    const job = jobs[0];
    // Process job logic here...
    res.json({ processed: job.id });
  } else {
    res.json({ message: "No jobs to process" });
  }
}
```

2. Add to `vercel.json`:
```json
{
  "crons": [{
    "path": "/api/cron-worker",
    "schedule": "* * * * *"
  }]
}
```

**Limitations:**
- ⚠️ Jobs must complete in < 10 seconds
- ⚠️ Only runs every minute minimum
- ❌ Not suitable for Gemini API calls (too slow)

---

### Option 4: Digital Ocean App Platform

Deploy as two components:
- Web service (your API)
- Worker service (background jobs)

Similar to Railway but with more control.

---

### Option 5: Upstash QStash (Serverless Alternative)

Replace BullMQ with QStash:

```typescript
import { Client } from "@upstash/qstash";

const client = new Client({
  token: process.env.QSTASH_TOKEN!,
});

// Queue a job
await client.publishJSON({
  url: "https://yourapp.vercel.app/api/process-chapter",
  body: { chapterId, fileBuffer, ... }
});
```

**Pros:** Works on Vercel (HTTP-based queues)
**Cons:** Requires refactoring from BullMQ

---

## Recommended Architecture

```
┌─────────────────┐
│  Vercel         │
│  (API only)     │◄──── HTTP Requests
└────────┬────────┘
         │
         │ Queues jobs to Redis
         ▼
┌─────────────────┐
│  Upstash Redis  │
│  (Queue)        │
└────────┬────────┘
         │
         │ Worker polls for jobs
         ▼
┌─────────────────┐
│  Railway/Render │
│  (Worker)       │──── Processes jobs
└─────────────────┘
         │
         ▼
┌─────────────────┐
│  MongoDB Atlas  │
└─────────────────┘
```

## Quick Fix for Now

**Temporarily process jobs synchronously** (not recommended for production):

```typescript
// In ChapterController.ts
const result = await handleExtractContent({
  chapterId,
  folderId,
  userId,
  fileName,
  fileBuffer: fileBuffer.toString("base64"),
  mimeType: file.mimetype,
  ownerId,
  sharedWith,
});
```

This will make your API slower but will work on Vercel.

---

## Cleanup Redis Keys

To clear stuck jobs:

```typescript
// api/cleanup.ts
import Redis from "ioredis";

export default async function handler(req: any, res: any) {
  const redis = new Redis(process.env.REDIS_URL!);
  
  const keys = await redis.keys("bull:chapter-processing:*");
  if (keys.length > 0) {
    await redis.del(...keys);
  }
  
  res.json({ deleted: keys.length });
}
```

Visit: `https://yourapp.vercel.app/api/cleanup`
