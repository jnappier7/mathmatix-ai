/**
 * The generated course site must still be St. Charles's.
 *
 * THE BUG THIS CATCHES: /courses is published from the Course Planner on a Mac
 * (~/mathmatix-course-tools/, sync_to_repo.sh), straight to main, roughly every
 * two or three days. Every publish rewrites public/courses/index.html, both
 * courses' *.html, and their assets/site.{css,js} from the generator's own
 * templates. A publish therefore reverts any hand-made change to those files
 * with no conflict, no review, and no error.
 *
 * That is exactly what b1ce44b did to de24d06: the whole St. Charles rebrand —
 * blood red, Goudy, the crest — went back to MATHMATIX.AI purple-on-navy, and
 * the school's students were served an off-brand site until someone happened to
 * open it on a phone.
 *
 * The structural half of the fix is ownership: the brand lives in
 * public/courses/assets/brand.css, which the generator has no template for and
 * never writes (the crest PNGs in that same directory survived b1ce44b
 * untouched), linked after each page's generated site.css so it wins on cascade.
 *
 * What ownership cannot protect is the HTML that links it. This test is that
 * backstop. CI already runs on pushes to main, so a publish that strips the
 * brand goes red within minutes instead of sitting broken until it is noticed.
 *
 * When this fails the fix is always the same: `npm run courses:brand`, then
 * commit the result.
 */

const fs = require('fs');
const path = require('path');

const {
  coursePages, assetPrefix, applyBrand, brandLink, SCHOOL, COURSES_DIR,
} = require('../../scripts/applyCourseBrand');

const BRAND_CSS = path.join(COURSES_DIR, 'assets', 'brand.css');
const pages = coursePages();
const rel = (f) => path.relative(COURSES_DIR, f).split(path.sep).join('/');

describe('course site brand', () => {
  test('there are course pages to check at all', () => {
    // A generator run that renamed or moved the output directory would otherwise
    // make every test below vacuously pass.
    expect(pages.length).toBeGreaterThanOrEqual(30);
  });

  test('brand.css exists and carries the school palette', () => {
    expect(fs.existsSync(BRAND_CSS)).toBe(true);
    const css = fs.readFileSync(BRAND_CSS, 'utf8');
    expect(css).toContain('#EA1D2D');                  // Pantone 185, blood red
    expect(css).toContain('#230E15');                  // rich black
    expect(css).toContain('--font-display');           // Goudy Oldstyle stack
    expect(css).toMatch(/\.topbar\s*\{[^}]*var\(--sc-red\)/); // the red masthead
  });

  test.each(pages.map((f) => [rel(f), f]))('%s is branded', (_name, file) => {
    const html = fs.readFileSync(file, 'utf8');
    const prefix = assetPrefix(file);

    // The link the whole ownership split depends on.
    expect(html).toContain(brandLink(prefix));

    // ...and it has to be LAST. site.css is regenerated on every publish and can
    // reintroduce MATHMATIX.AI's tokens; brand.css only overrides them if the
    // browser reads it afterwards.
    const brandAt = html.indexOf(brandLink(prefix));
    const lastSheet = html.lastIndexOf('<link rel="stylesheet"');
    expect(brandAt).toBe(lastSheet);
    const styleAt = html.lastIndexOf('</style>');
    expect(brandAt).toBeGreaterThan(styleAt);
    expect(brandAt).toBeLessThan(html.indexOf('</head>'));

    // The school's mark, in the three places a reader meets it.
    expect(html).toContain(`<title>`);
    expect(html).toMatch(new RegExp(`<title>[^<]*\\| ${SCHOOL}</title>`));
    expect(html).toContain(`${prefix}sc-crest.png`);
    expect(html).toMatch(new RegExp(`${prefix.replace('.', '\\.')}sc-(logo-hor-white|lockup-white)\\.png`));

    // Everything else the brand asserts, in one line: re-applying it changes
    // nothing. This is what catches a drift no assertion above anticipated.
    expect(applyBrand(html, prefix)).toBe(html);
  });
});
