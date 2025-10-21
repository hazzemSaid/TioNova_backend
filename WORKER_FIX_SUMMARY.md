# Quick Summary: Vercel Worker Issue

## The Problem 🚨

Your Redis keys are accumulating because:
- ✅ **API works**: Jobs are being queued to Redis
- ❌ **Worker doesn't work**: Vercel can't run long-running workers
- Result: Jobs pile up in Redis but never get processed

**Redis Keys Found:**
```
bull:chapter-processing:1
bull:chapter-processing:2
bull:chapter-processing:delayed
bull:chapter-processing:events
bull:chapter-processing:id
bull:chapter-processing:marker
bull:chapter-processing:meta
bull:chapter-processing:wait
```

---

## The Solution ✅

**Workers CANNOT run on Vercel.** You need to deploy the worker separately.

### Immediate Steps:

1. **Clean up Redis** (remove stuck jobs)
   - Add env var: `CLEANUP_SECRET=your-password`
   - Visit: `https://your-app.vercel.app/api/cleanup?secret=your-password`

2. **Deploy worker to Railway** (free tier available)
   - Go to https://railway.app
   - Deploy from GitHub
   - Add environment variables (REDIS_URL, MONGO_URI, API_KEY_GEMINI)
   - Railway will automatically use `railway.json` config
   - Start command: `npm run worker`

3. **Test it works**
   - Upload a PDF
   - Check Railway logs for job processing
   - Verify chapter has `overcontent` in MongoDB

---

## Files Created for You ✅

1. **`api/cleanup.ts`** - Endpoint to clean stuck Redis keys
2. **`railway.json`** - Railway configuration for worker
3. **`Dockerfile.worker`** - Docker config for worker deployment
4. **`DEPLOY_WORKER_GUIDE.md`** - Detailed deployment instructions
5. **`VERCEL_LIMITATIONS.md`** - Explanation of why Vercel doesn't work
6. **Updated `render.yaml`** - Added worker service configuration

---

## Architecture

```
User uploads PDF
    ↓
Vercel API (fast response)
    ↓
Job queued to Redis
    ↓
Railway Worker picks up job
    ↓
Processes with Gemini API
    ↓
Saves to MongoDB
```

---

## Cost

- Vercel API: **Free**
- Railway Worker: **Free** (500 hrs/month)
- Upstash Redis: **Free** (10K requests/day)
- MongoDB Atlas: **Free** (512MB)

**Total: $0/month** 🎉

---

## Read More

- **`DEPLOY_WORKER_GUIDE.md`** - Step-by-step deployment
- **`VERCEL_LIMITATIONS.md`** - Why Vercel can't run workers
