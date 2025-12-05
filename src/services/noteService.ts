import mongoose from "mongoose";
import { IUser } from "../interfaces/IUser";
import ChapterModel from "../models/ChapterModel";
import NoteModel, { INote } from "../models/NoteModel";
import { CacheKeys } from "../utils/cache_keys";
import CacheHelper from "../utils/cacheHelper";
import ErrorHandler from "../utils/error";

/**
 * Get notes by chapter ID with caching
 */
export const getNotesByChapterIdService = async (
	user: IUser,
	chapterId: string
): Promise<any[]> => {
	// Validate chapter ID
	if (!mongoose.Types.ObjectId.isValid(chapterId)) {
		throw ErrorHandler.createError("Invalid chapter ID", 400);
	}

	// Check if chapter exists
	const chapter = await ChapterModel.findById(chapterId);
	if (!chapter) {
		throw ErrorHandler.createError("Chapter not found", 404);
	}

	const userId = user._id.toString();
	const cacheKey = CacheKeys.getNotesListKey(chapterId, userId);

	// Try cache first
	const { data, cached } = await CacheHelper.getOrSet(
		cacheKey,
		async () => {
			const notes = await NoteModel.find({ chapterId })
				.populate('createdBy', 'name email')
				.sort({ createdAt: -1 })
				.lean();
			return notes;
		},
		CacheKeys.TTL.SIX_HOURS
	);

	console.log(`[NoteService] Notes for chapter ${chapterId} ${cached ? 'from cache' : 'from database'}`);
	return data;
};

/**
 * Update note by ID
 */
export const updateNoteService = async (
	user: IUser,
	noteId: string,
	updates: {
		title?: string;
		rawData?: {
			type?: 'image' | 'text' | 'voice';
			data?: string;
			meta?: Record<string, any>;
		};
	}
): Promise<INote> => {
	// Validate note ID
	if (!mongoose.Types.ObjectId.isValid(noteId)) {
		throw ErrorHandler.createError("Invalid note ID", 400);
	}

	// Find the note
	const note = await NoteModel.findById(noteId);
	if (!note) {
		throw ErrorHandler.createError("Note not found", 404);
	}

	// Check authorization
	if (note.createdBy.toString() !== user._id.toString()) {
		throw ErrorHandler.createError("You are not authorized to update this note", 403);
	}

	// Validate updates
	if (updates.title !== undefined) {
		if (!updates.title || updates.title.trim().length === 0) {
			throw ErrorHandler.createError("Title cannot be empty", 400);
		}
		if (updates.title.length > 200) {
			throw ErrorHandler.createError("Title cannot exceed 200 characters", 400);
		}
		note.title = updates.title.trim();
	}

	if (updates.rawData !== undefined) {
		// Validate rawData structure
		if (!updates.rawData.type || !updates.rawData.data) {
			throw ErrorHandler.createError("rawData must include 'type' and 'data' fields", 400);
		}

		if (!['image', 'text', 'voice'].includes(updates.rawData.type)) {
			throw ErrorHandler.createError("rawData type must be 'image', 'text', or 'voice'", 400);
		}

		// Update rawData fields
		note.rawData.type = updates.rawData.type;
		note.rawData.data = updates.rawData.data;
		if (updates.rawData.meta !== undefined) {
			note.rawData.meta = updates.rawData.meta;
		}
	}

	// Save the note
	await note.save();
	await note.populate('createdBy', 'name email');

	// Invalidate cache for this chapter
	await invalidateNoteCache(note.chapterId.toString(), user._id.toString());

	console.log(`[NoteService] Note ${noteId} updated successfully`);
	return note;
};

/**
 * Delete note by ID
 */
export const deleteNoteService = async (
	user: IUser,
	noteId: string
): Promise<{ success: boolean; message: string }> => {
	// Validate note ID
	if (!mongoose.Types.ObjectId.isValid(noteId)) {
		throw ErrorHandler.createError("Invalid note ID", 400);
	}

	const note = await NoteModel.findById(noteId);
	if (!note) {
		throw ErrorHandler.createError("Note not found", 404);
	}

	// Check authorization
	if (note.createdBy.toString() !== user._id.toString()) {
		throw ErrorHandler.createError("You are not authorized to delete this note", 403);
	}

	const chapterId = note.chapterId.toString();

	// Delete from Cloudinary if it's an image or voice note
	if (note.rawData.type === 'image' || note.rawData.type === 'voice') {
		const publicId = note.rawData.meta?.publicId;
		if (publicId) {
			try {
				const cloudinary = require('cloudinary').v2;
				await cloudinary.uploader.destroy(publicId, {
					resource_type: note.rawData.type === 'voice' ? 'video' : 'image'
				});
			} catch (error) {
				console.error('[NoteService] Error deleting from Cloudinary:', error);
			}
		}
	}

	await NoteModel.findByIdAndDelete(noteId);

	// Invalidate cache for this chapter
	await invalidateNoteCache(chapterId, user._id.toString());

	console.log(`[NoteService] Note ${noteId} deleted successfully`);
	return { success: true, message: "Note deleted successfully" };
};

/**
 * Add a text note
 */
export const addTextNoteService = async (
	user: IUser,
	body: {
		title: string;
		chapterId: string;
		textContent: string;
		meta?: Record<string, any>;
	}
): Promise<INote> => {
	const { title, chapterId, textContent, meta } = body;

	if (!title || !chapterId || !textContent) {
		throw ErrorHandler.createError("Title, chapter ID, and text content are required", 400);
	}

	if (!mongoose.Types.ObjectId.isValid(chapterId)) {
		throw ErrorHandler.createError("Invalid chapter ID", 400);
	}

	const chapter = await ChapterModel.findById(chapterId);
	if (!chapter) {
		throw ErrorHandler.createError("Chapter not found", 404);
	}

	const note = await NoteModel.create({
		title,
		chapterId,
		createdBy: user._id,
		rawData: {
			type: 'text',
			data: textContent,
			meta: meta || {}
		}
	});

	await note.populate('createdBy', 'name email');

	// Invalidate cache for this chapter
	await invalidateNoteCache(chapterId, user._id.toString());

	console.log(`[NoteService] Text note created for chapter ${chapterId}`);
	return note;
};

/**
 * Add an image note
 */
export const addImageNoteService = async (
	user: IUser,
	body: {
		title: string;
		chapterId: string;
		meta?: string;
	},
	file: Express.Multer.File
): Promise<INote> => {
	const { title, chapterId, meta } = body;

	if (!title || !chapterId) {
		throw ErrorHandler.createError("Title and chapter ID are required", 400);
	}

	if (!file) {
		throw ErrorHandler.createError("Image file is required", 400);
	}

	if (!mongoose.Types.ObjectId.isValid(chapterId)) {
		throw ErrorHandler.createError("Invalid chapter ID", 400);
	}

	const chapter = await ChapterModel.findById(chapterId);
	if (!chapter) {
		throw ErrorHandler.createError("Chapter not found", 404);
	}

	// Upload image to Cloudinary
	const { uploadToCloudinary } = await import("../utils/cloudinaryService");
	const uploadResult = await uploadToCloudinary(file.buffer, 'notes/images');

	const note = await NoteModel.create({
		title,
		chapterId,
		createdBy: user._id,
		rawData: {
			type: 'image',
			data: uploadResult.secure_url,
			meta: {
				publicId: uploadResult.public_id,
				format: uploadResult.format,
				width: uploadResult.width,
				height: uploadResult.height,
				size: file.size,
				originalName: file.originalname,
				...JSON.parse(meta || '{}')
			}
		}
	});

	await note.populate('createdBy', 'name email');

	// Invalidate cache for this chapter
	await invalidateNoteCache(chapterId, user._id.toString());

	console.log(`[NoteService] Image note created for chapter ${chapterId}`);
	return note;
};

/**
 * Add a voice note
 */
export const addVoiceNoteService = async (
	user: IUser,
	body: {
		title: string;
		chapterId: string;
		meta?: string;
	},
	file: Express.Multer.File
): Promise<INote> => {
	const { title, chapterId, meta } = body;

	if (!title || !chapterId) {
		throw ErrorHandler.createError("Title and chapter ID are required", 400);
	}

	if (!file) {
		throw ErrorHandler.createError("Voice file is required", 400);
	}

	if (!mongoose.Types.ObjectId.isValid(chapterId)) {
		throw ErrorHandler.createError("Invalid chapter ID", 400);
	}

	const chapter = await ChapterModel.findById(chapterId);
	if (!chapter) {
		throw ErrorHandler.createError("Chapter not found", 404);
	}

	// Upload voice to Cloudinary (supports audio files)
	const { uploadToCloudinary } = await import("../utils/cloudinaryService");
	const uploadResult = await uploadToCloudinary(file.buffer, 'notes/voices', 'video'); // 'video' resource_type for audio

	const note = await NoteModel.create({
		title,
		chapterId,
		createdBy: user._id,
		rawData: {
			type: 'voice',
			data: uploadResult.secure_url,
			meta: {
				publicId: uploadResult.public_id,
				format: uploadResult.format,
				duration: uploadResult.duration,
				size: file.size,
				originalName: file.originalname,
				...JSON.parse(meta || '{}')
			}
		}
	});

	await note.populate('createdBy', 'name email');

	// Invalidate cache for this chapter
	await invalidateNoteCache(chapterId, user._id.toString());

	console.log(`[NoteService] Voice note created for chapter ${chapterId}`);
	return note;
};

/**
 * Helper function to invalidate note caches
 */
async function invalidateNoteCache(chapterId: string, userId: string): Promise<void> {
	const cacheKey = CacheKeys.getNotesListKey(chapterId, userId);
	await CacheHelper.delete(cacheKey);
	console.log(`[NoteService] Invalidated notes cache for chapter ${chapterId}`);
}
