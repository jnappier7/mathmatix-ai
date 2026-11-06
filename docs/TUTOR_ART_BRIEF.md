# Tutor Art Brief — bringing the extra tutors up to the current look

> Status (2026-11-05): Ms. Rashida, Mr. Sierawski, Prof. Davies, Ms. Alex, Mr. Lee
> and Mr. Wiggles are in the shop (tutor sessions, PR #1876) **with their old
> art**. Dr. G is held out of the shop until he has human art (see §4). This brief
> is what each tutor needs so new art drops straight in.

## 1. The target look (match the core four)

Use the four current tutors as the style reference. Attach these to every
generation as reference images:

- `public/images/tutor_avatars/bob-fullBody.png`, `maya-fullBody.png`,
  `ms-maria-fullBody.png`, `mr-nappier-fullBody.png` (full body)
- `bob-new2.png`, `mr-nappier-new2.png` (hero, at the desk)
- `maya-thinking.png` (thinking pose)
- `ms-maria-backdrop.png` (room)

**Current style:** stylized 3D feature-animation render. Realistic adult
proportions (about 7 heads tall; kids proportionally smaller), natural relaxed
poses (hands in pockets, arms crossed, weight on one leg), soft warm key light,
matte skin with subtle texture, believable everyday clothes, small personal
details. People, drawn warmly, not caricatured.

**Old style (what to leave behind):** chibi / toy-figure proportions, oversized
heads, short stubby limbs, stiff A-pose straight at camera, plastic sheen.

## 2. Files per tutor (exact specs — the site expects these names and sizes)

`<id>` is the tutor id: `ms-rashida`, `mr-sierawski`, `prof-davies`, `ms-alex`,
`mr-lee`, `dr-g`, `mr-wiggles` (note: Mr. Wiggles' current small portrait is
`wiggles.png`; new files use `mr-wiggles`).

| File | Size | Background | What it is |
|---|---|---|---|
| `<id>-fullBody.png` | 961×1637 | transparent (RGBA) | Standing, full body. Feet on the **same baseline** as `bob-fullBody.png`; height realistic relative to the core four. Used by the tutor picker. |
| `<id>-new2.png` | 1536×1024 | flat green `#47704C` | Hero portrait: seated behind the shared wooden desk, hands resting/clasped, looking at camera, framed like `bob-new2.png`. The chat page's main tutor image. |
| `<id>-thinking.png` | 1536×1024 | flat green `#47704C` | Same framing as the hero, thinking pose (hand to chin or similar), like `maya-thinking.png`. |
| `<id>-backdrop.png` | 1536×1024 | full scene | Their own room, warm evening light, centre left fairly open (the hero sits on top of it). Should say something about them (see §3). |
| `<id>.png` | 400×600 | transparent | Small bust portrait in the new style — replaces the old one (chat message avatar, shop card, picker shelf). |
| `<id>_idle.mp4`, `<id>_idle2.mp4` | 1152×768, 24 fps, ~6 s | same framing as `bob_idle.mp4` | Two subtle idle loops (breathing, blink, small glance). Must loop cleanly. |
| `<id>_levelUp.mp4` | 1152×768, 24 fps, ~6 s | same as above | Level-up celebration. |
| `<id>_smallcele.mp4` **and** `.webm` | 1152×768, 24 fps, ~6 s | same as above | Small celebration (correct answer). |

The PNGs are the must-haves. Videos can follow; the page falls back to the
still portrait for any tutor without clips.

## 3. Who each tutor is (from `utils/tutorConfig.js` — read `culturalBackground` for more)

Draw each one as the person the persona describes. Keep anything from the old
art that already fits.

- **Ms. Rashida** — Black woman, 40s, South Side of Chicago; warm, unhurried,
  confidence-builder. The old art's grey-streaked locs, glasses and cozy hoodie
  suit her — keep them. Backdrop: a homey classroom corner, plants, a "you belong
  in math" kind of poster.
- **Mr. Sierawski** — Polish-American, 30s–40s, Northeast Philly; Algebra teacher
  and wrestling coach, stocky athletic build, beard, glasses. Cardigan and an
  Eagles-green tie (keep), maybe a coach's whistle. Backdrop: classroom with
  wrestling trophies and team photos.
- **Prof. Davies** — **British-Jamaican**, older, distinguished academic (studied
  at UWI and Oxford). The old art reads as a white man; that's wrong for the
  persona. Tweed jacket, tie, close grey hair/beard. Backdrop: book-lined study,
  chalkboard of proofs, a hint of Kingston (music, colour).
- **Ms. Alex** — **Korean-American**, 30s, Los Angeles; data scientist turned
  educator, sharp and modern. The old art reads as a white redhead; that's wrong
  for the persona. Smart-casual blazer, laptop. Backdrop: clean modern workspace,
  charts on a screen.
- **Mr. Lee** — Chinese-American, 40s–50s, San Francisco; precise and calm, tai chi,
  calligraphy. Neat suit or crisp shirt. Backdrop: orderly study with calligraphy
  scrolls, an architectural drawing.
- **Dr. G** — **Nigerian-American man**, 40s, Houston; a gentle giant — tall,
  broad, calm, reassuring. **He must be drawn as a person.** His only art is a
  gorilla, and drawing a Black man as an ape is a racist trope. That's why he's
  out of the shop. Backdrop: engineering touches (blueprints, a hard hat on a
  shelf), warm and protective.
- **Mr. Wiggles** — former children's theater actor from Queens; the comedian.
  The old art is a full clown in makeup. Recommendation: draw him as a human
  performer with playful touches (bright bow tie, suspenders, expressive face)
  rather than a clown costume, so he reads as a teacher, not a mascot. Your call.

## 4. Turning a tutor's new art on (code checklist)

Once a tutor's files are in `public/images/tutor_avatars/` and `public/videos/`:

1. `public/js/chat-redesign.js` — add the id to `HERO_PORTRAIT_OVERRIDES`
   (`'<id>': '<id>-new2.png'`), `TUTORS_WITH_BACKDROP`, `BLUR_BACKDROP` (if the
   room needs softening), `IDLE_VIDEO_COUNTS` (`2`), and
   `TUTORS_WITH_CELEBRATION_VIDEO`.
2. `public/js/modules/gamification.js` — add the id to
   `TUTORS_WITH_CELEBRATION_VIDEO` (it deliberately blocks old-style videos).
3. `public/js/pick-tutor.js` — shop tutors currently show their small portrait
   in the lineup because they have no full body (`t.purchasable ? portraitBase(t)
   : fullBodyBase(t.id)`). Once a tutor has `-fullBody.png`, let them use it.
4. Mr. Wiggles only: change `image: "wiggles.png"` to `"mr-wiggles.png"` in
   `utils/tutorConfig.js`.
5. **Dr. G only:** in `utils/tutorConfig.js` replace `active: false` with
   `purchasable: true, shopPrice: 900`, and update the Dr. G lines in
   `tests/unit/tutorShop.test.js`.
6. Bump the cache versions — prod caches static files for a week:
   `chat-redesign.js?v=` in `public/chat.html`, `gamification.js?v=` in the
   import at the top of `public/js/script.js` (and `script.js?v=` in
   `chat.html`), `pick-tutor.js?v=` in `public/pick-tutor.html`, and
   `VIDEO_VERSION` in `chat-redesign.js` if a clip is re-exported under the same
   name. Then check the chat page and the picker in the browser.
