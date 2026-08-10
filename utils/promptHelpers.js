// utils/promptHelpers.js
//
// Shared helpers used by both the full and compact prompt generators.
// Extracted to avoid circular dependencies.

/**
 * Build IEP accommodations context for AI prompt (compact version)
 * @param {Object} iepPlan - IEP plan from user profile
 * @param {string} firstName - Student's first name
 */
function buildIepAccommodationsPrompt(iepPlan, firstName) {
  if (!iepPlan || !iepPlan.accommodations) {
    return '';
  }

  const accom = iepPlan.accommodations;
  const hasAnyAccommodation = Object.values(accom).some(v =>
    v === true || (Array.isArray(v) && v.length > 0)
  );

  if (!hasAnyAccommodation && (!iepPlan.goals || iepPlan.goals.length === 0)) {
    return '';
  }

  let prompt = `\n--- IEP ACCOMMODATIONS (LEGALLY REQUIRED) ---\n`;
  prompt += `${firstName} has an Individualized Education Program (IEP). You MUST respect these accommodations.\n\n`;

  const activeAccommodations = [];

  if (accom.extendedTime) {
    activeAccommodations.push('extendedTime');
    prompt += `✓ **Extended Time (1.5x):** Never rush ${firstName}. Give 1.5x time on all activities.\n`;
  }
  if (accom.audioReadAloud) {
    activeAccommodations.push('audioReadAloud');
    prompt += `✓ **Audio Read-Aloud Support:** Problems should be read aloud. Use clear language.\n`;
  }
  if (accom.calculatorAllowed) {
    activeAccommodations.push('calculatorAllowed');
    prompt += `✓ **Calculator Allowed:** NEVER restrict calculator use. Focus on strategy, not arithmetic.\n`;
  }
  if (accom.chunkedAssignments) {
    activeAccommodations.push('chunkedAssignments');
    prompt += `✓ **Chunked Assignments:** Present only 3-5 problems at a time, then check in.\n`;
  }
  if (accom.breaksAsNeeded) {
    activeAccommodations.push('breaksAsNeeded');
    prompt += `✓ **Breaks As Needed:** Encourage breaks proactively. Offer brain breaks when energy dips.\n`;
  }
  if (accom.digitalMultiplicationChart) {
    activeAccommodations.push('digitalMultiplicationChart');
    prompt += `✓ **Digital Multiplication Chart Available:** Do not penalize use. Focus on problem-solving, not memorization.\n`;
  }
  if (accom.reducedDistraction) {
    activeAccommodations.push('reducedDistraction');
    prompt += `✓ **Reduced Distraction Environment:** Keep visuals clean and uncluttered. One concept at a time.\n`;
  }
  if (accom.largePrintHighContrast) {
    activeAccommodations.push('largePrintHighContrast');
    prompt += `✓ **Large Print / High Contrast:** Use clear, large visuals. Ensure readability.\n`;
  }
  if (accom.mathAnxietySupport) {
    activeAccommodations.push('mathAnxietySupport');
    prompt += `✓ **Math Anxiety Support:** Extra encouragement, growth mindset language, normalize mistakes. Celebrate effort and persistence.\n`;
  }
  if (accom.custom && Array.isArray(accom.custom) && accom.custom.length > 0) {
    activeAccommodations.push('custom');
    prompt += `✓ **Custom Accommodations:**\n`;
    accom.custom.forEach(customAccom => {
      prompt += `  - ${customAccom}\n`;
    });
  }

  // Reading level adjustment
  if (iepPlan.readingLevel) {
    const rl = iepPlan.readingLevel;
    const isLexile = rl > 20;
    const { lexileToGrade } = require('./readability');
    const targetGrade = isLexile ? lexileToGrade(rl) : rl;
    const maxSentenceWords = targetGrade <= 3 ? 8 : targetGrade <= 5 ? 12 : 15;
    prompt += `✓ **Reading Level Adjustment (ENFORCED — responses are automatically scored):**\n`;
    prompt += `  - ${firstName}'s reading level is ${isLexile ? `${rl}L (Lexile) ≈ Grade ${targetGrade}` : `Grade ${rl}`}\n`;
    prompt += `  - Target: Grade ${targetGrade}. MAXIMUM sentence length: ${maxSentenceWords} words.\n`;
    prompt += `  - Use common, everyday vocabulary. Response will be automatically scored for readability.\n`;
  }

  // Preferred scaffolds
  if (iepPlan.preferredScaffolds && iepPlan.preferredScaffolds.length > 0) {
    prompt += `✓ **Preferred Scaffolding Strategies:** ${iepPlan.preferredScaffolds.join(', ')}\n`;
  }

  if (activeAccommodations.length > 0) {
    prompt += `\n**Compliance:** These accommodations are legally required under IDEA.\n`;
  }

  // IEP Goals
  if (iepPlan.goals && iepPlan.goals.length > 0) {
    const activeGoals = iepPlan.goals.filter(goal => goal.status === 'active');
    if (activeGoals.length > 0) {
      prompt += `\n**IEP GOALS:** ${firstName} has ${activeGoals.length} active IEP goal${activeGoals.length !== 1 ? 's' : ''}.\n`;
      activeGoals.forEach((goal, index) => {
        const pct = goal.currentProgress || 0;
        const targetDate = goal.targetDate ? new Date(goal.targetDate).toLocaleDateString() : 'TBD';
        prompt += `${index + 1}. **${goal.description}** — ${pct}% (target: ${targetDate})`;
        if (goal.measurementMethod) prompt += ` — Measurement: ${goal.measurementMethod}`;
        prompt += '\n';
      });
      prompt += `Track progress: <IEP_GOAL_PROGRESS:goal-description,+N>\n`;
    }
  }

  return prompt;
}

/**
 * The nine switches shared by iepAccommodationsSchema and familySupportsSchema,
 * with the tutor-facing instruction each one implies.
 *
 * Phrased more softly than the IEP block on purpose: a parent asking for
 * chunked work is a family preference, not an IDEA-mandated accommodation, and
 * the model should not be told otherwise.
 */
const FAMILY_SUPPORT_LINES = {
  extendedTime: 'Never rush {name}. Give extra time on every activity.',
  audioReadAloud: 'Read problems aloud where you can. Keep the language plain.',
  calculatorAllowed: 'Do not restrict calculator use. Focus on strategy, not arithmetic.',
  chunkedAssignments: 'Present 3-5 problems at a time, then check in.',
  breaksAsNeeded: 'Offer breaks proactively when energy dips.',
  digitalMultiplicationChart: 'A multiplication chart is fine. Do not penalise using one.',
  reducedDistraction: 'Keep visuals clean and uncluttered. One concept at a time.',
  largePrintHighContrast: 'Use clear, large, high-contrast visuals.',
  mathAnxietySupport: 'Extra encouragement. Normalise mistakes and celebrate effort.'
};

/**
 * Build the family-supports block for the tutor prompt.
 *
 * Precedence: the school IEP wins. Any switch the IEP already turns on is
 * skipped here, so the model never receives the same instruction twice under
 * two different authorities — and a parent can never soften or override
 * something a school put in a legal document. Family supports only fill gaps
 * the IEP leaves (including the common case of no IEP at all).
 *
 * @param {Object|null} familySupports - learningProfile.familySupports
 * @param {Object|null} iepPlan        - the school IEP, for precedence
 * @param {string} firstName
 * @returns {string} prompt fragment, or '' when there is nothing to say
 */
function buildFamilySupportsPrompt(familySupports, iepPlan, firstName) {
  if (!familySupports) return '';

  const iepAccom = (iepPlan && iepPlan.accommodations) || {};
  const active = Object.keys(FAMILY_SUPPORT_LINES).filter(
    key => familySupports[key] === true && iepAccom[key] !== true
  );

  const note = typeof familySupports.note === 'string' ? familySupports.note.trim() : '';
  if (active.length === 0 && !note) return '';

  let prompt = `\n--- FAMILY-REQUESTED SUPPORTS ---\n`;
  prompt += `${firstName}'s parent or guardian asked for these. They are not part of a school IEP, `;
  prompt += `but follow them unless an accommodation above already says otherwise.\n\n`;

  active.forEach(key => {
    prompt += `• ${FAMILY_SUPPORT_LINES[key].replace('{name}', firstName)}\n`;
  });

  if (note) {
    prompt += `• From the family: ${note}\n`;
  }

  return prompt;
}

/**
 * Build the student self-report block.
 *
 * Third tier, so it dedupes against BOTH higher ones: anything the school IEP
 * or the parent already set is not restated here. What is left is the student
 * speaking for themselves, and it is framed that way — the tutor should know
 * the difference between "the school requires this" and "this kid told me
 * they need it", even though it follows both.
 *
 * Only accessibility switches ever reach this function; utils/studentSupports.js
 * is the whitelist and excludes the rigor ones.
 *
 * @param {Object|null} studentSupports - learningProfile.studentSupports
 * @param {Object|null} familySupports  - learningProfile.familySupports
 * @param {Object|null} iepPlan         - the school IEP
 * @param {string} firstName
 * @returns {string} prompt fragment, or '' when there is nothing left to say
 */
function buildStudentSupportsPrompt(studentSupports, familySupports, iepPlan, firstName) {
  if (!studentSupports) return '';

  const iepAccom = (iepPlan && iepPlan.accommodations) || {};
  const family = familySupports || {};

  const active = Object.keys(FAMILY_SUPPORT_LINES).filter(key => (
    studentSupports[key] === true &&
    iepAccom[key] !== true &&
    family[key] !== true
  ));

  if (active.length === 0) return '';

  let prompt = `\n--- WHAT ${firstName.toUpperCase()} TOLD US THEY NEED ---\n`;
  prompt += `${firstName} asked for these themselves. Follow them, and don't make a point of it.\n\n`;

  active.forEach(key => {
    prompt += `• ${FAMILY_SUPPORT_LINES[key].replace('{name}', firstName)}\n`;
  });

  return prompt;
}

module.exports = {
  buildIepAccommodationsPrompt,
  buildFamilySupportsPrompt,
  buildStudentSupportsPrompt,
  FAMILY_SUPPORT_LINES
};
