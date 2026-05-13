// dotenv not needed on Vercel – env vars are injected natively
import express from "express";
import { registerRoutes } from "./routes";
import { createServer } from "http";
import { setupAuth } from "./auth";

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

const httpServer = createServer(app);

(async () => {
    try {
        setupAuth(app);
        await registerRoutes(httpServer, app);
    } catch (error) {
        console.error("Failed to register routes for Vercel:", error);
    }
})();

// Global error handler — return JSON instead of crashing
app.use((err: any, req: any, res: any, next: any) => {
    console.error("[Vercel Global Error]", err);
    res.status(err.status || 500).json({ message: err.message || "Internal Server Error" });
});

export default app;
