#!/usr/bin/env node
/**
 * Aggregate the per-run jest logs from scripts/nightly-tutor-eval.sh into a
 * per-test, per-model pass-rate table (markdown, appended to
 * $GITHUB_STEP_SUMMARY when present).
 *
 * Exit code — the live tier is nondeterministic, so the rule is majority-based:
 *   exit 1 (REGRESSION) if any test fails MORE THAN HALF its runs for a model;
 *   exit 0 otherwise. Tests that fail some-but-not-most runs are listed as
 *   FLAKY in the summary — watch them, but they don't page anyone.
 */
'use strict';

const fs = require('fs');
const path = require('path');

const dir = process.argv[2];
if (!dir || !fs.existsSync(dir)) {
  console.error('usage: node scripts/nightlyEvalSummary.js <log-dir>');
  process.exit(2);
}

// { model: { testName: { pass: n, fail: n } } }, insertion-ordered.
const results = new Map();
const runCounts = new Map(); // model -> runs seen

for (const file of fs.readdirSync(dir).sort()) {
  const m = file.match(/^(.+)-run(\d+)\.log$/);
  if (!m) continue;
  const model = m[1];
  runCounts.set(model, (runCounts.get(model) || 0) + 1);
  if (!results.has(model)) results.set(model, new Map());
  const perTest = results.get(model);

  const text = fs.readFileSync(path.join(dir, file), 'utf8');
  for (const line of text.split('\n')) {
    const t = line.match(/^\s*([✓✕])\s+(.+?)(?:\s+\(\d+\s*m?s\))?\s*$/u);
    if (!t) continue;
    const name = t[2];
    if (/is opt-in via RUN_LLM_EVAL/.test(name)) continue; // config sentinel tests
    if (!perTest.has(name)) perTest.set(name, { pass: 0, fail: 0 });
    perTest.get(name)[t[1] === '✓' ? 'pass' : 'fail'] += 1;
  }
}

if (results.size === 0) {
  console.error(`No per-run logs matching *-runN.log found in ${dir}`);
  process.exit(2);
}

const regressions = [];
const flaky = [];
const lines = ['# Nightly tutor eval', ''];

for (const [model, perTest] of results) {
  const runs = runCounts.get(model);
  lines.push(`## ${model} (${runs} runs)`, '', '| Test | Pass rate | Status |', '|---|---|---|');
  for (const [name, { pass, fail }] of perTest) {
    const total = pass + fail;
    let status = '✅';
    if (fail > total / 2) {
      status = '❌ REGRESSION';
      regressions.push(`${model}: ${name} (${pass}/${total})`);
    } else if (fail > 0) {
      status = '⚠️ flaky';
      flaky.push(`${model}: ${name} (${pass}/${total})`);
    }
    lines.push(`| ${name} | ${pass}/${total} | ${status} |`);
  }
  lines.push('');
}

if (regressions.length) {
  lines.push('## ❌ Stable regressions (failed a majority of runs)', '');
  for (const r of regressions) lines.push(`- ${r}`);
  lines.push('');
}
if (flaky.length) {
  lines.push('## ⚠️ Flaky (failed some runs — watch, not paged)', '');
  for (const f of flaky) lines.push(`- ${f}`);
  lines.push('');
}

const summary = lines.join('\n');
console.log(summary);
if (process.env.GITHUB_STEP_SUMMARY) {
  fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, summary + '\n');
}

process.exit(regressions.length ? 1 : 0);
