# Build-time open questions

Spec gaps hit while building Phase 1. Each has a **provisional default** (chosen to be the
strictest/most private reading of the spec) so work can continue. Once the founder decides,
move the answer into REQUIREMENTS.md §13 and update the code.

## Voting, roles, stages (packages/core)

| # | Question | Provisional default |
|---|---|---|
| Q1 | FR-5 personal link: can a link session add ideas, comment, fix idea details, set attendance? (D5 says "Everything"; P8 lists "Mark attendance") | Strict: view + vote only; everything else asks for the SMS code |
| Q2 | FR-74 group budget band definition | [lowest min, lowest max], rounded outward to 1 significant figure |
| Q3 | What does a budget range measure (trip total vs per activity)? | Per-person price of an idea, same currency only |
| Q4 | Duo budget tag when over both budgets | Adds "over both budgets" label |
| Q5 | `not_attending` members (M-9) | Don't count toward size; keep view, money view, record payment |
| Q6 | Pass count in small groups (DN-13) | Follow FR-42: show Pass count |
| Q7 | "Split opinions" label to people who haven't voted (D42 vs FR-41) | Shown only after you vote (blind rule wins) |
| Q8 | FR-T4 newcomers seeing earlier duo votes | Must-do/Down names shown (group rules), Pass as count only |
| Q9 | Solo → group directly: notice? Solo Skip votes visible to new partner? | No notice for solo→group; carried-over solo votes visible in duo |
| Q10 | Duo ranking order | In-votes, then Must-do count, then earliest |
| Q11 | Default shortlist size (4–6) | 5; never suggest ideas with no votes |
| Q12 | Stages: voting→collecting? | Not allowed; only reopen a set stage |
| Q13 | Can organizers set another member's attendance? | No: only the member or their manager |
| Q14 | Owner succession uses trip join date (we don't record promotion date) | Join date; managed members skipped |
| Q15 | Poll turnout exactly 50% | Counts as enough |
