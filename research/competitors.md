# Competitive Landscape: Group Trip "Inbox" App

*Research date: 30 Sep 2026. Prepared for: group-travel planning app (share TikTok/IG → AI place resolution → group idea list → vote/comment; Partiful-style web-link invites; later native share extension, iMessage extension; receipt-photo expense splitting).*

---

## 0. Method and caveats (read first)

- **Sources used:** App Store listings and review pages (ratings and counts pulled directly from the Apple iTunes Search/Lookup API on 30 Sep 2026), Trustpilot, Product Hunt, Google/TikTok/Apple/OpenAI newsrooms, TechCrunch/MacRumors/9to5, and company sites.
- **Reddit could not be accessed directly.** reddit.com blocks this research tool's crawler, and the pullpush mirror rate-limited us. Where Reddit sentiment appears below, it comes **second-hand** from review blogs that summarize r/travel / r/solotravel threads, and is labeled that way. Before you lean on any of it in a pitch, check it by hand on Reddit.
- **Beware SEO "reviews."** Most "best app for X 2026" articles are written by competitors (Plotline, Pilot, Tripstone, Dream Trip, Triply, RoamRecs, Places, HippoSplit, Splitty, and others), and each one ranks its own app first. I used them for feature and price facts that can be checked, and flagged them where they are the only source for a claim.
- App Store ratings for new apps are often inflated by early prompts. Rating *counts* are a better guide to traction than star averages.

### Traction snapshot (US App Store, pulled 30 Sep 2026)

| App | Rating | # Ratings | First released | Notes |
|---|---|---|---|---|
| TripIt | 4.84 | 311,171 | 2009 | Itinerary from emails |
| ReciMe | 4.79 | 302,115 | 2021 | Capture-model benchmark (recipes) |
| Partiful | 4.95 | 259,299 | 2023 | Invite-model benchmark |
| Wanderlog | 4.90 | 35,594 | 2019 | Main competitor |
| Splitwise | 3.99 | 28,325 | 2011 | Rating is falling because of the paywall |
| Batch | 4.80 | 21,860 | 2018 | Bachelorette/party group trips |
| Polarsteps | 4.88 | 9,645 | 2015 | Travel tracker/journal |
| Tricount | 4.88 | 7,213 | 2010 | Splitting (owned by bunq) |
| **Rhyme** (formerly Roamy) | 4.75 | 5,174 | Oct 2025 | Social video → map → itinerary |
| Mapstr | 4.73 | 2,587 | 2014 | Saved-places map |
| Settle Up | 4.82 | 1,740 | 2013 | Splitting |
| corner | 4.54 | 837 | 2023 | Social places curation |
| Mindtrip | 4.69 | 813 | Jun 2025 | AI planner |
| **Tabi** | 4.82 | 653 | Sep 2025 | "Turn posts to places", shared lists |
| **Plotline** | 4.94 | 624 | Mar 2026 | Social video → map → itinerary |
| Stippl | 4.58 | 478 | 2022 | All-in-one planner |
| Frienzy | 4.77 | 198 | 2023 | Group travel + expenses |
| Layla | 4.65 | 191 | Mar 2026 (new listing) | AI agent; seller is Beautiful Destinations Booking GmbH |
| Plany | 4.72 | 46 | Jun 2026 | Social saves + AI itinerary |
| Gobi: AI Map with Friends | 5.0 | 11 | Jun 2026 | Early |
| Stamp'd | 4.5 | 4 | Mar 2026 | Group decision engine |
| Pilot | 5.0 | 2 | 2024 | Web-first; the iOS app has almost no reviews |
| TripSquad | 5.0 | 1 | Apr 2026 | Vote + no-download web invites |
| **Places** (places.is) | n/a | 0 | Jun 2026 | **Closest direct competitor** (see 2.4) |
| Troupe (JetBlue) | **not found** | n/a | 2022 | troupe.com did not resolve and no app in the US store on 30 Sep 2026. Probably shut down (unconfirmed) |

Source for every row above: Apple iTunes Search/Lookup API (`itunes.apple.com/search`, `/lookup`), queried 30 Sep 2026.

---

## 1. Competitor profiles

### 1.1 Group trip planners (itinerary-centric)

#### Wanderlog (main competitor)
- **What it does:** A collaborative itinerary and map planner ("Google Docs for travel"). It has day-by-day plans, a map, reservation import by Gmail scan or forwarded email, a budget with expense splitting, checklists, an AI assistant, route optimization and offline mode. Web, iOS and Android. ([wanderlog.com](https://wanderlog.com/))
- **Pricing:** The free tier is generous: unlimited places, live collaboration and a manual budget. **Pro is $39.99/yr** and adds offline access, route optimization, Google Maps export, Gmail auto-scan, flight updates and the AI assistant. ([Tripstone pricing](https://tripstone.app/blog/wanderlog-pro-cost), [MonkeyEatingMango](https://monkeyeatingmango.com/blog/wanderlog-pricing-2026/))
- **Target user:** The "planner" in a friend group who builds a detailed itinerary, often on desktop.
- **Strengths:** The biggest install base among dedicated planners (35.6K iOS ratings at 4.9). Real-time co-editing, a strong map plus day view, reservations and expenses all in one place, and a web app.
- **Weaknesses (from real complaints):**
  - **Gets slow with big trips.** App Store, "Want to rate it 5 Stars!": *"The app completely lags or flat out refuses to work if you've added a lot of stops."* Trustpilot (May 2026): *"so slow and buggy… there's literally no button to put a location in your itinerary."* Second-hand Reddit summaries say the same and suggest planning on desktop and splitting trips into smaller ones. ([App Store reviews](https://apps.apple.com/us/app/wanderlog/id1476732439?see-all=reviews), [Trustpilot](https://www.trustpilot.com/review/wanderlog.com), [Tripstone Reddit summary](https://tripstone.app/blog/wanderlog-review))
  - **Overwhelming UI.** *"The user interface is just too difficult to navigate"* (App Store, 2024). *"Don't overcrowd the interface, keep it simple and efficient"* (App Store, 2022). One reviewer: opening a trip hits you with "itinerary, map, reservations, budget, checklists, and more." ([App Store](https://apps.apple.com/us/app/wanderlog/id1476732439?see-all=reviews), [aitooldiscovery](https://www.aitooldiscovery.com/guides/wanderlog-reddit))
  - **No social-video capture.** You can't share a TikTok or Reel in and get places back. Everything is typed into a search. ([Plotline](https://getplotline.app/blog/plotline-vs-wanderlog), [Places](https://www.places.is/vs/wanderlog); both are competitor sources, but this matches the product as it is today)
  - **No voting or decision layer.** Co-editing with no structured way to decide. One review: with five editors "your itinerary can turn into a mess of conflicting ideas, and there's no commenting system." ([Tripstone](https://tripstone.app/blog/wanderlog-review), [Places](https://www.places.is/vs/wanderlog))
  - **Paywalled essentials.** Offline mode (described as the #1 App Store complaint) and Google Maps export both need Pro. The Gmail-scan permission "feels invasive." ([aitooldiscovery](https://www.aitooldiscovery.com/guides/wanderlog-reddit))
  - **Trust and billing problems.** Trustpilot rates it **1.9/5** (51 reviews). There are complaints about charges after a free trial (*"charged my bank account without me subscribing… $60"*, Nov 2025), wrong place data (*"lists 16 Free entry museums in Corfu… all were 10 Euros"*, Aug 2026), and forwarded booking emails that *"don't land in the trip"* (Jul 2026). ([Trustpilot](https://www.trustpilot.com/review/wanderlog.com))
  - **Account-first collaboration.** Collaborators have to sign up to edit. There is no RSVP-style, no-login guest flow (based on the product; confirm by hand).

#### TripIt (SAP Concur)
- **What it does:** Forward booking emails and get an automatic master itinerary. Pro adds flight alerts, seat tracking and points tracking.
- **Pricing:** Free. **Pro $49/yr.** ([MonkeyEatingMango](https://monkeyeatingmango.com/blog/tripit-pricing-2026/))
- **Target:** Frequent and business travelers.
- **Strengths:** 311K ratings, a huge install base, and reliable email parsing.
- **Weaknesses:** **Starts too late.** "Email-first planning is both its strength and its ceiling": nothing for inspiration or decisions ([Pilot review](https://www.pilotplans.com/blog/review-of-tripit), a competitor source). **Sharing is view-only unless both people have Pro**, so it isn't a group canvas ([MonkeyEatingMango](https://monkeyeatingmango.com/blog/wanderlog-vs-tripit-2026/)). App Store: *"No ability to copy(duplicate) an event. No drag and drop."*; *"$48 membership"* not worth it; *"Sad to see them gobbling PII now"* (2024). ([App Store](https://apps.apple.com/us/app/tripit-travel-planner/id311035142?see-all=reviews))

#### Troupe (JetBlue Travel Products)
- **What it did:** A group-decision app with ranked-choice voting on destinations, dates, lodging and activities, plus RSVPs, broadcasts and Google Maps links. JetBlue Travel Products launched it in Sept 2022. ([JetBlue IR](https://ir.jetblue.com/news/news-details/2022/nbspJetBlue-Travel-Products-Launches-New-Travel-App-Troupe-09-21-2022/default.aspx), [Skift](https://skift.com/2022/09/21/jetblue-wants-to-make-group-travel-easier-with-new-app/))
- **Status:** On 30 Sep 2026 **troupe.com did not resolve and no Troupe group-trip app from JetBlue appeared in the US App Store.** It looks discontinued, but I found no shutdown announcement. Many 2026 listicles still recommend it.
- **Strengths (when live):** Reviewers called it "the one problem most travel apps ignore: getting six opinionated friends to agree." ([TripProf](https://tripprof.com/en/blog/best-group-travel-planning-apps/))
- **Weaknesses:** It covered **only the decision phase**: "no itinerary building, no expense tracking, no documents." ([TripProf](https://tripprof.com/en/blog/best-group-travel-planning-apps/), [WePlanify](https://www.weplanify.com/en/alternatives/best-group-trip-planner-apps))
- **Lesson:** A voting-only product backed by an airline didn't last. Voting is a feature, not a business, unless it's tied to capture and to logistics.

#### Let's Jetty
- **What it does:** A tool for the group-trip organizer. Invites, RSVP deadlines, surveys and polls, a date recommender, stay suggestions, a message board and an itinerary builder. Marketed for bachelorettes and family reunions. Web app you can add to the home screen, plus apps. Kickstarter-funded. ([letsjetty.com/faqs](https://www.letsjetty.com/faqs), [AccessNewswire](https://www.accessnewswire.com/newsroom/en/business-and-professional-services/let%E2%80%99s-jetty-introduces-its-collaborative-app-for-stress-free-grou-777701), [Kickstarter](https://www.kickstarter.com/projects/letsjetty/jetty-the-travel-planning-app-your-crew-will-actually-use))
- **Pricing:** Free with paid premium (shown at 50% off). The exact price isn't public.
- **Strengths:** The closest to "organizer + RSVP" thinking, and it won The Knot's "Best App for Travel Planning."
- **Weaknesses:** **Users must create an account** at app.letsjetty.com (FAQ). No social-video capture. One listicle says it lacks budget tracking. Very little public review volume: I couldn't find a standalone listing in a US App Store search, and the brand mostly lives on the web. Too few public complaints exist to cite, which itself signals low traction.

#### Plan Harmony
- **What it does:** A web and mobile group planner with a shared calendar (Google Calendar sync), **voting on accommodation, activities and restaurants**, budget plus expense splitting, chat threads attached to decisions, AI suggestions, and a marketplace of more than 6,000 tours. Invite by link. ([planharmony.com](https://www.planharmony.com/), [Plan Harmony 2.0](https://www.planharmony.com/blog/plan-harmony-2/))
- **Pricing:** Free plan. Paid "from $5" one-time. ([planharmony.com/vs-tripit](https://www.planharmony.com/vs-tripit/))
- **Strengths:** Has the decision-thread pattern (chat attached to a specific choice) that we want.
- **Weaknesses:** Tiny footprint. No distinct App Store presence came up in search, and there are almost no third-party reviews. No social-video capture. Positioned as a calendar-first tool, which means it starts after ideas have been gathered.

#### Pilot (pilotplans.com)
- **What it does:** A free, web-first group planner and booker with a shared itinerary, preference collection, map, files, AI itinerary builder and group hotel-rate sourcing. ([pilotplans.com](https://www.pilotplans.com/), [group planner](https://www.pilotplans.com/group-trip-planner))
- **Pricing:** Free. It earns money from bookings and paid services (company retreats, negotiated group hotel rates).
- **Strengths:** No paywall, web-first, and booking revenue covers the cost.
- **Weaknesses:** It claims "4.7/5 by 120,000+ users," but **the iOS app has only 2 ratings** ([App Store](https://apps.apple.com/us/app/pilot-group-trip-planner/id6446177269?see-all=reviews)). Mobile adoption is weak, and the company itself writes much of the "review" content around it. No social-video capture and no real voting.

#### Stippl
- **What it does:** An all-in-one planner covering itinerary, calendar view, budget plus group splitting, packing per person, journal and route videos. ([stippl.io](https://www.stippl.io/))
- **Pricing:** Free (unlimited co-planners). **Pro $3.99/mo or $24.99/yr.** ([iTechGuides](https://www.itechguides.com/products/stippl/))
- **Target:** European multi-city travelers.
- **Weaknesses:** **Stability.** *"Crashes every time I try to add another destination"* (Feb 2025). *"Nearly unusable… destinations remove themselves and won't reappear"* (Jan 2025). *"Calendar view is absolutely fantastic… too frustrating to recommend"* (Jul 2026). Flight imports break on overnight layovers, and there's no iPhone-to-iPad sync. Trustpilot 2.9. ([App Store](https://apps.apple.com/us/app/stippl-trip-travel-planner/id6443617088?see-all=reviews), [Wandrly](https://www.wandrly.app/reviews/stippl))

#### Polarsteps
- **What it does:** Automatic GPS travel tracking and journal, plus printed travel books. Some planning.
- **Pricing:** Free. **Polarsteps Plus launched Jul 2026 at €8.99/mo or €29.99/yr.** Printed books cost about $120–200. ([taleswander](https://taleswander.blogspot.com/2026/05/polarsteps-app-review-2026-best-travel.html), [App Store](https://apps.apple.com/us/app/polarsteps/id947925763?see-all=reviews))
- **Strengths:** A loved brand (9.6K ratings at 4.9) and a "during and after the trip" loop.
- **Weaknesses:** **Single-traveler model.** A reviewer asked: *"it would be amazing if you could 'collaborate' with others on the app for trips"*, and the developer replied that "Travel Together" is on the roadmap. Other complaints: GPS "teleportations," battery drain, and lost uploads (one user lost a week of cruise entries). It isn't a pre-trip competitor today, but it could become one as a post-trip memory layer.

#### Frienzy
- **What it does:** A group-travel super-app with itinerary (including "snap a photo of your itinerary"), expense splitting, chat, live location, booking, scrapbook and public travel groups. ([App Store](https://apps.apple.com/us/app/frienzy-group-travel-planner/id6446246578))
- **Weaknesses:** Low traction after three years (198 ratings). It tries to do everything. Users want custom categories and dining as its own category. No social-video capture.

#### Batch (formerly The Bach)
- **What it does:** Party and bachelorette group trips in more than 70 cities. Curated rentals, bars and experiences with group pricing, RSVPs, polls, group chat and expense splitting. ([App Store](https://apps.apple.com/us/app/batch-lets-party/id1433495524))
- **Pricing:** Free. Makes money from bookings.
- **Strengths:** 21.9K ratings and "3M+ party planners." It owns the bachelorette niche.
- **Weaknesses:** Booking quality and fraud: *"Scam Bookings… this show was not real at all"* (2024). *"reservation wasn't ever made weeks prior"* ($800). *"There's no way to have guests individually rsvp for events… close to useless"* (2023). Catalog-driven: you pick from *their* inventory, not your friends' TikToks. ([App Store reviews](https://apps.apple.com/us/app/batch-lets-party/id1433495524?see-all=reviews))

#### Newer group-decision entrants (2026, tiny traction)
- **TripSquad – Plan, Vote, Go** (Apr 2026, 1 rating). An AI "Scout" suggests destinations from everyone's preferences, there's group voting with "Squad Budget Fit," and **invitees fill in a branded web form with no download.** This is the same no-download pattern we plan to use, applied to destination choice. ([App Store](https://apps.apple.com/app/id6762568582))
- **Stamp'd** (Mar 2026, 4 ratings). Join with a code, destination polls, deal-breakers, AI concierge, splitting, Viator booking. ([App Store](https://apps.apple.com/app/stampd/id6760239126))
- Also seen: TripLinq, Takeoff, TARA!, PlanIt, SquadUp, and a second, unrelated "Troupe: Plan & Split Trips" (Jul 2026). The category is crowded with low-traction clones.

### 1.2 Social video → places capture apps (the fastest-moving segment)

#### Places (places.is, Bunch Software) — **closest direct competitor**
- **What it does:** Shared real-time maps. **Paste a TikTok, Reel or article link and it pulls out each spot and pins it** with photos and descriptions. **Voting** and comments on places. **Invite by link, and anyone can open it without an account.** Web, iOS (launched Jun 2026) and Android. ([places.is](https://www.places.is/), [vs Wanderlog](https://www.places.is/vs/wanderlog), [Google Play](https://play.google.com/store/apps/details?id=is.places.app))
- **Pricing:** Free (unlimited maps, places and collaborators). No paid tier published yet.
- **Strengths:** It already combines three of our four core ideas: social capture, voting, and no-account web links.
- **Weaknesses:** A brand-new iOS app with 0 ratings. A "map" mental model, not a "trip/event" one: no RSVP, dates or itinerary, and **no expenses**. Capture is **paste a link**, with no native share-sheet ingestion promoted. Bunch Software's other app (Cozy, shared albums) has 0 ratings, which suggests a small team. Monitor closely.

#### Rhyme (formerly Roamy)
- **What it does:** One-tap save from TikTok and IG, pulls every location in a video onto a map, auto-builds a day-by-day itinerary from your trip length, and lets you duplicate community guides. ([App Store](https://apps.apple.com/us/app/rhyme-itinerary-planner/id6748781672))
- **Pricing:** **$50/yr** subscription (some users report $60).
- **Traction:** **5.2K ratings in under a year.** This is the strongest proof that social-to-trip capture has demand.
- **Weaknesses (App Store):** Unexpected charges after the trial (*"I was charged for a $60 yearly subscription"*). **"Family trip planning requires individual $50 subscriptions per person,"** so collaboration is expensive. Itinerary scheduling is *"cumbersome."* You can't explore before starting a trial. Support is slow. ([App Store reviews](https://apps.apple.com/us/app/rhyme-itinerary-planner/id6748781672?see-all=reviews))

#### Plotline
- **What it does:** iOS share sheet → every place in a video is extracted, geocoded and pinned, with the creator's tips ("what to order") and the source clip attached. Collections, an auto itinerary, "Sidequests," and live co-editing of collections and trips. ([getplotline.app](https://getplotline.app/), [FAQ](https://getplotline.app/faq))
- **Pricing:** Free (saving, map, shared collections, first trip plan). **Premiere $9.99/mo or $49.99/yr** for unlimited trip plans.
- **Weaknesses (App Store):** *"If you plot several points in a day, it will make you wait several hours before you can send a video to plot points again… sooo laggy"*. That points to rate-limited AI extraction, a sign that per-save AI costs are real. *"The map is very hard to move/navigate."* *"The monthly cost is too much… more like $5."* iOS only (Android has a waitlist). No voting and no expenses. ([App Store reviews](https://apps.apple.com/us/app/plotline-travel-map-planner/id6759443026?see-all=reviews))

#### Tabi: Turn posts to places
- **What it does:** Share any post, screenshot or link and get a pin with the original content attached ("remember why"). **Shared lists where friends add spots ("the next group trip")**, events logging, and visit stamps. ([App Store](https://apps.apple.com/us/app/tabi-turn-posts-to-places/id6751395035))
- **Weaknesses:** *"It takes a really long time to import any posts so it renders the app impossible to use"* (Dec 2025). Lists, not trips. No voting, logistics or money.

#### Others in the capture niche
- **JoySpot** (3.4 stars, 5 ratings). Imports from TikTok, IG, Mapstr, photos and Google Maps, collaborative spaces, GetYourGuide. ([App Store](https://apps.apple.com/us/app/joyspot-ai-import-your-spots/id6745341190))
- **Yaay** (3.0 stars, 2 ratings). Video → pin with the clip attached and shared collections. ([App Store](https://apps.apple.com/app/id6742421480))
- **Plany** (Jun 2026), **Dream Trip** (Pro $89.99/yr, 20-spot free cap), **SpotFetch** (DocentPro), **RoamRecs**, **Triply**, **GoPlaces**, **TokSpot**, **Pocket Places**, **Stasht**, **Voyla**, and **Gobi: AI Map with Friends**. ([Dream Trip](https://www.thedreamtrip.app/blog/best-apps-save-places-from-tiktok-instagram-2026), [Triply](https://triply.au/blog/best-apps-save-travel-places-instagram-tiktok/), [DocentPro](https://docentpro.com/blog/best-apps-to-save-places-from-tiktok-instagram-youtube))
- **Mapstr** (2.6K ratings) and **corner** (837). Older saved-places and social maps that now accept TikTok and IG links. corner is taste and follow-based ("see where your circle is going").
- **Takeaway:** **"Share a reel and get a pin" is now commodity.** At least 15 apps do it, and most are built on the same LLM-plus-Places-API pipeline. None of them is built around a *group's decision* about a *specific trip with dates and people*.

### 1.3 AI trip planners

#### Mindtrip
- **What it does:** An AI chat planner with a map. "Start anywhere" (screenshots, links, Google pins), shared itineraries with **group chat, co-editing and group voting**, and in-chat booking. $22.5M raised. ([stardrift](https://stardrift.ai/resources/best-ai-travel-planners), [tooldirectory](https://tooldirectory.ai/tools/mindtrip))
- **Pricing:** Free. Makes money from bookings.
- **Weaknesses (App Store, 813 ratings):** *"Lost all of the plan… had to restart planning from scratch after hours of work"*. *"Great for planning, not great for using on your trip… laggy and slow,"* with a request for a "Today" view. *"randomly refreshes and messes up the order."* *"The premise is good but this app needs work."* One reviewer: "curation is not the same as confident decision-making." ([App Store reviews](https://apps.apple.com/us/app/mindtrip-ai-travel-companion/id6503107567?see-all=reviews), [Product Hunt](https://www.producthunt.com/products/mindtrip/reviews), [SearchSpot](https://www.searchspot.ai/blog/mindtrip-ai-review-2026))
- **Threat level:** High. It is the best-funded AI planner with group features, and it could add a share-sheet inbox.

#### Layla
- **What it does:** A chat-based AI travel agent with live pricing, booking, human-agent finalization, and a creator-video map overlay. The App Store seller is now **Beautiful Destinations Booking GmbH** (the travel-media brand). ([stardrift](https://stardrift.ai/resources/layla-ai), [App Store](https://apps.apple.com/app/id6758730467))
- **Pricing:** Free tier. **Premium about $49/yr.** PDF export only in Premium.
- **Weaknesses:** **No collaboration:** "There's no way to share a trip for someone else to edit with you." AI errors: wrong flight info left in the final plan, routing a train trip "to the airport to fly." One user couldn't get a usable 3-day plan "after 90 minutes." Trustpilot 3.5, with a refusal to refund after an accidental trial conversion. ([Trustpilot](https://www.trustpilot.com/review/layla.ai), [aitravel.tools](https://aitravel.tools/layla-ai-review/))

#### Airial
- **What it does:** Paste a TikTok or Reel link and get a full day-by-day bookable trip (flights, hotels, activities) in about 45 seconds. No account needed. $3M seed (Montage, South Park Commons, Peak XV). Founders are ex-Meta and ex-Waymo. ([Airial blog](https://airial.travel/blog/you-found-the-trip-let-airial-handle-the-plan/), [funding](https://benzatine.com/news-room/airial-travel-secures-3-million-to-transform-social-media-travel-inspiration-into-custom-itineraries))
- **Weaknesses:** Single-player and generative: it turns *one* video into *one* AI trip, not *many friends' saves* into a *group decision*. There is no meaningful iOS App Store presence (a search for "airial" returned no travel app). Reviews are too few to cite.

### 1.4 Big platforms

#### Google Maps / Google Travel
- **Saved and collaborative lists:** Lists can have collaborators, and since Nov 2023 you can **create a collaborative list straight from a shared place and vote with emoji reactions** ("hearts or thumbs down") to pick activities. ([TechCrunch 2023](https://techcrunch.com/2023/11/15/google-maps-gets-more-social-feature-help-you-collaborate-with-friends))
- **Screenshot → list (Gemini):** Announced Mar 2025 and rolled out on US iOS in May 2025. Maps scans screenshots in your camera roll (including social posts and Shorts), pulls out the places and builds a reviewable list you can share. Opt-in and needs photo access. ([9to5Google](https://9to5google.com/2025/03/27/google-maps-gemini-screenshots/), [iPhone in Canada](https://www.iphoneincanada.ca/2025/05/08/google-maps-gemini-ai-screenshots-into-locations/))
- **Ask Maps (Mar 2026):** Gemini conversational trip planning over 300M places, using your saved places. US and India. ([MacRumors](https://www.macrumors.com/2026/03/12/google-maps-gemini-integration/))
- **Weaknesses:** These features are scattered and hard to find. An XDA article is literally titled "I found a hidden Google Maps feature that makes group trips easier" ([XDA](https://www.xda-developers.com/found-hidden-google-maps-feature-makes-group-trips-easier/)). There's no trip object (dates, RSVPs, who's in), no "why we saved this" (the source video), no comments thread per place, no expenses, and collaborators need Google accounts. Screenshot ingestion is batch-from-camera-roll, not share-to-a-specific-trip.
- **Threat level:** **Highest on the capture and data layer.** Google already has the place graph, hours, prices and reviews that we'll be calling through its own API.

#### TikTok (TikTok GO, Nearby feed, location pages)
- **TikTok GO launched in the US on 12 May 2026.** Book hotels, attractions and tours inside TikTok from videos, search and **location pages**, with Booking.com, Expedia, Viator, GetYourGuide, Tiqets and Trip.com. Creators earn commission. ([TikTok Newsroom](https://newsroom.tiktok.com/introducing-tiktok-go?lang=en), [TechTimes](https://www.techtimes.com/articles/316614/20260514/tiktok-launches-tiktok-go-turn-travel-videos-instant-bookings.htm))
- TikTok is building a global POI database (per job listings) and a Nearby/Local feed. ([TikTok Nearby](https://newsroom.tiktok.com/introducing-tiktok-nearby-discover-whats-happening-around-you?lang=en-150))
- The native bookmark still **saves the video, not the place**. "Collections" are folders of videos. ([Triply](https://triply.au/blog/save-places-from-tiktok-travel-videos/))
- **Threat level:** High. A "save this place to a trip with friends" button on location pages would be an obvious next step for GO. TikTok has little group-planning DNA, though.

#### Instagram (Meta)
- **Instagram Map** launched Aug 2025 and was updated Oct 2025. You can browse tagged places by category (restaurants, cafes) and **bookmark locations**. The old Places search tab was being phased out in favor of the Map around May 2026. ([TechCrunch](https://techcrunch.com/2025/08/06/instagram-takes-on-snapchat-with-new-instagram-map), [recentreborn](https://recentreborn.com/blog/the-instagram-places-tab-is-gone-what-happened-and-how-to-get-it-back))
- **Threat:** Medium. Instagram has group DMs plus place bookmarks, so a "shared collection for a trip" would be a small step. Collaborative Collections already exist for posts.

#### Pinterest
- **Place Pins / map boards** date back to 2013. The Oct 2025 "AI-powered boards" are aimed at fashion and shopping. ([TechCrunch](https://techcrunch.com/2025/10/27/pinterest-experiments-with-new-ai-powered-personalized-boards/), [VentureBeat](https://venturebeat.com/ai/pinterest-place-pins))
- **Threat:** Low to medium. Group boards exist, but there's no trip or logistics focus.

#### Apple (Messages polls, Apple Invites, Maps)
- **iOS 26 Messages polls** (announced WWDC Jun 2025). Native polls in group chats, and **Apple Intelligence suggests a poll** when someone asks "what should we eat?" iMessage only, and everyone needs iOS 26. ([AppleInsider](https://appleinsider.com/articles/25/06/16/how-polls-in-ios-26-messages-app-makes-group-planning-easier), [TechCrunch](https://techcrunch.com/2025/06/09/apple-is-bringing-polls-to-imessage/))
- **Apple Invites** (Feb 2025). An iCloud+ host app. **Guests RSVP on the web with no app or Apple account needed.** Shared albums and playlists. Updated again 30 Sep 2026. ([Apple Newsroom](https://www.apple.com/newsroom/2025/02/introducing-apple-invites-a-new-app-that-brings-people-together/), [MacRumors](https://www.macrumors.com/2026/09/30/apple-invites-app-three-new-features/))
- **Threat:** High for the iMessage-extension phase. Simple "where should we eat" votes will happen in native polls.

#### OpenAI (ChatGPT group chats)
- **Group chats launched globally Nov 2025** (up to 20 people) on Free, Go, Plus and Pro. OpenAI explicitly pitches "plan a weekend trip with friends… compare destinations, build an itinerary, packing list." ([TechCrunch](https://www.techcrunch.com/2025/11/20/chatgpt-launches-group-chats-globally/), [TechRadar](https://www.techradar.com/ai-platforms-assistants/chatgpt/chatgpt-enters-the-group-chat-globally))
- **Threat:** Medium to high for "AI plans the trip." It's weak on structured state (a list of places with votes, maps and money), and every invitee needs a ChatGPT account.

### 1.5 Model benchmarks (not travel competitors)

#### Partiful (invite model)
- **How it works:** A link-based event page sent over iMessage, IG or WhatsApp. **Guests RSVP with phone number + SMS code. No app install.** It has text blasts, polls, Venmo/Cash App/PayPal payment collection, photo albums and co-hosts. Core invites stay free, and money comes from add-ons such as Group Order with Instacart. ([Wikipedia](https://en.wikipedia.org/wiki/Partiful), [Sacra](https://sacra.com/chat/h/ca6c792b-7d6d-42a9-ae5f-0970a819c66c/))
- **Traction:** 259K iOS ratings at 4.95. Google's Best App of 2024. ([TechCrunch](https://techcrunch.com/2024/11/18/partiful-is-googles-best-app-of-2024))
- **Complaints worth learning from:** *"You get an iOS notification and asked you to decide instantly. There's no email that you can forward to your spouse"* (App Store, Oct 2024). Invite texts end up in spam folders. It asks for full calendar access. Katja Grace's widely shared "Things I hate about Partiful" lists SMS-only notifications, **no private message to the host** (every question goes to the whole group), guilt-trip emoji on declines, details hidden until you RSVP, and a yes/no-only RSVP. ([App Store](https://apps.apple.com/us/app/partiful-invites/id1662982304?see-all=reviews), [Katja Grace](https://worldspiritsockpuppet.com/2024/05/09/things-i-hate-about-partiful.html))
- **Implication:** Copy the zero-install link and phone-OTP flow. Avoid notification spam, offer an email/digest option, and allow "maybe" and nuanced votes.

#### ReciMe (capture model)
- **How it works:** Share sheet from TikTok or IG → AI pulls the recipe from the caption, then the **audio transcript**, then **finds the original website**. Also a Chrome extension, photo and handwritten-card import. ([ReciMe help](https://recime.app/help/en/articles/11661452-import-from-tiktok))
- **Pricing:** Free with **5 imports per week**. Premium **$59.99/yr**. ([recipeone](https://www.recipeone.app/blog/is-recime-app-free))
- **Traction:** **302K ratings at 4.79.** This proves that share-sheet AI capture from short video can reach mass adoption.
- **Complaints:** *"sometimes URL detection pops up and the orange button to paste is missing"*. *"It will often say there wasn't a recipe in the caption so it used the AI."* Intermittent import failures. ([App Store](https://apps.apple.com/us/app/recime-recipes-meal-planner/id1593779280?see-all=reviews))
- **Implication:** Copy the fallback chain (caption → on-screen text/OCR → audio transcript → web search for the original source). Meter AI capture for free users the way ReciMe does (5 per week), *but* for a group product, meter per trip and not per person.

### 1.6 Expense splitting

#### Splitwise
- **What it does:** Group IOUs, debt simplification and payments. Pro adds receipt scanning with itemization, currency conversion, charts and search.
- **Pricing:** Free is capped at **about 3–4 expenses per day** and shows ads. **Pro $4.99/mo or about $40/yr, per person.** ([HippoSplit](https://hipposplit.com/blog/splitwise-review/))
- **Weaknesses:** The rating has dropped to **3.99** (28K). *"they paywalled nearly everything useful"* (Aug 2026). *"I had reached the maximum number of expenses I could input today"*. *"bombards you with (timed) ads for premium."* *"They keep your money in a 'pending' state for days"* (Sep 2025). The daily cap "is exactly where it hurts most" on trips, per summaries of Reddit discussion. Receipt OCR "can struggle with long or faded receipts." ([App Store reviews](https://apps.apple.com/us/app/splitwise/id458023433?see-all=reviews), [HippoSplit](https://hipposplit.com/blog/splitwise-review/), [tryfix.it](https://tryfix.it.com/what-are-the-downsides-of-splitwise-the-hidden-costs-of-free-splitting/))

#### Tricount (bunq)
- **What it does:** Free, ad-free, unlimited group splitting with multi-currency, photo attachments and a receipt-scan integration. bunq bought it in 2022 and uses it as a funnel for bank customers. 17M users. ([TechCrunch](https://techcrunch.com/2022/05/03/bunq-to-acquire-group-expenses-app-tricount/), [tricount.com](https://tricount.com/))
- **Weaknesses:** **Recent reviews repeatedly report wrong math**: *"the math was not mathing"* (Sep 2026), *"cannot even sum those 2 expenses to the correct amount"* (Aug 2026), *"calculated the expenses for my group SUPER wrong"* (Aug 2025). One review says it *"doesn't work in the USA"* (payments). *"it completely erased all of the data from a weeklong trip"* after an update. The new UI removed CSV/PDF export and per-transaction share visibility. (App Store customer-reviews feed, US, pulled 30 Sep 2026; [App Store](https://apps.apple.com/us/app/tricount-split-settle-bills/id349866256); [TripCount](https://trip-count.com/blog/en/tricount-alternatives-2026/))

#### Settle Up
- **What it does:** Cross-platform group expenses. **Premium $3.99/mo, $19.99/yr, or Group Premium $5.99 up to $149.99 lifetime**, so one purchase covers the whole group. ([settleup.app/premium](https://settleup.app/premium), [App Store](https://apps.apple.com/us/app/settle-up-group-expenses/id737534985))
- **Weaknesses:** *"A bit over-thought… makes it much more complicated"* (2026). Multi-click UI. *"Just suddenly stopped working"* (2024). Receipt photos are Premium only. Smaller user base (1.7K iOS ratings).
- **Implication:** **Group-level pricing** (one person pays and the whole trip is unlocked) is the pricing model users praise most in this category.

#### Venmo Groups (PayPal)
- Shared group expense tracking and settle-up inside Venmo since Nov 2023. ([PayPal Newsroom](https://newsroom.paypal-corp.com/2023-11-14-Introducing-Venmo-Groups))
- **Threat:** Medium for the money feature in the US. Venmo already holds the payment rails and the friend graph.

---

## 2. Synthesis

### 2.1 Gaps in the market (what no one does well)

1. **Capture and decision are split across different products.** Capture apps (Rhyme, Plotline, Tabi, Yaay) are built for one person saving places, with "collaboration" added on as shared lists. Decision apps (Troupe RIP, Let's Jetty, TripSquad, Stamp'd, Plan Harmony) make you type in options by hand. Itinerary apps (Wanderlog, Stippl, Pilot) assume the decisions are already made. **Only Places (launched Jun 2026, no traction yet) combines social capture, voting and no-account links**, and it has no trip or event model and no money features.
2. **The decision layer is weak everywhere.** Wanderlog has no voting, and commenting is thin. Google offers only emoji reactions on lists. Plotline, Rhyme and Tabi have none. Mindtrip's voting exists, but reviewers say "curation is not the same as confident decision-making." Nobody offers a clear "shortlist → booked/decided" status, a nudge for people who haven't voted, or a deadline ("lock dinner picks by Thursday").
3. **Zero-install guest participation is rare.** Partiful and Apple Invites proved the pattern for events. Among trip apps, only Places and TripSquad (both tiny) let guests take part from a web link without an account. Wanderlog, Let's Jetty, Rhyme, Plotline, Splitwise and ChatGPT all need accounts or installs. Rhyme charges each person separately to collaborate.
4. **Per-person paywalls punish groups.** Splitwise ($40/yr per person, 3–4 expenses per day free), Rhyme ($50/yr per person), Wanderlog (offline needs Pro), and Plotline (one free trip). Only Settle Up sells group-level premium, and users like it.
5. **Ideas, the trip and the money don't connect.** No product links "the TikTok that made us go," "the vote," "the reservation" and "the receipt that got split" for the same place. Expense apps don't know the itinerary, and itinerary apps' expense features are basic manual entry.
6. **Receipt-to-split accuracy is unsolved.** Splitwise's OCR struggles with long or faded receipts, and Tricount has a pile of recent "wrong math" reviews. Itemized assignment ("I didn't drink, don't split the wine") is mostly paywalled or missing.
7. **Reliability and performance at scale.** Wanderlog, Mindtrip, Stippl, Plotline and Tabi all have complaints about lag, lost plans or slow imports. Groups make the load heavier, with more items and more editors.
8. **"Remember why" is missing from the decision.** Tabi and Plotline keep the source clip on the pin, but nobody shows it to the *group at decision time* (the clip, who shared it, the creator's "what to order" tip, and the votes, all on one card).

### 2.2 Gaps in each major product

| Product | Biggest gaps vs. our concept |
|---|---|
| **Wanderlog** | No social-video capture. No voting. Weak comments. Account required. Gets slow with large trips. Cluttered UI. Offline and export are paywalled. Billing distrust (Trustpilot 1.9). |
| **TripIt** | Starts at booking, not inspiration. Group sharing is view-only without Pro on both sides. No places or ideas layer. |
| **Troupe** | Appears to be defunct. When it was live: decision-only, with no capture, itinerary or money. |
| **Let's Jetty** | Account wall. No capture. Little visible traction. Organizer-centric survey tool. |
| **Plan Harmony** | Calendar-first. No capture. Negligible traction or reviews. |
| **Pilot** | Booking-funded web tool. Mobile adoption is almost nil (2 iOS ratings). No capture and no real voting. |
| **Stippl** | Crashes and data loss. No capture. Euro multi-city focus. |
| **Polarsteps** | Single traveler. Post-trip journal, not pre-trip decisions ("Travel Together" is on the roadmap). |
| **Rhyme** | Single-player at heart. **Per-person $50/yr for collaboration.** Clunky scheduling. Billing complaints. No voting or money. |
| **Plotline** | Rate-limited, slow AI imports. iOS only. Hard-to-use map. No voting or money. $9.99/mo is seen as too high. |
| **Tabi** | Slow imports. Lists, not trips. No voting or money. |
| **Places** | No trip or date or RSVP model. No money. Link paste instead of a share extension (as of now). Brand new. |
| **Mindtrip** | AI-chat-first. Data loss and lag on mobile. Not optimized for "friends dump TikToks in." Booking-driven incentives. |
| **Layla / Airial** | Single-player generative itineraries. No real collaboration (Layla says so explicitly). Accuracy errors. |
| **Google Maps** | Group features are hidden. No trip object, comment threads, source clip or money. Google account required. |
| **TikTok / Instagram** | They save videos, not places in a group trip. No cross-platform pooling (a TikTok and a Reel can't live in the same list). |
| **Partiful** | Events, not multi-day trips. No idea list or places. SMS spam. No private DM to the host. |
| **Splitwise** | Daily expense cap. Per-person Pro. Ads. Rating is falling. Payment delays. |
| **Tricount** | Wrong-math complaints. Weak in the US. Lost data on update. Removed exports. |
| **Settle Up** | Over-complex UI. Small base. Receipt photos need Premium. |

### 2.3 Threats

1. **Google Maps (highest).** It already has screenshot → list via Gemini, collaborative lists with emoji voting, Ask Maps trip planning, and the place database we'd license. A "Trips" object with share-sheet ingestion and a web link would cover about 60% of our core. Mitigations: be the *cross-platform group object* (not a Google account silo), keep the source clip and comments on each card, include money, and ship faster with a group-first design.
2. **TikTok GO (high).** It launched in the US in May 2026 with location pages and booking partners. "Save place to a trip" plus "invite friends" is an obvious next step for GO, and it would cut out third-party capture. Mitigation: be **cross-source** (TikTok + IG + YouTube + blogs + screenshots + Google links in one list). TikTok won't ingest Reels.
3. **Apple (high for the iMessage phase).** iOS 26 Messages polls with AI-suggested polls, Apple Invites (web RSVP with no account), and Apple Maps Guides. A lightweight "where should we eat" vote will live natively in iMessage. Mitigation: the iMessage extension should *post rich cards from the trip* (place + clip + vote state) rather than compete with native polls.
4. **Mindtrip (high, among startups).** $22.5M raised, already has group chat and voting plus "start anywhere" ingestion. One share extension away from our pitch.
5. **Places, Rhyme and Plotline (medium-high).** Fast-moving capture startups. Places already has our invite and voting pattern, Rhyme has 5K+ ratings of momentum, and Plotline has creator-tip extraction. Any of them could add trips with dates plus voting within a quarter.
6. **ChatGPT group chats (medium).** "Plan a weekend trip with friends" is an explicit launch use case, and an itinerary is a prompt away. Weak at persistent structured state, maps and money, and requires accounts.
7. **Instagram (medium).** Map and place bookmarks plus collaborative collections plus group DMs.
8. **Venmo Groups (medium, money feature).** Owns US payment rails. Our splitting has to plug into Venmo, Cash App and PayPal links instead of competing with them.
9. **Commoditization of extraction (structural).** At least 15 apps do link → places with the same LLM plus Places API approach. Extraction alone is not a moat, and per-import AI and Places API costs are real (Plotline's rate limits, ReciMe's 5-per-week free cap).
10. **Platform dependency.** TikTok and IG can change link formats, block scraping, or limit oEmbed. Google Places API pricing and terms (for example, limits on caching place data) shape what we can store.

### 2.4 Closest analog to watch: Places (places.is)
It has social link → pins, voting, comments, real-time sync, **no-account link sharing**, web plus iOS plus Android, and is free. It launched on iOS in June 2026 with no ratings yet. We should set up an account on it, test it end to end, and track its releases. **Our differentiation from Places has to be trip-and-group-native** (dates, RSVP and who's in, decision deadlines, itinerary handoff, money) and a **share-sheet-first capture** flow instead of copy-paste.

### 2.5 Recommended differentiators

**Core position:** *"The group chat for trip ideas, minus the chaos. Everyone drops TikToks and Reels in; the group decides; the trip (and the tab) takes care of itself."* Own the **decision + group** layer and treat capture as table stakes done unusually well.

1. **Group-first capture, not personal saving.** Each share is attributed ("Maya added this"), lands in a specific trip's inbox, keeps the clip playable on the card, and **merges duplicates** when three friends share the same viral spot ("3 people shared this" is a strong signal). Accept TikTok, Reels, YouTube Shorts, screenshots, Google/Apple Maps links and blogs in *one* list. That cross-source pooling is something TikTok, Instagram and Google won't build for each other.
2. **Extraction quality is part of the product.** Use ReciMe's fallback chain (caption → on-screen OCR → audio transcript → web/Places search). Handle **multi-place videos** ("8 best bars in CDMX" → 8 candidate cards the group can bulk-accept). Show a confidence chip and one-tap "wrong place? fix." Be **fast**: slow imports are the #1 complaint for Plotline and Tabi. Process asynchronously and show a placeholder card instantly.
3. **A real decision engine, not just likes.** Use 👍/👎/"must-do"/"skip" or ranked votes, a **vote deadline**, nudges to people who haven't voted (not SMS spam), filters by "fits our dates / open when we're there / price level," and a clear state machine: *Idea → Shortlisted → Decided → Booked*. Each card gets a comment thread (Partiful users complain they can't ask a private question, so allow DMing the organizer). This is the gap Wanderlog, Google and every capture app leave open.
4. **Partiful-grade zero-install guests, done more politely.** A web link with phone OTP, and voting and commenting before any account. Offer an email or daily-digest channel and quiet hours, because SMS spam and pressure are Partiful's top complaints. Allow "maybe / I'm flexible." This is a structural advantage over Wanderlog, Let's Jetty, Rhyme and ChatGPT.
5. **Price per trip or group, never per person.** Settle Up's group premium is well liked, while Rhyme's and Splitwise's per-person paywalls are among the most hated choices in this space. Candidate model: free core (capture, vote, unlimited guests). The **trip organizer pays once per trip** (for example $5–10) or yearly for unlimited trips, unlocking offline mode, export, unlimited AI extraction and itemized receipt splitting. Do **not** paywall offline access, which is Wanderlog's #1 complaint.
6. **Money tied to places.** A receipt photo shared to the trip is auto-matched to the decided place ("Dinner @ Contramar, Fri"). Do itemized OCR splitting with "I didn't have the wine" taps. Use **unlimited free expenses** (to beat Splitwise's daily cap) and settle-up deep links to Venmo, Cash App and PayPal, rather than holding funds yourself. Splitwise's "pending" complaints are a warning. Publish a transparent per-expense breakdown so nobody has to ask "what for?" (a Tricount complaint). **Calculation correctness is a feature:** Tricount's reviews show that one wrong total destroys trust, so unit-test the split math hard and show the math on screen.
7. **Light itinerary handoff, not another Wanderlog.** Once ideas are decided, auto-group them by day and neighborhood, and export to Google Maps, Apple Maps and calendar **for free**. Add a "Today" view for the trip itself (Mindtrip users asked for this). Keep the UI simple. Wanderlog's clutter is a repeated complaint, so we win by doing *less*.
8. **Performance and trust as brand values.** Fast with 200+ ideas, no lost data (Mindtrip, Stippl and Tricount all have data-loss reviews), honest trials with no surprise annual charges (Wanderlog, Rhyme and Layla all have billing complaints), and clear privacy settings (no Gmail scanning by default).
9. **iMessage extension that complements Apple's polls instead of fighting them.** Post rich trip cards (clip thumbnail + place + live vote tally) into the group chat, with vote buttons that deep-link back. Apple's native polls can't carry a map, place data or a source video.
10. **Wedge segment:** Start with friend groups of 4–12 people on short city trips and bachelor/bachelorette weekends. That's where TikTok-driven food and bar discovery is densest and where Batch shows demand (3M+ planners) while having booking-quality complaints. Revenue later can come from affiliate bookings (reservations, tours) once the group has decided, the same model that Pilot, Mindtrip, Batch and TikTok GO use. Monetize *after* the decision so it never biases the decision.

---

## 3. Source index (primary links)

- Apple iTunes Search/Lookup API (all rating counts): `https://itunes.apple.com/search?…`, `https://itunes.apple.com/lookup?id=…` (queried 30 Sep 2026)
- Wanderlog: [site](https://wanderlog.com/) · [App Store reviews](https://apps.apple.com/us/app/wanderlog/id1476732439?see-all=reviews) · [Trustpilot](https://www.trustpilot.com/review/wanderlog.com) · [Tripstone review](https://tripstone.app/blog/wanderlog-review) · [Pro pricing](https://tripstone.app/blog/wanderlog-pro-cost) · [aitooldiscovery Reddit summary](https://www.aitooldiscovery.com/guides/wanderlog-reddit)
- TripIt: [App Store reviews](https://apps.apple.com/us/app/tripit-travel-planner/id311035142?see-all=reviews) · [Pilot's review](https://www.pilotplans.com/blog/review-of-tripit) · [pricing](https://monkeyeatingmango.com/blog/tripit-pricing-2026/)
- Troupe: [JetBlue IR launch](https://ir.jetblue.com/news/news-details/2022/nbspJetBlue-Travel-Products-Launches-New-Travel-App-Troupe-09-21-2022/default.aspx) · [Skift](https://skift.com/2022/09/21/jetblue-wants-to-make-group-travel-easier-with-new-app/) · [TripProf comparison](https://tripprof.com/en/blog/best-group-travel-planning-apps/)
- Let's Jetty: [FAQ](https://www.letsjetty.com/faqs) · [Kickstarter](https://www.kickstarter.com/projects/letsjetty/jetty-the-travel-planning-app-your-crew-will-actually-use) · [launch PR](https://www.accessnewswire.com/newsroom/en/business-and-professional-services/let%E2%80%99s-jetty-introduces-its-collaborative-app-for-stress-free-grou-777701)
- Plan Harmony: [site](https://www.planharmony.com/) · [2.0 blog](https://www.planharmony.com/blog/plan-harmony-2/)
- Pilot: [site](https://www.pilotplans.com/) · [App Store](https://apps.apple.com/us/app/pilot-group-trip-planner/id6446177269?see-all=reviews)
- Stippl: [App Store reviews](https://apps.apple.com/us/app/stippl-trip-travel-planner/id6443617088?see-all=reviews) · [iTechGuides](https://www.itechguides.com/products/stippl/)
- Polarsteps: [App Store reviews](https://apps.apple.com/us/app/polarsteps/id947925763?see-all=reviews) · [2026 review](https://taleswander.blogspot.com/2026/05/polarsteps-app-review-2026-best-travel.html)
- Places: [site](https://www.places.is/) · [vs Wanderlog](https://www.places.is/vs/wanderlog) · [Google Play](https://play.google.com/store/apps/details?id=is.places.app)
- Rhyme: [App Store](https://apps.apple.com/us/app/rhyme-itinerary-planner/id6748781672?see-all=reviews)
- Plotline: [site](https://getplotline.app/) · [FAQ](https://getplotline.app/faq) · [App Store reviews](https://apps.apple.com/us/app/plotline-travel-map-planner/id6759443026?see-all=reviews)
- Tabi: [App Store reviews](https://apps.apple.com/us/app/tabi-turn-posts-to-places/id6751395035?see-all=reviews)
- Capture-niche roundups (competitor-authored): [Dream Trip](https://www.thedreamtrip.app/blog/best-apps-save-places-from-tiktok-instagram-2026) · [Triply](https://triply.au/blog/best-apps-save-travel-places-instagram-tiktok/) · [DocentPro](https://docentpro.com/blog/best-apps-to-save-places-from-tiktok-instagram-youtube) · [Plotline](https://getplotline.app/blog/best-apps-save-locations-tiktok-instagram)
- Mindtrip: [App Store reviews](https://apps.apple.com/us/app/mindtrip-ai-travel-companion/id6503107567?see-all=reviews) · [Product Hunt](https://www.producthunt.com/products/mindtrip/reviews) · [SearchSpot review](https://www.searchspot.ai/blog/mindtrip-ai-review-2026)
- Layla: [Trustpilot](https://www.trustpilot.com/review/layla.ai) · [Stardrift review](https://stardrift.ai/resources/layla-ai) · [aitravel.tools](https://aitravel.tools/layla-ai-review/)
- Airial: [blog](https://airial.travel/blog/you-found-the-trip-let-airial-handle-the-plan/) · [funding](https://benzatine.com/news-room/airial-travel-secures-3-million-to-transform-social-media-travel-inspiration-into-custom-itineraries)
- Google: [Screenshots→Maps (9to5Google)](https://9to5google.com/2025/03/27/google-maps-gemini-screenshots/) · [rollout](https://www.iphoneincanada.ca/2025/05/08/google-maps-gemini-ai-screenshots-into-locations/) · [collaborative lists + emoji voting (TechCrunch)](https://techcrunch.com/2023/11/15/google-maps-gets-more-social-feature-help-you-collaborate-with-friends) · [Ask Maps (MacRumors)](https://www.macrumors.com/2026/03/12/google-maps-gemini-integration/) · [XDA hidden feature](https://www.xda-developers.com/found-hidden-google-maps-feature-makes-group-trips-easier/)
- TikTok: [TikTok GO newsroom](https://newsroom.tiktok.com/introducing-tiktok-go?lang=en) · [TechTimes](https://www.techtimes.com/articles/316614/20260514/tiktok-launches-tiktok-go-turn-travel-videos-instant-bookings.htm) · [Nearby](https://newsroom.tiktok.com/introducing-tiktok-nearby-discover-whats-happening-around-you?lang=en-150)
- Instagram: [Instagram Map (TechCrunch)](https://techcrunch.com/2025/08/06/instagram-takes-on-snapchat-with-new-instagram-map) · [Places tab removal](https://recentreborn.com/blog/the-instagram-places-tab-is-gone-what-happened-and-how-to-get-it-back)
- Pinterest: [AI boards (TechCrunch)](https://techcrunch.com/2025/10/27/pinterest-experiments-with-new-ai-powered-personalized-boards/) · [Place Pins](https://venturebeat.com/ai/pinterest-place-pins)
- Apple: [Messages polls (AppleInsider)](https://appleinsider.com/articles/25/06/16/how-polls-in-ios-26-messages-app-makes-group-planning-easier) · [Apple Invites newsroom](https://www.apple.com/newsroom/2025/02/introducing-apple-invites-a-new-app-that-brings-people-together/) · [Invites update Sep 2026](https://www.macrumors.com/2026/09/30/apple-invites-app-three-new-features/)
- OpenAI: [ChatGPT group chats (TechCrunch)](https://www.techcrunch.com/2025/11/20/chatgpt-launches-group-chats-globally/)
- Partiful: [Wikipedia](https://en.wikipedia.org/wiki/Partiful) · [Sacra growth analysis](https://sacra.com/chat/h/ca6c792b-7d6d-42a9-ae5f-0970a819c66c/) · [App Store reviews](https://apps.apple.com/us/app/partiful-invites/id1662982304?see-all=reviews) · [Katja Grace critique](https://worldspiritsockpuppet.com/2024/05/09/things-i-hate-about-partiful.html) · [Google Best App 2024](https://techcrunch.com/2024/11/18/partiful-is-googles-best-app-of-2024)
- ReciMe: [TikTok import help](https://recime.app/help/en/articles/11661452-import-from-tiktok) · [App Store reviews](https://apps.apple.com/us/app/recime-recipes-meal-planner/id1593779280?see-all=reviews) · [pricing](https://www.recipeone.app/blog/is-recime-app-free)
- Splitwise: [App Store reviews](https://apps.apple.com/us/app/splitwise/id458023433?see-all=reviews) · [HippoSplit review](https://hipposplit.com/blog/splitwise-review/) · [OCR limits](https://tryfix.it.com/what-are-the-downsides-of-splitwise-the-hidden-costs-of-free-splitting/)
- Tricount: [App Store](https://apps.apple.com/us/app/tricount-split-settle-bills/id349866256) · [bunq acquisition](https://techcrunch.com/2022/05/03/bunq-to-acquire-group-expenses-app-tricount/) · [alternatives/feature removals](https://trip-count.com/blog/en/tricount-alternatives-2026/)
- Settle Up: [Premium pricing](https://settleup.app/premium) · [App Store reviews](https://apps.apple.com/us/app/settle-up-group-expenses/id737534985?see-all=reviews)
- Venmo Groups: [PayPal newsroom](https://newsroom.paypal-corp.com/2023-11-14-Introducing-Venmo-Groups)
- Other entrants: [Frienzy](https://apps.apple.com/us/app/frienzy-group-travel-planner/id6446246578) · [Batch](https://apps.apple.com/us/app/batch-lets-party/id1433495524?see-all=reviews) · [TripSquad](https://apps.apple.com/app/id6762568582) · [Stamp'd](https://apps.apple.com/app/stampd/id6760239126) · [JoySpot](https://apps.apple.com/us/app/joyspot-ai-import-your-spots/id6745341190) · [Yaay](https://apps.apple.com/app/id6742421480)

---

## 4. Multi-city trips

*Added 1 Oct 2026. Goal: find out how competitors model trips with two or more cities, and with partial or sub-group attendance. Prompted by user feedback that Wanderlog's multi-city planning is clunky, overly complex, or missing. Same caveats as section 0: Reddit was not reachable, so complaints come from App Store reviews, travel forums and review sites. Points marked "(verify hands-on)" are inferred from public trip pages and docs and should be confirmed in the product itself.*

### 4.1 The three ways apps model a multi-city trip

| Model | How it works | Who uses it | Main failure mode |
|---|---|---|---|
| **A. Separate trips per city** | Each city is its own trip or list. The user stitches them together mentally. | Wanderlog's *own guidance*, Google Maps (one list per city), TripIt (auto-splits legs into separate trips) | Ideas, reservations and collaborators get spread across several objects. Data can't be moved between trips. No whole-trip view. |
| **B. One trip, cities implied by days** | One trip with one date range. A city "exists" only because Days 2–3 contain Rome pins and Day 4 contains Florence pins. | Wanderlog (single-trip approach), Mindtrip, Plotline, Rhyme | Before you schedule anything, the idea list is a flat pile. Nothing records "we're in Florence Apr 4–6". Moving a city's dates means dragging every item. |
| **C. One trip made of explicit stops/legs** | An ordered list of stops, each with nights or dates, connected by transport legs. Activities sit under a stop. | Stippl, Polarsteps (steps + "traveled by"), Rome2Rio Trip Planner (legs only), Stamp'd ("nights-per-city breakdowns") | Better structure, but it is built for one traveler or one fixed route. Weak at the idea and decision stage. Has stability problems (Stippl). |

**No product combines Model C with a group idea inbox and voting.** No mainstream product models *who* is present on each leg.

### 4.2 Product-by-product

#### Wanderlog
- **Model.** You can name several destinations when creating a trip, and a YouTube tutorial walks through "Add destination" ([YouTube](https://www.youtube.com/watch?v=2ELG8H7312M)). But **Wanderlog's own blog says: "If you are traveling to multiple cities, you can create separate trip plans for each"** ([Wanderlog blog](https://wanderlog.com/blog/2024/10/14/is-there-a-free-trip-planner/)). Its help-center results repeat this. In practice users pick between Model A (separate trips) and Model B (one trip where days carry the city).
- **Itinerary and cities.** Public multi-city trips show cities separated **only by day sections**. In a 9-day Rome/Florence/Pisa/Venice/Naples trip, Day 4 "transitions to Florence", hotels are listed as ordinary places inside each day, and the Florence→Venice train appears only as auto-calculated travel time ("2 hr 37 min · 174 mi") between two pins ([public trip](https://wanderlog.com/view/csyfovlnlj/italy-in-9-days-rome-florence-pisa-venice-naples--pompeii)). There is no first-class "Florence, Apr 4–6" object with its own idea list (verify hands-on).
- **Sorting ideas into cities.** Unscheduled ideas live in "Places to visit" and other user-made lists. You add a place to "the most recently edited list or day" and tap "Change" to reassign it ([help: add from guide](https://help.wanderlog.com/hc/en-us/articles/5159511810843-Add-a-place-from-a-guide-to-trip-plan)). Nothing sorts ideas by city automatically. A Rick Steves forum user worked around this by "separated the trip into Segments (Iceland, Barcelona, Paris and Colmar/Belgium) so I could focus better", using hand-made lists and color layers ([Rick Steves forum](https://community.ricksteves.com/travel-forum/general-europe/trial-of-wanderlog-and-tripit-inspired-by-trip-research-post)).
- **Map.** Shows every pin in the trip. You filter by day with the layers button ([Tripstone](https://tripstone.app/blog/wanderlog-review)), not by city.
- **Travel between cities.** Flights, trains and car rentals go in the Reservations section (typed in or forwarded by email). Travel time between consecutive pins is calculated. Multi-stop route optimization is Pro-only ([Vacation Planner](https://blog.vacation-planner.app/blog/best-apps-multi-city-vacations/)).
- **Dates per leg.** One trip-level date range. The city for each day is implicit.
- **Complaints relevant to multi-city:**
  - Same Rick Steves forum post: you *"can't move reservation data between trips"*, and the per-trip email-forwarding address is *"hard to find"*. This hurts most when a trip is split into one plan per city.
  - Long trips slow the app down: *"lags or flat out refuses to work if you've added a lot of stops"* ([App Store](https://apps.apple.com/us/app/wanderlog/id1476732439?see-all=reviews)). Reviewers advise staying under about 100 stops or splitting into smaller trips ([Tripstone](https://tripstone.app/blog/wanderlog-review)), which pushes users back to the fragmented Model A.
  - Paywall on long routes: *"I was so excited to find this for an upcoming trip with lots of stops… I have to pay for the map usage. 50 bucks for a once in a lifetime trip is so not worth it"* (Google Play, via [Wandrly](https://wandrly.app/reviews/wanderlog/)).
  - Dense UI: a trip opens with "itinerary, map, reservations, budget, checklists, and more" ([aitooldiscovery](https://www.aitooldiscovery.com/guides/wanderlog-reddit)). Each extra city multiplies this.
- **Sub-groups.** No per-person attendance on days or items. Everyone sees and edits one plan. Expense splitting is manual.

#### TripIt
- **Model.** Built from bookings. **When a trip has several legs, TripIt often creates a new trip for each leg, and you tick a box to merge them.** "A trip must have a trip item… trips with no trip items (just dates) will delete when being merged" ([TripIt help: merge trips](https://help.tripit.com/en/support/solutions/articles/103000063429-merge-trips), [TripIt blog](https://www.tripit.com/web/blog/default/merge-multiple-trip-itineraries-into-one)).
- **Strengths.** Excellent chronological view of flights, trains and hotels across legs. A forum user said plans are *"easy to move plans between trips"* and flights can be applied *"to multiple trips"* ([Rick Steves forum](https://community.ricksteves.com/travel-forum/general-europe/trial-of-wanderlog-and-tripit-inspired-by-trip-research-post)).
- **Weaknesses.** It has no ideas, so it does not "plan the trip… organizes bookings you have already made" ([Vacation Planner](https://blog.vacation-planner.app/blog/best-apps-multi-city-vacations/)). Dates are required upfront. There's no merging across travelers: the closest option is sharing your trip with edit rights ([search summary](https://quartzmountain.org/article/how-to-merge-one-travelers-tripit-with-another-traveler)). Each traveler's TripIt is built from their own bookings, so a friend who joins only the Paris leg simply has a different trip. That's accidental sub-group support with no shared plan.

#### Stippl (the best explicit route model among planners)
- **Model C.** Unlimited stops, "add your destinations in any order and Stippl maps your full route automatically". An interactive route map with "every stop pinned and connected", drag to reorder, and calculated distances and travel times. Flights, trains, buses, cars and ferries appear in the timeline, with special handling for overnight transport. Nights per destination are tracked, and AI suggests destinations *and nights per destination* ([Stippl itinerary planner](https://www.stippl.io/itinerary-planner), [Stippl](https://www.stippl.io/), [mwm.ai](https://mwm.ai/apps/stippl-travel-planner/6443617088)).
- **Weaknesses come from the multi-stop features themselves** ([App Store reviews](https://apps.apple.com/us/app/stippl-trip-travel-planner/id6443617088?see-all=reviews)):
  - *"Crashes every time I try to add another destination"* (Feb 2025).
  - *"destinations remove themselves and won't reappear"* (Jan 2025).
  - Flight imports break on overnight or long layovers.
  - Limited date customization for multi-day transport.
  - Dates save to the wrong days.
  - "Everyone can view, suggest and edit", but nothing is segmented by who is on which leg.

#### Polarsteps
- **Model C, map-first.** Plan by adding "steps" along a route. Click the line between two steps to choose how you "traveled by" (car, bus, train, plane, bike, walk). Since summer 2025, an AI builds a multi-destination itinerary "directly on the map", using Claude ([Polarsteps release](https://www.polarsteps.com/news/polarsteps-summer-2025-release-is-here), [Matt's Next Steps tutorial](https://mattsnextsteps.com/how-to-use-polarsteps-ultimate-polarsteps-tutorial/)).
- **Weaknesses.** A single traveler only. A reviewer asked for collaboration and the developer said "Travel Together" is on the roadmap ([App Store](https://apps.apple.com/us/app/polarsteps/id947925763?see-all=reviews)). GPS "teleportations" corrupt the route. It's strong for the *shape* of a route and weak for the day-level idea lists inside each stop.

#### Rome2Rio (Tripadvisor-owned) — the specialist for travel between cities
- **Trip Planner** (web only, not in the native apps): "Add destination" for as many stops as you like. It generates and compares options for **every leg** (train, bus, flight, ferry, rideshare, drive) with estimated durations and prices. Save (free account), reorder, swap a leg, and "Share trip" by link ([Rome2Rio blog](https://www.rome2rio.com/blog/2025/12/05/how-to-use-rome2rio-trip-planner/), [help](https://help.rome2rio.com/en/support/solutions/articles/22000280937-trip-planner)).
- **Weaknesses.** "A complement, not a planner… no itinerary, no persistence, no day planning" ([Vacation Planner](https://blog.vacation-planner.app/blog/best-apps-multi-city-vacations/)). Per-leg dates and nights aren't documented. No places, ideas or group features.

#### Inspirock
- It was the best-known auto-builder for multi-city itineraries (nights per city plus a transport plan). **Klarna acquired it in Oct 2021 and the standalone planner has been discontinued** ([LinkedIn](https://www.linkedin.com/company/inspirock), [Trustpilot](https://www.trustpilot.com/review/inspirock.com)). It's no longer a live competitor, but it shows that "pick cities → auto-allocate nights → generate legs" can be built and that users understand it.

#### Mindtrip
- **Model B, created by AI chat.** Ask for a multi-city trip and the AI builds it in conversation. "Start Anywhere" accepts photos, screenshots, PDFs and links. You can upload confirmations and invite others ([TravelAwaits](https://www.travelawaits.com/3005771/inside-new-travel-ai-mindtrip/), [Stardrift](https://stardrift.ai/resources/best-ai-trip-planner-multi-city)).
- **Weaknesses.** It "leans toward inspiration and discovery… may feel less structured for travelers who need granular itinerary editing across multiple stops" and lacks a workflow for "planning around fixed bookings" ([Stardrift](https://stardrift.ai/resources/best-ai-trip-planner-multi-city)). App Store reviews mention plans being lost and the app "randomly refreshes and messes up the order" ([App Store](https://apps.apple.com/us/app/mindtrip-ai-travel-companion/id6503107567?see-all=reviews)). That gets worse the more stops a plan has.

#### Places (places.is)
- **Model A/B hybrid on one map.** All spots go on one shared map "sorted into lists and color-coded", grouped "however you think" ([places.is](https://www.places.is/)). Users can make one list or color per city, by hand. **There are no dates, itinerary days or inter-city legs on the site.** It's a group *idea* board, not a route.

#### Rhyme
- **Places sorted automatically by geography, which is close to what we want but buggy.** Saves are grouped by location, and the AI builds a "logical route" over your trip length. **Complaint:** *"Why does 'Utah' not encompass all the cities within the state? It's much harder to look back through my saved locations"*. Saves end up scattered across state, city and town levels. Also: *"It is cumbersome to move things around on your schedule or even to the 'unplanned area'"* ([App Store reviews](https://apps.apple.com/us/app/rhyme-itinerary-planner/id6748781672?see-all=reviews)). Collaborators each pay $50/yr, so it isn't really a group product.

#### Plotline
- Browse saved spots "by city", and the auto-itinerary gives day-by-day plans ([App Store](https://apps.apple.com/us/app/plotline-travel-map-planner/id6759443026)). There's no documented stop/leg model or transport between cities.

#### Google Maps lists
- **Model A by convention.** Guides recommend "one list per city". But "there isn't a way to filter your lists by city", and a list is "a chronological column of names with no filters, no categories and no real colours". Lists cap at about 500 places. Heavy users export through Takeout to My Maps layers ([placefultrips](https://placefultrips.com/guides/organize-google-maps-saved-places.html), [Wandrly](https://www.wandrly.app/blog/google-maps-saved-places)). Google Maps has "no trip-level itinerary, no cross-city budget, no route sequencing for a vacation" ([Vacation Planner](https://blog.vacation-planner.app/blog/best-apps-multi-city-vacations/)). The Gemini screenshot→list feature makes **one list from your camera roll** and does not split it by city.

### 4.3 Sub-groups and partial attendance (people joining some legs, or splitting up)

This is the least-served part of the market:
- **Wanderlog, Stippl, Mindtrip, Places, Plotline, Rhyme:** one shared plan where everyone sees everything. There's no attendance per day, leg or item, so expenses can't be split automatically by attendance.
- **TripIt:** each traveler's trip is built from their own bookings, so partial attendance shows up only as *different trips*, with no shared group plan.
- **Frienzy:** you can "see everyone's plans, when everyone is arriving and departing", which covers arrivals and departures only ([Airalo](https://www.airalo.com/blog/best-group-travel-apps), [App Store](https://apps.apple.com/us/app/frienzy-group-travel-planner/id6446246578)).
- **Wayfind** (a web/PWA app with no App Store listing yet, free): "the group can split into subgroups that plan their own activities." It has a logistics board for "flights, lodging, arrival and departure times, and rooms", household RSVPs, and minimum headcounts that auto-confirm an activity. Its own guide notes that most "single-itinerary trip apps assume everyone does everything together, which is exactly what does not happen" ([Wayfind guide](https://www.getwayfind.com/guides/best-group-trip-planner-apps.html); competitor-authored).
- **AvoSquado:** "group-aware expense splitting based on who attends each part of the trip, not blanket-split across everyone" ([AvoSquado](https://www.avosquado.app/blog/best-group-travel-planning-apps-2026-complete-comparison); competitor-authored).
- **Splitwise, Tricount, Settle Up:** support splitting among a subset of people per expense, but someone has to set it by hand every time. They don't know who was in which city.

These two small apps are the only evidence that the problem is recognized, and neither has visible traction.

### 4.4 What users actually need (synthesis)

1. **Ideas need a home city before they need a day.** Every capture-first app (and Wanderlog's lists) leaves unscheduled ideas in one flat pile until someone drags them into days. In a group, ideas pour in weeks before the schedule exists. Sorting by city is the first organization people need, and only Rhyme attempts it automatically (with hierarchy bugs).
2. **Legs need their own dates, and they should be flexible.** Wanderlog has one trip-level range, with cities implied by days. Stippl and Polarsteps have explicit nights per stop. In a group, "how many nights in Lisbon vs. Porto" is itself a decision to vote on, and no app lets the group vote on it.
3. **Travel between cities is a separate kind of planning.** Rome2Rio is the reference (compare options per leg, see duration and price). Planners show it only as a reservation or a time calculation between pins.
4. **Splitting a trip into separate trips is a workaround, not a feature.** It's caused by performance limits (Wanderlog lag) and missing structure. It costs users data portability ("can't move reservation data between trips").
5. **Groups don't move as one block.** People arrive late, leave early, skip a city, or split for an afternoon. Only tiny web apps model this, and it affects voting (who gets a vote on Porto dinners?), notifications, and money.

### 4.5 Recommendations for our app (group voting + AI extraction from TikToks)

1. **Model a trip as one trip with Stops (cities), each with an optional date range. Never use separate trips per city.** A Stop has a city or region, optional dates or a night count, and its own idea inbox. A single-city trip is simply a trip with one Stop, so the extra structure stays hidden until a second city shows up. That keeps single-city trips as simple as they are today while avoiding Wanderlog's split-into-separate-trips workaround.
2. **Let the AI pick the Stop automatically.** When a TikTok is extracted and the place is resolved, file it under the Stop whose city or region contains it. If no Stop matches, show a chip like "New city: Porto, add as a stop?" so a multi-city trip can grow out of what the group shares. If it's unclear (a "Portugal road trip" reel with 6 towns), put each extracted place under its own nearest Stop. Use a sensible city→region hierarchy with alias handling to avoid Rhyme's "Utah doesn't contain its cities" bug.
3. **Make "which cities, in what order, how many nights" a group vote.** Candidate Stops and night splits ("3 Lisbon / 2 Porto" vs. "2 / 3") become votable cards, using the same mechanics as place voting. Default the leg dates from the winning option. This extends our core advantage (decisions) to the multi-city layer, which nobody does.
4. **Treat travel between cities as Leg cards between Stops, not as places.** Each Leg shows mode options with rough duration and cost (like Rome2Rio). The group can vote on train vs. flight. Once booked, attach the confirmation (forwarded email or screenshot). Show legs on the map as connecting lines and in the timeline as separators. Keep it light: we don't need to sell tickets in v1. Deep-link out to booking.
5. **Map and list views scoped to a Stop by default, with a "whole trip" toggle.** Wanderlog's single map of every pin, filterable only by day, is part of why it feels cluttered. Opening a trip should land on the current or next Stop (a "Now in Lisbon" view during the trip).
6. **Attendance per Stop (and optionally per item) as a first-class field.** "Maya: joins in Porto (Apr 6)", "Sam: leaves after Lisbon". Use it to:
   - limit votes and nudges to the people present for that Stop or activity, so nobody gets notified about dinners they'll miss;
   - default receipt splits to the people present at that Stop on that date, so the person who skipped Lisbon is never charged for Lisbon dinners. This plugs straight into the receipt-OCR feature and directly answers Splitwise's manual subset-splitting;
   - support splitting up mid-trip: one tap creates a "Sub-plan" for an afternoon or a side trip that only some people join, with its own ideas and votes, and it merges back into the main timeline. The guest web link should let a partial attendee set "I'm in for: Lisbon ✓ Porto ✗" without making an account.
7. **Keep it fast at trip scale.** Multi-city group trips are exactly where Wanderlog lags at 100+ stops and Stippl crashes when adding destinations. Load each Stop on demand, and test with 300+ ideas across 4 Stops and 10 people before launch.
8. **Keep dates loose until they're decided.** Allow Stops with no dates yet ("Porto, ~2 nights") so the idea and vote phase works before anything is booked. That's the opposite of TripIt, which needs dates upfront and drops date-only trips when merging.
9. **Free export to Google or Apple Maps, one list or layer per Stop.** Users already copy what Google recommends (one list per city). Giving it to them for free answers the Wanderlog "pay $50 for map usage" complaint.
10. **Defer:** auto-allocating nights with AI (Inspirock/Stippl style), selling multi-modal tickets, and GPS tracking (Polarsteps). They're useful but not core to a voting-based group inbox. Add them after Stops, Legs and per-Stop attendance prove valuable.
