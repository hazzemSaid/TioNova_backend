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
import mongoose from "mongoose";
import { default as Preferences, default as PreferencesModel } from "../models/PreferencesModel";
import ProfileModel from "../models/profileModel";
import { CacheKeys } from "../utils/cache_keys";
import CacheHelper from "../utils/cacheHelper";
export class ProfileService {
    /**
     * Get preferences for a user
     */
    static async getPreferences(userId: string) {
        const preferences = await Preferences.findOne({ userId });
        if (!preferences) return null;

        return preferences;
    }

    /**
     * Update preferences for a user
     */
    static async updatePreferences(userId: string, preferences: UserPreferences) {
        const preferencesDoc = await PreferencesModel.findOne({ userId });
        let updatedPreferences;
        if (preferencesDoc) {
            updatedPreferences = await PreferencesModel.findByIdAndUpdate(
                preferencesDoc._id,
                { $set: preferences },
                { new: true }
            );
        } else {
            updatedPreferences = await PreferencesModel.create({
                userId,
                ...preferences
            });
        }
        return updatedPreferences;
    }
    /**
     * Initialize profile document for a new user with existing data calculation
     */
    static async initializeProfile(userId: string, username: string, profilePicture?: string): Promise<void> {
        try {
            const exists = await ProfileModel.findOne({ userId });
            if (exists) {
                return; // Profile already exists
            }

            // Import required models
            const { default: UserQuizStatusModel } = await import('../models/UserQuizStatusModel');
            const { default: MindmapModel } = await import('../models/MindmapModel');
            const { default: SummaryModel } = await import('../models/SummaryModel');
            const { default: ChallengeResultModel } = await import('../models/ChallengeResultModel');
            const { default: ChapterModel } = await import('../models/ChapterModel');
            const { default: FolderModelDynamic } = await import('../models/FolderModel');

            // Calculate existing data
            const [quizStatuses, mindmaps, summaries, folders, challengeResults, ownedFolders] = await Promise.all([
                UserQuizStatusModel.find({ userId }).lean(),
                MindmapModel.countDocuments({ createdBy: userId }),
                SummaryModel.countDocuments({ createdBy: userId }),
                FolderModelDynamic.countDocuments({ ownerId: userId }),
                ChallengeResultModel.find({ 'participants.userId': userId }).lean(),
                FolderModelDynamic.find({ ownerId: userId }).select('_id').lean()
            ]);

            // Calculate quiz statistics
            let totalQuizzesTaken = 0;
            let totalSuccessfulQuizzes = 0;
            let totalScore = 0;

            for (const status of quizStatuses) {
                if (status.attempts && status.attempts.length > 0) {
                    totalQuizzesTaken += 1;
                    const latestAttempt: any = status.attempts[status.attempts.length - 1];
                    const score = latestAttempt.score || (status as any).score || 0;
                    totalScore += score;

                    if (score >= 70) {
                        totalSuccessfulQuizzes += 1;
                    }
                }
            }

            const averageQuizScore = totalQuizzesTaken > 0
                ? Math.round((totalScore / totalQuizzesTaken) * 100) / 100
                : 0;

            // Count total chapters across user's folders
            const folderIds = (ownedFolders || []).map((f: any) => f._id);
            const totalChapters = folderIds.length > 0
                ? await ChapterModel.countDocuments({ folderId: { $in: folderIds } })
                : 0;

            // Count challenges participated
            const totalChallengesParticipated = challengeResults.length;

            // Create profile with calculated data
            await ProfileModel.create({
                userId,
                username,
                profilePicture: profilePicture || 'https://res.cloudinary.com/dr5cpch1n/image/upload/v1752943485/Unknown_person_o3xaku.jpg',
                streak: 0,
                lastActiveDate: new Date(),
                activityLogs: [],
                totalQuizzesTaken,
                totalSuccessfulQuizzes,
                averageQuizScore,
                totalMindmapsCreated: mindmaps,
                totalSummariesCreated: summaries,
                totalFoldersCreated: folders,
                totalChallengesParticipated,
                universityCollege: null,
            });

            console.log(`[ProfileService] Profile initialized for user ${userId} with existing data: ${totalQuizzesTaken} quizzes, ${mindmaps} mindmaps, ${folders} folders, ${totalChallengesParticipated} challenges`);
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

            // Auto-populate username if missing (for legacy profiles)
            if (!profile.username) {
                const { default: UserModel } = await import('../models/UserModel');
                const user = await UserModel.findById(userId).select('username').lean();
                if (user?.username) {
                    profile.username = user.username;
                    console.log(`[ProfileService] Auto-populated username for user ${userId}`);
                }
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
     * Log daily activity for a user
     * @param userId - User ID
     * @param activityType - Type of activity ('chapter' | 'quiz' | 'mindmap' | 'challenge')
     * @param metadata - Additional data (chapterId, timeTaken, score, etc.)
     */
    static async logDailyActivity(
        userId: string,
        activityType: 'chapter' | 'quiz' | 'mindmap' | 'challenge',
        metadata?: { chapterId?: string; timeTaken?: number; score?: number }
    ): Promise<void> {
        try {
            // Input validation
            if (!userId || !mongoose.Types.ObjectId.isValid(userId)) {
                console.error("[ProfileService] Invalid userId:", userId);
                return;
            }

            if (metadata?.chapterId && !mongoose.Types.ObjectId.isValid(metadata.chapterId)) {
                console.error("[ProfileService] Invalid chapterId:", metadata.chapterId);
                return;
            }

            if (metadata?.timeTaken !== undefined && (metadata.timeTaken < 0 || isNaN(metadata.timeTaken))) {
                console.error("[ProfileService] Invalid timeTaken:", metadata.timeTaken);
                return;
            }

            const today = new Date();
            today.setHours(0, 0, 0, 0);

            const profile = await ProfileModel.findOne({ userId });
            if (!profile) {
                console.error("[ProfileService] Profile not found for user:", userId);
                return;
            }

            // Auto-populate username if missing (for legacy profiles)
            if (!profile.username) {
                const { default: UserModel } = await import('../models/UserModel');
                const user = await UserModel.findById(userId).select('username').lean();
                if (user?.username) {
                    profile.username = user.username;
                    console.log(`[ProfileService] Auto-populated username for user ${userId}`);
                }
            }

            // Find or create today's activity log
            // Use toDateString() for robust date comparison (ignores time/timezone offsets)
            let todayLogIndex = profile.activityLogs.findIndex(
                (log: any) => new Date(log.date).toDateString() === today.toDateString()
            );

            if (todayLogIndex === -1) {
                console.log(`[ProfileService] Creating new activity log for ${today.toDateString()}`);
                // Create new activity log for today
                profile.activityLogs.push({
                    date: today,
                    chaptersStudied: [],
                    quizzesCompleted: 0,
                    timeSpentMinutes: 0,
                    challengesParticipated: 0
                } as any);
                todayLogIndex = profile.activityLogs.length - 1;
            }

            // Get today's log (either just created or existing)
            const todayLog = profile.activityLogs[todayLogIndex];

            // Update based on activity type
            switch (activityType) {
                case 'chapter':
                    if (metadata?.chapterId && !todayLog.chaptersStudied.some((id: any) => id.toString() === metadata.chapterId)) {
                        // Limit to 100 unique chapters per day
                        if (todayLog.chaptersStudied.length < 100) {
                            todayLog.chaptersStudied.push(metadata.chapterId as any);
                        }
                    }
                    break;
                case 'quiz':
                    todayLog.quizzesCompleted += 1;
                    if (metadata?.timeTaken) {
                        todayLog.timeSpentMinutes += Math.round(metadata.timeTaken / 60); // Convert seconds to minutes
                    }
                    break;
                case 'challenge':
                    todayLog.challengesParticipated += 1;
                    break;
                case 'mindmap':
                    // Mindmap creation time can be tracked if needed
                    break;
            }

            // Clean up old activity logs (keep only last 90 days)
            // Only run cleanup if array is getting large to avoid unnecessary writes
            if (profile.activityLogs.length > 95) {
                const ninetyDaysAgo = new Date();
                ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
                ninetyDaysAgo.setHours(0, 0, 0, 0);

                const logsToKeep = profile.activityLogs.filter(
                    (log: any) => new Date(log.date) >= ninetyDaysAgo
                );

                if (logsToKeep.length < profile.activityLogs.length) {
                    profile.activityLogs.splice(0, profile.activityLogs.length, ...logsToKeep);
                }
            }

            // Mark the nested array as modified for Mongoose to detect changes
            profile.markModified('activityLogs');

            await profile.save();
            console.log(`[ProfileService] Logged activity '${activityType}' for user ${userId}. Today's stats: Quizzes=${todayLog.quizzesCompleted}, Time=${todayLog.timeSpentMinutes}`);

            // Delete cache only after successful save
            try {
                await CacheHelper.delete(CacheKeys.getUserProfileKey(userId));
            } catch (cacheError) {
                console.error("[ProfileService] Cache deletion failed:", cacheError);
            }
        } catch (error) {
            console.error("[ProfileService] Error logging daily activity:", error);
        }
    }

    /**
     * Aggregate today's statistics
     */
    static async aggregateTodayStats(userId: string): Promise<{
        chapters: number;
        quizzes: number;
    }> {
        try {
            const today = new Date();
            today.setHours(0, 0, 0, 0);

            const profile = await ProfileModel.findOne({ userId });
            if (!profile) {
                return { chapters: 0, quizzes: 0 };
            }

            const todayLog = profile.activityLogs.find(
                (log: any) => new Date(log.date).toDateString() === today.toDateString()
            );

            if (!todayLog) {
                console.log(`[ProfileService] No activity log found for today (${today.toDateString()})`);
                return { chapters: 0, quizzes: 0 };
            }

            return {
                chapters: todayLog.chaptersStudied.length,
                quizzes: todayLog.quizzesCompleted
            };
        } catch (error) {
            console.error("[ProfileService] Error aggregating today stats:", error);
            return { chapters: 0, quizzes: 0 };
        }
    }

    /**
     * Aggregate this month's statistics
     */
    static async aggregateMonthStats(userId: string): Promise<{
        chapters: number;
        quizzes: number;
    }> {
        try {
            const now = new Date();
            const firstDayOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
            firstDayOfMonth.setHours(0, 0, 0, 0);

            const profile = await ProfileModel.findOne({ userId });
            if (!profile) {
                return { chapters: 0, quizzes: 0 };
            }

            // Filter logs for current month
            const monthLogs = profile.activityLogs.filter(
                (log: any) => new Date(log.date) >= firstDayOfMonth
            );

            // Aggregate unique chapters across all days in the month
            const uniqueChapters = new Set<string>();
            let totalQuizzes = 0;

            monthLogs.forEach((log: any) => {
                log.chaptersStudied.forEach((chapterId: any) => uniqueChapters.add(chapterId.toString()));
                totalQuizzes += log.quizzesCompleted;
            });

            return {
                chapters: uniqueChapters.size,
                quizzes: totalQuizzes
            };
        } catch (error) {
            console.error("[ProfileService] Error aggregating month stats:", error);
            return { chapters: 0, quizzes: 0 };
        }
    }

    /**
     * Calculate study insights
     */
    static async calculateStudyInsights(userId: string): Promise<{
        totalFolders: number;
        quizSuccessRate: number;
        totalChallengesTaken: number;
    }> {
        try {
            const profile = await ProfileModel.findOne({ userId });
            if (!profile) {
                return { totalFolders: 0, quizSuccessRate: 0, totalChallengesTaken: 0 };
            }

            // Calculate quiz success rate
            const successRate = profile.totalQuizzesTaken > 0
                ? Math.round((profile.totalSuccessfulQuizzes / profile.totalQuizzesTaken) * 100)
                : 0;

            // Get actual folder count dynamically for accuracy
            const { default: FolderModelDynamic } = await import('../models/FolderModel');
            const actualFolderCount = await FolderModelDynamic.countDocuments({ ownerId: userId });

            return {
                totalFolders: actualFolderCount,
                quizSuccessRate: successRate,
                totalChallengesTaken: profile.totalChallengesParticipated
            };
        } catch (error) {
            console.error("[ProfileService] Error calculating study insights:", error);
            return { totalFolders: 0, quizSuccessRate: 0, totalChallengesTaken: 0 };
        }
    }

    /**
     * Increment total quizzes taken and log activity
     */
    static async incrementQuizzesTaken(userId: string, metadata?: { chapterId?: string; timeTaken?: number }): Promise<void> {
        try {
            await ProfileModel.findOneAndUpdate(
                { userId },
                { $inc: { totalQuizzesTaken: 1 } },
                { upsert: true }
            );

            // Log quiz activity
            if (metadata) {
                await this.logDailyActivity(userId, 'quiz', metadata);
            }

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
     * Increment total folders created
     */
    static async incrementFoldersCreated(userId: string): Promise<void> {
        try {
            await ProfileModel.findOneAndUpdate(
                { userId },
                { $inc: { totalFoldersCreated: 1 } },
                { upsert: true }
            );

            // Delete cache only after successful DB operation
            try {
                await CacheHelper.delete(CacheKeys.getUserProfileKey(userId));
            } catch (cacheError) {
                console.error("[ProfileService] Cache deletion failed:", cacheError);
            }
        } catch (error) {
            console.error("[ProfileService] Error incrementing folders created:", error);
            throw error;
        }
    }

    /**
     * Increment total challenges participated and log activity
     */
    static async incrementChallengesTaken(userId: string): Promise<void> {
        try {
            await ProfileModel.findOneAndUpdate(
                { userId },
                { $inc: { totalChallengesParticipated: 1 } },
                { upsert: true }
            );

            // Log challenge activity
            await this.logDailyActivity(userId, 'challenge');

            await CacheHelper.delete(CacheKeys.getUserProfileKey(userId));
        } catch (error) {
            console.error("[ProfileService] Error incrementing challenges taken:", error);
        }
    }

    /**
     * Update average quiz score and track successful quizzes
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
            // Note: totalQuizzes is already incremented by incrementQuizzesTaken before this call
            // So we use (totalQuizzes - 1) to get the previous count
            let newAvg: number;
            if (totalQuizzes <= 1) {
                newAvg = newScore;
            } else {
                const previousCount = totalQuizzes - 1;
                newAvg = ((currentAvg * previousCount) + newScore) / totalQuizzes;
            }

            // Check if quiz was successful (passed with score >= 70)
            const updateData: any = { averageQuizScore: Math.round(newAvg * 100) / 100 };
            if (newScore >= 70) {
                updateData.$inc = { totalSuccessfulQuizzes: 1 };
            }

            await ProfileModel.findOneAndUpdate(
                { userId },
                updateData,
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
     * Get profile with caching and enhanced statistics
     */
    static async getProfile(userId: string): Promise<any> {
        try {
            const cacheKey = CacheKeys.getUserProfileKey(userId);
            let cachedData = await CacheHelper.get(cacheKey);

            if (cachedData) {
                return cachedData;
            }

            // Get base profile
            const profile = await ProfileModel.findOne({ userId }).lean();

            if (!profile) {
                return null;
            }

            // Get aggregated statistics
            const todayStats = await this.aggregateTodayStats(userId);
            const monthStats = await this.aggregateMonthStats(userId);
            const studyInsights = await this.calculateStudyInsights(userId);

            // Enhance profile with overview and insights
            const enhancedProfile = {
                ...profile,
                overview: {
                    today: todayStats,
                    thisMonth: monthStats
                },
                studyInsights
            };

            await CacheHelper.set(cacheKey, enhancedProfile, 1800); // 30 minutes

            return enhancedProfile;
        } catch (error) {
            console.error("[ProfileService] Error getting profile:", error);
            return null;
        }
    }
}
