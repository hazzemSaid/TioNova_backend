import express from "express";
import getAnalysis from "../controllers/AnalysisController";
import verifyToken from "../middleware/verifyToken";

const analysisRouter = express.Router();

analysisRouter.get("/analysis", verifyToken, getAnalysis);

export default analysisRouter;