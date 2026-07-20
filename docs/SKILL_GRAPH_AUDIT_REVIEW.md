# Skill Graph Audit — Findings for Review

All 315 skills checked against CCSS-M and the Achieve the Core progressions by
three independent passes. **Standards codes have landed** (`d452b309`). **Nothing
in this document has been applied** — every item changes what a student is
allowed to start, so it wants your call first.

Machine-readable detail: `docs/SKILL_GRAPH_AUDIT_FINDINGS.json`
(19 bad edges · 164 missing prerequisites · 41 grade mismatches · 14 coverage gaps).

**Overall verdict on the taxonomy: good.** The K-8 spine is accurate, the graph is
structurally sound (acyclic, no orphans, cross-level edges all point downward),
and 59 of 76 QNT/PRP skills came back high-confidence. Weakness concentrates in
high-school topics CCSS never codified. What follows is the exception list.

---

## 1. Your flagship claim is not actually in the graph

You said: *"a 6th grader that can combine like terms can also add polynomials."*
The standards agree emphatically — the Expressions and Equations progression says
collecting like terms *"should be seen as an application of the distributive law,
not as a separate method"*, and A-APR.1 says polynomials *"form a system analogous
to the integers."*

**The taxonomy does not encode it.** `ALG1.EQV.9` (add/subtract polynomials) has
one prerequisite: `MS.QNT.3` (GCF and LCM). `MS.EQV.2` (combine like terms) is
**absent**. GCF is a *factoring* prerequisite, not a like-terms prerequisite.

Consequence: a student who fails polynomial addition gets bridged down to GCF,
which will not help them. The single most important edge in your product thesis is
missing, and a wrong one sits in its place.

> **This also corrects something I told you.** I highlighted the 22-hop chain
> `ELEM.QNT.4 → … → MS.QNT.3 → ALG1.EQV.9 → …` as evidence the graph could bridge
> a calculus failure back to third-grade multiplication facts. That chain runs
> **through this bad edge**. The depth number in `skillGraph.test.js` and its
> comment will need revisiting once the edge is fixed — the bridging capability is
> real, but that particular path was partly an artifact.

**Proposed:** add `MS.EQV.2 → ALG1.EQV.9`; drop or demote `MS.QNT.3 → ALG1.EQV.9`.

---

## 2. Bad edges worth acting on

| Edge | Problem |
|---|---|
| `ALG1.PRP.2 → ALG1.PRP.3` | **Backwards.** Direct variation (y=kx) is grade 7 (7.RP.A.2c); CCSS derives slope *from* it (8.EE.B.5-6), not the reverse. |
| `PREC.FNC.8 → GEO.EQV.2` | Exponential functions wired to **laws of detachment and syllogism**. Near-certain data-entry error. |
| `ALG2.EQV.7 → ALG1.SPC.2` | Alg2 polynomial ops point at "polynomial geometry models" — an application, not a prerequisite. `ALG2.EQV.7` has **no path back to `ALG1.EQV.9/10`**: the polynomial spine is broken. |
| `ALG1.QNT.2` ⇄ `MS.QNT.9` | Both are integer exponent properties (8.EE.A.1), same content, **no edge**. Breaks the exponent thread at the MS/ALG1 boundary; propagates into ALG2 rational exponents. |
| `ELEM.PRP.5 → MS.QNT.2` | Spurious, while the real CCSS parent `ELEM.QNT.13` (5.NF.B.7) is absent — hole in the fraction-division spine. |
| `ELEM.QNT.1 → MS.SPC.3`, `→ MS.DTA.5`, `→ ELEM.SPC.9` | Placeholder edges. Place value is irrelevant to all three. |
| `ALG1.PRP.1` as parent of slope, dilations, percent change | Dimensional analysis used as a catch-all parent. No standards support. |
| `GEO.PRP.1` (Dilations) | **No transformation ancestor.** Its roots are scale drawings and slope — so the entire similarity/trig subtree is reachable without ever meeting a transformation. |
| `MS.SPC.3` | Missing `ELEM.SPC.8`. 6.G.A.2 is literally the fractional-edge extension of 5.MD.C.5, so students reach prism volume without whole-number volume. |
| `ALG1.EQV.15 → ALG1.EQV.13` | Solving by factoring gated on the ac-method, which A-REI.B.4b does not require. Will block students unnecessarily. |
| `ALG1.EQV.16` | Missing edge from `ALG1.EQV.14` (perfect-square trinomials — the specific form completing the square needs). |

---

## 3. The thesis: mostly right, with one branch overreaching

**Ratio → unit rate → constant of proportionality → slope is not analogy. It is
identity in the standards text:**

- 7.RP.A.2b — "constant of proportionality (**unit rate**)"
- 8.EE.B.5 — "interpreting the unit rate as the **slope**"
- RP Progression — "y = cx, where c is a constant of proportionality, **i.e., a unit rate**"

Three of your four rungs are supported by the standards *verbatim*. That is a
stronger foundation than we assumed.

**Slope → derivative overreaches.** The progression names calculus as a
*destination* ("later in calculus when they work with average and instantaneous
rates of change"), never as the same idea. The limit is genuinely new. And the
taxonomy abandons its own ladder exactly there: `CALC.PRP.1` cross-links
`MS.PRP.3` but **not** `ALG1.PRP.2`, and **no skill anywhere covers average rate
of change** (HSF-IF.B.6) — which is the actual bridge between slope and
derivative.

**Proposed:** add an average-rate-of-change skill; wire `CALC.PRP.1` to
`ALG1.PRP.2` through it. Keep the marketing claim, but let the product say
"same idea, one new move" at the calculus step rather than "the same thing."

**Two unclaimed wins on the same trunk, better supported than the derivative
branch and currently unwired:**
- **HSG-C.B.5 defines the radian as a constant of proportionality.**
- **HSG-SRT.C.6 derives trig ratios from similarity.**

Both are the proportional-reasoning trunk reappearing in geometry and trig. If you
want a second flagship thread, these are firmer ground than the derivative.

**One overreach in the other direction:** the Algebra progression explicitly
criticizes treating factoring, completing the square and the quadratic formula as
*"completely unrelated"* techniques — which is what `ALG1.EQV.12-17` does as six
separately-gated nodes. That is the same mistake the product exists to fix,
committed inside our own taxonomy.

---

## 4. Geometry is correctly rooted (mostly)

Good news: congruence and similarity **are** built on transformations, matching
CCSS. `GEO.EQV.6` correctly requires `GEO.SPC.7` (rigid motions) per HSG-CO.B.7/8,
and `GEO.PRP.1→2→3` derives similarity criteria from dilations per HSG-SRT.A.
**Nothing needs reversing** — the defects are missing edges (§2), not backwards ones.

Genuinely absent: **HSG-CO.D.12/D.13 (formal constructions) have zero skills
anywhere.** Also missing: G-CO.A.1, G-C.A.1, 7.G.A.2, 7.G.A.3.

---

## 5. Data & Chance cannot support a statistics course

DTA is 29 skills, effective CCSS-aligned size ~24. It covers 6.SP / 8.SP / HSS-ID
/ HSS-CP well. But:

- **HSS-MD: 2 of 7 standards.** No random variable, no empirical distribution, no
  expected-payoff / decision cluster.
- **HSS-IC.B.6** (evaluate reports) absent; 7.SP.C.7 (probability models) falls through.
- **No sampling distribution, confidence interval, or hypothesis test skill at all.**
- No quadratic fitting for S-ID.B.6a. No STAT course level.

**This needs ~25-40 new skills, not adjustments.** Worth an explicit product
decision: either scope statistics out of the map for now and say so, or commit to
building the strand. Leaving it half-present is the worst option — the board will
show a strand a student can "finish" without meeting statistics.

---

## 6. Grade-band corrections

41 total in the JSON. The clearest:

- `ELEM.DTA.4` (likelihood) belongs in **grade 7** — CCSS has no probability before 7.SP.C.5.
- `ELEM.DTA.3` (line graphs) and `GEO.DTA.4` (geometric probability) have no CCSS anchor at all.

---

## 7. Confidence and its limits

- **High:** K-8 CCSS, CCSS-coded high school, AP Calculus (topic numbers taken from the official CED, not recalled).
- **Medium:** AP Precalculus topic numbers — verified via secondary sources only. `AP-PRECALC:3.3` is explicitly marked unverified in the data.
- **Declined rather than guessed:** absolute-value equations/inequalities, quadratic inequalities, log properties, infinite geometric series, and the Geometry logic unit have **no CCSS code** — marked `no-ccss` rather than force-fit. Ohio follows CCSS on the logic omission.
- **Ohio divergence found:** Ohio's 7.SP.2 is an Ohio-only GAISE-model standard with no CCSS analog, and Ohio marks 7.SP.4 deleted. Ohio text was therefore not used for 7.SP.

---

## 8. Suggested order

1. **§1 and the four data-entry errors in §2** — unambiguous, low-risk, and §1 is the product thesis.
2. **§3 average-rate-of-change skill** — small addition, closes the one real hole in the flagship thread.
3. **§5 statistics decision** — scope call, not an edit. Needs you.
4. **§2 remaining edges + §6 grade bands** — mechanical once you have ruled on them.
5. **§4 constructions, §3 quadratic-methods consolidation** — larger content work.

Re-run `python3 scripts/genUnifiedSkills.py` after any taxonomy edit; the graph
tests in `tests/unit/skillGraph.test.js` will catch a malformed fix.
