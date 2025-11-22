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
import { SendEventToUser, sendProgressEvent } from "./sseService";

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

    // Invalidate profile cache so totalChapters updates
    await CacheHelper.delete(CacheKeys.getUserProfileKey(folder.ownerId.toString()));

    await chapter.deleteOne();
    return { success: true, message: "Chapter deleted successfully" };
};









export const createChapterService = async (
    user: IUser,
    body: ICreateChapterBody,
    file: IUploadFile,
    sendEventToUser?: SendEventToUser
): Promise<{ chapter: Document; extractedText: string | null }> => {
    const { folderId, title, description, category } = body;
    const folder = await FolderModel.findById(folderId);
    if (!folder) throw ErrorHandler.createError("Folder not found", 404);
    if (!file || file.mimetype !== "application/pdf") throw ErrorHandler.createError("PDF file is required", 400);

    let chapter = null;
    let updatedChapter = null;
    if (sendEventToUser) {
        try { sendProgressEvent(user._id.toString(), 0, "Chapter upload received, starting processing"); } catch { }
    }
    try {
        const base64 = file.buffer.toString("base64");
        const requestBody = {
            contents: [{
                parts: [
                    { text: `You are an expert educational document cleaning and intelligent text extraction assistant. Your task is to process the provided PDF and return a clean, structured, and highly useful text version of its content for learning, summarization, and quiz generation.\n\n**Instructions:**\n1. **Extract all educationally relevant text.** Capture headings, paragraphs, lists, and explanations. Ignore names of doctors, personal information, author lists, institutional details, and any irrelevant metadata.\n2. **Remove noise and artifacts.** Eliminate OCR errors, visual artifacts, duplicated phrases, page numbers, headers, footers, and references to individuals or organizations.\n3. **Structure and normalize content.**\n     * Reconstruct broken sentences and paragraphs.\n     * Maintain the original hierarchy of chapters, sections, and sub-sections.\n     * Preserve bullet points, numbered lists, and code blocks.\n     * Remove any content that is not useful for learning, summarization, or quiz creation.\n4. **Final output:** Provide ONLY the cleaned, smart, and educationally useful text content of the document. Do not include names, personal info, or commentary. Do not summarize or interpret, just clean and filter the text.\n\n**Output format:** Return the full, uninterpreted, smart text in a single, well-formatted string, ready for use in summaries and quizzes.` },
                    { inlineData: { mimeType: file.mimetype, data: base64 } }
                ]
            }],
            generationConfig: { temperature: 0.5, maxOutputTokens: 8192 },
        };
        if (sendEventToUser) {
            try { sendProgressEvent(user._id.toString(), 25, "Starting content extraction"); } catch { }
        }
        const response = await retryGeminiApiCall(requestBody);
        const data = await response.json();
        if (sendEventToUser) {
            try { sendProgressEvent(user._id.toString(), 50, "Extraction service responded"); } catch { }
        }
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
            if (sendEventToUser) {
                try { sendProgressEvent(user._id.toString(), 75, "Content extraction and cache update completed", { chapterId: chapter._id.toString() }); } catch { }
            }
        }
        return { chapter, extractedText };
    } catch (e) {
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
): Promise<{ content: Buffer | string; contentType: string; cached: boolean }> => {
    const chapter = await ChapterModel.findById(chapterId);
    if (!chapter) throw ErrorHandler.createError("Chapter not found", 404);
    const cachedContent = await CacheHelper.getCachedChapterContent(chapterId);
    if (cachedContent) {
        return { content: cachedContent, contentType: chapter.contentType, cached: true };
    }
    await CacheHelper.cacheChapterContent(chapterId, chapter.content, CacheKeys.TTL.ONE_WEEK);
    return { content: chapter.content, contentType: chapter.contentType, cached: false };
};
