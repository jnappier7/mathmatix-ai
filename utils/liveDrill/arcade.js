/**
 * Mathmatix Arcade — the one front door to every game (/arcade, public/arcade.html).
 *
 * The catalogue the page renders: the four whole-class game types (one card each, in the order
 * a teacher meets them), the solo-practice hubs (a card per course, from solo.HUBS — never a
 * second list of courses), and the public practice tests. Everything a card says comes from here,
 * so the Arcade, the host's setup page and the lobby can't describe different games.
 *
 * `GAMES[].id` is the mode the host page opens with (`/live-drill?mode=<id>`) and must match
 * games.js MODES — pinned by tests/unit/liveDrillArcade.test.js.
 */

const solo = require('./solo');

const GAMES = [
  {
    id: 'drive',
    name: 'Team Drive',
    tagline: 'Red vs. Blue. One clock. Move the ball.',
    how: 'Everyone answers at their own pace on their device; every right answer pushes their team\'s ball downfield. Three in a row blitzes the other team.',
    icon: 'field',
    players: 'Whole class · two teams',
  },
  {
    id: 'huddle',
    name: 'Huddle',
    tagline: 'One play on the board. Everyone answers. Reveal.',
    how: 'The teacher runs the pace: a play goes up, the class answers, the reveal shows how the room split and why. Change your answer until the reveal; a whole team right is a pick six.',
    icon: 'board',
    players: 'Whole class · two teams',
  },
  {
    id: 'hill',
    name: 'King of the Hill',
    tagline: 'Climb. Three in a row rolls a boulder.',
    how: 'Every student for themselves on one mountain. Right answers climb, a boulder lands on the climber just above you, and whoever is highest at the buzzer wears the crown.',
    icon: 'mountain',
    players: 'Whole class · solo climbers',
  },
  {
    id: 'heist',
    name: 'Heist',
    tagline: 'Crack safes. Grab cash. Mind the alarm.',
    how: 'Three right in a row opens the vault: cash, a jackpot, a grab from someone ahead of you, a gadget that fogs every other screen… or a decoy. A wrong answer trips the alarm and locks your screen, so guessing doesn\'t pay.',
    icon: 'vault',
    players: 'Whole class · solo safecrackers',
  },
];

const TESTS = [
  { id: 'act', name: 'ACT Math', url: '/act-practice-test', blurb: 'A full 60-question math section, timed, with a score and a breakdown. No sign-up.' },
  { id: 'sat', name: 'SAT Math', url: '/sat-practice-test', blurb: 'Two adaptive modules with a Desmos calculator, scored 200–800. No sign-up.' },
  { id: 'preact', name: 'PreACT Math', url: '/preact-practice-test', blurb: 'The junior version, for 9th and 10th graders getting a first look.' },
];

/** What the page renders. Hubs come from solo practice, so a new course shows up here on its own. */
function catalog() {
  return {
    games: GAMES.map((g) => ({ ...g })),
    hubs: solo.hubList().map((h) => ({ id: h.id, title: h.title, games: h.games, url: `/drill/${h.id}` })),
    tests: TESTS.map((t) => ({ ...t })),
  };
}

module.exports = { GAMES, TESTS, catalog };
