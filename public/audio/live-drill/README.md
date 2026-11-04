# Live Two-Minute Drill — recorded crowd

Played by `public/js/live-drill/sound.js` on the projector (`cheer()`), behind the **Crowd** switch.
Everything else in the game's sound is synthesized; these two are real because a crowd's roar is
the one sound synthesis never sold.

| file | used for | length |
|---|---|---|
| `cheer-big.mp3` | touchdown, pick six, the final buzzer | 6.0 s |
| `cheer.mp3` | a Huddle reveal most of the class got right; a new king on the hill | 4.8 s |

Supplied by the owner (2026-11-04) from stock sound-effect libraries (one is a SmartSound FX cut).
They ship with the site, so the licence that covers them is the owner's: check the library terms
before swapping in others. If a file is missing or fails to load, `sound.js` falls back to the
synthesized roar — a touchdown is never silent.
