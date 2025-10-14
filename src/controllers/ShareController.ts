import Fuse from "fuse.js";
import NodeCache from "node-cache";
import asyncWrapper from "../middleware/asyncwrapper";
import FolderModel from "../models/FolderModel";
import UserModel from "../models/UserModel";
import ErrorHandler from "../utils/error";

const userSearchCache = new NodeCache({ stdTTL: 300 }); // 5 min TTL

export const getAvailableUsersForShare = asyncWrapper(async (req, res) => {
    const { query } = req.query;
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 20));

    // Validate folderId format
    const filter: any = { _id: { $nin: [req.user._id], $exists: true } };

    // Build cache key based on query, page, limit
    const cacheKey = `users:${query || "all"}:p${page}:l${limit}`;
    const cached = userSearchCache.get(cacheKey);
    if (cached) {
        return res.json(cached);
    }

    let users: any[] = [];
    let totalResults = 0;

    if (query && query.trim()) {
        const allUsers = await UserModel.find(filter)
            .select("username email _id profilePicture")
            .lean();

        const fuse = new Fuse(allUsers, {
            keys: ["username", "email"],
            threshold: 0.3,
        });

        const searchResults = fuse.search(query.trim());
        const matchedUsers = searchResults.map((r: any) => r.item);

        totalResults = matchedUsers.length;
        users = matchedUsers.slice((page - 1) * limit, page * limit);
    } else {
        [totalResults, users] = await Promise.all([
            UserModel.countDocuments(filter),
            UserModel.find(filter)
                .select("username email _id profilePicture")
                .sort({ username: 1 })
                .skip((page - 1) * limit)
                .limit(limit)
                .lean(),
        ]);
    }

    const response = {
        page,
        limit,
        totalResults,
        totalPages: Math.ceil(totalResults / limit),
        results: users,
    };

    userSearchCache.set(cacheKey, response);
    res.json(response);
});

const setuserssharewith = asyncWrapper(async (req, res, next) => {
    const { folderId, sharedWith } = req.body;
    
    const folder = await FolderModel.findById(folderId);
    if (!folder) {
        return next(ErrorHandler.createError("Folder not found", 404));
    }
    
    folder.sharedWith = sharedWith;
    await folder.save();
    
    res.status(200).json({
        success: true,
        message: "Users shared successfully",
    });
});

const ShareController = {
    getAvailableUsersForShare,
    setuserssharewith,
};

export default ShareController;
