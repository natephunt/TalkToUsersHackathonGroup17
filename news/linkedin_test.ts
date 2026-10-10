import { assertEquals } from "jsr:@std/assert@1";
import { flattenExperience, linkedInSignals, type LinkedInRun, parseMonthYear } from "./linkedin.ts";

const today = new Date("2026-10-10T12:00:00Z");
const b = { id: "b1", name: "Acme Foods" };
const run = (experience: unknown[], current_company = ""): LinkedInRun => ({
  exec_query: "q", exec_results: [],
  execs: [{ name: "Jane Doe", title: "CFO", quote: "Jane Doe, CFO", source_url: "https://x" }],
  profile_hits: [{ exec: "Jane Doe", query: "q", url: "https://www.linkedin.com/in/jane", results: [] }],
  profiles: [{ url: "https://www.linkedin.com/in/jane", name: "Jane Doe", current_company, experience: flattenExperience(experience) }],
});

Deno.test("parseMonthYear", () => {
  assertEquals(parseMonthYear("Aug 2026"), "2026-08-01");
  assertEquals(parseMonthYear("2021"), "2021-01-01");
  assertEquals(parseMonthYear("Present"), null);
});

Deno.test("recent CFO exit at borrower is a strong exec_departure", () => {
  const { signals, checks } = linkedInSignals(b, run([{ title: "Chief Financial Officer", company: "Acme Foods Inc.", start_date: "Jan 2020", end_date: "Aug 2026" }], "Other Co"), today);
  assertEquals(checks[0].result, "departed");
  assertEquals([signals[0].type, signals[0].severity, signals[0].date, signals[0].source_name], ["exec_departure", "strong", "2026-08-01", "LinkedIn"]);
});

Deno.test("grouped positions are flattened", () => {
  const { signals } = linkedInSignals(b, run([{ company: "Acme Foods", positions: [{ title: "VP Sales", start_date: "2018", end_date: "2020" }, { title: "President", start_date: "2020", end_date: "Sep 2026" }] }]), today);
  assertEquals(signals[0]?.severity, "weak");
});

Deno.test("still in role, old exit, and employer-only change raise no signal", () => {
  assertEquals(linkedInSignals(b, run([{ title: "CFO", company: "Acme Foods", start_date: "2020", end_date: "Present" }]), today).checks[0].result, "still there");
  assertEquals(linkedInSignals(b, run([{ title: "CFO", company: "Acme Foods", start_date: "2015", end_date: "Dec 2023" }]), today).signals.length, 0);
  const r = linkedInSignals(b, run([], "Parent Holdings"), today);
  assertEquals([r.signals.length, r.checks[0].result], [0, "unconfirmed"]);
});
