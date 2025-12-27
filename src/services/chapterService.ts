import mongoose, { Document } from "mongoose";
import { ICreateChapterBody } from "../interfaces/ICreateChapterBody";
import { IUploadFile } from "../interfaces/IUploadFile";
import { IUser } from "../interfaces/IUser";
import ChapterModel from "../models/ChapterModel";
import FolderModel from "../models/FolderModel";
import { CacheKeys } from "../utils/cache_keys";
import CacheHelper from "../utils/cacheHelper";
import ErrorHandler from "../utils/error";
import { retryGeminiApiCall } from "../utils/geminiApi";

export const deleteChapterService = async (
    user: IUser,
    chapterId: string
): Promise<{ success: boolean; message: string }> => {
    const chapter = await ChapterModel.findById(chapterId);
    if (!chapter) throw ErrorHandler.createError("Chapter not found", 404);
    const folderId = chapter.folderId;
    const folder = await FolderModel.findById(folderId);
    if (!folder) throw ErrorHandler.createError("Folder not found", 404);
    if (folder.ownerId.toString() !== user._id.toString()) {
        throw ErrorHandler.createError("You do not have access to delete this chapter. Must be the owner of the folder", 403);
    }
    const affectedUsers = [
        folder.ownerId.toString(),
        ...(folder.sharedWith || []).map((id: any) => id.toString()),
    ];
    await CacheHelper.invalidateChapter(chapterId, folder._id.toString(), affectedUsers);

    // Invalidate folder cache to update chapterCount
    await Promise.all(
        affectedUsers.map(uid => CacheHelper.invalidateUserFolders(uid))
    );

    // Invalidate profile cache so totalChapters updates
    await CacheHelper.delete(CacheKeys.getUserProfileKey(folder.ownerId.toString()));

    await chapter.deleteOne();
    return { success: true, message: "Chapter deleted successfully" };
};







export const updateChapterService = async (
    user: IUser,
    chapterId: string,
    body: ICreateChapterBody
): Promise<{ success: boolean; message: string }> => {
    // Validate chapterId
    if (!chapterId || !mongoose.Types.ObjectId.isValid(chapterId)) {
        throw ErrorHandler.createError("Invalid chapter ID", 400);
    }

    // Validate required fields
    if (!body.title || body.title.trim().length === 0) {
        throw ErrorHandler.createError("Title is required and cannot be empty", 400);
    }

    if (body.title.trim().length > 200) {
        throw ErrorHandler.createError("Title cannot exceed 200 characters", 400);
    }

    if (body.description && body.description.length > 1000) {
        throw ErrorHandler.createError("Description cannot exceed 1000 characters", 400);
    }

    // Validate folderId if provided
    if (body.folderId && !mongoose.Types.ObjectId.isValid(body.folderId)) {
        throw ErrorHandler.createError("Invalid folder ID", 400);
    }

    // Find the chapter
    const chapter = await ChapterModel.findById(chapterId);
    if (!chapter) throw ErrorHandler.createError("Chapter not found", 404);

    // Get the current folder and verify ownership
    const currentFolder = await FolderModel.findById(chapter.folderId);
    if (!currentFolder) throw ErrorHandler.createError("Current folder not found", 404);

    if (currentFolder.ownerId.toString() !== user._id.toString()) {
        throw ErrorHandler.createError("You do not have access to update this chapter. Must be the owner of the folder", 403);
    }

    // If folderId is being changed, validate the new folder
    const isFolderChanging = body.folderId && body.folderId !== chapter.folderId.toString();

    if (isFolderChanging) {
        const newFolder = await FolderModel.findById(body.folderId);
        if (!newFolder) throw ErrorHandler.createError("New folder not found", 404);

        // Verify user has access to the new folder
        if (newFolder.ownerId.toString() !== user._id.toString()) {
            throw ErrorHandler.createError("You do not have access to move chapter to this folder. Must be the owner", 403);
        }

        // Update folderId
        chapter.folderId = new mongoose.Types.ObjectId(body.folderId);

        // Invalidate new folder cache
        const affectedUsersNewFolder = [
            newFolder.ownerId.toString(),
            ...(newFolder.sharedWith || []).map((id: any) => id.toString()),
        ];
        await CacheHelper.invalidateChaptersList(newFolder._id.toString(), affectedUsersNewFolder);

        // Invalidate new folder cache to update chapterCount
        await Promise.all(
            affectedUsersNewFolder.map(uid => CacheHelper.invalidateUserFolders(uid))
        );
    }

    // Update chapter fields
    chapter.title = body.title.trim();
    chapter.description = body.description ? body.description.trim() : chapter.description;
    chapter.updatedBy = user._id;
    await chapter.save();

    console.log(`[UpdateChapter] Chapter ${chapterId} updated successfully`);

    // Invalidate current folder cache
    const affectedUsersOldFolder = [
        currentFolder.ownerId.toString(),
        ...(currentFolder.sharedWith || []).map((id: any) => id.toString()),
    ];

    console.log(`[UpdateChapter] Invalidating chapter cache for chapter ${chapterId} in folder ${currentFolder._id} (${affectedUsersOldFolder.length} users)`);
    await CacheHelper.invalidateChapter(chapterId, currentFolder._id.toString(), affectedUsersOldFolder);

    // Invalidate current folder cache to update chapterCount (if moved) or just to be safe
    await Promise.all(
        affectedUsersOldFolder.map(uid => CacheHelper.invalidateUserFolders(uid))
    );

    console.log(`[UpdateChapter] ✅ All caches invalidated successfully`);

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
    if (!file || file.mimetype !== "application/pdf") throw ErrorHandler.createError("PDF file is required", 400);

    // Initialize Firebase Job
    const { initChapterJob, updateChapterJobProgress, completeChapterJob, failChapterJob } = await import("./firebaseChapterService");
    await initChapterJob(user._id.toString());

    let chapter = null;
    try {
        await updateChapterJobProgress(user._id.toString(), 0, "Chapter upload received, starting processing");

        const base64 = file.buffer.toString("base64");
        const requestBody = {
            contents: [{
                parts: [
                    { text: `You are an expert educational content extractor. Your goal is to convert the provided PDF into a rich, detailed, and structured text format perfectly optimized for generating high-quality summaries and quizzes.\n\n**Core Responsibilities:**\n1. **Deep Extraction:** Capture EVERY educational detail. Do not summarize. Include:\n    * Full explanations of concepts.\n    * All examples, case studies, and scenarios.\n    * Technical details, formulas, and data points.\n    * Code blocks and algorithms (preserve exact formatting).\n2. **Question Handling (CRITICAL):** If the PDF contains questions (practice problems, review questions, etc.), you MUST extract them and treat them as critical verification rules.\n    * Label them clearly as "[Existing Question]: <Question Text>"\n    * If answers are provided, include them.\n3. **Noise Elimination:** Remove headers, footers, page numbers, author names, references, and watermarks. Keep only the learning content.\n4. **Smart Structuring:** Use Markdown.\n    * # for Chapters, ## for Sections, ### for Subsections.\n    * Use bullet points for lists.\n    * **Bold** key terms and definitions.\n\n**Output:** A single, comprehensive Markdown string containing the raw, detailed knowledge from the document.` },
                    { inlineData: { mimeType: file.mimetype, data: base64 } }
                ]
            }],
            generationConfig: { temperature: 0.5, maxOutputTokens: 8192 },
        };

        await updateChapterJobProgress(user._id.toString(), 25, "Starting content extraction");

        const response = await retryGeminiApiCall(requestBody);
        const data = await response.json();

        await updateChapterJobProgress(user._id.toString(), 50, "Extraction service responded");

        const extractedText = data?.candidates?.[0]?.content?.parts?.[0]?.text;
        chapter = await ChapterModel.create({
            content: file.buffer,
            contentType: file.mimetype,
            createdBy: user._id,
            updatedBy: user._id,
            folderId,
            overcontent: extractedText || null,
            title,
            description,
            category,
        });

        if (extractedText) {
            const overcontentKey = CacheKeys.getChapterOverContentKey(chapter._id.toString());
            await CacheHelper.set(overcontentKey, extractedText, CacheKeys.TTL.ONE_WEEK);
            const affectedUsers = [folder.ownerId.toString(), ...((folder.sharedWith || []).map((id) => id.toString()))];
            await CacheHelper.invalidateChaptersList(folderId, affectedUsers);
            const contentKey = CacheKeys.getChapterContentKey(chapter._id.toString());
            await CacheHelper.delete(contentKey);

            // Invalidate profile cache so totalChapters updates
            await CacheHelper.delete(CacheKeys.getUserProfileKey(folder.ownerId.toString()));

            await updateChapterJobProgress(user._id.toString(), 75, "Content extraction and cache update completed");
        }

        await completeChapterJob(user._id.toString(), chapter._id.toString());
        return { chapter, extractedText };
    } catch (e) {
        // Even if extraction fails, we might still have created a chapter (or not)
        // If chapter wasn't created yet, create it now without extracted text
        if (!chapter) {
            chapter = await ChapterModel.create({
                content: file.buffer,
                contentType: file.mimetype,
                createdBy: user._id,
                updatedBy: user._id,
                folderId,
                overcontent: null,
                title,
                description,
                category,
            });
        }

        // If we have a chapter, we consider it a success but with extraction failure? 
        // Or should we mark the job as failed? 
        // The original code returned the chapter even on error.
        // Let's mark it as completed but maybe with a warning in message if we want, 
        // but to keep consistent with original logic:

        await completeChapterJob(user._id.toString(), chapter._id.toString());

        // Note: If the error was critical enough that chapter creation failed, 
        // the catch block in the controller would catch it. 
        // But here we are catching extraction errors specifically?
        // Actually the original code caught ALL errors in this block and created a chapter without content.

        return { chapter, extractedText: null };
    }
};

export const getChaptersService = async (
    user: IUser,
    folderId: string
): Promise<any[]> => {
    if (!folderId) throw ErrorHandler.createError("folderId is required", 400);
    const userId = user._id;
    const chapters = await ChapterModel.aggregate([
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
    return chapters;
};

export const getChapterContentService = async (
    user: IUser,
    chapterId: string
): Promise<{ content: string; contentType: string; cached: boolean }> => {
    const chapter = await ChapterModel.findById(chapterId);
    if (!chapter) throw ErrorHandler.createError("Chapter not found", 404);

    const cachedContent = await CacheHelper.getCachedChapterContent(chapterId);
    if (cachedContent) {
        // Convert Buffer to base64 string for JSON response
        const base64Content = cachedContent.toString('base64');
        return { content: base64Content, contentType: chapter.contentType, cached: true };
    }

    // Convert MongoDB Binary/Buffer to proper Node.js Buffer, then to base64
    let contentBuffer: Buffer;
    if (Buffer.isBuffer(chapter.content)) {
        contentBuffer = chapter.content;
    } else if (chapter.content && chapter.content.buffer) {
        // Handle MongoDB Binary type
        contentBuffer = Buffer.from(chapter.content.buffer);
    } else if (typeof chapter.content === 'string') {
        // If content is already a string (e.g., YouTube URL), return as-is
        return { content: chapter.content, contentType: chapter.contentType, cached: false };
    } else {
        // Fallback: try to create buffer from content
        contentBuffer = Buffer.from(chapter.content);
    }

    // Cache the content for future requests
    await CacheHelper.cacheChapterContent(chapterId, contentBuffer, CacheKeys.TTL.ONE_WEEK);

    // Return as base64 string for JSON serialization
    const base64Content = contentBuffer.toString('base64');
    return { content: base64Content, contentType: chapter.contentType, cached: false };
};
