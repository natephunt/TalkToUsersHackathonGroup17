# User Feedback Log

> The judges score **"what you changed after testers spoke, and why."** Every quote that changes the build goes here,
> together with the change it caused. P4 (Research) owns this file; anyone can add to it.

## Sense check 1: Idea (12–1 PM)

**Tested:** "Lenders miss early signs of borrower trouble between reporting dates, and finding out late costs them real money."
**Theme:** Catch what humans miss · **Status:** in progress (1 of 3 calls in)

### Tester 1 (assumption held: unclear)
- They talked about **vetting a loan application**, not monitoring an existing borrower. The trouble surfaced through interviews and a required cash flow chart, before the loan was made.
- **Red flags:** loans at **many other banks**, plus **small, slightly late payments** to those lenders.
- They declined the loan, so there was no financial loss. Finding out late cost **time, not money**.
- After the decline, follow-up happened only through personal conversations, with no formal process.

> "It didn't cost me anything financially. It just cost me time."
>
> "Honestly, I wish I woulda asked the cash flow documents a lot earlier in the process."
>
> "But if I had an ability to use a tool that would pick up this stuff sooner in the process, that would be great."

### What it might change (pending testers 2–3)
| Observation | Possible change | Decision |
|---|---|---|
| Red flags appeared **before** the loan (underwriting) | Also pitch it as a pre-loan screen, not only for monitoring | **Adopted 12:50.** Added an Applicants tab + live "Screen new applicant", and we lead the pitch with it. Monitoring is kept as the Portfolio tab (see `docs/PLAN.md` §0) |
| "Loans at many other banks" (stacking) | New signal: **new lender liens** (UCC filings) via search. `legal_layoffs` already searches "lien" | Wait for testers 2–3 |
| The cost was **time** | Lead with how much faster it finds trouble, not only losses avoided | Wait for testers 2–3 |

## Sense check 2: What we built (3–4 PM)
_TBD_

## Sense check 3: Our question (6–7 PM)
_TBD_
