// Add at the top, after imports
export interface UserPreferences {
    studyPerDay?: number;
    preferredStudyTimes?: string;
    dailyTimeCommitmentMinutes?: number;
    daysPerWeek?: number;
    goals?: string[];
    reminderEnabled?: boolean;
    reminderTimes?: string[];
    contentDifficulty?: "easy" | "medium" | "hard" | "progressive";
}
import ProfileModel from "../models/profileModel";
import { CacheKeys } from "../utils/cache_keys";
import CacheHelper from "../utils/cacheHelper";

export class ProfileService {
        /**
         * Get preferences for a user
         */
        static async getPreferences(userId: string) {
            const profile = await ProfileModel.findOne({ userId });
            return profile?.preferences || null;
        }

        /**
         * Update preferences for a user
         */
        static async updatePreferences(userId: string, preferences: UserPreferences) {
            const profile = await ProfileModel.findOneAndUpdate(
                { userId },
                { $set: { preferences } },
                { new: true }
            );
            // Optionally cache preferences here
            return profile?.preferences || null;
        }
    /**
     * Initialize profile document for a new user
     */
    static async initializeProfile(userId: string, username: string, profilePicture?: string): Promise<void> {
        try {
            const exists = await ProfileModel.findOne({ userId });
            if (!exists) {
                await ProfileModel.create({
                    userId,
                    username,
                    profilePicture: profilePicture || 'https://res.cloudinary.com/dr5cpch1n/image/upload/v1752943485/Unknown_person_o3xaku.jpg',
                    streak: 0,
                    lastActiveDate: new Date(),
                    totalQuizzesTaken: 0,
                    totalMindmapsCreated: 0,
                    totalSummariesCreated: 0,
                    averageQuizScore: 0,
                    universityCollege: null,
                });
            }
        } catch (error) {
            console.error("[ProfileService] Error initializing profile:", error);
        }
    }

    /**
     * Update streak when user is active
     */
    static async updateStreak(userId: string): Promise<void> {
        try {
            const profile = await ProfileModel.findOne({ userId });
            
            if (!profile) {
                console.error("[ProfileService] Profile not found for user:", userId);
                return;
            }

            const today = new Date();
            today.setHours(0, 0, 0, 0);

            const lastActive = profile.lastActiveDate ? new Date(profile.lastActiveDate) : null;
            
            if (lastActive) {
                lastActive.setHours(0, 0, 0, 0);
                const diffTime = today.getTime() - lastActive.getTime();
                const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));

                if (diffDays === 0) {
                    // Same day, no update needed
                    return;
                } else if (diffDays === 1) {
                    // Consecutive day, increment streak
                    profile.streak += 1;
                } else {
                    // Streak broken, reset to 1
                    profile.streak = 1;
                }
            } else {
                // First activity
                profile.streak = 1;
            }

            profile.lastActiveDate = new Date();
            await profile.save();

            // Invalidate cache
            await CacheHelper.delete(CacheKeys.getUserProfileKey(userId));
        } catch (error) {
            console.error("[ProfileService] Error updating streak:", error);
        }
    }

    /**
     * Increment total quizzes taken
     */
    static async incrementQuizzesTaken(userId: string): Promise<void> {
        try {
            await ProfileModel.findOneAndUpdate(
                { userId },
                { $inc: { totalQuizzesTaken: 1 } },
                { upsert: true }
            );

            await CacheHelper.delete(CacheKeys.getUserProfileKey(userId));
        } catch (error) {
            console.error("[ProfileService] Error incrementing quizzes taken:", error);
        }
    }

    /**
     * Increment total mindmaps created
     */
    static async incrementMindmapsCreated(userId: string): Promise<void> {
        try {
            await ProfileModel.findOneAndUpdate(
                { userId },
                { $inc: { totalMindmapsCreated: 1 } },
                { upsert: true }
            );

            await CacheHelper.delete(CacheKeys.getUserProfileKey(userId));
        } catch (error) {
            console.error("[ProfileService] Error incrementing mindmaps created:", error);
        }
    }

    /**
     * Increment total summaries created
     */
    static async incrementSummariesCreated(userId: string): Promise<void> {
        try {
            await ProfileModel.findOneAndUpdate(
                { userId },
                { $inc: { totalSummariesCreated: 1 } },
                { upsert: true }
            );

            await CacheHelper.delete(CacheKeys.getUserProfileKey(userId));
        } catch (error) {
            console.error("[ProfileService] Error incrementing summaries created:", error);
        }
    }

    /**
     * Update average quiz score
     */
    static async updateAverageQuizScore(userId: string, newScore: number): Promise<void> {
        try {
            const profile = await ProfileModel.findOne({ userId });
            
            if (!profile) {
                console.error("[ProfileService] Profile not found for user:", userId);
                return;
            }

            const currentAvg = profile.averageQuizScore || 0;
            const totalQuizzes = profile.totalQuizzesTaken || 0;

            // Calculate new average
            let newAvg: number;
            if (totalQuizzes === 0) {
                newAvg = newScore;
            } else {
                newAvg = ((currentAvg * totalQuizzes) + newScore) / (totalQuizzes + 1);
            }

            await ProfileModel.findOneAndUpdate(
                { userId },
                { averageQuizScore: Math.round(newAvg * 100) / 100 }, // Round to 2 decimals
                { new: true }
            );

            await CacheHelper.delete(CacheKeys.getUserProfileKey(userId));
        } catch (error) {
            console.error("[ProfileService] Error updating average quiz score:", error);
        }
    }

    /**
     * Update profile information (username, profilePicture, universityCollege)
     */
    static async updateProfileInfo(
        userId: string,
        updates: {
            username?: string;
            profilePicture?: string;
            universityCollege?: string;
        }
    ): Promise<void> {
        try {
            const updateData: any = {};
            
            if (updates.username) updateData.username = updates.username;
            if (updates.profilePicture) updateData.profilePicture = updates.profilePicture;
            if (updates.universityCollege !== undefined) updateData.universityCollege = updates.universityCollege;

            await ProfileModel.findOneAndUpdate(
                { userId },
                updateData,
                { new: true, upsert: true }
            );

            await CacheHelper.delete(CacheKeys.getUserProfileKey(userId));
        } catch (error) {
            console.error("[ProfileService] Error updating profile info:", error);
        }
    }

    /**
     * Get profile with caching
     */
    static async getProfile(userId: string): Promise<any> {
        try {
            const cacheKey = CacheKeys.getUserProfileKey(userId);
            let profile = await CacheHelper.get(cacheKey);

            if (!profile) {
                profile = await ProfileModel.findOne({ userId }).lean();
                
                if (profile) {
                    await CacheHelper.set(cacheKey, profile, 1800); // 30 minutes
                }
            }

            return profile;
        } catch (error) {
            console.error("[ProfileService] Error getting profile:", error);
            return null;
        }
    }
}
