import { Request, Response } from "express";
import asyncWrapper from "../middleware/asyncwrapper";
import ErrorLog from "../models/ErrorLogModel";

/**
 * Log an error message
 * @route POST /api/error-log
 */
export const logError = asyncWrapper(async (req: Request, res: Response) => {
  const { message } = req.body;

  if (!message) {
    return res.status(400).json({
      success: false,
      error: "Message is required",
      statusCode: 400,
    });
  }

  const errorLog = await ErrorLog.create({ message });

  res.status(201).json({
    success: true,
    data: {
      id: errorLog._id,
      message: errorLog.message,
      createdAt: errorLog.createdAt,
    },
  });
});
