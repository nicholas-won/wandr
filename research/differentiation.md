# Competitive Edge and Differentiation

*Research date: 1 Oct 2026. Based on REQUIREMENTS.md v0.2: stages Where → When → Stay → Getting around → Do; multi-city Stops with per-Stop attendance; blind Must-do / Down / Pass voting; SMS-code join with organizer approval; Partiful-style texts; receipts with even or itemized splits and multi-currency; bachelor/bachelorette and friend trips first.*
*Companion docs: [`competitors.md`](competitors.md), [`group-decision-making.md`](group-decision-making.md).*

> **Method notes.** Reddit is still unreachable from this tool. Several figures come from third-party estimators (Latka, Sacra, affiliate-network directories) or from competitor-written guides, and they are labeled as such. Market-size numbers marked **(est.)** are my own back-of-envelope calculations from the cited inputs, not published figures.

---

## 1. Moats: what's easy to copy and what compounds

### 1.1 Easy to copy (weeks of work for Google Maps, TikTok, Places.is or Wanderlog)

| Feature | Who could ship it fast | Why it's not a moat |
|---|---|---|
| **Link/TikTok → place extraction** | Everyone. At least 15 apps already do it (see competitors.md §1.2). Google Maps already turns screenshots into lists with Gemini ([9to5Google](https://9to5google.com/2025/03/27/google-maps-gemini-screenshots/)) | It's a commodity pipeline of an LLM plus a places API. |
| **Place data** (hours, price, rating) | Google owns it | Google's terms **ban caching most Places content for more than 30 days**. Only the place ID can be stored indefinitely ([bizcollect summary of terms](https://bizcollect.dev/blog/google-places-api-terms), [Google Maps service terms](https://cloud.google.com/archive/maps-platform/terms/maps-service-terms-20250331)). We can never build a proprietary place database on top of Google. Place Details Pro costs about $17 per 1,000 calls ([bizcollect pricing](https://bizcollect.dev/blog/google-places-api-pricing)). |
| **Voting UI** (thumbs, emoji, polls) | Google Maps lists already have emoji voting (2023). iOS 26 Messages has polls with AI-suggested polls ([AppleInsider](https://appleinsider.com/articles/25/06/16/how-polls-in-ios-26-messages-app-makes-group-planning-easier)). Places.is already has voting | A plain vote is a feature, not a product. Troupe, a voting-only app, appears to have died (competitors.md §1.1). |
| **No-account web links** | Places.is, Apple Invites, Doodle and Partiful already do it | It's a well-known pattern. |
| **Receipt OCR, multi-currency, itemized splits** | Splitwise Pro, Tricount, Settle Up | Receipt OCR is a commodity, and accuracy on long receipts is mediocre for everyone ([tryfix.it](https://tryfix.it.com/what-are-the-downsides-of-splitwise-the-hidden-costs-of-free-splitting/)). |
| **Map + day plan** | Wanderlog, Stippl, Mindtrip | Already solved, and solved better by them. |

**Honest conclusion:** no single feature in v0.2 is defensible on its own. Our edge has to come from (a) **combining** capture, a group decision, money and attendance on one trip, and (b) things that **build up with usage**.

### 1.2 What compounds over time

| Asset | How it compounds | Strength | Notes |
|---|---|---|---|
| **1. Verified-phone group graph ("crews")** | Every trip adds verified phone identities and group membership. The second trip with the same crew takes one tap, and guests who later organize bring new crews. This is Partiful's engine: every invite reaches people who don't have the app yet ([Sacra](https://sacra.com/chat/h/ca6c792b-7d6d-42a9-ae5f-0970a819c66c/), [Wikipedia](https://en.wikipedia.org/wiki/Partiful)) | **High**, if trips repeat | Weak spot: trips are infrequent (2–4 a year), so the graph grows slowly unless there are reasons to return between trips (balances, recaps, the next bachelorette). |
| **2. Open balances and money history** | Unsettled balances keep people coming back, and a group's ledger is painful to move elsewhere. Splitwise grew on this pull: you need your friends in the app to record what they owe ([Insight Partners](https://www.insightpartners.com/ideas/splitwise-raises-20mm-in-series-a-funding-led-by-insight-partners/), [Splitwise KB](https://kb.splitwise.com/getting-started/can-i-add-a-friend-without-adding-their-email-address-or-phone-number)) | **Medium-high** | Only if the math is trusted. Tricount's "math was not mathing" reviews show how fast that trust goes (competitors.md). |
| **3. "Did we actually go?" data (receipt ↔ idea links)** | Every receipt linked to an idea card shows that a TikTok led to a real visit and real spending by a group. Google knows searches and TikTok knows views, but **neither knows "this 8-person bachelorette shortlisted it, voted Must-do, went, and spent $640."** | **High and unique**, slow to build | Feeds ranking ("groups like yours picked…"), city templates, and later B2B or vendor demand data. Needs trips at scale to matter. |
| **4. Group preference data** (blind votes by trip type, city and budget) | Blind votes are honest signals: they aren't swayed by early public votes (see the herding research in group-decision-making.md). Over time we can predict what a group will pass on | Medium | Privacy limits apply: show only aggregates, never individual Pass votes or budgets (NFR-3). |
| **5. Trip history and recaps** | Past trips, photos, receipts and "Trip Wrapped" give people a reason to keep the account, and seed the next trip | Medium | Polarsteps proves people value travel memories (9.6K ratings at 4.9). |
| **6. Niche brand and templates** | Becoming *the* default "send me the bach link" app inside a scene, the way Partiful did for Gen Z parties | Medium-high in a niche | Batch already holds part of the bachelorette mindshare (1M+ users and 200K parties in 2022 per [Batch](https://letsbatch.com/blog/series-a-announcement)). |
| **7. Operational know-how** (SMS deliverability, 10DLC registration, abuse controls, extraction tuning across TikTok/IG/YouTube changes) | Unglamorous, and it compounds | Low-medium | Partiful's texts still land in spam (competitors.md), so doing this well is a quality edge. |

### 1.3 Where we're weak (honestly)
1. **The web POC has no share sheet.** Our "inbox" magic shows up only after the native app. Until then capture means copy-paste, the same as Places.is and Airial.
2. **We depend on platforms.** TikTok and Instagram can block oEmbed or change link formats. Google controls our place data and pricing. TikTok GO (US, May 2026) could add "save place to a trip with friends" ([TikTok Newsroom](https://newsroom.tiktok.com/introducing-tiktok-go?lang=en)).
3. **Trips are infrequent.** Retention between trips is structurally hard. Bachelorette season helps, because the same friends attend several of them.
4. **Places.is has three of our four core ideas** and is free (competitors.md §2.4). Mindtrip has $22M+ in funding and already has group chat and voting.
5. **Money features bring regulatory and trust risk** (section 5), and wrong math can kill the product.
6. **SMS is expensive and closely watched** (A2P 10DLC). The Partiful model costs real money per message.

---

## 2. Growth loops

### 2.1 How the benchmarks grew

| Product | Documented loop | Evidence |
|---|---|---|
| **Partiful** | **The invite is the growth loop.** The host shares a link in iMessage, IG or WhatsApp, guests RSVP with a phone code and no app, some guests become hosts, and the cycle repeats. Core invites stay free, and money comes from add-ons. | Over 1.07M downloads in 2024, 95% of them on iOS ([Wikipedia](https://en.wikipedia.org/wiki/Partiful)). About 500K monthly users in Q1 2025, up 400% year over year, with "every event invitation is a growth loop… without any marketing spend" ([search summary of CNBC/Sacra](https://www.cnbc.com/2025/04/19/meet-partiful-the-gen-z-party-planning-staple-thats-taking-on-apple.html), [Sacra](https://sacra.com/c/partiful/)). $20M Series A led by a16z, valued at about $140M ([Fortune](https://fortune.com/2023/05/23/partiful-founders-startup-raises-series-a/)). |
| **Splitwise** | **"Pull" virality.** You can add an expense with a friend by email or phone *before they accept*. They're notified and can view, fix or add expenses, which pulls them in. | Invite behavior: [Splitwise KB](https://kb.splitwise.com/getting-started/can-i-add-a-friend-without-adding-their-email-address-or-phone-number) and [Splitwise feedback KB](https://feedback.splitwise.com/knowledgebase/articles/652174-someone-added-me-to-a-group-but-it-isn-t-showing). Growth from "word-of-mouth familiarity" to "tens of millions of users" by its 2021 $20M Series A ([PR Newswire](https://www.prnewswire.com/news-releases/splitwise-raises-20mm-in-series-a-funding-led-by-insight-partners-301278863.html)). |
| **Doodle** | **Every poll goes to participants who need no account.** Each person who answers sees the product and later creates their own polls. | 2M users by the end of 2008 (a year after launch), more than 10M by 2011, 20M monthly by 2014 ([Doodle history](https://doodle.com/en/resources/blog/the-history-of-doodle/), [tech.eu](https://tech.eu/features/1025/doodle/)). "Anyone can vote without requiring a Doodle account" ([Doodle Group Poll](https://doodle.com/en/group-poll-survey/)). |
| **ReciMe** | **Content plus capture loop.** TikTok content about saving TikTok recipes leads people to share a TikTok into ReciMe, which becomes a habit. Growth was mostly word of mouth and TikTok, with brand accounts totaling over 100K followers. | Went from 20K to 400K users in 2023 ([SmartCompany](https://www.smartcompany.com.au/startupsmart/recime-sizzles-jumping-20000-400000-users-in-2023/)), and now has 302K App Store ratings (competitors.md). |
| **Venmo** | **Payment requests plus a social feed.** To pay you back, your friend has to install Venmo. The feed showed payments (without amounts) to friends, and campus networks reached critical density. | [HBS Digital Initiative](https://d3.harvard.edu/platform-digit/?p=399), [MarketerGems](https://www.marketergems.com/p/venmo-growth-marketing-strategies-campaigns) (secondary). |
| **Batch (bachelorette)** | **Dense-network niche.** Each bachelorette brings in 8–12 people, many of whom will plan or attend more bachelorettes during wedding season. | 4x year-over-year growth, 1M+ people using the app and 200K parties in 2022 ([Batch Series A letter](https://letsbatch.com/blog/series-a-announcement), [Skift](https://skift.com/2023/03/17/bach-raises-9-million-for-bachelorette-party-booking-platform/)). |

**Shared pattern:** the person you invite gets **value before they have to commit** (Partiful RSVP, Doodle vote, Splitwise IOU), and **the invite itself carries what the product does**.

### 2.2 Proposed loops

**Loop 1 — "The trip text" (invite loop, Partiful model).**
1. The organizer creates a trip and adds 8–12 numbers (FR-3).
2. Each guest gets a personal SMS with a rich preview: trip name, cover, the first 3 idea cards and "Vote on these."
3. A personal, expiring link (FR-43) gets the guest voting in 2 taps (NFR-2). Phone OTP is needed only to *submit* the vote. That's the same "value before signup" pattern behind Duolingo's lesson-before-account, which is reported to have lifted DAU about 20% ([relaunch.ai teardown](https://relaunch.ai/blog/duolingo-onboarding-teardown-7-b-tests-behind-their-9-conver.html), secondary).
4. After the trip, each guest is asked "Planning something? Start a trip with this crew or a new one."

*Metric:* K = (invites per trip) × (join rate, target >60%) × (share of guests who organize a trip within 12 months). With 10 invitees, 60% joining and 10% later organizing, K ≈ 0.6 from this loop alone (est.). The other loops need to make up the difference.

**Loop 2 — "Card in the chat" (content loop).**
- Every idea card has a share link that unfurls in iMessage and WhatsApp as a rich preview: the clip thumbnail, place, "4 Must-dos · closes Fri", and **no private data** (Pass votes and budgets are never shown).
- Pasting it into the existing group chat pulls in members who haven't joined, and that's where the group already talks.
- Phase 3: the iMessage extension (FR-48) posts the same cards natively.

**Loop 3 — "You owe $42" (money loop, Splitwise/Venmo model).**
- Every receipt split texts each person involved once, batched (FR-42, FR-45): "Maya paid $336 at Contramar. Your share: $42 · Settle with Venmo."
- Balances keep people returning after the trip is over.
- Settle-up deep links (FR-39) get people back into the trip to mark the debt paid.
- People who weren't on the trip but were named on a receipt also get the text, which reaches non-users.

**Loop 4 — "Trip Wrapped" (recap loop).**
- 24–48 hours after the last Stop, generate a recap sized for Instagram or TikTok stories: Stops, the top Must-do, how many TikToks turned into real places, and "8 friends · 3 cities · 14 places." Never show individual spending.
- It's posted where future organizers (the next bride's friends) will see it.
- "Plan a trip like this" leads to the template.

**Loop 5 — "Steal this weekend" (template loop for the bachelorette niche).**
- A finished trip can be published by the organizer, with names, money and private votes removed, as a template: "Nashville bach, 3 nights, 11 places the group loved, receipt-verified."
- Templates are SEO pages and TikTok-shareable links. "Use this template" creates a new trip with the ideas already loaded.
- This builds the receipt-verified "places groups actually went" corpus (moat #3) and gives Batch-style city content **without** running a curation team.

---

## 3. Delight: the first 60 seconds

### 3.1 What top consumer apps do
- **Value before signup.** Duolingo runs a lesson before asking for an account ([Appcues GoodUX](https://goodux.appcues.com/blog/duolingo-user-onboarding)). Partiful, Doodle and Apple Invites let guests respond with no app or account ([Apple Newsroom](https://www.apple.com/newsroom/2025/02/introducing-apple-invites-a-new-app-that-brings-people-together/)).
- **A single "aha" action that predicts retention.** Classic examples: Facebook's "7 friends in 10 days", Slack's 2,000 messages, and Dropbox's "one file in one folder" ([June.so activation playbook](https://www.june.so/blog/activation-playbook), [HelpHero](https://helphero.co/blog/aha-moment/)). These are rallying numbers, not physics, but the lesson holds: pick one action and design toward it.
- **Show the user's own content transformed.** ReciMe's whole hook is "your messy TikTok became a clean recipe card." Plotline and Tabi do the same for places.

### 3.2 Organizer aha: "My TikTok became a plan, and the group is already voting"
**Target: under 60 seconds from landing to the first group vote request sent.**

| Second | What happens |
|---|---|
| 0–10 | The landing page asks one question: *"Paste a TikTok or type where you're going."* No signup. |
| 10–25 | The pasted TikTok becomes a card **within 2 s** (NFR-1): the clip thumbnail plays, it shows "Finding the place…", then fills in with name, pin, hours and price. **The trip is created automatically from that card**: destination inferred ("Nashville?"), with a name suggestion such as "Sarah's Nashville Bach 🤠" based on keywords like "bach" or "bachelorette." |
| 25–40 | "Add a few more?" accepts several links pasted at once, so a dump from the group chat turns into 5 cards on a map. Duplicates merge ("Also shared by you"). |
| 40–60 | "Who's coming?" opens the contact picker, then sends. The organizer verifies their phone (OTP) **only at this step**, after already seeing value. |

**The aha moment:** the screen showing *"Texts sent to 8 friends. They can vote without downloading anything."* followed a few minutes later by the first push: *"Jess voted on 3 ideas."*

### 3.3 Guest aha: "I voted in 10 seconds, and the reveal was fun"
**Target: about 10 seconds from tapping the text to the first reveal.**

| Second | What happens |
|---|---|
| 0–3 | Tap the text, and the trip opens on the web with no install. The personal token pre-identifies the guest. |
| 3–8 | **Swipe voting on 3 cards** (Must-do / Down / Pass), each with the clip playable inline. Blind voting (FR-22): no tallies are visible yet. |
| 8–10 | Enter the OTP once, then **reveal**: *"You and 4 others are Must-do on Robert's Western World 🔥 · 2 people are Down."* Pass votes stay anonymous (FR-23). |
| after | A gentle prompt: "See something on TikTok? Paste it here," plus Stop attendance ("Are you in for both Nashville nights?"). |

**Why the reveal is the aha moment:** it's the social payoff of blind voting, finding out what your friends secretly want, and it's something Wanderlog, Google lists and native polls don't offer. It also produces honest votes, which the decision research supports (group-decision-making.md).

**Bachelorette-specific delight:** a **"Surprise mode"** that hides chosen items (the stripper, the sash, the surprise dinner) from the guest of honor. It costs almost nothing to build and gives people a reason to talk about the app.

---

## 4. Underserved segments and wedges

Sizes are US figures. **(est.)** marks my own derivations.

| Segment | Size and spend | Pain | Who already targets it | Fit with our product | Verdict |
|---|---|---|---|---|---|
| **Bachelor/bachelorette** (planner = maid of honor or best man) | 2,082,354 US marriages in 2024 ([CDC/NCHS via BGSU](https://www.bgsu.edu/ncfmr/resources/data/family-profiles/FP-25-30.html), [CDC PDF](https://www.cdc.gov/nchs/data/dvs/marriage-divorce/national-marriage-divorce-rates-00-23.pdf)). The average bach attendee spends **$1,300**, about $2,000 when flying, and 37% spend over $1,000 ([The Knot](https://www.theknot.com/content/bachelorette-party-weekend-cost)). The average party lasts 2 days. If about half of weddings have at least one travel bach party: **~1–2M trips a year × ~8–10 guests × ~$1,300 ≈ $10–25B of spend a year (est.)**. Batch hosted 200K parties in 2022 ([Batch](https://letsbatch.com/blog/series-a-announcement)). | **Very high.** One planner herds 8–12 people with different budgets, chases payments, collects deposits for the house, handles surprises, and is stuck with the "peace tax" (82% overpay to avoid conflict; group-decision-making.md). | **Batch** (curated city marketplace with polls, chat and splitting; booking-quality complaints), **Let's Jetty** (pages for bachelorettes), **Bridesquad** (26 ratings), **ProPartyPlanner**, GroupMe, Splitwise, plus Etsy and Notion planning templates ([The Knot apps roundup](https://www.theknot.com/content/bachelorette-party-apps), [Let's Jetty](https://www.letsjetty.com/bachelorette-party-app)) | Excellent: TikTok-driven ideas, a short weekend, many shared costs, a need for surprise mode, and dense repeat networks | **Wedge #1** (as already planned) |
| **Friend-group city weekends / birthdays** | Very large and hard to measure. 45% of group travelers report money conflict ([CIT Bank/Harris Poll](https://newsroom.firstcitizens.com/2026-06-23-82-of-Group-Travelers-Will-Pay-a-Peace-Tax-to-Avoid-Money-Arguments,-CIT-Bank-Survey-Finds)) | High (decisions and money) | Wanderlog, Places.is, Partiful (one-day events), Batch ("girls trip, birthday") | Excellent | Wedge #1b. Use the same product without bachelorette branding |
| **Golf buddy trips** | **12M+ Americans travel to play golf every year** (record levels 2022–25), and golf travel is worth over $40B ([NGF](https://www.ngf.org/short-game/travels-expanding-golf-economy-impact/), [NGF summary](https://www.ngf.org/member-publication/summary-of-golf-travel-in-the-u-s-2025/)). Groups of 2–8 and 16+ | Medium-high. The pain is tee times, pairings, side bets and settling up. TikTok discovery matters less | Squabbit, Golf Genius Trip Manager, CupTracker, Unknown Golf, ITL Links, Outing.golf ([Outing comparison](https://www.outing.golf/best-golf-trip-planner-apps), competitor-authored) | Partial. Our money features fit, but capture and voting matter less, and scoring is a separate product | Later, possibly as a "side bets" add-on |
| **Festival groups** | About **32M Americans attend at least one music festival a year** ([Nielsen 2015](https://www.nielsen.com/insights/2015/for-music-fans-the-summer-is-all-a-stage/)) | Medium. Shared Airbnb or camping costs, set times, meeting up. Ideas are fixed (the lineup), so there's less to capture | Official festival apps, Partiful, Splitwise, GroupMe | Medium. Money and attendance are strong; TikTok capture of side activities is weak | Later. Seasonal campaign ("split the festival house") |
| **Family reunions** | About **200K reunions a year**, often 3+ days and **100+ members**. 28% of families gather every year. Nearly half of African American leisure travel is tied to reunions ([Encyclopedia.com](https://www.encyclopedia.com/humanities/encyclopedias-almanacs-transcripts-and-maps/reunions)) | High for the organizer (RSVPs, fees, t-shirts, multiple generations) | **Reunly** ($39 one-time per reunion; RSVPs plus payments), Reunacy, RSVPify, MyEvent, AmazingReunion ([Reunly comparison](https://reunly.io/compare/best-family-reunion-planning-apps), competitor-authored); Wayfind (household RSVPs) | Weak to medium. Older and less TikTok-native, groups are huge, and ticketing matters more than voting | Not a wedge |
| **Study abroad** | **298,180 US students studied abroad for credit in 2023/24**, and 444K had some global education experience ([IIE Open Doors](https://opendoorsdata.org/annual-release/u-s-study-abroad/)) | High for weekend trips: multi-city, multi-currency, budget-sensitive, constant TikTok use | Mostly generic tools (WhatsApp, Splitwise, Tricount), Polarsteps for journaling | Strong on multi-city, currency and splits. Low spend per trip, but dense campus networks (Venmo's playbook) | **Wedge #2 / campus ambassador experiment** (spring semester) |
| **Corporate offsites** | Navan alone handled $7.6B in gross bookings over the 12 months to Jul 2025 ([Navan](https://navan.com/)). Agencies: Surf Office, Offsite.com ([Surf Office 2025 report](https://www.surfoffice.com/blog/company-offsites-report-2025)) | Medium. Planners have budgets and agencies; needs are invoices, policy and compliance | Navan Team Travel, Offsite.com, Surf Office, Pilot (retreats) | Poor for the POC. B2B sales, approvals and expense-policy rules | Avoid until we have product-market fit; maybe "team trips" later |

**Wedge recommendation:** bachelor/bachelorette first, since it has the highest pain and spend, the densest repeat network and an obvious delight feature (surprise mode). The same product works unbranded for friend weekends. Run study abroad as a low-cost campus experiment in spring 2027. **Batch is the incumbent to position against.** It is catalog- and booking-led ("pick from our inventory") and has fraud and booking-quality reviews (competitors.md). We are "your friends' TikToks, decided fairly, paid fairly."

---

## 5. Monetization that strengthens the product

**Principle:** charge where the money **already moves** (deposits, bookings, settle-up), and only after the group has decided, so revenue never distorts the vote. Never charge per person.

### 5.1 Booking commissions (after the decision)
| Program | Typical rate | Notes |
|---|---|---|
| Booking.com affiliate | **25–40% of Booking's margin**, tiered by monthly bookings, which works out to roughly **4% of booking value** for stays ([UpPromote](https://uppromote.com/affiliate-directory/booking-com/), [ecomobi](https://ecomobi.com/join-booking-com-affiliate-on-ecomobi-passio/)) | Commission is paid on completed stays |
| Viator / GetYourGuide | **~8%** with a 30-day cookie. GYG pays 5–8% depending on the network ([PHPTravels](https://phptravels.com/blog/how-to-earn-with-the-viator-affiliate-program), [Track360](https://track360.io/blog/viator-getyourguide-affiliate-programs-operator-teardown-2026)) | Good fit for the "Do" stage (boat parties, drag brunch, tours) |
| Airbnb | **No open affiliate program since 31 Mar 2021.** Only application-based creator and demand programs now ([CNBC](https://www.cnbc.com/2021/03/01/airbnb-ends-affiliate-program-as-it-ramps-up-host-recruitment-campaign.html), [PriceLabs](https://hello.pricelabs.co/blog/airbnb-affiliate-program/)) | Our Stay stage will be mostly Airbnb links, which we can't monetize. Use Booking.com or Vrbo/Expedia alternatives where possible |
| Wanderlog (benchmark) | Freemium Pro plus affiliate deals with Expedia Group, Booking Holdings and Viator ([canvasbusinessmodel](https://canvasbusinessmodel.com/blogs/how-it-works/wanderlog-how-it-works)) | Revenue figures online disagree ($1M ARR vs. a claimed $17M "non-subscription take"), so **treat them as unreliable** |
| Mindtrip (benchmark) | Booking commissions plus **destination-marketing-org subscriptions** (Visit California and others). About $3.6M revenue in 2025 (Latka **estimate**) ([Latka](https://getlatka.com/companies/mindtrip.ai), [eightception](https://eightception.com/mindtrip-ai-travel-startup/)) | DMO and tourism-board deals are a B2B option once we have receipt-verified demand data |
| TikTok GO | Commissions shared with creators. Partners include Booking.com, Expedia, Viator and GYG ([TikTok](https://newsroom.tiktok.com/introducing-tiktok-go?lang=en)) | Competes for the same affiliate dollars, from inside the video |

**Expectation (est.):** an 8-person bachelorette that books one $1,500 activity block through Viator (8% = $120) and a $3,000 hotel through Booking (~4% = $120) brings in **about $240 per trip**. That's meaningful, but only if a real share of decided items get booked through us. Batch's marketplace exists because of this economics.

**How it strengthens the product:** booking links appear **only on items already `planned`**, as "Book for the group." The booking confirmation then automatically creates an expense on the trip, which pre-fills the split.

### 5.2 In-app payments and group deposits
**How others did it:**
- **Partiful "Chip In"** links out to Venmo, Cash App, PayPal or GoFundMe and **can't verify payment**. Guests self-confirm ([Partiful help](https://help.partiful.com/en-us/articles/15525460-how-do-i-use-the-chip-in-feature), [verification FAQ](https://help.partiful.com/hc/en-us/articles/24468029336731-Do-you-independently-verify-that-guests-have-paid-the-correct-amount)). In **June 2026 Partiful launched ticketing** built on **Stripe Connect** (hosts onboard as connected accounts, payouts about 3 days after the event, service fee) ([Startup Fortune](https://startupfortune.com/partiful-is-turning-party-invites-into-a-payments-business/), [Partiful help](https://help.partiful.com/en-us/articles/15525293-can-i-sell-tickets-on-partiful)).
- **Splitwise Pay** settles balances in the app through a **bank partner (Coastal Community Bank, Member FDIC)**, US-only, with no fee for standard transfers. Splitwise has also launched a **Splitwise Card** (Mastercard debit) that auto-splits purchases ([Splitwise Pay](https://www.splitwise.com/pay), [Splitwise Card](https://www.splitwise.com/card)). That's a banking-as-a-service model, which is heavier than Stripe.
- **SquadTrip** collects group-trip payments with **installments and auto-billing**. **Travelers pay a 6% fee** that covers Stripe's 2.9% + 30¢, and the organizer receives the full price ([SquadTrip help](https://help.squadtrip.com/en/articles/12292896-managing-payments-in-squadtrip-payment-methods-installments-and-auto-billing)).
- **Airbnb Split Payments** (Nov 2017) put a booking on hold until everyone paid within 72 hours. It was **retired in Sept 2018** after host and payment problems ([TechCrunch 2017](https://techcrunch.com/2017/11/28/airbnb-launches-payment-splitting-for-group-trips/), [JoinSpark](https://joinspark.app/blogs/en/can-airbnb-payments-be-split-no-native-option-since-2018-workarounds-for-groups)). **Vrbo has no native group split** ([iGMS](https://www.igms.com/vrbo-payment-options/)). The organizer pays the whole rental upfront, which is exactly the pain we can solve *outside* the booking site.
- **Venmo Groups** (Nov 2023) tracks shared expenses inside Venmo ([PayPal Newsroom](https://newsroom.paypal-corp.com/2023-11-14-Introducing-Venmo-Groups)). There's still no public P2P API.

**Regulatory path:**
- **Friend-to-friend reimbursement through our platform is money transmission.** Stripe says it **doesn't support personal or P2P money transmission** ([Stripe prohibited/restricted FAQ](https://support.stripe.com/questions/prohibited-and-restricted-businesses-list-faqs)). Licensing ourselves would mean state money-transmitter licenses, at roughly $50K–$500K+ in legal costs ([Zentric summary](https://www.zentricsolutions.com/blogs/stripe-connect-marketplaces-onboarding-payouts-compliance), secondary).
- **"Organizer collects a fixed share for a defined purchase"** (house deposit, party bus, dinner pre-pay) looks like Partiful ticketing and SquadTrip: the organizer is the **connected account (seller)** and guests are **buyers**. **Stripe Connect** handles KYC and holds the funds, so we never touch them ([Stripe for Marketplaces](https://stripe.com/use-cases/marketplaces)). *Needs legal review*, but this is the pattern others are already shipping.
- **Recommended sequence:**
  - Phase 2: Venmo, Cash App, PayPal and Zelle deep links with self-confirm and a "mark paid" action (no regulatory exposure).
  - Phase 3: **"Collect for the house"** through Stripe Connect. The organizer sets the amount per attending person, guests pay by card, Apple Pay or Klarna, and the payer covers a fee (SquadTrip-style, about 3–6%). Include installments and a deadline.
  - Later, only if the volume justifies it: settle-up in the app through a bank or BaaS partner (Splitwise model).

**Why it strengthens the product:** deposits are the planner's #1 headache (fronting $3–5K for the house), and the organizer **chooses** to turn on paid collection. Payment status feeds per-Stop attendance ("paid = confirmed"), which also fixes Batch's *"no way to have guests individually rsvp"* complaint.

### 5.3 Organizer-paid premium ("Trip Pass")
- **Model:** guests are always free, and the core (capture, vote, splits, texts) is free. The **organizer** pays per trip, for example a **$9.99–$19.99 Trip Pass**, or about $39/yr for unlimited trips. This mirrors Settle Up's **group premium** (one person unlocks the group: $5.99 up to $149.99 lifetime; [Settle Up](https://settleup.app/premium)) and Reunly's **$39 one-time per reunion** ([Reunly](https://reunly.io/family-reunions)). It avoids Splitwise's and Rhyme's per-person pricing (competitors.md).
- **What's in the pass:** unlimited AI extraction and itemized receipts beyond a free cap (ReciMe-style metering, but per trip), surprise mode, deposit collection with lower fees, Trip Wrapped without branding, CSV/PDF export, custom cover and theme, and higher SMS limits.
- **Never paywall:** guest participation, voting, basic splitting, offline access (Wanderlog's #1 complaint) or settle-up.
- **The cost floor justifies it:** each trip costs us real money in SMS (10 guests × about 10 texts), Places API calls (about $17 per 1K detail calls) and LLM extraction. A small organizer fee covers what a booking-commission model can't.

---

## 6. Ten differentiators, ranked

Scoring: **Defensibility** (how hard it is for Google, TikTok, Places.is or Wanderlog to match quickly), **Build cost** (S/M/L for our team), **Phase**.

| # | Differentiator | Why it's defensible | Build | Phase |
|---|---|---|---|---|
| **1** | **Vote-by-text on AI-resolved TikTok cards** (personal SMS link → swipe Must-do/Down/Pass → OTP → reveal). Capture, decision and zero-install participation in one loop | No competitor has all three. Places.is has link plus voting with no SMS identity, Partiful has SMS with no ideas, Google has neither. The value is in the loop, not any single part, and it builds the verified-phone crew graph (moat #1) | M | **POC (hero)** |
| **2** | **Blind voting with reveal + organizer polls with deadlines; non-voters abstain** | Backed by herding and hidden-profile research (group-decision-making.md). Blind voting is easy to copy, but it only works inside a group-trip object with roles and deadlines. Also produces honest preference data (moat #4) | S–M | **POC** |
| **3** | **Per-Stop attendance driving votes, nudges and default splits** | Nobody models partial attendance across planning *and* money (competitors.md §4.3). Hard for Wanderlog to add without reworking its data model | M | **POC** |
| **4** | **Receipts linked to ideas ("we actually went")** + attendance-aware even/itemized splits + multi-currency | Creates unique receipt-verified data (moat #3) and trust in the ledger (moat #2). Splitwise doesn't know the plan, and planners don't know the money | M–L | **POC (basic)**, deepen later |
| **5** | **Partiful-grade SMS done politely** (one text per day maximum, batched digests, two-way replies, STOP/HELP) | Operational know-how plus 10DLC registration. Directly fixes Partiful's spam complaint | M | **POC (one-way)**, two-way in P2 |
| **6** | **Bachelorette mode: Surprise mode, templates, "paid = confirmed"** | Delight specific to the niche, plus template-loop content. Batch is inventory-led, and generic planners won't build for a niche | S–M | **POC-lite** (surprise mode); templates in P2 |
| **7** | **"Collect for the house": organizer deposits through Stripe Connect** | Payments lock-in, and it solves the planner's biggest cash pain. Airbnb abandoned this and Vrbo never built it | L | P3 |
| **8** | **Native share-sheet inbox across sources** (TikTok + IG + YouTube + Maps + screenshots → one trip, merged duplicates, auto-routed to Stops) | A cross-platform pool TikTok and Instagram won't build for each other. The share sheet alone is easy to copy | M–L | P2 |
| **9** | **Trip Wrapped + "Steal this weekend" templates** | A growth loop that builds a corpus of receipt-verified group trips | M | P2 |
| **10** | **Organizer-paid Trip Pass; guests always free** | Positioning against per-person pricing (Splitwise, Rhyme). Easy to copy in theory, but incumbents' pricing models make it hard for them to switch | S | After POC (validate willingness to pay) |

Not ranked as differentiators (table stakes): map, day plan, export, AI shortlisting, private budget check-in. Do them, but don't market them.

---

## 7. Positioning

**Positioning statement**
> For **friend groups planning bachelor/bachelorette weekends and trips together**, who lose TikToks in the group chat, argue about plans and end up fighting over money, **[Name]** is the **group trip inbox** that turns anything you share into a real place, lets everyone **vote privately from a text with no app needed**, and **splits the tab fairly** at the end. Unlike **Wanderlog**, which is built for one planner writing an itinerary, or **Splitwise**, a separate money app that charges each person, we're built for **the whole group deciding and paying together**, from the first TikTok to the last settle-up.

**One-line pitches to test** (A/B on the landing page and in TikTok ads):
1. **"Drop the TikToks. Vote by text. Split the bill."** (feature-forward)
2. **"The group chat that actually decides."** (pain-forward)
3. **"Plan the bach without being the bad guy."** (for the maid of honor or best man; blind votes plus a fair split take the politics off the planner)
4. **"Partiful for group trips."** (for investors and press only, not consumers)

**Recommended lead for the POC:** #3 for the bachelorette wedge and #1 for general friend trips.
