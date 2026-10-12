import { assertEquals } from "jsr:@std/assert@1";
import { dedupeByLink, parseNewsDate, snippetIsExact, withinDays } from "./lib.ts";
import { tagRules } from "./tag_rules.ts";
import { newsSignalsFromBatches } from "./news_signals.ts";
import { rulesTagger } from "./tag_rules.ts";
import type { Borrower, Tagger } from "./types.ts";

const today = new Date("2026-10-10T12:00:00Z");
const rl: Borrower = { id: "b1", name: "Red Lobster", website_domain: "redlobster.com", hq_city: "Orlando" };

Deno.test("parseNewsDate handles relative and absolute dates", () => {
  assertEquals(parseNewsDate("3 days ago", today), "2026-10-07");
  assertEquals(parseNewsDate("1 month ago", today), "2026-09-10");
  assertEquals(parseNewsDate("2 weeks ago", today), "2026-09-26");
  assertEquals(parseNewsDate("5 hours ago", today), "2026-10-10");
  assertEquals(parseNewsDate("yesterday", today), "2026-10-09");
  assertEquals(parseNewsDate("Jul 9, 2026", today), "2026-07-09");
  assertEquals(parseNewsDate("Sept 3, 2026", today), "2026-09-03");
  assertEquals(parseNewsDate("whenever", today), null);
});

Deno.test("withinDays keeps 180 days only", () => {
  assertEquals(withinDays("2026-05-01", today, 180), true);
  assertEquals(withinDays("2026-03-01", today, 180), false);
});

Deno.test("dedupeByLink keeps first", () => {
  assertEquals(dedupeByLink([{ link: "a" }, { link: "a" }, { link: "b" }]).length, 2);
});

Deno.test("snippet guard: exact quote passes, paraphrase fails", () => {
  const src = "Red Lobster  has closed\ndozens of restaurants this year.";
  assertEquals(snippetIsExact("has closed dozens of restaurants", src), true);
  assertEquals(snippetIsExact("closed many restaurants", src), false);
  assertEquals(snippetIsExact("", src), false);
});

Deno.test("rules: CEO resigns is strong exec_departure", () => {
  const t = tagRules("Red Lobster CEO resigns\nThe chain said its CEO resigned on Friday.", rl, "exec_departure");
  assertEquals([t.relevant, t.same_company, t.severity, t.snippet], [true, true, "strong", "Red Lobster CEO resigns"]);
});

Deno.test("rules: bankruptcy is strong, closures weak", () => {
  assertEquals(tagRules("Red Lobster files for bankruptcy", rl, "legal_layoffs").severity, "strong");
  assertEquals(tagRules("Red Lobster closes more restaurants", rl, "legal_layoffs").severity, "weak");
});

Deno.test("rules: other company is not same_company", () => {
  assertEquals(tagRules("Olive Garden CEO resigns", rl, "exec_departure").same_company, false);
});

Deno.test("pipeline drops a model-written snippet", async () => {
  const liar: Tagger = {
    name: "liar",
    tagMany: (items) => Promise.resolve(items.map(() => ({
      relevant: true, same_company: true, signal_type: "legal_layoffs" as const, severity: "strong" as const,
      snippet: "Red Lobster is in deep trouble",
    }))),
  };
  const batches = [{ type: "legal_layoffs" as const, source: "Legal" as const, query: "q", items: [
    { title: "Red Lobster closes stores", link: "https://x/1", source: "X", description: "It closed 20 stores.", date: "2 days ago" },
  ] }];
  assertEquals((await newsSignalsFromBatches(rl, batches, liar, today)).signals.length, 0);
  const ok = await newsSignalsFromBatches(rl, batches, rulesTagger, today);
  assertEquals(ok.signals.length, 1);
  assertEquals(ok.signals[0], {
    borrower_id: "b1", type: "legal_layoffs", severity: "weak", date: "2026-10-08",
    title: "Red Lobster closes stores", snippet: "Red Lobster closes stores", source_name: "X", source_url: "https://x/1",
  });
});
