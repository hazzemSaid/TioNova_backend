# Vercel Deployment Guide - Worker Setup

## Overview
This guide explains how to run BullMQ workers on Vercel along with your main API.

## Architecture

```
Vercel Functions:
├── /api/index.ts (Main API - Express server)
└── /api/worker.ts (Background Worker - Processes jobs)

Redis (Upstash):
├── Queue storage (where jobs are queued)
└── Connection locks

MongoDB (Atlas):
└── Data persistence
```

## Setup Steps

### 1. Environment Variables (Vercel Dashboard)
```
REDIS_URL=rediss://default:PASSWORD@HOST:6379
MONGO_URI=mongodb+srv://user:password@cluster.mongodb.net/
API_KEY_GEMINI=your-gemini-key
```

### 2. File Structure
```
api/
├── index.ts (Main API)
├── worker.ts (Worker entry point)
└── redisClient.ts

src/
├── workers/
│   └── chapterWorker.ts (Main worker logic)
├── database/
│   └── mongodb.ts
└── ...
```

### 3. Deployment

**Local Testing:**
```bash
npm run start:all
```

**Deploy to Vercel:**
```bash
vercel deploy
```

### 4. How It Works on Vercel

1. **API Function** (`/api/index.ts`)
   - Handles HTTP requests
   - Creates jobs and adds them to the queue
   - Returns immediately with job ID

2. **Worker Function** (`/api/worker.ts`)
   - Runs continuously
   - Listens to Redis queue for jobs
   - Processes extractContent jobs
   - Updates MongoDB when done

### 5. Job Flow

```
User creates chapter
    ↓
POST /chapters
    ↓
Server creates Chapter (overcontent = null)
    ↓
Queue job to Redis
    ↓
Return response to user immediately
    ↓
Worker processes job
    ↓
Gemini API extracts text
    ↓
Update Chapter with overcontent
    ↓
Cache the content
    ↓
Job complete ✅
```

### 6. Monitoring

**Check worker status:**
```bash
curl https://your-vercel-app.vercel.app/api/worker
```

**Expected response:**
```json
{ "status": "Worker is running" }
```

**Vercel Logs:**
```bash
vercel logs
```

## Troubleshooting

### Worker not processing jobs
- Check REDIS_URL is correct
- Check MongoDB connection
- View Vercel logs: `vercel logs`

### Timeout errors
- Increase lockDuration in worker config
- Check Gemini API rate limits
- Monitor Upstash Redis usage

### MongoDB buffering timeout
- Ensure MONGO_URI is correct
- Check network access rules in MongoDB Atlas
- Verify connection pooling is enabled

## Cost Optimization

- **Vercel:** Worker runs only while processing (no extra cost)
- **Upstash Redis:** Pay per request
- **MongoDB Atlas:** Shared tier is free for small projects
- **Gemini API:** Free tier has generous limits

## Production Checklist

- [x] Environment variables set in Vercel
- [x] Redis (Upstash) configured
- [x] MongoDB Atlas connection working
- [x] Gemini API key valid
- [x] vercel.json includes both functions
- [x] Worker can connect to MongoDB
- [x] Worker can connect to Redis
- [x] Lock duration set appropriately
