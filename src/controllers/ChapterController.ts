import mongoose from "mongoose";
import asyncWrapper from "../middleware/asyncwrapper";
import ChapterModel from "../models/ChapterModel";
import FolderModel from "../models/FolderModel";
import { chapterQueue } from "../queues/chapterQueue";
import { CacheKeys } from "../utils/cache_keys";
import CacheHelper from "../utils/cacheHelper";
import ErrorHandler from "../utils/error";

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

    const chapter = await ChapterModel.create({
        content: file.buffer,
        contentType: file.mimetype,
        createdBy: req.user._id,
        updatedBy: req.user._id,
        folderId,
        overcontent: null,
        title,
        description,
        category,
    });

    try {
        const job = await chapterQueue.add(
            "extractContent",
            {
                chapterId: chapter._id.toString(),
                folderId: folderId.toString(),
                userId: req.user._id.toString(),
                fileName: file.originalname,
                fileBuffer: file.buffer.toString("base64"),
                mimeType: file.mimetype,
                ownerId: folder.ownerId.toString(),
                sharedWith: (folder.sharedWith || []).map((id: any) => id.toString()),
            },
            {
                attempts: 3,
                backoff: {
                    type: "exponential",
                    delay: 2000,
                },
                removeOnComplete: true,
                removeOnFail: false,
            }
        );

        console.log(`✅ Job queued successfully - Job ID: ${job.id}, Chapter ID: ${chapter._id}`);
    } catch (error) {
        console.error("❌ Failed to queue job:", error);
        return next(ErrorHandler.createError("Failed to queue content extraction", 500));
    }

    res.status(200).json({
        success: true,
        message: "Chapter created successfully. Content extraction in progress...",
        chapterId: chapter._id,
        jobStatus: "Processing",
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
