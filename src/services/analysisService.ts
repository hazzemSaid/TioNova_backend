import mongoose from "mongoose";
import AnalysisModel from "../models/analysisModel";
import { CacheKeys } from "../utils/cache_keys";
import CacheHelper from "../utils/cacheHelper";

export class AnalysisService {
    /**
     * Update recent chapters when a chapter is created or accessed
     */
    static async updateRecentChapters(userId: string, chapterId: string): Promise<void> {
        try {
            const analysis = await AnalysisModel.findOne({ userId });
            
            if (!analysis) {
                // Create new analysis document if doesn't exist
                await AnalysisModel.create({
                    userId,
                    recentChapters: [chapterId],
                    recentFolders: [],
                    lastMindmaps: [],
                    lastRank: 0,
                    totalChapters: 1,
                    lastSummary: null,
                    avgScore: 0,
                });
            } else {
                // Remove chapterId if already exists to avoid duplicates
                const recentChapters = analysis.recentChapters
                    .filter((id: any) => id.toString() !== chapterId)
                    .slice(0, 4); // Keep only 4 most recent (we'll add 1 more)
                
                // Add current chapter at the beginning
                recentChapters.unshift(new mongoose.Types.ObjectId(chapterId));
                
                await AnalysisModel.findOneAndUpdate(
                    { userId },
                    { 
                        recentChapters: recentChapters.slice(0, 5), // Keep max 5
                        totalChapters: analysis.totalChapters + 1,
                    },
                    { new: true }
                );
            }
            
            // Invalidate cache
            await CacheHelper.delete(CacheKeys.getAnalysisKey(userId));
        } catch (error) {
            console.error("[AnalysisService] Error updating recent chapters:", error);
        }
    }

    /**
     * Update recent folders when a folder is created or accessed
     */
    static async updateRecentFolders(userId: string, folderId: string): Promise<void> {
        try {
            const analysis = await AnalysisModel.findOne({ userId });
            
            if (!analysis) {
                await AnalysisModel.create({
                    userId,
                    recentChapters: [],
                    recentFolders: [folderId],
                    lastMindmaps: [],
                    lastRank: 0,
                    totalChapters: 0,
                    lastSummary: null,
                    avgScore: 0,
                });
            } else {
                const recentFolders = analysis.recentFolders
                    .filter((id: any) => id.toString() !== folderId)
                    .slice(0, 4);
                
                recentFolders.unshift(new mongoose.Types.ObjectId(folderId));
                
                await AnalysisModel.findOneAndUpdate(
                    { userId },
                    { recentFolders: recentFolders.slice(0, 5) },
                    { new: true }
                );
            }
            
            await CacheHelper.delete(CacheKeys.getAnalysisKey(userId));
        } catch (error) {
            console.error("[AnalysisService] Error updating recent folders:", error);
        }
    }

    /**
     * Update last mindmap when a mindmap is created
     */
    static async updateLastMindmap(userId: string, mindmapId: string): Promise<void> {
        try {
            const analysis = await AnalysisModel.findOne({ userId });
            
            if (!analysis) {
                await AnalysisModel.create({
                    userId,
                    recentChapters: [],
                    recentFolders: [],
                    lastMindmaps: [mindmapId],
                    lastRank: 0,
                    totalChapters: 0,
                    lastSummary: null,
                    avgScore: 0,
                });
            } else {
                const lastMindmaps = analysis.lastMindmaps
                    .filter((id: any) => id.toString() !== mindmapId)
                    .slice(0, 4);
                
                lastMindmaps.unshift(new mongoose.Types.ObjectId(mindmapId));
                
                await AnalysisModel.findOneAndUpdate(
                    { userId },
                    { lastMindmaps: lastMindmaps.slice(0, 5) },
                    { new: true }
                );
            }
            
            await CacheHelper.delete(CacheKeys.getAnalysisKey(userId));
        } catch (error) {
            console.error("[AnalysisService] Error updating last mindmap:", error);
        }
    }

    /**
     * Update last summary when a summary is created
     */
    static async updateLastSummary(userId: string, summaryId: string): Promise<void> {
        try {
            const analysis = await AnalysisModel.findOne({ userId });
            
            if (!analysis) {
                await AnalysisModel.create({
                    userId,
                    recentChapters: [],
                    recentFolders: [],
                    lastMindmaps: [],
                    lastRank: 0,
                    totalChapters: 0,
                    lastSummary: summaryId,
                    avgScore: 0,
                });
            } else {
                await AnalysisModel.findOneAndUpdate(
                    { userId },
                    { lastSummary: summaryId },
                    { new: true }
                );
            }
            
            await CacheHelper.delete(CacheKeys.getAnalysisKey(userId));
        } catch (error) {
            console.error("[AnalysisService] Error updating last summary:", error);
        }
    }

    /**
     * Update average score when a quiz is completed
     */
    static async updateAvgScore(userId: string, newScore: number): Promise<void> {
        try {
            const analysis = await AnalysisModel.findOne({ userId });
            
            if (!analysis) {
                await AnalysisModel.create({
                    userId,
                    recentChapters: [],
                    recentFolders: [],
                    lastMindmaps: [],
                    lastRank: 0,
                    totalChapters: 0,
                    lastSummary: null,
                    avgScore: newScore,
                });
            } else {
                // Calculate new average (weighted)
                const currentAvg = analysis.avgScore || 0;
                const newAvg = currentAvg === 0 ? newScore : (currentAvg + newScore) / 2;
                
                await AnalysisModel.findOneAndUpdate(
                    { userId },
                    { avgScore: Math.round(newAvg * 100) / 100 }, // Round to 2 decimals
                    { new: true }
                );
            }
            
            await CacheHelper.delete(CacheKeys.getAnalysisKey(userId));
        } catch (error) {
            console.error("[AnalysisService] Error updating avg score:", error);
        }
    }

    /**
     * Initialize analysis document for a new user
     */
    static async initializeAnalysis(userId: string): Promise<void> {
        try {
            const exists = await AnalysisModel.findOne({ userId });
            if (!exists) {
                await AnalysisModel.create({
                    userId,
                    recentChapters: [],
                    recentFolders: [],
                    lastMindmaps: [],
                    lastRank: 0,
                    totalChapters: 0,
                    lastSummary: null,
                    avgScore: 0,
                });
            }
        } catch (error) {
            console.error("[AnalysisService] Error initializing analysis:", error);
        }
    }

    /**
     * Update user rank (can be called periodically or after significant events)
     */
    static async updateUserRank(userId: string, rank: number): Promise<void> {
        try {
            await AnalysisModel.findOneAndUpdate(
                { userId },
                { lastRank: rank },
                { new: true, upsert: true }
            );
            
            await CacheHelper.delete(CacheKeys.getAnalysisKey(userId));
        } catch (error) {
            console.error("[AnalysisService] Error updating user rank:", error);
        }
    }
}
