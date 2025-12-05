import asyncWrapper from "../middleware/asyncwrapper";
import * as noteService from "../services/noteService";
import ErrorHandler from "../utils/error";

/**
 * Get all notes by chapter ID
 * @route GET /api/notes/chapter/:chapterId
 */
const getNotesByChapterId = asyncWrapper(async (req, res, next) => {
	const { chapterId } = req.params;
	const user = req.user;

	if (!user) {
		return next(ErrorHandler.createError("User not authenticated", 401));
	}

	const notes = await noteService.getNotesByChapterIdService(user, chapterId);

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
	const user = req.user;

	if (!user) {
		return next(ErrorHandler.createError("User not authenticated", 401));
	}

	const note = await noteService.addTextNoteService(user, { title, chapterId, textContent, meta });

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
	const user = req.user;
	const file = req.file;

	if (!user) {
		return next(ErrorHandler.createError("User not authenticated", 401));
	}

	if (!file) {
		return next(ErrorHandler.createError("Image file is required", 400));
	}

	const note = await noteService.addImageNoteService(user, { title, chapterId, meta }, file);

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
	const user = req.user;
	const file = req.file;

	if (!user) {
		return next(ErrorHandler.createError("User not authenticated", 401));
	}

	if (!file) {
		return next(ErrorHandler.createError("Voice file is required", 400));
	}

	const note = await noteService.addVoiceNoteService(user, { title, chapterId, meta }, file);

	res.status(201).json({
		success: true,
		data: { note }
	});
});

/**
 * Update a note
 * @route PATCH /api/notes/:noteId
 */
const updateNote = asyncWrapper(async (req, res, next) => {
	const { noteId } = req.params;
	const { title, rawData } = req.body;
	const user = req.user;

	if (!user) {
		return next(ErrorHandler.createError("User not authenticated", 401));
	}

	const updatedNote = await noteService.updateNoteService(user, noteId, { title, rawData });

	res.status(200).json({
		success: true,
		data: { note: updatedNote }
	});
});

/**
 * Delete a note
 * @route DELETE /api/notes/:noteId
 */
const deleteNote = asyncWrapper(async (req, res, next) => {
	const { noteId } = req.params;
	const user = req.user;

	if (!user) {
		return next(ErrorHandler.createError("User not authenticated", 401));
	}

	const result = await noteService.deleteNoteService(user, noteId);

	res.status(200).json(result);
});

const NoteController = {
	getNotesByChapterId,
	addTextNote,
	addImageNote,
	addVoiceNote,
	updateNote,
	deleteNote
};

export default NoteController;
