import { GoogleGenerativeAI } from "@google/generative-ai";
import Anthropic from "@anthropic-ai/sdk";

export async function POST(request: Request) {
  const { provider, apiKey } = await request.json();

  if (!apiKey) {
    return Response.json({ success: false, message: "No API key provided" });
  }

  try {
    if (provider === "gemini") {
      const genAI = new GoogleGenerativeAI(apiKey);
      const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });
      const result = await model.generateContent("Reply with exactly: OK");
      const text = result.response.text();
      return Response.json({ success: true, message: `Connected \u2014 model responded: "${text.trim().substring(0, 30)}"` });
    }

    if (provider === "anthropic") {
      const anthropic = new Anthropic({ apiKey });
      const message = await anthropic.messages.create({
        model: "claude-sonnet-4-5-20250514",
        max_tokens: 10,
        messages: [{ role: "user", content: "Reply with exactly: OK" }],
      });
      const text = message.content[0].type === "text" ? message.content[0].text : "";
      return Response.json({ success: true, message: `Connected \u2014 model responded: "${text.trim().substring(0, 30)}"` });
    }

    return Response.json({ success: false, message: "Unknown provider" });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return Response.json({ success: false, message: msg.substring(0, 200) });
  }
}
