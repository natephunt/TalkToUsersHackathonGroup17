// Local test page for P2 news signals. Never deployed. Run: deno task console, then open http://localhost:8044
import type { Borrower } from "../../news/types.ts";
import { COMPANIES, fixtureDate, loadBatches, pickTagger } from "../../news/run.ts";
import { newsSignalsFromBatches } from "../../news/news_signals.ts";

const page = await Deno.readTextFile(new URL("./index.html", import.meta.url));

Deno.serve({ port: 8044 }, async (req) => {
  const url = new URL(req.url);
  if (url.pathname === "/companies") return Response.json(COMPANIES);
  if (url.pathname === "/run" && req.method === "POST") {
    try {
      const { company, live, tagger } = await req.json() as { company: Borrower; live: boolean; tagger: string };
      const known = COMPANIES.find((c) => c.id === company.id);
      const b: Borrower = known ?? { ...company, id: company.id || company.name.toLowerCase().replace(/[^a-z0-9]+/g, "") };
      const useLive = live || !known;
      const t0 = performance.now();
      const batches = await loadBatches(b, useLive);
      const t1 = performance.now();
      const today = useLive ? new Date() : await fixtureDate(b.id!);
      const { signals, trace } = await newsSignalsFromBatches(b, batches, pickTagger(tagger), today);
      const t2 = performance.now();
      return Response.json({
        borrower: b, live: useLive, tagger, queries: batches.map((x) => ({ type: x.type, query: x.query, count: x.items.length })),
        timings: { search_s: (t1 - t0) / 1000, tag_s: (t2 - t1) / 1000 }, signals, trace,
      });
    } catch (e) {
      return Response.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
    }
  }
  return new Response(page, { headers: { "content-type": "text/html; charset=utf-8" } });
});
