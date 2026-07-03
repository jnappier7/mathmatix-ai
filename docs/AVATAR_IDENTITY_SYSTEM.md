# Avatar Identity System — Vision & Staged Roadmap

> Where student avatars are headed and, more importantly, **the order to build in
> and what to prove before spending real art dollars.** Companion to
> `COSMETICS_SHOP_DESIGN.md` (Coins + shop) and `ENGAGEMENT_NORTH_STAR.md`.
>
> Status: **vision + roadmap.** Stage 0 is shipped (PR #1089). Later stages are
> deliberately gated on evidence, not enthusiasm.

---

## The thesis

Tutors have personality. Students don't. Giving each student a **character that is
present and reacts to their work** is one of the strongest identity/retention
levers in the product — the difference between "a website with a tutor" and "a
place I come back to."

**The load-bearing insight: the value is in *presence*, not the *creator*.** The
character-customization builder is the shiny, expensive part. The feeling of
ownership comes almost entirely from the avatar *showing up and reacting* — a
fist-pump on a hard solve, a *confused (not embarrassed)* look after mistakes,
standing on the leaderboard. Presence is cheap; the creator is not. Build in that
order.

---

## Two hard product judgments (read before scoping)

1. **This is high-variance. Half-doing it is worse than not doing it.** "Most AI
   tutors stop at 'pick an icon'" is a real moat — *only if* executed to the
   tutors' quality bar. At DiceBear-mediocrity, a bespoke avatar system looks
   cheap and actively hurts the brand. There is no safe middle: the modular
   creator is a real art commitment or a no — never a thing to half-build.

2. **Finish loops before opening a months-long art front.** The economy backbone
   is built but the loop isn't closed (Coins earn, nothing to spend yet — the
   shop UI is missing). Ship → verify → **measure whether it moves behavior** →
   *then* decide on the big art bet. The staged path below exists to test the
   *mechanic* cheaply with art we already have before betting on new art.

---

## What already exists (the plumbing is done)

| Capability | Status |
|---|---|
| Earned **Coins** currency (cosmetic-only, no pay-to-win) | shipped (`coinEngine.js`) |
| **Purchase/equip** infra + `equippedCosmetics` slots | shipped (`cosmeticsCatalog.js`, `routes/cosmetics.js`) |
| Pickable student **character set** (53 revived PNGs, level-gated) | shipped, PR #1089 |
| Shared **avatar resolver** (renders selected art everywhere) | shipped (`avatarResolver.js`) |
| The `problemResult` **answer signal** (correct/incorrect/neutral) | shipped; drives the combo meter |

So the missing pieces are **avatar rendering/animation + art**, not economy or data.

---

## Staged roadmap (each stage earns the right to the next)

### Stage 0 — Pick *a* character ✅ (PR #1089)
Revived creature/character catalog + level-gated picker. Students now have a
character; it renders in chat, the identity chip, and the status card.

### Stage 1 — Presence + reactivity (cheap, do this first)
Give the avatar *life* with minimal art:
- Show it in more places: leaderboard rows, the math workspace, session login.
- **Reactions via pose-swap** on the existing `problemResult` signal — 2-3 static
  poses per character (idle / celebrate / thinking-or-confused). Fist-pump on a
  clean solve; *confused, never embarrassed* after misses (mirrors the combo
  meter's cools-never-shatters rule — mistakes stay safe).
- Reuses #1089 art; needs only a couple extra poses per character. Cost: low.
- **This is the proof-of-concept for the entire avatar-identity thesis.**

### Stage 2 — Cosmetic slots (medium)
Earnable, equippable **layered** cosmetics (hoodie, shoes, hair, backpack,
notebook skin, pencil effect) as PNG layers over a base pose — *not* a rigged
character. Rides the existing wallet + `equippedCosmetics` infra; add avatar
slots to the catalog. Everything earned with Coins; nothing educational locked.

### Stage 3 — Bespoke modular character creator (big bet, gated)
The Fortnite/Roblox-style creator: swappable skin/face/eyes/hair/clothing in the
tutors' stylized universe, animated and expressive. **Only commission this once
Stages 1-2 show a real engagement/retention lift** — and then with dedicated art
resources, done to the tutor quality bar, or not at all.

---

## Art direction (when we get to real art)
- **Stay in the tutors' universe** — stylized, modern-animated (Pixar-ish), not
  hyper-realistic. Avoids the uncanny valley, keeps animation expressive, ages well.
- **Inclusive by design** — full range of skin tones, and hair textures/styles
  (locs, braids, fades, coils, etc.), stylized body range. Representation is a
  feature, and doing it *well* is where the art cost concentrates.
- **One recognizable world** — like Fortnite/Roblox, millions of distinct avatars
  that still clearly belong together.

---

## Guardrails (inherited from the cosmetics/engagement docs)
- **Cosmetic-only, always.** Nothing purchasable or unlockable affects tutoring,
  grading, XP, or progression. No pay-to-win, ever.
- **Nothing educational locked** — everything earnable. Keeps faith with
  "an affordable math tutor for every child."
- **Mistakes stay safe** — reactive avatar shows *confused*, never shaming.
- **Accessibility** — reduced-motion falls back to a static pose; avatar art must
  never reduce chat/math legibility.

---

## Recommended immediate sequence
1. **This doc** — align the plan, commit no art dollars. ✅
2. **Close the coin loop** — build the shop UI so earned Coins are spendable
   (bigger hole than avatar reactions today).
3. **Real-world visual pass** on the shipped combo/identity/status-card/#1089 work.
4. **Stage 1 reactive avatar** — the cheap proof-of-concept.
5. **Defer Stage 3** until the mechanic proves it moves behavior.

The winning move is to prove the *mechanic* cheaply and finish the loops already
in flight — not to open a months-long art project on faith.
