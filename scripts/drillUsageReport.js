#!/usr/bin/env node
/**
 * Drill usage report — who is using the Two-Minute Drill, from a shell.
 *
 * The same report as GET /api/admin/reports/drill-usage (utils/drillUsageReport.js), for a
 * Render shell or a local run with MONGO_URI: prints a summary and writes the per-student CSV.
 *
 * Usage:  node scripts/drillUsageReport.js [--days=30] [--out=drill-usage.csv] [--json]
 *         npm run report:drill -- --days=90
 *
 * --json prints the whole report (students, totals, caveats) to stdout instead of a CSV file.
 * Every number in the CSV comes with the report's caveats: solo scores are self-reported, and
 * live games other than Math Facts leave no per-student record. Read them before quoting one.
 */
try {
  require('dotenv').config();
} catch (err) {
  if (err.code !== 'MODULE_NOT_FOUND') throw err;
}

const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');

function argValue(name) {
  const arg = process.argv.find((a) => a.startsWith(`--${name}=`));
  return arg ? arg.split('=').slice(1).join('=') : null;
}

async function main() {
  if (!process.env.MONGO_URI) {
    console.error('[drillUsageReport] MONGO_URI is required.');
    process.exit(1);
  }
  const { buildDrillUsageReport, toCsv } = require('../utils/drillUsageReport');
  const days = argValue('days');
  const out = argValue('out');
  const asJson = process.argv.includes('--json');

  await mongoose.connect(process.env.MONGO_URI);
  try {
    const report = await buildDrillUsageReport({ days });
    if (asJson) {
      process.stdout.write(JSON.stringify(report, null, 2) + '\n');
      return;
    }
    const t = report.totals;
    const stamp = report.generatedAt.toISOString().slice(0, 10);
    const file = path.resolve(out || `drill-usage-${report.window.days}d-${stamp}.csv`);
    fs.writeFileSync(file, toCsv(report.students));
    console.log(`[drillUsageReport] last ${report.window.days} days (since ${report.window.since.toISOString().slice(0, 10)})`);
    console.log(`  students with any drill activity: ${t.students}`);
    console.log(`  solo practice: ${t.soloPlayers} students · ${t.soloRounds} rounds · ${t.soloMinutes} min on the clock`);
    console.log(`  live Math Facts: ${t.liveFactPlayers} students · ${t.liveFactGames} games`);
    console.log(`  CSV: ${file}`);
    console.log('  caveats:');
    for (const c of report.caveats) console.log(`    - ${c}`);
  } finally {
    await mongoose.disconnect();
  }
}

main().then(
  () => process.exit(0),
  (err) => {
    console.error('[drillUsageReport] Failed:', err);
    process.exit(1);
  },
);
