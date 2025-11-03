import { Router } from "express";
import SummaryController from "../controllers/SummaryController";
import verifyToken from "../middleware/verifyToken";

const SummaryRouter = Router();

// Summary operations
SummaryRouter.post("/summarizecchapter", verifyToken, SummaryController.summarizecchapter);
SummaryRouter.get("/getChapterSummary/:chapterId", verifyToken, SummaryController.getChapterSummary);

export default SummaryRouter;
