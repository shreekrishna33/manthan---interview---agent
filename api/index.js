// api/index.js — Vercel serverless handler
// api/package.json sets "type":"commonjs" so require() works here
"use strict";

const express = require("express");
const jwt = require("jsonwebtoken");
const cookieParser = require("cookie-parser");
const { connect } = require("@tursodatabase/serverless");

// ─── DB ───────────────────────────────────────────────────────────────────────
const dbUrl   = process.env.DATABASE_URL;
const dbToken = process.env.DATABASE_AUTH_TOKEN;

let _db = null;
function getDb() {
  if (!_db) _db = connect({ url: dbUrl, authToken: dbToken });
  return _db;
}

async function initDb() {
  const db = getDb();
  await db.execute("CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT NOT NULL UNIQUE, password TEXT NOT NULL)");
  await db.execute("CREATE TABLE IF NOT EXISTS conversations (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER REFERENCES users(id) ON DELETE CASCADE, title TEXT NOT NULL, created_at INTEGER DEFAULT (unixepoch()) NOT NULL)");
  await db.execute("CREATE TABLE IF NOT EXISTS messages (id INTEGER PRIMARY KEY AUTOINCREMENT, conversation_id INTEGER NOT NULL REFERENCES conversations(id) ON DELETE CASCADE, role TEXT NOT NULL, content TEXT NOT NULL, created_at INTEGER DEFAULT (unixepoch()) NOT NULL)");
}

// ─── AI (lazy) ────────────────────────────────────────────────────────────────
let _ai = null;
function getAI() {
  if (!_ai) {
    const { GoogleGenAI } = require("@google/genai");
    const key = process.env.AI_INTEGRATIONS_GEMINI_API_KEY;
    if (!key) throw new Error("AI_INTEGRATIONS_GEMINI_API_KEY is not set.");
    _ai = new GoogleGenAI({ apiKey: key });
  }
  return _ai;
}

const SYSTEM_PROMPT = `You are Manthan, a super friendly AI Interview Coach. Default mode: INTERVIEWER.

MODES:
1. INTERVIEWER (Default): Conduct mock interviews, ask ONE question at a time, give feedback.
2. ATTENDER: Study buddy — give questions AND answers.

COMMANDS: /mode interviewer, /mode attender, /start, /trending

MANDATORY RESPONSE FORMAT:
<reasoning>[internal analysis]</reasoning>
<response>[your reply to the user]</response>

Start by asking what role they are preparing for.`;

// ─── Express ──────────────────────────────────────────────────────────────────
const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());

const JWT_SECRET = process.env.SESSION_SECRET || "manthan-secret-2024";

// Auth middleware
app.use(async (req, res, next) => {
  req.isAuthenticated = () => false;
  const token = req.cookies && req.cookies.auth_token;
  if (token) {
    try {
      const decoded = jwt.verify(token, JWT_SECRET);
      const r = await getDb().execute({ sql: "SELECT id, username FROM users WHERE id = ? LIMIT 1", args: [decoded.id] });
      if (r.rows.length) { req.user = r.rows[0]; req.isAuthenticated = () => true; }
    } catch (_) {}
  }
  next();
});

// Register
app.post("/api/register", async (req, res) => {
  try {
    const { username, password } = req.body || {};
    if (!username || !password) return res.status(400).json({ message: "Username and password required." });
    const exists = await getDb().execute({ sql: "SELECT id FROM users WHERE username = ? LIMIT 1", args: [username] });
    if (exists.rows.length) return res.status(400).json({ message: "Username already exists." });
    const ins = await getDb().execute({ sql: "INSERT INTO users (username, password) VALUES (?, ?) RETURNING id, username", args: [username, password] });
    const user = ins.rows[0];
    const token = jwt.sign({ id: user.id }, JWT_SECRET, { expiresIn: "7d" });
    res.cookie("auth_token", token, { httpOnly: true, maxAge: 604800000, path: "/", secure: true, sameSite: "none" });
    return res.status(201).json({ id: user.id, username: user.username });
  } catch (e) { console.error("[register]", e); return res.status(500).json({ message: String(e.message) }); }
});

// Login
app.post("/api/login", async (req, res) => {
  try {
    const { username, password } = req.body || {};
    if (!username || !password) return res.status(400).json({ message: "Username and password required." });
    const r = await getDb().execute({ sql: "SELECT * FROM users WHERE username = ? LIMIT 1", args: [username] });
    const user = r.rows[0];
    if (!user || user.password !== password) return res.status(401).json({ message: "Incorrect username or password." });
    const token = jwt.sign({ id: user.id }, JWT_SECRET, { expiresIn: "7d" });
    res.cookie("auth_token", token, { httpOnly: true, maxAge: 604800000, path: "/", secure: true, sameSite: "none" });
    return res.status(200).json({ id: user.id, username: user.username });
  } catch (e) { console.error("[login]", e); return res.status(500).json({ message: String(e.message) }); }
});

app.post("/api/logout", (req, res) => { res.clearCookie("auth_token", { path: "/" }); res.sendStatus(200); });

app.get("/api/user", (req, res) => {
  if (!req.isAuthenticated()) return res.sendStatus(401);
  res.json(req.user);
});

app.get("/api/health", async (req, res) => {
  try {
    await getDb().execute("SELECT 1");
    res.json({ status: "ok", db: dbUrl ? "remote" : "local", ts: new Date().toISOString() });
  } catch (e) { res.status(500).json({ status: "error", error: String(e.message) }); }
});

// Conversations
app.get("/api/conversations", async (req, res) => {
  if (!req.isAuthenticated()) return res.sendStatus(401);
  try {
    const r = await getDb().execute({ sql: "SELECT * FROM conversations WHERE user_id = ? ORDER BY created_at DESC", args: [req.user.id] });
    res.json(r.rows);
  } catch (e) { res.status(500).json({ error: String(e.message) }); }
});

app.get("/api/conversations/:id", async (req, res) => {
  if (!req.isAuthenticated()) return res.sendStatus(401);
  try {
    const c = await getDb().execute({ sql: "SELECT * FROM conversations WHERE id = ? AND user_id = ? LIMIT 1", args: [req.params.id, req.user.id] });
    if (!c.rows.length) return res.status(404).json({ error: "Not found" });
    const m = await getDb().execute({ sql: "SELECT * FROM messages WHERE conversation_id = ? ORDER BY created_at ASC", args: [req.params.id] });
    res.json({ ...c.rows[0], messages: m.rows });
  } catch (e) { res.status(500).json({ error: String(e.message) }); }
});

app.post("/api/conversations", async (req, res) => {
  if (!req.isAuthenticated()) return res.sendStatus(401);
  try {
    const title = (req.body && req.body.title) || "New Chat";
    const c = await getDb().execute({ sql: "INSERT INTO conversations (user_id, title) VALUES (?, ?) RETURNING *", args: [req.user.id, title] });
    const conv = c.rows[0];
    const welcome = "Hi! I'm **Manthan**, your AI Interview Coach! 👋\n\n**Modes:**\n- `/start` — Begin mock interview\n- `/mode attender` — Study mode\n- `/trending` — Top interview Q&A\n\nWhat role are you preparing for? 🚀";
    await getDb().execute({ sql: "INSERT INTO messages (conversation_id, role, content) VALUES (?, ?, ?)", args: [conv.id, "assistant", welcome] });
    res.status(201).json(conv);
  } catch (e) { res.status(500).json({ error: String(e.message) }); }
});

app.delete("/api/conversations/:id", async (req, res) => {
  if (!req.isAuthenticated()) return res.sendStatus(401);
  try {
    await getDb().execute({ sql: "DELETE FROM messages WHERE conversation_id = ?", args: [req.params.id] });
    await getDb().execute({ sql: "DELETE FROM conversations WHERE id = ? AND user_id = ?", args: [req.params.id, req.user.id] });
    res.status(204).send();
  } catch (e) { res.status(500).json({ error: String(e.message) }); }
});

// Chat (SSE stream)
app.post("/api/conversations/:id/messages", async (req, res) => {
  if (!req.isAuthenticated()) return res.sendStatus(401);
  try {
    const cid = req.params.id;
    const content = req.body && req.body.content;
    await getDb().execute({ sql: "INSERT INTO messages (conversation_id, role, content) VALUES (?, ?, ?)", args: [cid, "user", content] });
    const msgs = await getDb().execute({ sql: "SELECT * FROM messages WHERE conversation_id = ? ORDER BY created_at ASC", args: [cid] });
    const history = msgs.rows.map((m) => ({ role: m.role === "assistant" ? "model" : "user", parts: [{ text: m.content }] }));
    if (history.length && history[0].role === "user") history[0].parts[0].text = SYSTEM_PROMPT + "\n\n" + history[0].parts[0].text;
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    const stream = await getAI().models.generateContentStream({ model: "gemini-2.5-flash", contents: history });
    let full = "";
    for await (const chunk of stream) { const t = chunk.text; if (t) { full += t; res.write(`data: ${JSON.stringify({ content: t })}\n\n`); } }
    const match = full.match(/<response>([\s\S]*?)<\/response>/);
    const clean = match ? match[1].trim() : full;
    await getDb().execute({ sql: "INSERT INTO messages (conversation_id, role, content) VALUES (?, ?, ?)", args: [cid, "assistant", clean] });
    res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
    res.end();
  } catch (e) {
    console.error("[chat]", e);
    if (!res.headersSent) res.status(500).json({ error: String(e.message) });
    else { res.write(`data: ${JSON.stringify({ error: "Failed." })}\n\n`); res.end(); }
  }
});

app.use((err, req, res, next) => { res.status(err.status || 500).json({ message: err.message || "Error" }); });

// ─── DB init guard ────────────────────────────────────────────────────────────
let ready = false, initPromise = null;
function ensureDb() {
  if (ready) return Promise.resolve();
  if (!initPromise) initPromise = initDb().then(() => { ready = true; }).catch((e) => { initPromise = null; throw e; });
  return initPromise;
}

module.exports = async function handler(req, res) {
  try { await ensureDb(); }
  catch (e) { return res.status(503).json({ message: "Database initialization failed: " + String(e.message) }); }
  return app(req, res);
};
