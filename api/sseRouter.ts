import express from "express";
import sseController from "../src/controllers/sseController";

const router = express.Router();

// SSE subscribe route (serverless / api folder)
router.get("/subscribe", sseController.streamUpdates);

export default router;