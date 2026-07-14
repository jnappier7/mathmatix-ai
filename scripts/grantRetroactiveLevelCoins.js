/**
 * GRANT RETROACTIVE LEVEL COINS (one-time backfill)
 *
 * Coins are a recent addition. Existing users leveled up BEFORE coins
 * existed, so they never received the per-level-up coin reward
 * (coinEngine awards BRAND.coinRewards.levelUp per level GAINED, live).
 * This backfill grants them what they would have earned, so returning
 * users start with a balance that reflects their progress (and the first
 * cosmetic purchase is reachable).
 *
 * Grant per user = coinsPerLevel × (level − 1)   [levels GAINED; a level-1
 * user gained 0 levels, so gets 0]. coinsPerLevel defaults to
 * BRAND.coinRewards.levelUp (20); override with --per-level=N.
 *
 * IMPORTANT
 *  - Idempotent: sets user.wallet.retroLevelGrantedAt and skips anyone who
 *    already has it. Safe to re-run; will not double-grant.
 *  - Bypasses the daily coin cap ON PURPOSE — this is a one-time admin
 *    grant, not earned play, so a high-level user's full amount lands
 *    instead of being clamped to 500/day. It writes coins + lifetimeEarned
 *    but NOT dailyEarned, so it doesn't eat into today's earning room.
 *  - DRY RUN by default. Live mode requires --confirm. Meant to be reviewed
 *    and run by a human against a known database; NOT run automatically.
 *
 * Run: node scripts/grantRetroactiveLevelCoins.js                 (dry-run preview)
 *      node scripts/grantRetroactiveLevelCoins.js --per-level=20  (set amount)
 *      node scripts/grantRetroactiveLevelCoins.js --confirm       (apply)
 */

require('dotenv').config();
const mongoose = require('mongoose');
const User = require('../models/user');
const BRAND = require('../utils/brand');

const CONFIRM = process.argv.includes('--confirm');
const DRY_RUN = !CONFIRM;
const perLevelArg = process.argv.find(a => a.startsWith('--per-level='));
const COINS_PER_LEVEL = perLevelArg
  ? Math.max(0, parseInt(perLevelArg.split('=')[1], 10) || 0)
  : ((BRAND.coinRewards && BRAND.coinRewards.levelUp) || 20);

// Cap the retroactive grant per user so a data glitch (absurd level) can't
// mint a runaway balance. Tune if you legitimately have very high levels.
const MAX_GRANT_PER_USER = 5000;

function grantFor(level) {
  const lvl = Math.max(1, parseInt(level, 10) || 1);
  return Math.min(MAX_GRANT_PER_USER, COINS_PER_LEVEL * (lvl - 1));
}

async function main() {
  const mongoUri = process.env.MONGO_URI || process.env.MONGODB_URI;
  if (!mongoUri) {
    console.error('ERROR: MONGO_URI not set.');
    process.exit(2);
  }

  const masked = mongoUri.replace(/(mongodb(\+srv)?:\/\/)[^@]*@/, '$1***@');
  console.log('=== GRANT RETROACTIVE LEVEL COINS ===');
  console.log(`Mode:          ${DRY_RUN ? 'DRY RUN (no writes)' : 'LIVE (--confirm)'}`);
  console.log(`Coins/level:   ${COINS_PER_LEVEL} (× levels gained = level − 1)`);
  console.log(`Database:      ${masked}\n`);

  await mongoose.connect(mongoUri);

  // Only users who haven't already received the grant.
  const candidates = await User.find({
    'wallet.retroLevelGrantedAt': { $in: [null, undefined] },
  }).select('_id firstName level wallet');

  let eligible = 0;
  let totalCoins = 0;
  let updated = 0;
  const preview = [];

  for (const user of candidates) {
    const level = user.level || 1;
    const grant = grantFor(level);
    if (grant <= 0) {
      // Level-1 users: nothing to grant, but still stamp them so re-runs skip.
      if (!DRY_RUN) {
        if (!user.wallet) user.wallet = {};
        user.wallet.retroLevelGrantedAt = new Date();
        user.markModified('wallet');
        await user.save();
      }
      continue;
    }

    eligible += 1;
    totalCoins += grant;
    if (preview.length < 25) {
      preview.push(`  ${user.firstName || user._id} — L${level} → +${grant} 🪙 (${(user.wallet && user.wallet.coins) || 0} → ${((user.wallet && user.wallet.coins) || 0) + grant})`);
    }

    if (!DRY_RUN) {
      if (!user.wallet) user.wallet = { coins: 0, lifetimeEarned: 0, dailyEarned: 0, lastCoinReset: new Date() };
      // Bypass the daily cap: direct grant to spendable + lifetime, leave
      // dailyEarned untouched so it doesn't consume today's earning room.
      user.wallet.coins = (user.wallet.coins || 0) + grant;
      user.wallet.lifetimeEarned = (user.wallet.lifetimeEarned || 0) + grant;
      user.wallet.retroLevelGrantedAt = new Date();
      user.markModified('wallet');
      await user.save();
      updated += 1;
    }
  }

  console.log(`Candidates (not yet granted): ${candidates.length}`);
  console.log(`Eligible (level > 1):         ${eligible}`);
  console.log(`Total coins to grant:         ${totalCoins}\n`);
  if (preview.length) {
    console.log('Examples:');
    console.log(preview.join('\n'));
    if (eligible > preview.length) console.log(`  … and ${eligible - preview.length} more.`);
  }

  if (DRY_RUN) {
    console.log('\nDRY RUN — nothing written. Re-run with --confirm to apply.');
  } else {
    console.log(`\n✅ Granted coins to ${updated} user(s); all candidates stamped as processed.`);
  }

  await mongoose.disconnect();
  process.exit(0);
}

main().catch((err) => {
  console.error('Grant failed:', err);
  process.exit(2);
});
