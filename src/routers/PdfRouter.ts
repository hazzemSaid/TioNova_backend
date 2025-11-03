// ⚠️ DEPRECATED: This router is kept for backward compatibility only
// Please use the specific routers instead:
// - FolderRouter for folder operations
// - ChapterRouter for chapter operations
// - QuizRouter for quiz operations
// - SummaryRouter for summary operations
// - MindmapRouter for mindmap operations
// - NoteRouter for note operations
// - ShareRouter for share operations

import { Router } from "express";
import multer from "multer";
import PdfController from "../controllers/PdfController";
import verifyToken from "../middleware/verifyToken";

const PdfRouter = Router();
const storage = multer.memoryStorage();
export const upload = multer({ storage });

// Folder operations (use FolderRouter instead)
PdfRouter.post("/createfolder", verifyToken, PdfController.createfolder);
PdfRouter.patch("/updatefolder", verifyToken, PdfController.updatefolder);
PdfRouter.get("/getfolders", verifyToken, PdfController.getfolders);
PdfRouter.delete("/deletefolder/:folderId", verifyToken, PdfController.deletefolder);

// Chapter operations (use ChapterRouter instead)
PdfRouter.post("/createchapter", verifyToken, upload.single("file"), PdfController.createchapter);
PdfRouter.get("/getchapters/:folderId", verifyToken, PdfController.getchapters);
PdfRouter.get("/getchaptercontent/:chapterId", verifyToken, PdfController.getchaptercontent);
PdfRouter.delete("/deletechapter/:chapterId", verifyToken, PdfController.deletechapter);

// Summary operations (use SummaryRouter instead)
PdfRouter.post("/summarizecchapter", verifyToken, PdfController.summarizecchapter);
PdfRouter.get("/getChapterSummary/:chapterId", verifyToken, PdfController.getChapterSummary);

// Quiz operations (use QuizRouter instead)
PdfRouter.post("/createquiz", verifyToken, PdfController.createquiz);
PdfRouter.get("/getchapterquiz/:chapterId", verifyToken, PdfController.getchapterquiz);
PdfRouter.get("/getQuizQuestions/:quizId", verifyToken, PdfController.getQuizQuestions);
PdfRouter.post("/setuserquizstatus", verifyToken, PdfController.setUserQuizStatus);
PdfRouter.post("/quizhistory", verifyToken, PdfController.quizhistory);

// Mindmap operations (use MindmapRouter instead)
PdfRouter.post("/createMindmap", verifyToken, PdfController.createMindmap);
PdfRouter.patch("/saveMindmap", verifyToken, PdfController.saveMindmap);
PdfRouter.post("/generateText", verifyToken, PdfController.generatecontent);
PdfRouter.get("/getMindmap/:chapterId", verifyToken, PdfController.getmindmap);

// Share operations (use ShareRouter instead)
PdfRouter.post("/getAvailableUsersForShare", verifyToken, PdfController.getAvailableUsersForShare);
PdfRouter.post("/setuserssharewith", verifyToken, PdfController.setuserssharewith);

// Note operations (use NoteRouter instead)
PdfRouter.get("/notes/chapter/:chapterId", verifyToken, PdfController.getNotesByChapterId);
PdfRouter.post("/notes/text", verifyToken, PdfController.addTextNote);
PdfRouter.post("/notes/image", verifyToken, upload.single("file"), PdfController.addImageNote);
PdfRouter.post("/notes/voice", verifyToken, upload.single("file"), PdfController.addVoiceNote);
PdfRouter.delete("/notes/:noteId", verifyToken, PdfController.deleteNote);

export default PdfRouter;
