import type { VercelRequest, VercelResponse } from "@vercel/node";
import app from "../src/app";

export default function handler(req: VercelRequest, res: VercelResponse) {
  // Delegate to Express app
  (app as any)(req, res);
}


