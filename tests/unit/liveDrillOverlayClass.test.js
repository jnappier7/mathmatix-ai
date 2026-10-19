/**
 * The full-screen TOUCHDOWN splash (#td) must be styled by its ID, never by a class an ordinary
 * element can also carry. It shipped once styled as `.td`, and the projector's play-by-play gave its
 * KICKOFF / TOUCHDOWN items the class `td` too — so the first item in the feed became a fixed,
 * full-screen gold oval that covered the whole game until eight newer plays pushed it out.
 */
const fs = require('fs');
const path = require('path');

const pub = (p) => fs.readFileSync(path.join(__dirname, '../../public', p), 'utf8');

describe('live drill: the touchdown splash cannot be borrowed by another element', () => {
  test('the stylesheet styles the splash by #td, and no rule targets a bare .td class', () => {
    const css = pub('css/live-drill.css');
    expect(css).toMatch(/#td\{position:fixed;inset:0/);
    expect(css).not.toMatch(/(^|[\s,}])\.td[\s{.,:]/m);
  });

  test.each(['js/live-drill/host.js', 'js/live-drill/play.js', 'js/live-drill/common.js'])('%s never renders an element with class "td"', (file) => {
    const js = pub(file);
    expect(js).not.toMatch(/class="[^"]*\btd\b/);
  });
});
