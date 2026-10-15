// tests/unit/messageTimestamps.test.js
//
// QA handoff 2026-10-14 §3.3, witnessed in a browser harness on the real
// chat page: history re-renders stamped every old message with the CURRENT
// clock (the same greeting read 10:18 → 10:19 → 10:20 across reloads), and the
// absolutely-placed play button covered the right-aligned time on every tutor
// bubble. jest can't lay out a page here, so these pin the seams.

const fs = require('fs');
const path = require('path');
const read = (f) => fs.readFileSync(path.join(__dirname, '../..', f), 'utf8');
const script = read('public/js/script.js');
const css = read('public/css/chat-redesign.css');
const html = read('public/chat.html');

test('appendMessage takes the sent time and renders it instead of "now"', () => {
  expect(script).toMatch(/function appendMessage\(text, sender, graphData = null, isMasteryQuiz = false, attachments = null, sentAt = null\)/);
  const block = script.slice(script.indexOf("timestamp.className = 'message-timestamp';"), script.indexOf('bubble.appendChild(timestamp);'));
  expect(block).toMatch(/const when = parsed && !isNaN\(parsed\.getTime\(\)\) \? parsed : new Date\(\);/);
  expect(block).toMatch(/when\.getHours\(\)/);
  expect(block).not.toMatch(/const now = new Date\(\);/);
});

test('the history re-render passes each message its stored timestamp', () => {
  expect(script).toMatch(/appendMessage\(content, sender, null, false, histAttachments, msg\.timestamp \|\| null\);/);
});

test('the play button reserves its width beside the time, and has a name', () => {
  expect(css).toMatch(/body\.cr-mode \.message:has\(> \.play-audio-btn\) \.message-timestamp \{ padding-right: 56px; \}/);
  expect(script.match(/playBtn\.setAttribute\("aria-label", "Play audio"\);/g)).toHaveLength(2);
});

test('cache-busters moved with the edits', () => {
  expect(html).not.toMatch(/chat-redesign\.css\?v=20261014a"/);
  expect(html).not.toMatch(/js\/script\.js\?v=20261014c"/);
});

test('restored tutor messages get the same visual pass a live reply does', () => {
  // Without it every [POINTS:…]/[FUNCTION_GRAPH:…] in history came back as raw
  // text on reload (student audit 2026-10-15).
  const restore = script.slice(script.indexOf('window.updateChatForSession = function'));
  expect(restore).toMatch(/inlineChatVisuals\.processMessage\(content\)/);
  expect(restore).toMatch(/StripVisualTags\.stripUnrenderedVisualTags\(content\)/);
  expect(restore).toMatch(/inlineChatVisuals\.initializeVisuals\(el\)/);
});
