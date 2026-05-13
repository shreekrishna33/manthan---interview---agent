import { GoogleGenAI } from "@google/genai";
import "dotenv/config";

const genAI = new GoogleGenAI(process.env.AI_INTEGRATIONS_GEMINI_API_KEY || "");

async function listModels() {
    try {
        const result = await genAI.getGenerativeModel({ model: "gemini-1.5-flash" }).listModels();
        console.log(JSON.stringify(result, null, 2));
    } catch (error) {
        console.error("Error listing models:", error);
        // Try listModels directly on the client if available in this SDK version
        try {
            // In some SDK versions it's genAI.listModels()
            const models = await (genAI as any).listModels();
            console.log(JSON.stringify(models, null, 2));
        } catch (e) {
            console.error("Failed both listing attempts");
        }
    }
}

listModels();
