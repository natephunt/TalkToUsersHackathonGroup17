// scoreBorrower (P3): plain-code status rules from CLAUDE.md. No API calls, no LLM.
//
// Input:  { signals: Signal[], today?: "YYYY-MM-DD" }
// Output: { status: "green" | "yellow" | "red", why: string }
//
// Rules (only signals dated in the last 90 days count):
//   RED    = 2+ strong, or 1 strong + 2 weak
//   YELLOW = 1 strong, or 2+ weak
//   GREEN  = otherwise
// Why line: "<Status>: " + up to 2 top signals (strong first, then newest) joined with " + ".

export type Severity = "strong" | "weak";
export type SignalType = "hiring_drop" | "review_distress" | "exec_departure" | "legal_layoffs";
export type Status = "green" | "yellow" | "red";

export interface Signal {
  borrower_id?: string;
  type: SignalType;
  severity: Severity;
  date: string; // YYYY-MM-DD
  title: string;
  snippet?: string;
  source_name?: string;
  source_url?: string;
}

export const WINDOW_DAYS = 90;
const DAY_MS = 24 * 60 * 60 * 1000;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function parseDay(s: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s ?? "");
  if (!m) return null;
  const t = Date.UTC(+m[1], +m[2] - 1, +m[3]);
  return Number.isNaN(t) ? null : t;
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

// "2026-09-12" -> "Sep 12"
function shortDate(s: string): string {
  const t = parseDay(s);
  if (t === null) return s;
  const d = new Date(t);
  return `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}`;
}

// hiring_drop is a computed fact as of the refresh, so its date adds nothing to the why line.
function label(s: Signal): string {
  const title = (s.title ?? "").trim();
  return s.type === "hiring_drop" ? title : `${title} (${shortDate(s.date)})`;
}

// Signals with a valid date and severity, dated within the last WINDOW_DAYS days (inclusive), not in the future.
export function recentSignals(signals: Signal[], today: string = todayIso()): Signal[] {
  const now = parseDay(today);
  if (now === null) throw new Error(`Invalid today: ${today}`);
  return (signals ?? []).filter((s) => {
    const t = parseDay(s?.date);
    if (t === null) return false;
    if (s.severity !== "strong" && s.severity !== "weak") return false;
    const age = (now - t) / DAY_MS;
    return age >= 0 && age <= WINDOW_DAYS;
  });
}

export function scoreBorrower(signals: Signal[], today: string = todayIso()): { status: Status; why: string } {
  const recent = recentSignals(signals, today);
  const strong = recent.filter((s) => s.severity === "strong").length;
  const weak = recent.length - strong;

  let status: Status = "green";
  if (strong >= 2 || (strong === 1 && weak >= 2)) status = "red";
  else if (strong === 1 || weak >= 2) status = "yellow";

  if (status === "green") return { status, why: "Green: no warning signs in the last 90 days." };

  const top = [...recent]
    .sort((a, b) => {
      if (a.severity !== b.severity) return a.severity === "strong" ? -1 : 1;
      return b.date.localeCompare(a.date);
    })
    .slice(0, 2)
    .map(label);

  const name = status === "red" ? "Red" : "Yellow";
  return { status, why: `${name}: ${top.join(" + ")}.` };
}

// HTTP handler for Base44 (Deno). Skipped under Node so tests can import this file.
declare const Deno: { serve: (h: (req: Request) => Response | Promise<Response>) => void } | undefined;

if (typeof Deno !== "undefined") {
  Deno.serve(async (req: Request) => {
    try {
      const body = await req.json();
      const result = scoreBorrower(body?.signals ?? [], body?.today ?? todayIso());
      return Response.json(result);
    } catch (e) {
      return Response.json({ error: String((e as Error)?.message ?? e) }, { status: 400 });
    }
  });
}
