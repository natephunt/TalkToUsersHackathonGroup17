// Tagging instructions shared by every LLM tagger (Gemini now, Devin later, Base44 LLM in the app).
import type { Borrower, Tag } from "./types.ts";

export type TagInput = { text: string; url: string; hint: string };

export function tagPrompt(items: TagInput[], b: Borrower): string {
  return `You tag news items for a bank credit officer deciding whether a company is a credit risk.

Company: ${b.name} | website: ${b.website_domain ?? "?"} | HQ: ${b.hq_city ?? "?"}, ${b.hq_state ?? "?"}

For EACH item return {id, reason, relevant, same_company, signal_type, severity, snippet}:
- reason: one short sentence explaining your decision (which company, what event, is it new).
- same_company: true only if the item is clearly about this company, not a different company with a similar name. If unsure, false.
- relevant: true only if the item REPORTS a new negative event for this company (an executive leaving, a lawsuit, lien, WARN notice, layoffs, closures, bankruptcy filing). An article about something else that only mentions a past event in passing (e.g. "after its 2024 bankruptcy") is NOT relevant. Good news (openings, expansion, promotions) is NOT relevant.
- signal_type: exec_departure (a senior executive leaves) or legal_layoffs (lawsuit, lien, WARN notice, layoffs, closures, bankruptcy). null if not relevant.
- severity: exec_departure: CEO or CFO = strong, other senior roles = weak. legal_layoffs: WARN notice, a new bankruptcy filing, or a lawsuit BY a lender or supplier AGAINST the company = strong; others = weak. null if not relevant.
- snippet: copy ONE sentence or phrase EXACTLY, character for character, from the item text, that shows the event. Never paraphrase or shorten words. Empty string if not relevant.

Items (JSON):
${JSON.stringify(items.map((it, id) => ({ id, text: it.text, url: it.url })), null, 1)}`;
}

const EMPTY: Tag = { relevant: false, same_company: false, signal_type: null, severity: null, snippet: "" };

// Line model output up with the input items by id; anything missing counts as not relevant.
export function alignTags(n: number, tags: (Tag & { id: number })[] | undefined): Tag[] {
  return Array.from({ length: n }, (_, i) => {
    const t = tags?.find((x) => x.id === i);
    return t ? { relevant: t.relevant, same_company: t.same_company, signal_type: t.signal_type, severity: t.severity, snippet: t.snippet ?? "", reason: t.reason } : EMPTY;
  });
}
