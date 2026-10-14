#!/usr/bin/env node
// scripts/refreshSatFigures.js — redraw the SAT bank's graphs and give every
// SAT figure a written description, in seeds/sat-items.generated.json.
//
// The SAT ingest (scripts/ingestSatItems.py) draws figures with matplotlib and
// stored no description, so every SAT figure reached a screen reader as
// "Figure for this question", and bar graphs, scatterplots and graphs came out
// with 6-7 point tick labels and gridlines that missed the data (QA pass,
// 2026-10-13). This reads each item's figure spec from seeds/sat-math/*.json
// and applies utils/satCharts.js:
//   bar, scatter, fgraph, region  -> a new SVG (house style, 2× canvas) + figureAlt
//   table, geometry               -> figureAlt only (the drawing is unchanged)
//
// The ingest runs this at the end of every run, so the two can't drift.
// Idempotent; prints what changed.
//
// Usage: node scripts/refreshSatFigures.js [--dry]

const fs = require('fs');
const path = require('path');
const { renderSatFigure } = require('../utils/satCharts');

const ROOT = path.join(__dirname, '..');
const SRC = path.join(ROOT, 'seeds', 'sat-math');
const OUT = path.join(ROOT, 'seeds', 'sat-items.generated.json');

/** problemId -> figure spec, keyed exactly as ingestSatItems.py keys items. */
function figureSpecs() {
  const specs = new Map();
  for (const f of fs.readdirSync(SRC).filter((x) => /^sat_(w\d+|bank_p\d+)\.json$/.test(x)).sort()) {
    const d = JSON.parse(fs.readFileSync(path.join(SRC, f), 'utf8'));
    const bank = /^sat_bank_(p\d+)\.json$/.exec(f);
    for (const it of d.items || []) {
      if (!it.figure) continue;
      const id = bank ? `sat-math-${bank[1]}q${it.n}` : `sat-math-w${d.week}q${it.n}`;
      specs.set(id, it.figure);
    }
  }
  return specs;
}

function refresh(items, specs) {
  let svgs = 0, alts = 0;
  for (const item of items) {
    const fig = specs.get(item.problemId);
    if (!fig) continue;
    const { svg, alt } = renderSatFigure(fig.kind, fig.params);
    if (svg && item.svg !== svg) { item.svg = svg; svgs += 1; }
    if (alt && item.figureAlt !== alt) {
      // Keep key order stable: figureAlt sits right after svg.
      const entries = Object.entries(item).filter(([k]) => k !== 'figureAlt');
      const at = entries.findIndex(([k]) => k === 'svg');
      entries.splice(at + 1, 0, ['figureAlt', alt]);
      Object.keys(item).forEach((k) => delete item[k]);
      entries.forEach(([k, v]) => { item[k] = v; });
      alts += 1;
    }
  }
  return { svgs, alts };
}

function main() {
  const dry = process.argv.includes('--dry');
  const raw = fs.readFileSync(OUT, 'utf8');
  const items = JSON.parse(raw);
  const specs = figureSpecs();
  const { svgs, alts } = refresh(items, specs);
  console.log(`sat figures: ${specs.size} specs | ${svgs} drawings and ${alts} descriptions ${dry ? 'would change' : 'changed'}`);
  // The ingest's own format: json.dump(indent=2, ensure_ascii=False), no trailing newline.
  if (!dry && (svgs || alts)) fs.writeFileSync(OUT, JSON.stringify(items, null, 2));
}

if (require.main === module) main();

module.exports = { figureSpecs, refresh };
