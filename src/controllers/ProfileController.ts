import { log } from "node:console";
import asyncWrapper from "../middleware/asyncwrapper";
import { IPreferences } from "../models/PreferencesModel";
import ProfileModel from "../models/profileModel";
import UserModel from "../models/UserModel";
import { ProfileService } from "../services/profileService";
import { uploadToCloudinary } from "../utils/cloudinaryService";
import ErrorHandler from "../utils/error";
const getPreferences = asyncWrapper(async (req, res, next) => {
    const userId = req.user._id || req.user.id;

    const preferences: IPreferences | null = await ProfileService.getPreferences(userId);
    log("User preferences:", preferences);
    if (!preferences) {
        return res.status(404).json({ success: false, error: "Preferences not found", statusCode: 404 });
    }
    res.status(200).json({ success: true, data: preferences });
});
const { validationResult } = require("express-validator");
const updatePreferences = asyncWrapper(async (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({
            success: false,
            error: errors.array(),
            statusCode: 400
        });
    }
    const userId = req.user._id || req.user.id;
    const preferences = req.body;
    const updated = await ProfileService.updatePreferences(userId, preferences);
    // If new preferences were created, save preferencesId in profile
    if (updated && updated._id) {
        await ProfileModel.findOneAndUpdate(
            { userId },
            { preferencesId: updated._id },
            { new: true }
        );
    }
    res.status(200).json({ success: true, data: updated });
});
const getProfile = asyncWrapper(async (req, res, next) => {
    const userId = req.user._id || req.user.id;

    let profile = await ProfileService.getProfile(userId);

    if (!profile) {
        // Create profile if doesn't exist
        const user = req.user;
        await ProfileService.initializeProfile(
            userId,
            user.username,
            'https://res.cloudinary.com/dr5cpch1n/image/upload/v1752943485/Unknown_person_o3xaku.jpg'
        );

        profile = await ProfileService.getProfile(userId);
    }


    // Update user preferences


    const user = await UserModel.findById(userId).select('email verified createdAt role').lean();

    // Count total chapters created by this user (regardless of folder ownership)
    const { default: ChapterModel } = await import('../models/ChapterModel');

    const totalChapters = await ChapterModel.countDocuments({ createdBy: userId });
    console.log(`[ProfileController] User ${userId} has created ${totalChapters} chapters`);

    res.status(200).json({
        success: true,
        data: {
            ...profile,
            email: user?.email,
            verified: user?.verified,
            role: user?.role,
            memberSince: user?.createdAt,
            totalChapters
        }
    });
});

const updateProfile = asyncWrapper(async (req, res, next) => {
    const userId = req.user._id || req.user.id;
    const { username, universityCollege } = req.body;
    const file = req.file;

    let profilePictureUrl: string | undefined;

    // Handle image upload if file is provided
    if (file) {
        try {
            // Validate file type
            const allowedMimeTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];
            if (!allowedMimeTypes.includes(file.mimetype)) {
                return next(ErrorHandler.createError("Invalid file type. Only JPEG, PNG, GIF, and WebP images are allowed", 400));
            }

            // Validate file size (max 5MB)
            const maxSize = 5 * 1024 * 1024; // 5MB
            if (file.size > maxSize) {
                return next(ErrorHandler.createError("File size too large. Maximum size is 5MB", 400));
            }

            // Upload to Cloudinary
            const uploadResult = await uploadToCloudinary(
                file.buffer,
                'profile-pictures',
                'image'
            );

            profilePictureUrl = uploadResult.secure_url;
        } catch (error) {
            console.error("Error uploading to Cloudinary:", error);
            return next(ErrorHandler.createError("Failed to upload profile picture", 500));
        }
    }

    // Prepare update data
    const updateData: any = {};
    if (username) updateData.username = username;
    if (profilePictureUrl) updateData.profilePicture = profilePictureUrl;
    if (universityCollege !== undefined) updateData.universityCollege = universityCollege;

    // Update profile
    await ProfileService.updateProfileInfo(userId, updateData);

    // If username or profilePicture changed, also update User model
    if (username || profilePictureUrl) {
        const userUpdate: any = {};
        if (username) userUpdate.username = username;
        if (profilePictureUrl) userUpdate.profilePicture = profilePictureUrl;

        try {
            await UserModel.findByIdAndUpdate(userId, userUpdate);
        } catch (error: any) {
            // Handle duplicate username error
            if (error.code === 11000) {
                return next(ErrorHandler.createError("Username already exists", 409));
            }
            throw error;
        }
    }

    // Get updated profile with user data
    const updatedProfile = await ProfileModel.findOne({ userId }).lean();
    const user = await UserModel.findById(userId).select('email verified createdAt role').lean();

    if (!updatedProfile) {
        return next(ErrorHandler.createError("Profile not found after update", 500));
    }

    res.status(200).json({
        success: true,
        message: "Profile updated successfully",
        data: {
            ...updatedProfile,
            email: user?.email,
            verified: user?.verified,
            role: user?.role,
            memberSince: user?.createdAt
        }
    });
});

const getPublicProfile = asyncWrapper(async (req, res, next) => {
    const { userId } = req.params;

    let profile = await ProfileModel.findOne({ userId }).lean();

    // If profile doesn't exist but user exists, initialize the profile
    if (!profile) {
        const user = await UserModel.findById(userId).select('username').lean();

        if (!user) {
            return next(ErrorHandler.createError("User not found", 404));
        }

        // Initialize profile for this user
        const newProfile = await ProfileModel.create({
            userId: userId,
            username: user.username,
            streak: 0,
            lastActiveDate: new Date(),
            totalQuizzesTaken: 0,
            totalMindmapsCreated: 0,
            totalSummariesCreated: 0,
            averageQuizScore: 0
        });

        profile = newProfile.toObject();
    }

    // Return only public information
    res.status(200).json({
        success: true,
        data: {
            username: profile.username,
            profilePicture: profile.profilePicture,
            universityCollege: profile.universityCollege,
            streak: profile.streak,
            totalQuizzesTaken: profile.totalQuizzesTaken,
            totalMindmapsCreated: profile.totalMindmapsCreated,
            totalSummariesCreated: profile.totalSummariesCreated,
            averageQuizScore: profile.averageQuizScore
        }
    });
});

const ProfileController = {
    getProfile,
    updateProfile,
    getPublicProfile
    , getPreferences, updatePreferences
};

export default ProfileController;
