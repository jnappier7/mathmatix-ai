/**
 * sessionManager.js calls the StorageUtils global (clears the UI-language
 * cache on logout, reads masteryProgress on session end). StorageUtils lives
 * in storage-utils.js, which is NOT bundled into sessionManager — every page
 * that loads one must load the other first, or the session-end report throws
 * `StorageUtils is not defined` on unload. The student dashboard shipped that
 * way; the error was only visible in the console on page close.
 */
const fs = require('fs');
const path = require('path');

const PUBLIC = path.join(__dirname, '..', '..', 'public');

describe('pages that load sessionManager.js also load storage-utils.js', () => {
  const pages = fs.readdirSync(PUBLIC)
    .filter((f) => f.endsWith('.html'))
    .filter((f) => fs.readFileSync(path.join(PUBLIC, f), 'utf8').includes('/js/sessionManager.js'));

  test('sessionManager.js is used by at least one page', () => {
    expect(pages.length).toBeGreaterThan(0);
  });

  // Order doesn't matter: sessionManager only touches StorageUtils at
  // logout / unload time, long after every script tag has run.
  test.each(pages)('%s loads storage-utils.js', (page) => {
    const html = fs.readFileSync(path.join(PUBLIC, page), 'utf8');
    expect(html).toContain('/js/storage-utils.js');
  });
});
