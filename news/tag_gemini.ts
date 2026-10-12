// Gemini tagger: one generateContent call tags all of a borrower's articles as JSON.
import type { Tag, Tagger } from "./types.ts";
import { alignTags, tagPrompt } from "./tag_prompt.ts";

const SCHEMA = {
  type: "object",
  properties: {
    tags: {
      type: "array",
      items: {
        type: "object",
        properties: {
          id: { type: "integer" },
          reason: { type: "string" },
          relevant: { type: "boolean" },
          same_company: { type: "boolean" },
          signal_type: { type: "string", enum: ["exec_departure", "legal_layoffs"], nullable: true },
          severity: { type: "string", enum: ["strong", "weak"], nullable: true },
          snippet: { type: "string" },
        },
        required: ["id", "relevant", "same_company", "signal_type", "severity", "snippet"],
      },
    },
  },
  required: ["tags"],
};

// One JSON-mode Gemini call with a response schema; one retry.
export async function geminiJSON<T>(apiKey: string, prompt: string, schema: unknown, model = "gemini-2.5-flash", timeoutMs = 60000): Promise<T> {
  const body = JSON.stringify({
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    generationConfig: { temperature: 0, responseMimeType: "application/json", responseSchema: schema },
  });
  let lastErr: unknown;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
        method: "POST",
        headers: { "x-goog-api-key": apiKey, "Content-Type": "application/json" },
        body,
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (!res.ok) throw new Error(`Gemini HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`);
      const data = await res.json();
      const text = data?.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text ?? "").join("");
      return JSON.parse(text) as T;
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr;
}

export function geminiTagger(apiKey: string, model = "gemini-2.5-flash"): Tagger {
  return {
    name: `gemini:${model}`,
    async tagMany(items, b) {
      if (items.length === 0) return [];
      const parsed = await geminiJSON<{ tags: (Tag & { id: number })[] }>(apiKey, tagPrompt(items, b), SCHEMA, model);
      return alignTags(items.length, parsed.tags);
    },
  };
}
