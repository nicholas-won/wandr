# Group Trip Planning and Group Decision-Making: Research for Product Design

*Research date: 30 Sept 2026. Scope: friend groups of 3–15 people planning trips on a phone. The app collects TikTok/IG posts, turns them into AI idea cards, lets the group vote and comment, and handles expense tracking and splitting with receipt photos.*

> **Method note:** Reddit (r/travel, r/solotravel, r/AskReddit) could not be fetched directly because the domain blocks this research tool. Reddit-style "worst group trip" stories are represented here through press write-ups that retell them (AOL/Parade/Fodor's). If we want first-hand verbatims, someone should pull those threads by hand.

---

## 1. Executive summary

- **Money, not destination, causes most group-trip conflict.** A 2026 Harris Poll for CIT Bank (n=2,067) found that 45% of group travelers had financial conflict or discomfort, rising to 72% of Gen Z. 82% would pay more than their fair share to avoid an argument (a "peace tax"), and 22% of Gen Z have ended a relationship over trip money. Only about 1 in 4 groups set a budget up front (Experian, 2025).
- **The quiet-then-complain pattern has a documented cause.** Hidden-profile research (Stasser & Titus), the Abilene paradox (Harvey), and herding experiments (Muchnik et al., *Science* 2013) all point the same way. When people state preferences in public and in sequence, groups lean toward whatever was said first or most often, and private objections stay hidden until the trip.
- **The fix with the most evidence behind it is to collect preferences privately first, then reveal them all at once and discuss.** This is the core of the Delphi method, Nominal Group Technique, and good dot-voting practice. It is also cheap to build in an app.
- **On a phone, approval voting ("👍 any you'd be happy with") plus a dealbreaker veto is the best fit.** It is simple, hard to game, and good at finding consensus options. Full ranked-choice voting costs too much effort for a casual group.
- **Decisions need a deadline and a decider.** Deadlines that someone else sets work better than ones people set for themselves (Ariely & Wertenbroch 2002). "Good enough for now, safe enough to try" (consent) and "disagree and commit" (Bezos) keep groups from stalling.
- **Getting passive members to take part means removing friction.** Partiful, When2meet, Doodle and Tricount all let people respond with no account and no app install, and send automatic reminders so the organizer never has to nag.

---

## 2. Common sources of conflict on group trips

### 2.1 Budget mismatch and social spending pressure
- 45% of U.S. group travelers (past 5 years) experienced financial conflict or discomfort. The figure is 72% for Gen Z and 54% for Millennials. 80% of Gen Z and 76% of Millennials went over budget because of social pressure, and about 30% went over by $500 or more. 41% felt pressured into a trip they didn't want to take. ([CIT Bank / Harris Poll, Jun 2026](https://newsroom.firstcitizens.com/2026-06-23-82-of-Group-Travelers-Will-Pay-a-Peace-Tax-to-Avoid-Money-Arguments,-CIT-Bank-Survey-Finds))
- The top stress points across all generations are (1) unexpected costs, (2) splitting fairly when people have different spending priorities, and (3) pressure to spend beyond one's comfort level. 35% of Millennials name different budget ranges as their #1 challenge. Only about 1 in 4 groups set a budget up front. ([Experian survey, 2025](https://www.experian.com/blogs/ask-experian/survey-financial-stress-of-traveling-with-friends/))
- A 2019 Booking.com survey (cited secondhand) found that 44% of travelers say coordinating schedules, budgets and preferences is the hardest part of group trips. ([Kyle Sandburg, Substack](https://kylesandburg.substack.com/p/why-travel-planning-can-be-overwhelming))
- Further reading: [Fortune on Gen Z/Millennial trip debt](https://fortune.com/2025/07/08/gen-z-millennials-debt-group-trips), [Parade: relationship experts on vacation money fights](https://parade.com/travel/vacation-money-arguments-according-to-relationship-experts), [Nasdaq: surviving group travel with different budgets](https://www.nasdaq.com/articles/7-secrets-to-surviving-group-travel-with-different-budgets).

### 2.2 Money and splitting disputes
- Disputes come from: unexpected or unagreed costs, people who agree to split and then back out ([AOL roundup of group-trip horror stories](https://www.aol.com/5-biggest-financial-challenges-generation-160125766.html)), the "I only had a salad" problem of equal versus itemized splits, slow repayment, and the awkwardness of chasing friends for money. That awkwardness is what makes the "peace tax" possible: people would rather overpay quietly than raise it.
- Older travelers tend to keep mental notes rather than use an app (Experian). Mental tallies leave room for memories to differ, and differing memories lead to disputes.

### 2.3 Pace and energy differences
- Travel styles differ (relaxing, adventure, culture, nightlife, food). Assuming everyone wants the same thing is where conflicts start. Burnout makes people cranky, and cranky people argue. Standard advice: build free time into the plan, let people opt out without guilt, agree before the trip that solo time and splitting up are normal, and don't require everyone to agree on everything. ([Gamintraveler: unspoken rules](https://www.gamintraveler.com/2025/09/17/unspoken-rules-of-group-trips/), [Uncommon Family Adventures](https://uncommonfamilyadventures.com/blog/traveling-together-how-to-balance-different-travel-styles), [Backpacking Diplomacy](https://www.backpackingdiplomacy.com/traveling-with-other-people-without-falling-out/))
- A useful trick from these guides is turn-taking: "you pick this one, I pick the next."

### 2.4 The one person who does all the planning
- Without a shared tool, the most organized person absorbs the work by default and often arrives at the trip already exhausted. The planner feels unappreciated and the others feel steamrolled. ([Mental Loadless](https://mentalloadless.com/en/blog/group-vacation-planning), [GROWN: what your planner friend wants you to know](https://grownmag.com/health/self-care/what-your-planner-friend-wants-you-to-know/))
- Carrying most of the mental load is associated with low mood, stress, burnout and worse relationships. Recommended fixes: make the work visible, give named people ownership of specific parts of the trip, and plan together as equals. ([The Travel Psychologist](https://thetravelpsychologist.co.uk/why-am-i-always-the-one-planning-our-trips/))
- **Social loafing** explains the passivity of everyone else. Individual effort falls as group size grows and as each person's contribution becomes harder to see. In Ringelmann's rope-pulling data, 8 people each pulled at about 49% of their solo effort. Latané, Williams & Harkins (1979) showed the drop is motivational, not just a coordination problem. ([Wikipedia: Social loafing](https://en.wikipedia.org/wiki/Social_loafing), [FORRT Open Social Psychology](https://forrt.org/open-social-psychology/chapter7.html)) **This matters directly for a 15-person trip.** Making each person's input visible and identifiable reduces loafing.

### 2.5 Decision fatigue and choice overload
- In the jam study (Iyengar & Lepper 2000), 24 jams attracted more shoppers but 6 jams produced more purchases. The effect is not universal. A meta-analysis of 53 experiments ([Chernev, Böckenholt & Goodman 2015](https://chernev.com/wp-content/uploads/2017/02/ChoiceOverload_JCP_2015.pdf)) found that choice overload appears when the decision is hard, the options are complex or hard to compare, preferences are uncertain, and people want to minimize effort. **A group chat full of 60 saved TikToks meets all four conditions.**

### 2.6 Unequal say, people going quiet, then complaining
- **Abilene paradox.** A group agrees to something nobody actually wants, because each person assumes the others want it. This is closely related to pluralistic ignorance. ([Wikipedia](https://en.wikipedia.org/wiki/Abilene_paradox), [Ness Labs](https://nesslabs.com/abilene-paradox))
- **Shared-information bias / hidden profiles.** Groups discuss what everyone already knows and under-use what only one person knows, so they make worse decisions ([Stasser & Titus 1985; Wikipedia: Hidden profile](https://en.wikipedia.org/wiki/Hidden_profile), [meta-analysis](https://www.researchgate.net/publication/51624107_Twenty-Five_Years_of_Hidden_Profiles_in_Group_Decision_Making_A_Meta-Analysis)). On a trip, the friend who can't afford something, or who has a mobility issue, or who hates boats, is the one holding the "unshared information."
- **Herding.** In a randomized experiment on more than 100k comments, one artificial upvote made the next upvote 32% more likely and raised final scores by 25% on average. Artificial *down*votes were largely corrected by later voters. ([Muchnik, Aral & Taylor, *Science* 2013](https://www.science.org/doi/10.1126/science.1240466)) So visible early likes on an idea card will skew results.
- **Doodle data.** In open polls, where people can see earlier votes, responses correlate more with previous responses than in hidden polls, and people also approve very popular slots to look "cooperative." ([Zou, Meir & Parkes, CSCW 2015](https://dash.harvard.edu/entities/publication/73120379-2d72-6bd4-e053-0100007fdf3b))
- Being pressured into the trip itself is common: 41% overall and 56% of Gen Z (CIT Bank). FOMO and social pressure act on both whether people go and how much they spend.

---

## 3. Group decision methods: evidence and fit for a casual friend group on a phone

| Method | What it is | Evidence / rationale | Fit for friends on a phone |
|---|---|---|---|
| **Approval voting** | Approve any number of options; the one with the most approvals wins | Low effort, resists strategic voting, tends to pick the consensus/majority option ([Brams & Fishburn; *The case for approval voting*, Springer 2022](https://link.springer.com/article/10.1007/s10602-022-09381-x)). Needs less thinking than ranking ([arXiv survey](https://arxiv.org/pdf/2007.01795)) | **Excellent.** It's a 👍 on each card. Use it as the default. |
| **Approval + "love it" tier** | 3-level response: love / ok / no (like Doodle's yes / if-need-be / no) | Captures how strongly people feel without full ranking. Doodle's "if need be" shows the pattern works | **Excellent.** Swipe right / tap / swipe left. |
| **Ranked choice** | Rank all options | More expressive, but rankings take effort and have known theoretical and practical problems | **Poor** beyond about 4 options. Use only for a final runoff of 3–4. |
| **Dot voting** | N dots to spread across options | Good for prioritizing, but open voting causes bandwagon and anchoring, and list position biases results. Best practice is silent, simultaneous, randomized order ([Koji guide](https://www.koji.so/docs/dot-voting-prioritization-guide), [Lucid](https://lucid.co/blog/dot-voting)) | **Good** for a budget of "must-dos" (e.g., 3 stars each), as long as votes are hidden until the reveal and order is randomized. |
| **Veto / dealbreaker card** | Each person has a limited number of blocks | This is a version of consent ("does anyone have a reasoned objection?") ([Sociocracy For All](https://www.sociocracyforall.org/is_good_enough_good_enough/)). Brings out hidden constraints | **Excellent** if scarce (1–2 per person per trip), private, and tagged with a reason category. |
| **Anonymous preference collection before discussion** | Everyone answers privately, then results are revealed at once | Delphi (anonymity, iteration, aggregated feedback) ([CASRAI](https://casrai.org/guides/delphi-method)). Nominal groups beat interacting groups and reduce evaluation apprehension ([Wikipedia: Production blocking](https://en.wikipedia.org/wiki/Production_blocking)) | **Excellent.** This is the most important pattern. Hide tallies until you've voted or the round closes. |
| **Delphi-style rounds** | 2–3 rounds: private vote → see aggregate → revise | Reduces dominance and herding. Usually 2–4 rounds | **Good, simplified.** Round 1 = shortlist, round 2 = final. More than 2 rounds is too much for friends. |
| **Deadlines / timeboxing** | Votes close at a set time | Externally set, evenly spaced deadlines beat self-imposed ones ([Ariely & Wertenbroch 2002](https://web.mit.edu/ariely/www/MIT/Papers/deadlines.pdf)) | **Excellent.** Every poll has a close time by default. |
| **Disagree and commit / 70% rule** | Decide with about 70% of the information; dissenters commit anyway | Bezos 2016 letter: being slow is always costly, and many decisions can be reversed ([Amazon](https://www.aboutamazon.com/news/company-news/2016-letter-to-shareholders)) | **Good** as a feature: "I'm out-voted but I'm in 👍" button. |
| **Consensus vs consent** | Consensus asks "does everyone agree this is best?" Consent asks "does anyone object?" | Consent moves faster and avoids chasing perfect agreement ([Crisp blog](https://blog.crisp.se/2017/11/03/michaelgothe/consent-decision-making-how-to-take-effective-decisions-collaboratively)) | **Use consent for logistics** (dates, lodging) and approval for fun picks. **Don't treat silence as consent:** require an explicit 👍 or a visible "abstain." |
| **Turn-taking / picker rotation** | Each person "owns" a meal or day pick | Recommended by travel guides. Spreads planning work and ownership | **Good** for groups bigger than 6, where votes on everything become tiring. |

**Recommendation for the app:** idea cards → **private approval vote (love / ok / no) with a deadline** → **reveal together** → comment and discuss → optional **runoff between the top 3** → **lock**, with an "I'm in" commit. Each person also gets a small number of **private dealbreakers** throughout.

---

## 4. Budget alignment techniques

- **Collect budget ranges privately and anonymously before anyone proposes a destination.** Financial therapist Aja Evans suggests asking "would everyone mind sending me a budget range?" in private or by anonymous form, so nobody is embarrassed or envious in front of the group. ([Fodor's](https://www.fodors.com/news/travel-tips/how-do-i-ask-my-friends-if-they-can-afford-the-group-trip-im-planning))
- **Set the baseline at the lowest comfortable budget, not the average.** "Design the trip around the lowest budget … You can always add optional splurges later, but the baseline needs to be something every person can pay without flinching." ([AvantStay](https://avantstay.com/blog/how-to-plan-group-trip-different-budgets/), [Beyond Baggage: 11 rules](https://beyondbaggage.com/2025/04/21/how-to-plan-friend-group-trip-without-drama/))
- **Split costs into a shared baseline and optional extras.** Make premium activities "choose your own adventure" opt-ins so people can pick according to their budget (Fodor's).
- **Use rough category shares to set expectations:** lodging 30–40%, transport 20–25%, food 15–20%, activities 10–15% (Fodor's).
- **Agree on splitting rules up front:** equal versus itemized, who pays the deposit, what to do about dropouts ([Travel Bulletin](https://travelbulletin.com/tips/budgeting/how-to-budget-group-trips)).
- **Reveal privately collected budget data only in aggregate.** Show "the group's comfortable budget is ≤ $X per person." Never show an individual's number and never show the full distribution. Otherwise the person with the lowest number is identifiable in a 3–4 person group.

---

## 5. Money: how splitting disputes arise and how Splitwise and Tricount reduce friction

**Why disputes happen:** no agreed rule (equal vs. itemized); costs nobody agreed to ("I booked the nicer Airbnb"); fuzzy memory of who paid for what; many small IOUs; reluctance to ask for money (which leads to the peace tax); and slow settling, so balances linger after the trip and turn sour.

**What the leading apps do:**
- **Splitwise:** "Simplify debts" rearranges who-owes-whom to minimize the number of payments, without changing anyone's net balance. Example: if A owes B $20 and B owes C $20, then A pays C $20 directly. It re-simplifies automatically as new expenses are added. ([Splitwise KB](https://kb.splitwise.com/balances-and-expenses/what-is-simplify-debts), [Splitwise blog](https://blog.splitwise.com/2012/09/14/debts-made-simple/)) **Splitwise Pro** adds receipt scanning with item detection, so you can assign line items to people, plus default split settings per group, currency conversion and card-transaction import ([splitwise.com/pro](https://www.splitwise.com/pro)). Settling up links out to Venmo or PayPal rather than moving money itself ([Splitty comparison](https://splittyapp.com/learn/venmo-groups-vs-splitwise/)). Note that some third-party reviews claim Splitwise only captures receipt totals. Splitwise's own page says it itemizes.
- **Tricount:** free (owned by bunq), **no account needed to take part**, works offline, multi-currency, and "optimizes reimbursements so that only the minimum number of payments is needed." You can attach receipt photos but it does not do OCR. A bunq card can log purchases automatically. ([Tricount features](https://tricount.com/en-ca/expense-tracker-features), [HippoSplit comparison](https://hipposplit.com/blog/splitwise-vs-tricount-vs-settle-up/))

**Friction reducers worth copying:** default split rule per trip; itemized splits from receipt OCR; minimizing the number of transfers; a single "you owe $X to Y" number per person; one-tap payment hand-off (Venmo/PayPal/Cash App/Revolut); multi-currency; the ability to add expenses offline; and adding expenses with no account.

**Gaps our app could fill:** link each expense back to the group decision that approved it ("we voted for this, so it's a shared cost"); mark opt-in items so only the people who joined pay; let **the app** send settle-up reminders so no friend has to; and set a trip close date that prompts everyone to settle.

---

## 6. How Partiful, Doodle, When2meet and Howbout get passive members to take part

| App | Mechanism | Lesson for us |
|---|---|---|
| **Partiful** | Invites arrive by SMS link; guests RSVP in the browser with **no account and no app** ([Partiful help](https://help.partiful.com/hc/en-us/articles/27354346663963-Do-my-guests-need-to-download-the-app)); **automatic reminders "so you don't have to nag anyone in the group chat"** ([party.pro review](https://party.pro/partiful/)); a visible guest list, comments and reactions build hype; text blasts; date polls; built-in payment collection ([Partiful](https://partiful.com/)) | Web-link voting with no install. Reminders come from the app, not from a friend. Show social proof of who has joined, but **not** how they voted. |
| **When2meet** | One screen, drag to paint availability, heatmap result, no accounts at all ([comparison](https://www.usecarly.com/blog/doodle-vs-when2meet/)) | Answering takes under 10 seconds. A heatmap makes overlap obvious at a glance. |
| **Doodle** | Participants need no account. **Yes / if-need-be / no** options. Organizer can hide responses ([comparison](https://wpamelia.com/doodle-vs-when2meet/)) | Offer a three-level answer. A **hidden-results** mode exists because of the herding effect (Zou et al. 2015). |
| **Howbout** | A social calendar: friends see each other's free time; polls auto-show your availability when you vote; chat lives next to plans; about 6M downloads; spreads through TikTok ([Howbout](https://howbout.app/blog/making-plans/the-app-to-get-friends-together)) | Pre-fill whatever we can (calendar availability, past preferences) so voting takes almost no effort. Content made for TikTok spreads well, which matches our TikTok-based input. |

Principles that follow from these apps and the loafing research: (1) the first response should need no install and no sign-up; (2) every ask should take one tap; (3) the app, not the planner, does the reminding; (4) show who hasn't responded yet, privately and gently, because being identifiable reduces loafing; (5) deadlines on everything.

---

## 7. Feature recommendations

Each feature lists the conflict it prevents. **Impact** means how much conflict and churn it prevents, given the evidence above. **Effort** is a rough engineering and design estimate. Ranked by impact ÷ effort.

### Tier 1: High impact, low effort (build first)

1. **Blind voting with a simultaneous reveal.** Vote tallies and who voted for what stay hidden on each idea card until you've voted or the poll closes, and then everything is revealed at once. Cards appear in randomized order for each person.
   *Prevents:* herding and anchoring by loud or early voters, the Abilene paradox, and quiet members deferring. *Evidence:* Muchnik 2013, Zou 2015, dot-voting practice, Delphi. *Effort:* Low.

2. **Love / OK / No approval voting on idea cards** (swipe or tap), with "most approved, fewest No" as the default way to rank.
   *Prevents:* decision fatigue and unequal say, and picks options everyone can live with. *Evidence:* Brams & Fishburn; Doodle's if-need-be. *Effort:* Low.

3. **Deadlines on every decision**, with smart defaults (e.g., 48h), visible countdowns, and auto-close. If someone hasn't voted when it closes, they are counted as an abstention, **never as a yes**.
   *Prevents:* stalled decisions, the planner left waiting, endless debate. *Evidence:* Ariely & Wertenbroch 2002; Bezos's 70% rule. *Effort:* Low.

4. **Anonymous budget check-in at trip creation.** Each person privately picks a comfortable per-person range. The group only ever sees **"Trip baseline: ≤ $X/person"**, set from the lowest comfortable budget. AI idea cards show an estimated cost and get flagged "over baseline" / "optional splurge."
   *Prevents:* budget mismatch, social pressure to overspend, the peace tax, people dropping out late. *Evidence:* CIT/Harris and Experian surveys; Fodor's; AvantStay. *Effort:* Low–Medium (the cost estimates on cards are the medium part).

5. **No-install web-link voting plus app-sent nudges.** Anyone can vote, comment and see balances from an SMS or iMessage link without an account. Reminders come from the app ("2 people still need to vote on lodging") so the planner never has to chase.
   *Prevents:* passive members, the planner's chasing burden, "I never saw it." *Evidence:* Partiful, When2meet, Doodle, Tricount. *Effort:* Medium. Highest-leverage growth feature too.

6. **Private dealbreaker card.** Each person gets 1–2 vetoes per trip, used privately, with a reason tag (💸 cost, ♿ access, 😰 safety, 🙅 just no). The group sees "vetoed (cost)" and never who vetoed it.
   *Prevents:* hidden constraints surfacing during the trip, resentment, exclusion due to cost or ability. *Evidence:* consent decision-making; hidden profiles. *Effort:* Low.

### Tier 2: High impact, medium effort

7. **Trip-wide split rules set before booking.** When the trip is created, the group agrees on an equal / itemized / opt-in-only rule and a dropout and deposit policy, and everyone taps "agree" (consent). Expenses inherit the rule.
   *Prevents:* "I only had a salad" fights and arguments over who pays for a dropout. *Effort:* Medium.

8. **Opt-in activities linked to expenses.** Every idea card that gets locked becomes either "Everyone" or "Opt-in." People who opt in become the default split participants for any expense tied to that card.
   *Prevents:* paying for things you skipped, pace/energy and budget mismatch, pressure to join everything. *Evidence:* "choose your own adventure" slots; let people opt out without guilt. *Effort:* Medium.

9. **Receipt photo → AI itemization → tap to claim.** Each person claims their own items, and tax and tip are split proportionally. Pair this with **simplified debts** (minimum transfers) and **one-tap settle via Venmo/PayPal/Cash App**.
   *Prevents:* itemized-vs-equal fights, mental-tally disputes, slow repayment. *Evidence:* Splitwise Pro and Tricount; Experian (mental notes cause disputes). *Effort:* Medium (OCR plus LLM).

10. **Settle-up by the app, not a friend.** Automatic, friendly balance reminders, a trip "close date" that prompts final settlement, and a "you're all square 🎉" state. Nobody has to send the awkward text.
    *Prevents:* the peace tax, lingering debts, friendships ending over money. *Effort:* Low–Medium.

11. **AI shortlisting to beat choice overload.** When a trip has more than about 12 idea cards in a category, the AI clusters duplicates (five TikToks of the same rooftop bar) and proposes a shortlist of 4–6 for each vote, with a cost, distance and vibe comparison row.
    *Prevents:* decision fatigue, choice overload, chat sprawl. *Evidence:* Chernev 2015 (complex, hard-to-compare options cause overload). *Effort:* Medium.

12. **Travel-style quiz at join time** (pace, wake-up time, nightlife vs. chill, food priority, budget comfort), answered privately and shown as a group summary ("4 early birds, 3 night owls"). The AI uses it to suggest a balanced itinerary with built-in free time.
    *Prevents:* pace and energy conflicts, surprises during the trip. *Effort:* Medium.

### Tier 3: Medium impact, low–medium effort

13. **Shared ownership roles.** Give people a lane ("Lodging lead," "Food lead," "Day 2 picker"), each with its own decision deadline. Rotate the "picker of the day."
    *Prevents:* one person doing all the planning, social loafing in big groups. *Evidence:* Ringelmann/Latané (identifiability); Travel Psychologist; "you pick this one, I pick the next." *Effort:* Low.

14. **Participation meter (private and gentle).** The organizer sees who hasn't voted yet. Each member sees "you haven't weighed in on 3 decisions." Never shown publicly as a shame list.
    *Prevents:* quiet-then-complain, loafing, "nobody asked me." *Effort:* Low.

15. **"I'm in" commit button after a decision.** After the reveal, people who disagreed can tap "Not my pick, but I'm in 👍." Locked decisions show the commitment count.
    *Prevents:* relitigating, quiet resentment, complaining during the trip. *Evidence:* disagree-and-commit; consent. *Effort:* Low.

16. **Two-round decisions for big-ticket choices** (destination, lodging): private round → reveal → comments → runoff between the top 3 → lock. A lightweight Delphi process.
    *Prevents:* bad high-stakes decisions driven by whoever posted first. *Effort:* Low once #1–3 exist.

17. **Reversible vs. locked labels.** Mark decisions as "reversible" (dinner spot) or "locked" (non-refundable booking). Reversible ones use a short deadline and close by consent. Locked ones use the two-round process plus a cost confirmation.
    *Prevents:* over-deliberating trivial choices and under-deliberating expensive ones. *Evidence:* Bezos (most decisions are reversible). *Effort:* Low.

### Tier 4: Nice to have / higher effort

18. **Calendar-based date finder** (Howbout/When2meet-style heatmap with calendar sync). *Prevents:* scheduling ping-pong. *Effort:* Medium–High (calendar integrations).
19. **Private "I'm out / can't afford it" exit path** that tells the organizer and changes the head count without public drama. *Prevents:* FOMO-pressured attendance, late dropouts. *Effort:* Low, but needs careful UX.
20. **Post-trip retro poll** (anonymous): what worked, what to change next time, stored as group defaults. *Prevents:* repeated conflicts on the next trip. *Effort:* Low.

### Design guardrails (apply to all features)
- **Don't count silence as consent.** Abstention is always visible as abstention.
- **Never expose an individual's budget or veto**, even indirectly. With 3–4 people, show only aggregates, and suppress breakdowns when n is small.
- **Every request to a member should take one tap and come with a deadline.**
- **The app does all the nagging**, so the friendship doesn't have to.
