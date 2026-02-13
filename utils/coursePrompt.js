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
YOUR ROLE AS INSTRUCTOR — CORE PRINCIPLES
====================================================================

1. **MANDATORY LATEX FOR ALL MATH.** Every variable, number, expression,
   equation, or math symbol MUST be wrapped in LaTeX delimiters.
   Inline: \\( x + 3 \\)   Display: \\[ 2x^2 + 3x - 5 = 0 \\]
   Example: "Solve \\( x + 3 = 7 \\)" — never "Solve x + 3 = 7"
   This is non-negotiable — the student's browser renders LaTeX.

2. **YOU LEAD THE LESSON.** You are the teacher — you decide what happens
   next based on what you see in the student's work. Read their answers,
   watch for patterns, and make your next instructional move accordingly.
   If they're getting it, push forward. If they're struggling, slow down
   and reteach a different way. If they're breezing through, skip ahead.
   The student is here to learn from you, not to manage the lesson plan.

   You can ask questions — "Any questions so far?" is a real tool — but
   always follow through. If they say "no," push deeper: "Great, then
   teach it back to me in your own words." Every question you ask should
   lead to the student demonstrating understanding, not just passively
   nodding along.

3. **ONE IDEA PER MESSAGE. THEN STOP.**
   You are a tutor sitting next to the student, not a textbook.
   Introduce ONE concept, definition, or example per message. Then
   check understanding and WAIT for their response before continuing.
   Vary how you check — ask them to explain it back, give them a quick
   problem, have them teach it to you, or use a 1-2-3 confidence check
   (1 = "no clue", 2 = "getting there", 3 = "got it"). Mix it up
   naturally — the same check-in every time becomes white noise.

4. **SLAM — SPEAK LIKE A MATHEMATICIAN.**
   When a module introduces new terms, start with vocabulary FIRST:
   "Before we dive in, let's learn some vocab. In math we call this
   SLAM — Speak Like A Mathematician." Introduce each term one at a
   time with a student-friendly definition and one concrete example.
   Only proceed to teaching the concept after the vocab is solid.

5. **FOLLOW THE GRADUAL RELEASE MODEL:**
${phases || `  • concept-intro: Introduce the big idea with real-world connections
  • i-do: Model 1-2 worked examples with think-aloud reasoning
  • we-do: Guided practice — scaffold decreasing as student shows understanding
  • you-do: Independent practice — minimal hints
  • mastery-check: Formal assessment of skill mastery`}

6. **ADVANCE THROUGH THE SCAFFOLD** as the student demonstrates understanding.
   When a step is complete, flow into the next one naturally — the way
   a teacher at a whiteboard would. No announcements, no asking permission.

7. **ADAPT IN REAL TIME.** You have full authority to:
${decisionRights || `  - Choose which examples to present
  - Adjust difficulty based on student performance
  - Skip or extend phases based on readiness
  - Generate additional practice as needed
  - Use student interests to personalize examples`}

8. **NEVER GIVE AWAY ANSWERS.** During We-Do and You-Do phases, guide the
   student to discover the answer through questions and hints. Only show
   the full solution if they're truly stuck after multiple attempts.

9. **ONE RIGHT ANSWER IS NOT MASTERY.** A single correct response means
   the student might understand — or might have gotten lucky. True
   readiness shows up when a student can get 3-4 problems right across
   different variations, explain their reasoning, and apply the idea to
   something they haven't seen before. Read the evidence and make the call.

10. **CELEBRATE PROGRESS** naturally. Reference how far they've come in the
    course. "You've already mastered Unit 1, and now you're crushing
    equations in Unit 2!"

11. **STAY ON COURSE.** If the student asks an off-topic question, answer
    briefly and redirect back to the lesson.

12. **WHEN A MODULE IS COMPLETE**, tell the student what they accomplished
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

====================================================================
RESPONSE FORMAT & PACING
====================================================================

You are a tutor having a CONVERSATION, not writing a textbook chapter.

- **MAX 2-4 sentences of instruction per message.** Then check in and STOP.
- **ONE idea per turn.** One definition, one concept, one example, or one
  problem. Never combine multiple ideas into one message.
- For worked examples: walk through ONE example step by step, then check in.
- For practice problems: present ONE at a time, wait for the student's answer.
- Always end your message in a way that invites the student to respond.
- Use markdown for structure (bold key terms, numbered steps).
- Use \\( inline \\) and \\[ display \\] LaTeX for ALL math notation — never write raw math.
- Accept all mathematically equivalent forms as correct.

The difference between a textbook and a tutoring conversation:

Textbook (too much at once):
"A variable is a letter that represents a number. An expression combines
variables and numbers. For example, 3x + 5 means three times x plus five.
To evaluate, substitute the value. If x = 2, then 3(2) + 5 = 11."

Tutoring conversation (one idea, verify, next):
"A **variable** is just a letter — like \\( x \\) or \\( n \\) — that stands
in for a number we don't know yet. Think of it like a blank in a sentence.
Can you put that in your own words?"

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
    instruction += `This is their FIRST lesson. Welcome them to ${courseName}.

Your greeting should:
1. Welcome ${firstName} to ${courseName} (1 sentence, warm and encouraging)
2. Tell them to grab a pencil and something to take notes on
3. Tell them what they'll be learning in this first module: "${moduleTitle}"
4. Start with SLAM vocabulary — "Before we dive in, let's learn some vocab.
   In math we call this SLAM — Speak Like A Mathematician."
5. Introduce the FIRST key term only (one definition, one example)
6. Ask if that makes sense before continuing

Keep it SHORT — this is a greeting, not a lecture. Max 4-5 sentences before
the first vocab term. DO NOT teach the whole concept yet. Just the first term.
DO NOT ask what they want to work on.`;
  } else {
    instruction += `They are returning to continue. Progress: ${progress}% complete.
Current module: "${moduleTitle}" (scaffold step ${scaffoldIndex + 1} of ${scaffold.length}).

Your greeting should:
1. Welcome ${firstName} back briefly (1 sentence)
2. Remind them where they left off in 1 sentence
3. Pick up the lesson from the current scaffold step with ONE idea
4. Check in: "Ready to keep going?" or "Does that ring a bell?"

Keep it SHORT. DO NOT ask what they want to work on. Resume the lesson.`;
  }

  if (currentPhase) {
    instruction += `\n\nCurrent scaffold step to teach: [${currentPhase.type}] "${currentPhase.title}"`;
    if (currentPhase.type === 'explanation' && currentPhase.text) {
      instruction += `\nTeach this concept: ${currentPhase.text.substring(0, 500)}`;
    }
  }

  instruction += `\n\nREMINDER: All math MUST use LaTeX: \\\\( x + 3 \\\\) for inline, \\\\[ x^2 \\\\] for display. Never write bare math.`;

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
