'use strict';
/* ============================================================
   effectiveAISettings.js — the AI settings that apply to ONE student.

   A teacher's classAISettings are the defaults; a class may override any
   subset (EnrollmentCode.aiSettings). The class that applies is the primary
   teacher's most recently joined class (utils/resourceVisibility.js) — the
   same teacher the tutor already follows.

   Every reader goes through here: the chat prompt and all three
   calculator-access endpoints. Those three used to read user.teacherId
   while chat used the primary teacher, so a student in two classes could get
   one teacher's calculator rule and the other's tutoring rules.
   ============================================================ */

function isPlainObject(v) {
  return v !== null && typeof v === 'object' && !Array.isArray(v) && !(v instanceof Date);
}

/** Deep-merge `override` onto `base`. Arrays and scalars replace; '' / null in the override are ignored. */
function mergeSettings(base, override) {
  if (!isPlainObject(override)) return base || null;
  const out = isPlainObject(base) ? { ...base } : {};
  for (const [k, v] of Object.entries(override)) {
    if (v === undefined || v === null || v === '' || k === '_id') continue;
    out[k] = isPlainObject(v) && isPlainObject(out[k]) ? mergeSettings(out[k], v) : v;
  }
  return out;
}

/**
 * Keep only the keys in `edited` that differ from `defaults` — what a class
 * should STORE, so later changes to the teacher's defaults still flow through
 * to every key the class didn't deliberately change.
 */
function diffSettings(defaults, edited) {
  if (!isPlainObject(edited)) return undefined;
  const out = {};
  for (const [k, v] of Object.entries(edited)) {
    if (k === '_id' || k === 'lastUpdated') continue;
    const d = isPlainObject(defaults) ? defaults[k] : undefined;
    if (isPlainObject(v) && !Array.isArray(v)) {
      const sub = diffSettings(d, v);
      if (sub && Object.keys(sub).length) out[k] = sub;
    } else if (JSON.stringify(v) !== JSON.stringify(d === undefined ? (Array.isArray(v) ? [] : '') : d)) {
      out[k] = v;
    }
  }
  return out;
}

/**
 * @returns {Promise<{settings:Object|null, teacherId:*, classId:*, teacherName:string|null, classOverride:boolean}>}
 */
async function getEffectiveAISettings(user, { scope = null } = {}) {
  const none = { settings: null, teacherId: null, classId: null, teacherName: null, classOverride: false };
  if (!user) return none;
  const User = require('../models/user');
  const EnrollmentCode = require('../models/enrollmentCode');
  const s = scope || await require('./resourceVisibility').getStudentScope(user);
  const teacherId = s && s.primaryTeacherId;
  if (!teacherId) return none;
  const [teacher, cls] = await Promise.all([
    User.findById(teacherId).select('classAISettings firstName lastName').lean(),
    s.primaryClassId ? EnrollmentCode.findById(s.primaryClassId).select('aiSettings').lean() : null,
  ]);
  const base = teacher && teacher.classAISettings ? teacher.classAISettings : null;
  const override = cls && isPlainObject(cls.aiSettings) && Object.keys(cls.aiSettings).length ? cls.aiSettings : null;
  return {
    settings: override ? mergeSettings(base || {}, override) : base,
    teacherId,
    classId: s.primaryClassId || null,
    teacherName: teacher ? `${teacher.firstName || ''} ${teacher.lastName || ''}`.trim() : null,
    classOverride: !!override,
  };
}

/** Calculator access for a student (the shape all three endpoints return). */
async function calculatorAccessFor(user) {
  const eff = await getEffectiveAISettings(user);
  if (!eff.teacherId) return { success: true, calculatorAccess: 'always', message: 'No assigned teacher' };
  if (!eff.settings) return { success: true, calculatorAccess: 'skill-based', message: 'Teacher has not configured settings' };
  return {
    success: true,
    calculatorAccess: eff.settings.calculatorAccess || 'skill-based',
    calculatorNote: eff.settings.calculatorNote || '',
    teacherName: eff.teacherName,
  };
}

module.exports = { mergeSettings, diffSettings, getEffectiveAISettings, calculatorAccessFor };
