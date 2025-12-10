import mongoose from "mongoose";
import ChapterModel from "../models/ChapterModel";
import FolderModel from "../models/FolderModel";
import UserModel from "../models/UserModel";
import { CacheKeys } from "../utils/cache_keys";
import CacheHelper from "../utils/cacheHelper";
import ErrorHandler from "../utils/error";
import { AnalysisService } from "./analysisService";

export const createFolderService = async (user: any, body: any) => {
    const { title, description, status, category, color, icon, sharedWith } = body;
    const folder = await FolderModel.create({
        title,
        category,
        description,
        ownerId: user._id,
        status,
        icon,
        color,
        sharedWith,
    });
    let sharedWithUsers: any = [];
    if (Array.isArray(folder.sharedWith) && folder.sharedWith.length > 0) {
        sharedWithUsers = await UserModel.find({
            _id: { $in: folder.sharedWith },
        }).select("_id username email profilePicture").lean();
    }
    // Invalidate cache
    if (folder.status === 'public') {
        await CacheHelper.invalidateAllUsersFolders();
    } else {
        const affectedUserIds = [
            user._id.toString(),
            ...(sharedWith || []).map((id: any) => id.toString()),
        ];
        await Promise.all(
            affectedUserIds.map(userId => CacheHelper.invalidateUserFolders(userId))
        );
    }
    // Update analysis
    await AnalysisService.updateRecentFolders(user._id.toString(), folder._id.toString());
    return { folder, sharedWithUsers };
};

export const updateFolderService = async (user: any, body: any) => {
    const { folderId, title, description, status, category, color, icon, sharedWith } = body;
    const folder = await FolderModel.findById(folderId);
    if (!folder) throw ErrorHandler.createError("Folder not found", 404);
    const previousSharedWith = folder.sharedWith?.map((id: any) => id.toString()) || [];
    folder.title = title || folder.title;
    folder.description = description || folder.description;
    folder.status = status || folder.status;
    folder.category = category || folder.category;
    folder.color = color || folder.color;
    folder.icon = icon || folder.icon;
    if (Array.isArray(sharedWith)) {
        folder.sharedWith = sharedWith;
    }
    await folder.save();
    let sharedWithUsers: any = [];
    if (Array.isArray(folder.sharedWith) && folder.sharedWith.length > 0) {
        sharedWithUsers = await UserModel.find({
            _id: { $in: folder.sharedWith },
        }).select("_id username email profilePicture").lean();
    }
    // Invalidate cache
    if (folder.status === 'public') {
        await CacheHelper.invalidateAllUsersFolders();
    } else {
        const affectedUserIds = new Set([
            folder.ownerId.toString(),
            ...previousSharedWith,
            ...(sharedWith || []).map((id: any) => id.toString()),
        ]);
        await Promise.all(
            Array.from(affectedUserIds).map(userId => CacheHelper.invalidateUserFolders(userId))
        );
    }
    return { folder, sharedWithUsers };
};

export const deleteFolderService = async (user: any, folderId: string) => {
    const folder = await FolderModel.findById(folderId);
    if (!folder) throw ErrorHandler.createError("Folder not found", 404);
    const affectedUserIds = [
        folder.ownerId.toString(),
        ...(folder.sharedWith || []).map((id: any) => id.toString()),
    ];
    await ChapterModel.deleteMany({ folderId: folder._id });
    await FolderModel.findByIdAndDelete(folderId);
    await Promise.all(
        affectedUserIds.map(userId => CacheHelper.invalidateUserFolders(userId))
    );
    return { success: true };
};

export const getFoldersService = async (user: any) => {
    const userId = user._id.toString();
    const { data: folders, cached } = await CacheHelper.getOrSet(
        CacheKeys.getFoldersListKey(userId),
        async () => {
            const foldersWithChapterCount = await FolderModel.aggregate([
                {
                    $match: {
                        $or: [
                            { ownerId: new mongoose.Types.ObjectId(user._id) },
                            {
                                sharedWith: {
                                    $elemMatch: { $eq: new mongoose.Types.ObjectId(user._id) },
                                },
                            },
                        ],
                    },
                },
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
                        localField: "sharedWith",
                        foreignField: "_id",
                        as: "sharedUsers",
                        pipeline: [
                            {
                                $project: {
                                    _id: 1,
                                    username: 1,
                                    profilePicture: 1,
                                    email: 1,
                                },
                            },
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
                                            { $eq: ["$userId", new mongoose.Types.ObjectId(user._id)] },
                                        ],
                                    },
                                },
                            },
                        ],
                        as: "userQuizStatusesForChapters",
                    },
                },
                {
                    $addFields: {
                        chapterCount: { $size: "$chapters" },
                        sharedWith: "$sharedUsers",
                        attemptedCount: {
                            $size: {
                                $ifNull: [
                                    {
                                        $setUnion: [
                                            {
                                                $map: {
                                                    input: "$userQuizStatusesForChapters",
                                                    as: "quizStatus",
                                                    in: "$$quizStatus.chapterId"
                                                }
                                            }, []
                                        ]
                                    }, []
                                ]
                            }
                        },
                        passedCount: {
                            $size: {
                                $filter: {
                                    input: "$userQuizStatusesForChapters",
                                    as: "quizStatus",
                                    cond: { $eq: ["$$quizStatus.status", "Passed"] }
                                }
                            }
                        }
                    },
                },
                {
                    $project: {
                        chapters: 0,
                        sharedUsers: 0,
                        userQuizStatusesForChapters: 0,
                    },
                },
            ]);
            return foldersWithChapterCount;
        },
        CacheKeys.TTL.SIX_HOURS
    );
    return { folders, cached };
};

export const getPublicFoldersService = async (user: any) => {
    const userId = user._id.toString();
    // Cache specific for public folders for this user (user context needed for quiz stats)
    // We could technically cache the "raw" public folders globally and then compute stats, 
    // but the current pattern computes everything in the aggregate. 
    // Let's use a user-specific key for now to keep it consistent with getFoldersService.
    const { data: folders, cached } = await CacheHelper.getOrSet(
        CacheKeys.getFoldersListKey(`public_${userId}`),
        async () => {
            const foldersWithChapterCount = await FolderModel.aggregate([
                {
                    $match: {
                        status: 'public'
                    },
                },
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
                        localField: "ownerId", // Show owner info for public folders
                        foreignField: "_id",
                        as: "owner",
                        pipeline: [
                            {
                                $project: {
                                    _id: 1,
                                    username: 1,
                                    profilePicture: 1,
                                    email: 1,
                                },
                            },
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
                                            { $eq: ["$userId", new mongoose.Types.ObjectId(user._id)] },
                                        ],
                                    },
                                },
                            },
                        ],
                        as: "userQuizStatusesForChapters",
                    },
                },
                {
                    $addFields: {
                        chapterCount: { $size: "$chapters" },
                        owner: { $arrayElemAt: ["$owner", 0] },
                        attemptedCount: {
                            $size: {
                                $ifNull: [
                                    {
                                        $setUnion: [
                                            {
                                                $map: {
                                                    input: "$userQuizStatusesForChapters",
                                                    as: "quizStatus",
                                                    in: "$$quizStatus.chapterId"
                                                }
                                            }, []
                                        ]
                                    }, []
                                ]
                            }
                        },
                        passedCount: {
                            $size: {
                                $filter: {
                                    input: "$userQuizStatusesForChapters",
                                    as: "quizStatus",
                                    cond: { $eq: ["$$quizStatus.status", "Passed"] }
                                }
                            }
                        }
                    },
                },
                {
                    $project: {
                        chapters: 0,
                        userQuizStatusesForChapters: 0,
                    },
                },
            ]);
            return foldersWithChapterCount;
        },
        CacheKeys.TTL.SIX_HOURS
    );
    return { folders, cached };
};
