# Group Trip Card (Interchange) and Trip Merch (Print on Demand)

> **Purpose:** Test two revenue streams where **users pay nothing extra** (REQUIREMENTS §11, D50): (1) a group trip card that earns a share of the interchange the merchant pays, and (2) bachelor/bachelorette and group-trip merch made with print on demand (POD), plus photo books.
> **Research date:** 1 Oct 2026. Reddit was not used.
> **Search limit:** the session's web-search budget ran out early. This research used direct fetches of primary pages: the Visa interchange schedule, the Fed's Reg II data, the CFR, Stripe docs and pricing, the Printful public catalog API, SEC filings, the CFPB and the Fed. Several issuer pricing pages are "contact sales" only, and a few precedents (Revolut, Monzo, Zeta, Tandem, Pool, Kitty, Bunch) could not be verified. These are marked.
> **Labels:** **[Fact]** comes from a primary source (filing, rule, official pricing page or API). **[Reported]** comes from secondary press or a review site, or from prior knowledge not re-checked this session. Confirm these before relying on them. **[Est.]** is our assumption or calculation.

---

## 0. Bottom line

1. **The group card is viable as a product but weak as a business at our scale.** In the base case it earns about **$2 per average trip** (conservative about $0, optimistic about $12). It brings about **$150–400K a year of fixed compliance and program cost** [Est.], and it needs Synapse-era bank diligence. It pays off only at about **100K+ trips a year**, or if it becomes the app's core "group money" feature for retention reasons. **Don't build it now. Revisit it at Phase 3 or later, launch it through a full-stack provider, never through a middleware-only BaaS, and only if the POC's "Collect for the house" tracking shows that most trips pool $2K or more.**
2. **The real interchange rate is good, but our share is small.** Visa's 2026 schedule pays a **Durbin-exempt** (bank under $10B) consumer debit issuer **1.65–1.70% + $0.15** on card-not-present hotel or e-commerce purchases. A **regulated** issuer gets only **0.05% + $0.21**, which is about **$0.36 on a $300 payment** [Fact]. After network, bank and processor shares we would keep roughly **0.6–1.1% of spend** [Est.]. On a $2,500 trip pot that is about **$22**, before about $10 of variable costs.
3. **Merch is the better near-term bet.** It is low-regulation, builds on assets the app already has (the theme poll and the guest list), and has real margin. Printful's public API puts a Bella+Canvas 3001 tee at **$11.92** with a front print, shipping at **$4.95 + $2.20 per extra item**, and delivery in about **5–9 business days** [Fact]. A $28 tee leaves about **$12 of margin per item** [Est.]. Revenue is about **$10 per bachelor/bachelorette trip in the base case** (conservative about $2, optimistic about $43) [Est.]. **Build it in Phase 2 as a "Make the squad merch" flow on bach trips, with a hard order-by date.**
4. **Photo books add little** (about **$0.25–3.50 per trip** [Est.]). Polarsteps makes them work because it has 18M+ solo and couple travelers who track whole journeys, not one weekend. Add a "Trip Wrapped" book later as a low-effort POD add-on.

---

## Part 1: Group trip card (earning interchange)

### 1.1 How the product would work [Est.]

- The organizer opens a **trip pot**: a card account in **the organizer's name**, at a sponsor bank, with KYC done on the organizer.
- Friends **top it up** with their share. The organizer pays the house, activities and dinners with a **virtual card**, which can also be added to Apple Pay or Google Pay.
- The app reconciles who paid in and what was spent, and refunds or settles any leftover.
- The merchant pays interchange to the issuing bank, and the bank shares part of it with the program (us).

### 1.2 Interchange: what the merchant actually pays

**Visa USA interchange (rates effective 18 Apr 2026)** [Fact] ([Visa USA Interchange Reimbursement Fees, Apr 2026](https://usa.visa.com/content/dam/VCOM/download/merchants/visa-usa-interchange-reimbursement-fees.pdf)):

| Category | Exempt consumer debit (bank < $10B) | Exempt consumer prepaid | Regulated debit or prepaid (bank ≥ $10B) |
|---|---|---|---|
| CPS/Hotel and Car Rental, card not present | **1.70% + $0.15** | 1.75% + $0.20 | 0.05% + $0.21 (+$0.01 fraud) |
| CPS/e-Commerce Preferred Hotel and Car Rental | 1.70% + $0.15 | 1.75% + $0.20 | 0.05% + $0.21 |
| CPS/e-Commerce Basic (typical online purchase) | 1.65% + $0.15 | 1.75% + $0.20 | 0.05% + $0.21 |
| CPS/Card Not Present | 1.65% + $0.15 | 1.75% + $0.20 | 0.05% + $0.21 |
| CPS/Retail 2, card not present | 0.65% + $0.15 (**$2.00 cap**) | 0.65% + $0.15 ($2.00 cap) | 0.05% + $0.21 |
| CPS/Restaurant (card present) | 1.19% + $0.10 | 1.15% + $0.15 | 0.05% + $0.21 |
| Travel Service, card present | 1.19% + $0.10 | 1.15% + $0.15 | 0.05% + $0.21 |
| CPS/Account Funding (loading a card from a debit card) | 1.75% + $0.20 | 1.80% + $0.20 | 0.05% + $0.21 |
| *For comparison: commercial and business cards* | Business debit, card not present: **2.45% + $0.10**. Commercial Travel Service: 2.65% + $0.10. Business or purchasing prepaid, card not present: 2.65% + $0.10 | | |

**Fed Reg II data (what issuers actually earned)** [Fact]:
- **2024 averages:** exempt issuers **$0.51 per transaction, 1.21% of value**. Covered (regulated) issuers $0.23, 0.47% ([Fed, average interchange fee](https://www.federalreserve.gov/paymentsystems/regii-average-interchange-fee.htm)).
- **2023, exempt issuers by network type:** signature (dual-message) debit **1.31%**, signature prepaid **1.80%**, PIN debit 0.64%, PIN prepaid 0.85% ([Fed 2023 interchange report](https://www.federalreserve.gov/paymentsystems/2023-interchange-fee.htm)).

**The rules** [Fact]:
- Reg II caps a regulated issuer at **21¢ + 0.05% + 1¢ fraud adjustment** ([Fed](https://www.federalreserve.gov/paymentsystems/regii-average-interchange-fee.htm)).
- **12 CFR 235.5** exempts issuers that, with their affiliates, hold **under $10B in assets**, and also certain reloadable general-use prepaid cards.
- **All the exemptions are lost if the card allows overdraft fees, or charges for the first monthly ATM withdrawal in the issuer's network** ([12 CFR 235.5](https://www.law.cornell.edu/cfr/text/12/235.5)).

**What this means for us** [Est.]:
- **"About 1–1.5%" is right for the blended average.** For our spend mix (large card-not-present lodging and activity payments plus some restaurants) the gross rate is about **1.6%**.
- **Big-ticket lodging is not capped** on the consumer debit hotel and e-commerce categories. A $2,400 house on an exempt debit card generates about **$40.95** (1.70% × $2,400 + $0.15).
- **Watch merchants that code as Retail 2 or "travel agency."** Retail 2 is capped at $2.00, so merchant category and qualification matter. **We could not verify Airbnb's merchant category code (MCC) or whether it has merchant-specific Visa rates.** Run a live $1 test and read the actual interchange on settlement before modeling Airbnb.
- **The partner bank must be under $10B.** Typical BaaS sponsor banks qualify: Celtic, Sutton, Coastal Community, Lead, Piermont, Cross River. **Check each bank's current assets**, because some are near $10B; crossing it cuts interchange by about 75%.
- **Commercial card rates are higher, but they don't apply here.** Stripe's commercial program states the card "can only be used for commercial purposes, and can't be used for personal, family, or household purposes" ([Stripe commercial compliance guide](https://docs.stripe.com/issuing/compliance-us)). A friends' bachelorette pot is personal, so we would need a **consumer** program.

### 1.3 Can an Airbnb or Vrbo payment go on a virtual debit card?

| Merchant | Finding | Type |
|---|---|---|
| **Airbnb (US)** | Accepts major credit cards, "debit cards that can be processed as credit cards," Apple Pay, Google Pay, PayPal and others. The same help page states "Prepaid cards are not accepted" (said in the Klarna section) ([Airbnb help, payment methods](https://www.airbnb.com/help/article/126)). | Fact |
| **Implication** | Issue the card as a **Visa or Mastercard debit card that is not marked prepaid in the BIN table** (a DDA-style account, or a program the bank sets up as debit), and test it. A **signature-capable virtual debit card should work.** Airbnb often charges **part now and part later**, so the pot must still hold funds at the second charge. Note: Reg E would still treat our product as a "prepaid account" (§1.6) even if the BIN reads as debit. | Est. |
| **Vrbo** | Help page unavailable at fetch time. **Not verified.** | — |
| **Hotels** | Virtual cards work for the booking. **At check-in**, hotels often require a physical card in the guest's name for incidentals. Mitigate with Apple Pay or Google Pay provisioning, or with the organizer's own card for incidentals. | Est. |

### 1.4 Card-issuing platforms and BaaS providers

Most do not publish their interchange split. They are labeled where pricing is public.

| Provider | Model and fit | Public pricing | Interchange share | Small startups? Time to launch | Type |
|---|---|---|---|---|---|
| **Stripe Issuing** | API issuing. Banks: Celtic, Sutton, Cross River, Fifth Third. **"Consumer issuing is available in the US,"** but most docs and compliance templates are written for **commercial** programs. Consumer programs appear to go through sales. Treasury (financial accounts) can fund cards ([Stripe Issuing docs](https://docs.stripe.com/issuing)) | **$0.10 per virtual card**, **$3.50 per standard physical card**, $15 per dispute, cross-border 1% + 30¢. Treasury: no minimums, ACH included, $2 wire ([Stripe pricing](https://stripe.com/pricing)) | "Earn a share of interchange revenue." Gross or net share, **% not published** ([Stripe guide](https://stripe.com/guides/earn-revenue-by-issuing-cards)) | Commercial issuing is self-serve. Consumer issuing: contact sales. **Stripe Payments Company is the licensed money transmitter** for Issuing balances, so we would ride on its licenses ([Stripe compliance guide](https://docs.stripe.com/issuing/compliance-us)). Marketing must be reviewed by Stripe and the bank (**up to 10 business days**) | Fact |
| **Lithic** | Card issuing processor plus program management. Founded as Privacy.com's issuing stack | Pricing page has no numbers: "contact us" ([Lithic pricing](https://www.lithic.com/pricing)) | Not public | Sandbox is self-serve. Generally startup-friendly [Reported] | Fact / Reported |
| **Marqeta** | Enterprise processor. Banks are generally **Durbin-exempt**. The 10-K says contracts "entitle Marqeta to all of the Interchange Fees… which we then share with our customers through Revenue Share payments." 2025 processing volume **$382.5B**, revenue $624.9M, **Block 45% of revenue** ([Marqeta 10-K FY2025](https://www.sec.gov/Archives/edgar/data/1522540/000152254026000017/mq-20251231.htm)) | Not public | Shares interchange through revenue-share contracts | **Enterprise focus. Not realistic for a pre-revenue startup** [Est.] | Fact |
| **Unit** | Full-stack BaaS (accounts, cards, ACH, compliance tooling). Now pitches itself to "**vertical SaaS and category-defining companies**." $100B+ annual volume, 5M+ accounts ([unit.co](https://www.unit.co/)) | Not public | Not public | Retreated from early-stage startups after 2023 layoffs [Reported]. **Our consumer P2P use case is a weak fit** [Est.] | Fact / Reported |
| **Treasury Prime** | Now a **marketplace** that matches fintechs with 20+ partner banks, rather than a full program manager ([treasuryprime.com](https://www.treasuryprime.com/)) | Not public | Negotiated with each bank | "Ship in weeks" (marketing claim). We would still carry compliance ourselves | Fact |
| **Increase** | Bank-direct infrastructure with public pricing ([Increase pricing](https://increase.com/pricing)) | **Virtual card $0.25**, first 5 physical cards free, **next-day ACH $0.50**, same-day ACH $2, RTP/FedNow $2.50, dispute $15 | Not stated | Best for teams with in-house compliance. Not a turnkey consumer program [Est.] | Fact |
| **Highnote** | Issuing and acquiring platform. "Interchange split" offered on issuing ([Highnote pricing](https://www.highnote.com/pricing)) | Issuing: custom. Acquiring 2.85% + 25¢ | Split offered, % not public | Unknown | Fact |
| **Galileo** (SoFi) | Processor for large neobanks such as Chime | Not public | Not public | Enterprise focus [Reported] | Reported |
| **Synctera** | BaaS plus bank-matching platform | Pricing page has no numbers ([Synctera pricing](https://www.synctera.com/pricing)) | Not public | Unknown | Fact |

**Typical program economics** [Reported / Est., industry norms not confirmed by any provider this session]:
- Out of gross interchange, the **networks take about 0.13–0.15%** and the **sponsor bank keeps about 10–30%**.
- The processor or program manager then takes a further cut, or charges per-transaction or minimum fees.
- A small program typically keeps **about 40–70% of gross interchange**. Large programs negotiate **80%+**.
- Program managers commonly charge **monthly minimums of about $2–10K** and **setup fees of $10–50K**.
- Stripe has no setup fee, but its split is undisclosed.
- **Get written quotes from Stripe (consumer), Lithic and one bank-direct option before modeling further.**

### 1.5 Precedents and lessons

| Product | What it is or was | Outcome | Lesson | Type |
|---|---|---|---|---|
| **Splitwise Card** | A Mastercard **debit** card issued by **Coastal Community Bank** that logs and auto-splits purchases. Funded from a Splitwise Pay wallet with auto top-up from a bank. No monthly or foreign-transaction fees. US only. Requires phone verification and a linked bank account ([splitwise.com/card](https://www.splitwise.com/card)) | The page still says it is "**currently in the process of launching**." A $20M Series A in 2021 has not produced a broadly available card | **Even the category leader, with tens of millions of users, is moving slowly.** Splitting is a feature; the card is a costly add-on | Fact |
| **Tilt (Crowdtilt)** | Group collection and crowdfunding ("tilt" when the threshold is met). Raised **$2.1M + $12M + $23M**. Dropped organizer fees in Aug 2014 and kept about a **3% card processing charge** | **Bought by Airbnb in 2017 for about $12M as an acqui-hire. Retired June 2017. Never profitable** ([Wikipedia](https://en.wikipedia.org/wiki/Tilt.com)) | (a) It couldn't charge fees once **free P2P (Venmo)** existed. (b) Low-frequency use meant high customer-acquisition cost and poor retention. (c) Its revenue was processing fees with thin margins. **This is the same trap D50 identified** [Est.] | Fact / Est. |
| **Venmo Groups** | Shared-expense tracking inside Venmo (Nov 2023). **No pooled balance or card mentioned** ([PayPal newsroom](https://newsroom.paypal-corp.com/2023-11-14-Introducing-Venmo-Groups)) | Live | The incumbent with the rails still chose **tracking plus P2P settlement, not a pooled pot** | Fact |
| **Partiful Chip In** | Links out to Venmo, Cash App, PayPal or GoFundMe. "**Unverified payments from trusted guests**" ([Partiful help](https://help.partiful.com/en-us/articles/15525460-how-do-i-use-the-chip-in-feature)) | Live. Partiful earns nothing on it | **Hand-off to free P2P is the norm for friend groups** | Fact |
| **SquadTrip** | Collects through the organizer's own Stripe or Square account. **6% fee** (traveler pays). **No virtual cards** for paying vendors ([SquadTrip help](https://help.squadtrip.com/en/articles/9794592-payments-and-fees)) | Live | Organized trips (paid trip leaders) accept fees; friend groups don't | Fact |
| **Tricount / bunq** | bunq bought Tricount (**5.4M users** at the time) as an acquisition funnel ([TechCrunch](https://techcrunch.com/2022/05/03/bunq-to-acquire-group-expenses-app-tricount/)) | Tricount is now free | **The pot or card is worth more to a bank (as deposits and accounts) than to an app.** A partnership or referral may beat building it | Fact |
| **Revolut Group Bills / shared pockets; Monzo Shared Tabs / joint pots** | Neobank features for splitting and pooling among account holders | Live [Reported] | Pooling works when **everyone is already a customer of the same bank**. Our friends aren't | Reported (pages blocked) |
| **Zeta, Tandem, Pool, Kitty, Bunch** | Couples, joint and "group wallet" apps | **Could not verify current status this session** | Category pattern: most consumer "shared wallet" startups pivoted, stayed small or sold [Reported] | Unverified |

### 1.6 Regulatory path

| Question | Answer | Type |
|---|---|---|
| **Is pooling friends' money money transmission?** | Receiving money from one person to transmit to or hold for another is the core of state money-transmission laws. Two compliant structures: **(a)** ride on a licensed partner's licenses (Stripe: "**Stripe Payments Company, licensed money transmitter**"), or **(b)** have funds go **directly into a bank account** in the organizer's name, with us as the bank's service provider. **Never hold the funds in our own account.** FinCEN's rules exclude "provide prepaid access" and payment processors from the federal definition of money transmitter, but **the prepaid-access rules then apply** to the program ([31 CFR 1010.100](https://www.law.cornell.edu/cfr/text/31/1010.100)) | Fact / Est. (state laws vary; needs counsel) |
| **Is it a Reg E "prepaid account"?** | Very likely. It is a general-use account "capable of being loaded with funds" whose primary function is transactions with merchants or person-to-person transfers ([Reg E §1005.2(b)(3)](https://www.consumerfinance.gov/rules-policy/regulations/1005/2/)). That brings the **Prepaid Rule**: short-form and long-form fee disclosures, error resolution, limited liability for unauthorized use, and filing the account agreement with the CFPB | Fact (definition) / Est. (application) |
| **Who needs KYC?** | Bank guidance: "A general purpose prepaid card that **can be reloaded by the cardholder or by another party on behalf of a cardholder** … creates an account for purposes of the CIP rule," so **the cardholder (the organizer) needs full CIP/KYC** ([OCC Bulletin 2016-10](https://www.occ.gov/news-issuances/bulletins/2016/bulletin-2016-10.html)). The guidance places **no CIP duty on third parties who load funds**. Contributors paying from their own bank or debit card are identified at their own bank. In practice, **the sponsor bank will still want each contributor's name, bank-account ownership check and sanctions screening**, plus per-person and per-day load limits for AML. **Expect light verification of contributors, not full KYC.** If **anyone else gets a card** (for example a co-organizer), they need full KYC | Fact / Est. |
| **Program manager duties** | From Stripe's guide, which reflects what any bank will require: required bank disclosures and agreements, KYC fields, a **complaints program**, dispute handling, regulated notices, **money-transmission receipts**, UDAP-compliant marketing reviewed in advance (up to 10 business days), no "bank account" wording, careful FDIC pass-through wording ("eligible for…", never "FDIC insured"), and **5-year recordkeeping** ([Stripe compliance guide](https://docs.stripe.com/issuing/compliance-us)) | Fact |
| **How Synapse changed BaaS** | Synapse, a **middleware** BaaS, filed for Chapter 11 in **April 2024**. The trustee found a **$65–96M shortfall** between its records and the banks' records. About **10M end users** were affected through roughly 100 fintechs ([Wikipedia](https://en.wikipedia.org/wiki/Synapse_Financial_Technologies)). Yotta customers got back **$11.8M of $64.9M** (about 18%). The **CFPB** sued (21 Aug 2025) and won a stipulated judgment (12 Sep 2025) for failing to keep adequate records of where consumers' funds were ([CFPB](https://www.consumerfinance.gov/enforcement/actions/synapse-financial-technologies-inc/)). The **Fed** took enforcement action against **Evolve Bank** on 14 Jun 2024 over weak fintech-partnership risk management ([Fed](https://www.federalreserve.gov/newsevents/pressreleases/enforcement20240614a.htm)). Several sponsor banks received consent orders in 2024, and the FDIC proposed recordkeeping rules for custodial (FBO) accounts (Sep 2024) [Reported]. **The result:** banks now demand daily ledger reconciliation, stronger compliance staffing at the fintech, and higher minimums, and they **reject small consumer programs more often**. Avoid **middleware without a direct bank relationship**. Prefer a provider that **is** the licensed entity (Stripe) or a direct bank relationship with a ledger the bank reconciles | Fact / Reported |
| **Legal and compliance cost (year 1)** [Est.] | Fintech counsel for structure, agreements and state analysis: **$50–150K**. BSA/AML officer (fractional or full-time): **$60–200K a year**. Compliance tooling (KYC, sanctions, transaction monitoring): **$1–3 per user** plus minimums. Bank or program minimums: **$24–120K a year**. Annual independent BSA audit: **$15–40K**. **Total: about $150–400K a year.** Getting our own money-transmitter licenses would be **$1M+ and 12–24 months**, so don't | Est. |

### 1.7 Funding the pot: who pays and how to keep it free

| Method | Cost to us | User friction | Notes | Type |
|---|---|---|---|---|
| **ACH debit (pull) from a friend's bank** | Stripe ACH Direct Debit **0.8%, $5 cap** (a $375 share costs $3.00) ([Stripe](https://stripe.com/pricing)). Bank-direct next-day ACH about **$0.50** ([Increase](https://increase.com/pricing)), plus bank-linking costs [Est. $0.30–1.50] | Link the bank once (Plaid-style) | **Return risk:** a friend's ACH can bounce up to 2 days later, or be disputed as unauthorized for 60 days. Hold funds until settled | Fact / Est. |
| **ACH or RTP push** (friend sends to the pot's account number from their own bank) | **$0** to us | High: the friend must add a payee in their banking app | Reconcile using a unique account number per pot. Same idea as Stripe "push funding" | Est. |
| **Debit card pull** (account funding transaction) | Visa **Account Funding, regulated debit: 0.05% + $0.21**, but **exempt debit: 1.75% + $0.20** ([Visa](https://usa.visa.com/content/dam/VCOM/download/merchants/visa-usa-interchange-reimbursement-fees.pdf)). On interchange-plus pricing, a big-bank debit card costs about **$0.50–1.00 per $375** [Est.]. On Stripe's blended price (about 2.9% + 30¢) it costs **about $11.20 per $375** [Est.], which **wipes out the pot's interchange** | Lowest friction | Accept **debit only** (check the BIN), use interchange-plus pricing, and block credit cards or pass their cost on | Fact / Est. |
| **Venmo** | Venmo sends only between Venmo and PayPal users, with withdrawals to the user's own linked accounts ([Venmo fees](https://venmo.com/resources/our-fees/)). A **Venmo business profile** receiving payments costs **1.9% + $0.10** | — | **There is no free, programmatic Venmo-to-pot path.** A friend could withdraw to their bank, then push to the pot (two steps) | Fact |
| **Zelle** | The Zelle page couldn't be fetched. Zelle works between enrolled accounts at **participating banks and credit unions**. Sponsor-bank fintech accounts usually **can't** be enrolled | — | Assume **no Zelle** | Reported |

**How to keep it free for users** [Est.]: default to a **bank push** (free) or **ACH pull** (we pay about $0.50–3). Allow a **debit card pull** for convenience on interchange-plus pricing (about $0.50–1). Block credit cards, or show the extra cost. **Budget about $0.25–1.00 per contribution** in variable cost.

### 1.8 Interest on held funds

- **Fact:** the effective fed funds rate was **3.88%** on 29 Sep 2026, and the 4-week T-bill **3.88%** ([Fed H.15](https://www.federalreserve.gov/releases/h15/)).
- **Est.:** sponsor banks and BaaS providers commonly pass **about 1.5–3%** on FBO or program balances to the program. That is negotiable, and it needs a disclosure if we keep it.
- Paying interest to users would make the product a deposit-like account with extra disclosures, so **keep the interest at program level and don't advertise yield.**
- A **$2,500 pot held about 3 weeks** earns about **$3** [Est.]. That is meaningful next to interchange but small in absolute terms.
- **Rates are falling**, and **interest income was a prime fragility in the Synapse and Yotta model** (yield-driven products).

### 1.9 Economics per trip [Est.]

Assumptions:
- **Spend on the card** is what the organizer pays from the pot: lodging, activities, a group dinner.
- **Kept** is our net share of interchange: about 1.6% gross × 40–70%.
- **Variable costs** per trip that uses the card: virtual card $0.25, organizer KYC **$1.50** ([Stripe Identity](https://stripe.com/identity), $1.50 per document and selfie check), top-ups (contributors × cost), about $2 of support, and a 0.1% dispute and fraud reserve.

| Driver | Conservative | Base | Optimistic |
|---|---|---|---|
| Trips that use the card | 5% | 15% | 30% |
| Spend on the card per using trip | $1,200 | $2,500 | $4,000 |
| Gross interchange (about 1.6% + $0.15 × 6 transactions) | $20 | $41 | $65 |
| **We keep** | 0.6% → **$7** | 0.9% → **$22.50** | 1.1% → **$44** |
| Interest on float (rate × days held × 80% of balance) | 1.5%, 14 days → $0.60 | 2.5%, 21 days → $2.90 | 3%, 30 days → $7.90 |
| Variable costs (8–10 contributors) | −$12.90 (8 × $1 top-ups) | −$10.20 (8 × $0.50) | −$10.20 (10 × $0.25) |
| **Net per trip that uses the card** | **≈ −$5** | **≈ $15** | **≈ $42** |
| **Net per average trip** | **≈ −$0.25 (about $0)** | **≈ $2.30** | **≈ $12.50** |
| Fixed cost of about $150–400K a year needs… | — | **10–27K card trips** (about 70–180K total trips) to break even | 4–10K card trips |

**Takeaways:**
- At realistic usage, the card adds **about $0–2 per average trip**, under the base booking-link revenue of $9–15.
- It works only with **high usage on big pots**: Airbnb or houses paid from the pot, at an exempt bank, with cheap top-ups.
- Usage is the key unknown. **The POC's "Collect for the house" tracking (FR-73a) should measure this:** the % of trips that pool, the amount pooled, and how it gets paid.

### 1.10 Recommendation: group card

- **Not now.** Don't build a card in the POC or Phase 2. Fixed compliance cost and bank diligence exceed the expected revenue until we reach roughly 100K trips a year.
- **Measure first.** Use the free collection tracker (FR-73a) to log pot size, payment method, and whether the organizer fronted the money. **Go/no-go rule:** consider building only if **≥ 25% of trips pool ≥ $1,500**, and organizers say "I fronted it on my own card" is a pain point.
- **If yes (Phase 3 or later):**
  - Launch **through a provider that is itself the licensed or regulated party** (Stripe consumer issuing first, Lithic second), with a **Durbin-exempt bank** and a **debit (not prepaid) BIN** so Airbnb accepts it.
  - Use **virtual cards only** at first.
  - KYC only the organizer, with light verification and limits for contributors.
  - Fund by **bank push or ACH**, with debit-card pulls on interchange-plus pricing.
  - **Sweep leftovers back** to contributors automatically.
- **Cheaper alternative to consider first:** a **co-marketing or referral deal** with a neobank or card partner that already has group pots (the bunq/Tricount logic). They pay for accounts; we keep zero regulatory burden.

---

## Part 2: Bachelor/bachelorette and group-trip merch (print on demand)

### 2.1 Demand: how much groups spend

| Data point | Value | Type |
|---|---|---|
| Bachelorette attendance and cost | **Average 10 attendees** (bachelor 8). Average cost per attendee **$708** for bachelorettes and $1,044 for bachelors. Costs include "**personalized items or special outfits, gifts, group activities**" | Fact ([WeddingWire 2019 study](https://go.weddingwire.com/pdf/bachelor-bachelorette.pdf)) |
| Special outfits | "**Half of brides-to-be wear something special** on their bachelorette party, as opposed to only **19% of men**." This measures the bride, not the whole group | Fact (same) |
| Timing | Spring 43% and summer 35%. The top months are **April to June**, which drives seasonal merch demand | Fact (same) |
| Domestic | 92% of trips are within the continental US (simple US POD shipping) | Fact (same) |
| Shopify bach-decor store (xo, Fetti) price points | Sashes **$14–39** (median $32). Hats and hat packs **$14–49**. Cups and tumbler packs **$14–46**. Banners **$10–70** (median $25.50) | Fact (store's public product feed, `xofetti.com/products.json`, 1 Oct 2026) |
| Custom matching tees and hats on Etsy | Etsy blocked automated access. Typical observed price ranges: **custom tees $18–32**, trucker hats **$22–35**, koozies **$3–6 each in packs**, tumblers **$15–30**, often with "rush" upsells | Reported (prior knowledge; verify manually) |
| The Knot, Zola, Batch merch-spend surveys; Etsy category size | **Not obtained.** The Knot returned 403, and Etsy doesn't report a category this narrow | Gap |

**[Est.] Share of bachelorette groups buying some matching item** (shirts, hats, sashes or cups): about **40–60%**. Bachelor groups: about **10–20%**. The typical spend per bachelorette group on matching items is about **$150–400** (10 people × $15–40).

### 2.2 Print-on-demand economics

**Printful (catalog API, 1 Oct 2026)** [Fact] ([api.printful.com/products](https://api.printful.com/products); [Printful shipping](https://www.printful.com/shipping)). Prices are base cost with one print included. Extra print placements are listed in the right-hand column.

| Item | Base cost | Extra placements |
|---|---|---|
| Unisex tee, Bella+Canvas 3001 | **$11.92** (to $19.92 for 2XL+) | Left or center chest +$2.95; back print +$5.95 |
| Gildan 64000 softstyle tee (budget) | **$9.63** | Same |
| Comfort Colors 1717 tee (premium, popular for bach parties) | **$15.60** | Same |
| Bella+Canvas 3480 tank | $14.51 | — |
| Women's micro-rib tank (B+C 1012) | $16.13 | — |
| Comfort Colors 9360 tank | $18.43 | — |
| Classic dad hat (Yupoong 6245CM), embroidered | **$14.94** | — |
| Retro trucker hat (Yupoong 6606), embroidered | **$13.56** | — |
| 16 oz clear double-wall tumbler (UV print) | **$10.35** | — |
| Wine tumbler | $17.64 | — |
| Can cooler (koozie) | **$3.49** | — |
| Pennant | $14.62 | — |
| Die-cut stickers | $3.86–6.08 | — |

**Printful shipping and timing** [Fact]:
- US flat-rate apparel shipping: **$4.95 for the first item, +$2.20 for each additional item**.
- Fulfillment takes **2–5 business days**. Standard shipping takes **3–4 business days**; express takes **1–3**.
- So delivery is about **5–9 business days standard**, and "**not a guarantee**."

**Other providers:**

| Provider | Finding | Type |
|---|---|---|
| **Printful API** | Order creation, **mockup generator API**, file upload, shipping-rate and cost estimates, webhooks, custom packing slips. **120 calls a minute.** Requires a Printful store (the "manual orders / API" platform) ([Printful API docs](https://developers.printful.com/docs/)) | Fact |
| **Printify** | API open to **all merchants** with a personal token. **Platforms that manage many merchants need OAuth app approval (up to 1 week).** 600 requests a minute ([Printify developers](https://developers.printify.com/)). Premium plan **$24.99/mo billed yearly** for up to 33% off base costs. Printify's own example: a **$8.77** fulfillment cost for a tee ([Printify pricing](https://printify.com/pricing/)). Base costs vary across 70+ print providers | Fact |
| **Gelato** | Pricing page blocked (403). Pitches local production in 30+ countries and has an API, including **photo books** | Reported |
| **Custom Ink** | Group orders, screen print and DTG. Pages not readable this session. Per-shirt costs for 10–12 pieces typically land around **$20–30** delivered, with standard delivery in about 2 weeks and a paid rush option. **No consumer API for in-app ordering** | Reported (verify) |
| **Bonfire** | Campaign-style group stores ("everyone buys their own size"). Page not readable. Fits the **"each person pays for their own"** model, but campaigns usually print after the campaign closes (about 2+ weeks) | Reported |

**Quality and reliability complaints** [Fact, review sites]:
- **Printful:** Trustpilot **4.2/5** (7,904 reviews), **11% one-star**. Recurring themes: **production taking 12+ business days** against 2–5 advertised, misprints or off-center prints, lost packages and dismissive support ([Trustpilot](https://www.trustpilot.com/review/printful.com)).
- **Printify:** **4.5/5** (7,656 reviews), 5% one-star. Delays of up to 2 weeks and occasional blurry prints ([Trustpilot](https://www.trustpilot.com/review/printify.com)).
- **Implication:** a late bachelorette order is a **total loss** (the trip has happened). Build in a **hard order-by date of 14–21 days before the trip**, offer express shipping, and offer a **"guaranteed by" refund**.

**Margin per item at market prices** [Est.]:
- Assumes a group order of 10 shipped to the organizer, a Printful base cost, shipping spread across the order (about $2.48 per item), payment processing of about 2.9% + 30¢ on one group charge, and a 3% reprint allowance.

| Item | Market price | Our cost (base + shipping share + processing + reprints) | **Margin per item** |
|---|---|---|---|
| Tee (B+C 3001), one print | $25 / **$28** / $32 | about $15.60 | **$9.40 / $12.30 / $16.20** |
| Tee with front plus back ("Bride Squad" + names) | $32 | about $21.70 | about $10 |
| Comfort Colors tee | $32 | about $19.30 | about $12.70 |
| Embroidered trucker or dad hat | $28 | about $17–18.50 | about $9.50–11 |
| 16 oz tumbler | $18 | about $13.40 | about $4.60 |
| Koozie | $6 | about $6.20 (shipping dominates) | **≈ $0**. Sell only in a bundle |

**Blended margin:** about **$8–12 per item** on an apparel-heavy order, which works out to about **35–45% of retail**.

### 2.3 In-app design generated from the theme poll

**Feasibility** [Est.]:
- **High.** Most bachelorette merch is **typography plus a simple icon**: "Last Rodeo," "Nash Bash," "Bride/Babe," the bride's name, a date, a city, a disco ball or cowboy hat.
- That can be built as **vector templates**, with the LLM (Claude, already in our stack) writing the slogans and choosing a template, palette and font from the **winning theme poll** and the trip data (city, dates, names).
- **No image-generation model is needed for version 1.** That avoids cost, sameness of outputs, and IP risk from generated art.
- Render with **Printful's mockup generator API**, collect sizes from each member in the group thread, take one group payment (or each person pays), then submit a single order through the API.
- Add optional AI illustration later through a third-party image model, with human review.

**IP and trademark pitfalls:**

| Risk | Detail | Type |
|---|---|---|
| **City names** | A city or place name alone is generally descriptive or geographic and free to use in plain text. **Stylized official marks are not**, for example city seals or **tourism slogans**. "**What happens here, stays here**" is the Las Vegas tourism authority's (LVCVA's) slogan and is registered | Reported (verify on USPTO) |
| **Team and league logos** | NFL, NBA, MLB, NCAA, and pro and college colors with logos are aggressively enforced. **Block team names and logos.** Generic colors are fine | Reported / Est. |
| **Popular bach themes** | "**Barbie**" (Mattel), "Yellowstone" (Paramount), Taylor Swift ("Eras"), Disney, "Margaritaville," Coachella, beer and liquor brands. Theme polls often surface these. **Keep a denylist** and rewrite to generic versions ("Last Disco," "Coastal Cowgirl," "Pink Era") | Reported / Est. |
| **POD enforcement** | POD providers remove infringing products, and repeat strikes can close the account. We are the **seller of record**, so **we carry the liability**, not each user | Est. (Printful's IP policy page didn't load) |
| **Copyright in AI output** | The US Copyright Office's **Part 2 report (29 Jan 2025)** addresses AI outputs: purely prompt-generated material lacks human authorship, so **we can't stop copycats of AI-only art**, though human-arranged templates can be protected ([copyright.gov/ai](https://www.copyright.gov/ai/)) | Fact (date) / Reported (conclusion) |
| **Names and photos of people** | Putting the bride's photo on merch needs her consent. **Surprise rules (FR-91)** apply: merch mockups must never be shown to the bride, through the group chat or otherwise | Est. |

### 2.4 Other keepsakes: photo books

| Item | Finding | Type |
|---|---|---|
| **Polarsteps** | Printed **travel books are its main revenue**, with **€10M+ revenue in 2024, profitable, 18–19M users** (see [`monetization-benchmarks.md`](monetization-benchmarks.md) §3). Founders say books funded growth so they don't need to sell data ([Startuprad interview](https://www.startuprad.io/post/polarsteps-growth-privacy-first-travel-app-at-18m-users-startuprad-io)). **Book prices and attach rate couldn't be fetched** (JavaScript-only site) | Fact / Reported |
| **Shutterfly** | About **$2.0B revenue (2018)**. Taken private by **Apollo for $2.7B (2019)**. About **50% of consumer revenue comes in Q4** (holiday gifting) ([Wikipedia](https://en.wikipedia.org/wiki/Shutterfly), [Shutterfly 10-K FY2018](https://www.sec.gov/Archives/edgar/data/1125920/000112592019000008/sfly-20181231.htm)) | Fact |
| **Chatbooks** | Pricing page rate-limited (429). Not verified | Gap |
| **Why it's weaker for us** [Est.] | Polarsteps users track **multi-week journeys** with auto-logged routes. Our trips are **2–4 day weekends** with most photos in the group chat. A book is a nice-to-have, and **the bride is the natural buyer** (often as a gift from the maid of honor). **Est. attach 2–8% of trips**, 1–2 books, **$12–22 margin** per book (a POD hardcover costs about $15–25 to make and sells for $40–60) | Est. |

### 2.5 Merch revenue per trip [Est.]

Applies to **bachelor/bachelorette trips**. Other group trips are likely to attach at under a third of these rates.

| Driver | Conservative | Base | Optimistic |
|---|---|---|---|
| Attach rate (trips that order through us) | 4% | 10% | 20% |
| Items per ordering trip | 8 | 11 | 18 (tee + hat or koozie) |
| Margin per item | $6 | $9 | $12 |
| **Revenue per ordering trip** | $48 | $99 | $216 |
| **Merch per average bach trip** | **≈ $1.90** | **≈ $9.90** | **≈ $43** |
| Plus photo books (2% × 1 × $12 / 4% × 1.3 × $18 / 8% × 2 × $22) | $0.25 | $0.95 | $3.50 |
| **Total keepsakes per bach trip** | **≈ $2** | **≈ $11** | **≈ $47** |

**Fixed and variable costs** [Est.]:
- About **2–4 weeks of engineering** to build it: template library, mockups, size collection, Printful order and webhooks.
- Ongoing work: design and denylist upkeep, plus **support and reprints** (budget 3–5% of orders).
- No regulatory overhead beyond **sales tax**. As seller of record we collect it; marketplace facilitator and economic nexus rules apply as volume grows, so use a tax API.

**Why base attach is 10% rather than 40–60%:**
- Etsy, Amazon and local printers dominate, and organizers often order 4–8 weeks before the trip, before they're active in our app.
- POD delivery times are slow.
- Many groups want cheap packs (sashes or koozies) where POD margins vanish.

### 2.6 Recommendation: merch

- **Build it in Phase 2** for bachelor/bachelorette trips. It fits D50: it's an optional purchase **at market prices**, and nobody pays extra to use the app.
- **Trigger it** from the decided theme poll: "Your squad picked *Last Rodeo*. Want matching shirts?" Show **3 AI-written, template-rendered designs** with the bride's name, city and dates, and live mockups.
- **Collect sizes in the thread**, then let people **pay their own** (better) or let the organizer pay.
- **Ship one box to the organizer** with an **order-by date at trip date minus 21 days**, and **express shipping** after that. Below 10 days, don't offer it.
- **Use Printful first** (best API and mockups, US production). Add Printify as a cheaper second provider later.
- **Start with tees, tanks, trucker hats and tumblers.** Bundle koozies and stickers.
- **Keep an IP denylist** (teams, Barbie, Vegas slogans, celebrity names).
- **Measure in the POC now at near-zero cost:** add a **fake-door "Make squad merch" card** after the theme poll, and record taps, the theme, and days until the trip.

---

## 3. Side by side

| | Group trip card | Merch (+ photo books) |
|---|---|---|
| Per average trip: conservative / base / optimistic | **≈ $0 / $2 / $12** | **≈ $2 / $11 / $47** (bach trips) |
| Year-1 fixed cost | **$150–400K** a year (compliance, bank, legal) | **About 2–4 engineer-weeks**, then low |
| Regulatory burden | High (Reg E prepaid, BSA/AML, state money transmission through a partner, bank oversight after Synapse) | Low (sales tax, IP) |
| Main risks | Low usage (Venmo is free and familiar), bank rejection or minimums, Airbnb card acceptance, funding-cost leakage, partner failure | Late delivery (total loss), quality complaints, IP takedowns, seasonality (Apr–Jun) |
| When | **Phase 3 or later**, only if pooling data supports it | **Phase 2.** Fake door in the POC now |

## 4. Gaps and items to verify

- **Issuer economics:** get written quotes (interchange split, minimums, consumer-program eligibility) from **Stripe Issuing (consumer)**, **Lithic** and one bank-direct option. None publish their split.
- **Airbnb:** its MCC, and the real interchange on a test transaction. Whether a fintech **debit** BIN is accepted, and whether **prepaid** is rejected outside Klarna. Vrbo's card rules.
- **Sponsor bank assets:** confirm each candidate bank is under $10B, so the Durbin exemption holds.
- **State money transmission:** counsel's opinion on the "bank account in the organizer's name, contributors push funds" structure versus riding on Stripe's licenses.
- **Merch demand data:** The Knot, Zola and Batch surveys on matching apparel spend (blocked this session). Manually sample about 30 Etsy listings for bachelorette tees and hats to firm up market prices.
- **Polarsteps book prices and attach rate; Chatbooks pricing; Custom Ink and Bonfire group pricing and lead times.**
- **Precedents not verified:** Revolut Group Bills and shared pockets, Monzo Shared Tabs, Zeta, Tandem, Pool, Kitty, Bunch.
