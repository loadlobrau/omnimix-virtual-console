
import { GoogleGenAI } from "@google/genai";

export const getGeminiOptimization = async (channelName: string, type: string) => {
  const apiKey = process.env.GEMINI_API_KEY || process.env.API_KEY;
  const ai = new GoogleGenAI({ apiKey: apiKey! });
  const prompt = `Act as a senior audio engineer. Provide optimization suggestions for a ${type} channel named "${channelName}". 
  Suggest specific EQ points (Low, Mid, High), a compression ratio, and a noise gate threshold for professional performance. 
  The mixer has a 3-band EQ (Low Shelf 320Hz, Mid Peaking 1kHz, High Shelf 3200Hz). 
  Respond in brief bullet points.`;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: prompt,
    });
    return response.text;
  } catch (err) {
    console.error("Gemini failed", err);
    return "Could not fetch AI suggestions at this time.";
  }
};
