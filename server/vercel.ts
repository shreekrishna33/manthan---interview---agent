// Vercel serverless entry point
// dotenv is NOT needed here — Vercel injects env vars natively
import express from "express";
import { registerRoutes } from "./routes";
import { createServer } from "http";
import { setupAuth } from "./auth";
import { initDb } from "./db";

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

// Use a promise-based ready guard so concurrent cold-start requests all wait
// for initialization to complete rather than racing.
let isReady = false;
const readyPromise: Promise<void> = (async () => {
  try {
    // 1. Initialize DB schema (creates tables if they don't exist)
    await initDb();
    // 2. Set up JWT auth middleware and auth routes
    setupAuth(app);
    // 3. Register all API routes
    const httpServer = createServer(app);
    await registerRoutes(httpServer, app);
    isReady = true;
    console.log("[Vercel] Server initialized successfully.");
  } catch (error) {
    console.error("[Vercel] FATAL: Failed to initialize server:", error);
    // Don't set isReady — every request will return 503
  }
})();

// Global error handler — return JSON instead of crashing
app.use((err: any, req: any, res: any, next: any) => {
  console.error("[Vercel Global Error]", err);
  res.status(err.status || 500).json({ message: err.message || "Internal Server Error" });
});

// Wrap the app to ensure initialization is complete before handling any request
const handler = async (req: any, res: any) => {
  await readyPromise;
  if (!isReady) {
    return res.status(503).json({ message: "Server initialization failed. Check server logs." });
  }
  app(req, res);
};

export default handler;
