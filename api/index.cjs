// Vercel Serverless Entry — Plain CommonJS JavaScript (no TypeScript compilation needed)
// This file is committed directly to avoid ALL module resolution issues on Vercel.

const express = require("express");
const jwt = require("jsonwebtoken");
const cookieParser = require("cookie-parser");
const { drizzle } = require("drizzle-orm/libsql");
const { createClient } = require("@libsql/client");
const { sqliteTable, integer, text } = require("drizzle-orm/sqlite-core");
const { eq, desc, sql: drizzleSql } = require("drizzle-orm");
const { GoogleGenAI } = require("@google/genai");

// ─── Schema ───────────────────────────────────────────────────────────────────
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

// ─── Database ─────────────────────────────────────────────────────────────────
const dbUrl = process.env.DATABASE_URL;
if (!dbUrl) {
  console.error("[FATAL] DATABASE_URL is not set! Set it to your Turso database URL in Vercel env vars.");
}

const client = createClient({
  url: dbUrl || "file:chat.db",
  authToken: process.env.DATABASE_AUTH_TOKEN,
});

const db = drizzle(client, { schema: { users, conversations, messages } });

async function initDb() {
  await client.execute(`CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT NOT NULL UNIQUE, password TEXT NOT NULL);`);
  await client.execute(`CREATE TABLE IF NOT EXISTS conversations (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER REFERENCES users(id) ON DELETE CASCADE, title TEXT NOT NULL, created_at INTEGER DEFAULT (unixepoch()) NOT NULL);`);
  await client.execute(`CREATE TABLE IF NOT EXISTS messages (id INTEGER PRIMARY KEY AUTOINCREMENT, conversation_id INTEGER NOT NULL REFERENCES conversations(id) ON DELETE CASCADE, role TEXT NOT NULL, content TEXT NOT NULL, created_at INTEGER DEFAULT (unixepoch()) NOT NULL);`);
  console.log("[DB] Tables initialized.");
}

// ─── AI ───────────────────────────────────────────────────────────────────────
const ai = new GoogleGenAI({ apiKey: process.env.AI_INTEGRATIONS_GEMINI_API_KEY || "" });

const SYSTEM_PROMPT = `You are Manthan, a super friendly, encouraging AI Interview Coach. Your default mode is INTERVIEWER.

MODES:
1. INTERVIEWER Mode (Default): Conduct mock interviews. Ask ONE question at a time. Give feedback.
2. ATTENDER Mode: Be a study buddy, provide questions AND answers.

COMMANDS: /mode interviewer, /mode attender, /start, /trending

RESPONSE FORMAT (MANDATORY):
<reasoning>[Your internal analysis]</reasoning>
<response>[Your friendly response to the user]</response>

Start by asking the user what role they are preparing for.`;

// ─── App ──────────────────────────────────────────────────────────────────────
const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());

const JWT_SECRET = process.env.SESSION_SECRET || "manthan-jwt-secret-2024";

// Auth middleware
app.use(async (req, res, next) => {
  req.isAuthenticated = () => false;
  const token = req.cookies && req.cookies.auth_token;
  if (token) {
    try {
      const decoded = jwt.verify(token, JWT_SECRET);
      const result = await db.select().from(users).where(eq(users.id, decoded.id)).limit(1);
      if (result.length > 0) {
        req.user = result[0];
        req.isAuthenticated = () => true;
      }
    } catch (_) {}
  }
  next();
});

// Register
app.post("/api/register", async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ message: "Username and password are required." });
    const existing = await db.select().from(users).where(eq(users.username, username)).limit(1);
    if (existing.length > 0) return res.status(400).json({ message: "Username already exists." });
    const inserted = await db.insert(users).values({ username, password }).returning();
    const user = inserted[0];
    const token = jwt.sign({ id: user.id }, JWT_SECRET, { expiresIn: "7d" });
    res.cookie("auth_token", token, { httpOnly: true, maxAge: 7 * 24 * 60 * 60 * 1000, path: "/", secure: true, sameSite: "none" });
    return res.status(201).json({ id: user.id, username: user.username });
  } catch (err) {
    console.error("[/api/register]", err);
    return res.status(500).json({ message: String(err.message || err) });
  }
});

// Login
app.post("/api/login", async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ message: "Username and password are required." });
    const result = await db.select().from(users).where(eq(users.username, username)).limit(1);
    const user = result[0];
    if (!user || user.password !== password) return res.status(401).json({ message: "Incorrect username or password." });
    const token = jwt.sign({ id: user.id }, JWT_SECRET, { expiresIn: "7d" });
    res.cookie("auth_token", token, { httpOnly: true, maxAge: 7 * 24 * 60 * 60 * 1000, path: "/", secure: true, sameSite: "none" });
    return res.status(200).json({ id: user.id, username: user.username });
  } catch (err) {
    console.error("[/api/login]", err);
    return res.status(500).json({ message: String(err.message || err) });
  }
});

// Logout
app.post("/api/logout", (req, res) => {
  res.clearCookie("auth_token", { path: "/" });
  res.sendStatus(200);
});

// Get user
app.get("/api/user", (req, res) => {
  if (!req.isAuthenticated()) return res.sendStatus(401);
  res.json(req.user);
});

// Health
app.get("/api/health", async (req, res) => {
  try {
    await client.execute("SELECT 1");
    res.json({ status: "ok", db: dbUrl ? "remote" : "local", ts: new Date().toISOString() });
  } catch (err) {
    res.status(500).json({ status: "error", error: String(err.message || err) });
  }
});

// List conversations
app.get("/api/conversations", async (req, res) => {
  if (!req.isAuthenticated()) return res.sendStatus(401);
  try {
    const result = await db.select().from(conversations)
      .where(eq(conversations.userId, req.user.id))
      .orderBy(desc(conversations.createdAt));
    res.json(result);
  } catch (err) { res.status(500).json({ error: String(err.message || err) }); }
});

// Get conversation
app.get("/api/conversations/:id", async (req, res) => {
  if (!req.isAuthenticated()) return res.sendStatus(401);
  try {
    const id = parseInt(req.params.id);
    const convResult = await db.select().from(conversations)
      .where(drizzleSql`${conversations.id} = ${id} AND ${conversations.userId} = ${req.user.id}`)
      .limit(1);
    if (!convResult.length) return res.status(404).json({ error: "Not found" });
    const msgs = await db.select().from(messages).where(eq(messages.conversationId, id)).orderBy(messages.createdAt);
    res.json({ ...convResult[0], messages: msgs });
  } catch (err) { res.status(500).json({ error: String(err.message || err) }); }
});

// Create conversation
app.post("/api/conversations", async (req, res) => {
  if (!req.isAuthenticated()) return res.sendStatus(401);
  try {
    const { title } = req.body;
    const conv = await db.insert(conversations).values({ title: title || "New Chat", userId: req.user.id }).returning();
    const welcome = `Hi! I'm **Manthan**, your AI Interview Coach! 👋\n\nChoose a mode:\n\n**1. 👔 Interview Mode (Default)**\n\`/start\` - Begin mock interview\n\n**2. 📚 Study Mode**\n\`/mode attender\` - Get Q&A to study\n\`/trending\` - Top trending topics\n\nWhat role are you preparing for? 🚀`;
    await db.insert(messages).values({ conversationId: conv[0].id, role: "assistant", content: welcome });
    res.status(201).json(conv[0]);
  } catch (err) { res.status(500).json({ error: String(err.message || err) }); }
});

// Delete conversation
app.delete("/api/conversations/:id", async (req, res) => {
  if (!req.isAuthenticated()) return res.sendStatus(401);
  try {
    const id = parseInt(req.params.id);
    await db.delete(messages).where(eq(messages.conversationId, id));
    await db.delete(conversations).where(eq(conversations.id, id));
    res.status(204).send();
  } catch (err) { res.status(500).json({ error: String(err.message || err) }); }
});

// Send message (SSE)
app.post("/api/conversations/:id/messages", async (req, res) => {
  if (!req.isAuthenticated()) return res.sendStatus(401);
  try {
    const conversationId = parseInt(req.params.id);
    const { content } = req.body;
    await db.insert(messages).values({ conversationId, role: "user", content });
    const allMsgs = await db.select().from(messages).where(eq(messages.conversationId, conversationId)).orderBy(messages.createdAt);
    const chatHistory = allMsgs.map((m) => ({
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: m.content }],
    }));
    if (chatHistory.length > 0 && chatHistory[0].role === "user") {
      chatHistory[0].parts[0].text = SYSTEM_PROMPT + "\n\n" + chatHistory[0].parts[0].text;
    }
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    const stream = await ai.models.generateContentStream({ model: "gemini-2.5-flash", contents: chatHistory });
    let fullResponse = "";
    for await (const chunk of stream) {
      const t = chunk.text;
      if (t) { fullResponse += t; res.write(`data: ${JSON.stringify({ content: t })}\n\n`); }
    }
    const match = fullResponse.match(/<response>([\s\S]*?)<\/response>/);
    const clean = match ? match[1].trim() : fullResponse;
    await db.insert(messages).values({ conversationId, role: "assistant", content: clean });
    res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
    res.end();
  } catch (err) {
    console.error("[sendMessage]", err);
    if (!res.headersSent) res.status(500).json({ error: String(err.message || err) });
    else { res.write(`data: ${JSON.stringify({ error: "Failed to generate response." })}\n\n`); res.end(); }
  }
});

// Error handler
app.use((err, req, res, next) => {
  console.error("[Global Error]", err);
  res.status(err.status || 500).json({ message: err.message || "Internal Server Error" });
});

// ─── DB init guard ────────────────────────────────────────────────────────────
let dbReady = false;
let dbPromise = null;

function ensureDb() {
  if (dbReady) return Promise.resolve();
  if (!dbPromise) dbPromise = initDb().then(() => { dbReady = true; }).catch((err) => { console.error("[DB init failed]", err); dbPromise = null; throw err; });
  return dbPromise;
}

// Export as CommonJS
module.exports = async function handler(req, res) {
  try { await ensureDb(); } catch (err) {
    return res.status(503).json({ message: "Database initialization failed: " + String(err.message || err) });
  }
  return app(req, res);
};
