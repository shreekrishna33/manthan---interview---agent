import "dotenv/config";
import { GoogleGenAI } from "@google/genai";

async function test() {
    console.log("Loading environment variables...");
    const apiKey = process.env.AI_INTEGRATIONS_GEMINI_API_KEY;

    if (!apiKey) {
        console.error("DEBUG: process.env.AI_INTEGRATIONS_GEMINI_API_KEY is undefined");
        console.log("DEBUG: Current working directory:", process.cwd());
        console.log("DEBUG: Keys in process.env:", Object.keys(process.env).filter(k => k.includes("GEMINI") || k.includes("AI_")));
        return;
    }

    console.log("API Key found (length):", apiKey.length);
    const genAI = new GoogleGenAI({ apiKey });

    try {
        console.log("Listing models...");
        const modelsResult = await (genAI as any).models.list();

        const models = [];
        for await (const model of modelsResult) {
            models.push(model.name);
        }
        console.log("Available models:", models);

        const prompt = "Hello, respond with 'OK'";
        const selectedModel = models.includes("models/gemini-1.5-flash") ? "gemini-1.5-flash" :
            models.includes("models/gemini-pro") ? "gemini-pro" : models[0]?.replace("models/", "");

        console.log(`Sending request to Gemini using model: ${selectedModel}...`);

        if (!selectedModel) {
            console.error("No models available for this API key.");
            return;
        }

        // Using the v1.40.0 style (as seen in routes.ts)
        const result = await genAI.models.generateContent({
            model: selectedModel,
            contents: [{ role: "user", parts: [{ text: prompt }] }]
        });

        const text = (result as any).candidates?.[0]?.content?.parts?.[0]?.text;
        console.log("Response:", text);
    } catch (error) {
        console.error("Error from Gemini API:", error);
    }
}

test();
