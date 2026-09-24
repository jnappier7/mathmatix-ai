// "My materials" is a collapsed TAB, not a strip over the chat.
//
// Production (2026-09-24): three uploaded photos sat in an expanded strip at
// the top of the conversation, covering the tutor's messages, with no close
// control — and every thumbnail was a broken image. The dock now rests
// collapsed with a count, opens into a panel that closes from ✕ / Esc / an
// outside click, flies new uploads into the tab, and retries a thumbnail
// whose upload record hasn't landed yet before falling back to a placeholder.

const { SourceDock } = require('../../../public/js/living-workspace/dom/sourceDock.js');

// jsdom can't load under this repo's jest config (the other workspace suites
// test pure logic for the same reason), so this is a minimal DOM: just what
// sourceDock touches. Layout/visuals are checked in a real browser.
function makeDocument() {
  const listeners = new WeakMap();
  function on(target, type, fn, capture) {
    if (!listeners.has(target)) listeners.set(target, []);
    listeners.get(target).push({ type, fn, capture: !!capture });
  }
  function off(target, type, fn, capture) {
    const l = listeners.get(target) || [];
    const i = l.findIndex(x => x.type === type && x.fn === fn && x.capture === !!capture);
    if (i >= 0) l.splice(i, 1);
  }
  function fire(target, ev) {
    (listeners.get(target) || []).filter(x => x.type === ev.type).slice().forEach(x => x.fn.call(target, ev));
  }
  function dispatch(node, ev) {
    ev.target = ev.target || node;
    fire(doc, ev); // capture at document first (enough for the outside-click check)
    let n = node;
    while (n) { if (n !== doc) fire(n, ev); if (!ev.bubbles) break; n = n.parentNode; }
    return true;
  }
  class El {
    constructor(tag) {
      this.tagName = tag.toUpperCase(); this.children = []; this.parentNode = null;
      this.attrs = {}; this.style = {}; this._text = ''; this.hidden = false; this.className = '';
      this.ownerDocument = doc;
      const self = this;
      this.classList = {
        _set() { return new Set(self.className.split(/\s+/).filter(Boolean)); },
        contains(c) { return this._set().has(c); },
        add(c) { const s = this._set(); s.add(c); self.className = [...s].join(' '); },
        remove(c) { const s = this._set(); s.delete(c); self.className = [...s].join(' '); },
        toggle(c, force) { const has = this.contains(c); const want = force === undefined ? !has : force; want ? this.add(c) : this.remove(c); return want; },
      };
    }
    appendChild(c) { if (c.parentNode) c.parentNode.removeChild(c); c.parentNode = this; this.children.push(c); return c; }
    removeChild(c) { this.children = this.children.filter(x => x !== c); c.parentNode = null; return c; }
    replaceChild(n, o) { const i = this.children.indexOf(o); if (i >= 0) { this.children[i] = n; n.parentNode = this; o.parentNode = null; } return o; }
    insertBefore(n, ref) { const i = this.children.indexOf(ref); n.parentNode = this; i < 0 ? this.children.push(n) : this.children.splice(i, 0, n); return n; }
    set textContent(v) { this.children.forEach(c => { c.parentNode = null; }); this.children = []; this._text = String(v); }
    get textContent() { return this._text + this.children.map(c => c.textContent).join(''); }
    setAttribute(k, v) { this.attrs[k] = String(v); if (k === 'src') this._src = String(v); }
    getAttribute(k) { return k === 'src' ? (this._src ?? null) : (k in this.attrs ? this.attrs[k] : null); }
    set src(v) { this._src = String(v); }
    get src() { return this._src; }
    addEventListener(t, fn, cap) { on(this, t, fn, cap); }
    removeEventListener(t, fn, cap) { off(this, t, fn, cap); }
    dispatchEvent(ev) { return dispatch(this, ev); }
    click() { dispatch(this, { type: 'click', bubbles: true }); }
    focus() {}
    contains(n) { while (n) { if (n === this) return true; n = n.parentNode; } return false; }
    getBoundingClientRect() { return { left: 0, top: 0, width: 0, height: 0 }; }
    get offsetWidth() { return 1; }
    _all() { return this.children.flatMap(c => [c, ...c._all()]); }
    _match(sel) {
      if (sel.startsWith('.')) return this.classList.contains(sel.slice(1));
      if (sel.startsWith('#')) return this.attrs.id === sel.slice(1) || this.id === sel.slice(1);
      return this.tagName === sel.toUpperCase();
    }
    querySelectorAll(sel) { return this._all().filter(n => n._match(sel)); }
    querySelector(sel) { return this.querySelectorAll(sel)[0] || null; }
  }
  const doc = {
    createElement: (t) => new El(t),
    addEventListener: (t, fn, cap) => on(doc, t, fn, cap),
    removeEventListener: (t, fn, cap) => off(doc, t, fn, cap),
    dispatchEvent: (ev) => { ev.target = ev.target || doc; fire(doc, ev); return true; },
    defaultView: { setTimeout: (fn, ms) => setTimeout(fn, ms), matchMedia: () => ({ matches: false }) },
  };
  doc.body = new El('body');
  doc.querySelectorAll = (sel) => doc.body.querySelectorAll(sel);
  doc.getElementById = (id) => doc.body._all().find(n => n.id === id) || null;
  return doc;
}

function setup(opts) {
  const document = makeDocument();
  const host = document.createElement('div');
  const compose = document.createElement('div');
  compose.id = 'compose';
  document.body.appendChild(host);
  document.body.appendChild(compose);
  const dock = new SourceDock(host, opts || {});
  const Event = function (type, init) { return { type, bubbles: !!(init && init.bubbles), ...(init || {}) }; };
  return { dom: { window: { Event, KeyboardEvent: Event } }, document, host, dock };
}

const PHOTOS = [
  { uploadId: 'a1', fileType: 'image' },
  { uploadId: 'b2', fileType: 'image' },
  { uploadId: 'c3', fileType: 'pdf' },
];

describe('SourceDock — collapsed "My materials" tab', () => {
  test('hidden when empty; with sources it rests COLLAPSED and shows a count', () => {
    const { dock } = setup();
    expect(dock.el.root.hidden).toBe(true);
    dock.setSources(PHOTOS);
    expect(dock.el.root.hidden).toBe(false);
    expect(dock.isOpen()).toBe(false);
    expect(dock.el.root.classList.contains('is-collapsed')).toBe(true);
    expect(dock.el.count.textContent).toBe('3');
    expect(dock.el.head.getAttribute('aria-expanded')).toBe('false');
  });

  test('the tab opens the panel and the ✕ closes it', () => {
    const { dock } = setup();
    dock.setSources(PHOTOS);
    dock.el.head.click();
    expect(dock.isOpen()).toBe(true);
    expect(dock.el.head.getAttribute('aria-expanded')).toBe('true');
    dock.el.panel.querySelector('.lws-sd-close').click();
    expect(dock.isOpen()).toBe(false);
  });

  test('Esc and a click outside close the panel', () => {
    const { dom, document, dock } = setup();
    dock.setSources(PHOTOS);
    dock.expand();
    document.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Escape' }));
    expect(dock.isOpen()).toBe(false);

    dock.expand();
    document.getElementById('compose').dispatchEvent(new dom.window.Event('pointerdown', { bubbles: true }));
    expect(dock.isOpen()).toBe(false);
  });

  test('a click inside the panel does not close it', () => {
    const { dom, dock } = setup();
    dock.setSources(PHOTOS);
    dock.expand();
    dock.el.strip.dispatchEvent(new dom.window.Event('pointerdown', { bubbles: true }));
    expect(dock.isOpen()).toBe(true);
  });

  test('opening a card collapses the panel and opens the viewer', () => {
    const { host, dock } = setup();
    dock.setSources(PHOTOS);
    dock.expand();
    dock.el.strip.querySelector('.lws-sd-card').click();
    expect(dock.isOpen()).toBe(false);
    expect(host.querySelector('.lws-sd-ov')).not.toBeNull();
  });

  test('clearing an open dock hides it and releases its listeners', () => {
    const { dock } = setup();
    dock.setSources(PHOTOS);
    dock.expand();
    dock.clear();
    expect(dock.el.root.hidden).toBe(true);
    expect(dock._outsideHandler).toBeNull();
  });
});

describe('SourceDock — new uploads fly into the tab', () => {
  function ghosts(document) { return document.querySelectorAll('.lws-sd-ghost').length; }
  function stubRects(document, dock) {
    const rect = { left: 10, top: 10, width: 100, height: 30 };
    dock.el.head.getBoundingClientRect = () => rect;
    document.getElementById('compose').getBoundingClientRect = () => ({ left: 200, top: 500, width: 400, height: 60 });
  }

  test('live uploads (animateNew) fly; only the NEW ones', () => {
    const { document, dock } = setup({ flyFrom: () => document.getElementById('compose') });
    stubRects(document, dock);
    dock.setSources(PHOTOS.slice(0, 1), { animateNew: true });
    expect(ghosts(document)).toBe(1);
    dock.setSources(PHOTOS, { animateNew: true });
    expect(ghosts(document)).toBe(3); // 1 still in flight + 2 new
  });

  test('a history load does not replay flights', () => {
    const { document, dock } = setup({ flyFrom: () => document.getElementById('compose') });
    stubRects(document, dock);
    dock.setSources(PHOTOS);
    expect(ghosts(document)).toBe(0);
  });
});

describe('SourceDock — thumbnails render', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  test('a failed thumbnail load is retried, then replaced by a placeholder — never a broken image', () => {
    const { dom, dock } = setup();
    dock.setSources([{ uploadId: 'late', fileType: 'image' }]);
    const img = dock.el.strip.querySelector('img');
    expect(img.getAttribute('src')).toBe('/api/student/uploads/late/file');

    img.dispatchEvent(new dom.window.Event('error'));
    jest.advanceTimersByTime(1000);
    expect(img.getAttribute('src')).toMatch(/\/late\/file\?r=1$/);

    img.dispatchEvent(new dom.window.Event('error'));
    jest.advanceTimersByTime(2500);
    img.dispatchEvent(new dom.window.Event('error'));
    jest.advanceTimersByTime(6000);
    img.dispatchEvent(new dom.window.Event('error')); // retries exhausted

    expect(dock.el.strip.querySelector('img')).toBeNull();
    expect(dock.el.strip.querySelector('.lws-sd-card-ph')).not.toBeNull();
  });
});
