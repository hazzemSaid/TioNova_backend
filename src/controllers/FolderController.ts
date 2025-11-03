import mongoose from "mongoose";
import asyncWrapper from "../middleware/asyncwrapper";
import ChapterModel from "../models/ChapterModel";
import FolderModel from "../models/FolderModel";
import UserModel from "../models/UserModel";
import { CacheKeys } from "../utils/cache_keys";
import CacheHelper from "../utils/cacheHelper";
import ErrorHandler from "../utils/error";

const createfolder = asyncWrapper(async (req, res, next) => {
    const { title, description, status, category, color, icon, sharedWith } = req.body;
    
    const folder = await FolderModel.create({
        title,
        category,
        description,
        ownerId: req.user._id,
        status,
        icon,
        color,
        sharedWith,
    });

    // Always return sharedWith as array of {_id, username, email, profilePicture}
    let sharedWithUsers: any = [];
    try {
        if (Array.isArray(folder.sharedWith) && folder.sharedWith.length > 0) {
            sharedWithUsers = await UserModel.find({
                _id: { $in: folder.sharedWith },
            })
                .select("_id username email profilePicture")
                .lean();
        }
    } catch (err) {
        sharedWithUsers = [];
    }

    // SSE: Notify owner and shared users
    try {
        const { sendEventToUser } = require("./sseController");
        // Notify owner
        sendEventToUser(req.user._id.toString(), {
            type: "folder_created",
            folder: {
                ...folder.toObject(),
                sharedWith: sharedWithUsers,
            },
        });
        // Notify shared users
        if (Array.isArray(sharedWith)) {
            sharedWith.forEach((uid: any) => {
                sendEventToUser(uid.toString(), {
                    type: "folder_shared_created",
                    folder: {
                        ...folder.toObject(),
                        sharedWith: sharedWithUsers,
                    },
                });
            });
        }
    } catch (err) {
        // Ignore SSE errors
    }


    // Invalidate all users' folder cache if public, else just affected users
    if (folder.status === 'public') {
        await CacheHelper.invalidateAllUsersFolders();
    } else {
        const affectedUserIds = [
            req.user._id.toString(),
            ...(sharedWith || []).map((id: any) => id.toString()),
        ];
        await Promise.all(
            affectedUserIds.map(userId => CacheHelper.invalidateUserFolders(userId))
        );
    }

    res.status(200).json({
        success: true,
        message: "Folder created successfully",
        folder: {
            ...folder.toObject(),
            sharedWith: sharedWithUsers,
        },
    });
});

const updatefolder = asyncWrapper(async (req: any, res, next) => {
    const {
        folderId,
        title,
        description,
        status,
        category,
        color,
        icon,
        sharedWith,
    } = req.body;

    const folder = await FolderModel.findById(folderId);
    if (!folder) {
        return next(ErrorHandler.createError("Folder not found", 404));
    }

    // Track previous shared users for cache invalidation
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
    try {
        if (Array.isArray(folder.sharedWith) && folder.sharedWith.length > 0) {
            sharedWithUsers = await UserModel.find({
                _id: { $in: folder.sharedWith },
            })
                .select("_id username email profilePicture")
                .lean();
        }
    } catch (err) {
        sharedWithUsers = [];
    }

    // SSE: Notify users
    try {
        const { sendEventToUser } = require("./sseController");
        
        // Notify owner
        sendEventToUser(folder.ownerId.toString(), {
            type: "folder_updated",
            folder: {
                ...folder.toObject(),
                sharedWith: sharedWithUsers,
            },
        });

        // Notify all shared users (both old and new)
        const allAffectedSharedUsers = new Set([
            ...previousSharedWith,
            ...(sharedWith || []).map((id: any) => id.toString()),
        ]);

        allAffectedSharedUsers.forEach((uid: string) => {
            if (uid !== folder.ownerId.toString()) {
                sendEventToUser(uid, {
                    type: "folder_shared_updated",
                    folder: {
                        ...folder.toObject(),
                        sharedWith: sharedWithUsers,
                    },
                });
            }
        });
    } catch (err) {
        // Ignore SSE errors
    }


    // Invalidate all users' folder cache if public, else just affected users
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

    res.status(200).json({
        success: true,
        message: "Folder updated successfully",
        folder: {
            ...folder.toObject(),
            sharedWith: sharedWithUsers,
        },
    });
});

const getfolders = asyncWrapper(async (req, res, next) => {
    const user = req.user;
    const userId = user._id.toString();


    // Per-user cache key: only folders visible to this user are cached under their key
    // This ensures each user only sees their own, shared, and public folders
    const { data: folders, cached } = await CacheHelper.getOrSet(
        CacheKeys.getFoldersListKey(userId),
        async () => {
            // Aggregate public folders and folders owned/shared with the user
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
                            { status: 'public' },
                        ],
                    },
                },
                // ...existing code for lookups and projections...
                {
                    $lookup: {
                        from: "chapters",
                        localField: "_id",
                        foreignField: "folderId",
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
                // Get quiz status for all chapters for requesting user in each folder
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
                            // Chapters the user has any quiz status for
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
                            // Chapters the user has a quiz status with "Passed"
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

    res.status(200).json({
        success: true,
        message: "Folders retrieved successfully",
        folders,
        cached,
    });
});

const deletefolder = asyncWrapper(async (req, res, next) => {
    const { folderId } = req.params;
    const user = req.user;

    const folder = await FolderModel.findById(folderId);
    if (!folder) {
        return next(ErrorHandler.createError("Folder not found", 404));
    }

    // Get all affected users before deletion
    const affectedUserIds = [
        folder.ownerId.toString(),
        ...(folder.sharedWith || []).map((id: any) => id.toString()),
    ];

    // Delete all chapters in folder
    await ChapterModel.deleteMany({ folderId: folder._id });
    
    // Delete folder
    await FolderModel.findByIdAndDelete(folderId);

    // SSE: Notify all affected users
    try {
        const { sendEventToUser } = require("./sseController");
        affectedUserIds.forEach((uid: string) => {
            sendEventToUser(uid, {
                type: "folder_deleted",
                folderId: folderId,
            });
        });
    } catch (err) {
        // Ignore SSE errors
    }

    // Invalidate cache for all affected users
    await Promise.all(
        affectedUserIds.map(userId => CacheHelper.invalidateUserFolders(userId))
    );

    res.status(200).json({
        success: true,
        message: "Folder deleted successfully",
    });
});

const FolderController = {
    createfolder,
    updatefolder,
    getfolders,
    deletefolder,
};

export default FolderController;
