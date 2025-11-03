import { Router } from "express";
import MindmapController from "../controllers/MindmapController";
import verifyToken from "../middleware/verifyToken";

const MindmapRouter = Router();

// Mindmap operations
MindmapRouter.post("/createMindmap", verifyToken, MindmapController.createMindmap);
MindmapRouter.patch("/saveMindmap", verifyToken, MindmapController.saveMindmap);
MindmapRouter.post("/generateText", verifyToken, MindmapController.generatecontent);
MindmapRouter.get("/getMindmap/:chapterId", verifyToken, MindmapController.getmindmap);

export default MindmapRouter;
