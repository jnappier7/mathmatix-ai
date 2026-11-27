/**
 * Voice mode always has the board.
 *
 * Owner, 2026-11-27: "Board should always show during live voice mode."
 *
 * The Work Board is off by default (WORK_BOARD) because in chat the tutor can
 * write the math in its message. A call has no message: what the tutor says is
 * gone when it is said. Until this change the voice session still produced
 * board work, and with the switch off it rendered nowhere — on a phone, where
 * the chat column is hidden for a call, the screen under the tutor's card was
 * empty.
 *
 * These pin the wiring; the layout itself is checked by eye in headless
 * Chromium (390x844 and 1366x800, board off, empty and with work).
 */
'use strict';

const fs = require('fs');
const path = require('path');

const read = (...p) => fs.readFileSync(path.join(__dirname, '../../..', ...p), 'utf8');
const cw = read('public/js/living-workspace/chat-workspace.js');
const voiceCss = read('public/css/voice-mode.css');
const voiceJs = read('public/js/voice-mode.js');
const html = read('public/chat.html');

function pure(name, args) {
  const m = cw.match(new RegExp('function ' + name + '\\(' + args.join(', ') + '\\) \\{ return ([^;]+); \\}'));
  if (!m) throw new Error(name + ' not found');
  return new Function(...args, 'return ' + m[1]);
}

describe('the board is live in a call whatever WORK_BOARD says', () => {
  const isLive = pure('isLive', ['board', 'voice']);

  test('board off: live in a call, not outside one', () => {
    expect(isLive(false, true)).toBe(true);
    expect(isLive(false, false)).toBe(false);
  });

  test('board on: live either way', () => {
    expect(isLive(true, false)).toBe(true);
    expect(isLive(true, true)).toBe(true);
  });

  test('"in a call" is body.cr-voice, the class voice-mode.js owns', () => {
    expect(cw).toMatch(/function inVoice\(\) \{ return !!document\.body && document\.body\.classList\.contains\('cr-voice'\); \}/);
    expect(cw).toMatch(/function boardLive\(\) \{ return isLive\(BOARD, inVoice\(\)\); \}/);
    expect(voiceJs).toMatch(/classList\.add\('cr-voice'\)/);
  });

  test('the view is mounted with the board off, so there is something to show', () => {
    const boot = cw.slice(cw.indexOf('function boot('));
    expect(boot).toMatch(/if \(window\.LWS\.DerivationView\) \{\s*mount = buildDock\(\);\s*dv = new window\.LWS\.DerivationView/);
    expect(boot).not.toMatch(/if \(BOARD\) \{\s*(?:\/\/[^\n]*\n\s*)*mount = buildDock/);
  });

  test('no board call is switched off: the view stays in step with the conversation', () => {
    // The server keeps its ledger with the board off and seeds the voice
    // session from it; a view that ignored text turns would show the student
    // something other than what the tutor believes is on the board.
    for (const fn of ['applyBoardCommands', 'applyVoiceBoard', 'hydrate']) {
      const body = cw.slice(cw.indexOf('api.' + fn + ' = function'));
      expect(body.slice(0, body.indexOf('};'))).not.toMatch(/if \(!BOARD\) return/);
    }
  });

  test('entering or leaving a call re-decides it', () => {
    const fn = cw.slice(cw.indexOf('function watchBoardUp('), cw.indexOf('function keyboardIsUp('));
    expect(fn).toMatch(/var live = boardLive\(\);/);
    expect(fn).toMatch(/observe\(document\.body, \{ attributes: true, attributeFilter: \['class'\] \}\)/);
  });
});

describe('it shows before there is any work on it', () => {
  test('an empty board is displayed in a call, with its bar', () => {
    expect(voiceCss).toMatch(/body\.cr-voice \.cr-work-dock \.lws-dv-root\.is-empty \{\s*display: flex;/);
    expect(voiceCss).toMatch(/body\.cr-voice \.cr-work-dock:has\(\.lws-dv-root\.is-empty\) \.lws-dock-bar \{ display: flex; \}/);
  });

  test('outside a call an empty dock still collapses to nothing', () => {
    expect(read('public/css/living-workspace.css')).toMatch(/\.cr-work-dock \.lws-dv-root\.is-empty \{ display: none; \}/);
    // Every "always show" rule is scoped to the call.
    const block = voiceCss.slice(voiceCss.indexOf('the board is ALWAYS there'), voiceCss.indexOf('Voice presence'));
    block.split('\n').filter(l => /\{\s*$|\{ .*\}/.test(l) && /cr-work-dock/.test(l))
      .forEach(l => expect(l).toMatch(/\.cr-voice/));
  });
});

describe('on a phone the board is the stage', () => {
  const wantsStage = pure('wantsStage', ['voice', 'phone']);

  test('only a phone, only in a call', () => {
    expect(wantsStage(true, true)).toBe(true);
    expect(wantsStage(true, false)).toBe(false);
    expect(wantsStage(false, true)).toBe(false);
  });

  test('the dock leaves the hidden chat column for <body>, and goes home after', () => {
    // mobile-tutor-cam.css hides #chat-container for a phone call; a dock left
    // inside it is invisible however it is styled.
    expect(read('public/css/mobile-tutor-cam.css')).toMatch(/body\.cr-mode\.cr-voice #chat-container \{ display: none !important; \}/);
    const fn = cw.slice(cw.indexOf('function placeDock('), cw.indexOf('function watchBoardUp('));
    expect(fn).toMatch(/var stage = wantsStage\(body\.contains\('cr-voice'\), !!\(phone && phone\.matches\)\)/);
    expect(fn).toMatch(/if \(stage\) document\.body\.appendChild\(slot\)/);
    expect(fn).toMatch(/else home\.parentNode\.insertBefore\(slot, home\)/);
    expect(fn).toMatch(/classList\.toggle\('mm-board-stage', stage\)/);
    expect(cw).toMatch(/var PHONE_MQ = '\(max-width: 768px\)'/);
  });

  test('it is pinned between the tutor\'s card and the mic', () => {
    const block = voiceCss.slice(voiceCss.indexOf('the board is the stage'));
    expect(block).toMatch(/@media \(max-width: 768px\) \{\s*body\.cr-mode\.cr-voice\.mm-board-stage > \.cr-work-dock \{\s*position: fixed;\s*top: calc\(var\(--mm-cam-top\) \+ var\(--mm-cam-h\) \+ 10px\);/);
    expect(block).toMatch(/bottom: calc\(env\(safe-area-inset-bottom, 0px\) \+ 122px\);/);
  });

  test('a board collapsed in chat opens for the call, and has no Hide there', () => {
    expect(voiceCss).toMatch(/\.mm-board-stage > \.cr-work-dock\.is-collapsed #lws-chat-mount \{ display: flex; \}/);
    expect(voiceCss).toMatch(/\.mm-board-stage > \.cr-work-dock \.lws-dock-toggle,\s*body\.cr-voice\.mm-board-stage > \.cr-work-dock \.lws-dock-grab \{ display: none; \}/);
  });
});

describe('the tutor\'s card stays open for the whole call (phones)', () => {
  // chat-redesign.js collapses the card to a pill the first time a student
  // message lands in the thread — in a call, the first thing they say. The
  // state chip and captions live in that card.
  test('a pill latched mid-call is taken back off and restored on exit', () => {
    expect(voiceJs).toMatch(/function holdCardOpen\(\) \{\s*if \(!isOn\(\) \|\| !document\.body\.classList\.contains\('mm-tutor-pill'\)\) return;\s*pillBeforeVoice = true;\s*document\.body\.classList\.remove\('mm-tutor-pill'\);/);
    expect(voiceJs).toMatch(/new MutationObserver\(holdCardOpen\)\.observe\(document\.body, \{ attributes: true, attributeFilter: \['class'\] \}\)/);
    expect(voiceJs).toMatch(/if \(pillBeforeVoice\) document\.body\.classList\.add\('mm-tutor-pill'\)/);
  });
});

describe('the page loads the versions that carry it', () => {
  test('cache-busters moved together', () => {
    const v = (cw.match(/var ASSET_V = '\?v=([^']+)'/) || [])[1];
    expect(v).toBeTruthy();
    expect(html).toContain('chat-workspace.js?v=' + v);
    expect(html).toMatch(/voice-mode\.css\?v=20261127/);
    expect(html).toMatch(/voice-mode\.js\?v=20261127/);
  });
});
