# Early Warning: Master Build Plan

> How we build the system described in `CLAUDE.md` (Base44 + Bright Data, roles P1–P4).
> `CLAUDE.md` holds the **rules and data contract**. This file holds the **steps, order and done-when**.
> If they disagree, `CLAUDE.md` wins; fix this file. Hacking ends **8:00 PM PT**.
>
> **Updated 12:50, after Sense tester 1:** we now lead with **screening a company before the bank lends**, and keep
> **monitoring after the loan**. Same engine, two moments. See §6 for why.

## 0. What changed and why (pre-loan pivot)

Tester 1 (a lender) didn't describe a borrower who went bad after funding. They described vetting an **applicant**:
the red flags were **loans at many other banks** and **small late payments to them**. They wished they'd caught it
**earlier in the process**, because it cost them time.

| Before | Now |
|---|---|
| Watches companies a bank has **already lent to** | **Screens a company before the bank lends**, then keeps watching it after funding |
| Borrower list only | Two tabs: **Applicants** (screen before approving) and **Portfolio** (monitor) |
| Everything pre-loaded, Refresh is the only live call | **"Screen new applicant"** is live in the demo. News arrives in seconds; jobs and reviews fill in as they arrive |
| 4 signals | Same 4, plus a **stretch** "stacking" check (new lenders/liens) if a data source is feasible |

Unchanged: the 4 signal rules, the status rules, tagging-only LLM, snippet guard, source link on every signal, theme (*Catch what humans miss*).

## 1. The system in one picture

```
 Base44 app (P1)
 ┌────────────────────────────────────────────────────────────────────────┐
 │ Tabs: Applicants | Portfolio   ·  Company detail (timeline)            │
 │ [Screen new applicant] form    ·  [Refresh] button                     │
 │      │ read only                              │ both call:             │
 │      ▼                                        ▼                        │
 │ Entities: Borrower(stage), Signal   Backend fn: refreshBorrower(id)    │
 │      ▲                                 │                               │
 │      └──── replace Signals, save status┤                               │
 │                                        ├─ newsSignals(b)      (P2)  fast, seconds
 │                                        ├─ hiringSignal(b)     (P3)  slow, snapshot
 │                                        ├─ reviewSignals(b)    (P3)  slow, snapshot
 │                                        ├─ tagItem(item, b)    (P2)  ← LLM, tagging only
 │                                        └─ scoreBorrower(sigs) (P3)  ← plain code
 └────────────────────────────────────────┼──────────────────────────────┘
                                          ▼
              Bright Data: SERP via zone mcp_unlocker (Google News JSON) · Web Scraper API (jobs, Glassdoor)
```

**Demo story (P4 owns the script):**
1. A credit officer gets a new loan application. They click **Screen new applicant** and type the company name, domain and city.
2. Within seconds, news signals appear. Job postings and reviews fill in a moment later. Status turns **Red**:
   *"Red: CFO departure (Sep 12) + job postings down 62% in 30 days."* They click a source link to the real article.
3. The officer asks for cash-flow documents **before** spending a week on the deal (Tester 1's exact wish).
4. Switch to **Portfolio**: the same checks keep running on companies already lent to; one has turned Yellow since funding.

## 2. Base44 building blocks (P1 creates, everyone codes against them)

### Entities
**Borrower:** `name`, `website_domain`, `hq_city`, `hq_state`, `industry`, `loan_amount_usd` (fictional; requested amount
for applicants, outstanding for portfolio), `linkedin_url`, `glassdoor_url`, `status` (green | yellow | red), `why`,
`last_refreshed` (ISO), `sources_unavailable` (string[]),
**`stage` (applicant | portfolio)** ← *new, additive; tell the team*

**Signal:** `borrower_id`, `type` (hiring_drop | review_distress | exec_departure | legal_layoffs), `severity` (strong | weak),
`date` (YYYY-MM-DD), `title`, `snippet`, `source_name`, `source_url`

*Optional after 3 PM:* **Decision** on applicants (`approve` | `ask_for_docs` | `decline`, `note`) and **Feedback** on signals
(`useful` | `false_alarm` | `wrong_company`). These give us something to show when judges ask about user feedback.

### Backend functions (Base44 backend functions, Bright Data key stored as a Base44 secret)
| Function | Owner | Input → Output | Calls |
|---|---|---|---|
| `newsSignals` | P2 | Borrower → Signal[] (exec_departure + legal_layoffs) | SERP, `tagItem` |
| `tagItem` | P2 | (item text + url, Borrower) → `{relevant, same_company, signal_type, severity, snippet}` | LLM (Base44's built-in LLM integration if available, else an API key secret) |
| `hiringSignal` | P3 | Borrower → Signal[] (0 or 1 hiring_drop) | Web Scraper API (LinkedIn jobs or Indeed) |
| `reviewSignals` | P3 | Borrower → Signal[] (review_distress) | Web Scraper API (Glassdoor), `tagItem` for the strong case |
| `scoreBorrower` | P3 | Signal[] + today → `{status, why}` | none (pure code) |
| `refreshBorrower` | P1 | borrower_id → updated Borrower + Signals. **Saves after each source finishes**, so the screen fills in progressively | all of the above |
| `screenApplicant` | P1 | form fields → new Borrower(stage=applicant) → `refreshBorrower` | `refreshBorrower` |
| `refreshAll` | P1 | none → refreshes all seeded companies | `refreshBorrower` |

**Signal-function contract (from `CLAUDE.md`):** takes a Borrower and returns `Signal[]`. It **never** writes status.
On failure it throws, with the source name in the message (`"serp"`, `"linkedin_jobs"`, `"indeed"`, `"glassdoor"`).
`refreshBorrower` catches the error, adds it to `sources_unavailable` and keeps going.

### Rules everyone must hold to
- **Snippet guard (P2, used by P3 too):** after tagging, drop the tag unless `snippet` is an exact substring of the source
  text (compare after collapsing whitespace). Never let a model-written sentence reach the screen.
- **Same company:** reject unless the article or review matches `website_domain` or `hq_city`. If unsure, set `same_company=false`.
  This matters even more for applicants, since nobody has checked these companies yet.
- **Status** is computed only in `scoreBorrower`, with the same rules for both stages: count only the last 90 days.
  RED = 2+ strong or 1 strong + 2 weak. YELLOW = 1 strong or 2+ weak.
- **Why line:** `"<Status>: "` + up to 2 top signals (strong first, then newest) joined with `" + "`.
  Green: `"Green: no warning signs in the last 90 days."`
- **Screens read entities only.** Only Refresh and Screen-new-applicant call Bright Data.

## 3. Bright Data: how each source works

| Source | API | Flow |
|---|---|---|
| News (P2) | **SERP via zone `mcp_unlocker`** (verified working 12:44) | `POST https://api.brightdata.com/request`, `Authorization: Bearer <key>`, body `{"zone":"mcp_unlocker","url":"https://www.google.com/search?q=<query>&tbm=nws&tbs=qdr:m6&hl=en&gl=us&brd_json=1","format":"raw"}`. This returns **parsed JSON** (`search_type: "news"`, results under `news`). `tbs=qdr:m6` = last 6 months |
| Jobs (P3) | **Web Scraper API**, LinkedIn job listings or Indeed dataset | trigger (company URL) → poll progress → download snapshot → count postings by posted date |
| Reviews (P3) | **Web Scraper API**, Glassdoor reviews dataset | trigger (glassdoor_url) → poll → download → reviews with date, rating, text |

- **P2:** confirm the field names inside `news[]` (title, link, source, date) on the first real call, and put them in §8.
- **Dataset IDs:** look them up with the Bright Data MCP (`search_scrapers`, `get_scraper_details`) and confirm the
  endpoints at docs.brightdata.com. Post them in chat and add them to §8.
- **Snapshots can take minutes**, which is now a bigger deal because screening an applicant is live. Use the synchronous
  scrape endpoint if the dataset supports it. Otherwise refresh triggers the snapshot and saves its ID, and a second call
  or a UI poll collects it, while the screen shows "Checking job postings…". News must never wait on snapshots.
- **Every Bright Data call gets a timeout** (≈60–90 s) plus one retry, then throws so the source counts as unavailable.

## 4. Roles and tasks by time block

Put names here: **P1** ____ · **P2** ____ · **P3** ____ · **P4** ____

### P1: App (`ui/`): Base44 screens, entities, secrets, merges
- [ ] **now** Create the Base44 app, the **Borrower** (with `stage`) and **Signal** entities and the `BRIGHTDATA_API_KEY` secret. Post the repo folder layout Base44 syncs in chat.
- [ ] **now** Seed placeholder companies (2 applicants, 3 portfolio) plus a few fake Signals so the screens can be built immediately
- [ ] **by 1:30** **Applicants | Portfolio** tabs (status color **and** text label, why line), company detail (timeline newest first, a clickable source on every row), Refresh button
- [ ] **by 2:30** **Screen new applicant** form → `screenApplicant`; `refreshBorrower` saves after each source so the screen fills in progressively; `refreshAll`
- [ ] **by 3:00** Published URL working with real data → hand to P4 for sense check 2
- [ ] **after 3** Applicant decision buttons (approve / ask for docs / decline), signal feedback, `sources_unavailable` banner, polish to look like a bank's internal tool

### P2: News data (`news/`): SERP + LLM tagging
- [ ] **now** First real call with zone `mcp_unlocker` (see §3) for one company. Record the `news[]` field names in §8
- [ ] **by 1:00 (M1)** `newsSignals` for **one** company, end to end: SERP → `tagItem` → snippet guard → Signal[] saved and visible in the app
- [ ] **by 2:00** Both queries (exec + legal), severity rules, same-company rejection, 180-day window
- [ ] **by 2:30** `tagItem` reusable by P3 (review text in, same JSON out)
- [ ] **after 3 (stretch) Stacking check feasibility, 20 min:** can we find **new lenders or liens** (UCC filings, lender lawsuits, merchant cash advances) for a test company through Bright Data, either from news or a state UCC search page? If yes, propose a signal type `lender_liens` (additive contract change; tell the team). If no, P4 puts it in the pitch as the next step
- [ ] **after 3** Timeouts/retry, cache tags by `source_url` so refresh doesn't re-tag

### P3: Jobs & reviews (`jobs/`): Web Scraper API + scoring
- [ ] **now** `scoreBorrower` + why line first. It's pure code and testable without any API, so write the test cases from §2 first
- [ ] **now** Use the MCP to pick the dataset (LinkedIn jobs vs Indeed) and Glassdoor reviews dataset IDs, run one manual trigger → snapshot, and **time it** (decides sync vs two-step)
- [ ] **by 2:00** `hiringSignal`: last 30 days vs prior 60 ÷ 2, ≥50% drop = strong, 25–50% = weak, skip if the prior 60 had 0
- [ ] **by 2:30** `reviewSignals`: strong via `tagItem` (layoffs, furloughs, late/missed pay, closing), weak via 90-day average vs prior 12 months
- [ ] **after 3** Timeouts/retry, async snapshot handling hardened

### P4: Research & pitch (`research/`): Sense, companies, feedback, demo, QA
- [ ] **now** Sense check 1 results → `docs/USER_FEEDBACK.md` (in progress). Watch whether testers 2–3 also talk about pre-loan screening
- [ ] **by 1:15** Pick the demo companies, all mid-size private with LinkedIn + Glassdoor pages:
  **2 applicants** (one visibly in trouble, one clean), **3 portfolio** (one in trouble), plus **1 extra company for the live
  "Screen new applicant" moment**, verified beforehand so it reliably turns Yellow or Red. Hand the fields to P1
- [ ] **by 3:00** Update the Sense product description to the pre-loan + monitoring pitch, then prepare sense check 2 on P1's published URL. **Launch only on explicit "launch" (3–4 PM)**
- [ ] **4–6** QA every company: each signal's link opens, the snippet appears on the page, the status matches the rules
- [ ] **6–7** Sense check 3 with our own question (draft: *"If this flagged an applicant red before you'd spent time on the deal, what would you do next, and would you trust it without checking yourself?"*)
- [ ] **7:00** Demo script, receipts slide (*Tester 1: "I wish I'd asked for the cash flow documents a lot earlier"* → we added pre-loan screening), submission. Export each company's data to `data/cache/{id}.json` (sample JSON deliverable)

## 5. Milestones

| Time | Milestone | Done when |
|---|---|---|
| **1:00** (realistic 1:30) | **M1** | One company, news via SERP, tagged, saved, visible in the Base44 detail screen with a working source link |
| **3:00** | **M2** | All 4 signals, scoring, all seeded companies refreshed, **Screen new applicant works live (news at minimum)**, published URL, sense check 2 ready |
| 3–4 | Sense check 2 | Launched on the published URL |
| 4–6 | **M3** | A failing source → `sources_unavailable`, no crash. The pre-loan change is logged in `USER_FEEDBACK.md` as our tester-driven change |
| 6–7 | Sense check 3 | Launched |
| **7:30** | **Code freeze** on `main` (per `CLAUDE.md`) | Only demo-breaking fixes after this |
| **8:00** | **Submit** | Repo, published URL, sample JSON for every company, demo rehearsed twice |

## 6. What testers have said (keep updating; full detail in `docs/USER_FEEDBACK.md`)

- **Tester 1** described **vetting a loan application**, not monitoring an existing borrower. Their red flags: **loans at many
  other banks** and **small late payments to them**. Finding out late cost them **time, not money**:
  *"I wish I woulda asked the cash flow documents a lot earlier in the process."*
- **Decided (12:50):** add pre-loan screening and lead with it (this plan). Lead the pitch with **time saved**.
- **Open:** the stacking/liens signal (P2 stretch). **If testers 2–3 push back on pre-loan, monitoring is still fully built.**

## 7. Risks and fallbacks

| Risk | Fallback |
|---|---|
| Live applicant screening waits on slow job and review snapshots | Progressive saves: news shows first, jobs and reviews fill in. In the demo, screen a company whose snapshots were warmed up beforehand |
| Pivoting on one tester | Monitoring stays (Portfolio tab). We only *added* a moment |
| The LLM invents a snippet or mixes up companies with similar names | Snippet guard + `same_company=false` when unsure. QA'd by P4 |
| A demo company comes up all green | P4 checks each one before 3 PM; the live-screen company is verified beforehand |
| Base44 ↔ GitHub sync conflicts | Pull often; P1 merges; small PRs every ~45 minutes (per `CLAUDE.md`) |
| A key leaks (the repo is **public**) | Keys only in Base44 secrets or local `.env`; never in code or docs |
| Bright Data credits run out | Everyone redeems promo `talk2users26` ($300 each). Refresh one company at a time |

**Sponsor add-ons** (Devin, Clerk, MongoDB, Daytona) are optional and only after M2: see `docs/SPONSOR_ADDONS.md`.

## 8. Lookups (fill in as we find them)

| What | Value | Found by |
|---|---|---|
| SERP zone | **`mcp_unlocker`**: Google News with `tbm=nws&brd_json=1` returns parsed JSON (verified 12:44) | P4 |
| `news[]` field names | | P2 |
| LinkedIn jobs dataset ID | | P3 |
| Indeed jobs dataset ID | | P3 |
| Glassdoor reviews dataset ID | | P3 |
| Snapshot time (trigger → ready) | | P3 |
| Base44 app URL (editor / published) | | P1 |
| Base44 repo layout (functions/entities folders) | | P1 |
