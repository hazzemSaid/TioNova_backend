import axios from "axios";

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";

export type ChatMessage = { role: "system" | "user" | "assistant"; content: string };

export async function openrouterChat(messages: ChatMessage[], options?: { maxTokens?: number; temperature?: number; model?: string }) {
  const apiKey = process.env.OPENROUTER_API_KEY || process.env.OPEN_ROUTER_KEY || process.env.OPENROUTER_KEY;
  if (!apiKey) {
    throw new Error("Missing OPENROUTER_API_KEY env var");
  }

  const model = options?.model || process.env.OPENROUTER_MODEL || "deepseek/deepseek-chat:free";

  const payload = {
    model,
    messages,
    temperature: options?.temperature ?? 0.7,
    max_tokens: options?.maxTokens ?? 2000,
    stream: false,
  };

  const response = await axios.post(OPENROUTER_URL, payload, {
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    timeout: 120000,
    maxContentLength: 50 * 1024 * 1024,
  });

  if (!response.data?.choices?.[0]?.message?.content) {
    throw new Error("OpenRouter returned empty response");
  }

  return response.data.choices[0].message.content as string;
}


