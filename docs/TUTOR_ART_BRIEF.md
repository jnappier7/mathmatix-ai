# Tutor Art Brief — bringing the extra tutors up to the current look

> Status (2026-11-06): **new full-body art is live** for Ms. Rashida, Mr. Sierawski,
> Prof. Davies, Ms. Alex, Mr. Lee, Mr. Wiggles and Dr. G (`<id>-fullBody.*`), and their
> small portraits are cut from it (`<id>-v2.*`, new names so week-long static
> caching can't serve the old art). **Desk heroes (`-new2`) landed 2026-11-07**
> and are wired into `HERO_PORTRAIT_OVERRIDES`. **Idle clips landed 2026-11-08**
> for Mr. Sierawski, Prof. Davies, Ms. Alex and Mr. Wiggles; on 2026-11-09 Ms.
> Rashida, Mr. Lee and Dr. G got theirs and Sierawski, Davies and Alex were
> regenerated with the start/end-frame recipe below (one clip each, in
> `IDLE_VIDEO_COUNTS`). Mr. Wiggles still runs the older-recipe clip. Still to
> come: a second idle clip, thinking pose, backdrop and celebration clips for
> all seven.
>
> **Video prep** (the generator exports 2944×1248 with an audio track): crop
> 1872×1248 centred on the desk, scale to 1152×768 @24fps, **strip audio
> (`-an`)**, x264 CRF 26 `+faststart`. If the last frame doesn't match the first,
> crossfade the last 0.5 s into the opening 0.5 s so the native loop has no
> jump. Bump `VIDEO_VERSION` when a clip replaces one under the same name. Prof. Davies and Ms. Alex were
> regenerated to match their personas (British-Jamaican; Korean-American).
>
> **Better recipe (used from Ms. Rashida on):** generate image-to-video at
> **16:9, 768p, 6 s**, with the `-new2` still centred on a white 1820×1024
> canvas as **both the start and end frame**. The export is 1344×768 (the canvas
> at 0.75×), so `crop=1152:768:96:0` is the still pixel-for-pixel — no scaling,
> no size pop when the video fades in over the still — and dropping the final
> frame (it repeats the first) gives a seamless native loop with no crossfade.

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
`mr-lee`, `dr-g`, `mr-wiggles`.

| File | Size | Background | What it is |
|---|---|---|---|
| `<id>-fullBody.png` | 961×1637 | transparent (RGBA) | Standing, full body. Feet on the **same baseline** as `bob-fullBody.png`; height realistic relative to the core four. Used by the tutor picker. |
| `<id>-new2.png` | 1536×1024 | flat green `#47704C` | Hero portrait: seated behind the shared wooden desk, hands resting/clasped, looking at camera, framed like `bob-new2.png`. The chat page's main tutor image. |
| `<id>-thinking.png` | 1536×1024 | flat green `#47704C` | Same framing as the hero, thinking pose (hand to chin or similar), like `maya-thinking.png`. |
| `<id>-backdrop.png` | 1536×1024 | full scene | Their own room, warm evening light, centre left fairly open (the hero sits on top of it). Should say something about them (see §3). |
| `<id>-v2.png` | 400×600 | transparent | Small bust portrait (chat avatar, shop card, picker shelf). Currently cut from the full body by script — a purpose-made one can replace it under a **new** name (bump the suffix; caching). |
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
  persona — **fixed in the 2026-11-06 art**. Tweed jacket, tie, close grey hair/beard. Backdrop: book-lined study,
  chalkboard of proofs, a hint of Kingston (music, colour).
- **Ms. Alex** — **Korean-American**, 30s, Los Angeles; data scientist turned
  educator, sharp and modern. The old art read as a white redhead — **fixed in
  the 2026-11-06 art**. Smart-casual blazer, laptop. Backdrop: clean modern workspace,
  charts on a screen.
- **Mr. Lee** — Chinese-American, 40s–50s, San Francisco; precise and calm, tai chi,
  calligraphy. Neat suit or crisp shirt. Backdrop: orderly study with calligraphy
  scrolls, an architectural drawing.
- **Dr. G** — a **gorilla character** (owner decision 2026-11-06): a gentle-giant
  silverback with a math doctorate, glasses and a green sweater. His bio used to
  be a Nigerian-American man, and pairing a Black man's identity with a gorilla
  is the racist trope, so the bio changed, not the art. He has **no human
  nationality, ethnicity, race or hometown**, his prompt forbids him from
  claiming one, and `tests/unit/tutorShop.test.js` pins it. Keep any future art
  and copy consistent with that. Backdrop: forest-canopy workshop, rope bridges,
  blueprints.
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
3. Full body: the picker already uses `<id>-fullBody` for everyone; the
   "current-style art" block in `tests/unit/tutorShop.test.js` checks the files
   exist on the 961×1637 canvas. Prepare cutouts like the 2026-11-06 batch:
   drop alpha < 24 and specks under 3000 px, scale to a realistic height
   (Bob 1390 px, Mr. Nappier 1502, Ms. Maria 1269, Maya 1216; Mr. Sierawski 1440), feet on y = 1578,
   centred; pngquant `--quality=80-98` (lossy PNG without it blotches skin
   tones) plus `.webp` q80 and `.avif` q60.
   Desk heroes: drop alpha < 24 (background-removal glow) and specks, then scale
   so the desk's bottom edge is ~1094 px wide (Bob's), bottom-anchored and
   centred — except where that shrinks the person below the core four's size
   (2026-11-07 batch: Mr. Lee 0.95, Prof. Davies 1.0, Dr. G 0.88).
4. Portraits: `utils/tutorConfig.js` `image` and the copy in
   `public/js/parent-dashboard.js` (bundled — run `npm run build:bundles`).
5. Bump the cache versions — prod caches static files for a week:
   `chat-redesign.js?v=` in `public/chat.html`, `gamification.js?v=` in the
   import at the top of `public/js/script.js` (and `script.js?v=` in
   `chat.html`), `pick-tutor.js?v=` in `public/pick-tutor.html`, and
   `VIDEO_VERSION` in `chat-redesign.js` if a clip is re-exported under the same
   name, and `ART_V` in `public/js/pick-tutor.js` when a `-fullBody` file is
   re-exported under the same name. Then check the chat page and the picker in the browser.
