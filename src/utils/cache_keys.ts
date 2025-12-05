// cache_keys.ts - Improved with TTL constants and helper methods

export class CacheKeys {
    // ==================== TTL Constants ====================
    static readonly TTL = {
        ONE_HOUR: 3600,           // 1 hour
        SIX_HOURS: 21600,         // 6 hours
        ONE_DAY: 86400,           // 1 day
        ONE_WEEK: 604800,         // 7 days
        ONE_MONTH: 2592000,       // 30 days
    };

    // ==================== Chapter Related Keys ====================
    static getChapterOverContentKey(chapterId: string): string {
        return `chapter:${chapterId}:overcontent`;
    }

    static getChapterContentKey(chapterId: string): string {
        return `chapter:${chapterId}:content`;
    }

    static getChapterMetadataKey(chapterId: string): string {
        return `chapter:${chapterId}:metadata`;
    }

    static getChaptersListKey(folderId: string, userId: string): string {
        return `chapters:list:folder:${folderId}:user:${userId}`;
    }

    // Get all chapter-related keys for invalidation
    static getAllChapterKeys(chapterId: string): string[] {
        return [
            this.getChapterOverContentKey(chapterId),
            this.getChapterContentKey(chapterId),
            this.getChapterMetadataKey(chapterId),
            this.getSummaryKey(chapterId),
            this.getQuizKey(chapterId),
            this.getMindmapKey(chapterId),
        ];
    }

    // ==================== Summary Related Keys ====================
    static getSummaryKey(chapterId: string): string {
        return `summary:chapter:${chapterId}`;
    }

    // ==================== Quiz Related Keys ====================
    static getQuizKey(chapterId: string): string {
        return `quiz:chapter:${chapterId}`;
    }

    static getQuizQuestionsKey(quizId: string): string {
        return `quiz:${quizId}:questions`;
    }

    static getUserQuizStatusKey(userId: string, chapterId: string): string {
        return `quiz:status:user:${userId}:chapter:${chapterId}`;
    }

    static getUserQuizHistoryKey(userId: string, chapterId: string): string {
        return `quiz:history:user:${userId}:chapter:${chapterId}`;
    }

    // ==================== Folder Related Keys ====================
    static getFoldersListKey(userId: string): string {
        return `folders:list:user:${userId}`;
    }

    static getFolderMetadataKey(folderId: string): string {
        return `folder:${folderId}:metadata`;
    }

    static getFolderSharedUsersKey(folderId: string): string {
        return `folder:${folderId}:shared-users`;
    }

    // Get all folder-related keys for a user (for invalidation)
    static getAllFolderKeysForUser(userId: string): string[] {
        return [
            this.getFoldersListKey(userId),
        ];
    }

    // ==================== Chat Related Keys ====================
    static getChatCacheKey(chapterId: string, userId: string): string {
        return `chat:chapter:${chapterId}:user:${userId}`;
    }

    static getChatHistoryKey(chapterId: string, userId: string): string {
        return `chat:history:chapter:${chapterId}:user:${userId}`;
    }

    // ==================== Challenge Related Keys ====================
    static getChallengeKey(challengeId: string): string {
        return `challenge:${challengeId}`;
    }

    // ==================== User Related Keys ====================
    static getUserSearchKey(query: string, page: number, limit: number): string {
        const cleanQuery = (query || 'all').toLowerCase().trim();
        return `users:search:${cleanQuery}:page:${page}:limit:${limit}`;
    }

    static getUserProfileKey(userId: string): string {
        return `user:${userId}:profile`;
    }

    // ==================== Pattern Matching for Bulk Operations ====================
    static getPatternForFolder(folderId: string): string {
        return `*:folder:${folderId}:*`;
    }

    static getPatternForChapter(chapterId: string): string {
        return `*:chapter:${chapterId}:*`;
    }

    static getPatternForUser(userId: string): string {
        return `*:user:${userId}:*`;
    }

    // ==================== Helper Methods ====================

    /**
     * Invalidate all caches related to a chapter
     */
    static getChapterInvalidationKeys(chapterId: string, folderId?: string, userIds?: string[]): string[] {
        const keys = this.getAllChapterKeys(chapterId);

        // Add chapters list keys for affected users
        if (folderId && userIds && userIds.length > 0) {
            userIds.forEach(userId => {
                keys.push(this.getChaptersListKey(folderId, userId));
            });
        }

        return keys;
    }

    /**
     * Invalidate all caches related to a folder
     */
    static getFolderInvalidationKeys(folder: any): string[] {
        const keys: string[] = [];

        // Owner's folder list
        keys.push(this.getFoldersListKey(folder.ownerId.toString()));

        // Shared users' folder lists
        if (Array.isArray(folder.sharedWith)) {
            folder.sharedWith.forEach((userId: any) => {
                keys.push(this.getFoldersListKey(userId.toString()));
            });
        }

        // Folder metadata
        keys.push(this.getFolderMetadataKey(folder._id.toString()));
        keys.push(this.getFolderSharedUsersKey(folder._id.toString()));

        return keys;
    }

    /**
     * Get recommended TTL based on data type
     */
    static getRecommendedTTL(dataType: 'content' | 'list' | 'metadata' | 'search' | 'quiz' | 'summary'): number {
        switch (dataType) {
            case 'content':
                return this.TTL.ONE_WEEK;      // Content rarely changes
            case 'list':
                return this.TTL.SIX_HOURS;     // Lists change more frequently
            case 'metadata':
                return this.TTL.ONE_DAY;       // Metadata moderate frequency
            case 'search':
                return this.TTL.ONE_HOUR;      // Search results change often
            case 'quiz':
                return this.TTL.ONE_DAY;       // Quiz data moderate frequency
            case 'summary':
                return this.TTL.ONE_WEEK;      // Summaries rarely change
            default:
                return this.TTL.ONE_HOUR;      // Default safe value
        }
    }
    static getMindmapKey(chapterId: string): string {
        return `mindmap:chapter:${chapterId}`;
    }

    // ==================== Analysis Related Keys ====================
    static getAnalysisKey(userId: string): string {
        return `analysis:user:${userId}`;
    }

    // ==================== Note Related Keys ====================
    static getNotesListKey(chapterId: string, userId: string): string {
        return `notes:list:chapter:${chapterId}:user:${userId}`;
    }
}