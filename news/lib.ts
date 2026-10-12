// Pure helpers: no network. Unit-tested in news/lib_test.ts.
import type { NewsItem } from "./types.ts";

const MONTHS: Record<string, number> = {
  jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
};

const ymd = (d: Date) => d.toISOString().slice(0, 10);

// Google News dates come as "3 days ago", "1 month ago", "yesterday" or "Jul 9, 2026". Returns YYYY-MM-DD or null.
export function parseNewsDate(raw: string, today: Date): string | null {
  const s = raw.trim().toLowerCase();
  if (s === "yesterday") return ymd(new Date(today.getTime() - 86400000));
  const rel = s.match(/^(\d+)\s+(minute|hour|day|week|month|year)s?\s+ago$/);
  if (rel) {
    const n = Number(rel[1]);
    const d = new Date(today);
    const unit = rel[2];
    if (unit === "minute" || unit === "hour") return ymd(d);
    if (unit === "day") d.setUTCDate(d.getUTCDate() - n);
    if (unit === "week") d.setUTCDate(d.getUTCDate() - 7 * n);
    if (unit === "month") d.setUTCMonth(d.getUTCMonth() - n);
    if (unit === "year") d.setUTCFullYear(d.getUTCFullYear() - n);
    return ymd(d);
  }
  const abs = s.match(/^([a-z]{3})[a-z]*\.?\s+(\d{1,2}),\s+(\d{4})$/);
  if (abs && abs[1] in MONTHS) return ymd(new Date(Date.UTC(Number(abs[3]), MONTHS[abs[1]], Number(abs[2]))));
  return null;
}

export function withinDays(date: string, today: Date, days: number): boolean {
  const age = (today.getTime() - new Date(date + "T00:00:00Z").getTime()) / 86400000;
  return age >= 0 && age <= days;
}

export function dedupeByLink<T extends { link: string }>(items: T[]): T[] {
  const seen = new Set<string>();
  return items.filter((i) => (seen.has(i.link) ? false : (seen.add(i.link), true)));
}

const squash = (s: string) => s.replace(/\s+/g, " ").trim();

// Snippet guard: the snippet must appear verbatim in the source (whitespace collapsed).
export function snippetIsExact(snippet: string, source: string): boolean {
  const s = squash(snippet);
  return s.length > 0 && squash(source).includes(s);
}

// Text the tagger sees for one article. The snippet must come from this.
export const itemText = (i: NewsItem) => `${i.title}\n${i.description}`;

// Keep only the fields we use (the raw response carries base64 images).
export function slimNews(raw: unknown): NewsItem[] {
  const news = (raw as { news?: Record<string, string>[] })?.news ?? [];
  return news.map((n) => ({
    title: n.title ?? "",
    link: n.link ?? "",
    source: n.source ?? "",
    description: n.description ?? "",
    date: n.date ?? "",
  }));
}
