import { Router } from "express";
import multer from "multer";
import ChapterController from "../controllers/ChapterController";
import verifyToken from "../middleware/verifyToken";

const ChapterRouter = Router();

// Configure multer for file uploads
const storage = multer.memoryStorage();
const upload = multer({ storage });

// Chapter operations
ChapterRouter.post("/createchapter", verifyToken, upload.single("file"), ChapterController.createchapter);
ChapterRouter.get("/getchapters/:folderId", verifyToken, ChapterController.getchapters);
ChapterRouter.get("/getchaptercontent/:chapterId", verifyToken, ChapterController.getchaptercontent);
ChapterRouter.delete("/deletechapter/:chapterId", verifyToken, ChapterController.deletechapter);

export default ChapterRouter;
