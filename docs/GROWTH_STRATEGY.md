# Growth Strategy — the path to $1M ARR

> Written 2026-08-29. Market figures are cited inline; product figures come from
> the code in this repo. **This document contains no live business metrics** —
> nobody running it had database access. Every place a real number belongs is
> marked **[PULL]** with the endpoint that produces it. Fill those in before
> acting on anything here; a plan built on assumed traction is a guess.

---

## 1. The number, and what it actually takes

$1M ARR is a seat-count problem before it is a marketing problem. At today's
prices:

| Path | Price today | Seats needed for $1M |
|------|-------------|----------------------|
| Consumer monthly | $9.95/mo | ~8,400 paying subscribers |
| Consumer annual (new) | $99/yr | ~10,100 subscribers |
| School — small tier | $2,500 / 500 students = **$5.00/seat** | 200,000 students (400 schools) |
| School — medium tier | $7,500 / 2,000 = **$3.75/seat** | 267,000 students (133 schools) |
| School — large tier | $15,000 / 5,000 = **$3.00/seat** | 333,000 students (67 schools) |

Two things fall out of that table immediately.

**The school tiers get cheaper per seat as they get bigger, which is backwards.**
Cost to serve scales with *usage*, and usage scales with students. The large tier
prices the highest-cost customer at the lowest rate. That is a discount for
volume applied to a variable-cost product.

**The prices are 3–7× under the market comparable.** Khanmigo sells to districts
at [$15–35 per student per year](https://www.edusageai.com/blogs/how-much-does-khanmigo-cost-pricing-for-teachers-and-schools-in-2026);
MagicSchool's [district plans start around $3,000/year](https://academicaitrends.com/blog/magicschool-ai-vs-khanmigo-for-teachers/).
Mathmatix at $3–5 is not "the affordable option" — it is priced as though the
buyer will not believe it is real.

Underpricing here does not buy volume. In K-12 nobody buys because the price is
$3 instead of $12; they buy because a principal trusts it and it survived
procurement. The low price just means each closed deal is worth a third of what
it should be, and $1M needs three times as many of the hardest thing to get.

**Recommendation: reprice the school tiers to $10–12/seat with a $2,500 floor,
flattening rather than declining with volume.** That is still 30–65% under
Khanmigo. It changes $1M from 133 medium schools to roughly 40. It does not
change the product, the pitch, or the sales effort — only what each yes is worth.

> I have not made this change in code. Price is the founder's call and it is
> visible to existing customers; the annual consumer plan I did ship is additive
> and reversible, this is neither.

### The honest timeline

Consumer freemium converts at [2.6% in edtech, 2–8% across mature
platforms](https://userpilot.com/blog/freemium-to-premium/). At 4%, 10,000
subscribers means ~250,000 free signups. That is not reachable in a year without
paid acquisition, and paid acquisition against a $99 LTV is thin.

So: **$1M ARR is a 24–36 month goal, and it comes from schools.** The consumer
business is not the destination — it is what funds the runway, proves the
product, and generates the density signal that opens schools. Plan against
roughly $150–250K in year one, $500K in year two, $1M in year three, and treat
any single district win as the thing that pulls that forward.

---

## 2. What the 2026 market actually rewards

Four findings shaped everything below.

**Engagement is the industry's open wound.** Khan Academy is
[redesigning Khanmigo after admitting only about 15% of students use
it](https://aitoolsbakery.com/blog/khanmigo-updates-2026/), across 700,000
students and 380+ districts. The category's problem is not capability. Every
vendor has a competent model. The problem is that students do not come back.

**Proof beats promise.** The most useful vendor claim in 2026 is
["here's how you'll know it helped" rather than "students will use
it"](https://www.marketscale.com/industries/education-technology/k-12-ai-spending-is-moving-from-classroom-apps-to-vetting-policy-and-proof).
Districts are shifting AI spend toward vetting, policy and validation.

**Budgets are contracting and technology is first on the block.** Post-ESSER,
districts are cutting [about $1,200 per student](https://www.idra.org/education_policy/what-you-need-to-know-about-the-esser-funding-cliff/),
and [experts name technology as the chopping-block
category](https://www.govtech.com/education/k-12/experts-push-student-focused-budgeting-as-esser-winds-down).
The same reporting says districts are using *usage data and third-party
validation* to decide what survives. A tool that cannot produce evidence gets
cut regardless of quality.

**Teacher density predicts the close.** For one classroom app,
[five active teachers at a school produced close rates more than 10× cold
outbound](https://grahamforman.medium.com/key-product-led-growth-plg-measures-and-benchmarks-for-k12-b2b-edtech-companies-7082ffe6c358),
and the most compelling sales argument was usage data showing teachers already
using the free tier.

Meanwhile demand is not the problem: 8th-grade NAEP math is
[down 11 points since 2013](https://brighterly.com/blog/homework-statistics/),
45% of 12th graders are below NAEP Basic, families now spend
[18% of household income on academic help, up from 12%
pre-pandemic](https://cogconnected.com/2026/07/how-much-does-a-math-tutor-cost-in-2026-what-parents-need-to-budget/),
and math tutoring runs $40–60/hour. Mathmatix+ at $9.95/month costs less than
fifteen minutes of the thing it replaces.

---

## 3. Counter-positioning: what this product has that the category doesn't

Against "every vendor has a competent model," three things here are genuinely
hard to copy — and none of them are the tutor's answer quality.

**It remembers the student.** `models/tutorPlan.js` is a persistent mental model
per child — skill focuses, notes, instructional mode — updated every turn by the
pipeline. Combined with `skillMastery`'s four pillars and BKT/FSRS scheduling,
the tutor on session 20 knows things the tutor on session 1 did not. Most
competitors are stateless per conversation. This is the answer to the 15%
engagement problem, and it is the marketing claim already on the landing page
("a math tutor that actually knows your child").

**It refuses to be an answer machine.** The anti-cheat safeguards, the
math-answer injection gate, and the assistance ladder are real pedagogy
constraints in code. In a market where [most AI study tools are answer
machines](https://aitoolsbakery.com/blog/best-ai-tutoring-apps/), this is what
a department head is actually worried about, and it is demonstrable in 30
seconds on the landing-page trial.

**It follows IEPs.** `models/iepPlan.js`, the accommodations engine and the
fluency baseline are special-education infrastructure that general-purpose
tutors do not have. This is a wedge with a budget attached — IEP compliance is
a legal obligation, not a nice-to-have, and it is funded separately from
general instructional technology. **This is the most under-exploited asset in
the codebase.**

The founder is a working math teacher with live classrooms and a published
course site. In a channel where [teachers see each other as peers rather than
following leaders](https://onlinelibrary.wiley.com/doi/10.1111/ejed.70434),
that is not a bio detail — it is the distribution.

---

## 4. The three plays

### Play 1 — Price for the business you want (0 CAC, fastest)

- **Shipped: annual Mathmatix+ at $99/yr** (`routes/billing.js`). The recurring
  interval was hard-coded to `'month'`, so an annual plan could not exist.
  The point is churn, not the discount: a monthly term puts the renewal decision
  in the exact month a student stops having homework. **[PULL]** annual mix after
  30 days.
- **Recommended: school tiers to $10–12/seat, flat with volume** (§1).
- **Recommended: meter voice inside school licenses.** Text inference is cheap —
  `docs/AI_COST_PROJECTIONS.md` puts a 1,000-student district near $78/month on
  `gpt-4o-mini`, well under $1/seat/year. Voice (Cartesia TTS + Deepgram STT) is
  per-minute and the license grants it unlimited. At $3/seat, a genuinely engaged
  voice cohort is where gross margin goes negative — the failure mode where
  success costs money. Measure cost-per-active-student before scaling the large
  tier, not after.
- **Open gap: monthly subscribers cannot switch to annual.** Checkout rejects
  anyone already on `unlimited`, and they are the likeliest annual buyers. Needs
  a Stripe subscription swap with proration; deliberately out of scope here
  because a half-built upgrade path is worse than none.

### Play 2 — Make the proof a product (the procurement unlock)

The single highest-leverage fact in this repo: **the efficacy engine already
exists and nothing was reading it.** Growth checks store a before and an after
per student in `learningProfile.growthCheckHistory` — IRT theta, quarterly. That
is an effect measurement, sitting unused above the level of one child.

- **Shipped: `GET /api/admin/impact-report`** (`utils/impactReport.js`) —
  cohort growth for a school license, a teacher's roster, or the platform:
  mean/median theta gain, 95% CI, standardized gain, grade-level months,
  the grew/stable/declined split, and participation.
- It is built to survive being checked, because every plausible bug in a sales
  artifact points the same way — toward a number that flatters us. It measures
  the *undamped* theta so real declines can't hide behind `growthGuard`; counts
  unmeasured students in the cohort but never as zeros; withholds inference below
  ten students; and ships `caveats` **inside the payload**, including that this
  is a pre/post cohort with no control group and supports no causal claim.
- **This restraint is the strategy, not a hedge against it.** The buyer is a
  district that has been pitched by vendors all year. A report that states its
  own limits is the one that survives a curriculum director reading it closely,
  and overclaiming once in this market is unrecoverable.
- **Next:** render it as a one-page PDF a principal can forward, and mail it to
  every licensed school in June and January unprompted. Renewal is won in the
  month the budget is written, not the month it expires.

### Play 3 — Read the pipeline the free tier is already building

Teachers get free unlimited access to create density. Nothing could see it:
`schoolLicenseId` is set when a license is *bought*, so the only school
affiliation on an account identifies customers, never prospects.

- **Shipped: `GET /api/admin/school-signals`** (`utils/schoolSignal.js`) —
  clusters teachers by email domain, ranks by active teachers → student reach →
  minutes, flags clusters over the outreach threshold, and marks fully licensed
  ones as renewals. It needs no new signup field and works retroactively on
  every account already in the database. Consumer mailbox domains are excluded
  outright: the expensive failure is a false positive.
- **[PULL]** run it. The output is the year-one target list, ranked. If it
  returns nothing, that is the finding — the free teacher tier is not producing
  density and Play 3 is blocked until it does.
- **Next, in order:**
  1. Add an optional school field at teacher signup — the domain proxy is a
     stopgap and misses anyone on personal email.
  2. Ship a teacher→colleague invite. There is an affiliate program for external
     promoters and no loop for the users who actually create density.
  3. **List on Clever Library.** Clever SSO and roster sync are already built
     (`services/cleverSync.js`) — the integration cost of the largest K-12
     distribution channel is already sunk, and nothing is using it for
     acquisition.

---

## 5. Channel plan

Ranked by expected return per founder-hour, not by reach.

**1. Teacher-to-teacher, in the founder's own district.** Highest trust, lowest
cost, and it directly produces the Play 3 signal. Concrete: get three teachers in
one building active, run the impact report on that building at the 90-day mark,
take it to the principal. That is a repeatable motion, and it is the only one on
this list that can be running next week.

**2. IEP / special education.** The most under-exploited asset here (§3). SPED
directors are a small, reachable, high-intent audience with a separate budget and
a legal obligation, and almost no AI tutor speaks to them. One conference talk or
one state SPED listserv is worth more than a month of general content.

**3. Content, sourced from real data.** `utils/transcriptMiner.js` already runs a
nightly sweep over production transcripts for tutor-quality findings. Nobody else
has this supply: *"the mistake 6 in 10 Algebra 1 students actually make on
two-step equations — from 4,000 real tutoring sessions."* That is a genuinely
original post, it is defensible, and it markets the pedagogy rather than the
product. **Compliance first: this is student data.** Aggregate-only, k-anonymity
floor, no transcript excerpts, and run it past the FERPA posture in
`docs/STUDENT_DATA_SECURITY_AUDIT.md` before a single post. If that review says
no, the play dies there.

**4. Parent search intent.** "why is my kid failing algebra", "how much does a
math tutor cost". High intent, low competition against the $40–60/hour
alternative. Slow to compound; start now because of that, not instead of the
above.

**5. Short-form video.** Real classroom credibility is the whole asset here, and
the format rewards it. But it is the highest effort per unit of qualified
pipeline on this list, and it does not produce school density. **Do it fifth, or
not at all, until 1–3 are running.**

> **On "you run social media": I can't, and didn't.** No account credentials are
> connected to this session and I have not posted anything anywhere. What I can
> do is what's above — the strategy, the ranking, and the product work that makes
> the channels worth running. Posting needs either a human or connected accounts.

---

## 6. What to measure

Four numbers. If a dashboard shows more than these on the front page, it is
hiding them.

| Metric | Where | Why |
|--------|-------|-----|
| **Active teachers per school** | `GET /api/admin/school-signals` | The only leading indicator of a school sale. |
| **Cohort theta gain + participation** | `GET /api/admin/impact-report` | The thing that renews a license. Participation is half the metric — gains on 15% of a roster is not a school result. |
| **Signup → activation** | `GET /api/admin/funnel` | Activation is doing real tutoring at all. Everything downstream is bounded by it. |
| **Cost per active student** | not yet built | Whether the school tiers make money at scale. Voice is the risk (§4). |

**[PULL] all four before deciding anything in this document.** Two are new and
have never been run; the funnel was undercounting multi-role accounts until this
week and its historical conversion rates read high as a result.

---

## 7. The strategy in one paragraph

Mathmatix does not have a product problem. It has ~70 shipped features, real
pedagogy in code, and a live school using it. It has a **pricing problem** (3–7×
under market, inverted with volume), a **proof problem** (an efficacy engine that
nothing read), and a **pipeline-visibility problem** (a free teacher tier
generating density nobody could see). Two of those three are fixed in this
branch. The third is a founder decision that takes an afternoon and is worth
roughly 3× per closed deal. The path to $1M is not more features — it is charging
what the product is worth, proving it worked, and reading the pipeline the free
tier has been quietly building the whole time.
