import "dotenv/config";
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

export default app;
