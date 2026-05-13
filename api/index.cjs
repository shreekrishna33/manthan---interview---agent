// Vercel Serverless Entry — Plain CommonJS
// Uses @tursodatabase/serverless which is explicitly built for serverless/edge
// No streaming issues, no Web Streams API dependency, works on ALL Node.js versions

const express = require("express");
const jwt = require("jsonwebtoken");
const cookieParser = require("cookie-parser");
const { createClient } = require("@tursodatabase/serverless");

// ─── Database ─────────────────────────────────────────────────────────────────
const dbUrl = process.env.DATABASE_URL;
const dbToken = process.env.DATABASE_AUTH_TOKEN;

if (!dbUrl) {
  console.error("[FATAL] DATABASE_URL is not set!");
}

let _db = null;
function getDb() {
  if (!_db) {
    _db = createClient({ url: dbUrl, authToken: dbToken });
  }
  return _db;
}

async function initDb() {
  const db = getDb();
  await db.execute(`CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT NOT NULL UNIQUE, password TEXT NOT NULL)`);
  await db.execute(`CREATE TABLE IF NOT EXISTS conversations (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER REFERENCES users(id) ON DELETE CASCADE, title TEXT NOT NULL, created_at INTEGER DEFAULT (unixepoch()) NOT NULL)`);
  await db.execute(`CREATE TABLE IF NOT EXISTS messages (id INTEGER PRIMARY KEY AUTOINCREMENT, conversation_id INTEGER NOT NULL REFERENCES conversations(id) ON DELETE CASCADE, role TEXT NOT NULL, content TEXT NOT NULL, created_at INTEGER DEFAULT (unixepoch()) NOT NULL)`);
  console.log("[DB] Tables ready.");
}

// ─── AI (lazy) ────────────────────────────────────────────────────────────────
let _ai = null;
function getAI() {
  if (!_ai) {
    const { GoogleGenAI } = require("@google/genai");
    const key = process.env.AI_INTEGRATIONS_GEMINI_API_KEY;
    if (!key) throw new Error("AI_INTEGRATIONS_GEMINI_API_KEY is not set in Vercel environment variables.");
    _ai = new GoogleGenAI({ apiKey: key });
  }
  return _ai;
}

const SYSTEM_PROMPT = `You are Manthan, a super friendly, encouraging AI Interview Coach. Your default mode is INTERVIEWER.

MODES:
1. INTERVIEWER Mode (Default): Conduct mock interviews. Ask ONE question at a time. Give feedback.
2. ATTENDER Mode: Be a study buddy, provide questions AND answers.

COMMANDS: /mode interviewer, /mode attender, /start, /trending

RESPONSE FORMAT (MANDATORY):
<reasoning>[Your internal analysis]</reasoning>
<response>[Your friendly response to the user]</response>

Start by asking the user what role they are preparing for.`;

// ─── Express App ──────────────────────────────────────────────────────────────
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
      const db = getDb();
      const result = await db.execute({ sql: "SELECT * FROM users WHERE id = ? LIMIT 1", args: [decoded.id] });
      if (result.rows.length > 0) {
        req.user = { id: result.rows[0].id, username: result.rows[0].username };
        req.isAuthenticated = () => true;
      }
    } catch (_) {}
  }
  next();
});

// ─── Auth Routes ──────────────────────────────────────────────────────────────
app.post("/api/register", async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ message: "Username and password are required." });
    const db = getDb();
    const existing = await db.execute({ sql: "SELECT id FROM users WHERE username = ? LIMIT 1", args: [username] });
    if (existing.rows.length > 0) return res.status(400).json({ message: "Username already exists." });
    const inserted = await db.execute({ sql: "INSERT INTO users (username, password) VALUES (?, ?) RETURNING id, username", args: [username, password] });
    const user = inserted.rows[0];
    const token = jwt.sign({ id: user.id }, JWT_SECRET, { expiresIn: "7d" });
    res.cookie("auth_token", token, { httpOnly: true, maxAge: 7 * 24 * 60 * 60 * 1000, path: "/", secure: true, sameSite: "none" });
    return res.status(201).json({ id: user.id, username: user.username });
  } catch (err) {
    console.error("[/api/register]", err);
    return res.status(500).json({ message: String(err.message || err) });
  }
});

app.post("/api/login", async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ message: "Username and password are required." });
    const db = getDb();
    const result = await db.execute({ sql: "SELECT * FROM users WHERE username = ? LIMIT 1", args: [username] });
    const user = result.rows[0];
    if (!user || user.password !== password) return res.status(401).json({ message: "Incorrect username or password." });
    const token = jwt.sign({ id: user.id }, JWT_SECRET, { expiresIn: "7d" });
    res.cookie("auth_token", token, { httpOnly: true, maxAge: 7 * 24 * 60 * 60 * 1000, path: "/", secure: true, sameSite: "none" });
    return res.status(200).json({ id: user.id, username: user.username });
  } catch (err) {
    console.error("[/api/login]", err);
    return res.status(500).json({ message: String(err.message || err) });
  }
});

app.post("/api/logout", (req, res) => {
  res.clearCookie("auth_token", { path: "/" });
  res.sendStatus(200);
});

app.get("/api/user", (req, res) => {
  if (!req.isAuthenticated()) return res.sendStatus(401);
  res.json(req.user);
});

// ─── Health ───────────────────────────────────────────────────────────────────
app.get("/api/health", async (req, res) => {
  try {
    const db = getDb();
    await db.execute("SELECT 1");
    res.json({ status: "ok", db: dbUrl ? "remote" : "local", ts: new Date().toISOString() });
  } catch (err) {
    res.status(500).json({ status: "error", error: String(err.message || err) });
  }
});

// ─── Chat Routes ──────────────────────────────────────────────────────────────
app.get("/api/conversations", async (req, res) => {
  if (!req.isAuthenticated()) return res.sendStatus(401);
  try {
    const db = getDb();
    const result = await db.execute({ sql: "SELECT * FROM conversations WHERE user_id = ? ORDER BY created_at DESC", args: [req.user.id] });
    res.json(result.rows);
  } catch (err) { res.status(500).json({ error: String(err.message || err) }); }
});

app.get("/api/conversations/:id", async (req, res) => {
  if (!req.isAuthenticated()) return res.sendStatus(401);
  try {
    const db = getDb();
    const conv = await db.execute({ sql: "SELECT * FROM conversations WHERE id = ? AND user_id = ? LIMIT 1", args: [req.params.id, req.user.id] });
    if (!conv.rows.length) return res.status(404).json({ error: "Not found" });
    const msgs = await db.execute({ sql: "SELECT * FROM messages WHERE conversation_id = ? ORDER BY created_at ASC", args: [req.params.id] });
    res.json({ ...conv.rows[0], messages: msgs.rows });
  } catch (err) { res.status(500).json({ error: String(err.message || err) }); }
});

app.post("/api/conversations", async (req, res) => {
  if (!req.isAuthenticated()) return res.sendStatus(401);
  try {
    const db = getDb();
    const { title } = req.body;
    const conv = await db.execute({ sql: "INSERT INTO conversations (user_id, title) VALUES (?, ?) RETURNING *", args: [req.user.id, title || "New Chat"] });
    const convRow = conv.rows[0];
    const welcome = `Hi! I'm **Manthan**, your AI Interview Coach! 👋\n\nChoose a mode:\n\n**1. 👔 Interview Mode (Default)**\n\`/start\` - Begin mock interview\n\n**2. 📚 Study Mode**\n\`/mode attender\` - Get Q&A to study\n\`/trending\` - Top trending topics\n\nWhat role are you preparing for? 🚀`;
    await db.execute({ sql: "INSERT INTO messages (conversation_id, role, content) VALUES (?, ?, ?)", args: [convRow.id, "assistant", welcome] });
    res.status(201).json(convRow);
  } catch (err) { res.status(500).json({ error: String(err.message || err) }); }
});

app.delete("/api/conversations/:id", async (req, res) => {
  if (!req.isAuthenticated()) return res.sendStatus(401);
  try {
    const db = getDb();
    await db.execute({ sql: "DELETE FROM messages WHERE conversation_id = ?", args: [req.params.id] });
    await db.execute({ sql: "DELETE FROM conversations WHERE id = ? AND user_id = ?", args: [req.params.id, req.user.id] });
    res.status(204).send();
  } catch (err) { res.status(500).json({ error: String(err.message || err) }); }
});

app.post("/api/conversations/:id/messages", async (req, res) => {
  if (!req.isAuthenticated()) return res.sendStatus(401);
  try {
    const db = getDb();
    const { content } = req.body;
    const convId = req.params.id;
    await db.execute({ sql: "INSERT INTO messages (conversation_id, role, content) VALUES (?, ?, ?)", args: [convId, "user", content] });
    const allMsgs = await db.execute({ sql: "SELECT * FROM messages WHERE conversation_id = ? ORDER BY created_at ASC", args: [convId] });
    const chatHistory = allMsgs.rows.map((m) => ({
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: m.content }],
    }));
    if (chatHistory.length > 0 && chatHistory[0].role === "user") {
      chatHistory[0].parts[0].text = SYSTEM_PROMPT + "\n\n" + chatHistory[0].parts[0].text;
    }
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    const ai = getAI();
    const stream = await ai.models.generateContentStream({ model: "gemini-2.5-flash", contents: chatHistory });
    let fullResponse = "";
    for await (const chunk of stream) {
      const t = chunk.text;
      if (t) { fullResponse += t; res.write(`data: ${JSON.stringify({ content: t })}\n\n`); }
    }
    const match = fullResponse.match(/<response>([\s\S]*?)<\/response>/);
    const clean = match ? match[1].trim() : fullResponse;
    await db.execute({ sql: "INSERT INTO messages (conversation_id, role, content) VALUES (?, ?, ?)", args: [convId, "assistant", clean] });
    res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
    res.end();
  } catch (err) {
    console.error("[sendMessage]", err);
    if (!res.headersSent) res.status(500).json({ error: String(err.message || err) });
    else { res.write(`data: ${JSON.stringify({ error: "Failed to generate response." })}\n\n`); res.end(); }
  }
});

app.use((err, req, res, next) => {
  console.error("[Global Error]", err);
  res.status(err.status || 500).json({ message: err.message || "Internal Server Error" });
});

// ─── DB Init Guard ────────────────────────────────────────────────────────────
let dbReady = false;
let dbPromise = null;

function ensureDb() {
  if (dbReady) return Promise.resolve();
  if (!dbPromise) {
    dbPromise = initDb()
      .then(() => { dbReady = true; })
      .catch((err) => { console.error("[DB init failed]", err); dbPromise = null; throw err; });
  }
  return dbPromise;
}

module.exports = async function handler(req, res) {
  try { await ensureDb(); } catch (err) {
    return res.status(503).json({ message: "Database initialization failed: " + String(err.message || err) });
  }
  return app(req, res);
};
