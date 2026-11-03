#!/usr/bin/env node
/**
 * Verdict-accuracy eval — how often does the tutor's grading call a right
 * answer wrong, or a wrong answer right?
 *
 *   npm run eval:verdict                 # live: real verifiers (needs API keys)
 *   npm run eval:verdict -- --offline    # deterministic graders only, no keys
 *   npm run eval:verdict -- --json out.json --topic calculus
 *
 * Runs tests/eval/verdict's corpus through utils/pipeline observeAndDiagnose —
 * the production verdict path — and prints false-reject / false-accept /
 * abstain / unguarded rates overall, by context (pinned / unpinned / followup)
 * and by topic, then every failing case. Exits non-zero on any failure.
 */

require('dotenv').config();

const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
const opt = (name) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : null; };
const offline = flag('--offline');

if (offline) {
  // Cut every model call BEFORE the pipeline loads (modules destructure these
  // at require time). LLM tiers then fail fast to "unverifiable", leaving the
  // deterministic graders as the only source of verdicts.
  process.env.OPENAI_API_KEY = process.env.OPENAI_API_KEY || 'offline';
  const refuse = async () => { throw new Error('offline eval: no model calls'); };
  const gateway = require('../utils/llmGateway');
  gateway.callLLM = refuse;
  gateway.callLLMStructured = refuse;
  const client = require('../utils/openaiClient');
  client.callLLM = refuse;
  client.callLLMStructured = refuse;
}

const { runAll, summarize } = require('../tests/eval/verdict/runner');

function pct(n, d) { return d ? `${((100 * n) / d).toFixed(1)}%` : '—'; }

function row(label, s) {
  const conf = s.n - s.abstain - s.unguarded - s.error;
  return [
    label.padEnd(16),
    String(s.n).padStart(5),
    pct(s.right, s.n).padStart(8),
    pct(s.abstain, s.n).padStart(9),
    String(s.falseReject).padStart(8),
    String(s.falseAccept).padStart(8),
    String(s.unguarded).padStart(9),
    pct(s.falseReject + s.falseAccept, conf).padStart(12),
  ].join(' ');
}

(async () => {
  const topic = opt('--topic');
  const started = Date.now();
  const results = await runAll({
    concurrency: offline ? 1 : Number(opt('--concurrency') || 6),
    filter: topic ? (c) => c.problem.topic === topic : null,
    quiet: !flag('--verbose'),
  });
  const s = summarize(results);

  const widths = [16, 5, 8, 9, 8, 8, 9, 12];
  const head = ['', 'cases', 'right', 'abstain', 'falseRej', 'falseAcc', 'unguard', 'wrong|conf'].map((h, i) => (i ? h.padStart(widths[i]) : h.padEnd(widths[0]))).join(' ');
  console.log(`\nVerdict accuracy — ${offline ? 'OFFLINE (deterministic graders only)' : 'LIVE (real verifiers)'} — ${((Date.now() - started) / 1000).toFixed(0)}s\n`);
  console.log(head);
  console.log(row('overall', s.overall));
  for (const [k, v] of Object.entries(s.byContext)) console.log(row(`  ${k}`, v));
  console.log('');
  for (const [k, v] of Object.entries(s.byTopic).sort()) console.log(row(k, v));

  if (s.failures.length) {
    console.log(`\n${s.failures.length} wrong verdict(s):`);
    for (const f of s.failures) {
      const what = f.outcome === 'error' ? `ERROR ${f.error}` : f.outcome;
      console.log(`  ${what.padEnd(13)} ${f.id.padEnd(9)} ${f.context.padEnd(8)} pin=${JSON.stringify(f.pin)} src=${f.source}  ${JSON.stringify(f.answer)}`);
    }
  }
  const out = opt('--json');
  if (out) {
    require('fs').writeFileSync(out, JSON.stringify({ mode: offline ? 'offline' : 'live', at: new Date().toISOString(), summary: s, results }, null, 2));
    console.log(`\nWrote ${out}`);
  }
  process.exit(s.failures.length > 0 ? 1 : 0);
})();
