import { drizzle } from "drizzle-orm/libsql";
import { createClient } from "@libsql/client";
import * as schema from "../shared/schema";

const isVercel = process.env.VERCEL === "1";

// In production (Vercel), DATABASE_URL MUST be a remote Turso URL like:
// libsql://your-db-name.turso.io
// Using file:/tmp will be wiped on every cold start, causing auth failures.
if (isVercel && (!process.env.DATABASE_URL || process.env.DATABASE_URL.startsWith("file:"))) {
  console.error(
    "[FATAL] DATABASE_URL is not set to a remote Turso database URL on Vercel. " +
    "Local file databases are wiped on every cold start. " +
    "Create a free database at https://turso.tech and set DATABASE_URL and DATABASE_AUTH_TOKEN."
  );
}

const dbUrl = process.env.DATABASE_URL || "file:chat.db";

const client = createClient({
  url: dbUrl,
  authToken: process.env.DATABASE_AUTH_TOKEN,
});

export const db = drizzle(client, { schema });

// Auto-create tables on every startup (works for both local SQLite and remote Turso DB)
export async function initDb() {
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
