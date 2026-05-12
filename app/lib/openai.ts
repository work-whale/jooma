import OpenAI from "openai";

// Lazy singleton — avoids constructing the client at module-load time, which would
// throw during Next.js build steps that evaluate route handlers without env vars set.
let _client: OpenAI | null = null;

export function getOpenAI(): OpenAI {
  if (!_client) {
    _client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  }
  return _client;
}
