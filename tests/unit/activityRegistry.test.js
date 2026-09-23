/**
 * activities/manifest.json is the results contract: the events endpoint only
 * accepts item keys and levels the manifest lists. If an activity's own ids
 * drift from its manifest entry, every Check from that item is rejected with a
 * 400 the student never sees — the work just silently isn't saved. So pin the
 * two against each other, and pin that each activity actually speaks the
 * host protocol.
 */

const fs = require('fs');
const path = require('path');
const registry = require('../../utils/activityRegistry');

const DIR = path.join(__dirname, '..', '..', 'activities');

describe('activity registry', () => {
  beforeEach(() => registry._reset());

  test('the manifest loads and every entry validates', () => {
    const list = registry.listActivities();
    expect(list.length).toBeGreaterThan(0);
    for (const a of list) {
      expect(a.file).toBeUndefined(); // public shape hides the path
      expect(registry.getActivityHtml(a.slug)).toContain('<title>');
    }
  });

  test('lookups reject anything that is not a clean slug', () => {
    expect(registry.getActivity('../manifest')).toBeNull();
    expect(registry.getActivity('PROOF-SCRAMBLE')).toBeNull();
    expect(registry.getActivity(undefined)).toBeNull();
    expect(registry.getActivity('proof-scramble')).not.toBeNull();
  });

  test('validateEntry catches the mistakes that would break results', () => {
    const good = { slug: 'x-y', title: 'T', file: 'x.html', items: [{ key: 'A' }], levels: [{ n: 1 }] };
    expect(registry.validateEntry(good)).toEqual([]);
    expect(registry.validateEntry({ ...good, file: '../x.html' })).not.toEqual([]);
    expect(registry.validateEntry({ ...good, items: [{ key: 'A' }, { key: 'A' }] })).not.toEqual([]);
    expect(registry.validateEntry({ ...good, levels: [{ n: 0 }] })).not.toEqual([]);
  });

  test('every activity speaks the host protocol', () => {
    for (const a of registry.listActivities()) {
      const html = registry.getActivityHtml(a.slug);
      expect(html).toContain('"mathmatix-activity"');
      expect(html).toContain('"mathmatix-host"');
    }
  });
});

describe('proof-scramble: manifest ↔ page', () => {
  const html = fs.readFileSync(path.join(DIR, 'proof-scramble.html'), 'utf8');
  const entry = registry.getActivity('proof-scramble');

  test('item keys are exactly the PROOFS ids, in order', () => {
    const ids = [...html.matchAll(/\{id:"([A-Z0-9]+)", name:/g)].map((m) => m[1]);
    expect(ids.length).toBeGreaterThan(0);
    expect(entry.items.map((i) => i.key)).toEqual(ids);
  });

  test('levels are exactly the RUNGS', () => {
    const rungs = [...html.matchAll(/\{n:(\d+), name:"([^"]+)"/g)].map((m) => ({ n: Number(m[1]), name: m[2] }));
    expect(entry.levels).toEqual(rungs);
  });

  test('no completion slip when hosted — Mathmatix already has the result', () => {
    expect(html).toMatch(/function slipHTML\(p\)\{\s*if \(MM\.hosted\) return "";/);
  });
});
