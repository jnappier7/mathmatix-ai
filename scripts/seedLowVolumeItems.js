// scripts/seedLowVolumeItems.js
// Seeds the template-generated items (seeds/low-volume-items.generated.json,
// produced by scripts/buildLowVolumeItems.js) into the Problem collection.
//
// These fill Algebra 1 and 6th-grade skills the coverage audit showed EMPTY —
// the courses with the most active students. Every answer is computed by its
// template and independently re-derived by scripts/verifyGeneratedItems.js,
// which must be run before seeding.
//
//   node scripts/seedLowVolumeItems.js            # upsert
//   node scripts/seedLowVolumeItems.js --fresh    # clear prior low-volume items first

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const dns = require('dns');
const mongoose = require('mongoose');

const ITEMS_FILE = path.join(__dirname, '..', 'seeds', 'low-volume-items.generated.json');

async function ensureSrvResolvable(uri) {
  if (!/^mongodb\+srv:\/\//.test(uri || '')) return;
  const host = uri.split('@').pop().split('/')[0].split('?')[0];
  const probe = () => new Promise((res) => dns.resolveSrv(`_mongodb._tcp.${host}`, (e) => res(!e)));
  if (await probe()) return;
  dns.setServers(['8.8.8.8', '1.1.1.1']);
  console.log('[dns] local resolver failed the SRV lookup — using public resolvers');
}

async function main() {
  if (!process.env.MONGO_URI) {
    console.error('MONGO_URI not set.');
    process.exit(1);
  }
  if (!fs.existsSync(ITEMS_FILE)) {
    console.error(`Missing ${path.relative(process.cwd(), ITEMS_FILE)} — run: node scripts/buildLowVolumeItems.js`);
    process.exit(1);
  }
  const items = JSON.parse(fs.readFileSync(ITEMS_FILE, 'utf8'));

  await ensureSrvResolvable(process.env.MONGO_URI);
  await mongoose.connect(process.env.MONGO_URI);
  const Problem = require('../models/problem');

  if (process.argv.includes('--fresh')) {
    const del = await Problem.deleteMany({ source: 'low-volume-2026-08' });
    console.log(`Cleared ${del.deletedCount} prior top-up items (--fresh).`);
  }

  let up = 0;
  for (const it of items) {
    await Problem.updateOne({ problemId: it.problemId }, { $set: it }, { upsert: true });
    up += 1;
  }
  console.log(`Upserted ${up} low-volume expansion items (source: low-volume-2026-08).`);

  await mongoose.disconnect();
  process.exit(0);
}

main().catch(async (err) => {
  console.error('seedLowVolumeItems failed:', err.message);
  try { await mongoose.disconnect(); } catch { /* noop */ }
  process.exit(1);
});
