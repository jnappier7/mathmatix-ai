/**
 * activityRegistry.js — the catalog of Class Activities.
 *
 * Activities are hand-built interactive pages checked into `activities/` and
 * listed in `activities/manifest.json`. They are read from disk, never from the
 * database and never from an upload: publishing an activity means landing a PR.
 * That is deliberate. An activity is arbitrary HTML + JS, and the only reason it
 * is safe to put in front of students is that (a) it is reviewed before it
 * exists and (b) routes/activities.js serves it into an opaque-origin sandbox.
 * Opening an upload path would remove (a) — see docs/CLASS_ACTIVITIES.md.
 *
 * The manifest is the contract for results: `items[].key` and `levels[].n` are
 * the only values the results endpoint will accept, so a buggy (or forged)
 * postMessage can't invent proofs or rungs that don't exist.
 */

const fs = require('fs');
const path = require('path');

const ACTIVITIES_DIR = path.join(__dirname, '..', 'activities');
const MANIFEST_PATH = path.join(ACTIVITIES_DIR, 'manifest.json');
const SLUG_RE = /^[a-z0-9][a-z0-9-]{1,63}$/;

let cache = null;

function validateEntry(entry) {
  const problems = [];
  if (!entry || typeof entry !== 'object') return ['entry is not an object'];
  if (!SLUG_RE.test(entry.slug || '')) problems.push(`bad slug "${entry.slug}"`);
  if (!entry.title) problems.push('missing title');
  if (!entry.file || entry.file !== path.basename(entry.file) || !entry.file.endsWith('.html')) {
    problems.push(`bad file "${entry.file}" (must be a bare .html filename in activities/)`);
  }
  if (!Array.isArray(entry.items) || entry.items.length === 0) problems.push('items[] must be non-empty');
  else {
    const keys = entry.items.map((i) => i && i.key);
    if (keys.some((k) => typeof k !== 'string' || !k || k.length > 32)) problems.push('every item needs a short string key');
    if (new Set(keys).size !== keys.length) problems.push('duplicate item keys');
  }
  if (!Array.isArray(entry.levels) || entry.levels.length === 0) problems.push('levels[] must be non-empty');
  else if (entry.levels.some((l) => !Number.isInteger(l && l.n) || l.n < 1)) problems.push('every level needs a positive integer n');
  return problems;
}

function load() {
  const raw = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'));
  const list = Array.isArray(raw.activities) ? raw.activities : [];
  const bySlug = new Map();
  for (const entry of list) {
    const problems = validateEntry(entry);
    if (problems.length) throw new Error(`activities/manifest.json: ${entry && entry.slug}: ${problems.join('; ')}`);
    if (bySlug.has(entry.slug)) throw new Error(`activities/manifest.json: duplicate slug ${entry.slug}`);
    if (!fs.existsSync(path.join(ACTIVITIES_DIR, entry.file))) {
      throw new Error(`activities/manifest.json: ${entry.slug}: file ${entry.file} not found`);
    }
    bySlug.set(entry.slug, Object.freeze({ ...entry }));
  }
  return bySlug;
}

function registry() {
  if (!cache) cache = load();
  return cache;
}

/** Public catalog shape — everything a dashboard needs, minus the file path. */
function toPublic(entry) {
  const { file: _file, ...rest } = entry;
  return rest;
}

function listActivities() {
  return [...registry().values()].map(toPublic);
}

function getActivity(slug) {
  if (typeof slug !== 'string' || !SLUG_RE.test(slug)) return null;
  return registry().get(slug) || null;
}

function getActivityHtml(slug) {
  const entry = getActivity(slug);
  if (!entry) return null;
  return fs.readFileSync(path.join(ACTIVITIES_DIR, entry.file), 'utf8');
}

/** Test seam: forget the cached manifest. */
function _reset() { cache = null; }

module.exports = { listActivities, getActivity, getActivityHtml, toPublic, validateEntry, _reset, SLUG_RE };
