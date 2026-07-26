// scripts/backfillUnifiedMasteryKeys.js
//
// One-time migration: rewrite every user's per-skill state keys from legacy
// kebab skill ids to canonical unified "Map of Mathmatix" ids, so historical
// data matches what the canonicalized read/write boundary now stores.
//
// Runtime code canonicalizes at the mastery WRITE boundary, but a user seeded
// under a legacy key before that boundary existed ends up with TWO records for one
// concept: the legacy "order-of-operations" (e.g. a screener seed, masteryScore
// 0.5) and the canonical "MS_QNT_8" that practice accumulates into. Progress cards
// pick the legacy one, so the bar sits frozen at the seed value no matter how much
// the student practices. This backfill collapses those duplicates onto the single
// canonical key — it is NOT cosmetic; it is what unfreezes those bars.
//
// Rewrites, per user:
//   - skillMastery                (Map<skillId, entry>)
//   - learningEngines.bkt         (object keyed by skillId)
//   - learningEngines.fsrs        (object keyed by skillId)
//   - learningEngines.consistency (object keyed by skillId)
//
// Collision policy (a legacy key and its unified key both present):
//   - skillMastery: keep the "stronger" entry — mastered wins, else higher
//     masteryScore, else the entry already under the canonical key.
//   - learningEngines: keep an existing canonical entry; otherwise move legacy.
//
// Usage:
//   node scripts/backfillUnifiedMasteryKeys.js            # DRY RUN (default) — reports, writes nothing
//   node scripts/backfillUnifiedMasteryKeys.js --apply    # apply changes

require('dotenv').config();
const mongoose = require('mongoose');
const { canonicalSkillId } = require('../utils/skillCanonicalizer');
const { encodeMasteryKey, decodeMasteryKey } = require('../utils/masteryGuard');

const APPLY = process.argv.includes('--apply');

function stronger(a, b) {
  // return the mastery entry to keep when two collide. masteryScore is dual-scale
  // (placement seeds it 0-1, the pillar engine writes 0-100), so a real practice
  // record always outranks a 0.5 placement seed — which is exactly what we want.
  const rank = (e) => (e?.status === 'mastered' ? 1e9 : 0) + (Number(e?.masteryScore) || 0);
  return rank(a) >= rank(b) ? a : b;
}

// Rewrite a skillMastery Map's keys to the canonical ENCODED storage key.
//
// This must operate in ENCODED key-space, not logical space. Mongoose Maps store
// dotted ids with dots swapped for "_" (masteryGuard.encodeMasteryKey), so the
// canonical record for "order-of-operations" lives under the key "MS_QNT_8", not
// "MS.QNT.8". An earlier version keyed the rebuilt map by canonicalSkillId(key)
// alone — which yields the DOTTED "MS.QNT.8". That (a) never collides with the
// runtime-written "MS_QNT_8", so legacy+unified duplicates were never merged (the
// whole point), and (b) is an invalid Mongoose Map key. Decoding the stored key
// first, then canonicalizing, then re-encoding, makes both the legacy kebab entry
// and the runtime canonical entry land on the same valid "MS_QNT_8" and merge.
function remapMap(map, mergeFn) {
  const next = new Map();
  let remapped = 0;
  let merged = 0;
  for (const [key, val] of map) {
    const canonEncoded = encodeMasteryKey(canonicalSkillId(decodeMasteryKey(key)));
    if (canonEncoded !== key) remapped += 1;
    if (next.has(canonEncoded)) {
      merged += 1;
      next.set(canonEncoded, mergeFn(next.get(canonEncoded), val));
    } else {
      next.set(canonEncoded, val);
    }
  }
  return { next, remapped, merged };
}

// Rewrite a plain object's keys to canonical ids. On collision keep the value
// already under the canonical key (don't clobber engine state we can't merge).
function remapObject(obj) {
  const next = {};
  let remapped = 0;
  let merged = 0;
  for (const [key, val] of Object.entries(obj)) {
    const canon = canonicalSkillId(key);
    if (canon !== key) remapped += 1;
    if (Object.prototype.hasOwnProperty.call(next, canon)) {
      merged += 1;
      // prefer an existing canonical entry; only fill from legacy if canonical absent
      if (canon === key) next[canon] = val;
    } else {
      next[canon] = val;
    }
  }
  return { next, remapped, merged };
}

async function main() {
  if (!process.env.MONGO_URI) {
    console.error('MONGO_URI not set.');
    process.exit(1);
  }
  await mongoose.connect(process.env.MONGO_URI);
  const User = require('../models/user');

  console.log(`\nBackfill unified mastery keys — ${APPLY ? 'APPLY (writing)' : 'DRY RUN (no writes)'}\n`);

  const cursor = User.find(
    {},
    { skillMastery: 1, learningEngines: 1 },
  ).cursor();

  const totals = { users: 0, usersChanged: 0, sm: 0, smMerged: 0, eng: 0, engMerged: 0 };

  for (let user = await cursor.next(); user != null; user = await cursor.next()) {
    totals.users += 1;
    let changed = false;

    // skillMastery (Mongoose Map)
    if (user.skillMastery && typeof user.skillMastery.forEach === 'function' && user.skillMastery.size) {
      const { next, remapped, merged } = remapMap(user.skillMastery, stronger);
      if (remapped || merged) {
        totals.sm += remapped;
        totals.smMerged += merged;
        changed = true;
        if (APPLY) {
          user.skillMastery = next;
          user.markModified('skillMastery');
        }
      }
    }

    // learningEngines.{bkt,fsrs,consistency} (plain objects, sometimes Maps)
    if (user.learningEngines) {
      for (const engine of ['bkt', 'fsrs', 'consistency']) {
        let store = user.learningEngines[engine];
        if (store instanceof Map) store = Object.fromEntries(store);
        if (store && typeof store === 'object' && Object.keys(store).length) {
          const { next, remapped, merged } = remapObject(store);
          if (remapped || merged) {
            totals.eng += remapped;
            totals.engMerged += merged;
            changed = true;
            if (APPLY) {
              user.learningEngines[engine] = next;
              user.markModified('learningEngines');
            }
          }
        }
      }
    }

    if (changed) {
      totals.usersChanged += 1;
      if (APPLY) await user.save();
    }
  }

  console.log(`Users scanned          : ${totals.users}`);
  console.log(`Users ${APPLY ? 'updated ' : 'to update'}       : ${totals.usersChanged}`);
  console.log(`skillMastery keys moved: ${totals.sm} (merged duplicates: ${totals.smMerged})`);
  console.log(`learningEngine keys    : ${totals.eng} (merged duplicates: ${totals.engMerged})`);
  if (!APPLY) console.log('\nDry run only — re-run with --apply to write these changes.');

  await mongoose.disconnect();
  process.exit(0);
}

main().catch(async (err) => {
  console.error('backfill failed:', err.message);
  try { await mongoose.disconnect(); } catch { /* noop */ }
  process.exit(1);
});
