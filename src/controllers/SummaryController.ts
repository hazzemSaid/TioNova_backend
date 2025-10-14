import asyncWrapper from "../middleware/asyncwrapper";
import ChapterModel from "../models/ChapterModel";
import SummaryModel from "../models/SummaryModel";
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

    // ✅ Generate new summary
    const chapterContent = chapter.overcontent || chapter.content?.toString("utf-8") || "";
    
    if (!chapterContent) {
        return next(ErrorHandler.createError("Chapter content missing", 400));
    }

    const base64File = chapter.content?.toString("base64") || "";
    const mimeType = getMimeType("chapter.pdf", chapter.contentType);
    
    const requestBody = {
        contents: [
            {
                parts: [
                    {
                        text: `You are a highly detailed academic assistant that **converts educational content into structured JSON**.
                    
                        Task:
                        - Carefully analyze the provided content.
                        - Output **only valid JSON** strictly following the schema below.
                        - Do not include any text, markdown, comments, or explanations outside the JSON.
                        - The output must be **directly parseable JSON** (no errors, no trailing commas).
                        
                        Schema:
                        
                        {
                          "key_concepts": [
                            {
                              "title": "Concise concept title",
                              "text": "Detailed explanation in 5–8 academic sentences. The text should highlight definitions, theory, context, and connections to related concepts.",
                              "tags": ["keyword1", "keyword2", "keyword3"],
                              "difficulty_level": "easy | medium | hard"
                            }
                          ],
                          "examples": [
                            {
                              "concept": "Reference to related concept title",
                              "example": "Worked-out example with step-by-step reasoning, using real numbers, equations, or problem-solving steps.",
                              "notes": "Optional practical insight, clarification, or common mistake in one short sentence."
                            }
                          ],
                          "professional_implications": [
                            {
                              "title": "Relevant professional field (e.g., Engineering, Medicine, Computer Science, Business)",
                              "text": "In-depth explanation of how the concept is used in real-world practice, why it matters, and its implications in that field."
                            }
                          ]
                        }
                        
                        Guidelines:
                        - Always include at least 3–5 key_concepts.
                        - Provide at least 2 examples (with real calculations, step-by-step if possible).
                        - Each professional_implication should connect theory to real-world professional impact.
                        - Ensure the tone is formal, academic, and precise.
                        - Never output empty arrays: if no data, omit that section completely.
                        - Never output markdown, code fences, or explanations — only the JSON object.
                        
                        Now process the following content:
                        ${chapter.overcontent || ""}`,
                    },
                    ...(chapter.overcontent ? [] : [
                        { inlineData: { mimeType, data: base64File } }
                    ]),
                ],
            },
        ],
        generationConfig: { temperature: 0.5, maxOutputTokens: 8192 },
    };

    const response = await retryGeminiApiCall(requestBody);
    const data = await response.json();
    const rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text || "";
    
    let summaryJson;
    try {
        summaryJson = JSON.parse(rawText);
    } catch {
        try {
            const { jsonrepair } = require("jsonrepair");
            summaryJson = JSON.parse(jsonrepair(rawText));
        } catch (err) {
            return next(ErrorHandler.createError("Invalid Gemini JSON response", 400));
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

    // ✅ Cache the result
    await CacheHelper.set(summaryKey, summaryJson, CacheKeys.TTL.ONE_WEEK);

    return res.status(200).json({
        success: true,
        message: "Chapter summarized successfully",
        summary: summaryJson,
        summaryModel,
        cached: false,
    });
});

const getChapterSummary = asyncWrapper(async (req, res, next) => {
    const { chapterId } = req.params;
    const chapter = await ChapterModel.findById(chapterId);
    
    if (!chapter) {
        return next(ErrorHandler.createError("Chapter not found", 404));
    }
    
    const summary = await SummaryModel.findOne({ chapterId: chapter._id });
    
    if (!summary) {
        return next(ErrorHandler.createError("Summary not found", 404));
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
