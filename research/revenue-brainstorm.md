# Revenue Brainstorm and Pressure-Test

> **Purpose:** Find revenue ideas beyond what's already covered (booking affiliates, travel add-on referrals, vendor leads/flat fees, labeled sponsored picks, the group trip card, merch and photo books), within the rules in REQUIREMENTS §2a and §11.
> **Research date:** 1 Oct 2026. Reddit not used.
> **Labels:** **[Fact]** = from a filing, official page or reputable press, linked. **[Reported]** = secondary source. **[Est.]** = our own assumption. **(verify)** = rate or term not confirmed in this session. The web-search budget ran out partway through, so several affiliate rates below are working assumptions to confirm before modeling.
> **Reference trip** (same as [`monetization-benchmarks.md`](monetization-benchmarks.md) §7.1): 8 people, bachelor/bachelorette, 3 nights, about $3,000 of lodging, about $600 of group activities. Base case for existing streams is **$9–15 per trip**.

---

## 0. Bottom line

1. **No single new idea is big, but four clusters add up.** The best ideas sit at moments the app already owns: the **locked Stay**, the **arrivals board**, the **guest of honor** and the **receipt**. Together they add an estimated **$5–11 per trip** in Phase 2 and **$8–20 per trip at scale**, on top of the $9–15 base. This roughly doubles today's base case without charging users or taking a cut of money moves.
2. **The strongest asset is receipt-verified group intent:** TikTok, then vote, then visit, then spend. Brands, venues and tourism boards already pay for exactly this "closed loop" (Ibotta, Cardlytics, Datafy). It only becomes sellable **at scale** and **only in aggregate**.
3. **B2B is the cleanest money and has no trust cost.** Pro planners, corporate offsites and wedding platforms can pay subscriptions or per-event fees. This is the only route around the "1–2 trips a year" problem, because the payer plans many trips.
4. **Hard rule from this exercise: nothing paid ever touches the vote.** Sponsored poll options, pay-to-rank in the shortlist, and brand-tinted AI suggestions would wreck the core promise ("the group chat that actually decides"). See §5.

---

## 1. Constraints applied

- No subscriptions for consumers, no per-person pricing, **guests never pay**, **no fees on moving money** (D50). Venmo/Zelle stay free.
- Ease of use first (§2a, P9): every revenue surface must appear only at the moment it's useful and stay invisible otherwise. One card, dismissible, never in the voting flow.
- **No paid "Bach Pack"** (D45). Free, brand-funded items are allowed but flagged.
- **POC has no affiliate links** (D47). POC experiments use plain links, fake doors and concierge (manual) tests.
- **Affiliate links stay on the trip page, not in SMS:** program terms (for example, Airbnb Creators bans SMS promotion) and carrier filtering.

---

## 2. The ideas (32, plus 4 to avoid)

Columns: **Who pays** · **Evidence** · **Rev** = rough revenue per *average* trip unless noted, all **[Est.]** · **Effort** S/M/L · **Risk** to trust or ease of use · **When** = Now (POC/MVP) / P2 (native app) / Scale.

### A. Arrival day and on-trip commerce (triggered by the locked Stay and the arrivals board)

| # | Idea: how it works | Who pays | Evidence | Rev | Effort | Risk | When |
|---|---|---|---|---|---|---|---|
| 1 | **"Stock the house" group cart.** Once a rental Stay is locked, one card 2–3 days before arrival: everyone adds items to a shared list (drinks, snacks, breakfast). The organizer checks out on Instacart (or Uber Eats for alcohol), timed to the first arrival. | Instacart / Uber (affiliate or partner rev share, new-customer bounties) | Partiful's **Instacart Group Order**: host pays a $5 delivery fee and Partiful "takes a percentage of the total order value" ([Sacra](https://sacra.com/c/partiful/)) [Reported]. Instacart's [Developer Platform](https://docs.instacart.com/developer_platform_api/) supports shopping-list handoff; commission terms aren't public (verify). Drizly closed in Mar 2024 and was folded into Uber Eats ([Wikipedia](https://en.wikipedia.org/wiki/Drizly)) [Fact] | $0.50–2 (about 6–10% of trips order through us × about $350 order × 3–5% or a bounty) | M | Low | P2 (fake door now) |
| 2 | **Shared airport ride.** The arrivals board sees 3+ people landing at the same airport within about 45 min and suggests one van or XL ride instead of three. | Transfer provider (Welcome Pickups, Kiwitaxi) or Uber first-ride bounty | Uber runs an acquisition-focused affiliate program that pays "for users who take their first trip or place their first order"; rates are negotiated ([Uber](https://www.uber.com/us/en/affiliate-program/)) [Fact]. Transfer affiliate rates (verify) | $0.30–1 (only about 17–22% of bachelorette trips fly) | M | Low | P2 |
| 3 | **Bag drop before check-in.** If arrivals land before rental check-in, show one line: "Drop bags nearby" (Bounce, Radical Storage). | Luggage-storage marketplace (affiliate %) | Affiliate programs exist; rates not confirmed (verify) | $0.10–0.40 | S | Low | P2 |
| 4 | **Lounge pass on long delays.** When a member's flight shows a 2h+ delay, offer a lounge day pass. | Lounge-pass sellers (Priority Pass, LoungePass/Collinson) | Programs exist through affiliate networks (verify) | <$0.20 | S | Low–med (can feel opportunistic) | P2 |
| 5 | **Upgrade bids from the arrivals board.** | Airlines | Plusgrade runs upgrade bids for "250+" travel companies ([Plusgrade](https://www.plusgrade.com/)) [Fact], but **sells to airlines directly; no third-party distribution found** | ~$0 | L | Low | Skip |
| 6 | **Car/van rental on the "Getting around" card.** When the transit stage shows a drive or a large group, include a rental-van option. | Car-rental broker | Discover Cars pays **70% of rental profit + 30% of full-coverage revenue, about $20 per booking, 365-day cookie, 3–5.5% conversion** ([Discover Cars](https://www.discovercars.com/affiliate)) [Fact] | $0.50–1 | S | Low | Now (plain link) / P2 (affiliate) |
| 7 | **Event-driven trips (festivals, sports, concerts).** When trip dates and a Stop overlap a known event (ACL, a bowl game, Coachella), add an "Event tickets" idea card and a seasonal "festival weekend" template. | Ticket resellers (StubHub, SeatGeek, Ticketmaster via networks) | Ticket affiliate programs exist; rates not confirmed (verify) | $0–3 average; $10–40 on event trips | M | Low | P2 |

### B. Venue and restaurant side

| # | Idea | Who pays | Evidence | Rev | Effort | Risk | When |
|---|---|---|---|---|---|---|---|
| 8 | **"Book for 10" group dining requests.** When a group locks a dinner idea, one tap sends a structured group request (date, headcount, budget band, deposit OK) to the venue's events inbox. The venue pays per **seated** group. | Restaurants and bars | OpenTable "charges restaurants flat monthly and per-reservation fees"; diners pay nothing ([Wikipedia](https://en.wikipedia.org/wiki/OpenTable)) [Fact]. Batch moved to "No revenue split. Just a flat monthly fee" for vendors ([Batch](https://letsbatch.com/suppliers)) [Fact] | $2–6 (30–50% of trips × 1 group dinner × $10–25 per seated group) | L (venue density city by city) | Med (paid venues must never rank higher) | P2 in 2–3 bach cities |
| 9 | **Venue group perks, receipt-verified.** Venues offer "groups of 8+ get a free round / skip the line." Shown **only after** the group has already chosen that venue. The venue pays per redemption, proven by the scanned receipt. | Bars, restaurants, activity venues | Same pay-for-performance logic as Ibotta and Cardlytics (below). Batch vendor fees show venues pay to reach bach groups | $1–3 | M | Low–med | P2 / Scale |
| 10 | **Hotel group blocks.** When a hotel Stay is locked and 8+ people are attending (5+ rooms), offer "Request a group rate." Route to a group-booking marketplace that returns quotes. | Hotels (commission on the block, shared with us) | **Groups360 GroupSync**: 200,000+ properties, groups of 10+ rooms, "up to 60% off standard rates," commission-based ([Groups360](https://www.groups360.com/)) [Reported]. Hotels paying ~10% on group business is industry custom (verify) | $2–4 (38% hotel trips × 50% large × 15% use × ~$150) | M | Low (saves the group money) | P2 |

### C. B2B data (aggregated and anonymized only; k-anonymity thresholds, no individual or crew-level data)

| # | Idea | Who pays | Evidence | Rev | Effort | Risk | When |
|---|---|---|---|---|---|---|---|
| 11 | **"Group Trip Intelligence" for tourism boards (DMOs).** Dashboard per destination: group trips planned, lead time, group size, bach share, spend by category, which content turned into visits. | DMOs / CVBs (annual subscription, est. $5–25K) | **Datafy** sells visitor data and attribution to destinations, "500+ clients" ([Datafy](https://www.datafy.com/)) [Fact]. Mindtrip sells B2B subscriptions to DMOs ([PhocusWire](https://www.phocuswire.com/mindtrip-ai-travel-b2b-destination-marketing)) [Fact]. Skyscanner's "advertising & partner analytics" earned £56.9M in 2023 (see benchmarks §2) | $0.2–1M ARR at 50K+ trips/yr (≈ $4–20 per trip) | L | Med (privacy perception) | Scale |
| 12 | **Closed-loop attribution reports** ("this TikTok drove 37 group visits and $14K of receipts") for venues, agencies and brands. | Venues, agencies, brands | Cardlytics monetizes "first-party purchase data" for advertisers, seeing about half of US card transactions ([Cardlytics IR](https://ir.cardlytics.com/)) [Fact] | $1–3 at scale | L | Med | Scale |
| 13 | **Receipt-verified brand rebates.** After a receipt scan, if a line item matches a brand offer ("$10 back on 2 bottles of X"), show "Bonus found: $10 back." The cash goes to the payer. Join **Ibotta's Performance Network as a publisher** instead of building a brand sales team. | CPG brands (alcohol, beverage, beauty) | Ibotta: brands fund rewards; its **Ibotta Performance Network** distributes offers through publishers such as Walmart, Instacart and Dollar General; 2025 revenue about $342M ([Wikipedia](https://en.wikipedia.org/wiki/Ibotta)) [Reported]. Fetch runs the receipt-scan version of this model (verify figures) | $1–3 | M | Low–med (only shown after the scan, never before a vote) | P2 / Scale |
| 14 | **Sponsored annual "Bachelorette Index" / "Group Trip Report."** Aggregate trends (top cities, average spend, top TikTok-to-visit spots) published as a press report with a sponsor or licensed to a media outlet. | A brand sponsor or a publisher | Spotify Wrapped-style recaps earn huge organic reach (1.2M+ tweets in Dec 2019) and are widely copied ([Wikipedia](https://en.wikipedia.org/wiki/Spotify_Wrapped)) [Fact]. Sponsored-report pricing (verify) | $10–50K per report; also free PR | S | Low | P2 |

### D. Creator economy

| # | Idea | Who pays | Evidence | Rev | Effort | Risk | When |
|---|---|---|---|---|---|---|---|
| 15 | **Creator share of booking commissions.** When a creator's TikTok becomes a decided idea and is booked through our link, the creator gets a share (for example 30%). Creators then post "drop this in [App]" calls to action, which raises our booking volume. | Booking and activity partners (we pass part through) | **LTK**: $6B+ yearly sales, **$3B+ paid to creators**, about 1,100 "LTK millionaires" ([LTK](https://company.shopltk.com/)) [Fact]. Mindtrip pays creators about $1–1.50 per registered user (benchmarks §3) | Net +$1–2 (higher volume minus creator share) | M | Low | P2 |
| 16 | **Sponsored "Steal this weekend" templates.** Creators publish trip templates; a DMO or brand sponsors a set ("Nashville bach weekend, presented by Visit Music City"). Booking links inside earn as usual. | DMOs, brands | Mindtrip's DMO deals; sponsorship pricing (verify) | $0.5–2 | M | Low–med (must stay labeled) | P2 |
| 17 | **Creator Insights (pro).** Creators see how many groups saved, voted on, visited and spent at places from their videos. | Creators, talent managers (B2B subscription) | LTK shows creators pay attention to conversion data; pricing (verify) | $50–200K ARR at scale | M | Low | Scale |

### E. Brand sponsorships

| # | Idea | Who pays | Evidence | Rev | Effort | Risk | When |
|---|---|---|---|---|---|---|---|
| 18 | **Free sponsored bach kits.** Verified bach trips (guest of honor marked, rental address and dates known) can opt in to a **free** brand kit shipped to the rental: hangover/hydration, beauty, sunscreen, non-alcoholic mixers. **No alcohol** unless age-verified and legal. Not the paid Bach Pack rejected in D45. | Brands (fee per kit or per qualified sample) | Product-sampling platforms charge brands per targeted sample (verify; Sampler site unreachable) | $2–4 average (15–20% of bach trips × $20–40 per kit) | M | Med (address handling, perceived spam) | P2 |
| 19 | **Sponsored Trip Wrapped.** An optional, labeled "presented by" frame or sticker pack in the post-trip recap. | Brands (flat sponsorship) | Wrapped-style recaps drive sharing (#14) | $0.2–1 | S | Med (brand on a personal memory) | Scale |

### F. Fintech-lite (no fees on money moves)

| # | Idea | Who pays | Evidence | Rev | Effort | Risk | When |
|---|---|---|---|---|---|---|---|
| 21 | **"Drop-out cover" for the house.** At Stay lock, offer an optional embedded policy that refunds a member's share of the house if they cancel for a covered reason. It solves a real bach pain: someone bails and the others eat the cost. | Insurer (revenue share via an embedded-insurance platform) | **Cover Genius / XCover**: embedded protection for Uber, Ryanair, Amazon and others on a "revenue-share model" ([Cover Genius](https://www.covergenius.com/)) [Fact]. Hopper: about 60% of app customers buy a fintech add-on (benchmarks §2) | $1–3 | M | Med (the purchase is optional, but it must not feel like a toll) | P2 |
| 22 | **FX for multi-currency balances.** When a non-USD balance is settled, show "Send at the real rate" via Wise. | Wise (per new customer, verify) | Wise referral program exists (verify terms) | $0.10–0.30 (about 8% of trips are international) | S | Low | P2 |
| 23 | **Card sign-up bonus for the organizer who fronts the house.** "You're fronting $3,000; these cards give a bonus at that spend." | Card issuers (bounty per approval, verify) | Card bounties are large but need publisher approval and compliance (benchmarks §8) | $2–5 | S | **High** (feels predatory; credit and compliance) | Avoid for now |

### G. Group gifting and wedding tie-ins

| # | Idea | Who pays | Evidence | Rev | Effort | Risk | When |
|---|---|---|---|---|---|---|---|
| 24 | **Gift for the guest of honor.** A card hidden from the guest of honor: "Chip in on a gift?" with 6 curated gift links (experience gifts, jewelry, sashes). The money is tracked like any expense (free, via Venmo). | Retailers (affiliate 3–10%, verify) | Zola's free registry is a "loss leader" that drives product sales; it offers group gifting ([Wikipedia](https://en.wikipedia.org/wiki/Zola_(company))) [Reported] | $0.50–1.50 | S | Low | Now (plain links) |
| 25 | **White-label / API for wedding platforms.** A "Plan the bach / group weekend" module embedded in Zola, The Knot or Joy wedding sites, or a licensed API. | Wedding platforms (license or revenue share) | Zola raised $140M and runs wedding sites, a registry and vendor marketplace, including hotel blocks ([Wikipedia](https://en.wikipedia.org/wiki/Zola_(company))) [Reported]. Hopper's B2B arm (HTS) shows white-label travel can be a large business (benchmarks §2) | $100–250K per deal per year | L | Low | Scale |
| 26 | **Wedding-funnel referrals.** The app knows a wedding is coming. After the bach trip, the organizer (never the guest of honor in a surprise trip) can share "help them with wedding travel": guest hotel blocks, registry. | Wedding platforms, hotel-block providers | Zola runs hotel blocks and vendor referrals ([Wikipedia](https://en.wikipedia.org/wiki/Zola_(company))) | $0.50–2 | S | Med (surprise leakage, feels salesy) | P2 |

### H. B2B planners and organizations

| # | Idea | Who pays | Evidence | Rev | Effort | Risk | When |
|---|---|---|---|---|---|---|---|
| 27 | **Pro tier for planners and travel agents.** Manage many client trips, brand the invites, export to client, track commissions. Guests stay free. | Professional bach planners, travel advisors | **Travefy** charges travel pros **$39–59/month** (annual), $20 per extra seat, and serves "50,000 travel brands" ([Travefy](https://travefy.com/pricing)) [Fact] | $40–60 per planner per month; 500 planners ≈ $250–350K ARR | M | Low | P2 |
| 28 | **Corporate offsites and team trips.** A per-event fee (est. $149–299) paid by the company: expense export (CSV to Ramp or Expensify), company-paid splits, admin view. | Employers | TripIt Pro is given to corporate travelers through SAP Concur (benchmarks §3); Travefy shows pros pay for planning tools | $149–299 per offsite | M | Low | P2 |

### I. Ads and referral bounties

| # | Idea | Who pays | Evidence | Rev | Effort | Risk | When |
|---|---|---|---|---|---|---|---|
| 29 | **Contextual ads in the expenses screen** (Splitwise free-tier style). | Advertisers (CPM) | Splitwise shows ads on its free tier (benchmarks §4) | $0.20–0.50 | S | Med–high (clutter, cheapens the app) | Avoid |
| 30 | **First-use bounties for apps the group needs anyway** (Uber, Uber Eats, Instacart, Turo). Only in the context where they're useful (#1, #2, #6). | Those apps | Uber pays per first trip or first order ([Uber](https://www.uber.com/us/en/affiliate-program/)) [Fact] | $0.50–1.50 | S | Low | P2 |

### J. Other creative ideas

| # | Idea | Who pays | Evidence | Rev | Effort | Risk | When |
|---|---|---|---|---|---|---|---|
| 31 | **DMO-funded group-visit incentives, verified by receipts.** A tourism board funds "$150 toward your group dinner if 8+ of you book 2 nights in Savannah." Receipts and arrivals prove the visit, so the DMO pays only for real visits. | DMOs | DMOs buy visitor attribution (Datafy, Mindtrip above). Incentive budgets for groups and meetings are common (verify for leisure groups) | $1–3 average; $10–20 per incentivized trip | M | Low–med (must be shown at the "Where" stage as a labeled option, never a ranking boost) | P2 pilot / Scale |
| 32 | **Hotel price-drop rebooking.** After a refundable hotel booking is logged, watch the price; if it drops, offer one-tap rebooking through our link. | Hotel booking partner (new commission) | Same affiliate terms as hotels (benchmarks §5) | $0.30–1 | M | Low (saves the group money) | P2 |
| 20 | **Sponsored poll themes or options** (see §5) | Brands | — | — | — | **High** | **Avoid** |

**Ideas to avoid** (no table row): #33 selling or renting the phone graph or any individual/crew-level data; #34 pay-to-rank in the AI shortlist or vote order; #35 offers sent by SMS; #36 any fee on Collect / settle-up (already rejected in D50). Reasons in §5.

---

## 3. Scoring and ranking

**Scale (1–5 each):** **R** revenue potential, **T** trust and ease-of-use safety (5 = no risk), **E** ease of building (5 = small), **N** timing (5 = now, 3 = P2, 1 = scale only).
**Score = 4R + 3T + 2E + 1N** (max 50). Revenue and trust carry the most weight. Ease and timing break ties.

| Rank | # | Idea | R | T | E | N | Score |
|---|---|---|---|---|---|---|---|
| 1 | 28 | Corporate offsites per-event fee | 4 | 5 | 3 | 3 | **40** |
| 2 | 6 | Car/van rental on Getting around | 2 | 5 | 5 | 5 | **38** |
| 3 | 1 | "Stock the house" group cart | 3 | 5 | 3 | 4 | **37** |
| 3 | 10 | Hotel group blocks | 4 | 4 | 3 | 3 | **37** |
| 5 | 15 | Creator share of booking commissions | 3 | 5 | 3 | 3 | **36** |
| 5 | 24 | Gift for the guest of honor | 2 | 5 | 4 | 5 | **36** |
| 5 | 25 | Wedding-platform white-label / API | 4 | 5 | 2 | 1 | **36** |
| 5 | 27 | Pro tier for planners | 3 | 5 | 3 | 3 | **36** |
| 9 | 7 | Event-driven ticket cards | 3 | 4 | 4 | 3 | 35 |
| 10 | 14 | Sponsored trend report | 2 | 5 | 4 | 3 | 34 |
| 10 | 18 | Free sponsored bach kits | 4 | 3 | 3 | 3 | 34 |
| 10 | 31 | DMO-funded verified group incentives | 4 | 4 | 2 | 2 | 34 |
| 13 | 11 | DMO Group Trip Intelligence | 4 | 4 | 2 | 1 | 33 |
| 13 | 13 | Receipt-verified brand rebates | 3 | 4 | 3 | 3 | 33 |
| 13 | 16 | Sponsored templates | 3 | 4 | 3 | 3 | 33 |
| 13 | 30 | First-use bounties | 2 | 4 | 5 | 3 | 33 |
| 13 | 23 | Card bonus for the organizer | 4 | 2 | 4 | 3 | 33 (held back by trust) |
| 18 | 3 | Bag drop before check-in | 1 | 5 | 5 | 3 | 32 |
| 18 | 8 | "Book for 10" venue-paid dining | 4 | 3 | 2 | 3 | 32 |
| 18 | 26 | Wedding-funnel referrals | 3 | 3 | 4 | 3 | 32 |
| 18 | 32 | Hotel price-drop rebooking | 2 | 5 | 3 | 3 | 32 |
| 22 | 9 | Venue group perks (receipt-verified) | 3 | 4 | 2 | 3 | 31 |
| 23 | 21 | Drop-out cover (embedded insurance) | 3 | 3 | 3 | 3 | 30 |
| 24 | 2 | Shared airport ride | 2 | 4 | 3 | 3 | 29 |
| 24 | 22 | Wise FX | 1 | 4 | 5 | 3 | 29 |
| 26 | 4 | Lounge pass on delay | 1 | 4 | 4 | 3 | 27 |
| 26 | 17 | Creator Insights (pro) | 2 | 4 | 3 | 1 | 27 |
| 28 | 12 | Closed-loop attribution reports | 3 | 3 | 2 | 1 | 26 |
| 28 | 19 | Sponsored Trip Wrapped | 2 | 3 | 4 | 1 | 26 |
| 30 | 29 | Ads in the expenses screen | 1 | 2 | 5 | 3 | 23 |
| 31 | 20 | Sponsored poll themes | 2 | 1 | 4 | 3 | 22 (avoid) |
| 32 | 5 | Upgrade bids | 1 | 3 | 1 | 1 | 16 |

### Top 8

1. **Corporate offsites (#28):** the cleanest money in the list. The company pays, guests don't, and it reuses everything already built (splits, CSV export).
2. **Car/van rental (#6):** a small amount, but nearly free to add to the existing "Getting around" card. Discover Cars' 365-day cookie fixes the short-window problem other programs have.
3. **"Stock the house" (#1):** Partiful proved this exact pattern. It's genuinely useful on arrival day, and it brings app users back right before the trip.
4. **Hotel group blocks (#10):** the group saves money and we earn a commission. It's the highest-value consumer idea after the existing booking links.
5. **Creator commission share (#15):** not new revenue by itself, but it multiplies the booking-link stream and turns TikTok creators into a distribution channel.
6. **Gift for the guest of honor (#24):** fits bach mode and surprise mode, and is shippable as plain links in the POC.
7. **Wedding-platform white-label (#25):** a long-term B2B deal and possible acquirer path (compare Expedia buying Layla). Needs traction first.
8. **Pro tier for planners (#27):** Travefy proves that travel pros pay $39–59 a month. Our unique hook is that clients vote by text.

**Just outside the top 8:** event tickets (#7), the sponsored trend report (#14), free bach kits (#18) and DMO-funded incentives (#31). These become strong at scale and anchor Stack B.

---

## 4. Revenue stacks

Each stack groups ideas that share a trigger, data or partner, so building one makes the next cheaper. Figures are **[Est.]**, per average reference trip, **incremental** to the $9–15 base from booking links.

### Stack A: "Decide → Book → Arrive" (consumer, Phase 2) — recommended first

**Logic:** every item fires off a moment the app already has (Stay locked, transit stage, arrivals board, guest of honor). Each is one dismissible card at the right moment, so P2/P9 hold.

| Component | Trigger | Per trip |
|---|---|---|
| Hotel group blocks (#10) | Hotel Stay locked + 8+ attending | $2–4 |
| Creator commission share (#15) | Decided idea from a TikTok | +$1–2 net |
| "Stock the house" (#1) + first-use bounties (#30) | Rental locked, 2–3 days before arrival | $1–3 |
| Car/van rental (#6) | Getting-around stage | $0.50–1 |
| Gift for the guest of honor (#24) | Bach mode on | $0.50–1.50 |
| Shared airport ride (#2) + bag drop (#3) | Arrivals board | $0.40–1.40 |
| **Blended** | | **≈ $5–11 per trip**, so total ≈ **$15–25** with the base |

**Why it reinforces itself:** creator links bring more decided ideas, which bring more booking clicks. The locked Stay powers blocks, groceries and bag drop. The arrivals board brings people back into the app on travel day, where the arrival cards live.

### Stack B: "Verified group spend" (sponsors and data, at scale)

**Logic:** the receipt plus the TikTok-to-visit chain is unique data. Use it once as a pay-for-performance signal (brands and DMOs pay only for proven visits or purchases) and again as aggregated insight.

| Component | Per trip at scale (≥ 50K trips/yr) |
|---|---|
| Receipt-verified brand rebates via a publisher network (#13) | $1–3 |
| Venue group perks paid per redemption (#9) | $1–3 |
| Free sponsored bach kits (#18) | $2–4 |
| DMO-funded verified group incentives (#31) | $1–3 |
| DMO Group Trip Intelligence + sponsored trend report (#11, #14) | $4–10 (ARR spread over trips) |
| **Blended** | **≈ $8–20 per trip at scale** |

**Why it reinforces itself:** every rebate and perk makes people scan more receipts, which improves the data the DMOs pay for. The trend report is both revenue and marketing for the DMO sales pitch.
**Condition:** strict aggregation (minimum cohort sizes), opt-in for kits, a public privacy promise ("we never sell your data or your friends' numbers").

### Stack C: "Pros and partners" (B2B, Phase 2 onward)

**Logic:** people who plan many trips can pay subscriptions; guests stay free.

| Component | Revenue |
|---|---|
| Pro tier for planners (#27) | $40–60/month per planner → ≈ $250–350K ARR at 500 planners |
| Corporate offsites (#28) | $149–299 per offsite → ≈ $150–300K at 1,000 offsites/yr |
| Wedding white-label / API (#25) | $100–250K per partner per year |
| Wedding-funnel referrals (#26) | $0.50–2 per bach trip |
| **Blended** | **≈ $0.5–0.8M ARR** with one wedding partner; per B2B trip $25–300 |

**Why it reinforces itself:** every pro-planned or offsite trip invites 8–30 new people by text (the growth loop), and the wedding partner brings bach parties in at the top of the funnel.

**Recommendation:** build **Stack A in Phase 2**, start **Stack C as cheap sales tests now** (no code needed for pre-sales), and **design data capture for Stack B now** (creator handle, venue, receipt line items) without selling anything until there's scale.

---

## 5. Ideas that would damage trust or the core experience (avoid)

| Idea | Why to avoid |
|---|---|
| **Sponsored poll options or themes (#20)**, e.g., "Disco Cowgirl by [Brand]" in a theme vote | Paid content inside a vote is the fastest way to destroy "the group chat that actually decides." Research in §2 shows one visible early upvote shifts results by about 25%. Paid placement inside voting is worse |
| **Pay-to-rank in the AI shortlist or vote order (#34)** | The app "prioritizes" ideas (D4, D41). If money touches that ranking, every recommendation becomes suspect. Sponsored picks must stay in their own labeled slot, outside the voting set |
| **Selling the phone graph or individual/crew-level data (#33)** | The verified phone graph is built on friends inviting friends. Selling it would be a privacy breach in spirit (and likely under CCPA "sale" rules), would trigger App Store and carrier scrutiny, and would kill the invite loop. Only aggregated, thresholded insights |
| **Offers by SMS (#35)** | Texts are for codes, invites, money and personal nudges (D49). Marketing by SMS risks TCPA exposure, A2P 10DLC carrier filtering of *all* our texts, and violates some affiliate terms (Airbnb Creators) |
| **Fees on Collect / settle-up (#36)** | Already rejected (D50). People will just use Venmo |
| **Card sign-up pushes (#23)** | Pushing credit at the person fronting $3,000 looks predatory and needs financial-promotion compliance. Revisit only as a passive, opt-in "money tips" item, never to guests |
| **Ads in the expenses screen (#29)** | Tiny revenue ($0.20–0.50 per trip) for visible clutter in the most stressful screen (money). Breaks §2a |
| **Alcohol in sponsored kits without age checks** | Legal exposure (shipping alcohol, under-21 members since the age floor is 13+, D44) |
| **Wedding or gift offers visible to the guest of honor** | Breaks surprise mode (FR-91). Every gift and wedding card must respect surprise hiding |
| **Upgrade bids (#5)** | No distribution route; effort with no revenue |

**Guardrails for everything that ships:**
- Revenue cards appear only after a decision, never during collecting or voting.
- Always labeled.
- One card at a time, dismissible, and "not for this trip" hides that category for the trip.
- Never sent by SMS.
- Never shown to the guest of honor when surprise mode is on.

---

## 6. Cheap experiments for the POC

The POC has no affiliate links (D47), so these use **plain links, fake doors, concierge (manual) service, and conversations.** Each test respects P9: one card, shown only at its trigger.

| # | Validates | Experiment | Cost | Pass signal [Est.] |
|---|---|---|---|---|
| 1 | Stock the house (#1) | Fake-door card "Stock the house before you land?" 2–3 days before a locked rental Stay. Tapping it opens a shared list, then a plain Instacart link | 1–2 days of dev | ≥ 15% of rental trips tap; ≥ 5% check out |
| 2 | Hotel group blocks (#10) | "Request a group rate" on locked hotel Stays with 8+ attending. A founder fulfils it by hand through Groups360/HotelPlanner and reports the savings | 1 day of dev + manual time | ≥ 20% of eligible trips request; quotes beat public rates |
| 3 | Gift for the guest of honor (#24) | Card hidden from the guest of honor with 6 curated plain links; track clicks and log gift expenses | ½ day | ≥ 25% of bach trips click; ≥ 10% log a gift expense |
| 4 | Car/van rental (#6) | Plain Discover Cars link on driving transit cards; click tracking | ½ day | Click rate on decided transit ≥ 10% |
| 5 | Creator share (#15) | Already store the source creator handle on every TikTok idea. Count idea → decided → receipt per creator. DM the top 10 creators: "Your videos got 37 groups to go. Want a cut when they book?" | Analytics query + 10 DMs | ≥ 3 of 10 creators reply with interest |
| 6 | Pro tier (#27) | Landing page plus outreach to 20 professional bach planners and travel advisors; pre-sell at $39/month (refundable) | 1 week of founder time | ≥ 3 paid pre-orders or LOIs |
| 7 | Corporate offsites (#28) | Landing page plus 10 conversations with ops or People leads; quote $199 per offsite | 1 week | ≥ 2 pilots agreed |
| 8 | Bach kits (#18) | Concierge: 1–2 non-alcoholic DTC brands (hydration, beauty) send free kits to 10 opted-in bach trips; measure opt-in and ask the brand what it would pay | Brand-funded; a few hours | ≥ 40% opt in; brand quotes ≥ $20 per kit |
| 9 | Brand rebates (#13) | Measure the share of receipts whose line items name a brand (needs no partner). Feasibility only | Analytics query | ≥ 30% of bar/grocery receipts carry brand names |
| 10 | DMO data (#11, #31) | Show a mock dashboard to 5 DMOs (start with bach cities: Nashville, Scottsdale, New Orleans, Austin, Charleston). Ask about price and whether they'd fund a verified-visit incentive | Founder time | ≥ 2 DMOs name a budget |
| 11 | Overall fit | Extend the existing post-trip "How did you book?" question with one more tap ("Did you also… groceries delivered / rental car / group gift / none"). Optional, one screen | ½ day | Baseline of what groups already buy |

**Order:** 5, 9 and 11 are data you get for free; run them from day one. Then 1–4 as tiny fake doors. Run 6–8 and 10 in parallel as founder sales work; they need no code.

---

## 7. Sources

Verified in this session:
- Partiful Instacart Group Order: [Sacra](https://sacra.com/c/partiful/)
- Instacart shopping-list handoff: [Instacart Developer Platform](https://docs.instacart.com/developer_platform_api/)
- Drizly shut down, folded into Uber Eats: [Wikipedia](https://en.wikipedia.org/wiki/Drizly)
- Uber affiliate program: [Uber](https://www.uber.com/us/en/affiliate-program/)
- Discover Cars affiliate terms: [Discover Cars](https://www.discovercars.com/affiliate)
- Plusgrade: [Plusgrade](https://www.plusgrade.com/)
- OpenTable restaurant-paid model: [Wikipedia](https://en.wikipedia.org/wiki/OpenTable)
- Batch flat vendor fee: [Batch suppliers](https://letsbatch.com/suppliers)
- Groups360 group hotel marketplace: [Groups360](https://www.groups360.com/)
- Datafy destination data: [Datafy](https://www.datafy.com/)
- Cardlytics purchase-data media: [Cardlytics IR](https://ir.cardlytics.com/)
- Ibotta Performance Network: [Wikipedia](https://en.wikipedia.org/wiki/Ibotta)
- LTK creator commerce: [LTK](https://company.shopltk.com/)
- Spotify Wrapped reach and copycats: [Wikipedia](https://en.wikipedia.org/wiki/Spotify_Wrapped)
- Cover Genius embedded insurance: [Cover Genius](https://www.covergenius.com/)
- Travefy pricing: [Travefy](https://travefy.com/pricing)
- Zola model: [Wikipedia](https://en.wikipedia.org/wiki/Zola_(company))

Carried over from [`monetization-benchmarks.md`](monetization-benchmarks.md) (sources linked there): Mindtrip DMO and creator programs ([PhocusWire](https://www.phocuswire.com/mindtrip-ai-travel-b2b-destination-marketing)), Skyscanner partner analytics, Hopper fintech and HTS, Splitwise, SquadTrip, Polarsteps, WeddingWire bachelorette data, Airbnb affiliate closure.

**To verify before modeling:** Instacart and Uber partner rates; Welcome Pickups, Kiwitaxi, Bounce, Priority Pass, Wise, ticket-reseller and gift-retailer affiliate terms; hotel group-block commission norms; Fetch receipt-network scale; product-sampling pricing; card bounties and compliance.
