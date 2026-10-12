// newsSignals: Borrower -> Signal[] (exec_departure + legal_layoffs). Never writes status.
import type { Borrower, NewsItem, Signal, Tag, Tagger } from "./types.ts";
import type { NewsBatch } from "./serp.ts";
import { dedupeByLink, itemText, parseNewsDate, snippetIsExact, withinDays } from "./lib.ts";

// One row per article, with why it was kept or dropped. The test page shows these.
export type Trace = {
  query_type: string;
  item: NewsItem;
  date: string | null;
  tag: Tag | null;
  kept: boolean;
  reason: string;
};

export async function newsSignalsFromBatches(
  b: Borrower,
  batches: NewsBatch[],
  tagger: Tagger,
  today = new Date(),
): Promise<{ signals: Signal[]; trace: Trace[] }> {
  const trace: Trace[] = [];
  const toTag: { batch: NewsBatch; item: NewsItem; date: string; row: Trace }[] = [];
  const seen = new Set<string>();

  for (const batch of batches) {
    for (const item of dedupeByLink(batch.items)) {
      const date = parseNewsDate(item.date, today);
      const row: Trace = { query_type: batch.type, item, date, tag: null, kept: false, reason: "" };
      trace.push(row);
      if (seen.has(item.link)) row.reason = "duplicate link";
      else if (!date) row.reason = `unparsed date "${item.date}"`;
      else if (!withinDays(date, today, 180)) row.reason = "older than 180 days";
      else toTag.push({ batch, item, date, row });
      seen.add(item.link);
    }
  }

  const tags = await tagger.tagMany(
    toTag.map(({ batch, item }) => ({ text: itemText(item), url: item.link, hint: batch.type })),
    b,
  );

  const signals: Signal[] = [];
  toTag.forEach(({ item, date, row }, i) => {
    const tag = tags[i];
    row.tag = tag;
    if (!tag?.relevant) return void (row.reason = "not relevant");
    if (!tag.same_company) return void (row.reason = "not the same company");
    if (!tag.signal_type || !tag.severity) return void (row.reason = "missing type/severity");
    if (tag.signal_type !== "exec_departure" && tag.signal_type !== "legal_layoffs") {
      return void (row.reason = `wrong type ${tag.signal_type}`);
    }
    if (!snippetIsExact(tag.snippet, itemText(item))) return void (row.reason = "snippet guard: not an exact quote");
    row.kept = true;
    row.reason = "kept";
    signals.push({
      borrower_id: b.id ?? "",
      type: tag.signal_type,
      severity: tag.severity,
      date,
      title: item.title,
      snippet: tag.snippet.replace(/\s+/g, " ").trim(),
      source_name: item.source,
      source_url: item.link,
    });
  });

  signals.sort((a, z) => z.date.localeCompare(a.date));
  return { signals, trace };
}
