import cors from "cors";
import * as dotenv from "dotenv";
import express, { NextFunction, Request, Response } from "express";
import morgan from "morgan";
import sseRouter from "../api/sseRouter";
import { connectDB } from "./database/mongodb";
import analysisRouter from "./routers/analysisRouter";
import ChapterRouter from "./routers/ChapterRouter";
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
morgan.token("body", (req: any) => JSON.stringify(req.body));
app.use(
  morgan(":method :url :status :response-time ms - :body", {
    skip: (req, res) => res.statusCode < 400,
  })
);
app.use(express.json());
app.use(express.static("static"));
app.use(
  cors({
    origin: "*", // Or specific origins like ['https://tionova.web.app', 'http://localhost:3000']
    methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "Accept"],
    credentials: true,
  })
);

// Manually handle OPTIONS preflight
app.options(/.*/, (req, res) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, PATCH, OPTIONS");
  res.header("Access-Control-Allow-Headers", "Content-Type, Authorization, Accept");
  res.sendStatus(204);
});

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
app.get("/api/v1/health", (req, res) => {
  return res.status(200).json({
    status: "OK",
    service: "TioNova API",
    version: "1.0.0",
    timestamp: new Date().toISOString()
  });
});

app.use("/api/v1", UserRoute);
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

// Swagger JSON endpoint - under /api/v1 for Vercel compatibility
app.get("/api/v1/docs.json", cors(), (req, res) => {
  res.setHeader("Content-Type", "application/json");
  res.send(swaggerSpec);
});

// Swagger UI - mounted under /api/v1/docs for Vercel serverless compatibility
// This ensures proper routing through the serverless function
app.use("/api/v1/docs", cors(), swaggerUi.serve, swaggerUi.setup(swaggerSpec, {
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

async function configureApp() {
  await connectDB();
}

if (process.env.VERCEL) {
  // On Vercel, we export the configured app without listening
  configureApp().catch((err) => console.error("❌ Failed to configure app:", err));
} else {
  configureApp().then(() => {
    app.listen(port, () => {
      console.log(`🚀 Server is running on http://localhost:${port}`);
    });
  }).catch((err) => {
    console.error("❌ Failed to start server:", err);
  });
}

export default app;
