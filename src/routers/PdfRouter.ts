import { Router } from "express";
import multer from "multer";
import PdfController from "../controllers/PdfController";
import verifyToken from "../middleware/verifyToken";
const PdfRouter = Router();
const storage = multer.memoryStorage(); // يخزن الملف في الذاكرة
export const upload = multer({ storage });
PdfRouter.post("/createfolder", verifyToken, PdfController.createfolder);
PdfRouter.post("/createchapter", verifyToken, upload.single("file"), PdfController.createchapter);
PdfRouter.post("/summarizecchapter", verifyToken, PdfController.summarizecchapter);
PdfRouter.post("/createquiz", verifyToken, PdfController.createquiz);
PdfRouter.get("/getchapterquiz/:chapterId", verifyToken, PdfController.getchapterquiz);
PdfRouter.get("/getQuizQuestions/:quizId", verifyToken, PdfController.getQuizQuestions);
PdfRouter.get("/getChapterSummary/:chapterId", verifyToken, PdfController.getChapterSummary);
PdfRouter.post("/setuserquizstatus", verifyToken, PdfController.setUserQuizStatus);
PdfRouter.post("/quizhistory", verifyToken, PdfController.quizhistory);
PdfRouter.patch("/updatefolder", verifyToken, PdfController.updatefolder);
PdfRouter.get("/getfolders", verifyToken, PdfController.getfolders);
PdfRouter.get("/getchapters/:folderId", verifyToken, PdfController.getchapters);
PdfRouter.get("/getchaptercontent/:chapterId", verifyToken, PdfController.getchaptercontent);
PdfRouter.post("/getAvailableUsersForShare", verifyToken, PdfController.getAvailableUsersForShare);
PdfRouter.post("/setuserssharewith", verifyToken, PdfController.setuserssharewith);
PdfRouter.delete("/deletefolder/:folderId", verifyToken, PdfController.deletefolder).delete("/deletechapter/:chapterId", verifyToken, PdfController.deletechapter)
PdfRouter.post("/createMindmap", verifyToken, PdfController.createMindmap);
PdfRouter.post("/createMindmap", verifyToken, PdfController.createMindmap);
PdfRouter.patch("/saveMindmap", verifyToken, PdfController.saveMindmap);
PdfRouter.post("/generateText", verifyToken, PdfController.generatecontent);

// Note operations
PdfRouter.get("/notes/chapter/:chapterId", verifyToken, PdfController.getNotesByChapterId);
PdfRouter.post("/notes/text", verifyToken, PdfController.addTextNote);
PdfRouter.post("/notes/image", verifyToken, upload.single("file"), PdfController.addImageNote);
PdfRouter.post("/notes/voice", verifyToken, upload.single("file"), PdfController.addVoiceNote);
PdfRouter.delete("/notes/:noteId", verifyToken, PdfController.deleteNote);

export default PdfRouter;