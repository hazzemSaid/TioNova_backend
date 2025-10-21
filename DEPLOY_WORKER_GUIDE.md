# How to Fix Worker on Vercel

## 🚨 THE PROBLEM

**Vercel CANNOT run BullMQ workers** because serverless functions:
- Spin down after 10 seconds of inactivity
- Cannot run continuously
- Are stateless

Your Redis has accumulated these keys because:
- ✅ Jobs are queued (API works)
- ❌ Jobs are never processed (worker doesn't run)

---

## ✅ SOLUTION: Deploy Worker Separately

### Step 1: Cleanup Existing Redis Keys

1. Add this environment variable to Vercel:
   ```
   CLEANUP_SECRET=your-secret-password-123
   ```

2. Deploy to Vercel (or wait for auto-deploy)

3. Visit this URL:
   ```
   https://your-app.vercel.app/api/cleanup?secret=your-secret-password-123
   ```

4. You should see:
   ```json
   {
     "message": "Cleanup successful",
     "deleted": 8,
     "keys": ["bull:chapter-processing:1", ...]
   }
   ```

---

### Step 2A: Deploy Worker to Railway.app (EASIEST) ⭐

**Railway has a free tier and is perfect for workers!**

1. **Go to Railway.app**
   - Sign up at https://railway.app
   - Click "New Project" → "Deploy from GitHub repo"
   - Select your `TioNova_backend` repository

2. **Configure the Worker Service**
   - Railway will detect `railway.json` automatically
   - Or manually set:
     - **Start Command:** `npm run worker`
     - **Build Command:** `npm install`

3. **Add Environment Variables**
   Copy these from your Vercel dashboard:
   ```
   REDIS_URL=rediss://default:...
   MONGO_URI=mongodb+srv://...
   API_KEY_GEMINI=...
   UPSTASH_REDIS_REST_URL=...
   UPSTASH_REDIS_REST_TOKEN=...
   ```

4. **Deploy!**
   - Railway will build and start the worker
   - Check logs to see: "✅ Redis connected for worker"
   - Worker is now running 24/7!

**Cost:** Free tier = 500 hours/month (enough for 1 worker)

---

### Step 2B: Deploy Worker to Render.com (Alternative)

1. **Update `render.yaml`:**

```yaml
services:
  # Keep your existing API service (if deployed on Render)
  
  # Add worker service
  - type: worker
    name: tionova-worker
    env: node
    buildCommand: npm install
    startCommand: npm run worker
    envVars:
      - key: REDIS_URL
        sync: false
      - key: MONGO_URI
        sync: false
      - key: API_KEY_GEMINI
        sync: false
      - key: UPSTASH_REDIS_REST_URL
        sync: false
      - key: UPSTASH_REDIS_REST_TOKEN
        sync: false
```

2. **Deploy to Render**
   - Push changes to GitHub
   - Render auto-deploys
   - Add environment variables in Render dashboard

**Cost:** Free tier available

---

### Step 2C: Run Worker Locally (Development Only)

For local testing:

```bash
# Terminal 1: Run API
npm run dev

# Terminal 2: Run Worker
npm run worker
```

---

## 🧪 TESTING

After deploying the worker:

1. **Create a new chapter** (upload PDF)
   
2. **Check job status:**
   ```bash
   # In your API, add this endpoint temporarily
   GET /api/jobs/:jobId
   ```

3. **Watch Railway/Render logs:**
   - You should see:
   ```
   [Job 1] Started processing: extractContent
   [Job 1] Progress: 10% - Starting Gemini API call
   [Job 1] Progress: 40% - Text extracted
   [Job 1] ✅ COMPLETED
   ```

4. **Verify in MongoDB:**
   - Chapter should have `overcontent` field populated

---

## 📊 MONITORING

### Railway Logs
```bash
# Install Railway CLI
npm i -g @railway/cli

# Login
railway login

# View logs
railway logs
```

### Render Logs
- Go to Render dashboard
- Click on your worker service
- View "Logs" tab

---

## 🔧 ALTERNATIVE: Process Jobs Synchronously (Quick Fix)

**If you need a quick fix and can accept slower API responses:**

### Update `ChapterController.ts`:

```typescript
// Option 1: Process immediately (no queue)
import { handleExtractContent } from "../workers/chapterWorker";

// In your createChapter function:
try {
  // Create chapter first
  const chapter = await ChapterModel.create({
    folderId,
    chaptername: fileName,
    overcontent: null, // Will be filled shortly
  });

  // Process synchronously (will take 10-30 seconds)
  const result = await handleExtractContent({
    chapterId: chapter._id.toString(),
    folderId,
    userId: req.userId,
    fileName,
    fileBuffer: fileBuffer.toString("base64"),
    mimeType: file.mimetype,
    ownerId,
    sharedWith,
  });

  res.status(201).json({ 
    chapter,
    extractionStatus: "completed" 
  });
} catch (error) {
  // Handle error
}
```

**Pros:** Works on Vercel without changes
**Cons:** 
- API becomes very slow (30+ seconds per request)
- May timeout on free Vercel plan (10s limit)
- User must wait for processing

---

## 🎯 RECOMMENDED ARCHITECTURE

```
┌─────────────────────────────────────┐
│         VERCEL (API Only)           │
│  ✅ Fast HTTP responses              │
│  ✅ Queue jobs to Redis              │
│  ✅ Return immediately               │
└──────────────┬──────────────────────┘
               │
               │ Adds jobs
               ▼
┌─────────────────────────────────────┐
│      UPSTASH REDIS (Queue)          │
│  ✅ Stores jobs                      │
│  ✅ Provides pub/sub                 │
└──────────────┬──────────────────────┘
               │
               │ Polls for jobs
               ▼
┌─────────────────────────────────────┐
│   RAILWAY/RENDER (Worker Only)      │
│  ✅ Runs 24/7                        │
│  ✅ Processes background jobs        │
│  ✅ Calls Gemini API                 │
└──────────────┬──────────────────────┘
               │
               │ Updates data
               ▼
┌─────────────────────────────────────┐
│       MONGODB ATLAS (Database)      │
└─────────────────────────────────────┘
```

---

## 💰 COST SUMMARY

- **Vercel API:** Free tier (plenty for API)
- **Railway Worker:** Free tier = 500 hrs/month
- **Upstash Redis:** Free tier = 10K requests/day
- **MongoDB Atlas:** Free tier (512MB)
- **Gemini API:** Free tier = 15 req/min

**Total: $0/month for small projects** 🎉

---

## ✅ CHECKLIST

- [ ] Run cleanup endpoint to clear Redis
- [ ] Deploy worker to Railway/Render
- [ ] Add all environment variables
- [ ] Test by creating a chapter
- [ ] Monitor logs to see job processing
- [ ] Verify overcontent is saved in MongoDB

---

## 🆘 TROUBLESHOOTING

**Worker keeps crashing:**
- Check logs for MongoDB connection errors
- Verify REDIS_URL is correct
- Ensure API_KEY_GEMINI is valid

**Jobs not processing:**
- Verify worker logs show "✅ Redis connected"
- Check that queue name matches: "chapter-processing"
- Ensure worker is actually running (not crashed)

**Redis out of memory:**
- Run cleanup endpoint regularly
- Set TTL on jobs in queue config
- Monitor Upstash dashboard

---

Need help? Check the logs or let me know which deployment platform you chose!
