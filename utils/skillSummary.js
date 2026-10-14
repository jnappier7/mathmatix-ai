'use strict';
/* ============================================================
   skillSummary.js — a student's skillMastery map, reduced to what a
   teacher acts on, with ONE definition of "struggling".

   The old rule was `status === 'learning' && masteryScore < 40`. That
   flags every skill a student merely started: the pipeline seeds a new
   skill at 30 (utils/pipeline/persist.js), so "just began" read as
   "needs help", and a class roster lit up red for doing exactly what we
   want. Struggle is a claim about EVIDENCE, so it now requires some:
     • the tutor tagged strugglingAreas, or
     • the student failed it when directly tested (explicitlyFailed), or
     • accuracy < 60% over at least 4 attempts,
   and the evidence must be recent (practiced within 30 days) — last
   spring's stumble is history, not today's to-do.

   "Slipping" (re-fragile / needs-review) is reported separately: it is a
   review prompt, not an intervention.
   ============================================================ */

const { normalizedMasteryScore } = require('./masteryScore');

const DAY_MS = 24 * 60 * 60 * 1000;
const RECENT_DAYS = 30;
const MIN_ATTEMPTS = 4;
const LOW_ACCURACY = 0.6;
const IN_PROGRESS = new Set(['learning', 'practicing']);
const SLIPPING = new Set(['re-fragile', 'needs-review']);

function entriesOf(skillMastery) {
  if (!skillMastery) return [];
  if (skillMastery instanceof Map) return [...skillMastery.entries()];
  return Object.entries(skillMastery);
}

function toTime(d) {
  const t = d ? new Date(d).getTime() : 0;
  return Number.isFinite(t) ? t : 0;
}

/** Why this skill is a struggle, or null. Pure. */
function struggleReason(data, now = Date.now()) {
  if (!data || data.status === 'mastered') return null;
  const recentAt = Math.max(toTime(data.lastPracticed), toTime(data.failureDate));
  if (!recentAt || now - recentAt > RECENT_DAYS * DAY_MS) return null;

  if (Array.isArray(data.strugglingAreas) && data.strugglingAreas.filter(Boolean).length > 0) {
    return { kind: 'tutor-flagged', detail: data.strugglingAreas.filter(Boolean).slice(0, 2).join(', ') };
  }
  if (data.explicitlyFailed) return { kind: 'missed-on-check', detail: null };
  const acc = data.pillars && data.pillars.accuracy;
  const total = Number(acc && acc.total) || 0;
  if (total >= MIN_ATTEMPTS) {
    const pct = Number(acc.percentage);
    const ratio = Number.isFinite(pct) && pct > 0 ? pct : (Number(acc.correct) || 0) / total;
    if (ratio < LOW_ACCURACY) return { kind: 'low-accuracy', detail: `${Math.round(ratio * 100)}% of ${total}` };
  }
  return null;
}

/**
 * @param skillMastery  Map | object keyed by skillId
 * @param names         { skillId: displayName } (from resolveSkillDisplayNames)
 */
function summarizeSkillMastery(skillMastery, names = {}, now = Date.now()) {
  const summary = { mastered: 0, inProgress: 0, slipping: 0, total: 0, avgMastery: null, struggling: [], recentlyMastered: [] };
  let scoreSum = 0;
  let scoreCount = 0;
  for (const [skillId, data] of entriesOf(skillMastery)) {
    if (!data || data.status === 'locked' || data.status === 'ready') continue;
    summary.total++;
    if (data.status === 'mastered') {
      summary.mastered++;
      const at = toTime(data.masteredDate);
      if (at && now - at <= RECENT_DAYS * DAY_MS) {
        summary.recentlyMastered.push({ skillId, name: names[skillId] || null, masteredDate: data.masteredDate });
      }
    }
    else if (IN_PROGRESS.has(data.status)) summary.inProgress++;
    else if (SLIPPING.has(data.status)) summary.slipping++;
    if (typeof data.masteryScore === 'number') {
      scoreSum += normalizedMasteryScore(data.masteryScore);
      scoreCount++;
    }
    const reason = struggleReason(data, now);
    if (reason) {
      summary.struggling.push({
        skillId,
        name: names[skillId] || null,
        reason: reason.kind,
        detail: reason.detail,
        lastPracticed: data.lastPracticed || null,
      });
    }
  }
  summary.avgMastery = scoreCount > 0 ? Math.round(scoreSum / scoreCount) : null;
  summary.struggling.sort((a, b) => toTime(b.lastPracticed) - toTime(a.lastPracticed));
  summary.recentlyMastered.sort((a, b) => toTime(b.masteredDate) - toTime(a.masteredDate));
  summary.recentlyMastered = summary.recentlyMastered.slice(0, 5);
  return summary;
}

module.exports = { struggleReason, summarizeSkillMastery, RECENT_DAYS, MIN_ATTEMPTS, LOW_ACCURACY };
