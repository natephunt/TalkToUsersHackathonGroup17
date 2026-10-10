// Bright Data SERP (Google News) via zone mcp_unlocker. See docs/NEWS_SPEC.md.
import type { Borrower, NewsItem, SignalType } from "./types.ts";
import { slimNews } from "./lib.ts";

export const QUERIES: { type: SignalType; source: "News" | "Legal"; q: (name: string) => string }[] = [
  {
    type: "exec_departure",
    source: "News",
    q: (n) => `"${n}" (CEO OR CFO OR president OR founder) (resigns OR "steps down" OR departs)`,
  },
  {
    type: "legal_layoffs",
    source: "Legal",
    q: (n) => `"${n}" (lawsuit OR sued OR lien OR "WARN notice" OR layoffs OR bankruptcy)`,
  },
];

export async function searchNews(
  query: string,
  env: { key: string; zone: string },
  timeoutMs = 60000,
): Promise<NewsItem[]> {
  const url = `https://www.google.com/search?q=${encodeURIComponent(query)}&tbm=nws&tbs=qdr:m6&hl=en&gl=us&brd_json=1`;
  let lastErr: unknown;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetch("https://api.brightdata.com/request", {
        method: "POST",
        headers: { Authorization: `Bearer ${env.key}`, "Content-Type": "application/json" },
        body: JSON.stringify({ zone: env.zone, url, format: "raw" }),
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (!res.ok) throw new Error(`Bright Data HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
      return slimNews(await res.json());
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr;
}

export type NewsBatch = { type: SignalType; source: "News" | "Legal"; query: string; items: NewsItem[] };

// Runs both queries. A failing query throws with its source name so refreshBorrower can mark it unavailable.
export async function fetchBorrowerNews(b: Borrower, env: { key: string; zone: string }): Promise<NewsBatch[]> {
  return await Promise.all(
    QUERIES.map(async ({ type, source, q }) => {
      const query = q(b.name);
      try {
        return { type, source, query, items: await searchNews(query, env) };
      } catch (e) {
        throw new Error(`${source}: ${e instanceof Error ? e.message : e}`);
      }
    }),
  );
}
