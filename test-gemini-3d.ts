import { GoogleGenerativeAI } from "@google/generative-ai";
import * as dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "");

async function runTest() {
    const ai = genAI.getGenerativeModel({ model: "gemini-3-flash-preview" });

    const prompt = `Generate a Visual DNA profile for a community of 'Cyberpunk Streetwear' fans.
    Return JSON:
    {
        "analytics": {
            "visualTheme": {
                "aestheticTags": ["Cyberpunk", "Neon", "Techwear"],
                "vibeDescription": "A dark, high-tech urban aesthetic with glowing neon accents.",
                "colorPalette": ["#000000", "#FF00FF", "#00FFFF", "#FFFF00", "#FFFFFF"]
            }
        }
    }`;

    try {
        console.log("⏳ Sending request to Gemini...");
        const result = await ai.generateContent(prompt);
        const response = await result.response;
        const text = response.text();
        console.log("✅ Response received:");
        console.log(text);

        const json = JSON.parse(text.replace(/```json|```/g, ""));
        console.log("Parsed JSON:", JSON.stringify(json, null, 2));
    } catch (error) {
        console.error("❌ Error:", error);
    }
}

runTest();
