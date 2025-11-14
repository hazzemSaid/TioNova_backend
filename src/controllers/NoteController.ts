import mongoose from "mongoose";
import asyncWrapper from "../middleware/asyncwrapper";
import ChapterModel from "../models/ChapterModel";
import NoteModel from "../models/NoteModel";
import { uploadToCloudinary } from "../utils/cloudinaryService";
import ErrorHandler from "../utils/error";

/**
 * Get all notes by chapter ID
 * @route GET /api/notes/chapter/:chapterId
 */
const getNotesByChapterId = asyncWrapper(async (req, res, next) => {
	const { chapterId } = req.params;

	// Validate chapter ID
	if (!mongoose.Types.ObjectId.isValid(chapterId)) {
		return next(ErrorHandler.createError("Invalid chapter ID", 400));
	}

	// Check if chapter exists
	const chapter = await ChapterModel.findById(chapterId);
	if (!chapter) {
		return next(ErrorHandler.createError("Chapter not found", 404));
	}

	// Get all notes for this chapter
	const notes = await NoteModel.find({ chapterId })
		.populate('createdBy', 'name email')
		.sort({ createdAt: -1 });

	res.status(200).json({
		success: true,
		data: {
			notes,
			count: notes.length
		}
	});
});

/**
 * Add a text note (JSON)
 * @route POST /api/notes/text
 */
const addTextNote = asyncWrapper(async (req, res, next) => {
	const { title, chapterId, textContent, meta } = req.body;
	const userId = req.user?._id;

	if (!userId) {
		return next(ErrorHandler.createError("User not authenticated", 401));
	}

	if (!title || !chapterId || !textContent) {
		return next(ErrorHandler.createError("Title, chapter ID, and text content are required", 400));
	}

	if (!mongoose.Types.ObjectId.isValid(chapterId)) {
		return next(ErrorHandler.createError("Invalid chapter ID", 400));
	}

	const chapter = await ChapterModel.findById(chapterId);
	if (!chapter) {
		return next(ErrorHandler.createError("Chapter not found", 404));
	}

	const note = await NoteModel.create({
		title,
		chapterId,
		createdBy: userId,
		rawData: {
			type: 'text',
			data: textContent,
			meta: meta || {}
		}
	});

	await note.populate('createdBy', 'name email');

	res.status(201).json({
		success: true,
		data: { note }
	});
});

/**
 * Add an image note (with file upload)
 * @route POST /api/notes/image
 */
const addImageNote = asyncWrapper(async (req, res, next) => {
	const { title, chapterId, meta } = req.body;
	const userId = req.user?._id;
	const file = req.file;

	if (!userId) {
		return next(ErrorHandler.createError("User not authenticated", 401));
	}

	if (!title || !chapterId) {
		return next(ErrorHandler.createError("Title and chapter ID are required", 400));
	}

	if (!file) {
		return next(ErrorHandler.createError("Image file is required", 400));
	}

	if (!mongoose.Types.ObjectId.isValid(chapterId)) {
		return next(ErrorHandler.createError("Invalid chapter ID", 400));
	}

	const chapter = await ChapterModel.findById(chapterId);
	if (!chapter) {
		return next(ErrorHandler.createError("Chapter not found", 404));
	}

	// Upload image to Cloudinary
	const uploadResult = await uploadToCloudinary(file.buffer, 'notes/images');

	const note = await NoteModel.create({
		title,
		chapterId,
		createdBy: userId,
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

	res.status(201).json({
		success: true,
		data: { note }
	});
});

/**
 * Add a voice note (with file upload)
 * @route POST /api/notes/voice
 */
const addVoiceNote = asyncWrapper(async (req, res, next) => {
	const { title, chapterId, meta } = req.body;
	const userId = req.user?._id;
	const file = req.file;

	if (!userId) {
		return next(ErrorHandler.createError("User not authenticated", 401));
	}

	if (!title || !chapterId) {
		return next(ErrorHandler.createError("Title and chapter ID are required", 400));
	}

	if (!file) {
		return next(ErrorHandler.createError("Voice file is required", 400));
	}

	if (!mongoose.Types.ObjectId.isValid(chapterId)) {
		return next(ErrorHandler.createError("Invalid chapter ID", 400));
	}

	const chapter = await ChapterModel.findById(chapterId);
	if (!chapter) {
		return next(ErrorHandler.createError("Chapter not found", 404));
	}

	// Upload voice to Cloudinary (supports audio files)
	const uploadResult = await uploadToCloudinary(file.buffer, 'notes/voices', 'video'); // 'video' resource_type for audio

	const note = await NoteModel.create({
		title,
		chapterId,
		createdBy: userId,
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

	res.status(201).json({
		success: true,
		data: { note }
	});
});

/**
 * Delete a note
 * @route DELETE /api/notes/:noteId
 */
const deleteNote = asyncWrapper(async (req, res, next) => {
	const { noteId } = req.params;
	const userId = req.user?._id;

	if (!userId) {
		return next(ErrorHandler.createError("User not authenticated", 401));
	}

	if (!mongoose.Types.ObjectId.isValid(noteId)) {
		return next(ErrorHandler.createError("Invalid note ID", 400));
	}

	const note = await NoteModel.findById(noteId);
	if (!note) {
		return next(ErrorHandler.createError("Note not found", 404));
	}

	if (note.createdBy.toString() !== userId.toString()) {
		return next(ErrorHandler.createError("You are not authorized to delete this note", 403));
	}

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
				console.error('Error deleting from Cloudinary:', error);
			}
		}
	}

	await NoteModel.findByIdAndDelete(noteId);

	res.status(200).json({
		success: true,
		message: "Note deleted successfully"
	});
});

const NoteController = {
	getNotesByChapterId,
	addTextNote,
	addImageNote,
	addVoiceNote,
	deleteNote
};

export default NoteController;
