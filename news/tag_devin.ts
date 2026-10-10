// Devin tagger: one Devin session tags all of a borrower's articles, returned as structured output.
// API: POST /v1/sessions, then poll GET /v1/sessions/{id} for structured_output. Takes minutes, so batch.
import type { Borrower, Tag, Tagger } from "./types.ts";

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

export function devinPrompt(items: { text: string; url: string; hint: string }[], b: Borrower): string {
  return `You are tagging news items for a bank credit officer. Do NOT write code, open PRs, or browse. Only read the items below and fill in the structured output.

Company: ${b.name} | website: ${b.website_domain ?? "?"} | HQ: ${b.hq_city ?? "?"}, ${b.hq_state ?? "?"}

For EACH item return {id, relevant, same_company, signal_type, severity, snippet}:
- same_company: true only if the item is clearly about this company (not a different company with a similar name). If unsure, false.
- signal_type: exec_departure (a senior executive leaves) or legal_layoffs (lawsuit, lien, WARN notice, layoffs, bankruptcy, closures). null if not relevant.
- severity: exec_departure: CEO/CFO = strong, other senior roles = weak. legal_layoffs: WARN notice, bankruptcy, or a lawsuit by a lender/supplier = strong, others = weak.
- snippet: copy ONE sentence or phrase EXACTLY, character for character, from the item text. Never paraphrase. Empty string if not relevant.

Items (JSON):
${JSON.stringify(items.map((it, id) => ({ id, text: it.text, url: it.url })), null, 1)}

Set the structured output as soon as all ${items.length} items are tagged, then stop.`;
}

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
          return items.map((_, i) => {
            const t = tags.find((x) => x.id === i);
            return t ?? { relevant: false, same_company: false, signal_type: null, severity: null, snippet: "" };
          });
        }
        if (s?.status_enum === "expired") throw new Error("Devin session expired before tagging finished");
      }
      throw new Error(`Devin tagging timed out (${url})`);
    },
  };
}
