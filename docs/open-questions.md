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

## Money (packages/core/src/money)

| # | Question | Provisional default |
|---|---|---|
| Q16 | Unclaimed itemized items after the claim window (DN-17) | Block until the uploader assigns or absorbs (FR-62) |
| Q17 | Receipt doesn't add up (E-6) | Block; gap can be assigned to one person or split evenly |
| Q18 | Leftover pennies: lowest member id vs rotate per expense (E-21) | Lowest member id (rotation available) |
| Q19 | Guest of honor's items on itemized receipts | Spread over everyone else in proportion to subtotal |
| Q20 | Refund larger than original | Rejected |
| Q21 | Adjustments change net balance only (not per-person spend) | Net balance only |
| Q22 | Late joiners on itemized expenses (FR-12) | Even splits only |
| Q23 | Not built: multiple payers (E-17), "covered by" (E-15), personal tracking-only (E-14) | Out of scope until specced |
| Q24 | Duplicate receipt window | ±24 h |

## Plan optimizer (packages/core/src/optimizer)

| # | Question | Provisional default |
|---|---|---|
| Q25 | Suggestion for items with no location/time hint | Added `place_manually` (FR-O14) |
| Q26 | Undated mode: assign times? | Times by meal/pace windows; hours ignored |
| Q27 | Thresholds: late arrival cutoff, buffers, day bounds | 4pm → dinner only; 60 min buffers; 7am–3am |
| Q28 | What makes a plan "out of date" (FR-O17) | Planned items, details, attendance, members, Stop changes |
| Q29 | "Packed day" hint threshold (FR-O6 example is exactly the balanced cap) | Fires above the pace cap |
| Q30 | Side plans proactive? | Only when main plan has no room |
| Q31 | Check-in/out modelling; weather (FR-O11 stretch) | Not modelled |

## AI intake (packages/ai)

| # | Question | Provisional default |
|---|---|---|
| Q32 | research/edge-cases.md labels prompt injection C-20 and SSRF C-21 (reverse of CLAUDE.md §6.3) | Followed CLAUDE.md; edge-case file needs fixing |
| Q33 | On a Claude refusal, use server-side model fallback? (switches models) | No; fall back to heuristic |
| Q34 | Google terms: lat/lng only cacheable ~30 days | Coordinates kept in the short-lived display cache; refresh needed |
| Q35 | Listicle Places lookups (up to 15) cost cap | 15 max, 4 concurrent |
| Q36 | Extraction effort `medium` vs NFR-1 15 s | Needs live eval run with a key |

## Web platform (apps/web)

| # | Question | Provisional default |
|---|---|---|
| Q37 | Opening a personal link turns an `invited` member `active` (being on the invite list = approval) | Yes |
| Q38 | Personal link opened on a second device | Refused; asks for sign-in code |
| Q39 | Recycled-number recheck (J-4) second factor | `needsRecheck` blocks full actions; recheck step not built |
| Q40 | FR-86 banned-word list for trip names in texts | Strict ("Wine country" → "your trip") |
| Q41 | Not built yet: quiet hours (N-5), per-trip MUTE (N-2), delivery callbacks, server-side session revocation | Later slices |
