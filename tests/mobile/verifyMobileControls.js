#!/usr/bin/env node
/**
 * Mobile control verification — OPT-IN, not part of `npm test`.
 *
 *   npm install --no-save playwright-core   # Chromium already ships in the image
 *   npm run test:mobile
 *
 * Deliberately outside the jest suite, the same way the k6 load tests and the
 * live LLM evals are: it needs a browser, so wiring it into CI would add a
 * dependency and a failure mode that every unrelated PR would have to carry.
 *
 * WHY IT EXISTS: the mobile bugs this repo keeps hitting are invisible to jest.
 * `testEnvironment` is node, so nothing in the unit suite has a layout engine —
 * a control that is present in the DOM but `opacity: 0`, `display: none` at a
 * breakpoint, off-screen, or covered by another element passes every existing
 * test while being untappable on a phone. Three separate shipped bugs had that
 * exact shape (hover-only drop-X, a modal whose only opener was in a hidden
 * sidebar, a drawer full of buttons whose listeners were lost in an innerHTML
 * copy). This asserts the property those bugs violated: visible, non-zero,
 * on-screen, hit-testable at its own centre, and it actually does something.
 *
 * Not a mock: public/ is served over HTTP and the shipped HTML plus the shipped
 * /dist bundles are what load. The backend is absent, so state that would come
 * from an API is seeded into the exact container the real renderer writes to.
 * chat.html bounces to /login without a session, so the catalog checks run
 * against a focused page that loads the real courseCatalog CSS + JS instead.
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright-core');

const ROOT = '/home/user/mathmatix-ai/public';
const EXEC = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const MIME = {
  '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.woff': 'font/woff',
  '.ttf': 'font/ttf', '.mp4': 'video/mp4', '.webm': 'video/webm',
};

const server = http.createServer((req, res) => {
  const url = req.url.split('?')[0];
  // Stub the API so page bootstraps resolve instead of hanging.
  if (url.startsWith('/api/')) {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ success: true, resources: [], classes: [], sessions: [], catalog: [] }));
  }
  if (url === '/__catalog') {
    // Focused harness: the real courseCatalog CSS + JS against the DOM ids
    // chat.html gives them. chat.html itself bounces to /login without a
    // backend, and the thing under test is these rules, not the auth flow.
    res.writeHead(200, { 'Content-Type': 'text/html' });
    return res.end(`<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1">
      <link rel="stylesheet" href="/css/design-system.css">
      <link rel="stylesheet" href="/css/chat-redesign.css">
      <link rel="stylesheet" href="/css/courseCatalog.css">
      <script>window.MM_FEATURES={courses:true};window.csrfFetch=(u,o)=>Promise.resolve({json:()=>Promise.resolve({success:true,sessions:[],catalog:[]})});</script>
      </head><body>
      <div class="cr-courses-card" id="sidebar-courses-section" style="display:none">
        <button class="courses-toggle" id="courses-toggle-btn"></button>
        <div id="sidebar-courses" class="sidebar-courses-list"><div id="course-sessions-list"></div>
        <button id="browse-courses-btn"></button></div>
      </div>
      <div id="course-catalog-modal" class="modal-overlay"><div class="modal-content">
        <button id="close-catalog-modal-btn"></button>
        <div id="catalog-grid"></div></div></div>
      <div id="course-progress-wrapper" style="display:none"><div id="course-progress-dropdown" style="display:none"><div id="course-module-list"></div></div></div>
      <script src="/js/courseCatalog.js"></script></body></html>`);
  }
  const file = path.join(ROOT, decodeURIComponent(url === '/' ? '/index.html' : url));
  if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    res.writeHead(404); return res.end('nope');
  }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
});

const results = [];
function check(name, pass, detail = '') {
  results.push({ name, pass, detail });
  console.log(`${pass ? '  ✓' : '  ✗'} ${name}${detail ? '  — ' + detail : ''}`);
}

/** Visible AND hit-testable at its own center — the thing a finger needs. */
function tappable(el) {
  if (!el) return { ok: false, why: 'not in DOM' };
  const r = el.getBoundingClientRect();
  const cs = getComputedStyle(el);
  if (cs.display === 'none') return { ok: false, why: 'display:none' };
  if (cs.visibility === 'hidden') return { ok: false, why: 'visibility:hidden' };
  if (parseFloat(cs.opacity) < 0.05) return { ok: false, why: 'opacity ' + cs.opacity };
  if (r.width < 1 || r.height < 1) return { ok: false, why: 'zero box' };
  const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
  if (cx < 0 || cy < 0 || cx > window.innerWidth || cy > window.innerHeight) {
    return { ok: false, why: 'center off-screen (' + Math.round(cx) + ',' + Math.round(cy) + ')' };
  }
  const hit = document.elementFromPoint(cx, cy);
  if (!hit || (hit !== el && !el.contains(hit) && !hit.contains(el))) {
    return { ok: false, why: 'covered by ' + (hit ? hit.tagName + '.' + hit.className : 'nothing') };
  }
  return { ok: true, why: Math.round(r.width) + 'x' + Math.round(r.height) };
}
const TAPPABLE = tappable;

(async () => {
  await new Promise(r => server.listen(0, r));
  const base = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch({ executablePath: EXEC, args: ['--no-sandbox'] });

  // iPhone 14-ish, coarse pointer, no hover.
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 3,
    isMobile: true,
    hasTouch: true,
  });

  // ============ TEACHER DASHBOARD ============
  console.log('\n=== teacher-dashboard.html @ 390x844, touch ===');
  const page = await ctx.newPage();
  page.on('pageerror', e => console.log('   [pageerror]', e.message.slice(0, 120)));
  await page.goto(`${base}/teacher-dashboard.html`, { waitUntil: 'load' });
  await page.waitForTimeout(1200);

  // Premise: the desktop launcher really is unreachable on a phone.
  const qa = await page.$('#qa-practice-packs');
  const qaState = qa ? await qa.evaluate(TAPPABLE) : { ok: false, why: 'absent' };
  check('PREMISE: desktop #qa-practice-packs is unreachable on a phone', !qaState.ok, qaState.why);

  // Open the Actions drawer the way a user does.
  await page.tap('.mobile-nav-btn[data-mobile-tab="actions"]');
  await page.waitForTimeout(400);

  const ppBtn = await page.$('#mobile-practice-packs');
  const ppState = ppBtn ? await ppBtn.evaluate(TAPPABLE) : { ok: false, why: 'absent' };
  check('FIX 1: Practice Packs button is tappable in the Actions drawer', ppState.ok, ppState.why);

  if (ppState.ok) {
    await page.tap('#mobile-practice-packs');
    await page.waitForTimeout(400);
    const modalOpen = await page.$eval('#practice-pack-modal',
      el => el.classList.contains('is-visible') && getComputedStyle(el).display !== 'none');
    check('FIX 1: tapping it actually opens the practice-pack modal', modalOpen);
    await page.evaluate(() => document.getElementById('practice-pack-modal')?.classList.remove('is-visible'));
  }

  // Seed the desktop Smart Alerts panel with the markup the real renderer emits,
  // then open the drawer, which mirrors it.
  await page.evaluate(() => {
    document.getElementById('smart-alerts-feed').innerHTML = `
      <div class="smart-alert-item alert-struggle">
        <div class="smart-alert-message"><strong>Ada L.</strong> has only 4 min this week</div>
        <div>
          <button class="smart-alert-action action-encourage" data-action="encourage"
                  data-student-id="stu1" data-student-name="Ada L.">Send encouragement</button>
          <button class="smart-alert-action" data-action="view" data-student-id="stu1">Profile</button>
        </div>
      </div>`;
    // Prove the tap reached the handler by watching an effect the handler
    // owns: 'encourage' switches to the Announcements tab. (Probing
    // window.openStudentProfile does not work — handleSmartAlertAction calls
    // the closure-scoped one, not the global.)
    window.__tabClicked = null;
    document.querySelector('[data-tab="announcements"]')
      ?.addEventListener('click', () => { window.__tabClicked = 'announcements'; });
  });

  await page.tap('.mobile-nav-btn[data-mobile-tab="alerts"]');
  await page.waitForTimeout(400);

  const alertBtn = await page.$('#mobile-alerts-content .smart-alert-action[data-action="encourage"]');
  const alertState = alertBtn ? await alertBtn.evaluate(TAPPABLE) : { ok: false, why: 'absent' };
  check('FIX 2: a smart-alert action renders in the drawer', alertState.ok, alertState.why);

  if (alertState.ok) {
    await page.tap('#mobile-alerts-content .smart-alert-action[data-action="encourage"]');
    await page.waitForTimeout(500);
    const fired = await page.evaluate(() => window.__tabClicked);
    const drawerClosed = await page.$eval('#mobile-alerts-drawer', el => !el.classList.contains('open'));
    check('FIX 2: tapping it runs the handler (was inert before delegation)', fired === 'announcements',
      'reached ' + JSON.stringify(fired));
    check('FIX 2: the drawer closes so the destination is not covered', drawerClosed);
  }

  // Live Activity toggle — the new mobile surface.
  await page.evaluate(() => {
    document.getElementById('activity-feed').innerHTML =
      '<div class="activity-item" data-student-id="s9" data-conversation-id="c9">' +
      '<div class="activity-summary">Working on quadratics</div></div>';
  });
  await page.tap('.mobile-nav-btn[data-mobile-tab="alerts"]');
  await page.waitForTimeout(300);

  const toggle = await page.$('#mobile-view-activity');
  const toggleState = toggle ? await toggle.evaluate(TAPPABLE) : { ok: false, why: 'absent' };
  check('FIX 3: Live Activity toggle is tappable in the drawer', toggleState.ok, toggleState.why);

  if (toggleState.ok) {
    await page.tap('#mobile-view-activity');
    await page.waitForTimeout(400);
    const painted = await page.$eval('#mobile-alerts-content', el => el.innerHTML.includes('Working on quadratics'));
    const titled = await page.$eval('#mobile-alerts-title', el => el.textContent.trim());
    check('FIX 3: it paints the raw activity feed', painted, 'title now "' + titled + '"');

    await page.tap('#mobile-view-alerts');
    await page.waitForTimeout(300);
    const back = await page.$eval('#mobile-alerts-content', el => el.innerHTML.includes('Ada L.'));
    check('FIX 3: switching back restores Smart Alerts', back);
  }

  // The upload modal's new class picker, reached the mobile way.
  await page.evaluate(() => {
    document.getElementById('mobile-actions-drawer')?.classList.add('open');
  });
  await page.tap('#mobile-upload');
  await page.waitForTimeout(500);
  const picker = await page.$('#resource-class-picker label.resource-class-option:nth-of-type(2)');
  const pickerState = picker ? await picker.evaluate(TAPPABLE) : { ok: false, why: 'absent' };
  check('FEATURE: class picker row is tappable in the upload modal on mobile', pickerState.ok, pickerState.why);
  const rowH = await page.$$eval('#resource-class-picker label.resource-class-option',
    els => Math.min(...els.map(e => Math.round(e.getBoundingClientRect().height))));
  check('FEATURE: picker rows meet a 44px tap target', rowH >= 44, rowH + 'px tall');

  if (pickerState.ok) {
    await page.tap('#resource-class-picker input[value="classes"]');
    await page.waitForTimeout(300);
    const listShown = await page.$eval('#resource-class-list', el => !el.hidden);
    check('FEATURE: choosing "specific classes" reveals the class list', listShown);
  }

  // ============ CHAT: catalog Leave + drop-X on touch ============
  console.log('\n=== chat catalog + sidebar drop-X @ 390x844, touch ===');
  const chat = await ctx.newPage();
  chat.on('pageerror', e => console.log('   [pageerror]', e.message.slice(0, 120)));
  await chat.goto(`${base}/__catalog`, { waitUntil: 'load' });
  await chat.waitForTimeout(600);

  const catalogOk = await chat.evaluate(() => {
    const grid = document.getElementById('catalog-grid');
    const cm = window.courseManager;
    if (!grid || !cm) return { ok: false, why: 'courseManager/grid missing' };
    cm.courseSessions = [{ _id: 'sess1', courseId: 'algebra-1', courseName: 'Algebra 1' }];
    document.getElementById('course-catalog-modal').classList.add('is-visible');
    cm.renderCatalog(
      [{ courseId: 'algebra-1', title: 'Algebra 1', moduleCount: 8, prerequisites: [] },
       { courseId: 'geometry', title: 'Geometry', moduleCount: 6, prerequisites: [] }], null);
    return { ok: true };
  });

  if (!catalogOk.ok) {
    check('catalog harness', false, catalogOk.why);
  } else {
    await chat.waitForTimeout(300);
    const leave = await chat.$('.catalog-drop-btn[data-course-id="algebra-1"]');
    const leaveState = leave ? await leave.evaluate(TAPPABLE) : { ok: false, why: 'absent' };
    check('SHIPPED FIX: catalog Leave button is tappable on a phone', leaveState.ok, leaveState.why);

    const noLeave = await chat.$('.catalog-drop-btn[data-course-id="geometry"]');
    check('SHIPPED FIX: an un-enrolled course shows no Leave button', noLeave === null);

    if (leaveState.ok) {
      await chat.evaluate(() => { window.__dropped = null; window.courseManager.dropCourse = (id) => { window.__dropped = id; }; });
      await chat.tap('.catalog-drop-btn[data-course-id="algebra-1"]');
      await chat.waitForTimeout(300);
      const dropped = await chat.evaluate(() => window.__dropped);
      check('SHIPPED FIX: tapping Leave calls dropCourse with the SESSION id', dropped === 'sess1',
        'dropCourse(' + JSON.stringify(dropped) + ')');
    }
  }

  // The drop-X: force the courses card visible so we measure the coarse-pointer
  // rule itself rather than the card's own mobile display:none.
  const xState = await chat.evaluate(() => {
    const card = document.getElementById('sidebar-courses-section');
    if (!card) return { ok: false, why: 'no courses card' };
    card.style.setProperty('display', 'block', 'important');
    const list = document.getElementById('course-sessions-list');
    list.innerHTML = `<div class="course-sidebar-item"><div class="course-sidebar-row">
        <div class="course-sidebar-body"><div class="course-sidebar-name">Algebra 1</div></div>
        <button class="course-drop-x"><i class="fas fa-times"></i></button></div></div>`;
    const btn = list.querySelector('.course-drop-x');
    const cs = getComputedStyle(btn);
    const r = btn.getBoundingClientRect();
    return { ok: parseFloat(cs.opacity) > 0.9, opacity: cs.opacity, w: Math.round(r.width), h: Math.round(r.height) };
  });
  check('SHIPPED FIX: drop-X is opaque without hover on a coarse pointer', xState.ok,
    'opacity=' + xState.opacity + ' box=' + xState.w + 'x' + xState.h);
  check('SHIPPED FIX: drop-X meets a 44px tap target', xState.w >= 44 && xState.h >= 44,
    xState.w + 'x' + xState.h);

  // Horizontal overflow: a sheet that pans sideways hides its right-hand controls.
  const overflow = await chat.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
  check('no horizontal page overflow at 390px', overflow);

  await browser.close();
  server.close();

  const failed = results.filter(r => !r.pass);
  console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
  if (failed.length) {
    console.log('FAILED:');
    failed.forEach(f => console.log(`  - ${f.name}${f.detail ? ' (' + f.detail + ')' : ''}`));
  }
  process.exit(failed.length ? 1 : 0);
})().catch(e => { console.error('HARNESS ERROR:', e); server.close(); process.exit(2); });
