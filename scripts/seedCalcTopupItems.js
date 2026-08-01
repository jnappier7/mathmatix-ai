// scripts/seedCalcTopupItems.js
// Seeds the hand-authored AP Calculus AB top-up items
// (seeds/calc-topup-items.generated.json, produced by
// scripts/buildCalcTopupItems.js) into the Problem collection.
//
// These fill the ten AB skills the coverage audit showed as THIN (1-4 problems,
// all at difficulty 3) so each clears the 5-problem bar with a 2-4 spread.
//
//   node scripts/seedCalcTopupItems.js            # upsert
//   node scripts/seedCalcTopupItems.js --fresh    # clear prior top-up items first

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const dns = require('dns');
const mongoose = require('mongoose');

const ITEMS_FILE = path.join(__dirname, '..', 'seeds', 'calc-topup-items.generated.json');

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
    console.error(`Missing ${path.relative(process.cwd(), ITEMS_FILE)} — run: node scripts/buildCalcTopupItems.js`);
    process.exit(1);
  }
  const items = JSON.parse(fs.readFileSync(ITEMS_FILE, 'utf8'));

  await ensureSrvResolvable(process.env.MONGO_URI);
  await mongoose.connect(process.env.MONGO_URI);
  const Problem = require('../models/problem');

  if (process.argv.includes('--fresh')) {
    const del = await Problem.deleteMany({ source: 'calc-topup' });
    console.log(`Cleared ${del.deletedCount} prior top-up items (--fresh).`);
  }

  let up = 0;
  for (const it of items) {
    await Problem.updateOne({ problemId: it.problemId }, { $set: it }, { upsert: true });
    up += 1;
  }
  console.log(`Upserted ${up} AP Calc AB top-up items (source: calc-topup).`);

  await mongoose.disconnect();
  process.exit(0);
}

main().catch(async (err) => {
  console.error('seedCalcTopupItems failed:', err.message);
  try { await mongoose.disconnect(); } catch { /* noop */ }
  process.exit(1);
});
