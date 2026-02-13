// utils/coursePrompt.js
//
// Dedicated prompt builder for STRUCTURED COURSE MODE.
// When a student is enrolled in a course, the AI becomes an instructor
// following the gradual-release model — it LEADS instruction, never asks
// "what do you want to work on?"

const fs = require('fs');
const path = require('path');

/**
 * Build the complete course-mode system prompt.
 *
 * @param {Object} opts
 * @param {Object} opts.userProfile       – user document (.toObject())
 * @param {Object} opts.tutorProfile      – selected tutor config
 * @param {Object} opts.courseSession      – CourseSession document
 * @param {Object} opts.pathway           – parsed pathway JSON
 * @param {Object|null} opts.scaffoldData – parsed module JSON (scaffold array, goals, etc.)
 * @param {Object|null} opts.currentModule – the module entry from pathway.modules[]
 * @returns {string} system prompt
 */
function buildCourseSystemPrompt({ userProfile, tutorProfile, courseSession, pathway, scaffoldData, currentModule }) {
  const firstName = userProfile.firstName || 'Student';
  const courseName = pathway.track || courseSession.courseName || courseSession.courseId;
  const moduleTitle = currentModule?.title || courseSession.currentModuleId || 'Current Module';
  const unit = currentModule?.unit || '';
  const progress = courseSession.overallProgress || 0;

  // Determine scaffold position from session's currentScaffoldIndex (the step counter)
  const scaffoldIndex = courseSession.currentScaffoldIndex || 0;
  const scaffold = scaffoldData?.scaffold || [];
  const currentPhase = scaffold[scaffoldIndex] || scaffold[0] || null;

  // Build the module map for context
  const moduleMap = (courseSession.modules || []).map(m => {
    const pw = (pathway.modules || []).find(pm => pm.moduleId === m.moduleId);
    const label = pw?.title || m.moduleId;
    const status = m.status === 'completed' ? '✓' : m.status === 'in_progress' ? '►' : m.status === 'available' ? '○' : '🔒';
    return `  ${status} Unit ${pw?.unit || '?'}: ${label}`;
  }).join('\n');

  // Format the current scaffold step in detail
  let currentStepDetail = '';
  if (currentPhase) {
    currentStepDetail = formatScaffoldStep(currentPhase, scaffoldIndex, scaffold.length);
  }

  // Build the full scaffold outline (compact)
  const scaffoldOutline = scaffold.map((s, i) => {
    const marker = i === scaffoldIndex ? '▶' : i < scaffoldIndex ? '✓' : '○';
    return `  ${marker} ${i + 1}. [${s.type}] ${s.title}`;
  }).join('\n');

  // AI instruction model from pathway
  const aiModel = pathway.aiInstructionModel || {};
  const phases = (aiModel.phases || []).map(p => `  • ${p.phase}: ${p.aiRole}`).join('\n');
  const decisionRights = (aiModel.aiDecisionRights || []).map(r => `  - ${r}`).join('\n');

  // Essential questions for current module
  const essentialQs = (currentModule?.essentialQuestions || []).map(q => `  • ${q}`).join('\n');

  // Skills for current module
  const skills = (scaffoldData?.skills || currentModule?.skills || []).join(', ');

  // Teaching strategies from module
  const strategies = (scaffoldData?.instructionalStrategy || []).map(s => `  - ${s}`).join('\n');

  // Goals from module
  const goals = (scaffoldData?.goals || []).map(g => `  - ${g}`).join('\n');

  // Tutor personality
  const tutorName = tutorProfile?.name || 'MathMatix Tutor';
  const tutorPersonality = tutorProfile?.personality || '';

  // Student context
  const gradeLevel = userProfile.gradeLevel || '';
  const interests = userProfile.interests || '';
  const learningStyle = userProfile.learningStyle || '';
  const preferredLanguage = userProfile.preferredLanguage || 'en';
  const iepAccommodations = userProfile.iepPlan?.accommodations ? formatIEP(userProfile.iepPlan) : '';

  return `You are ${tutorName}, an AI math instructor leading a structured, self-paced course.
${tutorPersonality ? `Personality: ${tutorPersonality}` : ''}

====================================================================
COURSE MODE — YOU ARE THE INSTRUCTOR
====================================================================

You are teaching **${courseName}** to **${firstName}**.
${gradeLevel ? `Grade: ${gradeLevel}` : ''}
${interests ? `Interests: ${interests}` : ''}
${learningStyle ? `Learning style preference: ${learningStyle}` : ''}
${preferredLanguage !== 'en' ? `Preferred language: ${preferredLanguage}` : ''}
${iepAccommodations}

Overall progress: **${progress}%**

COURSE MAP:
${moduleMap}

====================================================================
CURRENT MODULE: ${moduleTitle}${unit ? ` (Unit ${unit})` : ''}
====================================================================

${goals ? `MODULE GOALS:\n${goals}\n` : ''}
${skills ? `SKILLS TO COVER: ${skills}\n` : ''}
${essentialQs ? `ESSENTIAL QUESTIONS:\n${essentialQs}\n` : ''}
${strategies ? `TEACHING STRATEGIES:\n${strategies}\n` : ''}

SCAFFOLD SEQUENCE (your lesson plan):
${scaffoldOutline}

${currentStepDetail}

====================================================================
YOUR ROLE AS INSTRUCTOR — CRITICAL RULES
====================================================================

1. **YOU LEAD INSTRUCTION.** Never ask "What do you want to work on?" or
   "What topic interests you?" You ARE the teacher — you decide what comes
   next based on the scaffold and the student's readiness.

2. **FOLLOW THE GRADUAL RELEASE MODEL:**
${phases || `  • concept-intro: Introduce the big idea with real-world connections
  • i-do: Model 2-4 worked examples with think-aloud reasoning
  • we-do: Guided practice — scaffold decreasing as student shows understanding
  • you-do: Independent practice — minimal hints
  • mastery-check: Formal assessment of skill mastery`}

3. **ADVANCE THROUGH THE SCAFFOLD** as the student demonstrates understanding.
   When a scaffold step is complete, move to the next one naturally.
   - After explanation → transition to worked examples
   - After I-Do → invite the student into guided practice
   - After We-Do → challenge them with independent problems
   - After You-Do → check mastery

4. **ADAPT IN REAL TIME.** You have full authority to:
${decisionRights || `  - Choose which examples to present
  - Adjust difficulty based on student performance
  - Skip or extend phases based on readiness
  - Generate additional practice as needed
  - Use student interests to personalize examples`}

5. **NEVER GIVE AWAY ANSWERS.** During We-Do and You-Do phases, guide the
   student to discover the answer through questions and hints. Only show
   the full solution if they're truly stuck after multiple attempts.

6. **TRACK PROGRESS SIGNALS.** When the student:
   - Answers correctly with confidence → ready to advance
   - Makes errors → provide targeted scaffolding before moving on
   - Expresses confusion → re-explain using a different approach
   - Says "I don't get it" → break it down further, use visuals/analogies
   - Says "this is easy" → consider skipping ahead or increasing difficulty

7. **CELEBRATE PROGRESS** naturally. Reference how far they've come in the
   course. "You've already mastered Unit 1, and now you're crushing
   equations in Unit 2!"

8. **STAY ON COURSE.** If the student asks an off-topic question, answer
   briefly and redirect: "Great question! Now back to our lesson—"

9. **USE LATEX** for all mathematical notation: \\( inline \\) and \\[ display \\].
   Show all steps clearly. Never skip steps in worked examples.

10. **WHEN A MODULE IS COMPLETE**, tell the student what they accomplished
    and preview what's coming next. Make it feel like an achievement.

====================================================================
PROGRESS SIGNALS (CRITICAL — you MUST emit these tags)
====================================================================

You have two signal tags that control the student's course progress.
Include them at the END of your response when the conditions are met.
The student will NOT see these tags — they are parsed by the server.

**1. <SCAFFOLD_ADVANCE>**
Emit this tag when the current scaffold step is COMPLETE and you are
transitioning to the next step. Conditions:
- After an explanation: you've taught the concept AND the student
  has engaged (answered your initial prompt or asked a question)
- After I-Do modeling: you've shown the worked examples AND the
  student has acknowledged understanding
- After We-Do guided practice: the student has correctly solved
  at least 2 problems with decreasing scaffolding
- After You-Do independent practice: the student has independently
  solved at least 2 problems correctly
- After a mastery check: the student has demonstrated proficiency

Do NOT emit this tag if:
- You just started teaching the current step
- The student is still struggling and needs more practice
- You are in the middle of a problem or explanation

**2. <MODULE_COMPLETE>**
Emit this tag when ALL scaffold steps in the current module are done.
This will unlock the next module and award XP. Only emit this AFTER
the final scaffold step (usually a mastery-check) is complete.

**3. <PROBLEM_RESULT:correct|incorrect|skipped>**
Emit when evaluating a student's answer to a practice problem.

EXAMPLE of a response that advances the scaffold:

"Great work! You nailed all three problems on combining like terms.
You clearly understand how to identify and combine terms with the
same variable and exponent.

Now let's level up — I'm going to walk you through some problems
that combine BOTH the distributive property AND combining like terms...

**Example 1:** Simplify \\( 3(2x + 4) + 5x - 2 \\)
..."
<SCAFFOLD_ADVANCE>

====================================================================
RESPONSE FORMAT & PACING
====================================================================

- **MAX 4-6 sentences per response.** Then STOP and wait for the student.
- Teach ONE concept or work ONE example per turn — never dump everything at once.
- For worked examples: show every step with the reasoning, but only ONE example per message.
- For practice problems: present ONE at a time, wait for the student's answer.
- Always end your message with a question or a prompt that invites the student to respond.
- Use markdown for structure (bold key terms, numbered steps).
- Use \\( inline \\) and \\[ display \\] LaTeX for ALL math notation — never write raw math.
- Accept all mathematically equivalent forms as correct.

====================================================================
`;
}

/**
 * Format a single scaffold step into detailed teaching instructions
 */
function formatScaffoldStep(step, index, total) {
  let detail = `\n▶ CURRENT STEP (${index + 1} of ${total}): [${step.type}] ${step.title}\n`;
  detail += `Phase: ${step.lessonPhase || step.type}\n`;
  if (step.skill) detail += `Skill: ${step.skill}\n`;
  if (step.skills) detail += `Skills: ${step.skills.join(', ')}\n`;
  detail += '\n';

  switch (step.type) {
    case 'explanation':
      detail += `TEACH THIS CONCEPT:\n${step.text || ''}\n\n`;
      if (step.initialPrompt) {
        detail += `After teaching, engage with: "${step.initialPrompt}"\n`;
      }
      break;

    case 'model':
      detail += `DEMONSTRATE WITH WORKED EXAMPLES:\n`;
      if (step.examples && step.examples.length > 0) {
        step.examples.forEach((ex, i) => {
          detail += `\nExample ${i + 1}: ${ex.problem}\n`;
          detail += `Solution: ${ex.solution}\n`;
          if (ex.tip) detail += `Teaching tip: ${ex.tip}\n`;
        });
      }
      if (step.initialPrompt) {
        detail += `\nAfter modeling, ask: "${step.initialPrompt}"\n`;
      }
      break;

    case 'guided_practice':
      detail += `GUIDED PRACTICE — Work these problems WITH the student:\n`;
      if (step.problems && step.problems.length > 0) {
        step.problems.forEach((p, i) => {
          detail += `\n  Problem ${i + 1}: ${p.question}\n`;
          detail += `  Answer: ${p.answer}\n`;
          if (p.hints && p.hints.length > 0) {
            detail += `  Hints (use if stuck): ${p.hints.join(' → ')}\n`;
          }
        });
      }
      detail += `\nPresent ONE problem at a time. Wait for student response. Scaffold heavily at first, then reduce support.\n`;
      if (step.initialPrompt) {
        detail += `Start with: "${step.initialPrompt}"\n`;
      }
      break;

    case 'independent_practice':
      detail += `INDEPENDENT PRACTICE — Student solves these on their own:\n`;
      if (step.problems && step.problems.length > 0) {
        step.problems.forEach((p, i) => {
          detail += `\n  Problem ${i + 1}: ${p.question}\n`;
          detail += `  Answer: ${p.answer}\n`;
          if (p.hints && p.hints.length > 0) {
            detail += `  Hints (ONLY if truly stuck): ${p.hints.join(' → ')}\n`;
          }
        });
      }
      detail += `\nPresent ONE problem at a time. Let the student work independently. Only provide hints after sustained struggle.\n`;
      break;

    default:
      if (step.text) detail += `${step.text}\n`;
      if (step.initialPrompt) detail += `Engage with: "${step.initialPrompt}"\n`;
  }

  return detail;
}

/**
 * Build the course-mode greeting instruction.
 * Replaces the generic "what do you want to work on?" greeting.
 */
function buildCourseGreetingInstruction({ userProfile, courseSession, pathway, scaffoldData, currentModule }) {
  const firstName = userProfile.firstName || 'Student';
  const courseName = pathway.track || courseSession.courseName;
  const moduleTitle = currentModule?.title || courseSession.currentModuleId;
  const progress = courseSession.overallProgress || 0;

  const scaffoldIndex = courseSession.currentScaffoldIndex || 0;
  const scaffold = scaffoldData?.scaffold || [];
  const currentPhase = scaffold[scaffoldIndex] || scaffold[0] || null;

  // Determine if this is first time in course or returning
  const isFirstLesson = scaffoldIndex === 0 && progress === 0;

  let instruction = `The student just opened their **${courseName}** course. `;

  if (isFirstLesson) {
    instruction += `This is their FIRST lesson. Welcome them to ${courseName} and immediately begin teaching.

Your greeting should:
1. Welcome ${firstName} to ${courseName} (1 sentence, warm but not excessive)
2. Tell them what they'll learn in this first module: "${moduleTitle}"
3. Dive straight into the first concept

DO NOT ask what they want to work on. DO NOT ask if they're ready. Just start teaching.`;
  } else {
    instruction += `They are returning to continue. Progress: ${progress}% complete.
Current module: "${moduleTitle}" (scaffold step ${scaffoldIndex + 1} of ${scaffold.length}).

Your greeting should:
1. Welcome ${firstName} back briefly (1 sentence)
2. Remind them where they left off
3. Continue teaching from the current scaffold step

DO NOT ask what they want to work on. Resume the lesson.`;
  }

  if (currentPhase) {
    instruction += `\n\nCurrent scaffold step to teach: [${currentPhase.type}] "${currentPhase.title}"`;
    if (currentPhase.type === 'explanation' && currentPhase.text) {
      instruction += `\nTeach this concept: ${currentPhase.text.substring(0, 500)}`;
    }
  }

  return instruction;
}

/**
 * Format IEP accommodations for the prompt
 */
function formatIEP(iepPlan) {
  const parts = [];
  if (iepPlan.accommodations?.extendedTime) parts.push('extended time');
  if (iepPlan.accommodations?.reducedProblems) parts.push('reduced problem count');
  if (iepPlan.accommodations?.readAloud) parts.push('read aloud support');
  if (iepPlan.accommodations?.calculator) parts.push('calculator access');
  if (parts.length === 0) return '';
  return `IEP Accommodations: ${parts.join(', ')}`;
}

/**
 * Load all course context needed for the prompt.
 * Encapsulates the fs reads so chat.js doesn't need to.
 *
 * @param {Object} courseSession – CourseSession document
 * @returns {Object} { pathway, scaffoldData, currentModule } or null
 */
function loadCourseContext(courseSession) {
  if (!courseSession) return null;

  try {
    const pathwayFile = path.join(__dirname, '../public/resources', `${courseSession.courseId}-pathway.json`);
    if (!fs.existsSync(pathwayFile)) return null;

    const pathway = JSON.parse(fs.readFileSync(pathwayFile, 'utf8'));
    const currentModule = (pathway.modules || []).find(m => m.moduleId === courseSession.currentModuleId);

    let scaffoldData = null;
    if (currentModule?.moduleFile) {
      const moduleFile = path.join(__dirname, '../public', currentModule.moduleFile);
      if (fs.existsSync(moduleFile)) {
        scaffoldData = JSON.parse(fs.readFileSync(moduleFile, 'utf8'));
      }
    }

    return { pathway, scaffoldData, currentModule };
  } catch (err) {
    console.error('[CoursePrompt] Error loading course context:', err.message);
    return null;
  }
}

module.exports = {
  buildCourseSystemPrompt,
  buildCourseGreetingInstruction,
  loadCourseContext
};
