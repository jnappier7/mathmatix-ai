'use strict';
/* ============================================================
   theta.js — ONE answer to "what is this student's ability estimate."

   Production bug (owner-hit, 2026-07-28): a math teacher's growth check
   reported "5th grade level." Root cause: a three-way theta split-brain —
     • the Starting Point screener wrote learningProfile.abilityEstimate.theta
     • the growth check READ learningProfile.currentTheta || 0 (a field the
       screener never writes) → every growth check for a screener-placed
       student anchored at θ=0 (≈5th grade), unclimbable in 5-8 capped steps
     • the growth check WROTE learningProfile.currentTheta (which nothing
       else read), while the schema's canonical user.currentTheta was
       written by NOBODY and sat at its default 0 forever.

   Contract now:
     resolveTheta(user)  — the one read path, newest-plausible first.
     thetaWritePatch(θ, se) — the one write shape: every writer sets ALL
       fields, so legacy readers stay correct while they migrate.
   ============================================================ */

function finite(v) {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

/**
 * Best-available ability estimate. Order matters for LEGACY data:
 * growth-check field (the most recent updater when present) → screener's
 * abilityEstimate → top-level canonical (trusted when nonzero — zero is its
 * never-written default) → 0.
 */
function resolveTheta(user) {
  if (!user) return 0;
  const lp = user.learningProfile || {};
  const growth = finite(lp.currentTheta);
  if (growth !== null) return growth;
  const screener = finite(lp.abilityEstimate && lp.abilityEstimate.theta);
  if (screener !== null) return screener;
  const canonical = finite(user.currentTheta);
  if (canonical !== null && canonical !== 0) return canonical;
  return 0;
}

/** Same idea for the standard error (measurement confidence). */
function resolveStandardError(user) {
  if (!user) return 1.0;
  const lp = user.learningProfile || {};
  const growth = finite(lp.standardError);
  if (growth !== null) return growth;
  const screener = finite(lp.abilityEstimate && lp.abilityEstimate.standardError);
  if (screener !== null) return screener;
  return 1.0;
}

/**
 * The $set fragment EVERY theta writer must use — keeps all read paths,
 * legacy and canonical, in agreement from this write forward.
 */
function thetaWritePatch(theta, standardError) {
  const patch = {
    currentTheta: theta,
    'learningProfile.currentTheta': theta,
    'learningProfile.abilityEstimate.theta': theta,
  };
  if (typeof standardError === 'number' && Number.isFinite(standardError)) {
    patch['learningProfile.standardError'] = standardError;
    patch['learningProfile.abilityEstimate.standardError'] = standardError;
  }
  return patch;
}

module.exports = { resolveTheta, resolveStandardError, thetaWritePatch };
