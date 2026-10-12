/**
 * The SAT practice test's Desmos graphing calculator (utils/desmos.js).
 *
 * The key lives in DESMOS_API_KEY and reaches the browser only through the
 * /vendor/desmos-calculator.js redirect, so these pin:
 *   1. With a key: a redirect to Desmos's script carrying it. Without one (or
 *      with a malformed one): a 404 the runner falls back from, never a
 *      redirect with an empty or injected key.
 *   2. The key is never in source control.
 *   3. The CSP lets the page load it, and only the SAT uses it — the ACT keeps
 *      its scientific calculator.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const { desmosScriptHandler, desmosReport, DESMOS_SCRIPT } = require('../../utils/desmos');

function call() {
  const res = { headers: {}, statusCode: 200 };
  res.set = (k, v) => { res.headers[k] = v; return res; };
  res.status = (c) => { res.statusCode = c; return res; };
  res.type = () => res;
  res.send = (b) => { res.body = b; return res; };
  res.redirect = (c, url) => { res.statusCode = c; res.location = url; return res; };
  desmosScriptHandler({}, res);
  return res;
}

const saved = process.env.DESMOS_API_KEY;
afterEach(() => {
  if (saved === undefined) delete process.env.DESMOS_API_KEY; else process.env.DESMOS_API_KEY = saved;
});

test('with a key, the script route redirects to Desmos with it attached', () => {
  process.env.DESMOS_API_KEY = 'abcdef0123456789abcdef0123456789';
  const res = call();
  expect(res.statusCode).toBe(302);
  expect(res.location).toBe(`${DESMOS_SCRIPT}?apiKey=abcdef0123456789abcdef0123456789`);
  expect(DESMOS_SCRIPT).toMatch(/^https:\/\/www\.desmos\.com\/api\/v1\.\d+\/calculator\.js$/);
  expect(desmosReport()).toEqual({ status: 'ok' });
});

test('with no key, or a malformed one, it is a 404 — never a redirect', () => {
  for (const v of [undefined, '', '   ', 'short', 'abc"onload=alert(1)//0123456789abcdef', 'x'.repeat(80)]) {
    if (v === undefined) delete process.env.DESMOS_API_KEY; else process.env.DESMOS_API_KEY = v;
    const res = call();
    expect(res.statusCode).toBe(404);
    expect(res.location).toBeUndefined();
    expect(desmosReport()).toEqual({ status: 'off' });
  }
});

test('no Desmos key is committed anywhere in the app source', () => {
  const scan = ['utils', 'config', 'routes', 'public/js', 'public/sat-practice-test.html', 'public/chat.html'];
  const files = [];
  const walk = (p) => {
    const full = path.join(ROOT, p);
    if (!fs.existsSync(full)) return;
    if (fs.statSync(full).isFile()) { files.push(full); return; }
    for (const n of fs.readdirSync(full)) {
      const c = path.join(p, n);
      if (fs.statSync(path.join(ROOT, c)).isDirectory()) walk(c);
      else if (/\.(js|html)$/.test(n)) files.push(path.join(ROOT, c));
    }
  };
  scan.forEach(walk);
  const offenders = files.filter((f) => /apiKey=[A-Za-z0-9]{16,}/.test(fs.readFileSync(f, 'utf8')));
  expect(offenders.map((f) => path.relative(ROOT, f))).toEqual([]);
});

test('the CSP allows Desmos for scripts, styles, fonts, and connections', () => {
  const mw = fs.readFileSync(path.join(ROOT, 'config', 'middleware.js'), 'utf8');
  const directive = (name) => {
    const m = mw.match(new RegExp(`${name}:\\s*\\[([\\s\\S]*?)\\]`));
    return m ? m[1] : '';
  };
  for (const d of ['scriptSrc', 'styleSrc', 'fontSrc', 'connectSrc']) {
    expect(directive(d)).toContain("'https://www.desmos.com'");
  }
});

test('only the SAT uses Desmos; the ACT keeps the scientific calculator', () => {
  const runner = fs.readFileSync(path.join(ROOT, 'public', 'js', 'act-test.js'), 'utf8');
  const block = (key) => runner.slice(runner.indexOf(`    ${key}: {\n      key: '${key}'`), runner.indexOf('categoryLabels', runner.indexOf(`key: '${key}'`)));
  expect(block('act')).toMatch(/calculator: 'scientific'/);
  expect(block('sat')).toMatch(/calculator: 'desmos'/);
  // The runner loads it through our route, never with a key of its own.
  expect(runner).toContain("sc.src = '/vendor/desmos-calculator.js'");
});
