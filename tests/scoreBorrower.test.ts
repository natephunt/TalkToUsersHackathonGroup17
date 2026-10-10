// Run: node --test tests/*.test.ts   (Node 22+, runs .ts via type stripping)
import { test } from "node:test";
import assert from "node:assert/strict";
import { scoreBorrower, type Signal } from "../base44/functions/scoreBorrower/entry.ts";

const TODAY = "2026-10-10";

function sig(severity: "strong" | "weak", date: string, title = "Signal", type: Signal["type"] = "legal_layoffs"): Signal {
  return { type, severity, date, title };
}

test("no signals is green", () => {
  assert.deepEqual(scoreBorrower([], TODAY), {
    status: "green",
    why: "Green: no warning signs in the last 90 days.",
  });
});

test("1 weak is green", () => {
  assert.equal(scoreBorrower([sig("weak", "2026-10-01")], TODAY).status, "green");
});

test("2 weak is yellow", () => {
  assert.equal(scoreBorrower([sig("weak", "2026-10-01"), sig("weak", "2026-09-01")], TODAY).status, "yellow");
});

test("1 strong is yellow", () => {
  assert.equal(scoreBorrower([sig("strong", "2026-10-01")], TODAY).status, "yellow");
});

test("1 strong + 1 weak is yellow", () => {
  assert.equal(scoreBorrower([sig("strong", "2026-10-01"), sig("weak", "2026-10-02")], TODAY).status, "yellow");
});

test("1 strong + 2 weak is red", () => {
  const s = [sig("strong", "2026-10-01"), sig("weak", "2026-10-02"), sig("weak", "2026-10-03")];
  assert.equal(scoreBorrower(s, TODAY).status, "red");
});

test("2 strong is red", () => {
  assert.equal(scoreBorrower([sig("strong", "2026-10-01"), sig("strong", "2026-09-01")], TODAY).status, "red");
});

test("signals older than 90 days are ignored", () => {
  // 2026-07-12 is exactly 90 days before TODAY (counts); 2026-07-11 is 91 (ignored).
  assert.equal(scoreBorrower([sig("strong", "2026-07-12")], TODAY).status, "yellow");
  assert.equal(scoreBorrower([sig("strong", "2026-07-11")], TODAY).status, "green");
  assert.equal(scoreBorrower([sig("strong", "2026-07-11"), sig("strong", "2026-01-01")], TODAY).status, "green");
});

test("future-dated and malformed signals are ignored", () => {
  const s = [sig("strong", "2026-10-11"), sig("strong", "Sep 12"), { ...sig("strong", "2026-10-01"), severity: "high" as any }];
  assert.equal(scoreBorrower(s, TODAY).status, "green");
});

test("why line matches the CLAUDE.md example", () => {
  const s = [
    sig("strong", "2026-09-12", "CFO departure", "exec_departure"),
    sig("strong", "2026-10-10", "Job postings down 62% in 30 days", "hiring_drop"),
  ];
  // Strong first, then newest: the hiring drop (Oct 10) comes before the CFO departure (Sep 12).
  assert.deepEqual(scoreBorrower(s, TODAY), {
    status: "red",
    why: "Red: Job postings down 62% in 30 days + CFO departure (Sep 12).",
  });
});

test("why line puts strong before weak and caps at 2", () => {
  const s = [
    sig("weak", "2026-10-05", "Lawsuit filed by landlord"),
    sig("strong", "2026-08-01", "WARN notice filed"),
    sig("weak", "2026-10-08", "VP Sales departs", "exec_departure"),
  ];
  assert.deepEqual(scoreBorrower(s, TODAY), {
    status: "red",
    why: "Red: WARN notice filed (Aug 1) + VP Sales departs (Oct 8).",
  });
});

test("yellow on weak only lists the two newest", () => {
  const s = [sig("weak", "2026-09-01", "A"), sig("weak", "2026-10-01", "B"), sig("weak", "2026-08-01", "C")];
  assert.deepEqual(scoreBorrower(s, TODAY), { status: "yellow", why: "Yellow: B (Oct 1) + A (Sep 1)." });
});

test("expired signals never appear in the why line", () => {
  const s = [sig("strong", "2026-01-01", "Old bankruptcy rumor"), sig("strong", "2026-10-01", "CEO resigns", "exec_departure")];
  assert.deepEqual(scoreBorrower(s, TODAY), { status: "yellow", why: "Yellow: CEO resigns (Oct 1)." });
});

test("invalid today throws", () => {
  assert.throws(() => scoreBorrower([], "10/10/2026"));
});
