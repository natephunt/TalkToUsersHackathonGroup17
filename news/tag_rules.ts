// Keyword tagger: instant, no key. Fallback when Devin is unavailable, and the baseline to compare Devin against.
import type { Borrower, Severity, SignalType, Tag, Tagger } from "./types.ts";

const DEPART = /\b(resign(s|ed|ing|ation)?|steps? down|stepped down|stepping down|depart(s|ed|ing|ure)?|exit(s|ed)?|ousted|leav(es|ing)|retir(es|ed|ing|ement))\b/i;
const EXEC_STRONG = /\b(ceo|cfo|chief executive|chief financial)\b/i;
const EXEC_WEAK = /\b(president|founder|coo|chief [a-z]+ officer)\b/i;

const LEGAL_STRONG = /\b(warn notice|bankrupt(cy)?|chapter (7|11)|(lender|supplier|vendor|landlord|creditor)s?\b[^.]{0,60}\b(su(es|ed)|lawsuit))\b/i;
const LEGAL_WEAK = /\b(lawsuit|su(es|ed)|lien|layoffs?|laid off|job cuts|clos(es|ed|ing|ure)s?|restructuring)\b/i;

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

function sentences(text: string): string[] {
  return text.split("\n").flatMap((line) => line.split(/(?<=[.!?])\s+/)).map((s) => s.trim()).filter(Boolean);
}

export function sameCompany(text: string, b: Borrower): boolean {
  const name = new RegExp(`\\b${escape(b.name)}\\b`, "i");
  return name.test(text);
}

export function tagRules(text: string, b: Borrower, hint: SignalType): Tag {
  const none: Tag = { relevant: false, same_company: sameCompany(text, b), signal_type: null, severity: null, snippet: "", reason: "no trigger keyword in any sentence" };
  const sents = sentences(text);
  const find = (re: RegExp, also?: RegExp) => sents.find((s) => re.test(s) && (!also || also.test(s)));

  let severity: Severity | null = null;
  let snippet: string | undefined;
  if (hint === "exec_departure") {
    if ((snippet = find(EXEC_STRONG, DEPART))) severity = "strong";
    else if ((snippet = find(EXEC_WEAK, DEPART))) severity = "weak";
  } else {
    if ((snippet = find(LEGAL_STRONG))) severity = "strong";
    else if ((snippet = find(LEGAL_WEAK))) severity = "weak";
  }
  if (!severity || !snippet) return none;
  return { relevant: true, same_company: none.same_company, signal_type: hint, severity, snippet, reason: `keyword match (${severity})` };
}

export const rulesTagger: Tagger = {
  name: "rules",
  tagMany: (items, b) => Promise.resolve(items.map((i) => tagRules(i.text, b, i.hint))),
};
