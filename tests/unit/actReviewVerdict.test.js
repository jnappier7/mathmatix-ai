/**
 * The tutor must hold the missed question and verify the key before it uses it.
 *
 * Owner evaluation, 2026-09-09, production transcript (conversation 6aa134b8…):
 *
 *   student: "I just finished an ACT Math practice test … Can we work through
 *             those one at a time, starting with the weakest?"
 *   tutor:   "Can you share the specific question you missed on that topic?"
 *   student: "Let's go over question 1."
 *   tutor:   "Got it! … Can you share the details of the question?"
 *   student: "Question 1 was: What is the supplement of a 128 degree angle? …
 *             I picked 52 and the test marked it wrong. Was I wrong?"
 *   tutor:   "You chose 52°, which is close but not quite right."
 *   student: "180 - 128 = 52. So isn't 52 degrees exactly right?"
 *   tutor:   "You're absolutely right in your calculation!"
 *
 * Three failures, three seams:
 *   1. The question was in the system prompt and the ACTION DIRECTIVES in the
 *      last user turn still had the tutor ask for it → decide now puts the
 *      review context in the directives (applyActReviewDirective).
 *   2. "The test marked it wrong" was treated as evidence → the grade-dispute
 *      guard makes the tutor do the math first, in any chat.
 *   3. The reversal came from insistence, not derivation → the pushback guard
 *      makes the tutor re-derive and change its verdict only on the math.
 * And the review prompt itself now says "verify the key", with a control tag
 * (<KEY_DISPUTE>) that turns a disagreement into an audit record.
 */

const { decide } = require('../../utils/pipeline/decide');
const { extractSystemTags } = require('../../utils/pipeline/verify');
const { reviewPromptSection } = require('../../utils/actReview');

function obs(raw, extra = {}) {
  return {
    messageType: 'question', raw, confidence: 0.8,
    streaks: { giveUpCount: 0, recentCorrectCount: 0, recentWrongCount: 0 },
    ...extra,
  };
}
function run(raw, context = {}) {
  return decide(obs(raw), { type: 'unknown' }, { phaseState: null, activeSkill: null, ...context });
}
const joined = (d) => d.directives.join('\n');

describe('applyActReviewDirective — the tutor is told it HAS the question', () => {
  const miss = { position: 1, problemId: 'low-volume-2026-act-basic-geometry-measures-02', theirAnswer: 'B', correctOption: 'D' };

  test('with a miss in context, the review directives lead the list', () => {
    const d = run("Let's go over question 1.", { actReviewMiss: miss, isCourseMode: true });
    expect(d.directives[0]).toMatch(/YOU HAVE THE QUESTION/);
    expect(d.directives[0]).toMatch(/Question #1/);
    expect(d.directives[0]).toMatch(/Do NOT ask them to share, paste, remember, or describe/);
    expect(d.directives[1]).toMatch(/VERIFY THE KEY BEFORE YOU USE IT/);
    expect(d.directives[1]).toMatch(/<KEY_DISPUTE: your answer>/);
  });

  test('the handoff message itself gets the same directives', () => {
    const d = run('I just finished an ACT Math practice test — estimated score 34 (43/45 correct). The specific skills I missed questions on: Angles & parallel lines (missed 1/1). Can we work through those one at a time, starting with the weakest?', { actReviewMiss: miss, isCourseMode: true });
    expect(joined(d)).toMatch(/YOU HAVE THE QUESTION/);
  });

  test('no miss in context → nothing added', () => {
    const d = run("Let's go over question 1.");
    expect(joined(d)).not.toMatch(/YOU HAVE THE QUESTION/);
    expect(joined(d)).not.toMatch(/KEY_DISPUTE/);
  });
});

describe('applyGradeDisputeGuard — "the test marked it wrong" is not evidence', () => {
  test('the production message triggers the do-the-math-first directive', () => {
    const d = run('Question 1 was: What is the supplement of a 128 degree angle? The choices were 38, 62, 232, and 52. I picked 52 and the test marked it wrong. Was I wrong?');
    expect(joined(d)).toMatch(/SAYS AN ANSWER WAS MARKED WRONG/);
    expect(joined(d)).toMatch(/Do the math yourself, completely, before any verdict/);
    expect(joined(d)).toMatch(/Never invent a reason a correct answer is 'not quite right'/);
  });

  test.each([
    'the answer key says 62 but I got 52',
    'my teacher said this was incorrect',
    'the app counted it as wrong',
    'was I right?',
    "isn't 52 the answer?",
  ])('also fires on: %s', (msg) => {
    expect(joined(run(msg))).toMatch(/SAYS AN ANSWER WAS MARKED WRONG/);
  });

  test('ordinary math talk does not trigger it', () => {
    expect(joined(run('how do I find the supplement of an angle?'))).not.toMatch(/MARKED WRONG/);
    expect(joined(run('x = 15'))).not.toMatch(/MARKED WRONG/);
  });
});

describe('applyGradeDisputeGuard — pushback re-derives instead of caving', () => {
  const afterVerdict = {
    conversation: {
      messages: [
        { role: 'user', content: 'I picked 52 and the test marked it wrong. Was I wrong?' },
        { role: 'assistant', content: 'Remember, supplementary angles add up to 180°. You chose 52°, which is close but not quite right. Can you walk me through how you calculated the supplement?' },
      ],
    },
  };

  test('the production pushback line gets the re-derive directive', () => {
    const d = run("180 - 128 = 52. So isn't 52 degrees exactly right?", afterVerdict);
    expect(joined(d)).toMatch(/PUSHING BACK ON YOUR VERDICT/);
    expect(joined(d)).toMatch(/Change your verdict ONLY if the math changes it/);
    expect(joined(d)).toMatch(/Insistence is not evidence/);
  });

  test('pushback without a prior verdict is not pushback', () => {
    const d = run("180 - 128 = 52. So isn't 52 degrees exactly right?", {
      conversation: { messages: [{ role: 'assistant', content: 'What do you get for the supplement?' }] },
    });
    expect(joined(d)).not.toMatch(/PUSHING BACK/);
  });

  test('accepting the verdict is not pushback', () => {
    const d = run('ok, I see. can we do the next one?', afterVerdict);
    expect(joined(d)).not.toMatch(/PUSHING BACK/);
  });
});

describe('<KEY_DISPUTE> control tag', () => {
  test('is extracted with the claimed answer and stripped from the reply', () => {
    const raw = 'I get 52° here too — the stored answer says otherwise, so I am flagging this question.\n<KEY_DISPUTE: 52°>\nYour method was right.';
    const { text, extracted } = extractSystemTags(raw);
    expect(extracted.keyDispute).toEqual({ claimed: '52°' });
    expect(text).not.toMatch(/KEY_DISPUTE/);
    expect(text).toContain('Your method was right.');
  });

  test('a bare tag still counts', () => {
    const { text, extracted } = extractSystemTags('Flagging it. <key_dispute>');
    expect(extracted.keyDispute).toEqual({ claimed: null });
    expect(text).toBe('Flagging it.');
  });

  test('defaults to null', () => {
    expect(extractSystemTags('Nice work.').extracted.keyDispute).toBeNull();
  });
});

describe('reviewPromptSection — verify the key, present the question', () => {
  const miss = {
    position: 1, category: 'integrating-essential-skills', prompt: 'What is the supplement of a 128° angle?',
    options: [{ label: 'A', text: '38°' }, { label: 'B', text: '62°' }, { label: 'C', text: '232°' }, { label: 'D', text: '52°' }],
    theirAnswer: 'B', theirAnswerText: '62°', correctOption: 'D', explanation: '180 − 128 = 52.',
  };
  const section = reviewPromptSection(miss, 0, 2, []);

  test('tells the tutor it holds the question and the student cannot see it', () => {
    expect(section).toMatch(/YOU HAVE THE QUESTION; THE STUDENT DOES NOT/);
    expect(section).toMatch(/Never ask them to\s+share, paste, remember, or describe/);
  });

  test('frames the key as something to verify, not a fact about the student', () => {
    expect(section).toMatch(/VERIFY THE KEY BEFORE YOU USE IT/);
    expect(section).toMatch(/STORED KEY: D \(52°\)/);
    expect(section).toMatch(/RECORDED ANSWER: B \(62°\) — marked wrong against the stored key/);
    expect(section).not.toMatch(/— INCORRECT\./);
    expect(section).not.toMatch(/CORRECT ANSWER:/);
  });

  test('carries the dispute tag and the pushback rule', () => {
    expect(section).toMatch(/<KEY_DISPUTE: your answer>/);
    expect(section).toMatch(/IF THEY PUSH BACK ON A VERDICT/);
    expect(section).toMatch(/Never call a correct answer "close but not quite right"/);
  });

  test('a recorded answer the student disputes is believed', () => {
    expect(section).toMatch(/picked a different letter than the one recorded,\s+believe them/);
  });
});

describe('wiring pins (source-level — the seams that silently drop this)', () => {
  const fs = require('fs');
  const path = require('path');
  const read = (p) => fs.readFileSync(path.join(__dirname, '../../', p), 'utf8');

  test('routes/chat.js hands the miss to the pipeline and records disputes', () => {
    const src = read('routes/chat.js');
    expect(src).toMatch(/actReviewMiss,\s*\n\s*\}\);/);                       // runPipeline option
    expect(src).toMatch(/require\('\.\.\/models\/itemKeyDispute'\)/);
    expect(src).toMatch(/pipelineResult\.keyDispute/);
  });

  test('utils/pipeline/index.js passes it to decide and surfaces the dispute', () => {
    const src = read('utils/pipeline/index.js');
    expect(src).toMatch(/actReviewMiss: ctx\.actReviewMiss \|\| null/);
    expect(src).toMatch(/keyDispute: verified\.extracted\?\.keyDispute \|\| null/);
  });

  test('the admin audit endpoint exists', () => {
    expect(read('routes/admin.js')).toMatch(/router\.get\('\/item-disputes', isAdmin/);
  });
});
