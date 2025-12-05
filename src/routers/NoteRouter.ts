import { Router } from "express";
import multer from "multer";
import NoteController from "../controllers/NoteController";
import verifyToken from "../middleware/verifyToken";

const NoteRouter = Router();

// Configure multer for file uploads
const storage = multer.memoryStorage();
const upload = multer({ storage });

// Note operations
NoteRouter.get("/notes/chapter/:chapterId", verifyToken, NoteController.getNotesByChapterId);
NoteRouter.post("/notes/text", verifyToken, NoteController.addTextNote);
NoteRouter.post("/notes/image", verifyToken, upload.single("file"), NoteController.addImageNote);
NoteRouter.post("/notes/voice", verifyToken, upload.single("file"), NoteController.addVoiceNote);
NoteRouter.patch("/notes/:noteId", verifyToken, NoteController.updateNote);
NoteRouter.delete("/notes/:noteId", verifyToken, NoteController.deleteNote);

export default NoteRouter;
