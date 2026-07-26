/**
 * boardStateBlock.js — the tutor's eyes on its own board.
 *
 * The pipeline EMITS board commands every turn but never read them back:
 * generate/decide had zero awareness of what the student is looking at, so
 * the tutor would re-derive steps already displayed, re-narrate a solved
 * problem, or say "let's start with…" about a line that's been sitting on
 * the board for five turns.
 *
 * This builds a compact "ghost" description of the live board — what the
 * student currently SEES — from conversation.boardLedger, rebuilt fresh
 * every turn and appended to the system prompt. A system-prompt block
 * (rather than a message injected into history) is deliberate: the
 * anthropicClient adapter hoists system-role messages out of history, and
 * conversation summarization would eat an in-history ghost; the prompt
 * block is provider-safe, always current, and can never go stale.
 *
 * Token-sensitive: steps cap at the newest MAX_STEPS_SHOWN, tex is
 * truncated, and an empty board contributes nothing at all.
 */
'use strict';

const MAX_STEPS_SHOWN = 6;
const MAX_TEX = 90;

function trunc(s) {
  const t = String(s == null ? '' : s).replace(/\s+/g, ' ').trim();
  return t.length > MAX_TEX ? t.slice(0, MAX_TEX - 1) + '…' : t;
}

function describeStep(cmd) {
  if (!cmd || !cmd.action) return null;
  switch (cmd.action) {
    case 'apply': return 'operation: ' + trunc(cmd.op || cmd.tex || '');
    case 'resolve': return 'line: ' + trunc(cmd.tex);
    case 'verify': return 'SOLUTION shown: ' + trunc(cmd.tex);
    case 'scaffold': return 'scaffold with blanks for the student: ' + trunc(cmd.tex);
    case 'example': return 'worked example (different problem): ' + trunc(cmd.tex);
    case 'graph': return 'graph: ' + trunc(cmd.expression || cmd.tex || 'plotted');
    case 'image': return 'picture: ' + trunc(cmd.imageQuery || cmd.caption || '');
    case 'diagram':
    case 'model': return cmd.action + ': ' + trunc(cmd.tex || cmd.caption || 'shown');
    default: return null;
  }
}

/**
 * @param {object|null} ledger - conversation.boardLedger
 * @returns {string} the prompt block, or '' when the board is empty
 */
function buildBoardStateBlock(ledger) {
  if (!ledger || typeof ledger !== 'object') return '';
  const cur = ledger.current;
  const railCount = Array.isArray(ledger.completed) ? ledger.completed.length : 0;
  if (!cur && railCount === 0) return '';

  const lines = ['== THE STUDENT\'S BOARD (visible to them RIGHT NOW) =='];

  if (cur && cur.problemTex) {
    lines.push('Problem in focus: ' + trunc(cur.problemTex)
      + (cur.sourceRef ? ' (selected from their uploaded worksheet)' : ''));
    const steps = Array.isArray(cur.steps) ? cur.steps : [];
    const shown = steps.map(describeStep).filter(Boolean);
    const tail = shown.slice(-MAX_STEPS_SHOWN);
    if (tail.length) {
      if (shown.length > tail.length) {
        lines.push('Steps on the board (newest ' + tail.length + ' of ' + shown.length + '):');
      } else {
        lines.push('Steps on the board:');
      }
      tail.forEach((s, i) => lines.push('  ' + (shown.length - tail.length + i + 1) + '. ' + s));
      const solved = steps.some(c => c && c.action === 'verify');
      lines.push(solved
        ? 'Status: SOLVED — the final answer is displayed.'
        : 'Status: in progress — no solution line yet.');
    } else {
      lines.push('Steps on the board: none yet — only the problem is posed.');
    }
  } else {
    lines.push('No problem is in focus (board is between problems).');
  }

  if (railCount > 0) {
    lines.push('Finished-problems rail: ' + railCount + ' earlier problem' + (railCount === 1 ? '' : 's')
      + ' the student can reopen.');
  }

  lines.push('RULES: This board is shared — the student sees every line above. '
    + 'Never re-derive or re-narrate steps already displayed; refer to them instead '
    + '("look at the last line on your board"). If the problem is SOLVED, do not keep '
    + 'working it — celebrate briefly and move forward. When the student says "what\'s next", '
    + 'advance from the newest board line, not from the beginning.');

  return lines.join('\n');
}

module.exports = { buildBoardStateBlock, MAX_STEPS_SHOWN };
