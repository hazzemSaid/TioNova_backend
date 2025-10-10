// cacheHelper.ts - Centralized cache operations with error handling

import { getCache, setCache, delCache } from "../../api/redisClient";
import { CacheKeys } from "../utils/cache_keys";

export class CacheHelper {
    /**
     * Get data from cache with automatic JSON parsing
     */
    static async get<T>(key: string): Promise<T | null> {
        try {
            const cached = await getCache(key);
            if (!cached) return null;
            
            // Try to parse as JSON, if fails return as string
            try {
                return JSON.parse(cached) as T;
            } catch {
                return cached as T;
            }
        } catch (error) {
            console.error(`[Cache] Error reading key "${key}":`, error);
            return null;
        }
    }

    /**
     * Set data in cache with automatic JSON stringification
     */
    static async set(key: string, value: any, ttl?: number): Promise<boolean> {
        try {
            const dataToCache = typeof value === 'string' ? value : JSON.stringify(value);
            await setCache(key, dataToCache, ttl);
            return true;
        } catch (error) {
            console.error(`[Cache] Error setting key "${key}":`, error);
            return false;
        }
    }

    /**
     * Delete single cache key
     */
    static async delete(key: string): Promise<boolean> {
        try {
            await delCache(key);
            return true;
        } catch (error) {
            console.error(`[Cache] Error deleting key "${key}":`, error);
            return false;
        }
    }

    /**
     * Delete multiple cache keys
     */
    static async deleteMany(keys: string[]): Promise<void> {
        try {
            await Promise.all(keys.map(key => delCache(key)));
        } catch (error) {
            console.error(`[Cache] Error deleting multiple keys:`, error);
        }
    }

    /**
     * Get or set pattern: Try cache first, if miss then execute callback and cache result
     */
    static async getOrSet<T>(
        key: string,
        callback: () => Promise<T>,
        ttl?: number
    ): Promise<{ data: T; cached: boolean }> {
        // Try cache first
        const cached = await this.get<T>(key);
        if (cached !== null) {
            return { data: cached, cached: true };
        }

        // Execute callback to get fresh data
        const data = await callback();
        
        // Cache the result
        await this.set(key, data, ttl);
        
        return { data, cached: false };
    }

    /**
     * Invalidate all chapter-related caches
     */
    static async invalidateChapter(
        chapterId: string,
        folderId?: string,
        userIds?: string[]
    ): Promise<void> {
        const keys = CacheKeys.getChapterInvalidationKeys(chapterId, folderId, userIds);
        await this.deleteMany(keys);
        console.log(`[Cache] Invalidated ${keys.length} keys for chapter ${chapterId}`);
    }

    /**
     * Invalidate all folder-related caches
     */
    static async invalidateFolder(folder: any): Promise<void> {
        const keys = CacheKeys.getFolderInvalidationKeys(folder);
        await this.deleteMany(keys);
        console.log(`[Cache] Invalidated ${keys.length} keys for folder ${folder._id}`);
    }

    /**
     * Invalidate user's folder list cache
     */
    static async invalidateUserFolders(userId: string): Promise<void> {
        const key = CacheKeys.getFoldersListKey(userId);
        await this.delete(key);
        console.log(`[Cache] Invalidated folders list for user ${userId}`);
    }

    /**
     * Invalidate chapters list for folder and specific users
     */
    static async invalidateChaptersList(folderId: string, userIds: string[]): Promise<void> {
        const keys = userIds.map(userId => CacheKeys.getChaptersListKey(folderId, userId));
        await this.deleteMany(keys);
        console.log(`[Cache] Invalidated chapters list for ${userIds.length} users`);
    }

    /**
     * Cache chapter content (handles Buffer properly)
     */
    static async cacheChapterContent(
        chapterId: string,
        content: Buffer,
        ttl?: number
    ): Promise<void> {
        const key = CacheKeys.getChapterContentKey(chapterId);
        const base64Content = content.toString('base64');
        await this.set(key, base64Content, ttl || CacheKeys.TTL.ONE_WEEK);
    }

    /**
     * Get cached chapter content (returns Buffer)
     */
    static async getCachedChapterContent(chapterId: string): Promise<Buffer | null> {
        const key = CacheKeys.getChapterContentKey(chapterId);
        const cached = await this.get<string>(key);
        
        if (!cached) return null;
        
        try {
            return Buffer.from(cached, 'base64');
        } catch {
            return null;
        }
    }

    /**
     * Cache quiz with proper structure
     */
    static async cacheQuiz(
        chapterId: string,
        quizData: {
            quizId: string;
            title: string;
            questions: any[];
        },
        ttl?: number
    ): Promise<void> {
        const key = CacheKeys.getQuizKey(chapterId);
        await this.set(key, quizData, ttl || CacheKeys.TTL.ONE_DAY);
    }

    /**
     * Get cached quiz
     */
    static async getCachedQuiz(chapterId: string): Promise<{
        quizId: string;
        title: string;
        questions: any[];
    } | null> {
        const key = CacheKeys.getQuizKey(chapterId);
        return await this.get(key);
    }

    /**
     * Invalidate quiz history for user
     */
    static async invalidateQuizHistory(userId: string, chapterId: string): Promise<void> {
        const keys = [
            CacheKeys.getUserQuizStatusKey(userId, chapterId),
            CacheKeys.getUserQuizHistoryKey(userId, chapterId),
        ];
        await this.deleteMany(keys);
    }

    /**
     * Cache folders list with proper structure
     */
    static async cacheFoldersList(
        userId: string,
        folders: any[],
        ttl?: number
    ): Promise<void> {
        const key = CacheKeys.getFoldersListKey(userId);
        await this.set(key, folders, ttl || CacheKeys.TTL.SIX_HOURS);
    }

    /**
     * Cache chapters list
     */
    static async cacheChaptersList(
        folderId: string,
        userId: string,
        chapters: any[],
        ttl?: number
    ): Promise<void> {
        const key = CacheKeys.getChaptersListKey(folderId, userId);
        await this.set(key, chapters, ttl || CacheKeys.TTL.SIX_HOURS);
    }

    /**
     * Warmup cache - preload frequently accessed data
     */
    static async warmupUserCache(userId: string): Promise<void> {
        console.log(`[Cache] Warming up cache for user ${userId}`);
        // This can be called after login to preload user's data
        // Implementation depends on your needs
    }

    /**
     * Clear all caches for a user (useful for testing or user deletion)
     */
    static async clearUserCache(userId: string): Promise<void> {
        const keys = [
            CacheKeys.getFoldersListKey(userId),
            CacheKeys.getUserProfileKey(userId),
            // Add more user-specific keys as needed
        ];
        await this.deleteMany(keys);
        console.log(`[Cache] Cleared all caches for user ${userId}`);
    }

    /**
     * Get cache statistics (useful for monitoring)
     */
    static async getCacheStats(): Promise<{
        totalKeys: number;
        keysByPrefix: Record<string, number>;
    }> {
        // This would require additional Redis commands
        // Implement based on your Redis client capabilities
        return {
            totalKeys: 0,
            keysByPrefix: {},
        };
    }
}

export default CacheHelper;