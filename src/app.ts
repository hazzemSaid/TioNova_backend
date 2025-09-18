import cors from "cors";
import * as dotenv from "dotenv";
import express, { NextFunction, Request, Response } from "express";
import morgan from "morgan";
import multer from "multer";
import swaggerUi from "swagger-ui-express";
import YAML from "yamljs";
import { connectDB } from "./database/mongodb";
import PdfRouter from "./routers/PdfRouter";
import UserRoute from "./routers/UserRouter";
import { ICustomError } from "./utils/error";
const path = require('path');

const upload = multer({ dest: "uploads/" });
const swaggerDocument = YAML.load("./openapi.yaml");
// Load env
const FormData = require("form-data");
dotenv.config();

const port = process.env.PORT || 3000;
const app = express();

app.use(morgan("dev"));
app.use(express.json());
app.use(express.static("static"));
app.use(
  cors({
    origin: [
      "http://localhost:5173",
      "https://localhost:5173",
      process.env.FRONTEND_URL || "https://tionova-frontend.onrender.com"
    ].filter(Boolean),
    credentials: true,
  })
);
app.use("/docs", swaggerUi.serve, swaggerUi.setup(swaggerDocument));

async function configureApp() {
  await connectDB();

  app.get("/", (req, res) => {
    res.send("Hello World!");
  });

  app.use("/api/v1", UserRoute);

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

  app.get("/api/v1/health", (req, res) => {
    return res.status(200).json({ status: "OK" });
  });
  app.use("/api/v1", PdfRouter);
  app.use((err: any, req: Request, res: Response, next: NextFunction) => {
    return res.status(err.statuscode || 500).json({
      success: false,
      message: err.message || "Something went wrong",
      data: err.data || null,
    });
  });
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
