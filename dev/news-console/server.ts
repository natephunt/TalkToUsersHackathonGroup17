// Local test page for P2 news + LinkedIn signals. Never deployed. Run: deno task console, then open http://localhost:8044
// /run streams newline-delimited JSON: {type:"log", lane, msg, t} while working, then one {type:"result", ...}.
import type { Borrower } from "../../news/types.ts";
import { COMPANIES, fixtureDate, loadBatches, pickTagger } from "../../news/run.ts";
import { newsSignalsFromBatches } from "../../news/news_signals.ts";
import { crawlLinkedIn, type LinkedInRun, linkedInSignals } from "../../news/linkedin.ts";

const page = await Deno.readTextFile(new URL("./index.html", import.meta.url));
const exists = (p: string) => Deno.stat(p).then(() => true, () => false);
const secs = (t: number) => (performance.now() - t) / 1000;
type Log = (msg: string) => void;

async function loadLinkedIn(b: Borrower, live: boolean, log: Log): Promise<{ run: LinkedInRun; live: boolean }> {
  const path = `dev/fixtures/${b.id}.linkedin.json`;
  if (!live && await exists(path)) {
    log(`Using saved LinkedIn results (${path}); no Bright Data credit used.`);
    return { run: JSON.parse(await Deno.readTextFile(path)).run, live: false };
  }
  const env = {
    key: Deno.env.get("BRIGHTDATA_API_KEY") ?? "",
    zone: Deno.env.get("BRIGHTDATA_SERP_ZONE") ?? "mcp_unlocker",
    geminiKey: Deno.env.get("GEMINI_API_KEY") ?? "",
  };
  const run = await crawlLinkedIn(b, env, log);
  await Deno.writeTextFile(path, JSON.stringify({ recorded_at: new Date().toISOString(), run }, null, 2) + "\n");
  return { run, live: true };
}

async function runAll(
  { company, live, tagger, linkedin }: { company: Borrower; live: boolean; tagger: string; linkedin: boolean },
  emit: (o: unknown) => void,
) {
  const t0 = performance.now();
  const logger = (lane: string): Log => (msg) => emit({ type: "log", lane, msg, t: secs(t0) });
  const newsLog = logger("news"), liLog = logger("linkedin");

  const known = COMPANIES.find((c) => c.id === company.id);
  const b: Borrower = known ?? { ...company, id: company.id || company.name.toLowerCase().replace(/[^a-z0-9]+/g, "") };
  const useLive = live || !(await exists(`dev/fixtures/${b.id}.json`));
  const today = useLive ? new Date() : await fixtureDate(b.id!);

  const news = (async () => {
    const tc = performance.now();
    newsLog(useLive ? "1. Crawl: 2 Google News searches via Bright Data (exec + legal)..." : "1. Crawl: using saved results; no Bright Data credit used.");
    const batches = await loadBatches(b, useLive);
    for (const x of batches) newsLog(`1. ${x.type}: ${x.items.length} articles for ${x.query}`);
    const crawl_s = secs(tc);
    const ta = performance.now();
    const tg = pickTagger(tagger);
    newsLog(`2. Clean: dedupe, parse dates, keep last 180 days. 3. Analyze: sending the rest to ${tg.name} in one call...`);
    const { signals, trace } = await newsSignalsFromBatches(b, batches, tg, today);
    for (const r of trace) {
      const why = r.tag?.reason ? ` | ${tg.name}: "${r.tag.reason}"` : "";
      newsLog(`${r.kept ? "KEEP" : "drop"} ${r.item.title.slice(0, 80)} -> ${r.reason}${why}`);
    }
    newsLog(`4. Verify done: ${signals.length} signals.`);
    return { batches, signals, trace, timings: { crawl_s, analyze_s: secs(ta) } };
  })();

  const li = linkedin
    ? (async () => {
      const tl = performance.now();
      try {
        const { run, live: liLive } = await loadLinkedIn(b, live, liLog);
        const res = linkedInSignals(b, run, liLive ? new Date() : today);
        for (const c of res.checks) liLog(`D. ${c.exec}: ${c.result} (${c.detail})`);
        return { run, live: liLive, ...res, seconds: secs(tl) };
      } catch (e) {
        liLog(`LinkedIn failed: ${e instanceof Error ? e.message : e}`);
        return { error: `LinkedIn: ${e instanceof Error ? e.message : e}`, seconds: secs(tl) };
      }
    })()
    : Promise.resolve(null);

  const [n, l] = await Promise.all([news, li]);
  const signals = [...n.signals, ...((l && "signals" in l && l.signals) || [])].sort((a, z) => z.date.localeCompare(a.date));
  emit({ type: "result", borrower: b, live: useLive, tagger, news: n, linkedin: l, signals });
}

Deno.serve({ port: 8044 }, async (req) => {
  const url = new URL(req.url);
  if (url.pathname === "/companies") return Response.json(COMPANIES);
  if (url.pathname === "/run" && req.method === "POST") {
    const body = await req.json();
    const enc = new TextEncoder();
    const stream = new ReadableStream({
      async start(ctl) {
        const emit = (o: unknown) => ctl.enqueue(enc.encode(JSON.stringify(o) + "\n"));
        try {
          await runAll(body, emit);
        } catch (e) {
          emit({ type: "error", error: e instanceof Error ? e.message : String(e) });
        }
        ctl.close();
      },
    });
    return new Response(stream, { headers: { "content-type": "application/x-ndjson" } });
  }
  return new Response(page, { headers: { "content-type": "text/html; charset=utf-8" } });
});
