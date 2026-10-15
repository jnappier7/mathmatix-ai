#!/usr/bin/env node
/**
 * Remove phantom badges — users.badges[] entries with NEITHER a badgeId NOR a key.
 *
 * Cause (fixed in #1733): masteryProgress.activeBadge has numeric defaults, so
 * Mongoose put a stub on every user; the badge-completion check compared
 * against undefined requirements (`n < undefined` is false) and "awarded" an
 * id-less badge (+500 XP) on a student's first answered free-chat turn.
 * Measured 2026-10-15: 62 entries on 62 students, 2026-07-21 → 2026-10-14;
 * every legitimate badge (26) carries a badgeId and/or key and is untouched.
 *
 * XP is NOT changed — whether to take back the +500 is a separate decision.
 *
 * Usage:
 *   node scripts/removePhantomBadges.js            # dry run (default): report only
 *   node scripts/removePhantomBadges.js --apply    # back up, then remove
 *
 * --apply writes every removed entry (with its userId) to
 * ~/mathmatix-backups/phantom-badges-<timestamp>.json BEFORE writing, and only
 * rewrites a user's badges if the array is unchanged since it was read.
 */

require('dotenv').config();
const fs = require('fs');
const os = require('os');
const path = require('path');
const { MongoClient } = require('mongodb');

const APPLY = process.argv.includes('--apply');
const isBlank = (v) => v === undefined || v === null || (typeof v === 'string' && v.trim() === '');
const isPhantom = (b) => b && isBlank(b.badgeId) && isBlank(b.key);

(async () => {
  if (!process.env.MONGO_URI) throw new Error('MONGO_URI is not set');
  const client = await MongoClient.connect(process.env.MONGO_URI);
  const users = client.db().collection('users');

  const candidates = await users
    .find({ badges: { $elemMatch: { $and: [
      { $or: [{ badgeId: { $exists: false } }, { badgeId: null }, { badgeId: '' }] },
      { $or: [{ key: { $exists: false } }, { key: null }, { key: '' }] },
    ] } } })
    .project({ badges: 1, username: 1 })
    .toArray();

  const plan = candidates.map((u) => ({
    userId: String(u._id),
    username: u.username,
    before: u.badges,
    removed: u.badges.filter(isPhantom),
    kept: u.badges.filter((b) => !isPhantom(b)),
  })).filter((p) => p.removed.length);

  const totalRemoved = plan.reduce((n, p) => n + p.removed.length, 0);
  const totalKept = plan.reduce((n, p) => n + p.kept.length, 0);
  console.log(`${APPLY ? 'APPLY' : 'DRY RUN'}: ${totalRemoved} phantom badge(s) on ${plan.length} user(s); ${totalKept} real badge(s) on those users kept.`);

  if (!APPLY) {
    console.log('Nothing written. Re-run with --apply to back up and remove.');
    await client.close();
    return;
  }

  const dir = path.join(os.homedir(), 'mathmatix-backups');
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `phantom-badges-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
  fs.writeFileSync(file, JSON.stringify(plan.map(({ userId, username, removed }) => ({ userId, username, removed })), null, 2));
  console.log(`Backup written: ${file}`);

  let updated = 0;
  let skipped = 0;
  for (const p of plan) {
    // Optimistic: only if badges is exactly what we read (no award raced us).
    const r = await users.updateOne({ _id: candidates.find((u) => String(u._id) === p.userId)._id, badges: p.before }, { $set: { badges: p.kept } });
    if (r.modifiedCount === 1) updated++; else { skipped++; console.warn(`  skipped ${p.userId} (badges changed since read — re-run)`); }
  }
  console.log(`Removed phantom badges from ${updated} user(s); ${skipped} skipped.`);
  await client.close();
})().catch((e) => { console.error(e.message); process.exit(1); });
