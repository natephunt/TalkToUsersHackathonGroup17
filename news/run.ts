// CLI: deno task news <company-id> [--live] [--tagger gemini|rules|devin]
// Without --live it replays dev/fixtures/<id>.json; --live calls Bright Data and re-records the fixture.
import type { Borrower, Tagger } from "./types.ts";
import { fetchBorrowerNews, type NewsBatch } from "./serp.ts";
import { rulesTagger } from "./tag_rules.ts";
import { devinTagger } from "./tag_devin.ts";
import { geminiTagger } from "./tag_gemini.ts";
import { newsSignalsFromBatches } from "./news_signals.ts";

export const COMPANIES: Borrower[] = JSON.parse(await Deno.readTextFile("dev/companies.json"));
const fixturePath = (id: string) => `dev/fixtures/${id}.json`;

export function pickTagger(name: string): Tagger {
  if (name === "rules") return rulesTagger;
  const envName = name === "devin" ? "DEVIN_API_KEY" : "GEMINI_API_KEY";
  const key = Deno.env.get(envName);
  if (!key) throw new Error(`${envName} is not set in .env`);
  return name === "devin" ? devinTagger(key) : geminiTagger(key);
}

export async function loadBatches(b: Borrower, live: boolean): Promise<NewsBatch[]> {
  if (!live) return JSON.parse(await Deno.readTextFile(fixturePath(b.id!))).batches;
  const env = { key: Deno.env.get("BRIGHTDATA_API_KEY") ?? "", zone: Deno.env.get("BRIGHTDATA_SERP_ZONE") ?? "mcp_unlocker" };
  const batches = await fetchBorrowerNews(b, env);
  await Deno.writeTextFile(
    fixturePath(b.id!),
    JSON.stringify({ recorded_at: new Date().toISOString(), batches }, null, 2) + "\n",
  );
  return batches;
}

// Fixtures are evaluated as of the day they were recorded, so "1 month ago" keeps meaning the same thing.
export async function fixtureDate(id: string): Promise<Date> {
  try {
    return new Date(JSON.parse(await Deno.readTextFile(fixturePath(id))).recorded_at);
  } catch {
    return new Date();
  }
}

if (import.meta.main) {
  const id = Deno.args.find((a) => !a.startsWith("--")) ?? "redlobster";
  const live = Deno.args.includes("--live");
  const taggerName = Deno.args.includes("--tagger") ? Deno.args[Deno.args.indexOf("--tagger") + 1] : "gemini";
  const b = COMPANIES.find((c) => c.id === id);
  if (!b) throw new Error(`unknown company ${id}; see dev/companies.json`);

  const t0 = performance.now();
  const batches = await loadBatches(b, live);
  const t1 = performance.now();
  const today = live ? new Date() : await fixtureDate(id);
  const { signals, trace } = await newsSignalsFromBatches(b, batches, pickTagger(taggerName), today);
  const t2 = performance.now();

  for (const r of trace) console.log(`${r.kept ? "KEEP" : "drop"}  ${r.query_type.padEnd(14)} ${(r.date ?? "?").padEnd(10)}  ${r.item.title.slice(0, 70).padEnd(70)}  ${r.reason}`);
  console.log(`\nsearch ${((t1 - t0) / 1000).toFixed(1)}s (${live ? "live" : "fixture"}) · tag ${((t2 - t1) / 1000).toFixed(1)}s · ${signals.length} signals`);
  console.log(JSON.stringify(signals, null, 2));
}
