import mongoose, { Document } from "mongoose";
import { ICreateChapterBody } from "../interfaces/ICreateChapterBody";
import { IUploadFile } from "../interfaces/IUploadFile";
import { IUser } from "../interfaces/IUser";
import ChapterModel from "../models/ChapterModel";
import FolderModel from "../models/FolderModel";
import { ensureBuffer } from "../utils/bufferUtils";
import { CacheKeys } from "../utils/cache_keys";
import CacheHelper from "../utils/cacheHelper";
import ErrorHandler from "../utils/error";
import { verifyFolderOwnership } from "../utils/folderAccess";
import { sanitizeExtractedText } from "../utils/textSanitizer";
import { extractContentFromDocument } from "./aiExtractionService";
import { ChapterCacheService } from "./chapterCacheService";
import { processChapterFile } from "./chapterFileService";

export const deleteChapterService = async (
    user: IUser,
    chapterId: string
): Promise<{ success: boolean; message: string }> => {
    const chapter = await ChapterModel.findById(chapterId);
    if (!chapter) throw ErrorHandler.createError("Chapter not found", 404);

    const folder = await verifyFolderOwnership(user, chapter.folderId.toString());

    await chapter.deleteOne();

    // Invalidate all related caches
    await ChapterCacheService.invalidateForDeletion(chapterId, folder);

    return { success: true, message: "Chapter deleted successfully" };
};

export const updateChapterService = async (
    user: IUser,
    chapterId: string,
    body: ICreateChapterBody
): Promise<{ success: boolean; message: string }> => {
    // 1. Validation
    if (!chapterId || !mongoose.Types.ObjectId.isValid(chapterId)) {
        throw ErrorHandler.createError("Invalid chapter ID", 400);
    }
    if (!body.title || body.title.trim().length === 0) {
        throw ErrorHandler.createError("Title is required and cannot be empty", 400);
    }
    if (body.title.trim().length > 200) {
        throw ErrorHandler.createError("Title cannot exceed 200 characters", 400);
    }
    if (body.description && body.description.length > 1000) {
        throw ErrorHandler.createError("Description cannot exceed 1000 characters", 400);
    }
    if (body.folderId && !mongoose.Types.ObjectId.isValid(body.folderId)) {
        throw ErrorHandler.createError("Invalid folder ID", 400);
    }

    // 2. Fetch and Verify
    const chapter = await ChapterModel.findById(chapterId);
    if (!chapter) throw ErrorHandler.createError("Chapter not found", 404);

    const currentFolder = await verifyFolderOwnership(user, chapter.folderId.toString());

    // 3. Handle Folder Move if necessary
    let newFolder = null;
    const isFolderChanging = body.folderId && body.folderId !== chapter.folderId.toString();
    if (isFolderChanging) {
        newFolder = await verifyFolderOwnership(user, body.folderId!);
        chapter.folderId = new mongoose.Types.ObjectId(body.folderId);
    }

    // 4. Update and Save
    chapter.title = body.title.trim();
    chapter.description = body.description ? body.description.trim() : chapter.description;
    chapter.updatedBy = user._id;
    await chapter.save();

    // 5. Cache Invalidation
    await ChapterCacheService.invalidateForUpdate(chapterId, currentFolder, newFolder);

    return { success: true, message: "Chapter updated successfully" };
};

export const createChapterService = async (
    user: IUser,
    body: ICreateChapterBody,
    file: IUploadFile
): Promise<{ chapter: Document; extractedText: string | null }> => {
    const { folderId, title, description, category } = body;
    const folder = await FolderModel.findById(folderId);
    if (!folder) throw ErrorHandler.createError("Folder not found", 404);

    if (!file || (file.mimetype !== "application/pdf" && file.mimetype !== "application/vnd.openxmlformats-officedocument.presentationml.presentation")) {
        throw ErrorHandler.createError("PDF or PowerPoint file is required", 400);
    }

    // Initialize Firebase Job
    const { initChapterJob, updateChapterJobProgress, completeChapterJob, failChapterJob } = await import("./firebaseChapterService");
    await initChapterJob(user._id.toString());

    try {
        await updateChapterJobProgress(user._id.toString(), 0, "Chapter upload received, starting processing");

        // 1. File Processing (PPTX to PDF conversion)
        const { buffer: processingBuffer, mimeType: processingMimeType, isPowerPoint } = await processChapterFile(
            file,
            user._id.toString(),
            (p, m) => updateChapterJobProgress(user._id.toString(), p, m),
            (m) => failChapterJob(user._id.toString(), m)
        );

        await updateChapterJobProgress(user._id.toString(), 25, "Starting content extraction");

        // 2. AI Content Extraction
        const extractedText = await extractContentFromDocument(processingBuffer, processingMimeType, isPowerPoint);
        await updateChapterJobProgress(user._id.toString(), 50, "Extraction service responded");

        // 3. Cleanup extracted text
        const cleanedText = sanitizeExtractedText(extractedText);

        // 4. Create Database Entry
        const chapter = await ChapterModel.create({
            content: processingBuffer,
            contentType: processingMimeType,
            createdBy: user._id,
            updatedBy: user._id,
            folderId,
            overcontent: cleanedText || null,
            title,
            description,
            category,
        });

        // 5. Invalidate and Warmup Caches
        const overcontentKey = CacheKeys.getChapterOverContentKey(chapter._id.toString());
        await CacheHelper.set(overcontentKey, cleanedText, CacheKeys.TTL.ONE_WEEK);

        await ChapterCacheService.invalidateForCreation(chapter._id.toString(), folder);

        const contentKey = CacheKeys.getChapterContentKey(chapter._id.toString());
        await CacheHelper.delete(contentKey);

        await updateChapterJobProgress(user._id.toString(), 75, "Content extraction and cache update completed");

        // 6. Complete Job
        await completeChapterJob(user._id.toString(), chapter._id.toString());
        return { chapter, extractedText };

    } catch (e: any) {
        console.error("[ChapterService] Error during chapter creation:", e);
        if (e.statuscode === 503) throw e;

        await failChapterJob(user._id.toString(), "Server is busy. Please try again later.");
        throw ErrorHandler.createError("Server is busy. Please try again later.", 503);
    }
};

export const getChaptersService = async (
    user: IUser,
    folderId: string
): Promise<any[]> => {
    if (!folderId) throw ErrorHandler.createError("folderId is required", 400);
    const userId = user._id;

    // Aggregation for chapters with quiz status
    return await ChapterModel.aggregate([
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
        { $addFields: { userQuizStatusObj: { $arrayElemAt: ["$userQuizStatus", 0] } } },
        {
            $project: {
                _id: 1,
                title: 1,
                description: 1,
                createdAt: 1,
                createdBy: 1,
                quizId: 1,
                summaryId: 1,
                mindmapId: 1,
                quizStatus: { $ifNull: ["$userQuizStatusObj.status", "NotTaken"] },
                quizScore: { $ifNull: ["$userQuizStatusObj.score", 0] },
                quizCompleted: { $cond: [{ $ifNull: ["$userQuizStatusObj", false] }, true, false] },
            },
        },
    ]);
};

export const getChapterContentService = async (
    user: IUser,
    chapterId: string
): Promise<{ content: string; contentType: string; cached: boolean }> => {
    const chapter = await ChapterModel.findById(chapterId);
    if (!chapter) throw ErrorHandler.createError("Chapter not found", 404);

    const cachedContent = await CacheHelper.getCachedChapterContent(chapterId);
    if (cachedContent) {
        return {
            content: cachedContent.toString('base64'),
            contentType: chapter.contentType,
            cached: true
        };
    }

    // Handle generic content types (YouTube URLs, etc.)
    if (typeof chapter.content === 'string') {
        return { content: chapter.content, contentType: chapter.contentType, cached: false };
    }

    // Process Buffer content
    const contentBuffer = ensureBuffer(chapter.content);
    if (!contentBuffer) {
        throw ErrorHandler.createError("Chapter content is corrupted", 500);
    }

    await CacheHelper.cacheChapterContent(chapterId, contentBuffer, CacheKeys.TTL.ONE_WEEK);

    return {
        content: contentBuffer.toString('base64'),
        contentType: chapter.contentType,
        cached: false
    };
};
