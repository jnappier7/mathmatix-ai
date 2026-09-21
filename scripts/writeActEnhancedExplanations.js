// scripts/writeActEnhancedExplanations.js
//
// Fill in the empty `explanation` on the act-enhanced bank, from
// utils/actItemExplainers.js.
//
//   node scripts/writeActEnhancedExplanations.js            # report only
//   node scripts/writeActEnhancedExplanations.js --write    # write the bank file
//   node scripts/writeActEnhancedExplanations.js --gaps     # list what is still unexplained
//
// Pure file transform — no DB. Re-run after adding explainers; it is idempotent
// and only ever fills a blank, never overwrites text that is already there.

const fs = require('fs');
const path = require('path');
const { explainItem } = require('../utils/actItemExplainers');

const BANK = path.join(__dirname, '..', 'seeds', 'act-enhanced', 'act-items.generated.json');
const args = process.argv.slice(2);
const WRITE = args.includes('--write');
const GAPS = args.includes('--gaps');

const shapeOf = (s) => String(s || '').replace(/\d+(\.\d+)?/g, '#').replace(/\s+/g, ' ').trim().slice(0, 90);
const fineOf = (p) => (p.tags || []).find((t) => t.startsWith('fine:'))?.slice(5) || '?';

function main() {
  const items = JSON.parse(fs.readFileSync(BANK, 'utf8'));
  const counts = { ok: 0, unmatched: 0, keyMismatch: 0, alreadyHad: 0 };
  const mismatches = [];
  const gaps = new Map();

  for (const item of items) {
    if (item.explanation && item.explanation.trim()) { counts.alreadyHad += 1; continue; }
    const r = explainItem(item);
    if (r.status === 'ok') {
      item.explanation = r.explanation;
      counts.ok += 1;
    } else if (r.status === 'key-mismatch') {
      // The derivation disagrees with the stored key. That is a mis-keyed item,
      // not a missing paragraph — writing a confident explanation around a bad
      // key would make the review flow teach the wrong thing with conviction.
      counts.keyMismatch += 1;
      mismatches.push({ problemId: item.problemId, prompt: item.prompt, derived: r.derived, stored: r.stored, explainer: r.explainer });
    } else {
      counts.unmatched += 1;
      const k = shapeOf(item.prompt);
      if (!gaps.has(k)) gaps.set(k, { fine: fineOf(item), n: 0, sample: item.prompt });
      gaps.get(k).n += 1;
    }
  }

  const total = items.length;
  console.log(`bank: ${total} items`);
  console.log(`  explained now:      ${counts.ok}  (${(100 * counts.ok / total).toFixed(1)}%)`);
  console.log(`  already had text:   ${counts.alreadyHad}`);
  console.log(`  no explainer yet:   ${counts.unmatched}  across ${gaps.size} prompt shapes`);
  console.log(`  KEY MISMATCHES:     ${counts.keyMismatch}`);

  if (mismatches.length) {
    console.log('\n  These items were NOT given an explanation — the derivation disagrees with');
    console.log('  the stored key, which means the key is probably wrong. Check before serving:');
    mismatches.forEach((x) => {
      console.log(`    ${x.problemId}  [${x.explainer}]`);
      console.log(`      ${x.prompt}`);
      console.log(`      derived ${JSON.stringify(x.derived)} vs stored ${JSON.stringify(x.stored)}`);
    });
  }

  if (GAPS) {
    console.log('\n  Unexplained shapes, most items first — the worklist for the next explainer:');
    [...gaps.values()].sort((a, b) => b.n - a.n).slice(0, 60).forEach((g) => {
      console.log(`    ${String(g.n).padStart(3)}  [${g.fine}] ${g.sample.slice(0, 100)}`);
    });
  }

  if (!WRITE) {
    console.log('\nREPORT ONLY — pass --write to save the bank.');
    return;
  }
  fs.writeFileSync(BANK, `${JSON.stringify(items, null, 1)}\n`);
  console.log(`\nWrote ${counts.ok} explanations to ${path.relative(process.cwd(), BANK)}`);
}

if (require.main === module) main();
