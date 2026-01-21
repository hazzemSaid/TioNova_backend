import cors from "cors";
import * as dotenv from "dotenv";
import express, { NextFunction, Request, Response } from "express";
import morgan from "morgan";
import sseRouter from "../api/sseRouter";
import { connectDB } from "./database/mongodb";
import analysisRouter from "./routers/analysisRouter";
import ChapterRouter from "./routers/ChapterRouter";
import ErrorLogRouter from "./routers/ErrorLogRouter";
import FolderRouter from "./routers/FolderRouter";
import LiveChallengeRouter from "./routers/LiveChallengeRouter";
import MindmapRouter from "./routers/MindmapRouter";
import NoteRouter from "./routers/NoteRouter";
import PdfRouter from "./routers/PdfRouter";
import profileRouter from "./routers/profileRouter";
import QuizRouter from "./routers/QuizRouter";
import ShareRouter from "./routers/ShareRouter";
import SummaryRouter from "./routers/SummaryRouter";
import UserRoute from "./routers/UserRouter";
import { ICustomError } from "./utils/error";
// Load env
dotenv.config();
// Enable morgan logging in development

const port = process.env.PORT || 3000;
const app = express();

// 1️⃣ CORS First - Configured for iOS Safari compatibility
const allowedOrigins = [
  "https://tionova-c566b.web.app",
  "https://tionova.web.app",
  "http://localhost:3000",
];

app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (mobile apps, Postman, etc.)
      if (!origin) return callback(null, true);
      
      if (allowedOrigins.includes(origin)) {
        callback(null, origin);
      } else {
        callback(new Error("Not allowed by CORS"));
      }
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "Accept", "X-Requested-With"],
    exposedHeaders: ["Content-Length", "Content-Type"],
    maxAge: 86400, // Cache preflight for 24 hours - reduces Safari preflight requests
    preflightContinue: false,
    optionsSuccessStatus: 200, // iOS Safari sometimes has issues with 204
  })
);

// Add Vary header for proper caching with dynamic origins (important for Safari)
app.use((req, res, next) => {
  res.header("Vary", "Origin");
  next();
});

// 2️⃣ JSON and Static
app.use(express.json());
app.use(express.static("static"));

// Logging
morgan.token("body", (req: any) => JSON.stringify(req.body));
app.use(
  morgan(":method :url :status :response-time ms - :body", {
    skip: (req, res) => res.statusCode < 400,
  })
);

// Configure routes synchronously (required for Vercel)
app.get("/", (req, res) => {
  res.status(200).json({
    status: "OK",
    message: "TioNova Backend Server is running",
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || "development"
  });
});

// Health endpoint must be defined BEFORE routers to take precedence
app.get("/api/v1/health", async (req, res) => {
  console.log(req.body);
  
  return res.status(200).json({
    status: "OK",
    service: "TioNova API",
    version: "1.0.0",
    timestamp: new Date().toISOString()
  });
});

// Lazy DB connection middleware - connects on first request in serverless
// MUST be placed BEFORE routes to ensure DB is ready
app.use(async (req: Request, res: Response, next: NextFunction) => {
  try {
    await connectDB();
    next();
  } catch (error) {
    console.error("❌ Database connection failed:", error);
    res.status(503).json({
      success: false,
      error: "Database connection unavailable",
      statusCode: 503,
    });
  }
});

app.use("/api/v1", UserRoute);
app.use("/api/v1/error-log", ErrorLogRouter);
app.use("/api/v1", FolderRouter);
app.use("/api/v1", ChapterRouter);
app.use("/api/v1/sse", sseRouter);
app.use("/api/v1", QuizRouter);
app.use("/api/v1", SummaryRouter);
app.use("/api/v1", MindmapRouter);
app.use("/api/v1", NoteRouter);
app.use("/api/v1", ShareRouter);
app.use("/api/v1", PdfRouter);
app.use("/api/v1", LiveChallengeRouter);
app.use("/api/v1", analysisRouter);
app.use("/api/v1", profileRouter);

import swaggerUi from "swagger-ui-express";
import swaggerSpec from "./config/swagger";
import ErrorLog from "./models/ErrorLogModel";

// Swagger JSON endpoint - under /api/v1 for Vercel compatibility
app.get("/api/v1/docs.json", (req, res) => {
  res.setHeader("Content-Type", "application/json");
  res.send(swaggerSpec);
});

// Swagger UI - mounted under /api/v1/docs for Vercel serverless compatibility
// This ensures proper routing through the serverless function
app.use("/api/v1/docs", swaggerUi.serve, swaggerUi.setup(swaggerSpec, {
  explorer: true,
  customCss: '.swagger-ui .topbar { display: none }',
  customSiteTitle: "TioNova API Documentation",
}));

app.use(
  (err: ICustomError, req: Request, res: Response, next: NextFunction) => {
    console.error("🔥 Error Middleware:", err);

    res.status(err.statuscode || 500).json({
      success: false,
      error: err.message || "Something went wrong",
      statusCode: err.statuscode || 500,
    });
  }
);

// For local development, connect immediately
if (!process.env.VERCEL) {
  connectDB().then(() => {
    app.listen(port, () => {
      console.log(`🚀 Server is running on http://localhost:${port}`);
    });
  }).catch((err) => {
    console.error("❌ Failed to start server:", err);
    process.exit(1);
  });
}

export default app;
