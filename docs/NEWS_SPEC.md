# P2 News signals: spec

Owner: P2 (`news/` branch). Goal by 1:30: `newsSignals` working for **one company**, end to end.
Rules and the data contract live in `CLAUDE.md`; this file is how P2 implements them.

## What it does

```
Borrower ──► 2 Google News searches (Bright Data SERP) ──► filter (180 days, dedupe by link)
        ──► tagItem per article (LLM, JSON only) ──► keep: relevant + same_company + snippet guard passes
        ──► Signal[]  (never writes status)
```

### 1. Search (Bright Data SERP, zone `mcp_unlocker`)
`POST https://api.brightdata.com/request`, `Authorization: Bearer $BRIGHTDATA_API_KEY`, body:
`{"zone":"mcp_unlocker","url":"https://www.google.com/search?q=<q>&tbm=nws&tbs=qdr:m6&hl=en&gl=us&brd_json=1","format":"raw"}`

| Query | Signal type |
|---|---|
| `"<name>" (CEO OR CFO OR president OR founder) (resigns OR "steps down" OR departs)` | exec_departure |
| `"<name>" (lawsuit OR sued OR lien OR "WARN notice" OR layoffs OR bankruptcy)` | legal_layoffs |

Response (verified 1:15): `news[]` items have `title`, `link`, `source`, `description`, `date`
(plus `source_logo`, `image` as base64, ignored). No results → `news` missing and `general.empty: true`.
`date` is either relative (`"1 month ago"`, `"3 days ago"`) or absolute (`"Jul 9, 2026"`); we convert both to YYYY-MM-DD.
A call takes ~20 s. Timeout 60 s, one retry, then throw `News` (exec query) / `Legal` (legal query).

### 2. Tag (`tagItem`)
Input: article text (title + description) + url + Borrower. Output JSON:
`{relevant, same_company, signal_type, severity, snippet}`.
- `same_company` true only if the text matches the borrower's `website_domain` or `hq_city`, or the name is unambiguous; unsure = false.
- Severity: CEO/CFO departure, WARN notice, bankruptcy, lender/supplier lawsuit = strong; other relevant = weak.
- `snippet` must be copied from the input text.

### 3. Snippet guard
Drop the tag unless `snippet` is an exact substring of the source text after collapsing whitespace.

### 4. Output Signal
`{borrower_id, type, severity, date, title, snippet, source_name, source_url}` — `title` = article title,
`source_name` = `source`, `source_url` = `link`.

## How we test it locally

| Test | Network? | What it checks |
|---|---|---|
| Unit tests | no | date parsing, 180-day filter, dedupe, snippet guard, Signal shape |
| Fixture run | no | full pipeline on saved SERP responses in `dev/fixtures/` (saves credits) |
| Live run | yes | one real company, real SERP + real LLM |
| Test page `dev/news-console` | either | type a company, see raw results → each tag (pass/fail + reason) → final Signals with links |

## Open decisions

1. **Tagging.** Two taggers: `rules` (keywords, instant, no key) and `devin` (one Devin session tags all of a
   borrower's articles via structured output; minutes, needs `DEVIN_API_KEY`). Known rules weakness: any mention of a
   past bankruptcy counts as strong. The snippet guard runs on both.
2. **Base44 access.** Needed to save Signals into the app.
3. **Runtime.** Deno 2.9 (same as Base44). `deno task test`, `deno task news <id> [--live]`, `deno task console`.

## Future: LinkedIn people check (not started; needs team OK, it adds a signal type)

- **Exec moves:** pull the CEO/CFO/founder profiles from the borrower's LinkedIn company page (Bright Data LinkedIn
  people dataset). If a profile's current employer is no longer the borrower, that is an executive departure, often
  visible before any news story. Dedupe against news `exec_departure` by person name.
- **Headcount:** record the company page's employee count on each refresh; a sustained drop is a weak signal.
- Source link on every signal = the LinkedIn profile or company page.
