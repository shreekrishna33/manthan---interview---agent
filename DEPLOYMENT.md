# Deployment Guide: AI Interview Assistant

Follow these steps to deploy your AI Interview Assistant to the web using **GitHub**, **Turso**, and **Vercel**.

## 1. Prepare Your Database (Turso)
Vercel's serverless functions cannot save data to a local `.db` file. You need a remote database:
1. Create a free account at [Turso.tech](https://turso.tech/).
2. Create a new database (e.g., `ai-interviewer`).
3. Get your **Database URL** (starts with `libsql://`) and **Auth Token**.

## 2. Push to GitHub
1. Create a new repository on GitHub.
2. Link your local project:
   ```bash
   git init
   git add .
   git commit -m "Initial commit: Production Ready"
   git remote add origin YOUR_GITHUB_REPO_URL
   git push -u origin main
   ```

## 3. Deploy to Vercel
1. Go to [Vercel](https://vercel.com/) and click **New Project**.
2. Import your GitHub repository.
3. **Environment Variables**: Add these keys in the Vercel dashboard:
   - `AI_INTEGRATIONS_GEMINI_API_KEY`: Your Gemini API Key.
   - `DATABASE_URL`: Your Turso Database URL.
   - `DATABASE_AUTH_TOKEN`: Your Turso Auth Token.
   - `NODE_ENV`: `production`
4. Click **Deploy**.

## 4. Final Setup (Schema)
Once deployed, run the following command locally to push your database schema to Turso:
```bash
# Update your local .env with Turso credentials first
npm run db:push
```

Your AI Assistant is now live! 🚀
