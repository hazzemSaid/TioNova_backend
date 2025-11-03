import cors from "cors";
import * as dotenv from "dotenv";
import express, { NextFunction, Request, Response } from "express";
import sse from "../api/sseRouter";
import { connectDB } from "./database/mongodb";
import analysisRouter from "./routers/analysisRouter";
import LiveChallengeRouter from "./routers/LiveChallengeRouter";
import PdfRouter from "./routers/PdfRouter";
import profileRouter from "./routers/profileRouter";
import UserRoute from "./routers/UserRouter";
import { ICustomError } from "./utils/error";
// Load env
dotenv.config();

const port = process.env.PORT || 3000;
const app = express();

app.use(express.json());
app.use(express.static("static"));
app.use(
  cors({
    origin: "*",
    credentials: true,
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
app.get("/api/v1/health", (req, res) => {
  return res.status(200).json({
    status: "OK",
    service: "TioNova API",
    version: "1.0.0",
    timestamp: new Date().toISOString()
  });
});

app.use("/api/v1", UserRoute);
app.use("/api/v1", PdfRouter);
app.use("/api/v1", LiveChallengeRouter);
app.use("/api/v1", analysisRouter);
app.use("/api/v1", profileRouter);
app.use("/api/v1", sse);

app.use(
  (err: ICustomError, req: Request, res: Response, next: NextFunction) => {
    console.error("🔥 Error Middleware:", err);

    res.status(err.statuscode || 500).json({
      success: false,
      message: err.message || "Something went wrong",
      data: err.data || null,
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
