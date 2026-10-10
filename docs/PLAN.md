# Early Warning: Master Build Plan

> How we build the system described in `CLAUDE.md` (Base44 + Bright Data, roles P1–P4).
> `CLAUDE.md` holds the **rules and data contract**. This file holds the **steps, order and done-when**.
> If they disagree, `CLAUDE.md` wins; fix this file. Hacking ends **8:00 PM PT**.

## 1. The system in one picture

```
 Base44 app (P1)
 ┌──────────────────────────────────────────────────────────────────────┐
 │ Screens: Borrower list · Borrower detail (timeline) · Alert review   │
 │      │ read only                              │ Refresh button        │
 │      ▼                                        ▼                       │
 │ Entities: Borrower, Signal        Backend fn: refreshBorrower(id)     │
 │      ▲                                 │                              │
 │      └──── replace Signals, save status┤                              │
 │                                        ├─ newsSignals(b)      (P2)    │
 │                                        ├─ hiringSignal(b)     (P3)    │
 │                                        ├─ reviewSignals(b)    (P3)    │
 │                                        ├─ tagItem(item, b)    (P2)  ← LLM, tagging only
 │                                        └─ scoreBorrower(sigs) (P3)  ← plain code
 └────────────────────────────────────────┼─────────────────────────────┘
                                          ▼
                    Bright Data APIs: SERP API (Google News) · Web Scraper API (jobs, Glassdoor)
```

**Demo story (P4 owns the script):** a credit officer opens the list, sees one borrower in **Red** with the line
*"Red: CFO departure (Sep 12) + job postings down 62% in 30 days."*, opens it, clicks a source link to the real
article, then hits **Refresh** live on one borrower.

## 2. Base44 building blocks (P1 creates, everyone codes against them)

### Entities
**Borrower:** `name`, `website_domain`, `hq_city`, `hq_state`, `industry`, `loan_amount_usd` (fictional),
`linkedin_url`, `glassdoor_url`, `status` (green | yellow | red), `why`, `last_refreshed` (ISO), `sources_unavailable` (string[])

**Signal:** `borrower_id`, `type` (hiring_drop | review_distress | exec_departure | legal_layoffs), `severity` (strong | weak),
`date` (YYYY-MM-DD), `title`, `snippet`, `source_name`, `source_url`

*Optional after 3 PM:* **Feedback** (`signal_id`, `verdict`: useful | false_alarm | wrong_company, `note`), which supports the alert-review screen.

### Backend functions (Base44 backend functions, Bright Data key stored as a Base44 secret)
| Function | Owner | Input → Output | Calls |
|---|---|---|---|
| `newsSignals` | P2 | Borrower → Signal[] (exec_departure + legal_layoffs) | SERP API, `tagItem` |
| `tagItem` | P2 | (item text + url, Borrower) → `{relevant, same_company, signal_type, severity, snippet}` | LLM (Base44's built-in LLM integration if available, else an API key secret) |
| `hiringSignal` | P3 | Borrower → Signal[] (0 or 1 hiring_drop) | Web Scraper API (LinkedIn jobs or Indeed) |
| `reviewSignals` | P3 | Borrower → Signal[] (review_distress) | Web Scraper API (Glassdoor), `tagItem` for the strong case |
| `scoreBorrower` | P3 | Signal[] + today → `{status, why}` | none (pure code) |
| `refreshBorrower` | P1 | borrower_id → updated Borrower + Signals | all of the above |
| `refreshAll` | P1 | none → refreshes all 5 (seed + rebuild) | `refreshBorrower` |

**Signal-function contract (from `CLAUDE.md`):** takes a Borrower and returns `Signal[]`. It **never** writes status.
On failure it throws, with the source name in the message (`"serp"`, `"linkedin_jobs"`, `"indeed"`, `"glassdoor"`).
`refreshBorrower` catches the error, adds it to `sources_unavailable` and keeps going.

### Rules everyone must hold to
- **Snippet guard (P2, used by P3 too):** after tagging, drop the tag unless `snippet` is an exact substring of the source
  text (compare after collapsing whitespace). Never let a model-written sentence reach the screen.
- **Same company:** reject unless the article or review matches `website_domain` or `hq_city`. If unsure, set `same_company=false`.
- **Status** is computed only in `scoreBorrower`: count only the last 90 days. RED = 2+ strong or 1 strong + 2 weak. YELLOW = 1 strong or 2+ weak.
- **Why line:** `"<Status>: "` + up to 2 top signals (strong first, then newest) joined with `" + "`.
  Green: `"Green: no warning signs in the last 90 days."`
- **Screens read entities only.** Only Refresh calls Bright Data.

## 3. Bright Data: how each source works

| Source | API | Flow |
|---|---|---|
| News (P2) | **SERP API** | One request per query to Google News, last 180 days. Parse the results (title, url, date, outlet). Fetch the article text if needed for the snippet (Bright Data `scrape_as_markdown`-style request) |
| Jobs (P3) | **Web Scraper API**, LinkedIn job listings or Indeed dataset | trigger (company URL) → poll progress → download snapshot → count postings by posted date |
| Reviews (P3) | **Web Scraper API**, Glassdoor reviews dataset | trigger (glassdoor_url) → poll → download → reviews with date, rating, text |

- **Dataset IDs and SERP zone:** look them up with the Bright Data MCP (`search_scrapers`, `get_scraper_details`) and
  confirm the endpoints at docs.brightdata.com. Post them in chat and add them to §8 of this file.
- **Snapshots can take minutes.** A backend function may time out. Use the synchronous scrape endpoint if the dataset
  supports it. Otherwise make two calls: refresh triggers the snapshot and saves its ID, and a second call or a UI poll collects it.
  Test this on **one** borrower before wiring it to the button.
- **Every Bright Data call gets a timeout** (≈60–90 s) plus one retry, then throws so the source counts as unavailable.

## 4. Roles and tasks by time block

Put names here: **P1** ____ · **P2** ____ · **P3** ____ · **P4** ____

### P1: App (`ui/`): Base44 screens, entities, secrets, merges
- [ ] **now** Create the Base44 app, the **Borrower** and **Signal** entities and the `BRIGHTDATA_API_KEY` secret. Post the repo folder layout Base44 syncs (where functions and entities live) in chat.
- [ ] **now** Seed 5 placeholder borrowers plus a few fake Signals so the screens can be built immediately
- [ ] **by 1:30** Borrower list (status color **and** text label, why line), Borrower detail (timeline newest first, a clickable source on every row), Refresh button
- [ ] **by 2:30** `refreshBorrower` + `refreshAll`, wired to P2/P3 functions as they merge
- [ ] **by 3:00** Published URL working with real data for all 5 → hand to P4 for sense check 2
- [ ] **after 3** Alert review (useful / false alarm / wrong company), `sources_unavailable` banner, polish to look like a bank's internal tool

### P2: News data (`news/`): SERP API + LLM tagging
- [ ] **now** SERP zone + one test query through the Bright Data MCP for a real borrower name
- [ ] **by 1:00 (M1)** `newsSignals` for **one** borrower, end to end: SERP → `tagItem` → snippet guard → Signal[] saved and visible in the app
- [ ] **by 2:00** Both queries (exec + legal), severity rules, same-company rejection, 180-day window
- [ ] **by 2:30** `tagItem` reusable by P3 (review text in, same JSON out)
- [ ] **after 3** Timeouts/retry, cache tags by `source_url` so refresh doesn't re-tag, possible lien/UCC signal (see §6)

### P3: Jobs & reviews (`jobs/`): Web Scraper API + scoring
- [ ] **now** `scoreBorrower` + why line first. It's pure code and testable without any API, so write the test cases from §2 first
- [ ] **now** Use the MCP to pick the dataset (LinkedIn jobs vs Indeed) and Glassdoor reviews dataset IDs, then run one manual trigger → snapshot
- [ ] **by 2:00** `hiringSignal`: last 30 days vs prior 60 ÷ 2, ≥50% drop = strong, 25–50% = weak, skip if the prior 60 had 0
- [ ] **by 2:30** `reviewSignals`: strong via `tagItem` (layoffs, furloughs, late/missed pay, closing), weak via 90-day average vs prior 12 months
- [ ] **after 3** Timeouts/retry, async snapshot handling hardened

### P4: Research & pitch (`research/`): Sense, borrowers, feedback, demo, QA
- [ ] **now** Sense check 1 results → `docs/USER_FEEDBACK.md` (in progress)
- [ ] **by 1:15** Pick the **5 demo borrowers**: mid-size private, with LinkedIn + Glassdoor pages, **1–2 visibly in trouble** (recent WARN notice, layoffs, exec exit). Verify each with the Bright Data MCP. Hand the fields to P1
- [ ] **by 3:00** Sense check 2 prepared on P1's published URL. **Launch only on explicit "launch" (3–4 PM)**
- [ ] **4–6** QA every borrower: each signal's link opens, the snippet appears on the page, the status matches the rules
- [ ] **6–7** Sense check 3 with our own question (draft: *"Would you trust a red flag enough to call the borrower without checking it yourself first?"*)
- [ ] **7:00** Demo script, receipts slide (the tester quote → what we changed), submission. Export each borrower's data to `data/cache/{id}.json` (sample JSON deliverable)

## 5. Milestones

| Time | Milestone | Done when |
|---|---|---|
| **1:00** (realistic 1:30) | **M1** | One borrower, news via the SERP API, tagged, saved, visible in the Base44 detail screen with a working source link |
| **3:00** | **M2** | All 4 signals, scoring, all 5 borrowers refreshed, published URL, sense check 2 ready |
| 3–4 | Sense check 2 | Launched on the published URL |
| 4–6 | **M3** | A failing source → `sources_unavailable`, no crash. **At least one change made because of tester feedback**, logged in `USER_FEEDBACK.md` |
| 6–7 | Sense check 3 | Launched |
| **7:30** | **Code freeze** on `main` (per `CLAUDE.md`) | Only demo-breaking fixes after this |
| **8:00** | **Submit** | Repo, published URL, sample JSON for all 5, demo rehearsed twice |

## 6. What testers have said so far (keep updating; full detail in `docs/USER_FEEDBACK.md`)

- Tester 1 described **vetting a loan application**, not monitoring an existing borrower. Their red flags: **loans at many other banks** and **small late payments to them**. Finding out late cost them **time, not money**.
- **Candidate changes (decide after testers 2–3):** (a) pitch it as a pre-loan screen as well as monitoring, (b) add a "new lender lien / UCC filing" signal (P2: `legal_layoffs` already searches "lien"), (c) lead the pitch with time saved.

## 7. Risks and fallbacks

| Risk | Fallback |
|---|---|
| Web Scraper snapshots too slow for a backend function | Two-phase refresh (trigger, then collect). Demo the Refresh button on the news source only, and pre-load jobs and reviews |
| The LLM invents a snippet or mixes up companies with similar names | Snippet guard + `same_company=false` when unsure. QA'd by P4 |
| A demo borrower comes up all green | P4 picks 1–2 visibly troubled companies and checks them before 3 PM |
| Base44 ↔ GitHub sync conflicts | Pull often; P1 merges; small PRs every ~45 minutes (per `CLAUDE.md`) |
| A key leaks (the repo is **public**) | Keys only in Base44 secrets or local `.env`; never in code or docs |
| Bright Data credits run out | Everyone redeems promo `talk2users26` ($300 each). Refresh one borrower at a time |

**Sponsor add-ons** (Devin, Clerk, MongoDB, Daytona) are optional and only after M2: see `docs/SPONSOR_ADDONS.md`.

## 8. Lookups (fill in as we find them)

| What | Value | Found by |
|---|---|---|
| SERP API zone | | P2 |
| LinkedIn jobs dataset ID | | P3 |
| Indeed jobs dataset ID | | P3 |
| Glassdoor reviews dataset ID | | P3 |
| Base44 app URL (editor / published) | | P1 |
| Base44 repo layout (functions/entities folders) | | P1 |
