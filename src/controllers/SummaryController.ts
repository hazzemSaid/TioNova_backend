import asyncWrapper from "../middleware/asyncwrapper";
import ChapterModel from "../models/ChapterModel";
import SummaryModel from "../models/SummaryModel";
import { AnalysisService } from "../services/analysisService";
import { CacheKeys } from "../utils/cache_keys";
import CacheHelper from "../utils/cacheHelper";
import ErrorHandler from "../utils/error";
import { getMimeType, retryGeminiApiCall } from "../utils/geminiApi";

const summarizecchapter = asyncWrapper(async (req, res, next) => {
    const { chapterId } = req.body;
    const user = req.user as any;

    if (!chapterId) {
        return next(ErrorHandler.createError("chapterId is required", 400));
    }

    const summaryKey = CacheKeys.getSummaryKey(chapterId);

    // ✅ Try cache first
    const cachedSummary = await CacheHelper.get(summaryKey);
    if (cachedSummary) {
        return res.status(200).json({
            success: true,
            message: "Retrieved summary from cache",
            summary: cachedSummary,
            cached: true,
        });
    }

    // ✅ Try MongoDB
    const chapter = await ChapterModel.findById(chapterId);
    if (!chapter) {
        return next(ErrorHandler.createError("Chapter not found", 404));
    }

    if (chapter.summaryId) {
        const summaryModel = await SummaryModel.findById(chapter.summaryId);
        if (summaryModel) {
            // Repopulate cache
            await CacheHelper.set(
                summaryKey,
                summaryModel.summary,
                CacheKeys.TTL.ONE_WEEK
            );

            return res.status(200).json({
                success: true,
                message: "Retrieved summary from database",
                summary: summaryModel.summary,
                cached: false,
            });
        }
    }

    // ✅ Generate new summary - use Groq if overcontent exists, otherwise fallback to Gemini
    const hasOvercontent = chapter.overcontent && chapter.overcontent.trim().length > 0;

    if (!hasOvercontent && !Buffer.isBuffer(chapter.content)) {
        return next(ErrorHandler.createError("Chapter content is missing", 400));
    }

    const systemPrompt = `You are an expert AI educator. Generate a structured, high-quality JSON summary of educational content using this schema:

{
  "chapter_title": "string",
  "chapter_overview": {
    "title": "Chapter Overview",
    "summary": "A clear, 5–8 sentence paragraph that explains the topic comprehensively in natural language. It should cover what the concept is, why it matters, and its main principles or mechanisms."
  },
  "key_takeaways": [
    "4–6 short bullet points summarizing the essential facts or principles."
  ],
  "key_points": [
    {
      "title": "Concept or Subtopic Title",
      "type": "concept | important | example",
      "content": "2–4 sentences explaining the idea, how it works, and why it's important. Write in an educational and concise style."
    }
  ],
  "definitions": [
    {
      "term": "Key Term",
      "definition": "Concise, clear definition that explains the meaning in one or two sentences."
    }
  ],
  "flashcards": [
    {
      "question": "A direct question that tests understanding of a concept",
      "answer": "A concise factual answer (1–2 sentences)."
    }
  ]
}

Guidelines:
- Output **only valid JSON** — no Markdown, no extra commentary, no quotes around keys that aren't needed.
- Write in clear, accessible academic English for undergraduate computer science students.
- Be accurate, concise, and educational.
- Fill all fields meaningfully, even if the source text lacks detail (infer sensibly).
- Focus on conceptual clarity, real-world relevance, and test-ready phrasing for flashcards.`;

    let summaryJson;

    // Use Gemini API for both overcontent (text) and PDF (inline) paths
    const base64File = chapter.content ? chapter.content.toString("base64") : "";
    const mimeType = getMimeType("chapter.pdf", chapter.contentType);

    let geminiPrompt: string;
    if (hasOvercontent) {
        geminiPrompt = `${systemPrompt}\n\nGenerate the JSON summary for this chapter content:\n\n${chapter.overcontent}`;
    } else {
        geminiPrompt = `${systemPrompt}\n\nNow generate the JSON summary for the chapter content in this PDF.`;
    }

    const requestBody: any = {
        contents: [
            {
                parts: hasOvercontent
                    ? [{ text: geminiPrompt }]
                    : [
                        { text: geminiPrompt },
                        { inlineData: { mimeType, data: base64File } },
                    ],
            },
        ],
        generationConfig: { temperature: 0.5, maxOutputTokens: 8192 },
    };

    const response = await retryGeminiApiCall(requestBody);
    const data = await response.json();
    const rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text || "";

    // Try JSON.parse first, then attempt repair if needed
    try {
        summaryJson = JSON.parse(rawText);
    } catch {
        try {
            const { jsonrepair } = require("jsonrepair");
            summaryJson = JSON.parse(jsonrepair(rawText));
        } catch (err) {
            return next(ErrorHandler.createError("Invalid JSON response from Gemini API", 400));
        }
    }

    // Save in MongoDB
    const summaryModel = await SummaryModel.create({
        chapterId,
        summary: summaryJson,
        createdBy: user._id,
        updatedBy: user._id,
    });

    chapter.summaryId = summaryModel._id;
    await chapter.save();

    // Cache the summary
    await CacheHelper.set(summaryKey, summaryJson, CacheKeys.TTL.ONE_WEEK);

    // ✅ Update analysis: last summary
    try {
        await AnalysisService.updateLastSummary(user._id.toString(), summaryModel._id.toString());

        // Track summary creation in profile
        const { ProfileService } = await import('../services/profileService');
        await ProfileService.incrementSummariesCreated(user._id.toString());
        await ProfileService.updateStreak(user._id.toString());
    } catch (e) {
        console.error("Error updating analysis/profile:", e);
    }

    return res.status(200).json({
        success: true,
        message: "Summary generated successfully",
        summary: summaryJson,
        summaryModel,
        cached: false,
    });
});

const getChapterSummary = asyncWrapper(async (req, res, next) => {
    const { chapterId } = req.params;
    const user = req.user as any;
    const chapter = await ChapterModel.findById(chapterId);

    if (!chapter) {
        return next(ErrorHandler.createError("Chapter not found", 404));
    }

    const summary = await SummaryModel.findOne({ chapterId: chapter._id });

    if (!summary) {
        return next(ErrorHandler.createError("Summary not found", 404));
    }

    // Track summary access in analysis
    try {
        await AnalysisService.updateLastSummary(user._id.toString(), summary._id.toString());
    } catch (e) {
        console.error("Error tracking summary access:", e);
    }

    res.status(200).json({
        success: true,
        message: "Summary retrieved successfully",
        summary,
    });
});

const SummaryController = {
    summarizecchapter,
    getChapterSummary,
};

export default SummaryController;
