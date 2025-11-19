import asyncWrapper from "../middleware/asyncwrapper";
import { createFolderService, deleteFolderService, getFoldersService, updateFolderService } from "../services/folderService";

const createfolder = asyncWrapper(async (req, res, next) => {
    try {
        const { folder, sharedWithUsers } = await createFolderService(req.user, req.body);
        // SSE: Notify owner and shared users
        try {
            const { sendEventToUser } = require("./sseController");
            sendEventToUser(req.user._id.toString(), {
                type: "folder_created",
                folder: {
                    ...folder.toObject(),
                    sharedWith: sharedWithUsers,
                },
            });
            if (Array.isArray(req.body.sharedWith)) {
                req.body.sharedWith.forEach((uid: any) => {
                    sendEventToUser(uid.toString(), {
                        type: "folder_shared_created",
                        folder: {
                            ...folder.toObject(),
                            sharedWith: sharedWithUsers,
                        },
                    });
                });
            }
        } catch (err) {}
        res.status(200).json({
            success: true,
            message: "Folder created successfully",
            folder: {
                ...folder.toObject(),
                sharedWith: sharedWithUsers,
            },
        });
    } catch (err) {
        next(err);
    }
});

const updatefolder = asyncWrapper(async (req: any, res, next) => {
    try {
        const { folder, sharedWithUsers } = await updateFolderService(req.user, req.body);
        // SSE: Notify users
        try {
            const { sendEventToUser } = require("./sseController");
            sendEventToUser(folder.ownerId.toString(), {
                type: "folder_updated",
                folder: {
                    ...folder.toObject(),
                    sharedWith: sharedWithUsers,
                },
            });
            const previousSharedWith = folder.sharedWith?.map((id: any) => id.toString()) || [];
            const allAffectedSharedUsers = new Set([
                ...previousSharedWith,
                ...(req.body.sharedWith || []).map((id: any) => id.toString()),
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
        } catch (err) {}
        res.status(200).json({
            success: true,
            message: "Folder updated successfully",
            folder: {
                ...folder.toObject(),
                sharedWith: sharedWithUsers,
            },
        });
    } catch (err) {
        next(err);
    }
});

const getfolders = asyncWrapper(async (req, res, next) => {
    try {
        const { folders, cached } = await getFoldersService(req.user);
        res.status(200).json({
            success: true,
            message: "Folders retrieved successfully",
            folders,
            cached,
        });
    } catch (err) {
        next(err);
    }
});

const deletefolder = asyncWrapper(async (req, res, next) => {
    try {
        const { folderId } = req.params;
        const result = await deleteFolderService(req.user, folderId);
        // SSE: Notify all affected users
        try {
            const { sendEventToUser } = require("./sseController");
            // You may want to fetch affected users from the service or FolderModel if needed
            // For now, just notify the folderId
            sendEventToUser(req.user._id.toString(), {
                type: "folder_deleted",
                folderId: folderId,
            });
        } catch (err) {}
        res.status(200).json({
            success: true,
            message: "Folder deleted successfully",
        });
    } catch (err) {
        next(err);
    }
});

const FolderController = {
    createfolder,
    updatefolder,
    getfolders,
    deletefolder,
};

export default FolderController;
