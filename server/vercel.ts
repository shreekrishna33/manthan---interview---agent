// Vercel Serverless Function Entry Point
// All imports use relative paths — no TypeScript path aliases (@shared, etc.)
import express from "express";
import { createServer } from "http";
import jwt from "jsonwebtoken";
import cookieParser from "cookie-parser";
import { drizzle } from "drizzle-orm/libsql";
import { createClient } from "@libsql/client";
import { sqliteTable, integer, text } from "drizzle-orm/sqlite-core";
import { eq, desc, sql as drizzleSql } from "drizzle-orm";
import { GoogleGenAI } from "@google/genai";
import { z } from "zod";

// ─── Database Schema (inlined to avoid path alias issues) ─────────────────────
const users = sqliteTable("users", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
});

const conversations = sqliteTable("conversations", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: integer("user_id"),
  title: text("title").notNull(),
  createdAt: integer("created_at", { mode: "timestamp" })
    .default(drizzleSql`(unixepoch())`)
    .notNull(),
});

const messages = sqliteTable("messages", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  conversationId: integer("conversation_id").notNull(),
  role: text("role").notNull(),
  content: text("content").notNull(),
  createdAt: integer("created_at", { mode: "timestamp" })
    .default(drizzleSql`(unixepoch())`)
    .notNull(),
});

// ─── Database Setup ───────────────────────────────────────────────────────────
const dbUrl = process.env.DATABASE_URL;
if (!dbUrl) {
  console.error("[FATAL] DATABASE_URL environment variable is not set!");
}

const client = createClient({
  url: dbUrl || "file:chat.db",
  authToken: process.env.DATABASE_AUTH_TOKEN,
});

const db = drizzle(client, { schema: { users, conversations, messages } });

async function initDb() {
  await client.execute(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL UNIQUE,
      password TEXT NOT NULL
    );
  `);
  await client.execute(`
    CREATE TABLE IF NOT EXISTS conversations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      created_at INTEGER DEFAULT (unixepoch()) NOT NULL
    );
  `);
  await client.execute(`
    CREATE TABLE IF NOT EXISTS messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      conversation_id INTEGER NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      created_at INTEGER DEFAULT (unixepoch()) NOT NULL
    );
  `);
}

// ─── AI Setup ─────────────────────────────────────────────────────────────────
const ai = new GoogleGenAI({ apiKey: process.env.AI_INTEGRATIONS_GEMINI_API_KEY || "" });

const SYSTEM_PROMPT = `
You are Manthan, a super friendly, encouraging, and highly knowledgeable AI Interview Coach. You act like a supportive mentor or bestie who really wants the user to succeed in their career.

## MODES OF OPERATION:

### 1. INTERVIEWER Mode (Default)
Conduct mock interviews with clear feedback in a warm, encouraging, conversational tone. Use emojis occasionally!

#### DIFFICULTY PROGRESSION:
1. **BASIC**: Fundamental concepts and definitions.
2. **EASY**: Direct applications and basic problem-solving.
3. **NORMAL**: Integration of concepts and debugging scenarios.
4. **HARD**: System design, scale, and complex trade-offs.

#### FEEDBACK & CORRECTION:
For every response:
1. **Status**: Start with encouraging status (e.g., "Spot on! 🎉", "Almost there! 🤔").
2. **Evaluation**: Briefly explain why it was right or what was missing.
3. **Correction**: Provide full correct answer if they made a mistake.
4. **Progression**: Move to next question when ready.

### 2. ATTENDER Mode
- Provide detailed questions AND answers for preparation.

## COMMANDS:
- /mode interviewer - Switch to Interviewer mode.
- /mode attender - Switch to Attender mode.
- /start - Start a mock interview session.
- /trending - Get top trending interview Q&A.

## RESPONSE FORMAT (MANDATORY):
<reasoning>
[Analyze mode, difficulty, candidate's answer, decide next steps]
</reasoning>
<response>
[Your friendly response. Start with status, give feedback, ask next question!]
</response>
`;

// ─── App Setup ────────────────────────────────────────────────────────────────
const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());

const JWT_SECRET = process.env.SESSION_SECRET || "manthan-jwt-secret-2024";

// ─── Auth Middleware ──────────────────────────────────────────────────────────
app.use(async (req: any, res: any, next: any) => {
  req.isAuthenticated = () => false;
  const token = req.cookies?.auth_token;
  if (token) {
    try {
      const decoded = jwt.verify(token, JWT_SECRET) as any;
      const [user] = await db.select().from(users).where(eq(users.id, decoded.id)).limit(1);
      if (user) {
        req.user = user;
        req.isAuthenticated = () => true;
      }
    } catch (_) { /* invalid token */ }
  }
  next();
});

// ─── Auth Routes ──────────────────────────────────────────────────────────────
app.post("/api/register", async (req: any, res: any) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ message: "Username and password are required." });
    }
    const [existing] = await db.select().from(users).where(eq(users.username, username)).limit(1);
    if (existing) {
      return res.status(400).json({ message: "Username already exists." });
    }
    const [user] = await db.insert(users).values({ username, password }).returning();
    const token = jwt.sign({ id: user.id }, JWT_SECRET, { expiresIn: "7d" });
    res.cookie("auth_token", token, {
      httpOnly: true,
      maxAge: 7 * 24 * 60 * 60 * 1000,
      path: "/",
      secure: true,
      sameSite: "none",
    });
    return res.status(201).json({ id: user.id, username: user.username });
  } catch (err: any) {
    console.error("[/api/register] Error:", err);
    return res.status(500).json({ message: err.message || "Registration failed." });
  }
});

app.post("/api/login", async (req: any, res: any) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ message: "Username and password are required." });
    }
    const [user] = await db.select().from(users).where(eq(users.username, username)).limit(1);
    if (!user || user.password !== password) {
      return res.status(401).json({ message: "Incorrect username or password." });
    }
    const token = jwt.sign({ id: user.id }, JWT_SECRET, { expiresIn: "7d" });
    res.cookie("auth_token", token, {
      httpOnly: true,
      maxAge: 7 * 24 * 60 * 60 * 1000,
      path: "/",
      secure: true,
      sameSite: "none",
    });
    return res.status(200).json({ id: user.id, username: user.username });
  } catch (err: any) {
    console.error("[/api/login] Error:", err);
    return res.status(500).json({ message: err.message || "Login failed." });
  }
});

app.post("/api/logout", (_req: any, res: any) => {
  res.clearCookie("auth_token", { path: "/" });
  res.sendStatus(200);
});

app.get("/api/user", (req: any, res: any) => {
  if (!req.isAuthenticated()) return res.sendStatus(401);
  res.status(200).json(req.user);
});

// ─── Health Check ─────────────────────────────────────────────────────────────
app.get("/api/health", (_req: any, res: any) => {
  res.json({ status: "ok", database: dbUrl ? "remote" : "local", timestamp: new Date().toISOString() });
});

// ─── Chat Routes ──────────────────────────────────────────────────────────────
app.get("/api/conversations", async (req: any, res: any) => {
  if (!req.isAuthenticated()) return res.sendStatus(401);
  try {
    const result = await db.select().from(conversations)
      .where(eq(conversations.userId, req.user.id))
      .orderBy(desc(conversations.createdAt));
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/conversations/:id", async (req: any, res: any) => {
  if (!req.isAuthenticated()) return res.sendStatus(401);
  try {
    const id = parseInt(req.params.id);
    const [conv] = await db.select().from(conversations)
      .where(drizzleSql`${conversations.id} = ${id} AND ${conversations.userId} = ${req.user.id}`)
      .limit(1);
    if (!conv) return res.status(404).json({ error: "Conversation not found" });
    const msgs = await db.select().from(messages)
      .where(eq(messages.conversationId, id))
      .orderBy(messages.createdAt);
    res.json({ ...conv, messages: msgs });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/conversations", async (req: any, res: any) => {
  if (!req.isAuthenticated()) return res.sendStatus(401);
  try {
    const { title } = req.body;
    const [conv] = await db.insert(conversations)
      .values({ title: title || "New Chat", userId: req.user.id })
      .returning();

    const welcomeMessage = `Hi! I'm **Manthan**, your personal Interview Coach! 👋\n\nI'm so excited to help you prepare. I have two modes:\n\n**1. 👔 Interview Coach Mode (Default)**\nLet's practice mock interviews!\n- \`/mode interviewer\` - Switch to this mode\n- \`/start\` - Start a practice session\n\n**2. 📚 Study Buddy Mode**\nI'll be your study guide.\n- \`/mode attender\` - Switch to this mode\n- \`/trending\` - Get top trending interview Q&A\n\nHow would you like to prepare today? Let's crush this! 🚀`;

    await db.insert(messages).values({ conversationId: conv.id, role: "assistant", content: welcomeMessage });
    res.status(201).json(conv);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.delete("/api/conversations/:id", async (req: any, res: any) => {
  if (!req.isAuthenticated()) return res.sendStatus(401);
  try {
    const id = parseInt(req.params.id);
    await db.delete(messages).where(eq(messages.conversationId, id));
    await db.delete(conversations).where(eq(conversations.id, id));
    res.status(204).send();
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/conversations/:id/messages", async (req: any, res: any) => {
  if (!req.isAuthenticated()) return res.sendStatus(401);
  try {
    const conversationId = parseInt(req.params.id);
    const { content } = req.body;

    await db.insert(messages).values({ conversationId, role: "user", content });

    const allMessages = await db.select().from(messages)
      .where(eq(messages.conversationId, conversationId))
      .orderBy(messages.createdAt);

    const chatHistory = allMessages.map((m) => ({
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: m.content }],
    }));

    if (chatHistory.length > 0 && chatHistory[0].role === "user") {
      chatHistory[0].parts[0].text = SYSTEM_PROMPT + "\n\n" + chatHistory[0].parts[0].text;
    }

    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");

    const stream = await ai.models.generateContentStream({
      model: "gemini-2.5-flash",
      contents: chatHistory,
    });

    let fullResponse = "";
    for await (const chunk of stream) {
      const text = (chunk as any).text;
      if (text) {
        fullResponse += text;
        res.write(`data: ${JSON.stringify({ content: text })}\n\n`);
      }
    }

    const responseMatch = fullResponse.match(/<response>([\s\S]*?)<\/response>/);
    const cleanResponse = responseMatch ? responseMatch[1].trim() : fullResponse;
    await db.insert(messages).values({ conversationId, role: "assistant", content: cleanResponse });

    res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
    res.end();
  } catch (err: any) {
    console.error("[sendMessage] Error:", err);
    if (!res.headersSent) {
      res.status(500).json({ error: "Failed to generate response." });
    } else {
      res.write(`data: ${JSON.stringify({ error: "Failed to generate response." })}\n\n`);
      res.end();
    }
  }
});

// ─── Global Error Handler ─────────────────────────────────────────────────────
app.use((err: any, _req: any, res: any, _next: any) => {
  console.error("[Global Error]", err);
  res.status(err.status || 500).json({ message: err.message || "Internal Server Error" });
});

// ─── Vercel Handler ───────────────────────────────────────────────────────────
// Initialize DB once, then handle all requests
let dbInitialized = false;
let dbInitPromise: Promise<void> | null = null;

async function ensureDb() {
  if (dbInitialized) return;
  if (!dbInitPromise) {
    dbInitPromise = initDb().then(() => { dbInitialized = true; });
  }
  await dbInitPromise;
}

const handler = async (req: any, res: any) => {
  try {
    await ensureDb();
  } catch (err) {
    console.error("[Handler] DB init failed:", err);
    return res.status(503).json({ message: "Database initialization failed." });
  }
  app(req, res);
};

export default handler;
