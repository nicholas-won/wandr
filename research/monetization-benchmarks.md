# Monetization Benchmarks and Revenue Pressure-Test

> **Purpose:** Check the $30–45 per trip revenue estimate in [`revenue-model.md`](revenue-model.md) and REQUIREMENTS §11 against how comparable consumer travel and social-planning apps actually make money.
> **Research date:** 1 Oct 2026. Reddit was not used. Sources are linked inline.
> **How to read this:** **[Fact]** comes from a filing, an official page or reputable press. **[Reported]** comes from a secondary source (an estimate site, an affiliate directory, a blog) and should be confirmed before you rely on it. **[Est.]** is our own assumption or calculation.

---

## 0. Bottom line

1. **The founder is right. $30–45 per trip is the optimistic case, not the average.** A bottom-up model with realistic attribution gives about **$3 per trip (conservative), $12 (base) and $45 (optimistic)** from the approved streams. The original estimate assumed every trip has bookable lodging, ignored Airbnb's 0% commission, and assumed 15–30% of trips book through our link.
2. **Airbnb is the biggest leak.** Airbnb closed its open affiliate program on 31 Mar 2021. Its replacement programs are invite-only, one is closed to applications, and the creator program bans SMS promotion. Airbnb has about 44% of global short-term rental revenue, against 9% for Vrbo, and Expedia pays only **2%** on Vrbo, half its hotel rate.
3. **Hotels give a smaller cut than the "4%" suggests once cancellations and tracking limits are counted.** Booking.com pays 25–40% of *its own* commission, only on completed stays, and tracks per session or for a few days. Expedia's cookie lasts 7 days. Booking.com's OTA cancellation rate is about 37%.
4. **No planning app has built a large business on affiliate links alone.** Wanderlog (~$1M ARR reported), Layla (~$2.8M, sold to Expedia in Jul 2026), Mindtrip (~$3.6M, plus B2B sales to tourism boards) and Stippl (230K users) are all small. The ones that work sell something else: Polarsteps prints books (€10M+, profitable), Hopper sells fintech add-ons and B2B (HTS), Partiful takes a cut on payments (ticketing, about a 10.7% fee) and Batch sells vendor subscriptions.
5. **Money moving between friends is the real lever, but 3% doesn't cover card costs.** Stripe's standard card fee (about 2.9% + 30¢) takes nearly all of a 3% convenience fee. SquadTrip charges 6% and keeps about 2.9%. Partiful's ticket fee is about 10.7%. Plan "Collect for the house" around a fee of **5–6% on cards and about 3% on bank transfer (ACH)**, which nets roughly **$60–90 per trip that uses it**.

---

## 1. Partiful (the invite-model benchmark)

| Item | Detail | Type |
|---|---|---|
| **Ticketing** | Launched **2 Jun 2026** for US hosts on iOS, Android and web. Paid and free tiers, capacity limits, promo codes, QR check-in. **Payouts through Stripe** about 3 days after the event. Called "Partiful's **first major monetization product** since the company launched in 2020." ([PR Newswire](https://www.prnewswire.com/news-releases/partiful-launches-ticketing-bringing-paid-events-into-the-social-platform-where-people-already-make-plans-302789410.html), [Partiful blog](https://partiful.com/blog/post/introducing-ticketing-on-partiful)) | Fact |
| **Ticket fee** | Not published. "Ticketing fees depend on your event size and ticket price." The help center's example is a **$112 ticket price with a $100 payout to the host, so the fee is $12 (about 10.7%)**. The host can absorb the fee or pass it on. Free tickets carry no fee. ([Partiful help: fees](https://help.partiful.com/en-us/articles/15525398-what-fees-does-partiful-charge)). Third parties observe about 10% + $2 ([SimpleTix](https://www.simpletix.com/partiful-launches-ticketing/)) | Fact / Reported |
| **Other paid features** | "Optional features like **premium invite designs**" ([Partiful help](https://help.partiful.com/hc/en-us/articles/27354376389403-Does-Partiful-cost-money)). **Group Order with Instacart**: a $5 delivery fee plus a percentage of the order ([Sacra](https://sacra.com/c/partiful/)). "Chip In" still sends guests to Venmo, Cash App or PayPal, so Partiful earns nothing on it ([Startup Fortune](https://startupfortune.com/partiful-is-turning-party-invites-into-a-payments-business/)) | Fact / Reported |
| **Funding** | About **$27M raised**. The $20M Series A1 in Nov 2022 was led by a16z at about a $100M valuation, and Sacra puts the latest valuation at $140M. In Jul 2024 the CEO said the company was "well-capitalized and not actively thinking about the next round" ([Sacra](https://sacra.com/c/partiful/), [Sherwood](https://sherwood.news/business/partiful-party-event-planning-app-monetization-and-future-q-and-a/)) | Fact / Reported |
| **Users** | About **500K MAU in Q1 2025, up 400% year on year** (reported via [Sacra](https://sacra.com/c/partiful/) and CNBC). By June 2026 Partiful described itself as having "millions of monthly active users." Google's Best App of 2024 | Reported |
| **Stated strategy** | Build first, monetize later. In Jul 2024: "there's a ton of spend on real-world social plans and events, and we're well positioned to capture it" ([Sherwood](https://sherwood.news/business/partiful-party-event-planning-app-monetization-and-future-q-and-a/)). Meaningful revenue began only with payments, about 5.5 years in | Fact |

**Lesson for us:** Partiful monetizes **payments that already flow through its events** (tickets), not affiliate links. Even at millions of MAU it went more than five years with little revenue.

---

## 2. Metasearch and OTAs: how they actually make money

| Company | Model | Key numbers | Type |
|---|---|---|---|
| **Skyscanner** (Trip.com Group) | Cost-per-click and referral fees from airlines and OTAs, plus advertising and "partner analytics" (data) | 2023 revenue **£349.4M**: **flight referrals £271.2M (78%)**, **advertising and analytics £56.9M (16%)**, car hire £11.5M, hotels £9.7M. **110M MAU**, 2.9B sessions. 2024: £389.9M revenue, £97.6M pre-tax profit. **About £3.50 (~$4.50) of revenue per MAU per year** [Est., calculated] ([City AM](https://www.cityam.com/skyscanner-profit-jumps-to-almost-100m-at-travel-search-engine/), [Companies House](https://find-and-update.company-information.service.gov.uk/company/04217916/filing-history)) | Fact |
| **KAYAK** (Booking Holdings) | Referral fees ("distribution") plus ad placements | It sits in Booking Holdings' "Advertising and other" line ($1,194M in 2025, together with OpenTable), against $26.9B total ([BKNG 10-K FY2025](https://www.sec.gov/Archives/edgar/data/1075531/000107553126000009/bkng-20251231.htm)). Last standalone data, 2011: **$224.5M revenue on 899M queries, about $0.25 per query** ([TechCrunch](https://techcrunch.com/2012/03/09/eyeing-an-ipo-kayak-2011-revenue-up-32-percent-to-225m-net-income-up-21-percent/)). Per Trefis's reading of the S-1: about **$165 of ad revenue per 1,000 queries**, about **$80 of referral fees per 1,000 flight queries and about $270 per 1,000 hotel queries** ([Trefis](https://www.trefis.com/stock/kyak/articles/162414/how-kayaks-business-model-creates-value/2013-01-11)). Hotels pay about $0.20–0.80 per click on Kayak ([Roommaster](https://www.roommaster.com/blog/hotel-metasearch-marketing-importance-and-benefits)) | Fact / Reported |
| **Google Flights / Travel** | No separate reporting; it's part of Google's ad business. **Google stopped charging airlines for Flights ads** ([Fox Business](https://www.foxbusiness.com/money/google-flights-ends-ads-airlines)). Hotel Ads charge per click, per conversion or per completed stay (commission) ([Google Ads Help](https://support.google.com/google-ads/answer/9243945?hl=en)). In 2026 Google is pitching travel as its main case for AI ads ([Skift](https://skift.com/2026/07/28/google-earnings-ads-artificial-intelligence-ihg-booking/)) | — | Fact |
| **Expedia Group** | Mostly merchant and agency booking revenue. Ads are a growing side business | **Advertising and media $758M in 2025 (+19%)**, including **trivago (metasearch) $417M**. Ads are about 8% of total revenue ([EXPE 10-K FY2025](https://www.sec.gov/Archives/edgar/data/1324424/000132442426000008/expe-20251231.htm)). Bought **Layla** (AI trip planner) on 31 Jul 2026 ([Expedia IR](https://ir.expediagroup.com/news-and-events/news/news-details/2026/Expedia-Group-acquires-Layla-accelerating-its-AI-powered-trip-planning-and-booking-strategy/default.aspx)) | Fact |
| **Hopper** | Started as a consumer OTA app. Now mostly **fintech add-ons** and **B2B white-label (HTS)** | About **$850M revenue in 2024** ([Wikipedia](https://en.wikipedia.org/wiki/Hopper_(company))). Fintech (Price Freeze, Cancel/Change for Any Reason, Disruption Guarantee) drove **about 40% of $7.5B bookings in 2024 and about 50% of 2022 revenue**. About **60% of app customers buy at least one fintech product**, worth about $40+ per booking ([BuiltIn](https://builtin.com/company/hopper/faq/stability-growth), [Skift 2021](https://skift.com/2021/07/21/hopper-sells-travel-but-its-fintech-hedging-drives-the-growth/)). The average Price Freeze is about $40 ([McKinsey interview](https://www.mckinsey.com/industries/travel/our-insights/travel-disruptors-bringing-fintech-to-travel-booking)). HTS powers Capital One Travel and was reported at about two-thirds of the business by 2024, with deep layoffs in 2023–24 ([BetaKit](https://betakit.com/hopper-restructures-again-following-renewal-of-expedia-partnership/)) | Fact / Reported |

**Why metasearch makes money (and why it doesn't carry over to us):** metasearch sees **billions of high-intent searches a year** and sells each click in an auction. It's a volume business: about $0.25 per query, or about $4.50 per user per year at Skyscanner. Our app sees **one lodging decision per trip**, not dozens of searches. That's high intent, but low volume and hard to attribute.

**Hopper's lesson:** the money is in **financial products attached to the booking** (price risk, cancellation risk), not the booking itself. Our version is the group-money layer: deposits, "collect for the house," pay later and split. A "cancel for any reason" product isn't something we can underwrite.

---

## 3. Trip planners: how they actually make money

| App | How it makes money | Revenue / scale | Type |
|---|---|---|---|
| **Wanderlog** | **Pro subscription** (prices seen at **$39.99/yr** and $79.99/yr; check the current price) plus hotel and booking affiliates. Its stated plan is for affiliates to reach about 30% of revenue | About **$1M ARR (Dec 2024)** and "1M+ active users," both from secondary estimate sites ([Latka](https://getlatka.com/companies/wanderlog.com), [StartupFounderStories](https://startupfounderstories.com/stories/peter-xu-wanderlog-travel-planner)). $1.5M seed (General Catalyst, Abstract) | Reported (weak) |
| **TripIt** (SAP Concur) | **TripIt Pro, $49/yr**, and given free to corporate travelers through Concur TripLink. In practice it's a **B2B retention feature** for Concur ([TripIt Pro](https://www.tripit.com/web/pro), [Concur](https://www.concur.com/blog/article/sap-concur-expands-concur-triplink-emea-tripit-pro)) | Not disclosed | Fact |
| **Mindtrip** | Booking affiliates (Priceline, Viator and others), **B2B subscriptions for tourism boards (DMOs)** (white-label widgets, analytics; pilots with Visit Costa Rica, Outer Banks, Brand USA and others), plus creator referral payouts (about $1–1.50 per registered user) | About **$22.5M raised** (Costanoa, Forerunner, Amex Ventures, Capital One Ventures, United Airlines Ventures). Revenue estimated at about **$3.6M (2025)** ([PhocusWire B2B](https://www.phocuswire.com/mindtrip-ai-travel-b2b-destination-marketing), [Latka](https://getlatka.com/companies/mindtrip.ai)) | Fact / Reported |
| **Layla** | Affiliate and fee-sharing with Booking.com and Skyscanner, plus a $9.99/mo premium plan. **Acquired by Expedia, Jul 2026** | €5M raised, about 25 staff, revenue estimated at about **$2.8M** ([Skift](https://skift.com/2026/07/31/expedia-acquired-ai-trip-planner-layla-exclusive/), [Latka](https://getlatka.com/companies/layla.ai)) | Fact / Reported |
| **Roadtrippers** (Roadpass Digital) | **Subscription tiers: $35.99, $49.99 and $59.99 a year**. Free accounts are limited to 8 waypoints. Partner deals with RVshare and others ([RV Miles](https://rvmiles.com/roadtrippers-drops-price-for-plus-limits-free-accounts-to-8-waypoints/), [Roadtrippers](https://roadtrippers.com/rvshare-2025discount/)) | Not disclosed. Owned by Roadpass Digital since 2023 | Fact |
| **Polarsteps** | **Printed travel books** are the main revenue, plus accommodation affiliates (Booking.com, Airbnb, Hostelworld). No ads and no data sales. A subscription was "decided not to" launch yet | **€10M+ revenue in 2024, profitable, 18–19M users** (about €0.55 per registered user per year [Est.]) ([Dealroom](https://app.dealroom.co/companies/polarsteps), [Startuprad interview](https://www.startuprad.io/post/polarsteps-growth-privacy-first-travel-app-at-18m-users-startuprad-io)) | Reported |
| **Stippl** | Booking.com and GetYourGuide affiliates, plus a planned PRO subscription and photo books | 230K users, 70K MAU, about $1.5M raised ([Stippl](https://www.stippl.io/blog/stippl-expands-to-ai-travel-planning-and-continues-to-grow), [PhocusWire](https://www.phocuswire.com/stippl-funding-ai-travel-planning-expansion)) | Fact |
| **Tripadvisor** | Hotel metasearch (cost-per-click), display ads and **Viator (experiences marketplace)** and **TheFork (restaurant bookings)** | **2025 revenue $1,891M. Experiences $924M (about half of revenue, about 30% of profit)**. TheFork Q3-25 $63M (+28%). Viator had about 6.6M bookings in Q3-25 ([TRIP Q4/FY25 release](https://www.sec.gov/Archives/edgar/data/1526520/000119312526047622/trip-ex99_1.htm), [Q3-25 8-K](https://www.sec.gov/Archives/edgar/data/1526520/000119312525268036/trip-ex99_1.htm)) | Fact |

**Pattern:** the standalone planners that are profitable or growing **sell a product** (books, subscriptions, B2B to DMOs or corporates). Those relying on affiliates alone are small. Tripadvisor makes money from experiences by **owning the marketplace** (Viator), not by being an affiliate.

---

## 4. Group and expense apps

| App | Model | Notes | Type |
|---|---|---|---|
| **Splitwise** | **Pro subscription** (about $4.99/mo or $39.99/yr in the US: receipt scanning, itemization, charts, no ads) plus ads on the free tier. **Splitwise Pay** (settle up in the app) and the **Splitwise Card** (Mastercard debit that splits purchases automatically). Banking by **Coastal Community Bank**. US only. The card has no fees, so revenue is presumably interchange (not disclosed) | $20M Series A, Insight Partners, 2021 ([Splitwise Card](https://www.splitwise.com/card), [The Paypers](https://thepaypers.com/fintech/news/splitwise-raises-usd-20-mln-in-series-a-round), [getfinny](https://getfinny.app/blog/splitwise-pricing-2026)) | Fact / Reported |
| **Tricount** | Bought by **bunq (neobank), May 2022**. Relaunched in 2024 as **free with no in-app purchases**. It is a **customer-acquisition funnel for bunq accounts** ([Dolio](https://dolio.org/compare/splitwise-alternatives), [HippoSplit](https://hipposplit.com/blog/splitwise-vs-tricount-vs-settle-up/)) | Shows that bill splitting is worth more as a funnel than as a product | Reported |
| **Batch** (formerly BACH) | Started by taking **commissions on vendor experiences** (party buses, chefs, yachts) and has moved toward **"No revenue split. Just a flat monthly fee if you choose to upgrade"** for vendors (featured placement, marketing) | About **$27M raised**, Series A Oct 2025. "3M+ users," claims **about 30% of US bachelorette parties**. In 2021: 20K monthly active parties, average party of 5–6 ([letsbatch.com/suppliers](https://letsbatch.com/suppliers), [TechCrunch 2022](https://techcrunch.com/2022/04/20/bach-8m-travel-app-planning-bachelor-bachelorette-trips), [Hampton](https://joinhampton.com/blog/he-took-over-the-bachelorette-party-market)) | Fact / Reported |
| **SquadTrip** | **Group payment collection.** Free platform. **6% processing fee paid by the traveler, including Stripe**: on $1,000, Stripe gets $31.04 and SquadTrip keeps **$28.96 (about 2.9%)**. A $29/mo plan cuts the fee to 4%. Buy now, pay later adds 4% | Clearest public benchmark for our "Collect for the house" ([SquadTrip help](https://help.squadtrip.com/en/articles/9794592-payments-and-fees)) | Fact |
| **Let's Jetty** | Group decision app (surveys, RSVPs, costs). Planned "travel rewards" for organizers, booking help and concierge | Raised **$31.9K on Kickstarter** (2023). No revenue disclosed ([Kickstarter](https://www.kickstarter.com/projects/letsjetty/jetty-the-travel-planning-app-your-crew-will-actually-use), [YourStory](https://yourstory.com/2023/07/lets-jetty-group-travel-app-innovation)) | Fact |
| **Troupe** (JetBlue Travel Products) | Free group-decision app (ranked-choice voting on destination, dates, lodging), launched Sep 2022 ([JetBlue IR](https://ir.jetblue.com/news/news-details/2022/nbspJetBlue-Travel-Products-Launches-New-Travel-App-Troupe-09-21-2022/default.aspx), [Skift](https://skift.com/2022/09/21/jetblue-wants-to-make-group-travel-easier-with-new-app/)) | **No shutdown announcement found.** troupe.com no longer resolves and the app is gone (see [`competitors.md`](competitors.md)). **[Est.] Likely reasons:** no revenue model of its own (it was a lead-gen experiment for JetBlue Vacations), low-frequency use, and decision-only scope with no money or itinerary layer to keep people coming back | Fact / Est. |

---

## 5. Real affiliate economics

### 5.1 Program terms

| Program | Commission | Attribution window | Paid when | Cancellations | Notes | Type |
|---|---|---|---|---|---|---|
| **Booking.com** | **25% / 30% / 35% / 40% of Booking.com's own commission**, by monthly *stayed* bookings (0–50 / 51–150 / 151–500 / 501+). Booking.com charges properties about 15–18%, so **about 3.75–4.5% of booking value at the entry tier** | **Session-based, or a few days at most** (sources disagree; the direct program is in-session) | Monthly, after checkout | **Commission reversed on cancellation** | New partners now sign up **through CJ** ([Booking.com affiliates](https://www.booking.com/affiliate-program/v2/index.html), [Track360 teardown](https://track360.io/blog/booking-com-affiliate-partner-program-operator-teardown-2026), [UpPromote](https://uppromote.com/affiliate-directory/booking-com/)) | Fact / Reported |
| **Expedia Group** (Creator/affiliate) | **Hotels 4%** (Expedia, Hotels.com). **Vacation rentals (Vrbo) 2%**. Activities 4%. Packages 2%. Cars 1.5%. **Flights 0%** | **7 days** | "Completed transactions only" | Implied reversal (only completed stays count) | ([Expedia commission terms](https://creator.expediagroup.com/commission-terms)) | Fact |
| **Airbnb** | **None open.** Associates program closed **31 Mar 2021**. "Airbnb Creators" is invite or campaign-based, with no published rate, and **SMS promotion is prohibited**. The "Demand Program" for publishers is **not accepting applications** | — | — | — | ([CNBC](https://www.cnbc.com/2021/03/01/airbnb-ends-affiliate-program-as-it-ramps-up-host-recruitment-campaign.html), [MakeInfluence](https://www.makeinfluence.com/en/academy/airbnbs-creator-program-how-it-differs-from-an-open-affiliate-program)) | Fact |
| **Viator** | **8%** (a promotional 10% ran until Jan 2026) | **30 days** | **After the experience is completed.** Weekly via PayPal | Cancelled or uncompleted trips earn nothing | No traffic minimum ([Viator partner resources](https://partnerresources.viator.com/), [Travelpayouts](https://www.travelpayouts.com/blog/viator-affiliate-program/)) | Fact |
| **GetYourGuide** | **Up to 8%** (5–8% depending on network) | 30–31 days | After the activity | Same as above | ([GYG partner help](https://partner.getyourguide.support/hc/en-us/articles/23082933149981), [Lasso](https://getlasso.co/affiliate/get-your-guide/)) | Reported |
| **OpenTable** | About **$0.25–1.00 per seated diner** (no-shows pay $0). Terms are revealed only after approval | ? | ? | No-shows pay $0 | **Resy and Tock have no public affiliate program** (not found) ([UpPromote](https://uppromote.com/affiliate-directory/opentable/), [HowToJoin](https://howtojoinaffiliateprograms.com/opentable-affiliate-program/)) | Reported (weak) |
| **Airalo** (eSIM) | **10%** of sale, through Impact | 30 days | Through Impact | ? | eSIMs are typically $5–30 each ([Airalo](https://www.airalo.com/m/resources/airalo-affiliate-program/), [FlexOffers](https://www.flexoffers.com/affiliate-programs/airalo-affiliate-program/)) | Fact / Reported |
| **Travel insurance** | SafetyWing 10% (recurring, 364-day cookie). World Nomads about 10% or $0.83 per quote, 60-day cookie, CJ only | | | | ([Referly](https://www.referly.so/affiliate-programs/safetywing), [Affiliate Programs Guru](https://affiliateprogramsguru.com/programs/safetywing-affiliate-program/)) | Reported |
| **Credit cards, Wise, Revolut** | Not verified (search budget ran out). Card bounties are known to be much larger per approval, but publishers must be approved and comply with financial-promotion rules | | | | **Verify before modeling** | — |

**Rules that hurt us specifically** [Est. from the terms above]:
- **Short attribution windows clash with group timing.** The group decides in our app, then the organizer often books **days later**, often **in the Booking.com or Airbnb native app**, where our web cookie doesn't follow. Booking.com tracks per session; Expedia allows 7 days.
- **One booking per group.** A $3,000 house or hotel block is **one commission**, not eight.
- **SMS promotion is restricted** by some programs (explicitly by Airbnb Creators). We rely on texts, so affiliate links should live on the trip page, not in text messages. Check each program's terms.

### 5.2 Click-through, conversion and earnings per click

| Benchmark | Value | Source | Type |
|---|---|---|---|
| Google Hotel Ads click to booking | **3.4–5.8%** (4.1% in 2022) | [Mara](https://www.mara-solutions.com/post/google-hotel-ads), [Roomstay](https://www.roomstay.io/blog/optimising-hotel-average-conversion-rate) | Reported |
| Tripadvisor metasearch click to booking | **about 2.3%** | same | Reported |
| OTA site visit to booking | 12–15% (Booking.com, Expedia on their own sites) | [BookBetterDirect](https://bookbetterdirect.com/hotel-website-conversion-rate-benchmarks-2026-direct-booking-vs-otas/) | Reported |
| Stay22 (lodging affiliate aggregator) click to booking | **4.4–7.2%** for individual publishers; Stay22 claims 10.1% for events. Its cookie window is **24 hours to 7 days** | [Stay22 case studies](https://blog.stay22.com/how-stay22-boosted-our-blog-earnings-by-400), [Travel Tech Essentialist](https://traveltechessentialist.substack.com/p/stay22-the-bridge-between-content) | Reported |
| Typical content-site funnel (Stay22 example) | 8% click-through × 3% conversion × $150 order × 10% | [Stay22 blog](https://blog.stay22.com/show-me-the-money-how-much-can-travel-bloggers-earn-with-affiliate-marketing) | Reported |
| Travel blog earnings, all affiliates | **About $8 per 1,000 pageviews** ($25K from about 3M pageviews). **Hotels about $12.8K**, Viator and GYG $1.0K, **flights $100** | [This Week in Blogging](https://thisweekinblogging.com/travel-blog-affiliate-programs/) | Reported |
| Booking.com earnings | "$30–90 per 1,000 clicks" ($0.03–0.09 per click) | [Lovable guide](https://lovable.dev/guides/how-to-make-money-as-travel-blogger) | Reported (weak) |
| KAYAK (2011) | $0.25 per query overall; $0.27 per hotel query | §2 | Fact / Reported |
| Viator average order value | About **$220** | [Travelpayouts](https://www.travelpayouts.com/blog/viator-affiliate-program/) | Reported |

**Takeaway:** for travel content, **revenue per 1,000 users is single-digit dollars** (about $8 per 1,000 pageviews; about $4.50 per Skyscanner MAU per year). Hotels earn most of the money and flights almost nothing.

### 5.3 Who books lodging for group trips: hotel vs. Airbnb vs. Vrbo

| Data point | Value | Source | Type |
|---|---|---|---|
| Bachelorette attendees' lodging (2019, N=1,000+) | **Hotel or resort 40%**, all-inclusive 6%, **house or apartment rental about 19%** (bachelor 14%), **house owned by an attendee 16%** (bachelor 12%), **not overnight 14%** | [WeddingWire 2019 study (PDF)](https://go.weddingwire.com/pdf/bachelor-bachelorette.pdf) | Fact |
| Change since 2019 | The Knot: 46% of bachelor/bachelorette parties book a hotel or all-inclusive. **Rental homes up about 10 points since 2019** (so about 25–30%) | [The Knot](https://www.theknot.com/content/bachelorette-party-statistics) (via search snippet; page blocked) | Reported |
| Bachelorette size and travel | **Average 10 attendees** (bachelor 8). **48% drive, 17% fly**, 18% use a party bus. **92% are domestic** | WeddingWire 2019 | Fact |
| Global short-term rental share (2024) | **Airbnb 44%, Booking.com 18%, Vrbo 9%, other or direct 29%** | [Skift Research](https://skift.com/2025/03/14/short-term-rentals-airbnbs-dominance-and-bookings-gains-in-1-chart/) | Fact |
| Groups on Airbnb | "More than 80% of bookings on Airbnb are for groups." Airbnb's Q4-25 call noted a mix shift toward **4+ bedroom homes** | [Vrbo/Expedia newsroom](https://www.expedia.com/newsroom/vrbo-spring-break-and-group-travel-guide/), [ABNB Q4-25 call](https://www.fool.com/earnings/call-transcripts/2026/02/12/airbnb-abnb-q4-2025-earnings-call-transcript/) | Reported |
| OTA cancellation rates | **Booking.com 37.2%**, Expedia 24–31%, direct 11.1% | [D-EDGE (Oct 2024)](https://www.d-edge.com/avoid-guests-ghosting/) | Reported |

**[Est.] For our model:** about **70% of trips need paid lodging** (removing no-overnight and friend's-house trips). Of those, about **55% hotel and 45% rental**. Among rentals, about **60–65% are Airbnb (no commission)**, 20% Vrbo (2%) and 15–20% Booking.com or other.

---

## 6. Other revenue models in this space

| Model | Who does it | Fit for us |
|---|---|---|
| **Group payments with a fee** | SquadTrip (6% gross, about 2.9% net), Partiful ticketing (about 10.7%), WeTravel | **Best fit.** Bachelorette trips already collect money for the house. See the Stripe math in §7.3 |
| **Settle-up wallet or card earning interchange** | Splitwise Pay + Card (Coastal Community Bank), Tricount → bunq | Long-term. Needs a bank partner. Low revenue per trip; mainly retention |
| **Fintech add-ons** | Hopper (Price Freeze, Cancel for Any Reason) | Poor. Needs underwriting and travel inventory |
| **Vendor subscriptions or leads** | Batch (moved from commission to **flat monthly vendor fee**) | Medium. Needs density in each bachelorette city. Batch's move suggests commissions are hard to enforce with local vendors |
| **Tourism boards (DMOs) and sponsored placements** | Mindtrip (DMO subscriptions), Tripadvisor and Expedia ad businesses ($758M at Expedia) | Later. Needs scale and a sales team. Trust risk |
| **Data licensing and analytics** | Skyscanner "advertising & partner analytics" (£56.9M) | Later. Only aggregated and anonymized |
| **B2B / white-label** | Hopper HTS (Capital One Travel), TripIt via Concur, Mindtrip for DMOs | Possible pivot: wedding sites, event planners. Not now |
| **Printed or physical products** | Polarsteps books (main revenue, profitable) | Interesting but rejected for now (close to the rejected Bach Pack). A "Trip Wrapped" printed book could be revisited |
| **Paid cosmetics** | Partiful premium invite designs | Rejected (Bach Pack) |
| **Tipping or supporter** | Not found among the travel apps researched | Low expected value |
| **Subscriptions** | Wanderlog, TripIt, Roadtrippers, Splitwise Pro, Layla | Ruled out (once or twice a year use) |

---

## 7. Pressure-testing our estimate

### 7.1 Reference trip and assumptions [Est.]

8 people, bachelor or bachelorette, 3 nights, **$3,000 of lodging for the group**, **about $600 of bookable group activities**, 1–2 group dinners. One organizer books for the group.

| Driver | Conservative | Base | Optimistic | Basis |
|---|---|---|---|---|
| Trips needing paid lodging | 70% | 70% | 75% | WeddingWire: 14% not overnight, 16% at an attendee's house |
| Hotel / rental split | 55 / 45 | 55 / 45 | 55 / 45 | WeddingWire 2019 plus The Knot's "rentals up 10 points" |
| Rentals that are **not** Airbnb (so commissionable) | 30% | 35% | 40% | Skift share; Vrbo stronger for groups |
| **Lodging booked through our tracked link** | 4% | 12% | 25% | Content-site click-to-book is 2–7%. Our intent is higher (the group has decided), but the window is short, the booking happens in native apps, and many groups book direct or by loyalty |
| Hotel commission (share of value) | 3.75% | 3.9% | 4.5% | Booking.com entry tier 25% × about 15%; Expedia 4% |
| Rental commission | 2.5% | 2.8% | 3% | Vrbo 2%; Booking.com rentals about 3.75% |
| Lost to cancellation or rebooking outside our link | 20% | 15% | 10% | OTA cancellation rate is about 37%, but many cancellations are rebooked |
| Trips with a Viator/GYG-listed group activity | 30% | 40% | 55% | Bachelorette favorites (dinner, clubbing, bar crawl, spa, party bus) are mostly **not** on Viator |
| ...of which booked through our link | 10% | 20% | 35% | 30-day cookie helps |
| Activity value / commission | $500 / 8% | $600 / 8% | $800 / 8% | Viator average order about $220 per booking |

### 7.2 Bottom-up revenue per trip [Est.]

| Stream | Conservative | Base | Optimistic | Original estimate | Calculation (base) |
|---|---|---|---|---|---|
| Hotels | $1.40 | $4.60 | $14.60 | **$18** (hotels and rentals combined: 15% × $3,000 × 4%) | 0.70 × 0.55 × 12% × $3,000 × 3.9% × 0.85 |
| Rentals (Vrbo / Booking.com only) | $0.20 | $0.90 | $3.20 | (included above) | 0.70 × 0.45 × 0.35 × 12% × $3,000 × 2.8% × 0.85 |
| Activities (Viator/GYG) | $1.10 | $3.50 | $11.30 | **$14** (30% × $600 × 8%) | 0.40 × 20% × $600 × 8% × 0.9 |
| Restaurants (OpenTable) | $0 | $0.50 | $2 | "small" | 8 diners × about $0.25–0.50 × about 15–25% via our link |
| Flights | $0 | $0.30 | $1.50 | $1–3 | Expedia pays 0%; only about 17–22% fly |
| Travel add-ons (eSIM, insurance, cards) | $0.30 | $1 | $4 | $3–10 | About 92% of trips are domestic, so eSIMs rarely apply. Card bounties unverified |
| Vendor leads *(at scale)* | $0 | $1 | $5 | (in $30–45) | 10% of trips × about $10 per lead |
| Sponsored picks *(at scale)* | $0 | $0.50 | $3 | (in $30–45) | About 50–100 impressions per trip at a $10–30 CPM |
| **Total per trip** | **≈ $3** | **≈ $12** | **≈ $45** | **$30–45** | |
| **Range per trip** | **$2–4** | **$9–15** | **$35–50** | | |
| **vs. cost of $2.50–3.50 per trip** | About break-even (fixed costs unpaid) | About 4× cost | About 13× cost | | |

**Per active user per year** [Est.] (a trip member, 1–2 trips a year, revenue split across 8 members):

| | Conservative | Base | Optimistic |
|---|---|---|---|
| Per trip member per year | **$0.40–0.75** | **$1.50–3** | **$5.50–11** |
| Per app-installed user per year (3 of 8 install) | $1–2 | $4–8 | $15–30 |
| Benchmarks | Polarsteps about €0.55 per registered user · Wanderlog about $1 per active user (weak) · Skyscanner about $4.50 per MAU | | |

**What breaks the original estimate:** (1) it applied the 15% conversion to all trips, including the ~30% with no paid lodging and the ~60% of rental trips on Airbnb; (2) it used 4% as the rate rather than the realistic ~3.75% on Booking.com before cancellations; (3) it assumed 30% of trips book a Viator activity through us, while most bachelorette activities are local, booked direct, or not listed on Viator; (4) it counted vendor leads and sponsored picks, which need scale we won't have in year one.

### 7.3 "Collect for the house": the lever that is actually large (future, not in the approved POC) [Est.]

| Fee to payer | Stripe card cost (about 2.9% + 30¢, US standard; **verify**, plus Connect fees) | Net to us on $3,000 (8 × $375) | Notes |
|---|---|---|---|
| 3% (current plan) | About $89.40 | **About $0.60** | **Covers card costs only; no profit** |
| 5% | About $89.40 | About $60 | |
| 6% (SquadTrip) | About $89.40 | **About $90** | SquadTrip keeps about 2.9% |
| ACH bank transfer at 3% (Stripe ACH about 0.8%, capped at $5; **verify**) | About $24 (8 × $3) | About $66 | Slower, and fewer people pay that way |

If **25% of trips use it for the house** at a 6% card fee, that adds **about $22 per trip on average** (about $90 × 0.25), roughly **twice the base affiliate total**. Partiful's ~10.7% ticket fee and SquadTrip's 6% show payers accept such fees.

### 7.4 Revised ranking of monetization options (expected revenue × fit)

| Rank | Option | Expected per trip (base) | Fit | Status |
|---|---|---|---|---|
| 1 | **Collect for the house** (Stripe Connect, 5–6% card fee or about 3% ACH) | **About $20–25** on average (about $90 per trip that uses it) | Very high: money already moves, and Partiful and SquadTrip prove the model | Future, needs legal review. **Move earlier** |
| 2 | **Hotel and rental affiliates** on the decided Stay | About $5.50 | High intent, but Airbnb leaks it and attribution is short | Approved |
| 3 | **Activity affiliates** (Viator/GYG, 30-day cookie) | About $3.50 | Good match with TikTok ideas; weaker for nightlife | Approved |
| 4 | **Vendor subscriptions or leads** (bachelorette cities) | About $1, rising with density | Good, but needs city density. Batch moved to flat vendor fees | Approved, later |
| 5 | **Travel add-ons** | About $1 | Mostly domestic trips limit eSIM and insurance | Approved |
| 6 | **Sponsored picks / tourism boards** | About $0.50, and lumpy | Trust risk; needs scale and sales | Approved, later |
| 7 | **Restaurants** | Under $1 | Resy and Tock have no affiliate program | Nice to have |
| 8 | **Flights** | About $0.30 | Expedia pays 0% | Skip |

### 7.5 What to test first in the POC

The POC already has **plain booking links with click tracking, no affiliate links**. Add these at near-zero cost:

1. **Record which site each decided Stay comes from** (airbnb.com, vrbo.com, booking.com, hotel site) from the pasted link. This measures the **Airbnb share** directly, the most important unknown.
2. **Booking click rate by category** (Stay, activity, dinner), and **time from decision to click**, to check against the 7-day and session windows.
3. **A one-tap "How did you book?" question** after the trip, sent to the organizer: Airbnb, Vrbo, Booking.com, hotel direct, through our link, or other. This catches native-app and direct bookings that click tracking misses.
4. **A "Collect money for the house" fake-door button** on the decided Stay: tapping it shows "coming soon, want early access?" This measures demand for the biggest lever without handling money, and costs nothing legally.

**Decision rule** [Est.]: if fewer than 30% of decided Stays are non-Airbnb, or lodging click rates on decided Stays are below 20%, plan around the conservative-to-base range (about $3–12 per trip) and bring payments forward.

---

## 8. Gaps and items to verify

- Booking.com's current attribution window (session vs. 30 days through CJ) and acceptance criteria for apps.
- Payouts for OpenTable, credit cards, Wise and Revolut, and whether travel-card bounties are open to an app publisher.
- Stripe Connect fees (Express or Standard, per-payout and monthly active-account fees) and money-transmission or legal questions for "Collect for the house."
- Partiful's exact fee schedule and current MAU (only "millions" disclosed). Wanderlog, Layla and Mindtrip revenue figures are from estimate sites.
- Recent (2024–26) primary data on bachelorette lodging. The Knot pages were blocked, so the post-2019 rental share comes from a search snippet.
- Troupe: no shutdown notice found; the reasons for failure in §4 are inference.
