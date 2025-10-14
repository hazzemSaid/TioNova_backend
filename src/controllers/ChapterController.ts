import mongoose from "mongoose";
import asyncWrapper from "../middleware/asyncwrapper";
import ChapterModel from "../models/ChapterModel";
import FolderModel from "../models/FolderModel";
import { CacheKeys } from "../utils/cache_keys";
import CacheHelper from "../utils/cacheHelper";
import ErrorHandler from "../utils/error";
import { getMimeType, retryGeminiApiCall } from "../utils/geminiApi";

const createchapter = asyncWrapper(async (req, res, next) => {
    const { folderId, title, description, category } = req.body;
    const file = req.file;
    
    const folder = await FolderModel.findById(folderId);
    if (!folder) {
        return next(ErrorHandler.createError("Folder not found", 404));
    }
    
    if (!file) {
        return next(ErrorHandler.createError("PDF file is required", 400));
    }
    
    if (file.mimetype !== "application/pdf") {
        return next(ErrorHandler.createError("PDF file is required", 400));
    }

    // Extract and clean content from PDF using Gemini
    const requestBody = {
        contents: [
            {
                parts: [
                    {
                        text: `
You are an expert document cleaning and text extraction assistant. Your task is to process the provided PDF and return a clean, structured, and complete text version of its content.

**Instructions:**
1. **Extract all text.** Capture all readable text from the document, including headings, paragraphs, and lists.
2. **Remove noise and artifacts.** Eliminate OCR errors, visual artifacts, duplicated phrases, page numbers, headers, and footers.
3. **Structure and normalize content.**
    * Reconstruct broken sentences and paragraphs.
    * Maintain the original hierarchy of chapters, sections, and sub-sections.
    * Preserve bullet points, numbered lists, and code blocks.
4. **Final output:** Provide ONLY the cleaned, raw text content of the document. Do not summarize, interpret, or add any commentary. The final output must be ready for further AI analysis, such as quiz generation.

**Output format:** Return the full, uninterpreted text in a single, well-formatted string.
`,
                    },
                    {
                        inlineData: {
                            mimeType: getMimeType(file.originalname),
                            data: file.buffer.toString("base64"),
                        },
                    },
                ],
            },
        ],
        generationConfig: { temperature: 0.5, maxOutputTokens: 8192 },
    };

    const response = await retryGeminiApiCall(requestBody);
    const data = await response.json();

    const chapter = await ChapterModel.create({
        content: file.buffer,
        contentType: file.mimetype,
        createdBy: req.user._id,
        updatedBy: req.user._id,
        folderId,
        overcontent: data?.candidates?.[0]?.content?.parts?.[0]?.text ?? null,
        title,
        description,
        category,
    });

    // Cache the overcontent
    if (data?.candidates?.[0]?.content?.parts?.[0]?.text) {
        const overcontentKey = CacheKeys.getChapterOverContentKey(chapter._id.toString());
        await CacheHelper.set(
            overcontentKey,
            data.candidates[0].content.parts[0].text,
            CacheKeys.TTL.ONE_WEEK
        );
    }

    // ✅ Invalidate chapters list for all affected users
    const affectedUsers = [
        folder.ownerId.toString(),
        ...(folder.sharedWith || []).map((id: any) => id.toString()),
    ];
    
    await CacheHelper.invalidateChaptersList(folderId, affectedUsers);

    res.status(200).json({
        success: true,
        message: "Chapter created successfully",
    });
});

const getchapters = asyncWrapper(async (req, res, next) => {
    const user = req.user;
    const userId = user._id;
    const { folderId } = req.params;
    
    if (!folderId) {
        return next(ErrorHandler.createError("folderId is required", 400));
    }

    const { data: chapters, cached } = await CacheHelper.getOrSet(
        CacheKeys.getChaptersListKey(folderId, userId),
        async () => {
            const chaptersWithStatus = await ChapterModel.aggregate([
                { $match: { folderId: new mongoose.Types.ObjectId(folderId) } },
                {
                    $lookup: {
                        from: "userquizstatuses",
                        let: { chapterId: "$_id" },
                        pipeline: [
                            {
                                $match: {
                                    $expr: {
                                        $and: [
                                            { $eq: ["$chapterId", "$$chapterId"] },
                                            { $eq: ["$userId", new mongoose.Types.ObjectId(userId)] },
                                        ],
                                    },
                                },
                            },
                            { $sort: { updatedAt: -1 } },
                            { $limit: 1 },
                        ],
                        as: "userQuizStatus",
                    },
                },
                {
                    $addFields: {
                        userQuizStatusObj: { $arrayElemAt: ["$userQuizStatus", 0] },
                    },
                },
                {
                    $project: {
                        _id: 1,
                        title: 1,
                        description: 1,
                        createdAt: 1,
                        createdBy: 1,
                        quizId: 1,
                        summaryId: 1,
                        quizStatus: { $ifNull: ["$userQuizStatusObj.status", "NotTaken"] },
                        quizScore: { $ifNull: ["$userQuizStatusObj.score", 0] },
                        quizCompleted: {
                            $cond: [{ $ifNull: ["$userQuizStatusObj", false] }, true, false],
                        },
                    },
                },
            ]);

            return chaptersWithStatus;
        },
        CacheKeys.TTL.SIX_HOURS
    );

    res.status(200).json({
        success: true,
        message: "Chapters retrieved successfully",
        chapters,
        cached,
    });
});

const getchaptercontent = asyncWrapper(async (req, res, next) => {
    const { chapterId } = req.params;
    const chapter = await ChapterModel.findById(chapterId);
    
    if (!chapter) {
        return next(ErrorHandler.createError("Chapter not found", 404));
    }

    const cachedContent = await CacheHelper.getCachedChapterContent(chapterId);
    
    if (cachedContent) {
        return res.status(200).json({
            success: true,
            message: "Chapter content retrieved from cache",
            content: cachedContent,
            contentType: chapter.contentType,
            cached: true,
        });
    }

    // Cache the content
    await CacheHelper.cacheChapterContent(
        chapterId,
        chapter.content,
        CacheKeys.TTL.ONE_WEEK
    );

    res.status(200).json({
        success: true,
        message: "Chapter content retrieved successfully",
        content: chapter.content,
        contentType: chapter.contentType,
        cached: false,
    });
});

const deletechapter = asyncWrapper(async (req, res, next) => {
    const { chapterId } = req.params;
    const userId = req.user._id;
    
    const chapter = await ChapterModel.findById(chapterId);
    if (!chapter) {
        return next(ErrorHandler.createError("Chapter not found", 404));
    }

    const folderId = chapter.folderId;
    const folder = await FolderModel.findById(folderId);
    
    if (!folder) {
        return next(ErrorHandler.createError("Folder not found", 404));
    }

    if (folder.ownerId.toString() !== userId.toString()) {
        return next(
            ErrorHandler.createError(
                "You do not have access to delete this chapter. Must be the owner of the folder",
                403
            )
        );
    }

    const affectedUsers = [
        folder.ownerId.toString(),
        ...(folder.sharedWith || []).map((id: any) => id.toString()),
    ];

    // ✅ Invalidate all chapter-related caches
    await CacheHelper.invalidateChapter(chapterId, folder._id.toString(), affectedUsers);

    await chapter.deleteOne();

    res.status(200).json({
        success: true,
        message: "Chapter deleted successfully",
    });
});

const ChapterController = {
    createchapter,
    getchapters,
    getchaptercontent,
    deletechapter,
};

export default ChapterController;
