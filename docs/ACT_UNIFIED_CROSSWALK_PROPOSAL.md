# ACT → unified taxonomy crosswalk: the proposal, and why it is not switched on

**Status:** data reviewed and landed, deliberately inert. Activation is a decision, not a task.
**Data:** `seeds/unified-taxonomy/act-unified.proposed.json` (42 mapped, 2 deliberately unmapped)
**Guards:** `tests/unit/actUnifiedMapProposal.test.js`

---

## The problem it solves

`routes/actTest.js` credits every skill a student proved on their baseline ACT — real
evidence from a full timed test, stored with a receipt. It lands under `act-*` ids, and the
Map of Mathmatix is keyed by unified taxonomy ids, so **none of it shows up**. A student can
ace percentages on the baseline and see an untouched percentages node.

The standing note in `routes/actTest.js` says this "starts working with no code change" once
`seeds/unified-taxonomy/act-crosswalk.json` exists, because `skillCanonicalizer` globs
`*-crosswalk.json` and `decodedMasteryMap` collapses every stored key through it.

That note is **true and incomplete.**

## Why it is not just a file drop

Activating the mapping changes what `canonicalSkillId('act-percentages')` returns, and that
value is the **mastery storage key**. Three consequences:

**1. It is a data migration on live student records.** New writes go to `MS.PRP.7`; existing
`act-percentages` entries stay where they are. `masteryGuard` handles this gracefully in
both directions — `resolveMasteryKey` updates an existing legacy entry in place, reads fall
back to the raw id, and `decodedMasteryMap` collapses both onto one node. But it is not
cleanly reversible: once writes have gone to `MS.PRP.7`, removing the crosswalk makes
`getSkillMasteryEntry(user, 'act-percentages')` look at `act-percentages` again and miss the
newer entry. **Rolling back looks, to a student, like losing credit they earned.**

**2. It contradicts an explicit guard with a production history.**
`tests/unit/skillCanonicalizerScope.test.js` pins six ACT ids to canonicalize to themselves.
Two of them are live blueprint skills, and activating moves both:

| id | would become |
|---|---|
| `act-linear-equations` | `ALG1.EQV.1` |
| `act-probability` | `MS.DTA.5` |

Those pins exist because `pathway-crosswalk.json` once got swept into the glob and re-keyed
ACT mastery onto **bank** ids — "ace a skill on the baseline, get taught it from scratch
anyway." The general invariant that came out of that incident (*a row only counts if its
target is a real unified taxonomy id*) is **satisfied** by this proposal — verified, all 42
rows pass. What remains is the narrower pin, which was written when no correct ACT crosswalk
existed. Retiring those two entries is a judgement call for whoever owns the map, not a
cleanup.

**3. Three read paths do not canonicalize.** They read `skillMastery` directly, so an
`act-*` id would miss an entry stored under a unified id:

- `utils/skillFamiliarityResolver.js:53`
- `utils/sessionPatternDetector.js:342`
- `routes/parent.js:321`

These are a latent bug for *every* legacy id today, not just ACT — the alg1 crosswalk has the
same exposure. Activation makes them matter for ACT too, so route them through
`getSkillMasteryEntry` first.

## The mapping

42 of 44 ACT skills map to 42 **distinct** unified nodes (no many-to-one collapse).
26 high confidence, 16 medium — every medium row carries a note saying why that target was
chosen and what the alternatives are.

Two are deliberately **unmapped**:

| id | why |
|---|---|
| `act-time-schedule-arithmetic` | No unified node covers elapsed-time/schedule arithmetic. Inventing a home would credit a skill the student never demonstrated. |
| `act-word-problems-modeling` | Spans every strand; any single target would be wrong for most of its items. |

Leaving them unmapped is safe — `canonicalSkillId` returns unknown ids unchanged, which is
exactly today's behaviour.

Judgement calls worth a second opinion, all flagged `medium` in the data: `act-ratios-proportions`
(concepts vs solving proportions), `act-circles` (the MS node covers ACT's area/circumference/arc
items better than the more specialised GEO nodes), `act-multi-step-arithmetic`, and the four
ACT skills that legitimately span two unified nodes (`act-absolute-value-equations-inequalities`,
`act-radical-rational-equations`, `act-variation-direct-inverse`, `act-law-of-sines-cosines`).

## To activate

1. Decide the two pins can retire, and update `skillCanonicalizerScope.test.js` — keep the
   general target-must-be-unified invariant, drop the two now-intentional entries, and say in
   the comment why they moved.
2. Route the three non-canonicalizing reads above through `getSkillMasteryEntry`.
3. `git mv seeds/unified-taxonomy/act-unified.proposed.json seeds/unified-taxonomy/act-crosswalk.json`
4. Delete the inertness tests in `actUnifiedMapProposal.test.js` (the first describe block);
   keep the data-validity ones, which stay useful once live.
5. Re-run `npx jest act skillCanonicalizer mastery` and spot-check one real ACT student: their
   baseline-credited skills should now appear on the Map of Mathmatix, and the ACT course
   should still find them.

No seeding or deploy step — the file is read from disk at runtime.
