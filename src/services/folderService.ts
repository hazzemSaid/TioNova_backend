import mongoose from "mongoose";
import { IUser } from "../interfaces/IUser";
import ChapterModel from "../models/ChapterModel";
import FolderModel from "../models/FolderModel";
import UserModel from "../models/UserModel";
import { CacheKeys } from "../utils/cache_keys";
import CacheHelper from "../utils/cacheHelper";
import ErrorHandler from "../utils/error";
import { getAffectedUsers, verifyFolderOwnership } from "../utils/folderAccess";
import { AnalysisService } from "./analysisService";

/**
 * Helper to fetch minimal user details for "sharedWith" lists
 */
const getSharedWithDetails = async (userIds: any[]) => {
    if (!Array.isArray(userIds) || userIds.length === 0) return [];
    return await UserModel.find({
        _id: { $in: userIds },
    }).select("_id username email profilePicture").lean();
};

/**
 * Write-Through Cache Helper
 * - Updates the Redis cache immediately after a DB write.
 * - Ensures cache consistency without requiring a full DB re-fetch.
 */
async function writeThroughFolderCache(
    userId: string,
    folder: any,
    action: 'add' | 'update' | 'delete',
    ownerInfo: any = null,
    sharedWithUsers: any[] = []
) {
    const cacheKey = CacheKeys.getFoldersListKey(userId);
    const cachedFolders = await CacheHelper.get(cacheKey);

    // If cache is empty, do nothing (Lazy Loading will handle it on next fetch)
    if (!cachedFolders || !Array.isArray(cachedFolders)) return;

    let updatedFolders = [...cachedFolders];

    if (action === 'add') {
        const folderObj = folder.toObject ? folder.toObject() : folder;

        // Construct the new cache entry matching the aggregation structure
        const newEntry = {
            ...folderObj,
            chapterCount: 0,
            attemptedCount: 0,
            passedCount: 0,
            owner: ownerInfo ? {
                _id: ownerInfo._id,
                username: ownerInfo.username,
                email: ownerInfo.email,
                profilePicture: ownerInfo.profilePicture
            } : (updatedFolders[0]?.owner || null),
            sharedWith: sharedWithUsers
        };
        updatedFolders.unshift(newEntry);

    } else if (action === 'update') {
        const index = updatedFolders.findIndex(f => f._id.toString() === folder._id.toString());
        if (index !== -1) {
            const folderObj = folder.toObject ? folder.toObject() : folder;
            updatedFolders[index] = {
                ...updatedFolders[index], // Keep existing stats (counts)
                ...folderObj,             // Overwrite metadata (title, color, etc)
                sharedWith: sharedWithUsers.length > 0 ? sharedWithUsers : updatedFolders[index].sharedWith
            };
        }
    } else if (action === 'delete') {
        updatedFolders = updatedFolders.filter(f => f._id.toString() !== folder._id.toString());
    }

    await CacheHelper.set(cacheKey, updatedFolders, CacheKeys.TTL.TWO_MINUTES);
}

/**
 * Helper to invalidate public cache if needed
 * Public folders are invalidated (not written-through) due to global scope complexity.
 */
async function checkPublicInvalidation(folder: any, previousStatus?: string) {
    if (folder.status === 'public' || previousStatus === 'public') {
        await CacheHelper.invalidateAllUsersFolders();
    }
}

export const createFolderService = async (user: IUser, body: any) => {
    const { title, description, status, category, color, icon, sharedWith } = body;

    // 1. Database Write
    const folder = await FolderModel.create({
        title,
        category,
        description,
        ownerId: user._id,
        status: status || 'private',
        icon,
        color,
        sharedWith: Array.isArray(sharedWith) ? sharedWith : [],
    });

    // 2. Fetch Shared User Details
    const sharedWithUsers = await getSharedWithDetails(folder.sharedWith || []);

    // 3. Write-Through Cache
    const affectedUserIds = getAffectedUsers(folder);
    await Promise.all(
        affectedUserIds.map(userId =>
            writeThroughFolderCache(userId, folder, 'add', user, sharedWithUsers)
        )
    );

    // Public invalidation if needed
    await checkPublicInvalidation(folder);

    // 4. Update Analysis
    try {
        await AnalysisService.updateRecentFolders(user._id.toString(), folder._id.toString());
    } catch (e) {
        console.error("[FolderService] Error updating analysis:", e);
    }

    return { folder, sharedWithUsers };
};

export const updateFolderService = async (user: IUser, body: any) => {
    const { folderId, title, description, status, category, color, icon, sharedWith } = body;

    if (!folderId || !mongoose.Types.ObjectId.isValid(folderId)) {
        throw ErrorHandler.createError("Invalid folder ID", 400);
    }

    const folder = await FolderModel.findById(folderId);
    if (!folder) throw ErrorHandler.createError("Folder not found", 404);

    if (folder.ownerId.toString() !== user._id.toString()) {
        throw ErrorHandler.createError("Unauthorized: You can only update your own folders", 403);
    }

    const previousStatus = folder.status;
    const previousSharedWith = (folder.sharedWith || []).map((id: any) => id.toString());

    // Update fields
    if (title !== undefined) folder.title = title;
    if (description !== undefined) folder.description = description;
    if (status !== undefined) folder.status = status;
    if (category !== undefined) folder.category = category;
    if (color !== undefined) folder.color = color;
    if (icon !== undefined) folder.icon = icon;
    if (Array.isArray(sharedWith)) {
        folder.sharedWith = sharedWith;
    }

    // 1. Database Write
    await folder.save();

    // Fetch details
    const sharedWithUsers = await getSharedWithDetails(folder.sharedWith || []);

    // 2. Write-Through Cache
    const currentSharedWith = (folder.sharedWith || []).map((id: any) => id.toString());
    const allAffectedUsers = new Set([
        folder.ownerId.toString(),
        ...previousSharedWith,
        ...currentSharedWith
    ]);

    await Promise.all(
        Array.from(allAffectedUsers).map(async (userId) => {
            const isNoLongerShared = !currentSharedWith.includes(userId) && userId !== folder.ownerId.toString();

            if (isNoLongerShared) {
                // If user lost access, delete from their cache
                await writeThroughFolderCache(userId, folder, 'delete');
            } else {
                // Otherwise update with new data
                await writeThroughFolderCache(userId, folder, 'update', null, sharedWithUsers);
            }
        })
    );

    // Public invalidation if needed
    await checkPublicInvalidation(folder, previousStatus);

    return { folder, sharedWithUsers };
};

export const deleteFolderService = async (user: IUser, folderId: string) => {
    if (!folderId || !mongoose.Types.ObjectId.isValid(folderId)) {
        throw ErrorHandler.createError("Invalid folder ID", 400);
    }

    const folder = await verifyFolderOwnership(user, folderId);

    // 1. Database Write (Delete Chapters)
    await ChapterModel.deleteMany({ folderId: folder._id });

    // 2. Database Write (Delete Folder)
    await FolderModel.findByIdAndDelete(folderId);

    // 3. Write-Through Cache (Remove)
    const affectedUserIds = getAffectedUsers(folder);
    await Promise.all(
        affectedUserIds.map(userId => writeThroughFolderCache(userId, folder, 'delete'))
    );

    // Public invalidation if needed
    await checkPublicInvalidation(folder);

    return { success: true };
};

export const getFoldersService = async (user: IUser) => {
    const userId = user._id.toString();
    const cacheKey = CacheKeys.getFoldersListKey(userId);

    const { data: folders, cached } = await CacheHelper.getOrSet(
        cacheKey,
        async () => {
            const userObjectId = new mongoose.Types.ObjectId(userId);
            return await FolderModel.aggregate([
                {
                    $match: {
                        $or: [
                            { ownerId: userObjectId },
                            { sharedWith: userObjectId },
                        ],
                    },
                },
                ...getFolderStatsAggregationStages(userId)
            ]);
        },
        CacheKeys.TTL.TWO_MINUTES
    );

    return { folders, cached };
};

export const getPublicFoldersService = async (user: IUser) => {
    const userId = user._id.toString();
    const cacheKey = CacheKeys.getFoldersListKey(`public_${userId}`);

    const { data: folders, cached } = await CacheHelper.getOrSet(
        cacheKey,
        async () => {
            return await FolderModel.aggregate([
                { $match: { status: 'public' } },
                ...getFolderStatsAggregationStages(userId)
            ]);
        },
        CacheKeys.TTL.TWO_MINUTES
    );

    return { folders, cached };
};

/**
 * Reusable aggregation stages for folder statistics
 */
function getFolderStatsAggregationStages(userId: string) {
    const userObjectId = new mongoose.Types.ObjectId(userId);
    return [
        {
            $lookup: {
                from: "chapters",
                let: { folderId: "$_id" },
                pipeline: [
                    { $match: { $expr: { $eq: ["$folderId", "$$folderId"] } } },
                    { $project: { _id: 1 } }
                ],
                as: "chapters",
            },
        },
        {
            $lookup: {
                from: "users",
                localField: "ownerId",
                foreignField: "_id",
                as: "ownerInfo",
                pipeline: [
                    { $project: { _id: 1, username: 1, profilePicture: 1, email: 1 } },
                ],
            },
        },
        {
            $lookup: {
                from: "users",
                localField: "sharedWith",
                foreignField: "_id",
                as: "sharedUsers",
                pipeline: [
                    { $project: { _id: 1, username: 1, profilePicture: 1, email: 1 } },
                ],
            },
        },
        {
            $lookup: {
                from: "userquizstatuses",
                let: { chapterIds: "$chapters._id" },
                pipeline: [
                    {
                        $match: {
                            $expr: {
                                $and: [
                                    { $in: ["$chapterId", "$$chapterIds"] },
                                    { $eq: ["$userId", userObjectId] },
                                ],
                            },
                        },
                    },
                ],
                as: "userQuizStatuses",
            },
        },
        {
            $addFields: {
                chapterCount: { $size: "$chapters" },
                owner: { $arrayElemAt: ["$ownerInfo", 0] },
                sharedWith: "$sharedUsers",
                attemptedCount: {
                    $size: {
                        $ifNull: [
                            { $setUnion: [{ $map: { input: "$userQuizStatuses", as: "q", in: "$$q.chapterId" } }, []] },
                            []
                        ]
                    }
                },
                passedCount: {
                    $size: {
                        $filter: {
                            input: "$userQuizStatuses",
                            as: "q",
                            cond: { $eq: ["$$q.status", "Passed"] }
                        }
                    }
                }
            },
        },
        {
            $project: {
                chapters: 0,
                ownerInfo: 0,
                sharedUsers: 0,
                userQuizStatuses: 0,
            },
        },
    ];
}
