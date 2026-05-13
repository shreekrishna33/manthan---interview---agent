import { Express } from "express";
import jwt from "jsonwebtoken";
import cookieParser from "cookie-parser";
import { db } from "./db";
import { users } from "../shared/models/user";
import { eq } from "drizzle-orm";

const JWT_SECRET = process.env.SESSION_SECRET || "super-secret-key-1234";

export function setupAuth(app: Express) {
  app.use(cookieParser());

  // Middleware to attach user to req and mock passport's req.isAuthenticated
  app.use(async (req, res, next) => {
    (req as any).isAuthenticated = () => false;
    const token = req.cookies.auth_token;
    
    if (token) {
      try {
        const decoded = jwt.verify(token, JWT_SECRET) as any;
        let [user] = await db.select().from(users).where(eq(users.id, decoded.id)).limit(1);
        
        // If the database was wiped (Vercel ephemeral storage), re-create a dummy user
        if (!user && !process.env.DATABASE_URL) {
           const [newUser] = await db.insert(users).values({ 
             username: `user_${decoded.id}`, 
             password: 'ephemeral_password' 
           }).returning();
           user = newUser;
        }

        if (user) {
          (req as any).user = user;
          (req as any).isAuthenticated = () => true;
        }
      } catch (err) {
        // invalid token
      }
    }
    next();
  });

  app.post("/api/register", async (req, res, next) => {
    try {
      const { username, password } = req.body;
      const [existingUser] = await db.select().from(users).where(eq(users.username, username)).limit(1);
      
      if (existingUser) {
        return res.status(400).json({ message: "Username already exists" });
      }

      const [user] = await db.insert(users).values({ username, password }).returning();
      
      const token = jwt.sign({ id: user.id }, JWT_SECRET, { expiresIn: '7d' });
      res.cookie('auth_token', token, { 
        httpOnly: true, 
        maxAge: 7 * 24 * 60 * 60 * 1000,
        path: '/',
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax'
      });
      res.status(201).json(user);
    } catch (err) {
      next(err);
    }
  });

  app.post("/api/login", async (req, res, next) => {
    try {
      const { username, password } = req.body;
      let [user] = await db.select().from(users).where(eq(users.username, username)).limit(1);
      
      // If the database was wiped (Vercel ephemeral storage), auto-register them
      if (!user && !process.env.DATABASE_URL) {
        const [newUser] = await db.insert(users).values({ username, password }).returning();
        user = newUser;
      }

      if (!user || user.password !== password) {
        return res.status(401).json({ message: "Incorrect username or password." });
      }

      const token = jwt.sign({ id: user.id }, JWT_SECRET, { expiresIn: '7d' });
      res.cookie('auth_token', token, { 
        httpOnly: true, 
        maxAge: 7 * 24 * 60 * 60 * 1000,
        path: '/',
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax'
      });
      res.status(200).json(user);
    } catch (err) {
      next(err);
    }
  });

  app.post("/api/logout", (req, res) => {
    res.clearCookie('auth_token', { path: '/' });
    res.sendStatus(200);
  });

  app.get("/api/user", (req, res) => {
    if (!(req as any).isAuthenticated()) return res.sendStatus(401);
    res.status(200).json((req as any).user);
  });
}
