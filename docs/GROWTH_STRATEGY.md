# Growth Strategy — the path to $1M ARR

> Written 2026-08-29; revised the same day after an independent second pass
> re-verified every claim and re-ran the market research. Where the two passes
> disagreed, this version says so explicitly — the disagreements are the most
> useful part. Market figures are cited inline; product figures come from the
> code in this repo. **This document contains no live business metrics** —
> nobody who wrote it had database access. Every place a real number belongs is
> marked **[PULL]** with the endpoint that produces it. Fill those in before
> acting on anything here.

---

## 1. The number, and what it actually takes

$1M ARR is a seat-count problem before it is a marketing problem. At today's
prices:

| Path | Price today | Seats needed for $1M |
|------|-------------|----------------------|
| Consumer monthly | $9.95/mo | ~8,400 paying subscribers |
| Consumer annual | $99/yr | ~10,100 subscribers |
| School — small tier | $2,500 / 500 students = **$5.00/seat** | 200,000 students (400 schools) |
| School — medium tier | $7,500 / 2,000 = **$3.75/seat** | 267,000 students (133 schools) |
| School — large tier | $15,000 / 5,000 = **$3.00/seat** | 333,000 students (67 schools) |

Two things fall out of that table.

**The school tiers get cheaper per seat as they get bigger, which is backwards.**
Cost to serve scales with *usage*, and usage scales with students. The large
tier prices the highest-cost customer at the lowest rate — a volume discount
applied to a variable-cost product.

**The prices are 3–7× under the B2B comparable.** Khanmigo sells to districts at
[$15–35 per student per year](https://www.edusageai.com/blogs/how-much-does-khanmigo-cost-pricing-for-teachers-and-schools-in-2026);
MagicSchool's [district plans start around
$3,000/year](https://academicaitrends.com/blog/magicschool-ai-vs-khanmigo-for-teachers/).
Nobody in K-12 buys because a seat is $3 instead of $12; they buy because a
principal trusts it and it cleared procurement. The low price just makes each
hard-won yes worth a third of what it should be.

**Recommendation (sharpened in revision): change the *list* price now, while
there is almost nobody to anger.** Set new-customer school pricing at
$10–12/seat with a $2,500 floor, flat with volume; grandfather any existing
license at its current rate. That is an afternoon of work with zero
customer-visible risk, and it changes $1M from ~133 medium schools to roughly
40. Still 30–65% under Khanmigo.

### The honest timeline

Consumer freemium converts at [2.6% in edtech, 2–8% across mature
platforms](https://userpilot.com/blog/freemium-to-premium/). At 4%, 10,000
subscribers means ~250,000 free signups — not reachable in a year without paid
acquisition, and paid acquisition against a $99 LTV is thin.

**$1M ARR is a 24–36 month goal.** Plan against roughly $150–250K in year one,
$500K in year two, and treat any single multi-school win as the thing that
pulls the schedule forward.

---

## 2. What the 2026 market actually looks like

Five findings, re-verified independently. The fifth changed the plan.

**Engagement is the category's open wound.** Khan Academy is
[redesigning Khanmigo after admitting only about 15% of students use
it](https://aitoolsbakery.com/blog/khanmigo-updates-2026/), across 700,000
students and 380+ districts. The problem is not model capability; it is that
students do not come back.

**Proof beats promise.** The most useful vendor claim in 2026 is
["here's how you'll know it helped," not "students will use
it"](https://www.marketscale.com/industries/education-technology/k-12-ai-spending-is-moving-from-classroom-apps-to-vetting-policy-and-proof),
and post-ESSER districts are cutting
[about $1,200 per student](https://www.idra.org/education_policy/what-you-need-to-know-about-the-esser-funding-cliff/)
with [technology first on the block](https://www.govtech.com/education/k-12/experts-push-student-focused-budgeting-as-esser-winds-down).

**Teacher density predicts the close.** For one classroom app,
[five active teachers at a school produced close rates more than 10× cold
outbound](https://grahamforman.medium.com/key-product-led-growth-plg-measures-and-benchmarks-for-k12-b2b-edtech-companies-7082ffe6c358).

**The consumer shelf is not "$80/hour tutors."** The first draft benchmarked
$9.95/mo against human tutoring. The actual shelf a parent sees:
[Khanmigo Family at $4/month or $44/year covering up to ten
children](https://www.kidsaitools.com/en/articles/khanmigo-review-2026), and
answer engines above Mathmatix's price —
[Gauth Plus at $11.99/mo, Photomath Plus at ~$9.99/mo with 100M+
downloads](https://tutoraisolver.com/blog/gauth-vs-photomath-2026-best-ai-stem-solver-alternatives).
Two consequences: **price is not the consumer wedge in either direction** (hold
$9.95/$99 — don't cut against Khan's non-profit pricing, don't raise into
answer-engine territory), and the sale must be what the $4 product doesn't do:
remembers the child (`tutorPlan`), follows IEPs, shows the parent everything,
refuses to be an answer machine. Demand context still holds — NAEP 8th-grade
math [down 11 points since 2013](https://brighterly.com/blog/homework-statistics/),
families spending [18% of household income on academic
help](https://cogconnected.com/2026/07/how-much-does-a-math-tutor-cost-in-2026-what-parents-need-to-budget/).

**The district-tutoring vendor category is collapsing in real time.** [Varsity
Tutors for Schools shut down August 7, 2026 — three weeks before this
writing](https://govspend.com/blog/varsity-tutors-for-schools-shuts-down-where-online-tutoring-demand-goes-next/).
[FEV Tutor shut down; experts cited lack of
evidence](https://www.the74million.org/article/major-virtual-tutoring-provider-shuts-down-experts-cite-lack-of-evidence/).
[Paper lost Boston, Hillsborough, Clark County and Detroit over low
usage](https://www.chalkbeat.org/2023/9/6/23861330/online-tutoring-company-paper-hillsborough-clark-county-schools/).
Read both ways: the evidence artifact (§4, Play 2) is now existential, not
nice-to-have — the autopsy of every dead vendor reads "low usage, no proof,"
which are precisely the two numbers the impact report leads with. And the
near-term public-district sales motion is the coldest it has been in a decade:
burned buyers, contracting budgets, and a "will you exist next year?" question
every small vendor now inherits. **Public districts are the year-three market,
not the year-one market.**

---

## 3. The wedge the first draft missed: sell where you already teach

The founder teaches Algebra 1 and Honors Geometry at **St. Charles Preparatory
School** — a private Catholic prep school — and the course site
(`public/courses/`) is already live in front of those students, tutor link and
all. That is not a detail; it is the go-to-market:

- **Private and parochial schools never had ESSER**, so they are not on the
  cliff. Tuition-funded budgets, and parents already paying for education.
- **Procurement is a principal's decision**, not an RFP cycle. The sales
  motion is a conversation and an invoice, closable in weeks.
- **The network is referential.** Catholic schools cluster in diocesan
  systems and meet at NCEA; ~6,000 schools nationally. One flagship with a
  quarterly impact report travels: St. Charles → Columbus-diocese peers →
  the conference circuit.
- **The founder is inside the building.** Trust — the thing every dead
  tutoring vendor lacked — is already established.

The motion: make St. Charles the flagship (license it, even at a founding-school
rate), run `GET /api/admin/impact-report` on it quarterly, and walk the
one-pager to peer principals. Aim: 3–5 parochial schools by June 2027. At
repriced seats, that is $25–60K ARR from a network the founder already belongs
to — and the reference base that makes year-three district sales possible.

(Checked and dead: Ohio's ACE educational-savings program, which paid families
$1,000/child for tutoring, [ended October
2025](https://education.ohio.gov/ohioace) — do not chase it. ESA programs in
other states (AZ, FL) may admit AI tutoring as a qualifying expense; verify
per-state before building anything.)

---

## 4. The plays

### Play 1 — Retention is the strategy (the gap the first draft never looked at)

Every dead competitor died of the same disease: students stopped showing up.
Mathmatix's differentiator — the tutor that remembers your child — is
*specifically* a retention thesis. Yet nothing automated ever touched a dormant
user: the weekly digest **deliberately skips inactive kids** (by design, to
avoid "your child did nothing" emails), nudges are in-app only, and the one
reactivation campaign was a manual script with a dry-run default — a human
remembering to run it was the entire retention system.

- **Shipped: the reactivation campaign is now one Render-cron line from
  scheduled** (`npm run cron:reactivation`). It stays inert until the founder
  sets `CAMPAIGN_MAILING_ADDRESS` (the script refuses to send without it) and
  creates the cron; the 14-day per-student resend guard makes a weekly
  schedule safe. Also fixed: it queried on bare `role` and missed multi-role
  students.
- **[PULL]** dormancy first: how many students with ≥5 tutoring minutes have
  no login in 14 days? (The campaign's own dry run prints this.) That number
  is the retention baseline everything else is judged against.
- **Next, in order:** a "streak about to break" nudge that reaches a student
  *outside* the app; a parent-digest line for the *dormant* kid ("Maya hasn't
  seen Jayden in two weeks — here's a one-click restart") replacing the
  silent skip; win-back for lapsed Mathmatix+ subscribers (there is
  currently none).

### Play 2 — Make the proof a product (verified; now existential)

Growth checks store a per-student before/after (IRT theta, quarterly) in
`learningProfile.growthCheckHistory`; nothing read it above one child until
`GET /api/admin/impact-report` (`utils/impactReport.js`). Verified in the
second pass: measures the *undamped* theta so real declines can't hide behind
`growthGuard`; counts unmeasured students but never as zeros; withholds CI
and effect size below ten students; ships `caveats` inside the payload,
including that a pre/post cohort with no control group supports no causal
claim. The distribution buckets delegate to `growthSummary`'s thresholds, so
the report cannot call "growth" what the student was told was "stable."

That restraint is the strategy. Every vendor autopsy in §2 cites missing
evidence; a report that states its own limits is the one that survives a
curriculum director reading it closely. **Next:** render it as a one-page PDF;
send it to every licensed school in June and January unprompted. The quarterly
St. Charles report (§3) is the first real instance.

### Play 3 — Price for the business you want

- **Shipped: annual Mathmatix+ at $99/yr.** The checkout interval was the
  hard-coded string `'month'`; an annual plan could not exist. The point is
  churn: a monthly term puts the renewal decision in the exact month a student
  stops having homework. Trials stay monthly-only (a 7-day trial converting to
  one $99 charge is the dispute shape). Second-pass fixes: the manage panel no
  longer tells annual subscribers they're on "$9.95/mo," and no longer offers
  a meaningless 1–3-month pause on a yearly term.
- **Recommended: school list price to $10–12/seat, flat, grandfathering
  existing** (§1).
- **Watch: voice economics inside licenses.** Text inference is cheap
  (`docs/AI_COST_PROJECTIONS.md` is stale — Jan-2025 prices — but the order of
  magnitude holds: well under $1/seat/year). Voice is per-minute STT+TTS and
  licenses grant it unlimited; an engaged voice cohort at $3/seat is where
  margin goes negative. Measure cost-per-active-student before scaling any
  large-tier deal.
- **Open gap: monthly→annual upgrade.** Checkout rejects existing `unlimited`
  subscribers — the likeliest annual buyers. Needs a Stripe subscription swap
  with proration; left undone deliberately.

### Play 4 — Read the pipeline the free tier is already building

Teachers get free unlimited access to create in-building density (the 10×
signal in §2), but `schoolLicenseId` is only set at *purchase* — the one school
affiliation on an account identifies customers, never prospects.
`GET /api/admin/school-signals` (`utils/schoolSignal.js`) clusters teachers by
email domain instead, ranks by active-teacher density, and excludes consumer
mailbox domains outright (the expensive failure is a false positive). Verified
sound in the second pass. **[PULL]** run it — the output is the outreach list;
empty output means the free teacher tier isn't producing density and this play
waits. **Next:** optional school field at teacher signup; a teacher→colleague
invite (an affiliate program exists for outsiders, no loop for the users who
create density); a Clever Library listing — SSO and rostering are already
built, so the largest K-12 channel's integration cost is already sunk.

---

## 5. Channels, ranked by return per founder-hour

1. **St. Charles + the parochial network** (§3). The only motion that can
   close a school this semester.
2. **IEP / special education.** SPED directors: small, reachable, separately
   budgeted, legally obligated — and almost no AI tutor speaks to them. The
   accommodations engine + IEP plans are the most under-marketed asset in the
   codebase.
3. **Content from real data.** `utils/transcriptMiner.js` sweeps production
   transcripts nightly; nobody else has this supply ("the mistake 6 in 10
   Algebra 1 students actually make…"). **Compliance first**: aggregate only,
   no excerpts, cleared against `docs/STUDENT_DATA_SECURITY_AUDIT.md` — if
   that review says no, the play dies there.
4. **Parent search intent.** "Why is my kid failing algebra." Slow to
   compound; start early *because* of that.
5. **Short-form video.** Real classroom credibility fits the format, but it's
   the highest effort per qualified lead here and produces no school density.
   Fifth, or not at all, until 1–3 run.

> **On "you run social media":** no account credentials are connected to any
> session that wrote this, and nothing has been posted anywhere. Executing the
> channel plan needs a human or connected accounts.

---

## 6. What to measure

| Metric | Where | Why |
|--------|-------|-----|
| **Dormant warm students** | `node scripts/reactivationCampaign.js` (dry run prints it) | The retention baseline. Play 1 is judged against it. |
| **Active teachers per school** | `GET /api/admin/school-signals` | The only leading indicator of a school sale. |
| **Cohort theta gain + participation** | `GET /api/admin/impact-report` | What renews a license. Participation is half the metric. |
| **Signup → activation** | `GET /api/admin/funnel` | Everything downstream is bounded by it. (Historical rates read high — the filter undercounted multi-role accounts until this branch.) |
| **Cost per active student** | not yet built | Whether licenses make money at scale. Voice is the risk. |

**[PULL] all five before deciding anything in this document.**

---

## 7. The strategy in one paragraph

Mathmatix has ~70 shipped features, real pedagogy in code, and a live school —
a private Catholic prep — using it today. The market it enters is one where
every district-tutoring vendor is dying of the same two causes: students who
don't come back and vendors who can't prove anything. So the plan is those two
causes, inverted, plus the wedge the founder already holds: **make retention
automatic** (the reactivation loop, the digest that stops skipping dormant
kids), **make the proof a product** (the impact report, quarterly, starting
with St. Charles), and **sell through the parochial network first** — where
trust is personal, budgets are tuition-funded, and a principal can say yes in
a week — while the repriced school tiers make each yes worth three times as
much. Public districts are year three, approached with two years of evidence
in hand.
