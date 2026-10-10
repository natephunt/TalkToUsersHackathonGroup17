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

1. **LLM for tagging.** Base44 app uses its built-in LLM. Locally we need one of: Claude/OpenAI key in `.env`,
   or rule-based tagging (keywords + name/city match, snippet = article description) until a key arrives.
   Devin is a coding agent, not a per-item LLM, so it is not used for tagging.
2. **Base44 access.** P2's account can't open app `6aca96c9744d6ba75bc4fabd` yet; P1 must invite us before we deploy.
3. **Runtime.** Base44 functions run on Deno. Locally: Deno (`brew install deno`) or Node 26.
