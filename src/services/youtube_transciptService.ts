import mongoose from "mongoose";
import { YoutubeTranscript } from "youtube-transcript";
import ChapterModel from "../models/ChapterModel";
import FolderModel from "../models/FolderModel";
import { CacheKeys } from "../utils/cache_keys";
import CacheHelper from "../utils/cacheHelper";
import ErrorHandler from "../utils/error";

export interface ICreateYouTubeChapterBody {
	folderId: string;
	title: string;
	description?: string;
	category?: string;
	file: string;
}

export const createYouTubeChapterService = async (
	user: { _id: mongoose.Types.ObjectId },
	body: ICreateYouTubeChapterBody
): Promise<{ chapter: any; transcript: string }> => {
	const { folderId, title, description, category, file } = body;
	const folder = await FolderModel.findById(folderId);
	if (!folder) throw ErrorHandler.createError("Folder not found", 404);
	if (!file) throw ErrorHandler.createError("YouTube URL is required", 400);

	let transcript = "";
	try {
		const transcriptArr = await YoutubeTranscript.fetchTranscript(file);
		transcript = transcriptArr.map((t: any) => t.text).join(" ");
	} catch (error) {
		transcript = "";
	}
	const chapter = await ChapterModel.create({
		content: file,
		contentType: "youtube/transcript",
		createdBy: user._id,
		updatedBy: user._id,
		folderId,
		overcontent: transcript,
		title,
		description,
		category,
	});
	// Cache transcript (even if empty)
	const overcontentKey = CacheKeys.getChapterOverContentKey(chapter._id.toString());
	await CacheHelper.set(overcontentKey, transcript, CacheKeys.TTL.ONE_WEEK);
	const affectedUsers = [folder.ownerId.toString(), ...((folder.sharedWith || []).map((id: any) => id.toString()))];
	await CacheHelper.invalidateChaptersList(folderId, affectedUsers);
	return { chapter, transcript };
}