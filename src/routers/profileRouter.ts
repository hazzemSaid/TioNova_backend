import express from "express";
import multer from "multer";
import ProfileController from "../controllers/ProfileController";
import verifyToken from "../middleware/verifyToken";

const profileRouter = express.Router();

// Configure multer for memory storage
const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
        fileSize: 5 * 1024 * 1024, // 5MB limit
    }
});

// Get authenticated user's profile
profileRouter.get("/profile", verifyToken, ProfileController.getProfile);

// Update user profile (with optional image upload)
profileRouter.put("/profile", verifyToken, upload.single('profilePicture'), ProfileController.updateProfile);

// Get public profile by userId
profileRouter.get("/profile/:userId", ProfileController.getPublicProfile);

export default profileRouter;
