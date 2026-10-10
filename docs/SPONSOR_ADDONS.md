# Sponsor add-ons (optional, after 3 PM)

The core build stays Base44 + Bright Data, as described in `CLAUDE.md`. None of the items below are on the critical path.
Pick them up only after Milestone 2 (3:00 PM) and only if they don't put the demo at risk. The owner decides; P1 merges.

| Sponsor | Prize | Cheapest real use | Time box | Suggested owner |
|---|---|---|---|---|
| **Cognition (Devin)** | $500 | Use Devin as a **builder** on one well-scoped task (for example, the Glassdoor collector or status-scoring tests), with the PR credited to Devin. No runtime dependency | Background, all afternoon | P3 or P2 |
| **Clerk** | $250 | Sign-in plus one organization = "the lender" in front of the Base44 app, roles `admin` / `analyst`. Base44 has its own auth, so only do this if it plugs in cleanly | 45 min, then drop it | P1 |
| **MongoDB Atlas** | credit only | Store **status history + alert feedback** (useful / false alarm / wrong company) from a Base44 backend function. Base44 entities remain the main store | 45 min | P1 or P3 |
| **Daytona** | $250 | Run a batch "rebuild all borrowers" script in a sandbox, so slow Bright Data snapshot jobs don't block a laptop | 30 min | P2 |

## Keys
Keys are shared privately in the team chat, **never in this repo** (it's public). Note that the MongoDB key starting with `al-` looks like an
Atlas AI model key. A database connection needs the `mongodb+srv://` URI from Atlas → Connect → Drivers.

## Prize checklist for the pitch
- Bright Data (grand prize, $750): every signal comes from Bright Data APIs. Show a source link in the demo.
- Base44 ($750): the whole app runs in Base44.
- Every add-on above that we use gets one sentence in the demo script (P4).
