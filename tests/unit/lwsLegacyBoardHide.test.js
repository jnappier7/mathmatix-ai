/**
 * Living Workspace legacy-board pre-hide wiring.
 *
 * The new board (Living Workspace) swaps in over #cr-workspace by hiding the
 * legacy 4-tab board IN JAVASCRIPT, after chat-workspace.js and its modules load.
 * That left the legacy board visible for a beat — students saw the old "Work
 * Board / Graph / Tiles / Calc" panel flash, then get covered by the new surface.
 *
 * The fix pre-hides the legacy chrome from first paint: chat.html adds
 * html.mm-lws-live synchronously when livingWorkspace is 'live', and workspace.css
 * hides the legacy children under that class. This test guards the WIRING — the
 * class is added under the right flag, and the CSS rule targets elements that
 * actually exist. It does NOT prove the flash is gone at paint time; that needs a
 * real browser.
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '../..');
const html = fs.readFileSync(path.join(ROOT, 'public', 'chat.html'), 'utf8');
const css = fs.readFileSync(path.join(ROOT, 'public', 'css', 'workspace.css'), 'utf8');

describe('the flag adds the class synchronously', () => {
  test('chat.html adds mm-lws-live when livingWorkspace is live', () => {
    // Must be in an inline <script> in the head, not a deferred/bundled file, so
    // it runs before the body paints.
    expect(html).toMatch(/livingWorkspace\s*===\s*['"]live['"]/);
    expect(html).toMatch(/classList\.add\(\s*['"]mm-lws-live['"]\s*\)/);
  });

  test('the class add sits next to the existing mm-board-hidden flag block', () => {
    // Same first-paint inline script — a proxy for "runs before body paint".
    const boardIdx = html.indexOf("classList.add('mm-board-hidden')");
    const lwsIdx = html.indexOf("classList.add('mm-lws-live')");
    expect(boardIdx).toBeGreaterThan(-1);
    expect(lwsIdx).toBeGreaterThan(boardIdx);
    // and both before the body opens
    expect(lwsIdx).toBeLessThan(html.indexOf('<body'));
  });
});

describe('the CSS pre-hides the legacy board', () => {
  test('workspace.css hides the legacy chrome under mm-lws-live', () => {
    expect(css).toMatch(/html\.mm-lws-live[\s\S]*display:\s*none/);
    ['.cr-ws-close', '.cr-ws-tabs', '#cr-ws-body'].forEach((sel) => {
      expect(css.includes(`#cr-workspace > ${sel}`)).toBe(true);
    });
  });

  test('workspace.css is loaded in the head (first paint), not deferred', () => {
    const linkIdx = html.indexOf('css/workspace.css');
    expect(linkIdx).toBeGreaterThan(-1);
    expect(linkIdx).toBeLessThan(html.indexOf('<body'));
  });

  test('the player card and the new mount are NOT hidden', () => {
    // Hiding these would blank the avatar or the new board itself.
    expect(css).not.toMatch(/mm-lws-live[^{]*#cr-player-card[^{]*display:\s*none/);
    expect(css).not.toMatch(/mm-lws-live[^{]*#lws-chat-mount[^{]*display:\s*none/);
  });
});

describe('the rule targets elements that actually exist', () => {
  test('#cr-workspace really contains cr-ws-close, cr-ws-tabs and cr-ws-body', () => {
    // If any of these are renamed/moved, the pre-hide silently stops working and
    // the flash returns — so pin them here.
    const ws = html.slice(html.indexOf('id="cr-workspace"'), html.indexOf('/.cr-stage'));
    expect(ws).toMatch(/class="cr-ws-close"/);
    expect(ws).toMatch(/class="cr-ws-tabs"/);
    expect(ws).toMatch(/id="cr-ws-body"/);
    expect(ws).toMatch(/id="cr-player-card"/);
  });
});
