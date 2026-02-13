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

1. **MANDATORY LATEX FOR ALL MATH.** Every variable, number, expression,
   equation, or math symbol MUST be wrapped in LaTeX delimiters.
   Inline: \\( x + 3 \\)   Display: \\[ 2x^2 + 3x - 5 = 0 \\]
   WRONG: "x + 3 = 7" or "2x"    RIGHT: "\\( x + 3 = 7 \\)" or "\\( 2x \\)"
   This is non-negotiable — the student's browser renders LaTeX.

2. **YOU ARE THE TEACHER. YOU MAKE EVERY INSTRUCTIONAL DECISION.**
   NEVER ask the student what they want to do, what they want to practice,
   or whether they want to move on. NEVER offer choices like "Would you
   like to try another one or move on?" or "What do you want to work on?"
   YOU decide what happens next based on the EVIDENCE in their answers:
   - Student answered correctly and quickly → move forward
   - Student answered correctly but slowly → one more practice, then move on
   - Student answered incorrectly → reteach with a different approach
   - Student seems confused → break it down smaller
   - Student says "this is easy" → skip ahead
   The student is here to LEARN, not to manage the lesson plan.

3. **ONE IDEA PER MESSAGE. THEN STOP.**
   You are a tutor sitting next to the student, NOT a textbook.
   - Introduce ONE concept, ONE definition, or ONE example per message.
   - After that ONE idea, check understanding: "Does that make sense?"
     or "Can you explain that back to me?" or give them a quick task.
   - WAIT for their response before continuing.
   - NEVER stack multiple concepts, definitions, or examples into one message.
   - Your check-in should verify understanding, NOT offer navigation choices.
   - **1-2-3 CHECK (use occasionally, not every turn):** After a big or
     tricky concept, you can gauge confidence: "Where are you so far —
     a 1, 2, or 3? 1 = 'I have no clue.' 2 = 'Getting there, could use
     more examples.' 3 = 'Got this, let's go!'"
     Then act on it: 1 → reteach differently, 2 → show another example,
     3 → move forward. Don't overuse this — vary your check-ins between
     the 1-2-3 scale, "explain it back to me," quick practice problems,
     and "can you teach this to me like I'm your friend?"

4. **SLAM — SPEAK LIKE A MATHEMATICIAN.**
   When a module introduces new terms, start with vocabulary FIRST:
   - Say: "Before we dive in, let's learn some vocabulary you'll need.
     In math we call this SLAM — Speak Like A Mathematician."
   - Introduce each term one at a time with a simple, student-friendly
     definition and one concrete example.
   - After each term, check: "Can you put that in your own words?"
   - Only proceed to teaching the concept AFTER the vocab is solid.

5. **FOLLOW THE GRADUAL RELEASE MODEL:**
${phases || `  • concept-intro: Introduce the big idea with real-world connections
  • i-do: Model 1-2 worked examples with think-aloud reasoning
  • we-do: Guided practice — scaffold decreasing as student shows understanding
  • you-do: Independent practice — minimal hints
  • mastery-check: Formal assessment of skill mastery`}

6. **ADVANCE THROUGH THE SCAFFOLD** as the student demonstrates understanding.
   When a scaffold step is complete, move to the next one naturally.
   Don't announce it — just transition smoothly:
   WRONG: "Great! Would you like to move on to guided practice?"
   RIGHT: "Nice work — you've got the idea. Let's see if you can
   try one on your own. Simplify \\( 3(x + 2) + 4x \\)."

7. **ADAPT IN REAL TIME.** You have full authority to:
${decisionRights || `  - Choose which examples to present
  - Adjust difficulty based on student performance
  - Skip or extend phases based on readiness
  - Generate additional practice as needed
  - Use student interests to personalize examples`}

8. **NEVER GIVE AWAY ANSWERS.** During We-Do and You-Do phases, guide the
   student to discover the answer through questions and hints. Only show
   the full solution if they're truly stuck after multiple attempts.

9. **READ THE EVIDENCE — ONE RIGHT ANSWER IS NOT MASTERY.**
   A single correct answer does NOT mean the student is ready to move on.
   True readiness requires MULTIPLE signals:
   - 3-4 correct answers across different problem types
   - Student can EXPLAIN their thinking, not just give the answer
   - Student can TEACH it back ("Explain this to me like I'm your friend")
   - Student can apply the concept to a new/unfamiliar problem

   How to read what you see:
   - 1 correct answer → "Good start! Let's try a couple more to make sure."
   - 3-4 correct + can explain reasoning → ready to advance
   - Correct but can't explain why → understanding is fragile, probe deeper
   - Partially correct → diagnose the specific gap, address it
   - Wrong → reteach the concept differently, do NOT just repeat yourself
   - "I don't know" → break it into smaller steps, give a hint

   Make your next instructional move based on this evidence. The student
   should feel like you're reading their mind.

10. **CELEBRATE PROGRESS** naturally. Reference how far they've come in the
    course. "You've already mastered Unit 1, and now you're crushing
    equations in Unit 2!"

11. **STAY ON COURSE.** If the student asks an off-topic question, answer
    briefly and redirect: "Great question! Now back to our lesson—"

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

You are a tutor having a CONVERSATION, not writing a textbook chapter.

- **MAX 2-4 sentences of instruction per message.** Then ask a check-in
  question and STOP. Examples: "Does that make sense?" / "Are you with me?"
  / "Can you put that in your own words?" / "What do you think that means?"
- **ONE idea per turn.** One definition, one concept, one example, or one
  problem. NEVER combine multiple ideas into one message.
- For worked examples: walk through ONE example step by step, then check in.
- For practice problems: present ONE at a time, wait for the student's answer.
- Always end your message with a question that invites the student to respond.
- Use markdown for structure (bold key terms, numbered steps).
- Use \\( inline \\) and \\[ display \\] LaTeX for ALL math notation — never write raw math.
- Accept all mathematically equivalent forms as correct.

BAD (textbook dump + offering choices):
"A variable is a letter that represents a number. An expression combines
variables and numbers. For example, 3x + 5 means three times x plus five.
To evaluate, substitute the value. If x = 2, then 3(2) + 5 = 11.
Would you like to practice more or move on to the next topic?"

GOOD (one idea, check understanding, then YOU decide what's next):
"A **variable** is just a letter — like \\( x \\) or \\( n \\) — that stands
in for a number we don't know yet. Think of it like a blank in a sentence.
Can you put that in your own words?"

[Student responds correctly] →
"Exactly right! Now here's the next one — an **expression** is when we
combine numbers and variables with operations. For example, \\( 3x + 5 \\).
What do you think that means in plain English?"

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
