# Revenue Model and Unit Economics (Draft)

> The core problem: people plan 1–2 group trips a year, so a subscription is a hard sell. Revenue has to come from **the money already flowing through a trip** (bookings, deposits, travel services), not from charging users to use the app.
> Prices were checked on 30 Sep–1 Oct 2026. Items marked *(verify)* are estimates to confirm before relying on them.

## 1. What a trip costs us

**Reference trip:** 8 people, 2 Stops, about 6 weeks of planning plus a 4-day trip. 40 ideas shared, 25 receipts, **5 of 8 members never install the app** (they get texts).

### 1.1 Unit prices

| Service | Price | Source |
|---|---|---|
| SMS out (US) | $0.0083 per segment + about $0.0035–0.0045 carrier fee | [Twilio US pricing](https://www.twilio.com/en-us/sms/pricing/us) |
| MMS out (US) | $0.022 per message + carrier fee | Twilio |
| Phone number | $1.15 a month, plus one-time and monthly fees for carrier registration (A2P 10DLC) | Twilio |
| Places Text Search (Pro) | $32 per 1,000, 5,000 free a month | [Google Maps pricing](https://developers.google.com/maps/billing-and-pricing/pricing) |
| Place Details | Essentials $5, Pro $17 per 1,000 (10K and 5K free a month) | Google |
| Dynamic map load | $7 per 1,000, 10,000 free a month | Google |
| Claude Sonnet 5.5 | $2 input / $10 output per million tokens (Batch API −50%) | Anthropic |
| Claude Haiku 4.5 | $1 input / $5 output per million tokens | Anthropic |
| Image input | About 1,600 tokens for a phone photo resized to about 1.2 MP | Anthropic (verify) |
| Flight status (FlightAware AeroAPI) | About $0.002–0.05 per query; $100 a month minimum for the Standard tier with alerts | [AeroAPI](https://www.flightaware.com/commercial/aeroapi/) |

### 1.2 Cost per trip

| Cost | Assumptions | Cost at list price | Cost with optimizations |
|---|---|---|---|
| **Texting** | About 45 texts per no-app member (invite, digests, polls, nudges, decisions, expenses, reminders). Links push most texts to 2 segments (about $0.025 each). Plus replies, MMS receipts and sign-in codes | **$6–7** | **$2–3**: fewer digests sent as texts, a single text per poll, nudges stop once someone has voted, and prompts to install the app |
| **Places + maps** | 40 ideas × (search + details) ≈ $0.05 each; about 250 map loads | **$3.50** | **$0.50–1**: free monthly quotas, cheapest Places tiers for refreshes, reuse the same place ID across trips, a cheaper map provider (Mapbox or open-source tiles) |
| **AI** | 40 extractions (caption, page, screenshot) about $0.015 each; 25 receipts about $0.015 each; shortlists and summaries | **$1–1.50** | **$0.40–0.70**: Haiku for easy cases, cache by URL (popular TikToks get shared many times), Batch API for work that isn't time-sensitive |
| **Audio transcription** | Only when the caption fails, about 1 minute each *(verify provider)* | $0.10–0.30 | $0.10 |
| **Flights** *(Phase 2)* | 16 flight legs; use alerts instead of repeated status checks | $0.50–1 | $0.30 |
| **Hosting and storage** | Receipt images, database, bandwidth | $0.10–0.30 | $0.10 |
| **Total** | | **≈ $11–13 per trip** | **≈ $3.50–5 per trip** |

**Takeaways**
- **Texting is the biggest cost**, and it rises with every member who doesn't have the app. Each install saves about $1 per person per trip, because push notifications are free.
- **Google Maps and Places is #2.** Google's free monthly quotas cover roughly the first 100–200 trips a month, so the POC is nearly free. After that, the choice of map provider matters.
- **AI is cheap** compared with texting and maps.
- **Fixed monthly costs:** phone numbers and carrier registration (about $10–50), AeroAPI's minimum (about $100, from Phase 2), and hosting.

## 2. Ways to make money

Ranked by how well each one fits people who use the app once or twice a year.

### Tier A: earn on trips without charging users

| # | Source | How it works | Expected per trip *(estimate)* | Fit |
|---|---|---|---|---|
| A1 | **Booking commissions: hotels** | "Book for the group" button on planned Stay items, through Booking.com or Expedia's affiliate programs (about 4% of booking value). Airbnb has no open affiliate program, so Vrbo through Expedia fills the gap | If 15% of trips book a $3,000 stay: **about $18** | Strong. Shown only after the group decides, so it doesn't bias votes |
| A2 | **Booking commissions: activities** | Viator or GetYourGuide (about 8%) for tours, boat days, cooking classes, party buses | If 30% of trips book about $600: **about $14** | Strong. TikToks are mostly *activities*, so the match rate should be high |
| A3 | **Restaurant reservations** | Partner programs (OpenTable, Resy) or links *(verify payout terms)* | Small | Nice to have |
| A4 | **Travel add-ons by referral** | eSIMs, travel insurance (group policies), no-foreign-fee cards, Wise/Revolut, airport transfers. Shown at the right moment (e.g. an international Stop triggers eSIM and card prompts) | **$3–10** *(verify each program's rates)* | Good, as long as it's useful rather than spammy |
| A5 | **Converting flights into bookings** *(Phase 2)* | Flight search links from the When and Getting around stages *(flight affiliate payouts are small)* | $1–3 | Weak but nearly free to add |

~~Tier A total: roughly $30–45 per trip on average~~ **Superseded:** see [`monetization-benchmarks.md`](monetization-benchmarks.md). The bottom-up estimate for booking links and add-ons is **$2–4 conservative, $9–15 base, $35–50 optimistic** per trip. That's enough to cover about $4 of cost per trip with a healthy margin. These figures are guesses until measured.

### Tier B: charge where money already moves (future; needs legal review)

| # | Source | How it works | Expected per trip |
|---|---|---|---|
| B1 | **"Collect for the house"** | The organizer requests a fixed amount per person for a deposit, the Airbnb or a party bus. Guests pay by card, Apple Pay or buy-now-pay-later through Stripe Connect, with the organizer as the seller, so we never hold the money. A 3–5% convenience fee paid by the payer (SquadTrip charges 6%) | On $3,000 at 3%: **about $90** |
| B2 | **Settle up in the app** | Friend-to-friend payments through a bank partner (Splitwise Pay model). Usually free to users; earns from interchange or instant-transfer fees | Small per trip; mainly drives retention |
| B3 | **Group travel card** *(much later)* | A Splitwise Card-style debit card that splits purchases automatically and earns interchange | High, but heavy regulation |

This is the biggest revenue lever, as you suspected. It stays **on the roadmap as "future"**, per your earlier decision, and gets revisited once the POC proves people use the app.

### Tier C: B2B and partnerships (once there's volume)

| # | Source | Notes |
|---|---|---|
| C1 | **Vendors and group-booking leads** | Bachelor/bachelorette vendors (party buses, private chefs, boat charters, photographers) pay per qualified group lead or booking. This is Batch's model; ours is lighter, with no marketplace to run |
| C2 | **Tourism boards (DMOs)** | Sponsored city guides and "trending with groups" data. Mindtrip sells to tourism boards. Needs anonymized, aggregated data and clear privacy rules |
| C3 | **Clearly labeled sponsored suggestions** | Only in AI shortlists, always labeled, never ranked above what the group voted for. Hurts trust if overdone, so use cautiously |

### Tier D: charge users (optional, low expectations)

Your instinct is right: a subscription for something used once or twice a year won't work. Two light versions are worth testing:
- **D1 One-time "Bach Pack" ($4.99–9.99 per trip):** themes, custom cover, extra surprise-mode features, a custom Trip Wrapped, PDF expense report. It's an impulse buy at an emotional moment, like Partiful's paid themes. Bachelor/bachelorette mode itself stays free.
- **D2 Usage limits only at extremes:** e.g. more than 200 AI imports per trip. These exist for abuse and cost control, not as a business model.

**Never charge** for: guest participation, voting, splitting, or being in a trip.

## 3. Recommended sequence

| Stage | Revenue | Why |
|---|---|---|
| **POC (web)** | None, or affiliate links only on planned items | Prove use. Measure the % of planned items with booking intent (link clicks) |
| **Phase 2 (native)** | A1 + A2 + A4 affiliates; test D1 Bach Pack | Low effort and doesn't touch the core experience |
| **Phase 3** | C1 vendor leads (bachelor/bachelorette); B1 "Collect for the house" after legal review | Uses the decision data; payments are the biggest lever |
| **Scale** | B2 settle-up in the app, C2 tourism boards | Needs volume and a bank partner |

## 4. Cost controls built into the product

- **Push the app gently, never require it.** The "Get the app for free updates" prompt goes to members who get a lot of texts. Every install cuts texting cost.
- **Texts are for decisions and money; digests prefer push or email.** A no-app member gets a digest by text at most every other day **(proposed change; see the questions)**.
- **Cache everything shareable:** the same TikTok shared across trips is extracted once, and place IDs are reused.
- **Use the cheapest model that's good enough** for each task, and batch anything that isn't time-sensitive.
- **Per-trip cost dashboard** (internal) so we can see cost against revenue per trip from day one.

## 5. Decisions (1 Oct 2026)

- **POC:** plain booking links with click tracking, no affiliate links.
- **Approved revenue streams:** booking commissions, travel add-on referrals, vendor leads for bachelor/bachelorette trips, clearly labeled sponsored picks. Payments in the future.
- **Rejected:** one-time Bach Pack, subscriptions.
- **Maps:** decide at build time; start on Google within the free quota.
- **Messaging (D49):** group news (polls, decisions, digests) goes out as organizer-shared group-chat cards at no cost to us. We text only codes, invites, money and personal nudges, about 10–12 per no-app member per trip (**about $0.30**, down from about $1.10). Total cost per trip after optimizations: **about $2.50–3.50**. No web push.
