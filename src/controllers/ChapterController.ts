import asyncWrapper from "../middleware/asyncwrapper";
import { createChapterService, deleteChapterService, getChapterContentService, getChaptersService } from "../services/chapterService";
import ErrorHandler from "../utils/error";
import { sendEventToUser } from "./sseController";
const createchapter = asyncWrapper(async (req, res, next) => {
    try {
        let result;
        let chapterObj;
        let chapterResponse;
         if (req.body.contentType === "application/pdf" || req.file) {
            result = await createChapterService(req.user, req.body, req.file, sendEventToUser);
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
        next(err);
    }
});

const getchapters = asyncWrapper(async (req, res, next) => {
    try {
        const chapters = await getChaptersService(req.user, req.params.folderId);
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
};

export default ChapterController;
