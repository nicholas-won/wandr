# Wandr (working name) — Requirements (Draft v0.10)

> Working name: **Wandr** (placeholder; the founder isn't sold on it because it sounds like a backpacker app, not a group-trip app). **[OPEN]** marks a decision still needed.
>
> Research:
> - [`competitors.md`](research/competitors.md) (including multi-city)
> - [`group-decision-making.md`](research/group-decision-making.md)
> - [`differentiation.md`](research/differentiation.md)
> - [`revenue-model.md`](research/revenue-model.md)
> - [`monetization-benchmarks.md`](research/monetization-benchmarks.md)
> - [`revenue-brainstorm.md`](research/revenue-brainstorm.md)
> - [`group-card-and-merch.md`](research/group-card-and-merch.md)
> - [`edge-cases.md`](research/edge-cases.md) (about 150 cases; IDs such as J-4 and E-18 are referenced below)

## 1. Summary

A group trip "inbox" for friends:
- Anyone can drop in a TikTok, Instagram post, Maps link, screenshot or plain idea. AI works out the real place and files it under the right city.
- The group votes privately. Organizers lock decisions in stages: where, when, where to stay, how to get around, what to do.
- On travel day, everyone can see who has landed.
- During the trip, anyone can snap a receipt and the app splits it.
- Friends take part fully from text messages with no app download, Partiful-style.
- **Between trips, it's a personal idea library (§6.12).** Anyone who loves travel can drop in places they dream about with no trip at all. AI sorts them by country, city and category, puts them on a map, and says when there's enough for a trip. One tap turns a city's saves into a trip with the ideas already in it.

**Hero moment (POC): "Drop a TikTok, get a vote."** Paste a link and an AI-resolved card appears. Friends get a personal text, vote in 2 taps without the app, and see the group result.

**Second habit loop: "Save it now, go someday."** The ReciMe pattern applied to travel: share a TikTok, get a clean place card, filed automatically. This gives people a reason to open the app every week, not just once or twice a year (§11).

**Pitches to test:**
- "Drop the TikToks. Vote by text. Split the bill."
- "The group chat that actually decides."
- "Plan the bach without being the bad guy."

## 2. Problem

- **Ideas get lost** in the group chat.
- **A link isn't a plan.** Someone has to figure out the place and look it up.
- **Deciding is political.** Loud voices anchor the group and quiet friends go along. One visible early upvote raises an item's final score by about 25%.
- **Money causes the most friction.** 45% of group travelers report money conflict, and only about 1 in 4 groups set a budget.
- **Multi-city trips are poorly supported.** Wanderlog suggests separate trips per city. Stippl breaks when you add cities. Almost no app handles people who join only part of a trip.
- **Travel day is chaos.** "Has Jess landed?" "Who's getting the keys?"
- **Travel inspiration has nowhere to live.** People save travel TikToks constantly, but they sit in TikTok and IG save folders, unsorted, and are forgotten by the time a trip happens. Trip apps only matter once a trip exists, so they're used once or twice a year.

## 2a. Product Principle: Simple First, Powerful When Needed

**Ease of use is the #1 product requirement.** The app has many features (stages, Stops, polls, receipts, flights), but a new user should never feel that. Places.is shows that features alone don't drive usage, and Wanderlog's top complaint is clutter.

- **P1 Zero setup for a basic trip.** A trip needs only a name or a pasted link. No dates, cities or settings are required. Every setting has a sensible default.
- **P2 Show features only when they're needed:**
  - Stops appear only when a second city shows up.
  - Stages appear as progress chips, not as a wizard.
  - Expenses appear after the first receipt.
  - Flights appear on travel days.
  - Bachelor/bachelorette mode, the budget check-in and surprise mode are opt-in.
  - **The idea library (§6.12)** is the home screen only for people who save outside a trip. Someone who joined through a trip invite sees just the trip until they save something of their own.
  - **Group features scale with trip size:** a solo trip shows no invites, reveals, polls or splits; a duo trip shows no group-chat or anonymity machinery (§6.10).
- **P3 One clear primary action per screen** (e.g. "Vote," "Add idea," "Split").
- **P4 Speed targets:**
  - The organizer creates a trip and sends invites in **under 60 seconds**.
  - A guest votes **in 2 taps** from a text.
  - A receipt is logged in **3 taps** (photo, trip, split).
- **P5 The app does the work:** AI fills in the details, picks the Stop, suggests the shortlist and sends the nudges. Users confirm instead of typing.
- **P6 Familiar patterns:** card swipes or taps to vote, the camera for receipts, text replies for people without the app. Nothing new to learn.
- **P7 Forgiving:** undo on every action, easy "wrong place? fix," and nothing destructive without a preview.
- **P8 Usability gate before launch:** 5–8 non-technical testers (including someone who "hates apps") complete the core tasks unaided:
  - Create a trip
  - Add a TikTok
  - Vote from a text
  - Split a receipt
  - Mark attendance at a Stop
  
  Target task success above 90% and a System Usability Scale (SUS) score above 80.
- **P9 Feature budget:** every new feature must say how it stays out of the way for people who don't need it. If it can't, it doesn't ship.

## 3. Target Users

**Works for any trip size, from 1 to about 15 people:** solo trips, duos (couples, siblings, two friends), and groups. The app adapts to the trip's size (§6.10).

**Go-to-market wedge:** bachelor/bachelorette parties and friend trips: 4–12 people, weekend city trips, heavy TikTok use, lots of shared costs. **But solo and duo trips are first-class, not edge cases.** The founder's first real test trip is a **duo trip with his brother**, so duo flows must feel complete in the POC. A cheap test with study-abroad groups could come later (see differentiation research).

| Persona | Needs |
|---|---|
| **Owner / organizer** (often the maid of honor or best man) | Fast setup, safe invites, see where the group stands, make the final call, never be "the bad guy" |
| **Contributor** | Add ideas in seconds; vote fast |
| **No-app friend** | Do everything from texts and links |
| **Guest of honor** | Enjoy the trip; doesn't see surprises; doesn't pay |
| **Solo traveler** | A personal TikTok-to-plan inbox: save, prioritize, map, track spending. No group features in the way |
| **Duo** (couple, siblings, two friends) | Quickly see where you agree, decide together without ceremony, split costs between two |
| **Dreamer** (loves travel, saves constantly, may have no trip planned) | Drop ideas in with zero effort; have them sorted automatically; be told when a place is "trip-ready"; share a "someday" board with a partner or friends (§6.12) |

## 4. Positioning and Differentiation

Details: `research/competitors.md`, `research/differentiation.md`.

- **No single feature is a moat.** Pulling places from TikToks (15+ apps), voting (Google Maps, iMessage polls, Places.is) and receipt scanning can all be copied. **The edge is the combination on one trip:** capture, then the group decision, then attendance per Stop, then money, all done by text without the app.
- **Advantages that build up over time:**
  1. A graph of verified phone numbers grouped into crews; every invite reaches people who don't have the app yet (Partiful's engine).
  2. Open balances that bring people back (Splitwise-style).
  3. Travel history: trips, flights and who you travel with (§6.8). Gives people a reason to open the app between trips.
  4. Data showing what the group decided and actually spent: which TikTok became a vote, then a visit, then a receipt.
  5. **A personal library of saved places** (§6.12). The longer someone saves, the more valuable their library becomes and the harder it is to leave. It's also where future trips start.
- **Closest threats:**
  - Places.is: link import, voting, joining with no account. No dates, Stops or money. **Hands-on check (Oct 2026): usage looks low,** which shows that features alone don't win; ease of use does (§2a).
  - Mindtrip: well funded.
  - Platforms: Google Maps, TikTok GO, Apple.
  - Batch: the incumbent for bachelorette parties, but built around booking.

**Top differentiators (ranked):**
1. Voting by text on AI-resolved cards
2. Blind voting with a group reveal, plus organizer polls with deadlines
3. Votes, nudges and splits follow who's at each Stop
4. Receipts linked to ideas, with itemized or even splits and multiple currencies
5. Polite Partiful-style texting
6. Bachelor/bachelorette mode
7. Trip arrivals board and travel stats

**Growth loops:**
- The personal trip text (every invite reaches someone without the app)
- Idea cards that preview nicely when pasted into the group chat
- "You owe $42" texts
- Post-trip "Trip Wrapped" recap
- Trip templates ("Steal this weekend")
- Travel stats and "miles together" shares
- Shared "someday" boards (§6.12) that invite a partner or friends before any trip exists
- "You've saved 12 places in Lisbon. Start a trip?" turning a solo library into a group trip

## 5. Core Concepts (Data Model)

- **Trip**:
  - Name, cover image, owner, organizers, members, invite link.
  - Stage statuses and settings: budget check-in, invite-list-only mode, bachelor/bachelorette mode.
  - Made up of one or more **Stops**.
- **Stop**:
  - City or area, order, dates or a rough length, ideas, map, plan, who's attending.
  - A single-city trip has one hidden Stop.
- **Stage**:
  - Where → When → Stay → Getting around → Do.
  - Each goes from `collecting` to `voting` to `set`, or is marked `not needed`.
- **Transit**: travel between Stops (an idea card with options).
- **Member**:
  - Name, verified phone, optional email, role (`owner` | `organizer` | `member`), status (`invited` | `pending` | `active` | `removed`).
  - Stops attending, linked flights, flags: guest of honor, managed member.
- **Idea**:
  - Source(s) and who shared each one; AI fields (place, category, summary, address and pin, price, hours, rating, links, confidence).
  - Which Stop it belongs to, votes, comments.
  - Status: `idea` → `shortlisted` → `planned` → `done` / `dropped`.
  - Visibility: everyone, or hidden from named people (surprise mode).
- **Vote**: `must-do` | `down` | `pass`.
- **Poll**: an organizer's choice between ideas or custom options (e.g. a theme), with a deadline and the eligible voters.
- **Expense**:
  - Receipt image, merchant, date, currency, total, category, payer, uploader.
  - Split method (`even` | `itemized`), line items with who claimed them, linked idea or Stop.
  - Lock state: locked once a related payment is recorded.
- **Payment**: a recorded settle-up between two members, in one currency.
- **Flight**: member, airline and flight number, date, origin and destination, live status, the trip it's linked to.
- **Plan item**: a planned idea placed on a day within a Stop: start time (optional), expected duration, travel mode and time from the previous item, `locked` flag, who's going (defaults to the people attending that Stop), and the reason the optimizer placed it there.
- **Comment**: on an idea or an expense.
- **Saved idea** (idea library, §6.12):
  - Owner (one person, not a trip), source link and clip, the same AI fields as an Idea (place ID, category, summary, price level, confidence), creator handle.
  - Auto-sorted location: country, city or region, and category. The user can override any of them.
  - Optional personal note and "someday priority" (the solo Must-do / Maybe / Skip buttons).
  - Boards it belongs to; trips it has been sent to.
- **Board**: a named collection of saved ideas.
  - **Auto boards** (one per country and city, plus categories) are computed from the saves, not stored lists.
  - **Custom boards** are created by the user ("Honeymoon someday," "Japan with Sam").
  - A board can be **shared** with members who can view and add. Shared boards have no votes, splits or roles beyond owner and member.
- **Idea ↔ saved idea:** sending a saved idea to a trip **copies** it into a trip Idea, linked back to the source. Votes and comments stay in the trip and never flow back to the library; deleting the saved idea doesn't touch the trip.
- **Plan / entitlement:** `free` | `premium`, plus a daily AI-import counter per person (§6.12, §11).

## 6. Functional Requirements

### 6.0 Planning stages and multi-city Stops

The trip moves through **fixed stages**. In each one the group sends ideas, votes, and the organizers lock in the result. A locked stage becomes the frame for the next.

| Stage | Decides | Example ideas |
|---|---|---|
| 1. Where | Cities/Stops and order | "Lisbon", a Porto TikTok |
| 2. When | Dates and nights per Stop | "3 Lisbon / 2 Porto" vs. "2 / 3" |
| 3. Stay | Lodging per Stop | Airbnb or hotel links |
| 4. Getting around | Transit between Stops | Train vs. flight |
| 5. Do | Food, activities, nightlife per Stop | TikToks, IG, Maps links |

- **FR-S1** Each stage is `collecting` → `voting` → `set`. Organizers move stages forward.
- **FR-S2** **Stages can be skipped:** organizers mark a stage "already decided" or "not needed." A trip to one known city can start at Do.
- **FR-S3** Stages can overlap. Ideas shared before Where is set go to the right Stop if it exists, or to **"Unsorted / new city?"** if not.
- **FR-S4** Organizers can reopen a set stage; the app shows what's affected before they confirm.
- **FR-S5** **Cities are ideas.** The group proposes and votes on cities. Organizers lock the list and order, and AI suggests an order and how many nights each.
- **FR-S6** **AI files ideas under the right Stop**, using every signal in the source (location tag, caption, on-screen text, audio, the matched place's coordinates). If a place is outside every Stop, the app asks "New city: Porto, add as a Stop?"
- **FR-S7** **Attendance per Stop.** Members mark which Stops they'll be at, including from the web.
  - Only people attending vote in that Stop's polls and get nudged about them.
  - Splits default to people attending that Stop.
  - Everyone can still see everything except surprises.
- **FR-S8** Transit cards between Stops show options with rough time and cost.
- **FR-S9** Map and lists open on the current or next Stop, with a toggle for the whole trip.
- **FR-S10** **When a Stop's dates change, ask each time.** The app lists affected planned items and polls, and the organizer chooses for each one: shift by the same number of days, or unschedule and flag "needs a day."
- **FR-S11** Each Stop loads separately; test with 300+ ideas across 4+ Stops.
- **FR-S12** **Custom polls** next to the stages, for decisions that aren't about places: theme, outfits, matching shirts, "who's driving."
- **FR-S13** *(Later)* Side plans for sub-groups within a Stop.

### 6.1 Trip creation, joining and roles

- **FR-1** **Two ways to start:**
  - (a) Paste or upload anything (TikTok, IG, YouTube or Maps link, any URL, screenshot, plain text). The app shows the AI card, **saves it to the person's idea library** (§6.12), and offers "Start a trip around this?", suggesting a trip name and Stop.
  - (b) Classic setup: name, destination(s), dates.
  - In both, the phone is verified only when invites are sent.
- **FR-2** **Roles:**
  - **Owner:** the creator. Can't be removed; can transfer ownership.
  - **Organizers:** everything except removing the owner.
  - **Members.**
- **FR-3** If the owner deletes their account, they must pick a successor. Otherwise the longest-standing organizer becomes owner.
- **FR-4** **Invite list:** organizers add phone numbers or pick contacts. Each invitee gets a **personal text with a personal link.**
- **FR-5** **What a personal link can do:**
  - Opening it lets that person **view and vote instantly, with no code**, on the first device.
  - Anything involving **money, approvals or settings** asks for the SMS code once on that device.
  - So a forwarded link can at most cast a vote. It must also survive link-preview bots that "open" it first (N-4).
- **FR-6** **Group link** (for pasting into a group chat):
  - Enter name and phone, then the SMS code.
  - Numbers on the invite list join immediately, after a name check ("Are you Jess?") to catch typos (J-8).
  - Other numbers become **pending** and see only the trip name until an organizer approves.
- **FR-7** Organizers can switch on **invite-list-only** mode, which turns off the group link for unknown numbers. Default: the group link is open with approval.
- **FR-8** Organizers approve or deny joins in one tap, or by replying Y or N to a text.
- **FR-9** **Removing someone:**
  - Organizers can remove any member except the owner.
  - If the person has an open balance, the organizer must resolve it first: reassign it to someone else, split it across the group, or write it off.
  - The removed person's past contributions stay, marked "former member."
- **FR-10** Organizers can regenerate the group link, which turns off the old one.
- **FR-11** **Managed members:** a verified member can add someone with no phone (a kid, a partner on a shared phone) by name only and act for them. (DN-1)
- **FR-12** **Late joiners:** the organizer sees a checklist of past shared expenses and ticks which ones the new person should share.
- **FR-13** **Drop-outs:** the organizer goes through each affected expense and decides (keep their share, redistribute it, or mark "refund if replaced").
- **FR-14** **Phone support at launch: US and Canada.** Members with other numbers verify by email; more SMS countries come later.
- **FR-15** **Protection against SMS-code abuse:**
  - Rate limits per number, IP and trip.
  - CAPTCHA after repeated requests.
  - A daily SMS spend cap.
  - The provider's fraud protection (J-16).
- **FR-16** **Recycled phone numbers:** when a number that has been inactive for a long time signs in, add an extra check. Every text includes "Not Sam? Reply WRONG" (J-4).
- **FR-17** Minimum age 13; under-13s only as managed members. (DN-25)

### 6.2 Capturing ideas

- **FR-20** **Web POC:**
  - Paste a link (TikTok, IG, YouTube, Maps, any URL), upload a screenshot, or type an idea.
  - Or text a link or screenshot to the app's number (§6.6).
- **FR-21** *(Native app)* Share from any app through the OS **share sheet**, then pick a trip **or "Save for someday"** (the idea library, §6.12). Defaults to the most recently active trip if there is one, otherwise the library; AI picks the Stop or board.
- **FR-22** **Duplicates** merge into one card: "also shared by X."
- **FR-23** **Auto-add:**
  - The card appears instantly in a "processing" state and fills in when extraction finishes.
  - Low-confidence results are flagged "Is this right?"; any member can fix them.
- **FR-24** **Listicles:** the sharer is asked: "This video mentions 5 places. Add all, or pick which?"
- **FR-25** **Non-place content** (memes, outfits) becomes a plain-text idea or is dismissed. It's never forced onto a map.
- **FR-26** Always keep the source link and the clip so people can watch it.

### 6.3 AI extraction

- **FR-30** Fallback chain for finding the place:
  1. Caption, hashtags and location tag
  2. On-screen text
  3. Audio transcript (subject to legal check; see §9)
  4. Web search
- **FR-31** Match to a places provider for pin, hours, rating and price.
  - Google's terms allow storing only the place ID long term; other details must be refreshed.
- **FR-32** Handle chains with many branches by picking the branch nearest the Stop, with an option to change it.
- **FR-33** Flag businesses that are permanently closed.
- **FR-34** Cache results by URL and place ID; rate-limit imports per user and trip.
- **FR-35** Fetched links are untrusted input:
  - Block server-side request forgery, where a pasted link makes our server fetch internal addresses (C-20).
  - Guard against text in captions trying to give the AI instructions (prompt injection, C-21).

### 6.4 Voting and decisions

Model: **anyone suggests, the app prioritizes, organizers decide.**

- **FR-40** Votes are **Must-do / Down / Pass.**
- **FR-41** **Blind voting:** you can't see tallies until you've voted, and card order is shuffled until then.
- **FR-42** **Protecting anonymity** (trips with 3+ members; duo and solo rules are in §6.10):
  - After voting, members see the **names** of Must-do and Down voters and only the **count** of Pass.
  - Members never see who hasn't voted, so Pass can't be worked out by elimination. Only the person themselves gets a private nudge.
  - Organizers see turnout as a number only.
- **FR-43** Votes can be changed while a poll or idea is open; organizers see how many changed. (DN-15)
- **FR-44** **Ranking: approval %.** Ideas are ranked by the share of voters who said Must-do or Down. Ties are broken by the Must-do count.
  - Cards show both numbers, e.g. **"5 of 6 are in · 2 Must-do 🔥"**, so excitement is never hidden behind the percentage.
  - The denominator is people who voted (and are attending that Stop), so non-voters don't drag an idea down.
  - The app suggests a shortlist from the ranking; organizers decide.
- **FR-44a** **"🤔 Split opinions" label** on contested ideas: at least 2 Must-do *and* at least 2 Pass, or at least a third of voters passing on an idea that also has Must-do votes. No names are shown. It's a cue to discuss, or to make the idea an opt-in activity for the people who want it.
- **FR-45** **AI shortlisting:** when a category gets crowded (about 12+ ideas), suggest the top 4–6 with a comparison.
- **FR-46** Comments are threaded, not real-time chat.
- **FR-47** **Organizer polls:**
  - Timed and blind.
  - Nudges go to people who haven't voted.
  - Non-voters abstain; they never count as yes.
  - Only people attending that Stop are eligible.
- **FR-48** **Ties or low turnout (under 50%):** no automatic winner. The organizer picks, runs a run-off or extends the deadline.
- **FR-49** Only owners and organizers can change an idea's status (shortlisted, planned, dropped).
- **FR-50** "Not my pick, but I'm in" button.

### 6.5 Expenses and receipts

- **FR-60** **Receipt capture should feel like a Workday expense upload:** photo, then share to the trip.
  - Web: an upload or camera button.
  - By text: send the photo to the app's number.
  - Native app: the share sheet.
- **FR-61** AI reads the merchant, date, line items, tax, tip, service charges, discounts, total and currency. Everything is editable.
  - Validate that line items add up to the total.
  - Catch automatic gratuity on top of a written tip (E-4/6/7).
- **FR-62** **The split method is chosen per receipt:**
  - **Even:** among the selected people. Defaults to people attending that Stop. Accepted automatically.
  - **Itemized:** each person claims their items, tax and tip are split in proportion, and items can be shared.
    - The uploader is nudged about unclaimed items and can **assign** them or **absorb** them (the payer covers them).
- **FR-63** Manual expenses with no receipt.
- **FR-64** **Duplicate receipt detection** (same merchant, total and time) (E-11).
- **FR-65** **Categories:** AI auto-categorizes each expense (lodging, food and drink, transport, activities, shopping, other). The trip shows a breakdown by category and spend per person.
- **FR-66** **Currencies:**
  - Each expense keeps its own currency. **Balances are tracked and settled per currency**, Splitwise-style.
  - For the category breakdown only, show an approximate total in a display currency each person chooses.
- **FR-67** Expenses can be linked to an idea or Stop.
- **FR-68** **Who can edit or delete:** the uploader, organizers and the owner. Everyone involved is notified, and every change is logged.
- **FR-69** **Locked after payment:** once a payment involving that expense is recorded, it can't be edited. Fixes become **adjustment entries.**
- **FR-70** **Balances** are simplified to the fewest transfers, per currency.
- **FR-71** Members record payments; payments are their own records and are never deleted.
- **FR-72** **Refunds** are negative expenses that reuse the original split (E-12).
- **FR-73** *(Phase 2)* Settle-up buttons that open Venmo, Cash App, PayPal or Zelle with the amount filled in.
- **FR-73a** *(Phase 2)* **"Collect for the house" (free):**
  - The organizer requests a fixed amount per attending person, with a deadline (e.g. "$375 each for the Airbnb by Mar 1").
  - Each person pays through a pre-filled Venmo, Cash App, PayPal or Zelle link and taps "I paid." The organizer confirms receipt.
  - The app tracks who has paid, sends reminders (so the organizer never has to chase), and records each payment as an expense split.
  - **No fee, and no money passes through us.**
- **FR-74** **Optional budget check-in** (organizer turns it on; in duo trips budgets are shared openly, see FR-T9):
  - Each member privately enters a range.
  - The group sees a rounded band, and only when at least 3 people have answered. Ideas are tagged "within budget" or "splurge." (DN-14)
- **FR-75** **No payment processing in the roadmap.** Money is tracked only. See §11.

### 6.6 Messaging: push, texting and group-chat sharing (Partiful model)

The trip must work fully without the app. Each message goes through the cheapest channel that still reaches the person:
- **Push** for app users.
- **Group-chat sharing** for news everyone needs. The organizer's own phone sends it, so it costs us nothing.
- **Our own texts (SMS)** only for things that are personal, private or for someone new.
- **Email** as a free backup.
- No web push (too few people install the web app to their home screen).

- **FR-80** **Which channel each message uses:**

| Message | App users | No-app members |
|---|---|---|
| Sign-in / join codes | SMS | SMS |
| Personal invite | Push (if already a user) | SMS |
| Join request (to organizers) | Push | SMS |
| Expense involving you, "you owe / are owed" | Push | SMS |
| Poll closing (only to people who haven't voted) | Push | SMS |
| New poll | Push | **Group-chat share** (FR-80a); fallback FR-80c |
| Decision made | Push | Group-chat share |
| Daily idea digest (only on days with new ideas) | Push or email | Group-chat share + optional email |
| Trip updates (dates set, new Stop) | Push | Group-chat share |
| Flight alerts | Push or email | Email |

- **FR-80a** **Share to group chat:**
  - At key moments (new poll, decision, digest, trip update), organizers are prompted: "Share this to the group chat?"
  - One tap opens the share sheet (Messages, WhatsApp, Instagram DMs, etc.) with text and a link filled in.
  - Any member can share; the prompt goes to organizers.
- **FR-80b** **Rich preview cards:** shared links unfurl into a card built for the group chat (idea photos, poll options, deadline, "Tap to vote").
  - **Previews are snapshots**, because iMessage builds a preview once. So cards never show a live tally as current, and the call to action is "Tap to vote/see."
  - Group-chat links go through the group link (FR-6). Someone who isn't signed in enters a code once, then stays signed in on that device.
- **FR-80c** **Fallback:** if a poll hasn't been shared within about 12 hours, its no-app eligible voters get a personal text instead.
- **FR-80d** **Surprise safety:** group-chat cards and previews never include surprise items (FR-91), because the guest of honor is often in the chat. Surprise polls and decisions go only by personal text or push to the people allowed to see them.
- **FR-80e** **Privacy in group-chat cards:** no money amounts, no individual votes or Pass counts, no names of people who haven't voted, no phone numbers.
- **FR-80f** **Gentle app prompt:** members who get many texts see "Get the app for instant updates (no texts)." Never required.
- **FR-81** Every text includes a personal link (FR-5).
- **FR-82** **Two-way texting.** Members can:
  - Vote by replying 1, 2 or 3
  - Approve joins with Y or N (organizers)
  - Add an idea by texting a link or screenshot
  - Add a receipt by texting a photo
  - Every action gets a confirmation and an UNDO option.
- **FR-83** **Routing replies:**
  - Only one question is open per person at a time, so "reply 1" is never ambiguous. (DN-23)
  - Texted-in ideas and receipts go to the most recently active trip and Stop, with a reply link to move them.
  - **If the person has no active trip, texted-in ideas go to their idea library** (§6.12, FR-L2). The definition of "active trip" for this rule is **[OPEN]** (see §14).
- **FR-84** **Throttling:** at most about 1 text per person per day unless something is time-sensitive. Target: **10–12 texts per no-app member per trip**, mostly invite, money and personal nudges.
- **FR-85** **STOP and HELP:**
  - Sign-in codes come from a separate number, so STOP doesn't block sign-in. (DN-22)
  - Members who sent STOP are switched to email or push.
  - Informal opt-outs ("stop texting me") are honored.
- **FR-86** Trip names written by users are filtered or kept out of text bodies, to avoid carrier spam filtering (J-19).
- **FR-87** App users get push notifications instead of texts, for everything.
- **FR-88** *(Phase 3)* iMessage extension: interactive cards (vote inside Messages) that improve on the FR-80b link previews. It can't read the chat or post without a person sending.

### 6.7 Bachelor/bachelorette mode (POC)

- **FR-90** **Guest of honor:** mark one or more members. One tap excludes them from all splits, and their share is spread across the rest.
- **FR-91** **Surprise mode:** ideas, polls, plan items and expenses can be hidden from named people (e.g. the guest of honor). Hidden items never show up in their texts, previews or counts.
- **FR-92** Theme and outfit polls (FR-S12) with image options.

### 6.8 Flights, arrivals and travel stats (NEW)

**Trip arrivals board**
- **FR-100** **Members link flights to a trip:**
  - By entering the airline and flight number plus date
  - By forwarding a confirmation email
  - *(Native app)* From the calendar or Wallet
  - Optionally per Stop
- **FR-101** **Arrivals board** for travel days. Each member shows their flight and status: scheduled, departed, in the air, landed, delayed or cancelled, with arrival times in the Stop's local timezone.
- **FR-102** Live status from a flight data provider; **push and email alerts only, never SMS,** such as "Jess landed in Lisbon" and "Mike's flight is delayed 2h."
  - Members choose who gets alerts: everyone, organizers only, or off.
- **FR-103** Group view: "4 of 8 arrived · next: Sam lands 6:40pm." Helps with airport pickups and check-in timing.
- **FR-104** Linking a flight is **opt-in per trip**. No one is required to share. Flight details are visible only to trip members and only during a window around the trip.
- **FR-105** A flight can become an expense (its own currency, split = just me, by default).

**Personal travel profile (gamified)**
- **FR-106** **Stats:**
  - Total flights, miles and kilometers flown
  - Countries, cities and trips
  - Hours in the air
- **FR-107** **Travel buddies:**
  - The friends you've traveled with most (trips together, days together)
  - **"Miles together"**: distance traveled on shared trips
  - **"Miles apart"**: how far friends flew to meet up
- **FR-108** Badges and milestones (first international trip, 10 trips with the same crew, "always lands last," 6 continents) and an annual **Travel Wrapped**.
- **FR-109** Shareable stat cards for Instagram or TikTok stories (a growth loop).
- **FR-110** **Privacy:**
  - Stats are private by default.
  - Travel-buddy stats only include trips both people were members of.
  - Users can hide any trip from their stats.
- **FR-111** Stats count **only trips and flights logged in the app.** No importing past travel history.

### 6.9 Views

- **FR-120** **Trip home:**
  - Stage progress ("Where ✅ · When ✅ · Stay 🗳 closes Fri · Do 💡")
  - Arrivals board on travel days
  - "You owe" summary
- **FR-121** **Ideas feed** by Stop: filters, a "you haven't voted" badge, tallies after voting.
- **FR-122** **Map**, organized by Stop.
- **FR-123** **Plan:** day by day, by Stop, with travel time between items and an "Arrange my days" button (§6.11).
- **FR-124** **Expenses:** list, categories, balances per currency.
- **FR-125** **Profile and stats** (§6.8).
- **FR-126** **Export:** send the plan to Google or Apple Maps, one list per Stop; export expenses as CSV or PDF.

### 6.10 Trip size: solo, duo and group

The app adapts to how many **active members** a trip has, counting managed members (FR-11): **solo** (1), **duo** (2), **group** (3+). The data model is the same for all three; only the behavior and UI change. A trip can move between sizes at any time.

| Feature | Solo (1) | Duo (2) | Group (3+) |
|---|---|---|---|
| Voting | **Personal priority:** the same buttons, shown as Must-do / Maybe / Skip. No reveal, no tallies | **Open from the start:** both see each other's votes live ("You: Must-do · Sam: Down") | Blind until you vote; Pass shown as a count only (FR-41/42) |
| Ranking | Must-do first, then Maybe | Both votes shown on the card; ideas you both want rise to the top. No percentages | Approval % plus Must-do count (FR-44) |
| "Split opinions" label | — | — (votes are already visible) | Yes (FR-44a) |
| Decisions | You | **Owner decides** (same rule as groups); the owner can promote the other person to organizer | Owners and organizers decide |
| Polls and deadlines | Hidden | Available but not prompted; a tie (1–1) goes to the owner | Yes (FR-47/48) |
| Stages | Simple "set" toggles; no voting step | Same as groups, minus anonymity | Full (§6.0) |
| Invites and joining | Hidden until "Invite someone" | Personal link (FR-5); group link hidden by default | Full (§6.1) |
| Expenses | **Personal spend tracker:** categories, multiple currencies, no split screen | Splits default to even between the two; one balance per currency | Full (§6.5) |
| Budget check-in | Personal budget; ideas tagged within/over | **Budgets shared openly** with a heads-up before entering (FR-T9) | Rounded band, 3+ answers (FR-74) |
| Messaging | No texts except sign-in; email for flight alerts | Share prompts become **"Send to Sam"** (the user's own phone sends it, free), with a personal-text fallback (FR-80c) | Group-chat share (FR-80a) |
| Daily digest | Off | Off by default (the other person's activity shows in the app) | On (FR-80) |
| Surprise mode | — | Supported (e.g. planning a surprise anniversary trip) | Supported |
| Bachelor/bachelorette mode | Hidden | Hidden | Opt-in |
| Arrivals board, stats, Trip Wrapped | Yes | Yes ("travel buddies" works for two) | Yes |

**Requirements**
- **FR-T1** Trip size is derived from active members and recalculated whenever someone joins, leaves or is removed. UI and privacy rules follow the current size.
- **FR-T2** **Solo trips are complete on their own.** The hero flow (paste a TikTok → card → trip) works with no invite step. "Invite someone" is always one tap away but never pushed.
- **FR-T3** **Solo → duo:** solo priorities carry over as that person's votes. Before the second person joins, a one-time notice tells the owner: "In 2-person trips, you'll see each other's votes."
- **FR-T4** **Duo → group (3rd person joins):**
  - Voting switches to blind mode for votes cast from then on.
  - The original two still see each other's earlier votes.
  - New members see earlier votes only as counts, never as individual Pass votes.
  - Budgets already shared openly stay visible to the original two; the newcomer sees only the band rule (FR-74).
- **FR-T5** **Group → duo (members leave or are removed):** votes cast while the trip was a group **stay anonymous** and are never revealed after the fact. Their Pass counts are hidden in duo view; only Must-do and Down names are shown. New votes follow duo rules, after a one-time notice.
- **FR-T6** Before anyone casts a duo vote, a notice states that votes are visible to the other person.
- **FR-T7** **Duo ties:** a 1–1 split on an idea or poll is shown plainly ("You: Must-do · Sam: Pass"), and the owner decides.
- **FR-T8** **Duo settle-up** shows a single "You owe Sam $X" per currency. Nothing needs simplifying.
- **FR-T9** **Duo budgets:** if the owner turns the budget check-in on, each person sees the other's range after both have answered, with a heads-up before entering. Ideas are tagged "within both budgets" or "over one of your budgets."
- **FR-T10** **Solo expenses** have no split UI. Each expense is "paid by me, for me" unless another member is added later. Then the owner can turn earlier expenses into shared ones from a checklist (same mechanism as FR-12).
- **FR-T11** Throttling, privacy and surprise rules (FR-84, FR-80d/e, FR-91) apply at every size. In a duo, surprise items are hidden completely from the hidden person, including counts.
- **FR-T12** Success metrics are **segmented by trip size** (solo / duo / group), since engagement patterns differ.

### 6.11 Plan optimization: "Arrange my days"

Once the group has decided **where** and **what**, the app helps with **when and in what order**. The optimizer suggests and the user tweaks; it never silently rearranges a plan.

**How it works**
- **FR-O1** One tap, **"Arrange my days,"** per Stop (or for the whole trip). The optimizer proposes a day-by-day plan from the `planned` items (plus shortlisted Must-dos if there's room, clearly marked "suggested").
- **FR-O2** Each placement comes with a short **reason**: "Grouped with 2 other spots in Alfama," "Museum closes at 6pm," "Dinner at 8 near your Airbnb," "Sunset at 7:42."
- **FR-O3** **Preview before applying.** Organizers (in a duo, the owner) see the proposed plan next to the current one and can apply, adjust or discard it. Once applied, everyone sees it.
- **FR-O4** **Tweak freely:** drag items between days and times. **Lock** any item (e.g. a dinner reservation) so re-running never moves it. Unlocked items can be re-arranged anytime.
- **FR-O5** **Doesn't fit:** items that don't fit appear in a "Didn't fit" list with the reason (closed that day, too far, day full), and a suggestion (swap with a lower-priority item, add a day, drop).
- **FR-O6** **Hints between runs:** even without re-running, the plan flags problems live. "Closed on Mondays." "45 min apart by transit." "3 activities and 2 meals; that's a packed day." "This overlaps your flight landing."

**What it considers**
- **FR-O7** **Geography and travel time:**
  - Clusters nearby places into the same day or half-day and minimizes back-and-forth.
  - Shows travel time and mode (walk / transit / drive) between consecutive items.
  - Starts and ends each day near the Stop's lodging if one is decided.
- **FR-O8** **Hours and fixed times:**
  - Opening hours on that date.
  - Reservations and ticket times (entered, or read from a confirmation).
  - Check-in and check-out.
  - Flight arrivals and departures (from the arrivals board when available; manual times in the POC).
  - Transit legs between Stops.
- **FR-O9** **Meals and pace:**
  - Restaurants go at meal windows, bars and clubs at night, brunch spots in the morning.
  - Free time is left between activities, and days aren't overpacked.
  - The default pace is "balanced." Organizers can pick relaxed or packed, and later the group's pace answers (early birds vs. night owls) feed it.
- **FR-O10** **Priority and attendance:**
  - Must-dos are scheduled first, then by ranking (FR-44).
  - Items only some people are attending are scheduled with those people noted, and can run in parallel with other items (a side plan).
  - In surprise mode, hidden items are placed without revealing them to hidden members (they see "Surprise 🎁" blocks).
- **FR-O11** **Weather and daylight** *(stretch for the POC)*: outdoor items go on clearer days and in daylight, sunset spots at sunset. Re-suggest if the forecast changes near the trip.
- **FR-O12** **City order:** for multi-Stop trips, the Where and When stages already get an AI-suggested Stop order and night split (FR-S5). The day optimizer works within those.

**Edge cases**
- **FR-O13** **No dates yet:** arrange into "Day 1, Day 2…" without dates or hours. Re-check hours once dates are set.
- **FR-O14** **Items without a location** (plain-text ideas) are placed by the user, or by the optimizer only by meal or time-of-day hints. They're never given an invented location.
- **FR-O15** **Arrival and departure days** are shortened around transit and flights. Late arrivals get dinner only.
- **FR-O16** **Times are in the Stop's local timezone**; day-trip items reached from a Stop are scheduled on that Stop's days.
- **FR-O17** **When the plan changes** (an item added or dropped, Stop dates changed per FR-S10, someone's attendance changed), the plan isn't re-arranged automatically. It shows "Plan may be out of date: re-arrange?" with a preview.
- **FR-O18** Solo and duo trips work the same, minus the attendance logic.

**Implementation note:** a deterministic scheduling engine in `packages/core` does the placement. It handles clustering, time windows and constraints, and is testable and repeatable. Claude writes the explanations and turns fuzzy preferences into constraints ("we're not morning people"). The AI never makes up hours or travel times; those come from the places and routing data.

### 6.12 Idea library: "Save it now, go someday"

**Why:** a trip happens once or twice a year, so a trip-only app is opened once or twice a year (§11). The idea library gives travel lovers a reason to come back every week: drop in anything they dream about, and the app sorts it and turns it into value with no extra work. It's the ReciMe model for travel, and the main route to a subscription (D61). Every trip can then start from a library that's already full.

**How it stays out of the way (P9):** there's no setup and nothing to configure. People who only join trips through invites never see it. Saves are private unless the user shares a board.

**Capture and sorting**
- **FR-L1** **Save with no trip.** The same capture as FR-20 (paste a link, upload a screenshot, type an idea) works with no trip. The result is a saved idea in the person's library.
- **FR-L2** **Text to save.** A link or screenshot texted to the app's number lands in the library when the person has no active trip (FR-83). The confirmation reply is a plain receipt ("Saved: Time Out Market, Lisbon"), never marketing (FR-84 rules apply).
- **FR-L3** **Auto-sort.** The same extraction pipeline as §6.3 (including the C-20/C-21 protections) files each save by **country → city or region → category** (food, drinks, stays, activities, sights, nightlife, other). Low-confidence results are flagged "Is this right?" (same as FR-23). Non-place content follows FR-25.
- **FR-L4** **Listicles** ("10 best bars in CDMX") follow FR-24: save all, or pick which.
- **FR-L5** **Duplicates** merge into one saved idea, keeping every source link (FR-22).

**Browsing**
- **FR-L6** **Home = places, not a feed.** The library opens on a grid of countries and cities, each showing a count and cover photo ("Lisbon · 14"). Tapping one shows its saves grouped by category, with a map toggle.
- **FR-L7** **Map** of all saves, clustered by city when zoomed out.
- **FR-L8** **Custom boards** are optional. Any save can be added to one or more boards; auto boards always exist.
- **FR-L9** **Someday priority:** the solo Must-do / Maybe / Skip buttons (D55) can be used on saves to rank a city's ideas. Optional.

**Turning saves into trips**
- **FR-L10** **"Trip-ready" nudge.** When a city or region reaches a threshold of saves (default **8+ places, including at least 1 food and 1 activity [OPEN]**), its tile shows "Lisbon is trip-ready: start a trip?" **In the app only in the POC;** never by SMS.
- **FR-L11** **Start a trip from a board.** One tap creates a trip (FR-1) with that city as its Stop and the chosen saves copied in as ideas (§5). Must-do saves are preselected. The trip is then a normal solo, duo or group trip.
- **FR-L12** **Send to an existing trip.** Any save, or a multi-selection, can be sent to a trip the person belongs to. AI picks the Stop (FR-S6). If the trip has no matching Stop, FR-S6's "New city?" prompt applies.
- **FR-L13** **Trip ideas back to the library.** After a trip, or at any time, a member can save any trip idea to their own library ("Save for next time"). Only the place is copied, never votes or comments.

**Shared boards**
- **FR-L14** A board can be shared through a personal link (same rules as FR-5: view and add with no code; managing the board needs a code). Members of a shared board see only that board's saves, never the rest of the owner's library.
- **FR-L15** Shared boards have no voting, splitting or reveal. Turning a shared board into a trip (FR-L11) invites its members to the trip as normal invitees (FR-4).

**Passive value: alerts** *(Phase 2; push and email only, never SMS; all opt-in per board)*
- **FR-L16** **Best time to go:** each city tile shows its best months and current season ("Peak season · hot"). A gentle alert comes when a saved city enters its best window.
- **FR-L17** **Price alerts:** flight-price drops from the user's home airport to a saved city, and price drops on saved stays where the provider allows it. **Needs a fare data source:** FlightAware AeroAPI (§7a) covers flight status only and has no fares, so the provider is **[OPEN]** (§14). Plain links only until affiliate links ship (§11 trust rules: a paid placement never changes what's shown in the library).
- **FR-L18** **Place updates:** saved places that close permanently (FR-33) are flagged in the POC; Phase 2 adds alerts for new hours or reopening.
- **FR-L19** **Alert throttling:** at most **1 library alert per person per week [OPEN]**, batched into a single digest.

**Free and Premium (D61, D62)**
- **FR-L20** **Free tier:** up to **3 AI imports per person per day** (a starting number, to be tuned with POC data). Imports beyond that are queued as "Saved — we'll sort it tomorrow" instead of failing, so nothing is lost.
- **FR-L21** **Premium:** a higher import limit (fair-use cap against abuse). Other Premium perks and the price are **[OPEN]**.
- **FR-L21a** **7-day free trial** that **converts to paid automatically** unless cancelled:
  - **One trial per person**, tied to the verified phone or email and the payment method, so it can't be repeated by making new accounts.
  - **Clear terms at sign-up**, next to the button: trial length, the price after it, the billing date, and how to cancel. The person actively agrees (no pre-ticked box).
  - **Reminder before it converts:** a push or email about 2 days before the trial ends, with the date, the price and a one-tap cancel link. **Never by SMS** (no marketing in texts, FR-84).
  - **Easy cancel:** cancel online in the same place they signed up, in 2 taps or fewer, with no call or chat required. Cancelling during the trial keeps Premium until the trial ends and never charges.
  - After converting: a receipt email, and a renewal reminder before each yearly renewal.
  - **Legal review before launch** of US state auto-renewal laws (e.g. California's) and app-store subscription rules for the native app.
- **FR-L22** **What counts as an import:** a new AI extraction the person starts. Cache hits (an already-resolved URL, FR-34), failed extractions, typed plain-text ideas and sending existing saves to a trip don't count.
- **FR-L23** **The cap never blocks group participation.** Guests never pay (§11): importing into a trip that has other active members never hits the paywall. **Imports into a solo trip do count toward the cap** (D62), so a solo trip isn't a way around it. If a solo trip later gains a member, imports from then on are exempt; earlier ones aren't refunded.
- **FR-L24** **POC: no paywall.** The POC logs imports per person per day and shows no limit or upgrade screen (D52: no revenue fake doors in the POC). The existing abuse rate limits (FR-34) still apply.

**Privacy**
- **FR-L25** A person's library is private, enforced by Row Level Security. Trip members never see a member's library, and saves never show up in trip counts, digests or share cards unless they're sent to that trip.
- **FR-L26** Shared-board members can see each other's names but never phone numbers (same as trips).

## 7. Phasing

| Phase | Scope |
|---|---|
| **1. Web POC** | Both ways to start; personal links, join with code and approval, roles. Stages and Stops with attendance per Stop. Capture by link, screenshot, text or texting the app's number, with AI extraction and filing under Stops. Blind voting, polls, custom polls. Receipts (even or itemized), categories, balances per currency. Bachelor/bachelorette mode. **"Arrange my days" plan optimizer (basic; weather is a stretch).** **Idea library, minimal (§6.12):** save with no trip, text to save, auto-sort, city grid and map, custom and shared boards, in-app "trip-ready" nudge, start a trip from a board, closed-place flags. Imports are logged, not capped (FR-L24). One-way texts plus replies to vote and approve. **No offline support. No flight tracking.** |
| **2. Native app** | Share sheet. Push notifications. Offline (cached plan plus queued receipt uploads). Settle-up buttons for Venmo and others; free "Collect for the house" tracking. Flight tracking with live alerts. Personal profile and stats. Trip Wrapped. Templates. Share sheet into the idea library. Library alerts (best time to go, price drops, place updates). **Revenue:** **Premium subscription for the idea library** (free tier: 3 AI imports a day, D61), affiliate links on decided Stays and activities, bachelor/bachelorette merch, Decide→Book→Arrive cards, creator revenue share |
| **3. Expansion** | iMessage extension. Side plans. Brand rebates, venue perks and tourism-board deals once there's volume. Badges and annual Travel Wrapped. More SMS countries |
| **Future / unscheduled** | Group trip card (interchange), only if 25%+ of trips pool $1,500+. Payments in the app. B2B (planner tier, offsites, white-label). All need legal review or a decision after the POC |

## 7a. Tech Stack

Goal: one TypeScript codebase, managed services, minimal ops. Optimize for shipping the POC fast without boxing in Phase 2 (native) or later payments.

| Layer | Choice | Why / notes |
|---|---|---|
| **Web app** | **Next.js** (App Router) + **TypeScript**, mobile-first | Server-rendered pages for fast link opens from texts; API routes for webhooks |
| **UI** | **Tailwind CSS** + **shadcn/ui** | Fast and consistent; easy to keep simple (§2a) |
| **Hosting** | **Vercel** | Preview deploys per branch |
| **Database** | **Postgres on Supabase** | Relational data (trips, Stops, votes, expenses). **Row Level Security** enforces trip membership, surprise mode and Pass privacy at the database level |
| **ORM and migrations** | **Drizzle** | Type-safe schema and migrations in the repo |
| **Auth** | **Supabase Auth**: phone sign-in codes (through Twilio Verify) plus email codes (FR-14) | Personal-link sessions (FR-5) are a custom signed-token layer on top: view and vote only until a code is entered |
| **File storage** | **Supabase Storage** | Receipt photos, screenshots. Private buckets, signed URLs |
| **Realtime** | **Supabase Realtime** | Live vote reveals and tallies |
| **Background jobs** | **Inngest** | AI extraction pipeline, daily digests, poll deadlines, nudges, reminders, retries |
| **SMS** | **Twilio** Messaging (two-way, inbound webhooks) + **Twilio Verify** (codes, from a separate number, FR-85) | US/Canada only at launch; A2P 10DLC registration |
| **Email** | **Resend** | Digests, backup notifications, email sign-in codes |
| **AI** | **Claude API**: default model **Claude Opus 5.5**, with structured outputs for extraction and receipt reading | Route individual tasks to **Sonnet 5.5 or Haiku 4.5** only if evals show the same quality (cost decision for the founder; the cost model in `research/revenue-model.md` assumed Sonnet-class pricing) |
| **Link and content intake** | TikTok and Instagram link previews (oEmbed) + Open Graph fetch | Server-side fetcher with protections against SSRF (C-20); fetched content treated as untrusted (prompt injection, C-21). Audio transcription deferred pending legal review |
| **Places and maps** | **Google Places API (New)** + **Google Maps JS** | Store only place IDs long term (Google's terms); map provider revisited at scale (D48) |
| **Routing and travel times** | **Google Routes API** (route matrix) | Travel time between plan items; cache per pair of places and mode *(verify pricing)* |
| **Weather and daylight** | **Open-Meteo** (free forecast) + sunrise/sunset calculation | Stretch for the POC (FR-O11) |
| **Exchange rates** | **Frankfurter** (free European Central Bank rates) | Display totals only; balances are kept per currency (D29) |
| **Group-chat preview cards** | **@vercel/og** dynamic Open Graph images | Rich previews in iMessage and WhatsApp (FR-80b); never include surprise or private data (FR-80d/e) |
| **Product analytics** | **PostHog** | Funnels, commercial-intent events (§11), feature flags |
| **Errors and monitoring** | **Sentry** | Web and, later, native |
| **Testing** | **Vitest** (unit; required for all money math) + **Playwright** (end-to-end core flows) | Money math must have exhaustive tests (NFR-4) |
| **Money representation** | Integer minor units (cents) + ISO currency code; no floats | Leftover pennies assigned predictably; history is append-only |
| *Phase 2* **Native app** | **Expo (React Native)** + shared TypeScript types and API client | Share extension (share sheet), push (Expo Notifications / APNs / FCM), offline cache |
| *Phase 2* **Flight data** | **FlightAware AeroAPI** (alerts, not repeated status checks) | Push and email only (D40) |
| *Phase 2* **Merch** | **Printful API** | Mockups and orders |

**Repo layout (proposed):** a monorepo (pnpm workspaces): `apps/web` (Next.js), later `apps/mobile` (Expo), `packages/db` (Drizzle schema), `packages/core` (domain logic: splits, ranking, permissions, no framework code), `packages/ai` (extraction and receipt prompts plus evals).

## 8. Non-Functional Requirements

- **NFR-1** Idea card under 2 s; AI extraction under 15 s; reading a receipt under 10 s; flight status no more than 5 minutes old while a flight is in the air.
- **NFR-2** A no-app member can vote within 2 taps of opening a text.
- **NFR-3** **Privacy:**
  - Phone numbers are hidden from other members.
  - Pass votes, non-voters and budget answers can never be deduced.
  - Surprise items never leak, including in previews or counts.
  - Flight and travel stats are opt-in.
- **NFR-4** **Correct money math:** amounts are stored to the cent, leftover pennies are assigned predictably, and every change is logged.
- **NFR-5** **No data loss:** the history of expenses and payments is append-only and backed up.
- **NFR-6** **Cost control:** cache AI and places lookups; throttle SMS; cap spend; cache flight-status lookups and poll them only around flight times.
- **NFR-7** **Compliance:**
  - US carrier registration for business texting (A2P 10DLC); STOP handling, including informal opt-outs.
  - TikTok's and Meta's terms; the places provider's terms.
  - Deleting data under GDPR/CCPA without breaking other people's balances: deleted people are anonymized, and their expense records are kept.
- **NFR-8** Accessibility: WCAG AA.

## 9. Technical Risks

| Risk | Mitigation |
|---|---|
| No share sheet on the web | Texting a link to the app's number covers the gap; native app in Phase 2 |
| TikTok/IG content access | TikTok's public link preview gives the caption and thumbnail. Instagram's link preview has needed no token since June 2026 but has returned no thumbnail since November 2025. Downloading video to transcribe audio needs a legal check |
| Extraction accuracy | Flag low confidence; anyone can fix; track the % resolved automatically |
| SMS cost, deliverability and fraud | Throttle; register with carriers; fraud protection; spend caps; launch in 2 countries |
| Forwarded or previewed links | Personal links only allow viewing and voting; money actions need a code; links survive preview bots |
| Receipt OCR errors | Check line items against the total; everything editable; enter manually as a fallback |
| Flight data cost and coverage | Pick a provider with pay-per-call pricing; look up status only around departure and arrival; degrade gracefully |
| Places data storage limits | Store only the place ID; refresh details when viewed |

## 10. Out of Scope (for now)

- Real-time chat
- Booking inside the app
- Payment processing
- Fully automatic itineraries that rearrange themselves without review (the optimizer only suggests; §6.11)
- A public discovery feed (the idea library is private; boards are shared only by link)
- Offline in the web POC

## 11. Business Model

Analysis:
- [`research/revenue-model.md`](research/revenue-model.md): our costs
- [`research/monetization-benchmarks.md`](research/monetization-benchmarks.md): how comparable apps make money, plus a bottom-up revenue model

- **The problem:** people take a trip once or twice a year, so a trip-only app can't support a subscription. Revenue must come from **money already flowing through the trip**, and guests never pay.
- **The fix: the idea library (§6.12, D60–D61).** Travel lovers save ideas every week whether or not a trip is planned, which is how ReciMe built a subscription business around an occasional task (cooking a saved recipe). That supports a **freemium subscription for the person who saves**: free up to 3 AI imports a day, Premium for more. Trip guests, voting, splitting and texting stay free forever.
- **Our cost per trip** (8 people, 5 without the app): **about $2.50–3.50** with group-chat sharing (D49) and other optimizations.
- **Revised revenue per trip (bottom-up, estimates):**

  | Scenario | Booking links and add-ons |
  |---|---|
  | Conservative | $2–4 |
  | Base | $9–15 |
  | Optimistic | $35–50 |

  The earlier $30–45 figure assumed every trip books through us. Why booking links alone earn less:
  - About 30% of bachelor/bachelorette trips have no paid lodging.
  - Airbnb (about 44% of rentals) pays no commission, and Vrbo pays 2%.
  - About 37% of Booking.com reservations are cancelled.
  - People often book later in another app, where our link isn't tracked.
  - One commission per group, not per person.
  - Typical conversion from a booking click is 2–7%.

- **Revenue roadmap.** Users never pay for the core product or for moving money. Full research:
  - `research/revenue-brainstorm.md`: 32 ideas, scored
  - `research/group-card-and-merch.md`

  | Stream | When | Est. $ per trip (cons. / base / opt.) | Notes |
  |---|---|---|---|
  | **Idea library Premium** (subscription; free tier 3 AI imports a day) | Phase 2 (POC measures save frequency first) | Per subscriber, not per trip; price **[OPEN]** (benchmarks: ReciMe $59.99/yr, Wanderlog $39.99/yr) | Only the saver pays; never guests. Premium never changes votes, rankings or shortlists |
  | Hotel and rental links on the decided Stay | Phase 2 | Part of $2–4 / $9–15 / $35–50 | Airbnb pays nothing; Booking.com about 3.75%; Vrbo 2% |
  | Activity links (Viator, GetYourGuide 8%) | Phase 2 | (included above) | Most bachelor/bachelorette activities aren't listed there |
  | **Merch** (matching shirts and hats from the theme poll, through Printful) | Phase 2, bachelor/bachelorette trips | $2 / $11 / $47 per bach trip | About $8–12 margin per item. Hard ordering cutoff 21 days before the trip; block trademarked logos and names |
  | **"Decide → Book → Arrive" cards** (one dismissible card at the right moment each) | Phase 2 | +$5–11 | See the list below |
  | Creator revenue share (TikTok creators earn when their video gets booked) | Phase 2 | Increases link revenue | Store the creator handle on every idea from day one |
  | Brand rebates verified by receipts; venue perks; tourism-board incentives paid on proven visits | At scale (50K+ trips a year) | +$8–20 | Aggregated data only; never data about individuals or crews |
  | Pro tier for planners and travel agents; corporate offsites; white-label for wedding platforms | **Not now** (stay consumer-only) | About $0.5–0.8M a year (est.) | Revisit after the POC |
  | Group trip card (interchange) | On the roadmap; not in the POC. Phase 3+, only if the data justifies it | $0 / $2.30 / $12.50 | About $150–400K a year in fixed compliance costs. Build only if 25%+ of trips pool $1,500+ (measured by FR-73a) |
  | Photo book | Later | $0.25–3.50 | Weak for 2–4 day trips |

  **The "Decide → Book → Arrive" cards:**
  - Hotel group rate request when 8+ people choose a hotel
  - Car or van rental on driving transit cards (Discover Cars about $20 per booking)
  - "Stock the house" grocery and drinks cart handed off to Instacart before arrival
  - Hidden gift card for the guest of honor
  - Airport rides and bag drop on the arrivals board

  **Blended target:** about **$15–25 per trip in Phase 2** against about $3 variable cost.

- **Avoid:**
  - Anything paid touching votes, themes or shortlists
  - Selling the phone graph or data about individuals or crews
  - Sending offers by SMS (legal risk under the TCPA, and carrier filtering of all our texts)
  - Ads on the expenses screen
  - Pushing credit-card sign-ups
  - Alcohol offers without age checks
  - Any gift or wedding offer the guest of honor could see

- **Internal framing:** we're building the **operating system for a group trip**: planning, decisions, attendance, spending, settling up, memories. The TikTok-to-vote hero moment brings people in. Expenses, attendance and the trip's money keep them engaged and create chances to earn.
- **Trust rules for anything paid (non-negotiable):**
  - Sponsored ≠ recommended. Money never influences vote ordering, approval %, AI shortlists, "best" labels or the order stages and ideas appear in.
  - Booking links, vendor options and sponsored items appear **only after a decision** ("Stay is decided: book it?"), never while the group is voting.
  - Sponsored items are always labeled and visually separate from what the group added.
- **What the POC measures** (no affiliate links, no money handled):
  - **Which site each decided Stay comes from** (Airbnb vs. Vrbo vs. Booking.com vs. a hotel's own site), read from the pasted link. This is the biggest unknown.
  - Click rate on booking links, and time from decision to click, per category.
  - A one-tap question to the organizer after the trip: "How did you book the house/activities?"
  - How often organizers use "Collect for the house" tracking, and the amounts involved. This sizes a future group card.
  - **Commercial intent per trip,** per decision (Stay, each activity, transport, vendors):
    - Estimated group spend (from price levels, listing prices and headcount)
    - Booking link shown → clicked → booked (asked of the organizer after the trip)
    - **Actual spend by category, from receipts and "Collect for the house"**: where the trip's money actually went and to whom
  - From these, derive: gross booking intent per trip, revenue *opportunity* per trip, actual revenue per trip, variable cost per trip, and contribution margin per trip.
  - Store the **creator handle** on every TikTok idea, and track idea → decided → receipt per creator.
  - Measure the share of receipts that name a brand on a line item, to see if brand rebates are feasible.
  - **Idea library:** imports per person per day and week, the share of people who'd hit a 3-a-day cap, weekly return rate of savers with no active trip, and how many trips start from a library board.
  - **Goal:** after 100–200 real trips, know whether the business is mainly affiliate, vendor marketplace, or card/payments, instead of guessing from industry rates.
  - **Target to aim for later:** more than $10 revenue per activated trip against about $3 variable cost.
- **Decision rule:** if fewer than 30% of decided Stays could be booked through a commission-paying site, plan around **$3–12 per trip from links** and prioritize revenue streams that don't depend on booking links.
- **Never charge** for guest participation, voting, splitting or being in a trip. The only thing ever paywalled for consumers is the idea library's import limit and Premium extras (D61).
- **NFR:** an internal dashboard of cost vs. revenue per trip from day one.

## 12. Success Metrics (POC)

| Metric | Target |
|---|---|
| Invited members who join | > 60% |
| Ideas per trip | > 10 |
| Ideas resolved by AI without a fix | > 70% |
| Members who vote at least once | > 60% |
| Polls decided by the deadline | > 70% |
| Trips with at least 1 receipt | > 50% |
| Members who link a flight (once available) | > 40% |
| Gross booking intent per trip (estimated $ of decided purchases) | Track; segment by category |
| Share of decided Stays bookable through a commission-paying site (vs. Airbnb or direct) | Track; decision gate at 30% |
| Groups who start a second trip | Track |
| Savers who come back weekly with no active trip (idea library) | Track; the subscription case depends on it |
| AI imports per saver per day (share of days above 3) | Track; tunes the free cap (FR-L20) |
| Trips started from a library board | Track |
| All metrics | **Segmented by trip size** (solo / duo / group) |

## 13. Decision Log

| # | Topic | Decision |
|---|---|---|
| D1 | After a share | Auto-add; flag low confidence; anyone can fix |
| D2 | Vote format | Must-do / Down / Pass |
| D3 | Vote visibility | Blind until you vote; Pass shown as a count only; who hasn't voted is hidden from members |
| D4 | Who decides | Anyone suggests, the app prioritizes, organizers decide |
| D5 | Guest abilities | Everything; viewing and voting through the personal link, money and approvals need a code |
| D6 | Join security | Personal links for invitees; the group link needs a code, plus approval for unknown numbers; organizers remove people |
| D7 | Veto | None; Pass is enough |
| D8 | Deadlines | Set by organizers on polls; non-voters abstain |
| D9 | Receipt split | Chosen per receipt: even or itemized |
| D10 | Expense scope | Easy photo upload, categories, multiple currencies; Venmo links in Phase 2 |
| D11 | Budget check-in | Optional, switched on by the organizer |
| D12 | Web capture | Paste, upload or text to the app's number; share sheet in the native app |
| D13 | Notifications | Partiful-style texts plus two-way replies |
| D14 | Target | Any group; bachelor/bachelorette and friend trips first |
| D15 | Monetization | Parked; no payment processing; booking commissions are most likely |
| D16 | Planning flow | Fixed stages, each skippable, plus custom polls |
| D17 | Choosing cities | Cities are voted ideas; organizers lock the route |
| D18 | Filing ideas | AI assigns each idea to a Stop |
| D19 | Partial attendance | Per-Stop attendance drives votes and splits |
| D20 | Multi-city structure | One trip made of Stops |
| D21 | Editing expenses | Uploader, organizers and the owner |
| D22 | Confirming shares | Even splits accepted automatically; itemized needs claiming; the uploader assigns or absorbs leftovers |
| D23 | Text-in actions | Vote, approve, send links, send receipt photos |
| D24 | Removing someone with a balance | The organizer resolves the balance first |
| D25 | Stop date changes | Ask each time |
| D26 | Listicles | Ask the sharer |
| D27 | Starting a trip | Both: paste anything, or classic setup |
| D28 | Bachelor/bachelorette POC | Surprise mode, guest of honor doesn't pay, theme polls |
| D29 | Currency | Balances tracked and settled per currency |
| D30 | Late joiners | The organizer picks past expenses from a checklist |
| D31 | Drop-outs | The organizer decides per expense |
| D32 | Edit after payment | Locked; fixes are adjustment entries |
| D33 | Ties and low turnout | The organizer decides |
| D34 | Ownership | One owner, transferable |
| D35 | International | US and Canada at launch, expand later |
| D36 | Offline | None until the native app |
| D37 | Flights and stats | Arrivals board plus a gamified travel profile, Phase 2 (native app) |
| D38 | Stats source | Only trips and flights logged in the app; no import |
| D39 | Launch countries | US and Canada for SMS; email verification elsewhere |
| D40 | Flight alerts | Push and email only; no SMS |
| D41 | Idea ranking | Approval % (Must-do + Down), ties broken by Must-do count; cards show both |
| D42 | Contested ideas | "Split opinions" label shown to everyone, no names |
| D43 | Idea digest | Daily, only if there are new ideas; push or email for app users, text for no-app members |
| D45 | Revenue direction | No subscription *for trips* (amended by D61: the idea library has a saver subscription). Booking commissions, travel add-on referrals, vendor leads for bachelor/bachelorette trips, and clearly labeled sponsored picks; payments later. No one-time Bach Pack |
| D47 | Booking in the POC | Plain booking links with click tracking, no affiliate links, to measure intent |
| D51 | Revenue measurement | The POC has no monetization; it measures commercial intent and actual spend per trip to decide the revenue model |
| D52 | Revenue roadmap | Phase 2: links plus merch plus Decide→Book→Arrive cards (target $15–25 per trip). Group card stays on the roadmap but not in the POC. B2B not now. No revenue fake doors in the POC |
| D53 | Tech stack | Next.js + TypeScript on Vercel; Supabase (Postgres, Auth, Storage, Realtime); Drizzle; Inngest; Twilio; Resend; Claude API; Google Places and Maps; Expo for native (§7a) |
| D54 | Trip sizes | Solo, duo and group are all first-class; the founder's first test is a duo trip |
| D55 | Solo voting | Personal priority (Must-do / Maybe / Skip) |
| D56 | Duo voting | Open from the start |
| D57 | Duo decisions | The owner decides (same as groups) |
| D58 | Duo budgets | Shared openly, with a heads-up |
| D60 | Idea library | In the POC (minimal): a personal library for saving travel ideas with no trip. AI auto-sorts by country, city and category; map; custom and shared boards; "trip-ready" nudge; one tap to start a trip. Alerts (best time to go, prices, place updates) in Phase 2, push and email only (§6.12) |
| D61 | Library monetization | Freemium, ReciMe-style: free up to 3 AI imports per person per day (to be tuned), Premium for more. **7-day free trial that converts to paid unless cancelled**, with a reminder before conversion and easy cancel (FR-L21a). Only the saver pays; never trip guests. Paywall ships after the POC; the POC only measures (FR-L20–L24) |
| D62 | Solo-trip imports | Count toward the free import cap; only trips with 2+ active members are exempt (FR-L23) |
| D59 | Plan optimization | In the POC: "Arrange my days" suggests a day-by-day order; the user previews, tweaks and locks. Considers geography, hours and fixed times, meals and pace, priority and attendance (weather is a stretch) |
| D50 | Collection fees | No fee for collecting money. "Collect for the house" is free, tracked through Venmo/Zelle links |
| D49 | Message channels | Push for app users. Group-chat share cards (free) for group news. SMS only for codes, invites, money and personal nudges. Email as a backup. No web push |
| D48 | Map provider | Decide at build time: start on Google within the free tier, switch the map display if volume justifies it |
| D46 | Product principle | Ease of use comes first; features appear only when needed (§2a) |
| D44 | Defaults | All recommended defaults confirmed (owner succession, group link with approval, managed members, age 13+, changeable votes, budget band, one open text question, separate code number) |

## 14. Open Questions

1. Name and brand. (TBD)
2. Try Places.is and Batch hands-on before the build (not done yet).
3. Legal review: transcribing audio from TikTok/IG, carrier filtering of user content, flight data licensing. (TBD)
4. **Idea library (§6.12):**
   - Premium price and any perks beyond more imports (FR-L21).
   - What counts as an "active trip" when routing texted-in links to a trip or the library (FR-83). Suggested default: a trip with activity in the last 14 days or dates in the next 60.
   - The "trip-ready" threshold (FR-L10) and the library alert frequency (FR-L19).
   - Data sources for flight-price and stay-price alerts (FR-L17). FlightAware AeroAPI has no fares, so this needs a separate fare API (candidates to evaluate: Duffel, Kiwi Tequila, a Skyscanner or Travelpayouts affiliate feed); the choice affects §7a and cost.
   - Billing provider for Premium on the web (e.g. Stripe Billing) and in the native app (app-store subscriptions), and the exact reminder timing for the trial.
