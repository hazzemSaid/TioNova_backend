import asyncWrapper from "../middleware/asyncwrapper";
import { AnalysisService } from "../services/analysisService";
import { createChapterService, deleteChapterService, getChapterContentService, getChaptersService, updateChapterService } from "../services/chapterService";
import { ProfileService } from "../services/profileService";
import ErrorHandler from "../utils/error";
const createchapter = asyncWrapper(async (req, res, next) => {
    try {
        let result;
        let chapterObj;
        let chapterResponse;
        if (req.body.contentType === "application/pdf" || req.file) {
            // Validate that file is present
            if (!req.file) {
                return next(ErrorHandler.createError("PDF file is required. Please upload a file.", 400));
            }
            // No longer passing sendEventToUser
            result = await createChapterService(req.user, req.body, req.file);
            chapterObj = typeof result.chapter.toObject === 'function' ? result.chapter.toObject() : result.chapter;
            chapterResponse = {
                _id: chapterObj._id,
                title: chapterObj.title,
                description: chapterObj.description,
                folderId: chapterObj.folderId,
                createdBy: chapterObj.createdBy,
                createdAt: chapterObj.createdAt,
                contentType: chapterObj.contentType,
                overcontent: result.extractedText || undefined,
            };
            res.status(200).json({
                success: true,
                message: "Chapter created successfully with content extraction",
                chapter: chapterResponse,
                jobStatus: "Completed",
            });
        } else {
            // Extend here for future content types
            return next(ErrorHandler.createError("Unsupported content type", 400));
        }
    } catch (err) {
        // If an error occurs that wasn't caught in service (e.g. initial validation), 
        // we should probably mark the firebase job as failed if we can?
        // But we might not have initialized it yet or don't want to complicate controller.
        // The service handles most errors by creating a chapter anyway (fallback).
        // Real critical errors will go to next(err).

        // Optional: Try to fail the firebase job if user ID is available
        if (req.user && req.user._id) {
            const { failChapterJob } = await import("../services/firebaseChapterService");
            try {
                await failChapterJob(req.user._id.toString(), (err as any).message || "Unknown error");
            } catch (firebaseErr) {
                console.error("Failed to update Firebase job status on error:", firebaseErr);
            }
        }

        next(err);
    }
});

const getchapters = asyncWrapper(async (req, res, next) => {
    try {
        const chapters = await getChaptersService(req.user, req.params.folderId);

        // Track folder access in analysis
        try {
            await AnalysisService.updateRecentFolders(req.user._id.toString(), req.params.folderId);
        } catch (e) {
            console.error("Error tracking folder access:", e);
        }

        res.status(200).json({
            success: true,
            message: "Chapters retrieved successfully",
            chapters,
        });
    } catch (err) {
        next(err);
    }
});

const getchaptercontent = asyncWrapper(async (req, res, next) => {
    try {
        const result = await getChapterContentService(req.user, req.params.chapterId);

        // Track chapter access in profile and analysis
        try {
            console.log(`[ChapterController] Logging chapter view for user ${req.user._id}`);
            await AnalysisService.updateRecentChapters(req.user._id.toString(), req.params.chapterId);
            await ProfileService.logDailyActivity(req.user._id.toString(), 'chapter', {
                chapterId: req.params.chapterId
            });
            await ProfileService.updateStreak(req.user._id.toString());
            console.log(`[ChapterController] ✅ Chapter activity logged`);
        } catch (e) {
            console.error("❌ [ChapterController] Error logging chapter activity:", e);
            console.error((e as Error).stack);
        }

        res.status(200).json({
            success: true,
            message: result.cached ? "Chapter content retrieved from cache" : "Chapter content retrieved successfully",
            content: result.content,
            contentType: result.contentType,
            cached: result.cached,
        });
    } catch (err) {
        next(err);
    }
});

const updatechapter = asyncWrapper(async (req, res, next) => {
    try {
        const { chapterId } = req.params;
        const result = await updateChapterService(req.user, chapterId, req.body);
        res.status(200).json({
            success: result.success,
            message: result.message,
        });
    } catch (err) {
        next(err);
    }
});

const deletechapter = asyncWrapper(async (req, res, next) => {
    try {
        const { chapterId } = req.params;
        const result = await deleteChapterService(req.user, chapterId);
        res.status(200).json({
            success: result.success,
            message: result.message,
        });
    } catch (err) {

        next(err);
    }
});
const ChapterController = {
    createchapter,
    getchapters,
    getchaptercontent,
    deletechapter,
    updatechapter,
};

export default ChapterController;
