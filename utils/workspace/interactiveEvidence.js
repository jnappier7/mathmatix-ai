'use strict';
/* ============================================================
   interactiveEvidence.js — verified model interactions become evidence.

   Spec §6.9: "interactive actions may produce mastery evidence only when
   the mathematical meaning has been verified." A meaningful_exploration
   verdict is that verification — and the HONEST evidence it supports is
   representation exposure, not correctness. So it feeds exactly one thing:
   the TRANSFER pillar's contexts (spec §13 "Representation used"), on the
   student's current target skill. Accuracy, streaks, XP: untouched.

   Idempotent by construction: a context is recorded once per skill —
   dragging a slider four hundred times earns the same single context as
   dragging it once (rewards must not track interaction volume, §19).
   ============================================================ */

const User = require('../../models/user');
const { loadOrCreatePlan, resolveCurrentTarget } = require('../tutorPlanManager');
const { getSkillMasteryEntry, setSkillMasteryEntry } = require('../masteryGuard');
const logger = require('../logger').child({ module: 'interactiveEvidence' });

/**
 * Pure half: add an interactive context to a mastery entry's transfer pillar.
 * Returns true when the entry changed (first time only).
 */
function touchTransferContext(entry, context) {
  if (!entry || !context) return false;
  if (!entry.pillars) entry.pillars = {};
  if (!entry.pillars.transfer) {
    entry.pillars.transfer = { contextsAttempted: [], contextsRequired: 3, formatVariety: false };
  }
  const t = entry.pillars.transfer;
  if (!Array.isArray(t.contextsAttempted)) t.contextsAttempted = [];
  if (t.contextsAttempted.includes(context)) return false;
  t.contextsAttempted.push(context);
  t.formatVariety = t.contextsAttempted.length >= 2;
  return true;
}

/**
 * DB half: resolve the student's current target skill and record the context.
 * Fire-and-forget from the move route — never blocks or fails a move.
 */
async function recordInteractiveEvidence(userId, context) {
  const plan = await loadOrCreatePlan(userId);
  const target = resolveCurrentTarget(plan);
  const skillId = target && target.skillId;
  if (!skillId) return { recorded: false, reason: 'no_active_skill' };

  const user = await User.findById(userId);
  if (!user) return { recorded: false, reason: 'no_user' };

  const entry = getSkillMasteryEntry(user, skillId);
  if (!entry) return { recorded: false, reason: 'no_mastery_entry' };

  if (!touchTransferContext(entry, context)) {
    return { recorded: false, reason: 'already_recorded', skillId };
  }
  setSkillMasteryEntry(user, skillId, entry);
  await user.save();
  logger.info('interactive evidence recorded', { userId: String(userId), skillId, context });
  return { recorded: true, skillId };
}

module.exports = { recordInteractiveEvidence, touchTransferContext };
