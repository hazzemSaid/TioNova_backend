import CacheHelper from "../utils/cacheHelper";
import { CacheKeys } from "../utils/cache_keys";
import { getAffectedUsers } from "../utils/folderAccess";

export class ChapterCacheService {
	/**
	 * Specific invalidation for chapter creation
	 */
	static async invalidateForCreation(chapterId: string, folder: any): Promise<void> {
		const affectedUsers = getAffectedUsers(folder);

		// Invalidate chapters list for this folder
		await CacheHelper.invalidateChaptersList(folder._id.toString(), affectedUsers);

		// Invalidate user folders for counts
		await Promise.all(
			affectedUsers.map(uid => CacheHelper.invalidateUserFolders(uid))
		);

		// Invalidate profile
		await CacheHelper.delete(CacheKeys.getUserProfileKey(folder.ownerId.toString()));
	}

	/**
	 * Invalidates caches after a chapter update.
	 * Handles both simple updates and folder changes.
	 */
	static async invalidateForUpdate(
		chapterId: string,
		currentFolder: any,
		newFolder: any | null = null
	): Promise<void> {
		const affectedUsersCurrent = getAffectedUsers(currentFolder);

		// Always invalidate the chapter itself and its current folder list
		await CacheHelper.invalidateChapter(chapterId, currentFolder._id.toString(), affectedUsersCurrent);

		// Invalidate current folder counts
		await Promise.all(
			affectedUsersCurrent.map(uid => CacheHelper.invalidateUserFolders(uid))
		);

		// If folder changed, invalidate new folder as well
		if (newFolder) {
			const affectedUsersNew = getAffectedUsers(newFolder);
			await CacheHelper.invalidateChaptersList(newFolder._id.toString(), affectedUsersNew);
			await Promise.all(
				affectedUsersNew.map(uid => CacheHelper.invalidateUserFolders(uid))
			);
		}
	}

	/**
	 * Invalidates caches after a chapter deletion.
	 */
	static async invalidateForDeletion(chapterId: string, folder: any): Promise<void> {
		const affectedUsers = getAffectedUsers(folder);

		await CacheHelper.invalidateChapter(chapterId, folder._id.toString(), affectedUsers);

		// Invalidate counts and profile
		await Promise.all(
			affectedUsers.map(uid => CacheHelper.invalidateUserFolders(uid))
		);
		await CacheHelper.delete(CacheKeys.getUserProfileKey(folder.ownerId.toString()));
	}
}
