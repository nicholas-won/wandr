# Build-time open questions

Spec gaps hit while building Phase 1. Each has a **provisional default** (chosen to be the
strictest/most private reading of the spec) so work can continue. Once the founder decides,
move the answer into REQUIREMENTS.md §13 and update the code.

## Voting, roles, stages (packages/core)

| # | Question | Provisional default |
|---|---|---|
| Q1 | FR-5 personal link: can a link session add ideas, comment, fix idea details, set attendance? (D5 says "Everything"; P8 lists "Mark attendance") | Strict: view + vote only; everything else asks for the SMS code. **DECIDED (D67):** view + vote only. First open: "What's your name?" (invite name prefilled, editable) then "Confirm your number" (skippable). After 2 votes a dismissible prompt (at most once a day) asks to confirm the number to unlock ideas, comments and the rest |
| Q2 | FR-74 group budget band definition | [lowest min, lowest max], rounded outward to 1 significant figure |
| Q3 | What does a budget range measure (trip total vs per activity)? | Per-person price of an idea, same currency only |
| Q4 | Duo budget tag when over both budgets | Adds "over both budgets" label |
| Q5 | `not_attending` members (M-9) | Don't count toward size; keep view, money view, record payment |
| Q6 | Pass count in small groups (DN-13) | Follow FR-42: show Pass count. **DECIDED:** keep (built) |
| Q7 | "Split opinions" label to people who haven't voted (D42 vs FR-41) | Shown only after you vote (blind rule wins). **DECIDED:** keep (built) |
| Q8 | FR-T4 newcomers seeing earlier duo votes | Must-do/Down names shown (group rules), Pass as count only. **DECIDED:** keep (built) |
| Q9 | Solo → group directly: notice? Solo Skip votes visible to new partner? | No notice for solo→group; carried-over solo votes visible in duo. **DECIDED:** keep (built) |
| Q10 | Duo ranking order | In-votes, then Must-do count, then earliest. **DECIDED:** keep (built) |
| Q11 | Default shortlist size (4–6) | 5; never suggest ideas with no votes. **DECIDED:** keep (built) |
| Q12 | Stages: voting→collecting? | Not allowed; only reopen a set stage. **DECIDED:** yes, a stage can go back from voting to collecting (votes and polls untouched) |
| Q13 | Can organizers set another member's attendance? | No: only the member or their manager. **DECIDED:** yes, organizers can set anyone's attendance |
| Q14 | Owner succession uses trip join date (we don't record promotion date) | Join date; managed members skipped. **DECIDED:** keep |
| Q15 | Poll turnout exactly 50% | Counts as enough. **DECIDED:** exactly 50% turnout counts; a tie (incl. 50/50) is flagged "Split decision" to organizers |

## Money (packages/core/src/money)

| # | Question | Provisional default |
|---|---|---|
| Q16 | Unclaimed itemized items after the claim window (DN-17) | **DECIDED** (founder, 2 Oct 2026): Unclaimed items default to the **uploader** until someone claims them, and are flagged for the organizer to handle or reassign (money page banner) |
| Q17 | Receipt doesn't add up (E-6) | **DECIDED** (founder, 2 Oct 2026): Flagged "We couldn't read this receipt correctly"; the user can fix or re-enter the line items (also after saving, until someone pays: MT6) and shares are computed from the entered items. Any gap left is covered by the **payer** (several payers: in proportion to what each paid) |
| Q18 | Leftover pennies: lowest member id vs rotate per expense (E-21) | **DECIDED** (founder, 2 Oct 2026): Leftover pennies all go to the **uploader** (then the payer if the uploader isn't in the split; deterministic), and the expense shows a small "Rounded" note |
| Q19 | Guest of honor's items on itemized receipts | **DECIDED** (founder, 2 Oct 2026): Asked at split time (uploader or organizer): default **only the people who shared that item with them**; alternatives "split evenly among everyone else" and "in proportion". An item only the guest of honor had has no sharers, so it is split evenly among everyone else |
| Q20 | Refund larger than original | **DECIDED** (founder, 2 Oct 2026): Keep: a refund can't exceed the original (for a corrected settled expense, the corrected total) |
| Q21 | Adjustments change net balance only (not per-person spend) | **DECIDED** (founder, 2 Oct 2026): Corrections to settled expenses also update the spending reports (category totals, spend per person): each correction stores the corrected state (`expense_corrections`) and reports use the latest |
| Q22 | Late joiners on itemized expenses (FR-12) | **DECIDED** (founder, 2 Oct 2026): Late joiners claim their own items on itemized receipts; organizers can also add them ("Who shares what" lists the receipts per late joiner) |
| Q23 | Not built: multiple payers (E-17), "covered by" (E-15), personal tracking-only (E-14) | **DECIDED** (founder, 2 Oct 2026): Build all three: (a) one bill, several payers (parts must sum to the total, `expense_payers`); (b) "covered by" (the share counts as the coverer's in balances and spend); (c) personal-only expenses (tracked for one person, never split, visible only to them via RLS, never locked, excluded from group balances and group reports) |
| Q24 | Duplicate receipt window | **DECIDED** (founder, 2 Oct 2026): Keep merchant/total/currency within a day, **plus** a line-item check: two receipts (same currency, within a day, at least 2 lines each) are flagged for the organizer (keep both / delete one) when the multiset Jaccard of normalized item labels AND of exact item amounts are both >= 4/5 (`packages/core/src/money/similarity.ts`) |

## Money follow-ups (founder decision page, 2 Oct 2026)

| # | Question | Decision |
|---|---|---|
| MT1 | "You owe" texts after money changes | **DECIDED:** texting unchanged for now; money updates live in the app. The money page has a "What changed" list (latest expenses, corrections, edits and payments affecting you, with amounts) |
| MT2 | Who records a payment | **DECIDED:** keep: payer, payee or an organizer |
| MT3 | Who sees receipt photos | **DECIDED:** everyone on the trip, except people the expense is hidden from in surprise mode (and, for a personal-only expense, everyone but its owner) |
| MT4 | Guest of honor marked after settlement | **DECIDED:** keep: settled expenses stay as they are |
| MT5 | Money without a confirmed number | **DECIDED:** keep: money needs a confirmed number, even for solo spend tracking |
| MT6 | Editing an itemized receipt | **DECIDED:** editable until anyone has paid (lock): items, amounts, total, charges and claims; shares are recomputed |

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
| Q37 | Opening a personal link turns an `invited` member `active` (being on the invite list = approval) | Yes. **DECIDED (D67):** no auto-join. POST-only trip preview with "Accept invitation" / "Not me"; accepting makes them active |
| Q38 | Personal link opened on a second device | Refused; asks for sign-in code. **DECIDED:** keep (second device needs a code) |
| Q39 | Recycled-number recheck (J-4) second factor | `needsRecheck` blocks full actions; recheck step not built |
| Q40 | FR-86 banned-word list for trip names in texts | Strict ("Wine country" → "your trip") |
| Q41 | Not built yet: quiet hours (N-5), per-trip MUTE (N-2), delivery callbacks, server-side session revocation | Later slices |

## Desktop vs phone (founder direction, 2026-10-01)

Decided by the founder in chat; propose adding to §13 as D64:
- Desktop web is a **planning workspace**: marketing landing page with calls to action for visitors,
  classic setup (FR-1b: destinations + dates) as the primary start, sidebar trip shell, wide
  multi-column views (ideas grid + "top picks" rail, money list + balances side by side).
- Phone web is **capture-first** (paste a TikTok link, vote from a text) and bridges the gap until
  the native app (Phase 2).

## Instrumentation (slice 9)

| # | Question | Provisional default |
|---|---|---|
| Q42 | AI cost per import for the cost dashboard | $0.03, env `COST_AI_IMPORT_MICROS` until real invoices are wired |
| Q43 | Booking decision gate (§11) sample size | "Insufficient data" below 20 decided Stays |
| Q44 | Who sees /admin | User ids in `ADMIN_USER_IDS` |

## Joining and roles (slice 3)

| # | Question | Provisional default |
|---|---|---|
| JR1 | FR-9 "write it off": who absorbs the forgiven balance? | The people on the other side of the balance (those owed, or those owing), in proportion to their own balance. "Split across the group" spreads it evenly over active members instead. **DECIDED** (founder, 2 Oct 2026): keep (absorbed in proportion by the other side) |
| JR2 | M-4 leaving with an open balance: must it be resolved like removal (FR-9)? | No. The balance is shown first and stays on the ledger under "former member" (M-1/M-2). Only organizer removal requires a resolution. **DECIDED** (founder, 2 Oct 2026): keep (leaving with a balance doesn't require settling) |
| JR3 | Owner leaving (J-10) | Must transfer ownership first; "Leave trip" refuses for the owner. **DECIDED:** transfer first, or the owner deletes the trip (typed confirmation + preview; soft delete hides it from everyone, money history kept) |
| JR4 | Denied or removed people using the group link again | "Ask the organizer to add you"; no new request. Organizers can restore (30 days) or re-invite. **DECIDED:** keep |
| JR5 | J-7 auto-pause: does the link resume by itself once requests are cleared? | No. At 20 open requests the link turns off; the organizer makes a new link (the old one has clearly spread). **DECIDED:** the link turns back on by itself once open requests drop below 20 |
| JR6 | Per-trip join request limits (FR-15) | 10 per hour, 30 per day through the group link. **DECIDED:** no hourly/daily limits; only the 20-open-request pause (SMS-code limits FR-15 unchanged) |
| JR7 | J-8 "That's not me" | A separate pending request under the typed name, flagged "says they're not Jess"; the invite row stays as is. **DECIDED (D67/C-JR7):** keep (separate pending request) |
| JR8 | Name after "Yes, I'm Jess" | Keeps the organizer's invite-list name. **DECIDED (D67/C-JR8):** the invitee's own typed name wins |
| JR9 | A verified person whose number/email doesn't match the invite opens someone's personal link | No account link (that would turn a forwarded link into full access). Identity attaches only on a matching phone/email. **DECIDED:** keep |
| JR10 | Balances shown to an organizer during removal include surprise expenses hidden from them (FR-91) | Included, since removal must resolve the true balance. Could reveal a hidden amount; confirm. **DECIDED** (founder, 2 Oct 2026): "the organizer should have a view into everything": organizers see the full removal balance, including expenses hidden from them. Only totals are shown; surprise-mode RLS is otherwise unchanged (clarified separately) |
| JR11 | Managed members whose manager is removed or leaves | Unchanged (still active, no one acts for them). **DECIDED:** organizers act for managed members whose manager left or was removed (RLS too) |
| JR12 | Organizer alert when the link auto-pauses; "Jess joined" undo (J-8) | In-app banner and audit entries only; no text yet |
| JR13 | FR-T4/T5 notices: People page only, or also the Ideas feed? | People page for now; `SizeNotice` is reusable for the feed. **DECIDED:** also on the Ideas feed |
| JR14 | Who may promote/demote organizers | Owner and organizers (FR-2 "everything except removing the owner"); nobody can demote the owner. **DECIDED:** keep |

## Founder decisions, round 1 (2 Oct 2026) not tracked above

- ST2 **DECIDED:** when a city's dates change, its polls are left alone (no shift, no pause).
- ST5 **DECIDED:** organizers can remove a city with polls, plans or expenses: ideas go to Unsorted, open polls close, all its polls are unlinked, plan items are removed, expenses stay (unlinked). A preview shows first.
- TX7 **SUPERSEDED by D65:** there are no texted-in ideas any more, so moving one to the library is moot (not built).
- NMP **DECIDED:** keep.

## Account settings: deletion, recheck, money-only view (slice 3)

| # | Question | Provisional default |
|---|---|---|
| AC1 | FR-3: owner deletes their account and the only other people are link-only guests (never verified) | Hand the trip to the longest-tenured guest rather than delete it (verified people always come first). The trip is deleted only when nobody else is on it (managed members the owner added don't count) |
| AC2 | J-11: notify the new owner after an automatic succession | In-app only (audit entry); no text (D65) |
| AC3 | FR-16: one organizer's "Yes, it's them" clears the recheck for the whole account, not just their trip | Account-wide (the organizer knows the person; J-4 asks for "organizer re-approval") |
| AC4 | FR-16: "I'm not Sam" on the recheck screen | Signs out only. The previous owner's data stays locked behind the recheck; a real "new owner of this number" flow (detach the number, start fresh) is not built |
| AC5 | FR-16: signing in with a code to the account's email while a recheck is pending | Clears it (the email is the second factor) |
| AC6 | M-1: who a removed member can record a settle-up with | Only people on their own expenses or payments (no member list), in a currency already on their ledger |
| AC7 | NFR-7: a deleted person's open balance | Kept on the trip under "Former member" (not resolved automatically); the preview warns and suggests settling first |
| AC8 | M-1: removal adjustments anchored on an expense hidden from the removed person (FR-91) | Shown as "Balance settled when you left" with no expense detail, so their balance adds up; other corrections on hidden expenses stay hidden |
