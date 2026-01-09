import asyncWrapper from "../middleware/asyncwrapper";
import ChapterModel from "../models/ChapterModel";
import SummaryModel from "../models/SummaryModel";
import { AnalysisService } from "../services/analysisService";
import { CacheKeys } from "../utils/cache_keys";
import CacheHelper from "../utils/cacheHelper";
import ErrorHandler from "../utils/error";
import { callOpenRouterApi, extractOpenRouterText } from "../utils/openRouterApi";

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

    // ✅ Generate new summary - use OpenRouter for text content
    const hasOvercontent = chapter.overcontent && chapter.overcontent.trim().length > 0;

    if (!hasOvercontent && !Buffer.isBuffer(chapter.content)) {
        return next(ErrorHandler.createError("Chapter content is missing", 400));
    }

    const systemPrompt = `You are an expert educator. Generate a clear, well-structured JSON summary.

OUTPUT SCHEMA:
{
  "chapter_title": "Topic Name",
  "chapter_overview": {
    "title": "Overview",
    "summary": "5-8 sentences explaining what this topic is, why it matters, and its core principles. Write clearly and directly."
  },
  "key_takeaways": [
    "4-6 essential points - the most important things to remember"
  ],
  "key_points": [
    {
      "title": "Concept Name",
      "type": "concept | important | example",
      "content": "2-3 sentences explaining what it is and why it matters. Be concise."
    }
  ],
  "definitions": [
    {
      "term": "Key Term",
      "definition": "Clear, 1-2 sentence definition in plain language."
    }
  ],
  "flashcards": [
    {
      "question": "Direct question testing understanding",
      "answer": "Concise factual answer (1-2 sentences)"
    }
  ]
}

WRITING RULES:
1. BE DIRECT - No filler words or unnecessary complexity
2. PARAPHRASE - Restate concepts in your own words, don't copy text
3. BE EDUCATIONAL - Write for students who need to understand and remember
4. BE ACCURATE - Only include information from the source content
5. USE PLAIN LANGUAGE - Explain complex ideas simply

OUTPUT: Valid JSON only (no markdown, no commentary)`;

    let summaryJson;
    let rawText: string = "";

    // ✅ Use OpenRouter for text content
    if (hasOvercontent) {
        // Use OpenRouter with extracted text
        const prompt = `${systemPrompt}

Generate the JSON summary for this chapter content:

${chapter.overcontent}`;

        const data = await callOpenRouterApi({
            model: "tngtech/deepseek-r1t2-chimera:free",
            messages: [
                { role: 'user', content: prompt }
            ],
            maxOutputTokens: 16384
        });

        rawText = extractOpenRouterText(data);

        if (!rawText) {
            console.error("OpenRouter Empty Response:", JSON.stringify(data, null, 2));
            return next(ErrorHandler.createError("No response content from OpenRouter API. Please check API response.", 500));
        }
    } else {
        // PDF content without extracted text - OpenRouter fallback
        const prompt = `${systemPrompt}\n\nGenerate a JSON summary from the provided PDF content.`;

        const data = await callOpenRouterApi({
            model: "tngtech/deepseek-r1t2-chimera:free",
            messages: [
                { role: 'user', content: prompt }
            ],
            maxOutputTokens: 16384
        });

        rawText = extractOpenRouterText(data);

        if (!rawText) {
            console.error("OpenRouter Empty Response (PDF):", JSON.stringify(data, null, 2));
            return next(ErrorHandler.createError("No response content from OpenRouter API. Please check API response.", 500));
        }
    }

    // Parse output
    try {
        // Remove markdown code blocks if present
        const cleanedText = rawText.replace(/```json\n?|\n?```/g, "").trim();
        summaryJson = JSON.parse(cleanedText);
    } catch {
        // Retry parsing with repair if needed
        try {
            // Basic manual repair for common issues
            const fixedText = rawText.replace(/,\s*}/g, '}').replace(/,\s*]/g, ']');
            const cleanedText = fixedText.replace(/```json\n?|\n?```/g, "").trim();
            summaryJson = JSON.parse(cleanedText);
        } catch (e) {
            console.error("JSON Parse Error:", e);
            return next(ErrorHandler.createError("Invalid JSON response from AI service", 400));
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
