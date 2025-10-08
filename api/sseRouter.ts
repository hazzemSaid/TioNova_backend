import express from "express";
const router = express.Router();
const { streamUpdates } = require("../src/controllers/sseController");

// SSE subscribe route
router.get("/subscribe", streamUpdates);
export default router;