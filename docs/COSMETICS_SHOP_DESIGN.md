# "Build Your Own Mathmatix" — Cosmetics Shop Design

> Design spec for a student-facing cosmetics economy: earn a soft currency by
> doing math, spend it on UI customization (themes, board skins, calculator
> skins, header patterns — cheetah print, hot pink, camo, seasonal, etc.).
>
> Status: **proposal / design sign-off pending**. No code written yet. Grounded
> against the current codebase; assumed defaults are called out and can change.
>
> Assumed defaults (change these and the rest follows):
> 1. **Currency = earned "Coins,"** not XP and not real money.
> 2. **Cosmetic-only** — zero effect on tutoring, grading, XP, or progression.
> 3. **Accessibility is a hard gate**, not a polish item.

---

## 1. Why this fits the codebase (already-present scaffolding)

| Need | Already exists |
|---|---|
| Themeable UI | Full `--cr-*` design-token layer (`design-system.css`, `chat-redesign.css`): `--cr-accent`, `--cr-bg-0/1/2`, `--cr-bubble-*`, `--cr-panel-grad-*`, radii, shadows. A theme = a bundle of overrides to these. |
| Full alternate skin precedent | `dark-mode.css` + `user.theme` enum (`light`/`dark`/`high-contrast`) — a theme toggled by a body attribute. |
| Owned-items storage precedent | `user.unlockedItems[]` (tutor unlocks) and `user.avatarGallery` (up to 3 saved avatars). |
| A customization front door | The Avatar Builder (unlocks at Level 2, `user.avatarBuilderUnlocked`). Becomes the shell for a "My Mathmatix" studio. |
| Purchase/unlock celebration | `showTutorUnlockCelebration` / confetti infra in `public/js/modules/gamification.js`. |
| Server-authoritative economy discipline | XP caps (`maxTier2PerTurn`, `maxTier3PerTurn`) and the "never client-assert XP" rule already establish the pattern. |

**Net:** cheetah board / hot-pink calculator / camo header = scoped skin classes on
those components + a token bundle. Low structural risk; the risk is *economy and
accessibility*, not rendering.

---

## 2. Currency model — "Coins" (earned soft currency)

A **separate** currency from XP. Rationale for not reusing XP:

- XP drives `level`, tutor unlocks, and the leaderboard. If XP were spendable,
  a student would face "level up **or** buy a skin," and spending would corrupt
  the leaderboard/level signal. Keep XP as the pure progression track.
- Real money is deliberately excluded from v1 (see §11) — COPPA/consent burden,
  classroom equity, and direct conflict with the mission *"An Affordable Math
  Tutor for Every Child."*

### Earning Coins
Coins drip from the **same learning events that already exist**, as a parallel,
capped reward — never inflating XP:

| Source | Suggested Coins | Notes |
|---|---|---|
| Daily quest complete | 10–25 | Scales with quest tier; reuse `routes/dailyQuests.js` completion hook. |
| Weekly challenge complete | 50–100 | Reuse `routes/weeklyChallenges.js`. |
| Mastery badge earned | 100 | Reuse `routes/mastery.js` badge award. |
| Level-up | 20 × new level | A reason to celebrate a level beyond the ceremony. |
| Streak milestone (7/30/100 days) | 25/100/500 | Ties Coins to consistency. |

All amounts are **server-computed and capped per period** (mirror the XP-cap
discipline). No client path ever asserts a balance.

> Deliberately **not** awarding Coins per-turn: that would recreate the "grind for
> currency" failure mode and pressure the tutor turn loop. Coins reward
> *completion and consistency*, not message volume.

---

## 3. Data model additions (`models/user.js`)

```js
// Cosmetics economy
wallet: {
  coins: { type: Number, default: 0, min: 0 },
  lifetimeEarned: { type: Number, default: 0 },  // analytics / never spent-down
},
ownedCosmetics: [{ type: String }],   // catalog item ids, e.g. 'board.cheetah'
equippedCosmetics: {
  theme:      { type: String, default: 'default' },  // full token bundle
  board:      { type: String, default: 'default' },  // whiteboard/inline-card frame
  calculator: { type: String, default: 'default' },
  header:     { type: String, default: 'default' },
  // future slots: bubbleStyle, cursor, soundpack, avatarFrame …
},
```

- `ownedCosmetics` follows the exact `unlockedItems[]` pattern (string ids,
  `markModified` on push).
- `equippedCosmetics` is the currently-worn loadout — one item per slot.
- Keep `user.theme` (light/dark/high-contrast) as the **base mode**; cosmetic
  `theme` layers *on top* and must respect it (see §6).

---

## 4. Catalog schema (config, like `tutorConfig.js` / `brand.js`)

A single source-of-truth catalog (`utils/cosmeticsCatalog.js`, mirrored to the
client the same way `rankTitles.js` mirrors `brand.js`):

```js
{
  'board.cheetah': {
    slot: 'board',
    name: 'Cheetah Print Board',
    price: 250,
    rarity: 'rare',
    previewImg: '/images/cosmetics/board-cheetah.png',
    // Cosmetic application: a scoped skin class + optional token overrides.
    skinClass: 'skin-board-cheetah',
    tokenBundle: { '--cr-panel-grad-from': '#…', '--cr-panel-grad-to': '#…' },
    // Accessibility contract (enforced at equip time — see §6):
    a11y: { patternOnChromeOnly: true, minTextContrast: 4.5 },
    unlockLevel: 0,          // optional level gate in addition to price
    season: null,            // e.g. 'winter-2026' for limited items
  },
  'calc.hotpink': { slot: 'calculator', name: 'Hot Pink Calculator', price: 150, … },
  'header.camo':  { slot: 'header',     name: 'Camo Header',          price: 200, … },
  'theme.neon':   { slot: 'theme',      name: 'Neon Night',           price: 400, … },
}
```

Slots (v1): **theme, board, calculator, header.** Extensible.

---

## 5. Theming implementation

Two mechanisms, composed:

1. **Token bundles** (whole-vibe themes): set a body attribute
   `document.body.dataset.theme = 'neon'` and ship a CSS block
   `body[data-theme="neon"] { --cr-accent: …; --cr-bg-1: …; }`. This is exactly
   the `dark-mode.css` pattern, so themes inherit every already-tokenized
   component for free.
2. **Component skin classes** (per-slot patterns): e.g.
   `body[data-skin-board="cheetah"] .board-frame { … }`. Patterns are painted on
   **chrome only** (frames, headers, borders, calculator body), never behind
   math text.

Equipping = write `equippedCosmetics` server-side, then on load apply
`data-theme` / `data-skin-*` attributes from the user payload (same place
`applyAgeTier` / `user.theme` are applied today). Live preview in the studio
toggles the attributes without persisting until "Equip."

A single `public/css/cosmetics.css` (linked like `gamification-surfacing.css`)
holds all skin/theme blocks; item art lives in `/images/cosmetics/`.

---

## 6. Accessibility guardrails (HARD requirements)

Given the IEP/accessibility focus, cosmetics must never degrade learning:

1. **Patterns on chrome, never behind text.** Cheetah/camo/etc. render on
   headers, frames, borders, calculator bodies — not behind chat text, math, or
   input fields. Enforced by the catalog `a11y.patternOnChromeOnly` contract.
2. **Contrast floor.** Every theme ships with a guaranteed text/background
   contrast ≥ 4.5:1; a build-time or equip-time validator rejects bundles that
   don't meet it (reuse the spirit of the dataviz contrast rule).
3. **Force-plain overrides win.** If the student is in `high-contrast` mode, has
   IEP `reducedDistraction`, or `prefers-reduced-motion`, the base mode overrides
   any equipped cosmetic (animated/busy skins fall back to a plain variant).
   These CSS rules load *after* cosmetics so they cascade-win.
4. **Math legibility is sacred.** KaTeX/MathLive rendering surfaces keep a
   neutral, high-contrast backing regardless of theme.

---

## 7. Shop + studio UI

Extend the Avatar Builder into a **"My Mathmatix" studio** (tabbed):

- **Avatar** (existing) · **Themes** · **Board** · **Calculator** · **Header** · **Shop**.
- Each slot tab: a grid of items with **live preview** (apply attributes on
  hover/click, revert on leave), an owned/locked state, price, and Equip / Buy.
- **Coin balance** shown in the header (a small wallet chip, sibling to the
  streak/identity chips in `.cr-header-extras`).
- Buying reuses the confetti/celebration path; a "new item" reveal like the
  tutor-unlock screen.

---

## 8. Purchase flow (server-authoritative)

`POST /api/cosmetics/purchase { itemId }`:

1. Load catalog item; 404 if unknown.
2. Reject if already owned, if `wallet.coins < price`, or if `unlockLevel` unmet.
3. Debit `wallet.coins`, push to `ownedCosmetics`, save. Idempotent per item
   (owning is terminal). Return new balance + owned list.

`POST /api/cosmetics/equip { slot, itemId }`: validate ownership (or `default`),
write `equippedCosmetics[slot]`, return. Never trust client balance/ownership.

Earning uses a shared `awardCoins(user, amount, reason)` helper (parallel to
`xpEngine.applyXpToUser`) called from the existing quest/challenge/mastery hooks,
with per-period caps.

---

## 9. Economy tuning

- **Cosmetic-only ⇒ no pay-to-win.** Nothing purchasable affects tutoring,
  grading, XP, or leaderboard. This sidesteps the fairness problems paid power
  would create.
- Price bands: common 100 / rare 250 / epic 400 / seasonal 500+. Tune so a
  regular student can afford ~1 item every 1–2 weeks from quests+challenges.
- Anti-grind: because Coins come from *completion* (capped) not volume, there's
  no per-message farming vector.
- Watch metric: median days-to-first-purchase and Coin sink/faucet ratio.

---

## 10. Teacher controls & classroom equity

- **Focus mode:** a class/session setting (hooks into the existing browser-lock /
  IEP `reducedDistraction` machinery) that force-plains cosmetics during
  instruction.
- **Self-facing by default:** a student's theme is their own. If equipped accents
  ever appear on classmate-visible surfaces (leaderboard rows, Showdown cards),
  they run through `hasOptedOutOfDirectoryInfo` like everything else, and we keep
  it subtle to avoid have/have-not shaming.

---

## 11. Non-goals / explicitly avoided

- **Loot boxes / randomized paid packs.** Gambling-adjacent mechanics aimed at
  minors are a legal and ethical no-go. Purchases are **direct** (you see exactly
  what you buy).
- **Real-money microtransactions (v1).** Deferred; if ever added, gated behind a
  **parent account** with explicit consent, never a child-facing checkout, and
  never for power/progression.
- **Trading / marketplace between students.** Out of scope (moderation +
  safety burden).
- **Any progression or grading effect.** Cosmetics are purely visual, forever.

---

## 12. Open decisions (need a call before building)

1. **Currency name** — "Coins," "Gems," "Pi-Coins," "Sparks"? (Pi-Coins ties to
   the existing Pi Day motif.)
2. **Coin visibility to parents/teachers** — surface balance in dashboards?
3. **Launch item set** — how many slots and items in the first drop (suggest ~3
   themes + 2 boards + 2 calculators + 2 headers to feel like a real shop).
4. **Level gating** — should some items require both Coins *and* a level, or
   Coins only?
5. **Seasonal/limited items** — do we want time-limited drops (drives return
   visits) from day one, or add later?

---

## 13. Suggested rollout sequencing

1. **Wallet + earning** — add `wallet`, `awardCoins`, wire into existing
   quest/challenge/mastery/level hooks, show the balance chip. (No shop yet —
   let balances accrue first.)
2. **Catalog + theming engine** — `cosmeticsCatalog.js`, `cosmetics.css`, the
   `data-theme`/`data-skin-*` application layer + accessibility overrides.
3. **One vertical slice** — buy + equip **one** theme end-to-end (e.g. Hot Pink),
   server-authoritative, to prove the pattern.
4. **The studio UI** — build out the tabbed "My Mathmatix" hub and the full item
   set.
5. **Teacher focus mode + polish** — classroom controls, celebrations, seasonal
   drops.
