// Local test page for P2 news + LinkedIn signals. Never deployed. Run: deno task console, then open http://localhost:8044
import type { Borrower } from "../../news/types.ts";
import { COMPANIES, fixtureDate, loadBatches, pickTagger } from "../../news/run.ts";
import { newsSignalsFromBatches } from "../../news/news_signals.ts";
import { crawlLinkedIn, type LinkedInRun, linkedInSignals } from "../../news/linkedin.ts";

const page = await Deno.readTextFile(new URL("./index.html", import.meta.url));
const exists = (p: string) => Deno.stat(p).then(() => true, () => false);

async function loadLinkedIn(b: Borrower, live: boolean): Promise<{ run: LinkedInRun; live: boolean }> {
  const path = `dev/fixtures/${b.id}.linkedin.json`;
  if (!live && await exists(path)) return { run: JSON.parse(await Deno.readTextFile(path)).run, live: false };
  const env = {
    key: Deno.env.get("BRIGHTDATA_API_KEY") ?? "",
    zone: Deno.env.get("BRIGHTDATA_SERP_ZONE") ?? "mcp_unlocker",
    geminiKey: Deno.env.get("GEMINI_API_KEY") ?? "",
  };
  const run = await crawlLinkedIn(b, env);
  await Deno.writeTextFile(path, JSON.stringify({ recorded_at: new Date().toISOString(), run }, null, 2) + "\n");
  return { run, live: true };
}

const secs = (t: number) => (performance.now() - t) / 1000;

Deno.serve({ port: 8044 }, async (req) => {
  const url = new URL(req.url);
  if (url.pathname === "/companies") return Response.json(COMPANIES);
  if (url.pathname === "/run" && req.method === "POST") {
    try {
      const { company, live, tagger, linkedin } = await req.json() as { company: Borrower; live: boolean; tagger: string; linkedin: boolean };
      const known = COMPANIES.find((c) => c.id === company.id);
      const b: Borrower = known ?? { ...company, id: company.id || company.name.toLowerCase().replace(/[^a-z0-9]+/g, "") };
      const useLive = live || !(await exists(`dev/fixtures/${b.id}.json`));
      const today = useLive ? new Date() : await fixtureDate(b.id!);

      const news = (async () => {
        const t0 = performance.now();
        const batches = await loadBatches(b, useLive);
        const crawl_s = secs(t0);
        const t1 = performance.now();
        const { signals, trace } = await newsSignalsFromBatches(b, batches, pickTagger(tagger), today);
        return { batches, signals, trace, timings: { crawl_s, analyze_s: secs(t1) } };
      })();
      const li = linkedin
        ? (async () => {
          const t0 = performance.now();
          try {
            const { run, live: liLive } = await loadLinkedIn(b, live);
            return { run, live: liLive, ...linkedInSignals(b, run, liLive ? new Date() : today), seconds: secs(t0) };
          } catch (e) {
            return { error: `LinkedIn: ${e instanceof Error ? e.message : e}`, seconds: secs(t0) };
          }
        })()
        : Promise.resolve(null);

      const [n, l] = await Promise.all([news, li]);
      const signals = [...n.signals, ...((l && "signals" in l && l.signals) || [])].sort((a, z) => z.date.localeCompare(a.date));
      return Response.json({ borrower: b, live: useLive, tagger, news: n, linkedin: l, signals });
    } catch (e) {
      return Response.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
    }
  }
  return new Response(page, { headers: { "content-type": "text/html; charset=utf-8" } });
});
