/**
 * Student audit, 2026-10-15 — small state/display defects, pinned at the
 * source (no DOM here; each was witnessed in the browser harness).
 */
const fs = require('fs');
const path = require('path');
const read = (p) => fs.readFileSync(path.join(__dirname, '../..', p), 'utf8');

describe('XP never flashes a false zero', () => {
  test('chat.html ships neutral placeholders, not "0 / 100 XP"', () => {
    const html = read('public/chat.html');
    expect(html).not.toMatch(/id="sidebar-xp">0 \/ 100 XP</);
    expect(html).not.toMatch(/id="drawer-xp">0 \/ 100 XP</);
    expect(html).not.toMatch(/id="drawer-total-xp"[^>]*>0</);
  });

  test('no chat reply sends userXp: 0 (the client applies it as progress)', () => {
    expect(read('routes/chat.js')).not.toMatch(/userXp:\s*0\s*,/);
  });
});

describe('Total XP stays live', () => {
  test('every in-level userXp payload carries the total alongside it', () => {
    const lines = read('routes/chat.js').split('\n');
    lines.forEach((line, i) => {
      if (/userXp:\s*(?:userXpInCurrentLevel|xpProgress\.xpForCurrentLevel|contXp\.xpForCurrentLevel)/.test(line)) {
        expect(lines[i + 1]).toMatch(/userTotalXp:/);
      }
    });
  });

  test('the client copies the total and refreshes an open status card', () => {
    const js = read('public/js/script.js');
    expect(js).toMatch(/currentUser\.xp = data\.userTotalXp/);
    expect(js).toMatch(/refreshStatusCard/);
    expect(read('public/js/modules/statusCard.js')).toMatch(/window\.refreshStatusCard = refreshStatusCard/);
  });
});

describe('the "New here?" tour does not return after sign-in', () => {
  const tour = read('public/js/guided-tour.js');
  test('it asks the server (logout clears localStorage) and records dismissals there', () => {
    expect(tour).toMatch(/serverTourSeen\(\)/);
    expect(tour).toMatch(/saveTourOutcome\(false\)/);
  });
  test('it never auto-prompts on the chat page, where tour.js owns first run', () => {
    expect(tour).toMatch(/!onChatPage/);
  });
});

test('minimizing the tutor in inline-work mode leaves no empty column', () => {
  expect(read('public/css/adjustable-panels.css'))
    .toMatch(/html\.mm-work-inline body\.cr-hero-min \.cr-stage\s*\{\s*grid-template-columns:\s*minmax\(0, 1fr\);/);
});
