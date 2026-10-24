#!/usr/bin/env node
/**
 * auditReminderCards.js — find notebook "Watch for This" cards whose math is
 * wrong (course audit C07, 2026-10-23).
 *
 * The audit found a reminder telling a student that 1/3 + 1/6 = 1/2 was a
 * mistake (it is correct), "corrected" to 1/2 + 1/6 = 2/3. The persist stage
 * now validates a card's math before saving it (utils/pipeline/learningCards.js
 * validateReminderMath); this script runs that SAME check over cards saved
 * before the fix.
 *
 * A flagged card is one whose "mistake" is actually correct arithmetic, or
 * whose correction is itself false. Cards with no checkable arithmetic are
 * left alone — this never guesses.
 *
 * DRY RUN by default: prints what it would do and writes nothing.
 *   node scripts/auditReminderCards.js            # report only
 *   node scripts/auditReminderCards.js --apply    # archive flagged cards
 *
 * --apply ARCHIVES (the model's soft delete — the student no longer sees the
 * card, the evidence trail stays). Run from Render's Shell tab for prod.
 */
'use strict';

require('dotenv').config();
const mongoose = require('mongoose');
const LearningCard = require('../models/learningCard');
const { validateReminderMath } = require('../utils/pipeline/learningCards');

const APPLY = process.argv.includes('--apply');

// Undo shapeReminder: title "Watch for This: <name>", body
// "<description>\nNext time: <fix>".
function cardToMisconception(card) {
  const name = String(card.title || '').replace(/^Watch for This:\s*/i, '');
  const lines = String(card.body || '').split('\n');
  const fixAt = lines.findIndex(l => /^Next time:/i.test(l));
  const description = (fixAt === -1 ? lines : lines.slice(0, fixAt)).join('\n');
  const fix = fixAt === -1 ? '' : lines.slice(fixAt).join('\n').replace(/^Next time:\s*/i, '');
  return { name, description, fix };
}

async function main() {
  if (!process.env.MONGO_URI) {
    console.error('MONGO_URI is not set.');
    process.exit(1);
  }
  await mongoose.connect(process.env.MONGO_URI);
  console.log(`[auditReminderCards] ${APPLY ? 'APPLY — flagged cards will be archived' : 'DRY RUN — nothing will be written'}`);

  const cursor = LearningCard.find({ type: 'reminder', archived: { $ne: true } })
    .select('_id userId title body seenCount createdAt')
    .lean()
    .cursor();

  let scanned = 0;
  const flagged = [];
  for await (const card of cursor) {
    scanned++;
    const verdict = validateReminderMath(cardToMisconception(card));
    if (verdict.ok) continue;
    flagged.push({ card, verdict });
    const shown = verdict.claims.map(c => `${c.lhs} = ${c.rhs} (${c.isTrue ? 'true' : 'FALSE'})`).join('; ');
    console.log(`  ✗ ${card._id}  "${card.title}"  seen ${card.seenCount}×  ${verdict.reason}  [${shown}]`);
  }

  console.log(`\nScanned ${scanned} active reminder card(s); ${flagged.length} have wrong math.`);
  if (flagged.length && APPLY) {
    const res = await LearningCard.updateMany(
      { _id: { $in: flagged.map(f => f.card._id) } },
      { $set: { archived: true } }
    );
    console.log(`Archived ${res.modifiedCount} card(s).`);
  } else if (flagged.length) {
    console.log('Re-run with --apply to archive them.');
  }
  await mongoose.disconnect();
}

if (require.main === module) {
  main().catch(async (err) => {
    console.error('[auditReminderCards] failed:', err);
    try { await mongoose.disconnect(); } catch (_) { /* ignore */ }
    process.exit(1);
  });
}

module.exports = { cardToMisconception };
