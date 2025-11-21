import { GoogleGenAI } from "@google/genai";

// As per guidelines, the API key must be obtained exclusively from process.env.API_KEY.
// The execution environment is responsible for setting this variable.
const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

export const translateText = async (
  text: string,
  sourceLangName: string,
  targetLangName: string
): Promise<string> => {
  if (!text) {
    return "";
  }

  const prompt = `Translate the following text from ${sourceLangName} to ${targetLangName}.
  Provide only the translated text as the output, without any extra commentary, explanations, or quotation marks.

  Text to translate:
  """
  ${text}
  """
  `;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
    });
    
    if (response && response.text) {
      return response.text.trim();
    } else {
      throw new Error("Received an empty response from the AI.");
    }
  } catch (error) {
    console.error("Error calling Gemini API:", error);
    throw new Error("Failed to translate. Please check your API key and network connection.");
  }
};
