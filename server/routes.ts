import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { api } from "../shared/routes";
import { z } from "zod";
import { GoogleGenAI } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.AI_INTEGRATIONS_GEMINI_API_KEY || "" });
const model = "gemini-2.5-flash";

const SYSTEM_PROMPT = `
You are Manthan, a super friendly, encouraging, and highly knowledgeable AI Interview Coach. You act like a supportive mentor or bestie who really wants the user to succeed in their career. Your default mode is INTERVIEWER, but you can switch to ATTENDER mode if requested.

## MODES OF OPERATION:

### 1. INTERVIEWER Mode (Default)
Your role is to conduct a mock interview with clear feedback, but do it in a warm, encouraging, and conversational tone. Use emojis occasionally!

#### A. DIFFICULTY PROGRESSION:
Guide the candidate gently through these levels:
1. **BASIC**: Fundamental concepts and definitions.
2. **EASY**: Direct applications and basic problem-solving.
3. **NORMAL**: Integration of concepts and debugging scenarios.
4. **HARD**: System design, scale, and complex trade-offs.

#### B. FEEDBACK & CORRECTION (CRITICAL):
For every response from the candidate:
1. **Status**: Start your response with an encouraging but clear status (e.g., "Spot on! 🎉", "Almost there! 🤔", or "Not quite, but let's learn it together! 💡").
2. **Evaluation**: Briefly explain why it was right or what was missing.
3. **Correction**: If they made a mistake, provide the full correct answer step-by-step with clear code examples.
4. **Progression**: Move to the next question when they are ready.

#### C. TRENDING FOCUS:
Keep questions relevant to modern tech (React, Next.js, Cloud, etc.) but explain things simply.

### 2. ATTENDER Mode
- **Role**: You are a supportive study buddy.
- **Feature**: Provide detailed questions AND answers for preparation.

## COMMANDS:
- **/mode interviewer** - Switch to Interviewer mode.
- **/mode attender** - Switch to Attender mode.
- **/start** - Start a mock interview session.
- **/trending** - Get top trending interview Q&A.

## RESPONSE FORMAT (MANDATORY):
You MUST format every response with internal reasoning and candidate-facing response tags:

<reasoning>
[Analyze the mode, difficulty, candidate's answer, and decide next steps internally]
</reasoning>
<response>
[Your friendly response to the user. Start with status, give feedback, and ask the next question!]
</response>

## INTERVIEWING STYLE:
- Ask ONE question at a time.
- Start by asking for their target role in a friendly way.
- Maintain a warm, empathetic, and encouraging tone! Let them know they are doing great!
`;

export async function registerRoutes(httpServer: Server, app: Express): Promise<Server> {

  // Health check
  app.get("/api/health", (req, res) => res.json({ status: "ok", database: "connected" }));

  // Get all conversations
  app.get(api.chat.listConversations.path, async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    try {
      const conversations = await storage.getAllConversations((req.user as any).id);
      res.json(conversations);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch conversations" });
    }
  });

  // Get single conversation
  app.get(api.chat.getConversation.path, async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    try {
      const id = parseInt(req.params.id);
      const conversation = await storage.getConversation(id, (req.user as any).id);
      if (!conversation) {
        return res.status(404).json({ error: "Conversation not found" });
      }
      const messages = await storage.getMessagesByConversation(id);
      res.json({ ...conversation, messages });
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch conversation" });
    }
  });

  // Create conversation
  app.post(api.chat.createConversation.path, async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    try {
      const { title } = req.body;
      const conversation = await storage.createConversation(title || "New Chat", (req.user as any).id);

      // Add a welcome message from the interviewer
      const welcomeMessage = `Hi! I'm **Manthan**, your personal Interview Coach! 👋

I'm so excited to help you prepare. I have two modes to help you out:

**1. 👔 Interview Coach Mode (Default)**
Let's practice some mock interviews! I'll ask you questions, give you gentle feedback, and help you improve.
- \`/mode interviewer\` - Switch to this mode
- \`/start\` - Start a practice session

**2. 📚 Study Buddy Mode**
I'll act as your study guide, giving you top questions and expert answers to study from.
- \`/mode attender\` - Switch to this mode
- \`/trending\` - Get top trending interview Q&A

How would you like to prepare today? Let's crush this! 🚀`;

      await storage.createMessage(conversation.id, "assistant", welcomeMessage);

      res.status(201).json(conversation);
    } catch (error) {
      res.status(500).json({ error: "Failed to create conversation" });
    }
  });

  // Delete conversation
  app.delete(api.chat.deleteConversation.path, async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    try {
      const id = parseInt(req.params.id);
      await storage.deleteConversation(id, (req.user as any).id);
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ error: "Failed to delete conversation" });
    }
  });

  // Send message
  app.post(api.chat.sendMessage.path, async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    console.log(`DEBUG: [sendMessage] Received request for conversation ${req.params.id}`);
    try {
      const conversationId = parseInt(req.params.id);
      
      const conversation = await storage.getConversation(conversationId, (req.user as any).id);
      if (!conversation) {
        return res.status(404).json({ error: "Conversation not found" });
      }

      const { content } = req.body;

      // Save user message
      await storage.createMessage(conversationId, "user", content);

      // Get history
      const messages = await storage.getMessagesByConversation(conversationId);

      // Construct prompt with history
      const chatHistory = messages.map((m) => ({
        role: m.role === "assistant" ? "model" : "user",
        parts: [{ text: m.content }],
      }));

      // Prepend system prompt to the first user message to avoid User-User alternation error
      if (chatHistory.length > 0 && chatHistory[0].role === "user") {
        chatHistory[0].parts[0].text = SYSTEM_PROMPT + "\n\n" + chatHistory[0].parts[0].text;
      } else {
        // Fallback: If for some reason the conversation starts with model or is empty (unlikely), prepend system prompt
        chatHistory.unshift({ role: "user", parts: [{ text: SYSTEM_PROMPT }] });
      }

      console.log("DEBUG: Final Chat History for Gemini:", JSON.stringify(chatHistory, null, 2));

      // Set up SSE
      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("Connection", "keep-alive");

      console.log(`DEBUG: Calling Gemini with model: ${model}`);
      const stream = await ai.models.generateContentStream({
        model: model,
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

      // Parse the response to extract only content within <response> tags
      // This ensures we save clean responses without the reasoning section
      const responseMatch = fullResponse.match(/<response>([\s\S]*?)<\/response>/);
      const cleanResponse = responseMatch ? responseMatch[1].trim() : fullResponse;

      // Save assistant message (only the clean response part)
      await storage.createMessage(conversationId, "assistant", cleanResponse);

      console.log("DEBUG: Response generation completed.");
      res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
      res.end();

    } catch (error: any) {
      console.error("CRITICAL ERROR generating response:", error);

      let errorMessage = "Oops, my brain had a little hiccup! 🧠 Let's try that again.";

      // Check for Gemini API Quota errors (429)
      if (error.status === 429 || (error.message && error.message.includes("429")) || (error.message && error.message.includes("quota"))) {
        errorMessage = "Ah, I've hit my rate limit (API Quota Exceeded). Let's take a quick breather and try again soon!";
      } else if (error.status === 404 || (error.message && error.message.includes("404"))) {
        errorMessage = "Hmm, I'm having trouble connecting to my AI model right now.";
      }

      console.error(`DEBUG: Sending error to client: ${errorMessage}`);

      if (!res.headersSent) {
        res.status(500).json({ error: errorMessage });
      } else {
        res.write(`data: ${JSON.stringify({ error: errorMessage })}\n\n`);
        res.end();
      }
    }
  });

  return httpServer;
}
