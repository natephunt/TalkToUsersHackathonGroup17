# Early Warning — team context for Claude Code

Hackathon build. Hacking ends 8:00 PM PT; submit before then. First working version by 3:00 PM (Sense Check block 2).

## What we're building
An app for bank credit officers. It watches the companies a bank has lent money to and flags public signs of trouble before they show up in quarterly financials (which arrive 45–90 days after quarter end). Theme: catch what humans miss.

Target borrowers are mid-size PRIVATE companies: no analyst coverage, quarterly financials only. That is the whole point of the product.

## Stack
- Base44: app, screens, entities, backend functions. Code syncs 2-way with this GitHub repo through the main branch.
- Bright Data: all external data. The app's backend calls Bright Data's APIs directly. The Bright Data MCP is only for us while building.
- Sense AI (MCP): user testing. Only the Research owner launches checks.

## Team ownership (stay in your lane to avoid merge conflicts)
| Owner | Branch prefix | Owns |
|---|---|---|
| P1 App | `ui/` | Base44 screens, entities, Base44 settings and secrets, merging to main |
| P2 News data | `news/` | exec_departure and legal_layoffs signals (Bright Data SERP API), LLM tagging |
| P3 Jobs & reviews data | `jobs/` | hiring_drop and review_distress signals (job postings + Glassdoor), status scoring |
| P4 Research & pitch | `research/` | Sense checks, picking demo borrowers, feedback log, slides, demo script, QA |

Do not edit files owned by another role without asking in chat first.

## Data contract (do not change without telling the whole team)
Borrower:
- name, website_domain, hq_city, hq_state, industry
- stage: applicant | borrower (default borrower)
- loan_amount_usd (fictional; for applicants it is the requested amount), linkedin_url, glassdoor_url
- status: green | yellow | red
- why: one-line string
- last_refreshed: ISO timestamp, empty until the first refresh
- sources_unavailable: list of strings, only these values: News | Legal | Jobs | Reviews

Signal:
- borrower_id
- type: hiring_drop | review_distress | exec_departure | legal_layoffs
- severity: strong | weak
- date: YYYY-MM-DD
- title: short headline
- snippet: exact quote from the source, or a computed fact like "14 postings in last 30 days vs 37/month before"
- source_name, source_url

Every signal function takes a Borrower and returns a list of Signal objects in this shape. It never writes status.

## Signal rules
1. hiring_drop: job postings dated in the last 30 days vs the prior 60 days (normalized per 30 days). Drop ≥50% = strong, 25–50% = weak.
2. review_distress: Glassdoor. Any review in the last 90 days mentioning layoffs, furloughs, late or missed pay, or closing = strong. 90-day average rating ≥0.5 below the prior 12 months = weak.
3. exec_departure: Google News via Bright Data SERP API: `"<name>" (CEO OR CFO OR president OR founder) (resigns OR "steps down" OR departs)`, last 180 days. CEO/CFO = strong, other senior roles = weak.
4. legal_layoffs: Google News: `"<name>" (lawsuit OR sued OR lien OR "WARN notice" OR layoffs OR bankruptcy)`, last 180 days. WARN notice, bankruptcy, or a lender/supplier lawsuit = strong; others = weak.

## LLM use: tagging only
The LLM only tags a single review or article and returns JSON: relevant, same_company, signal_type, severity, snippet.
- The snippet must be copied exactly from the source, never written by the model.
- Use website_domain and hq_city to reject a different company with a similar name. If unsure, same_company = false.
- The LLM never decides a borrower's status.

## Status rules (plain code, owned by P3)
Count signals from the last 90 days only.
- RED: 2+ strong, or 1 strong + 2 weak
- YELLOW: 1 strong, or 2+ weak
- GREEN: otherwise

Build the "why" line from the rules, e.g. "Red: CFO departure (Sep 12) + job postings down 62% in 30 days."

## Refresh flow
refreshBorrower(borrower_id):
1. Runs all 4 signal functions.
2. Skips any source that fails and adds its name to sources_unavailable (exec_departure → News, legal_layoffs → Legal, hiring_drop → Jobs, review_distress → Reviews).
3. Replaces that borrower's Signals.
4. Applies the status rules and saves.

Screens read stored data only. Only the Refresh button calls Bright Data live, so the demo stays fast.

## Git rules
- `main` = what Base44 shows = the demo. Only merge code that runs. Merging to main syncs to Base44.
- Work on your own branch (`ui/...`, `news/...`, `jobs/...`, `research/...`). Pull main before you start.
- Small pull requests, merged at least every ~45 minutes. P1 merges.
- Base44 editor changes are committed to main automatically, so pull often.
- Code freeze on main at 7:30 PM. After that, only demo-breaking fixes.

## Secrets
- Never commit API keys or the Sense AI token. Use `.env` (it's in .gitignore) locally.
- Store the Bright Data key as a Base44 secret for backend functions.

## Sense AI
NEVER launch a Sense check without an explicit "launch" from P4 in chat. Each launch uses 1 of our team's 3 checks.

## Style
The UI should look like a bank's internal tool: clean, serious, no emojis. Status uses color plus a text label, never color alone. Every signal shows a clickable source link.
