// Devin tagger: one Devin session tags all of a borrower's articles, returned as structured output.
// API: POST /v1/sessions, then poll GET /v1/sessions/{id} for structured_output. Takes minutes, so batch.
import type { Borrower, Tag, Tagger } from "./types.ts";
import { alignTags, type TagInput, tagPrompt } from "./tag_prompt.ts";

const API = "https://api.devin.ai/v1";

const TAG_SCHEMA = {
  type: "object",
  properties: {
    tags: {
      type: "array",
      items: {
        type: "object",
        properties: {
          id: { type: "integer" },
          relevant: { type: "boolean" },
          same_company: { type: "boolean" },
          signal_type: { type: ["string", "null"], enum: ["exec_departure", "legal_layoffs", "review_distress", null] },
          severity: { type: ["string", "null"], enum: ["strong", "weak", null] },
          snippet: { type: "string" },
        },
        required: ["id", "relevant", "same_company", "signal_type", "severity", "snippet"],
      },
    },
  },
  required: ["tags"],
};

export const devinPrompt = (items: TagInput[], b: Borrower) =>
  "Do NOT write code, open PRs, or browse. Only read the items below and fill in the structured output.\n\n" +
  tagPrompt(items, b) + `\n\nSet the structured output as soon as all ${items.length} items are tagged, then stop.`;

export function devinTagger(apiKey: string, opts = { pollMs: 10000, timeoutMs: 10 * 60000, maxAcu: 2 }): Tagger {
  const headers = { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" };
  return {
    name: "devin",
    async tagMany(items, b) {
      if (items.length === 0) return [];
      const res = await fetch(`${API}/sessions`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          prompt: devinPrompt(items, b),
          structured_output_schema: TAG_SCHEMA,
          max_acu_limit: opts.maxAcu,
          unlisted: true,
          title: `Tag news: ${b.name}`,
          tags: ["early-warning", "tagging"],
        }),
      });
      if (!res.ok) throw new Error(`Devin create HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
      const { session_id, url } = await res.json();
      console.log(`Devin session: ${url}`);

      const deadline = Date.now() + opts.timeoutMs;
      while (Date.now() < deadline) {
        await new Promise((r) => setTimeout(r, opts.pollMs));
        const s = await (await fetch(`${API}/sessions/${session_id}`, { headers })).json();
        const tags = s?.structured_output?.tags as (Tag & { id: number })[] | undefined;
        if (tags && tags.length >= items.length) {
          return alignTags(items.length, tags);
        }
        if (s?.status_enum === "expired") throw new Error("Devin session expired before tagging finished");
      }
      throw new Error(`Devin tagging timed out (${url})`);
    },
  };
}
