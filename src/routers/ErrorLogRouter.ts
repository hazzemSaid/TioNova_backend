import { Router } from "express";
import { logError } from "../controllers/ErrorLogController";

const router = Router();

/**
 * @route POST /api/error-log
 * @desc Log an error message
 * @access Public (for testing - add verifyToken if needed)
 */
router.post("/", logError);

export default router;
