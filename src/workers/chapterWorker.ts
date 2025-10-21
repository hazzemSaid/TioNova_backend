import { Worker } from "bullmq";
import dotenv from "dotenv";
import Redis from "ioredis";
import { connectDB } from "../database/mongodb";
import ChapterModel from "../models/ChapterModel";
import CacheHelper from "../utils/cacheHelper";
import { CacheKeys } from "../utils/cache_keys";
import { retryGeminiApiCall } from "../utils/geminiApi";

dotenv.config();

if (!process.env.REDIS_URL) {
  console.error("❌ REDIS_URL not defined in environment variables");
  process.exit(1);
}

// Connect to MongoDB on startup
connectDB().catch((error) => {
  console.error("❌ Failed to connect to MongoDB:", error);
  process.exit(1);
});

const connection = new Redis(process.env.REDIS_URL, {
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
});

connection.on("connect", () => {
  console.log("✅ Redis connected for worker");
});

connection.on("error", (err) => {
  console.error("❌ Redis error:", err.message);
});

const worker = new Worker(
  "chapter-processing",
  async (job) => {
    console.log(`[Job ${job.id}] Started processing: ${job.name}`);
    console.log(`[Job ${job.id}] Data:`, JSON.stringify(job.data).substring(0, 100) + "...");
    
    switch (job.name) {
      case "extractContent":
        return await handleExtractContent(job);
      
      default:
        throw new Error(`Unknown job type: ${job.name}`);    }
  },
  { connection, concurrency: 1 ,  lockDuration: 600000, }
);

export async function handleExtractContent(job: any) {
  const {
    chapterId,
    folderId,
    userId,
    fileName,
    fileBuffer,
    mimeType,
    ownerId,
    sharedWith,
  } = job.data;

  console.log(`[Job ${job.id}] Extracting content for chapter: ${chapterId}`);

  try {
    await job.updateProgress(10);
    console.log(`[Job ${job.id}] Progress: 10% - Starting Gemini API call`);

    const requestBody = {
      contents: [
        {
          parts: [
            {
              text: `You are an expert document cleaning and text extraction assistant. Your task is to process the provided PDF and return a clean, structured, and complete text version of its content.

**Instructions:**
1. **Extract all text.** Capture all readable text from the document, including headings, paragraphs, and lists.
2. **Remove noise and artifacts.** Eliminate OCR errors, visual artifacts, duplicated phrases, page numbers, headers, and footers.
3. **Structure and normalize content.**
    * Reconstruct broken sentences and paragraphs.
    * Maintain the original hierarchy of chapters, sections, and sub-sections.
    * Preserve bullet points, numbered lists, and code blocks.
4. **Final output:** Provide ONLY the cleaned, raw text content of the document. Do not summarize, interpret, or add any commentary.

**Output format:** Return the full, uninterpreted text in a single, well-formatted string.`,
            },
            {
              inlineData: {
                mimeType: mimeType,
                data: fileBuffer,
              },
            },
          ],
        },
      ],
      generationConfig: { temperature: 0.5, maxOutputTokens: 8192 },
    };

    const response = await retryGeminiApiCall(requestBody);
    const data = await response.json();
    
    console.log(`[Job ${job.id}] Gemini response received`);
    console.log(`[Job ${job.id}] Response structure:`, {
      hasContent: !!data?.candidates?.[0]?.content,
      hasParts: !!data?.candidates?.[0]?.content?.parts,
      hasText: !!data?.candidates?.[0]?.content?.parts?.[0]?.text,
    });

    const extractedText = data?.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!extractedText) {
      throw new Error("No text extracted from Gemini API response");
    }

    await job.updateProgress(40);
    console.log(`[Job ${job.id}] Progress: 40% - Text extracted (${extractedText.length} chars)`);

    // Update chapter in database
    const updateResult = await ChapterModel.findByIdAndUpdate(
      chapterId,
      {
        overcontent: extractedText,
        updatedBy: userId,
      },
      { new: true }
    );

    if (!updateResult) {
      throw new Error(`Chapter not found for update: ${chapterId}`);
    }

    console.log(`[Job ${job.id}] Progress: 50% - Chapter updated in DB`);
    await job.updateProgress(50);

    // Cache the extracted content
    const overcontentKey = CacheKeys.getChapterOverContentKey(chapterId);
    await CacheHelper.set(
      overcontentKey,
      extractedText,
      CacheKeys.TTL.ONE_WEEK
    );

    console.log(`[Job ${job.id}] Progress: 75% - Content cached`);
    await job.updateProgress(75);

    // Invalidate chapters list cache
    const affectedUsers = [ownerId, ...sharedWith];
    await CacheHelper.invalidateChaptersList(folderId, affectedUsers);

    await job.updateProgress(100);
    console.log(`[Job ${job.id}] ✅ COMPLETED - Content extraction finished`);

    return {
      success: true,
      chapterId,
      textLength: extractedText.length,
      timestamp: new Date().toISOString(),
    };
  } catch (error) {
    console.error(`[Job ${job.id}] ❌ ERROR:`, error);
    throw error;
  }
}

worker.on("completed", (job) => {
  console.log(`✅ Job ${job.id} completed successfully`);
});

worker.on("failed", (job, err) => {
  if (job) {
    console.error(`   Attempts: ${job.attemptsMade} / ${job.opts.attempts}`);
  }
});

worker.on("active", (job) => {
  console.log(`⏳ Job ${job.id} is now processing`);
});

worker.on("progress", (job, progress) => {
  console.log(`📊 Job ${job.id} progress: ${progress}%`);
});

export default worker;  

