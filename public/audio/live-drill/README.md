# Live Two-Minute Drill — recorded crowd

Played by `public/js/live-drill/sound.js` on the projector (`cheer()`), behind the **Crowd** switch.
Everything else in the game's sound is synthesized; these two are real because a crowd's roar is
the one sound synthesis never sold.

| file | used for | length |
|---|---|---|
| `cheer-big.mp3` | touchdown, pick six, the final buzzer | 6.0 s |
| `cheer.mp3` | a Huddle reveal most of the class got right; a new king on the hill | 4.8 s |
<<<<<<< HEAD
| `murmur.mp3` | the bed under play, looping (seconds 1–25 are the seamless loop) | 27 s |

`murmur.mp3` is DERIVED from the two cheers — `scripts/buildCrowdMurmur.js` scatters hundreds of
overlapping half-second slices of their bodies at slightly different pitches and levels, low-passes
the cloud for distance, and crossfades it into a loop — so it carries the same licence and no new
one. A purpose-recorded crowd ambience drops in at the same path (keep a second of lead-in and two
of tail outside the loop region, or change `MURMUR_LOOP` in sound.js).
=======
>>>>>>> origin/main

Supplied by the owner (2026-11-04) from stock sound-effect libraries (one is a SmartSound FX cut).
They ship with the site, so the licence that covers them is the owner's: check the library terms
before swapping in others. If a file is missing or fails to load, `sound.js` falls back to the
synthesized roar — a touchdown is never silent.
