// tests/unit/xpToastTotal.test.js
//
// QA handoff 2026-10-14 §4: the toast said "+5 XP Correct!" while the chat chip
// and XP bar said +7. Witnessed with the real xpEngine: a correct retry is
// tier1 2 + tier2 5 = total 7, and the toast was handed only tier2 (in a
// course: +10 toast vs +18 chip). Every surface shows the total now.

const fs = require('fs');
const path = require('path');
const { computeXpBreakdown } = require('../../utils/pipeline/xpEngine');
const src = fs.readFileSync(path.join(__dirname, '../../public/js/script.js'), 'utf8');

test('the engine total includes participation XP, so tier-only toasts disagree', () => {
  const b = computeXpBreakdown({ wasCorrect: true, firstTry: false, recentMessages: [], extracted: {}, userLevel: 20 });
  expect(b.total).toBe(b.tier1 + b.tier2 + b.tier3);
  expect(b.total).toBeGreaterThan(b.tier2);
});

test('the toast and the animation use the total, like the chip', () => {
  const block = src.slice(src.indexOf('// XP Ladder display'), src.indexOf('// Thinking Streak'));
  expect(block).not.toMatch(/showXpNotification\(xp\.tier2,/);
  expect(block).not.toMatch(/showXpNotification\(xp\.tier3,/);
  expect(block).toMatch(/showXpNotification\(xp\.total \|\| xp\.tier2, tier2Label\)/);
  expect(block).toMatch(/const shown = xp\.total \|\| xp\.tier3;/);
  expect(src).toMatch(/let chipText = `\+\$\{xp\.total\} XP`;/);
});
