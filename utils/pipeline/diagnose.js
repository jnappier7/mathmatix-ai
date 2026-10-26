/**
 * DIAGNOSE STAGE — Answer verification + misconception detection
 *
 * When the observe stage classifies a message as an answer attempt,
 * this stage determines correctness and identifies misconceptions.
 *
 * Produces a clean diagnosis object that downstream stages consume.
 * The LLM never sees raw diagnosis logic — it gets a structured summary.
 *
 * @module pipeline/diagnose
 */

const { gradeBatch } = require('./batchGrading');
const { parseCleanProblem, verifyAnswer, matchRootsInText, extractEquationAroundEquals } = require('../mathSolver');
const { symbolicVerify, equivalent, detectPosedArithmetic, bareNumericAnswer, trueArithmeticStatement } = require('./symbolicVerifier');
const { analyzeError, findKnownMisconception, MISCONCEPTION_LIBRARY } = require('../misconceptionDetector');
const { hasMathematicalContent } = require('./verificationState');
const { verifyDerivation, isTrueArithmeticFact } = require('../derivationVerifier');
const { isFinalForm } = require('./solveCredit');
const { llmVerifyMethod, articulatesMethod } = require('./llmVerifier');
const { parseFractionOrDecimal } = require('../answerComparison');
const { stripThousandsSeparators } = require('../mathUnicodeNormalizer');

const COMPARISON_ANSWER = /^\s*(-?\d+(?:\.\d+)?(?:\s+\d+\/\d+|\/\d+)?)\s*(<=|>=|<|>)\s*(-?\d+(?:\.\d+)?(?:\s+\d+\/\d+|\/\d+)?)\s*$/;
const QUESTION_NUMBER = /-?\d+(?:\.\d+)?(?:\s+\d+\s*\/\s*\d+(?![\d.]))?(?:\s*\/\s*\d+)?/g;

/**
 * Grade a comparison answer ("3/7 > 2/5") against the pair the tutor posed.
 * A comparison has no single value, so no solver key exists for it — the key
 * the solver used to store was one of the two operands ("Compare 3/7 and 2/5"
 * → 0.4286), and a correct "3/7 > 2/5" was a miss (course audit, 2026-10-23).
 *
 * Deterministic and narrow: both operands must be (equivalent to) two distinct
 * numbers in the tutor's question — "15/35 > 14/35" compares the same pair.
 * Anything else returns null and grading falls through unchanged.
 *
 * @returns {true|false|null}
 */
function gradeComparison(answer, questionText) {
  const m = typeof answer === 'string' && answer.match(COMPARISON_ANSWER);
  if (!m || typeof questionText !== 'string') return null;
  const a = parseFractionOrDecimal(m[1]);
  const b = parseFractionOrDecimal(m[3]);
  if (a == null || b == null || Math.abs(a - b) < 1e-12) return null;
  const posed = (stripLatexDelimiters(stripThousandsSeparators(questionText)).match(QUESTION_NUMBER) || [])
    .map(t => parseFractionOrDecimal(t.replace(/\s*\/\s*/g, '/')))
    .filter(v => v != null);
  const near = (x, y) => Math.abs(x - y) < 1e-9;
  if (!posed.some(v => near(v, a)) || !posed.some(v => near(v, b))) return null;
  switch (m[2]) {
    case '>': return a > b;
    case '<': return a < b;
    case '>=': return a >= b;
    case '<=': return a <= b;
    default: return null;
  }
}

/**
 * Strip LaTeX delimiters from text so regex-based math detection works.
 * AI messages store numbers wrapped in \(...\) or \[...\] per the system prompt's
 * MATH FORMATTING rule, but parseCleanProblem expects plain text.
 *
 * "When you add \(141\) and \(94\):" → "When you add 141 and 94:"
 */
function stripLatexDelimiters(text) {
  if (!text) return text;
  return text
    .replace(/\\\(([^)]*?)\\\)/g, '$1')   // \(expr\) → expr
    .replace(/\\\[([^\]]*?)\\\]/g, '$1')   // \[expr\] → expr
    .replace(/\$\$([^$]*?)\$\$/g, '$1')    // $$expr$$ → expr
    .replace(/(?<![\\$])\$([^$\n]+?)\$/g, '$1'); // $expr$ → expr (not currency)
}

/**
 * Run the full diagnosis pipeline on an answer attempt.
 *
 * @param {Object} observation - Output from observe stage
 * @param {Object} context
 * @param {Array}  context.recentAssistantMessages - Last few AI messages (to find the posed problem)
 * @param {Object} context.activeSkill - Current skill being practiced { skillId, displayName, teachingGuidance }
 * @param {Object} context.user - The user document (for misconception history)
 * @param {string} [context.pinnedProblemTex] - The canonical board problem (conversation.boardProblem.tex)
 * @returns {Object} Diagnosis result
 */

/**
 * Does the student's text state a SET of roots (a final answer to a
 * multi-root problem) rather than a single value? Requires 2+ numeric
 * candidates joined by a connector ("or" / "and" / comma), e.g.
 * "x = -7/3 or 1", "3 and 2". Used to gate the canonical-problem override
 * so single-value sub-step answers are never affected.
 */
function statesRootSet(text) {
  if (!text || typeof text !== 'string') return false;
  const t = text.toLowerCase();
  const nums = t.match(/-?\d+(?:\.\d+)?(?:\s*\/\s*\d+)?/g) || [];
  const hasConnector = /\bor\b|\band\b|,/.test(t);
  return nums.length >= 2 && hasConnector;
}

/**
 * Should the self-contained arithmetic check be trusted to override a solver
 * "wrong" verdict? Only when the stated arithmetic's RESULT is actually the
 * student's answer — e.g. "13-8 is 5" where the answer is 5. A true but
 * incidental calculation buried in a longer explanation ("...and 4×2 is 8...")
 * must NOT flip a genuinely wrong final answer to "correct".
 *
 * @param {number|null} arithmeticResult  the result of the matched arithmetic, or null
 * @param {string|number} studentAnswer   the extracted answer value
 * @returns {boolean}
 */
function arithmeticMatchesAnswer(arithmeticResult, studentAnswer) {
  if (arithmeticResult === null || arithmeticResult === undefined) return false;
  const answerNum = Number(String(studentAnswer).trim());
  return Number.isFinite(answerNum) && Math.abs(arithmeticResult - answerNum) < 0.001;
}
/**
 * Is this message, in its entirety, a bare mathematical expression?
 *
 * Used to recognise a student REWRITING the problem — "24-3+3" as the first step
 * of 24-6÷2+3 — which is work, not an answer, and which `extractAnswer` was
 * never built to catch (its algebraic pattern requires a letter, so a purely
 * numeric expression matched nothing at all).
 *
 * Deliberately strict: the whole message must be math, with at least one
 * operator and one digit. Prose containing an incidental number must not reach
 * the equivalence check, because a false "equivalent" here would affirm work the
 * student never did.
 *
 * @param {string} text
 * @returns {string|null} the expression, or null
 */
function extractBareExpression(text) {
  if (!text || typeof text !== 'string') return null;
  const stripped = stripLatexDelimiters(text).trim().replace(/[.!?]+$/, '');
  if (!stripped) return null;
  // Only math characters: digits, operators, parens, decimals, spaces, and
  // single letters for variables.
  if (!/^[-+*/^()[\]{}\d\s.,=×÷−a-z]+$/i.test(stripped)) return null;
  // Reject prose that happens to be all-letters ("so it is").
  if (!/\d/.test(stripped)) return null;
  // Must actually combine terms — a bare number is an answer, not a rewrite,
  // and is already handled by the answer path.
  if (!/[-+*/^×÷−]/.test(stripped.slice(1))) return null;
  // Any run of 2+ letters is a word, not a variable.
  if (/[a-z]{2,}/i.test(stripped)) return null;
  return stripped.replace(/×/g, '*').replace(/÷/g, '/').replace(/−/g, '-');
}

/**
 * Find the expression the student is currently working on.
 *
 * Prefers the pinned board problem (canonical). Falls back to scanning recent
 * tutor turns for a posed expression, because in chat-only sessions the tutor
 * frequently poses a problem inline and nothing ever gets pinned — which is the
 * common case for mental-math topics like order of operations.
 *
 * Returning null is safe: the caller then produces no verdict, the turn stays
 * UNVERIFIED, and the strict output rule makes the tutor ask rather than assert.
 * That is the intended failure direction.
 *
 * @returns {string|null}
 */
function resolveProblemExpression(context) {
  const candidates = [];
  if (context.pinnedProblemTex) candidates.push(context.pinnedProblemTex);

  const recentAI = context.recentAssistantMessages || [];
  for (let i = recentAI.length - 1; i >= 0; i--) {
    const content = stripLatexDelimiters(recentAI[i] && recentAI[i].content);
    if (!content) continue;
    // Pull math-looking substrings out of the tutor's prose. Longest first —
    // "24-6/2+3" beats the "6/2" fragment the tutor quoted while discussing it.
    const found = content.match(/[-+]?[\d.]+(?:\s*[-+*/^×÷−]\s*[-+]?[(]?[\d.]+[)]?)+/g) || [];
    found.sort((a, b) => b.replace(/\s/g, '').length - a.replace(/\s/g, '').length);
    for (const f of found) candidates.push(f);
  }

  for (const c of candidates) {
    const expr = String(c)
      .replace(/×/g, '*').replace(/÷/g, '/').replace(/−/g, '-')
      .trim()
      // Sentence punctuation swept up by the scan ("…24-6/2+3." -> "24-6/2+3").
      // mathjs tolerates a trailing dot, but only by luck — a trailing operator
      // or comma would fail the parse and silently cost us a verdict.
      .replace(/[.,;:]+$/, '')
      .trim();
    // Equations are out of scope here. A solving step on an equation is not
    // value-equivalent to the original (2x+3=13 -> 2x=10 changes both sides),
    // so treating it as such would produce confident nonsense.
    if (expr.includes('=')) continue;
    if (/\d/.test(expr) && /[-+*/^]/.test(expr.slice(1))) return expr;
  }
  return null;
}

/**
 * Diagnose a turn that carries math but produced no extractable ANSWER —
 * typically the student rewriting the problem mid-solution.
 *
 * This path exists because the pipeline used to bail out here entirely
 * (`return {type:'no_answer'}`), which meant no solver, no CAS, and no LLM
 * verifier ever saw the turn. The tutor was then handed a blank correctness
 * signal and filled it in by guessing.
 *
 * Verdicts are asymmetric on purpose:
 *   - equivalent to the problem  -> CORRECT (the CAS is exact; this is safe)
 *   - not equivalent             -> NO verdict from here. It may be a later step,
 *     an answer to a sub-question, or a genuine error, and the CAS cannot tell
 *     which. Defer to the LLM verifier; if that also declines, the turn stays
 *     unverifiable and the tutor must ask instead of accuse.
 */
/**
 * The verdict for a student turn that checks out as a correct STEP rather than
 * a final answer. `correctAnswer` stays null — there is nothing to reveal —
 * and `isTransformation` tells decide() to affirm and move forward rather than
 * run the close-out ladder. Mirrors the step-equivalence return below, which is
 * the established shape for this.
 */
function correctStep(observation, context, answer, source) {
  return {
    type: 'correct',
    isCorrect: true,
    answer,
    correctAnswer: null,
    misconception: null,
    evidence: {
      isCorrect: true,
      independenceLevel: estimateIndependence(observation, context),
      misconceptionHit: null,
      responseTimeCategory: null,
      problemContext: observation.problemContext,
      timestamp: new Date(),
    },
    verificationSource: source,
    isTransformation: true,
  };
}

// A single-answer linear parse: the one problem shape whose solution is exact
// enough to reject a rewrite on. Multi-root types stay with the root-set path.
function singleAnswerLinear(parsed) {
  return !!(parsed && parsed.hasMath && parsed.solution && parsed.solution.success === true
    && parsed.problem && parsed.problem.type === 'general_linear'
    && !(Array.isArray(parsed.solution.roots) && parsed.solution.roots.length > 1));
}

const normEqSide = (s) => String(s || '').replace(/\s+/g, '').replace(/^\((.*)\)$/, '$1');

/**
 * Grade one rewritten equation against the pinned linear problem.
 *
 * Returns a step verdict, or null when this is not that situation: no pin,
 * more or fewer than one "=", a non-linear shape on either side, the problem
 * restated verbatim, or a bare equation that shares no side with the pin (a
 * fresh problem handed over, not a step — observe's bare-drop reading stands).
 * A bare line that keeps one side of the pin intact ("3x - 4 = 2x + 5" under
 * "3(x - 4) = 2x + 5") is derived from it and is graded.
 */
function gradeEquationStep(rawText, observation, context) {
  const pinTex = context && context.pinnedProblemTex;
  if (!pinTex) return null;
  const text = stripLatexDelimiters(rawText).trim();
  if ((text.match(/=/g) || []).length !== 1) return null;
  // "x = 17" is the answer path's to grade and to credit as a solve — a
  // final-form line is never a step. The answer path also owns the asymmetry
  // for a FINAL value (a rejection there waits for corroboration), so any
  // "x = <value>" shape — "so x = \frac{4}{3} right?" included — stays out.
  if (isFinalForm(text)) return null;
  // The equation itself, not the sentence around it: "oh wait 3 times 4 is 12
  // so 3x - 12 = 2x + 5" parses whole as the arithmetic "3 times 4".
  const eqText = extractEquationAroundEquals(text) || text;
  let pinned;
  let line;
  try {
    pinned = parseCleanProblem(pinTex);
    line = parseCleanProblem(eqText);
  } catch (_) {
    return null;
  }
  if (!singleAnswerLinear(pinned) || !singleAnswerLinear(line)) return null;
  if (/^[a-z]$/i.test(String(line.problem.leftExpr).trim()) || /^[a-z]$/i.test(String(line.problem.rightExpr).trim())) return null;

  const sides = (p) => [normEqSide(p.problem.leftExpr), normEqSide(p.problem.rightExpr)];
  const [pl, pr] = sides(pinned);
  const [sl, sr] = sides(line);
  const restated = (sl === pl && sr === pr) || (sl === pr && sr === pl);
  if (restated) return null;
  // A bare equation is a step when it keeps a side of the pin, or when the
  // student introduced it as one ("so 3x = 21", "then …", "i got …"). With
  // neither, observe's reading — a fresh problem handed over — stands.
  const sharesSide = [sl, sr].some((s) => s === pl || s === pr);
  const continues = /^(?:so|then|now|next|ok(?:ay)?|um+|i\s+(?:got|get|have)|that\s+(?:gives|makes)|which\s+(?:gives|makes))\b/i.test(text);
  if (observation.isBareProblemDrop && !sharesSide && !continues) return null;

  const lineTex = `${line.problem.leftExpr} = ${line.problem.rightExpr}`;
  const ok = verifyAnswer(line.solution.answer, pinned.solution.answer).isCorrect === true;
  if (ok) {
    return { ...correctStep(observation, context, lineTex, 'symbolic:equation_step'), isStep: true };
  }
  return {
    type: 'incorrect',
    isCorrect: false,
    answer: lineTex,
    correctAnswer: null, // never the solution — the step is what went wrong
    misconception: null,
    evidence: {
      isCorrect: false,
      independenceLevel: estimateIndependence(observation, context),
      misconceptionHit: null,
      responseTimeCategory: null,
      problemContext: observation.problemContext,
      timestamp: new Date(),
    },
    verificationSource: 'symbolic:equation_step',
    isTransformation: true,
    isStep: true,
    derivation: { valid: false, firstBadStep: lineTex, finalAnswer: null },
  };
}

async function diagnoseTransformation(observation, context) {
  const rawText = observation.raw || '';

  // Multi-step shown work lands HERE — a derivation like "3x-5=16 / 3x=21 / x=7"
  // has no single extractable answer, so observe tags it general_math and routes
  // it to this transformation path. Grade the WHOLE chain before the single-step
  // logic: every line of a correct solution keeps the same answer, so we verify
  // each against the posed problem and pinpoint the first that breaks. A valid
  // chain is demonstrated reasoning by definition (decide affirms + advances,
  // never "how did you do it?"). correctAnswer stays null so nothing is revealed.
  const chain = verifyDerivation(rawText, context.pinnedProblemTex);
  if (chain.verifiable) {
    // A chain that stops short of the answer ("2(x+3)=10 / 2x+6=10") still
    // "reaches" it in the solver's sense — every line solves to the target — but
    // the student has not stated it. That is good work, not a finished problem.
    const solvedLines = chain.steps.filter(s => s.solved !== null);
    const lastLine = solvedLines.length ? solvedLines[solvedLines.length - 1].line : '';
    console.log(`[Diagnose] Derivation ${chain.valid ? 'valid' : `${chain.answerCorrect ? 'answer correct, work' : ''} broke at "${chain.firstBadStep}"`}`);
    return {
      type: chain.answerCorrect ? 'correct' : 'incorrect',
      isCorrect: chain.answerCorrect,
      answer: chain.finalAnswer,
      correctAnswer: null,
      misconception: null,
      evidence: {
        isCorrect: chain.answerCorrect,
        independenceLevel: estimateIndependence(observation, context),
        misconceptionHit: null,
        responseTimeCategory: null,
        problemContext: observation.problemContext,
        timestamp: new Date(),
      },
      verificationSource: 'derivation',
      demonstratedReasoning: chain.valid === true,
      derivation: { valid: chain.valid, firstBadStep: chain.firstBadStep, finalAnswer: chain.finalAnswer },
      // Right answer via broken work — same signal Step 2c derives on the
      // answer-attempt path, so decide can affirm-then-probe here too.
      isStep: chain.answerCorrect === true && !isFinalForm(lastLine),
      methodAudit: chain.answerCorrect && chain.valid === false
        ? {
          suspect: true,
          source: 'derivation',
          flaw: `the shown work breaks at "${chain.firstBadStep}" even though the final answer is right`,
          counterexample: null,
        }
        : null,
      isTransformation: true,
    };
  }

  // A closed arithmetic claim the student wrote out ("0.8(1.25)=1") is true or
  // false on its own terms — no posed problem needed, and no LLM. Checked here,
  // ahead of the extractors below, because none of them can reach it: the claim
  // states its own result, so extractBareExpression rejects it as not-a-step and
  // the turn died as `no_answer` with the tutor left to supply the arithmetic
  // itself. AFFIRM-ONLY — a false claim returns null and falls through.
  const statedTrue = trueArithmeticStatement(rawText);
  if (statedTrue !== null) {
    console.log(`[Diagnose] Student stated a TRUE arithmetic fact: "${rawText}"`);
    return correctStep(observation, context, statedTrue, 'symbolic:arithmetic_statement');
  }

  // The student re-asserting a bare number after the tutor posed a computation
  // ("still 1", "I get 1"). observe extracts no answer from those words, so the
  // answer path — which owns the posed-arithmetic check — never sees the turn.
  // That is the turn AFTER the tutor has already doubted them, when a correct
  // student most needs the pipeline to produce a verdict rather than let the
  // doubt compound. AFFIRM-ONLY: a mismatch stays undecided.
  const restated = bareNumericAnswer(rawText);
  const recent = context.recentAssistantMessages || [];
  if (restated != null && recent.length) {
    const lastTutor = recent[recent.length - 1] && recent[recent.length - 1].content;
    const posed = detectPosedArithmetic(lastTutor)
      || detectPosedArithmetic(lastTutor, { allowTrailingVariable: true });
    if (posed && equivalent(posed, restated) === true) {
      console.log(`[Diagnose] Restated answer "${restated}" matches the posed "${posed}" -> correct`);
      return correctStep(observation, context, restated, 'symbolic:arithmetic_restated');
    }
  }

  // ── One rewritten equation on a pinned linear equation ──
  // "distribute so 3x - 4 = 2x + 5" under 3(x - 4) = 2x + 5. One line, so
  // verifyDerivation (two or more) never sees it; an equation, so the
  // expression-equivalence path below declines it by design. The turn died as
  // `no_answer` and the tutor, holding no verdict on a distribution error, asked
  // the student to "fill in the blank" instead of naming it (owner session,
  // 2026-10-25). A linear equation solves exactly, so a rewrite that changes the
  // solution is wrong with the same certainty a wrong final answer is.
  const eqStep = gradeEquationStep(rawText, observation, context);
  if (eqStep) {
    console.log(`[Diagnose] Equation step "${eqStep.answer}" is ${eqStep.isCorrect ? 'equivalent to' : 'NOT equivalent to'} the pinned problem`);
    return eqStep;
  }

  // `no_answer` means "the student submitted no work of their own" — a question,
  // a pasted problem, a restatement. `unverifiable` means "they DID submit work
  // and verification could not decide". decide() keys teaching actions off this
  // distinction (a bare problem drop must still route to ELICIT_FIRST), so only
  // the second case may claim `unverifiable`.
  const noWork = {
    type: 'no_answer',
    isCorrect: null,
    answer: null,
    correctAnswer: null,
    misconception: null,
    evidence: null,
    verificationSource: null,
  };

  // On a dispute turn the message itself carries no math ("you are wrong"), so
  // the caller supplies the submission being disputed. Re-checking it is what
  // gives the turn a verdict instead of leaving the tutor to restate its claim.
  const studentExpr = extractBareExpression(rawText) || context.verificationCandidate || null;
  if (!studentExpr) return noWork;

  const problemExpr = resolveProblemExpression(context);
  if (!problemExpr) return noWork;

  // The student restating the problem verbatim is not a step — don't award it.
  const norm = (s) => s.replace(/[\s()]/g, '');
  if (norm(studentExpr) === norm(problemExpr)) return noWork;

  // From here on the student HAS submitted work and we are attempting to verify
  // it, so an undecided outcome is genuinely `unverifiable`.
  const noVerdict = { ...noWork, type: 'unverifiable' };

  let isEquivalent = null;
  try {
    isEquivalent = equivalent(studentExpr, problemExpr);
  } catch (_) { /* never break diagnosis */ }

  if (isEquivalent === true) {
    // Equivalence also settles a genuine ambiguity: in isolation, a rewrite step
    // ("3*6-5") is textually indistinguishable from a pasted new problem, and
    // observe's bare-problem-drop heuristic reads many steps as drops. A newly
    // dropped problem being numerically equivalent to the one already on the
    // table is vanishingly unlikely, so equivalence wins over that heuristic.
    console.log(`[Diagnose] Step equivalence: "${studentExpr}" == "${problemExpr}" — valid transformation`);
    return {
      type: 'correct',
      isCorrect: true,
      answer: studentExpr,
      correctAnswer: null, // a step, not the final answer — nothing to reveal
      misconception: null,
      evidence: {
        isCorrect: true,
        independenceLevel: estimateIndependence(observation, context),
        misconceptionHit: null,
        responseTimeCategory: null,
        problemContext: observation.problemContext,
        timestamp: new Date(),
      },
      verificationSource: 'symbolic:step_equivalence',
      isTransformation: true,
      // A correct step, not a solve — persist keeps the problem open (solveCredit).
      isStep: true,
    };
  }

  // Not equivalent. Now honour the bare-drop reading: with no equivalence to the
  // live problem, a lone expression really is most likely a new problem handed
  // over, not work to be graded. Emitting `unverifiable` here would misroute
  // decide() away from ELICIT_FIRST.
  if (observation.isBareProblemDrop) return noWork;

  // Not equivalent — see if the LLM verifier (fired in parallel) can resolve it.
  if (context.llmVerificationPromise) {
    try {
      const verdict = await context.llmVerificationPromise;
      if (verdict && verdict.isCorrect !== null) {
        console.log(`[Diagnose] Step LLM fallback: ${verdict.isCorrect ? 'correct' : 'incorrect'} (confidence: ${verdict.confidence.toFixed(2)})`);
        return {
          ...noVerdict,
          type: verdict.isCorrect ? 'correct' : 'incorrect',
          isCorrect: verdict.isCorrect,
          answer: studentExpr,
          correctAnswer: verdict.modelAnswer || null,
          verificationSource: 'llm:step',
          isTransformation: true,
          isStep: true,
        };
      }
    } catch (err) {
      console.error('[Diagnose] Step LLM verification failed:', err.message);
    }
  }

  return { ...noVerdict, answer: studentExpr, isTransformation: true };
}

/**
 * Diagnose a CONCEPTUAL reply — the student answered a question whose answer is
 * an idea rather than a value ("what distinguishes an asymptote from a hole?").
 *
 * Nothing in the numeric stack can grade this, and everything in it will grade
 * it WRONG if allowed to try: the words carry no answer to match, so the
 * comparison fails and the student is told a correct idea is incorrect. The
 * conceptual verifier judges the idea instead.
 *
 * Verdicts here are asymmetric for the same reason they are everywhere else in
 * this file: `correct` is affirmed, `partially_correct` is affirmed-and-extended
 * (never the wrong-answer ladder), and anything the judge could not settle stays
 * unverifiable rather than becoming a rejection.
 */
async function diagnoseConceptual(observation, context) {
  const verdict = await context.conceptualVerificationPromise;
  if (!verdict) return null;

  const base = {
    answer: null,
    correctAnswer: null,   // an unsaid idea is not ours to reveal (#1 anti-cheat rule)
    misconception: null,
    verificationSource: 'llm:conceptual',
    conceptual: {
      verdict: verdict.verdict || null,
      partial: verdict.partial === true,
      keyIdea: verdict.keyIdea || null,
      confidence: verdict.confidence || 0,
    },
  };
  const evidenceFor = (isCorrect) => ({
    isCorrect,
    independenceLevel: estimateIndependence(observation, context),
    misconceptionHit: null,
    responseTimeCategory: null,
    problemContext: observation.problemContext,
    timestamp: new Date(),
  });

  if (verdict.isCorrect === true) {
    console.log(`[Diagnose] Conceptual: correct (confidence: ${(verdict.confidence || 0).toFixed(2)})`);
    return { ...base, type: 'correct', isCorrect: true, evidence: evidenceFor(true), demonstratedReasoning: true };
  }
  if (verdict.isCorrect === false) {
    console.log(`[Diagnose] Conceptual: incorrect (confidence: ${(verdict.confidence || 0).toFixed(2)})`);
    return { ...base, type: 'incorrect', isCorrect: false, evidence: evidenceFor(false) };
  }
  if (verdict.partial === true) {
    console.log('[Diagnose] Conceptual: partially correct');
    return { ...base, type: 'correct_partial', isCorrect: null, evidence: null };
  }
  console.log(`[Diagnose] Conceptual: unverifiable (${verdict.verdict || verdict.error || 'no verdict'})`);
  return { ...base, type: 'unverifiable', isCorrect: null, evidence: null };
}

const REFERS_BACK = /\b(?:original|first (?:one|problem|question)|my (?:own )?(?:problem|question)|the other (?:one|problem)|earlier (?:one|problem)|previous (?:one|problem)|back to|revisit)\b/i;

/**
 * An earlier problem in the recent window that this answer is correct for,
 * other than the current target. Only stored problemInfo counts — never a
 * re-parse of prose, which is how intermediates became targets before.
 */
function findEarlierProblem(studentAnswer, current, recentAI) {
  for (let i = recentAI.length - 1; i >= 0; i--) {
    const info = recentAI[i] && recentAI[i].problemInfo;
    if (!info || info.correctAnswer == null) continue;
    if (String(info.correctAnswer) === String(current.correctAnswer)) continue;
    try {
      if (verifyAnswer(studentAnswer, info.correctAnswer).isCorrect) {
        return {
          problemType: info.type,
          correctAnswer: info.correctAnswer,
          roots: Array.isArray(info.roots) ? info.roots : null,
          steps: [],
          content: recentAI[i].content,
        };
      }
    } catch (_) { /* not comparable */ }
  }
  return null;
}

/**
 * Student audit, 2026-10-15: five systems posed as one numbered set, all five
 * answered correctly in one message with full work — and no verdict, so the
 * tutor restarted the steps on every one. See batchGrading.js.
 *
 * isCorrect is true only when every item verified; false when any item is
 * verifiably wrong; null otherwise. correctAnswer stays null: a wrong item's
 * answer is not ours to reveal.
 */
function diagnoseBatch(observation, context) {
  const recentAI = context.recentAssistantMessages || [];
  const latest = recentAI[recentAI.length - 1];
  if (!latest || typeof latest.content !== 'string') return null;
  const batch = gradeBatch(latest.content, observation.raw || '');
  if (!batch) return null;

  const isCorrect = batch.wrong > 0 ? false : (batch.undecided === 0 ? true : null);
  console.log(`[Diagnose] Numbered set: ${batch.correct} correct, ${batch.wrong} wrong, ${batch.undecided} undecided`);
  return {
    type: isCorrect === null ? 'unverifiable' : (isCorrect ? 'correct' : 'incorrect'),
    isCorrect,
    answer: batch.items.map((i) => `${i.n}) ${i.studentAnswer || '?'}`).join('; '),
    correctAnswer: null,
    misconception: null,
    evidence: {
      isCorrect,
      independenceLevel: estimateIndependence(observation, context),
      misconceptionHit: null,
      responseTimeCategory: null,
      problemContext: observation.problemContext,
      timestamp: new Date(),
    },
    demonstratedReasoning: isCorrect === true,
    hasExplanation: true,
    verificationSource: 'batch',
    batch,
  };
}

async function diagnose(observation, context = {}) {
  // A conceptual reply is graded on its IDEA, not on any number in it, and it
  // is routed here BEFORE the numeric stack — which would otherwise match the
  // student's words against a computed answer and reject them.
  if (context.conceptualVerificationPromise) {
    try {
      const conceptual = await diagnoseConceptual(observation, context);
      if (conceptual) return conceptual;
    } catch (err) {
      console.error('[Diagnose] Conceptual verification failed:', err.message);
    }
  }

  // A numbered set answered by number: grade every item, not just one. Ahead of
  // the single-answer path, which would latch onto Q1 (or nothing) and leave the
  // tutor with no verdict on work the student fully showed.
  const batchDiagnosis = diagnoseBatch(observation, context);
  if (batchDiagnosis) return batchDiagnosis;

  // No extractable answer does NOT mean nothing to verify. A student rewriting
  // the problem ("24-3+3") is doing verifiable work; bailing out here is what
  // left the tutor guessing. Route it through transformation diagnosis instead.
  if (!observation.answer) {
    return diagnoseTransformation(observation, context);
  }

  const studentAnswer = observation.answer.value;
  const recentAI = context.recentAssistantMessages || [];

  // ── Step 0: Self-contained arithmetic check ──
  // When the student states a complete arithmetic fact like "13-8 is 5",
  // verify the arithmetic itself FIRST. If the student's own arithmetic
  // is correct, trust it — don't let the math solver's interpretation
  // of the posed problem override an objectively true calculation.
  // This prevents false negatives like "13-8 is 5" being flagged wrong
  // because the solver evaluated "x-8" as -8 (missing substitution context).
  const rawText = observation.raw || '';
  const arithmeticMatch = rawText.match(
    /(-?\d+\.?\d*)\s*([+\-*/×÷])\s*(-?\d+\.?\d*)\s+(?:is|=|equals)\s+(-?\d+\.?\d*)/i
  );
  // Non-null once the student states a provably-correct arithmetic fact; holds
  // that fact's result so we can check it's actually the answer (see override).
  let arithmeticResult = null;
  if (arithmeticMatch) {
    const [, a, op, b, result] = arithmeticMatch;
    const numA = parseFloat(a);
    const numB = parseFloat(b);
    const numResult = parseFloat(result);
    let expected;
    switch (op) {
      case '+': expected = numA + numB; break;
      case '-': expected = numA - numB; break;
      case '*': case '×': expected = numA * numB; break;
      case '/': case '÷': expected = numB !== 0 ? numA / numB : NaN; break;
    }
    if (expected !== undefined && Math.abs(expected - numResult) < 0.001) {
      arithmeticResult = numResult;
    }
  }

  // ── Step 1: Find the problem that was posed ──
  // Prefer stored problemInfo metadata (set at persist time) over re-parsing.
  // This avoids fragile regex matching against the AI's natural language text —
  // the LLM can phrase problems in infinite ways that regex can't anticipate.
  // Fall back to re-parsing only for legacy messages that lack stored metadata.
  // ── The newest question wins ──
  // The scan below walks back until something parses, so a tutor who breaks a
  // problem into sub-questions keeps grading against the ORIGINAL problem.
  // Production, AP Calculus AB, 2026-07-28: the tutor had posed "simplify
  // (x^2-9)/(x-3)" (answer x+3, stored as problemInfo), then asked "what value
  // of x would make x - 3 equal zero?". The student answered "3", it was checked
  // against x+3, and a correct answer was called wrong.
  //
  // So when the LATEST tutor turn asks a question of its own, only that turn may
  // supply the grading target; anything older is stale. Emitting no verdict is
  // the safe direction — the symbolic tier and the LLM verifier both see the
  // actual question, and an undecided turn leaves the tutor asking, not accusing.
  const latestTurn = recentAI[recentAI.length - 1];
  const latestTurnAsksSomething = typeof latestTurn?.content === 'string'
    && latestTurn.content.includes('?');

  let problemInfo = null;
  for (let i = recentAI.length - 1; i >= 0; i--) {
    const msg = recentAI[i];

    if (latestTurnAsksSomething && i < recentAI.length - 1) {
      console.log('[Diagnose] Newer tutor question supersedes the older posed problem — deferring');
      break;
    }

    // Fast path: read pre-computed metadata stored at persist time
    if (msg.problemInfo && msg.problemInfo.correctAnswer != null) {
      problemInfo = {
        problemType: msg.problemInfo.type,
        correctAnswer: msg.problemInfo.correctAnswer,
        roots: Array.isArray(msg.problemInfo.roots) ? msg.problemInfo.roots : null,
        steps: [],
        content: msg.content,
      };
      break;
    }

    // Slow path: re-parse for legacy messages without stored metadata.
    // Strip LaTeX delimiters first — stored messages wrap numbers in \(...\)
    // which breaks regex-based math detection (e.g. "add \(141\) and \(94\)"
    // won't match the nlAddPattern expecting "add 141 and 94").
    const plainContent = stripLatexDelimiters(msg.content);
    // parseCleanProblem rejects the evaluation catch-all on prose-laden
    // text and extracts clean math substrings from sentences like
    // "Here's another for you: Solve 4x+3=27." so the fallback path
    // doesn't poison verification with a bogus correctAnswer.
    const result = parseCleanProblem(plainContent);
    if (result.hasMath && result.solution?.success) {
      problemInfo = {
        problemType: result.problem.type,
        correctAnswer: result.solution.answer,
        roots: Array.isArray(result.solution.roots) ? result.solution.roots : null,
        steps: result.solution.steps || [],
        content: msg.content,
      };
      break;
    }
  }

  // ── Canonical-problem override for multi-root final answers ──
  // The recent-message scan above can latch onto an INTERMEDIATE the tutor
  // wrote (e.g. a factored form "(3x+7)(x-1)=0"), whose parse yields a bogus
  // problem with no usable roots — so a correct final answer like
  // "x = -7/3 or 1" is graded wrong and the tutor regresses ("what's the first
  // step?"). When the student states a root-SET answer and the PINNED board
  // problem solves to multiple roots, grade against those: the pin is the
  // canonical problem the student is actually answering. Tightly gated
  // (root-set answer + multi-root pin) so single-value sub-step answers are
  // never affected.
  if (context.pinnedProblemTex && statesRootSet(rawText)) {
    try {
      const pinned = parseCleanProblem(context.pinnedProblemTex);
      const pinnedRoots = pinned?.solution?.success && Array.isArray(pinned.solution.roots)
        ? pinned.solution.roots
        : null;
      if (pinnedRoots && pinnedRoots.length > 1) {
        problemInfo = {
          problemType: pinned.problem.type,
          correctAnswer: pinned.solution.answer,
          roots: pinnedRoots,
          steps: [],
          content: context.pinnedProblemTex,
        };
      }
    } catch (_) { /* fall through to the scan result */ }
  }

  // ── Step 1b: The pin outranks an intermediate ──
  // The scan above takes the LAST assistant message that parses as a solvable
  // problem. While a tutor discusses a student's WRONG work it will often write
  // that wrong arithmetic down ("you had x/5 = 4, then you wrote 4/5 = 0.8"),
  // which parses and becomes the grading target. In production this graded a
  // student against the intermediate instead of their own problem, with damage
  // in both directions: the wrong answer 0.8 was confirmed as correct, AND the
  // genuinely correct answer 20 would have been marked wrong.
  //
  // So: when a pinned problem exists and solves, it is canonical.
  //   - answer matches the pin  -> grade against the pin (authoritative)
  //   - answer does not match, and the scanned target disagrees with the pin
  //     -> the scan found an intermediate. Emit NO verdict from it; fall through
  //        to the symbolic sub-question check and then the LLM verifier, which
  //        see the full conversation. Deferring is right here — a bare number
  //        may legitimately answer a tutor sub-question ("what's 50 x 3?"), and
  //        that path is handled below.
  if (context.pinnedProblemTex) {
    try {
      const pinned = parseCleanProblem(context.pinnedProblemTex);
      const pinnedAnswer = pinned?.solution?.success ? pinned.solution.answer : null;
      if (pinnedAnswer != null) {
        const matchesPin = verifyAnswer(studentAnswer, pinnedAnswer).isCorrect;
        if (matchesPin) {
          problemInfo = {
            problemType: pinned.problem.type,
            correctAnswer: pinnedAnswer,
            roots: Array.isArray(pinned.solution.roots) ? pinned.solution.roots : null,
            steps: pinned.solution.steps || [],
            content: context.pinnedProblemTex,
          };
        } else if (
          problemInfo
          && problemInfo.correctAnswer != null
          && !verifyAnswer(problemInfo.correctAnswer, pinnedAnswer).isCorrect
        ) {
          console.log(`[Diagnose] Scanned target "${problemInfo.correctAnswer}" disagrees with pin "${pinnedAnswer}" — deferring`);
          problemInfo = null;
        }
      }
    } catch (_) { /* fall through to the scan result */ }
  }

  // ── Step 2: Verify the answer ──
  let isCorrect = null;
  let correctAnswer = null;
  let verificationSource = null;
  let multiRoot = null;
  let derivation = null; // set when the student showed a multi-step chain

  // ── Step 2a: Multi-root solution sets ──
  // A quadratic / absolute-value problem has more than one root. The student
  // may name them one at a time across turns ("3", then "2") or together
  // ("3 and 2"). We grade by membership in the known root set rather than
  // string-comparing to "x = 3 or x = 2", and we accumulate which roots have
  // been supplied so naming one correct root is "correct but incomplete" — NOT
  // wrong. The cycle closes (fully correct) only once the student has supplied
  // every root themselves, so no unsaid answer is ever revealed.
  if (problemInfo && Array.isArray(problemInfo.roots) && problemInfo.roots.length > 1) {
    multiRoot = gradeRootSet(rawText, problemInfo.roots, context.lastProblemState);
    isCorrect = multiRoot.isCorrect; // true (complete) | false (named nothing in set) | null (partial)
    correctAnswer = problemInfo.correctAnswer;
    verificationSource = 'root_set';
  } else if (problemInfo) {
    // If the student SHOWED their work (a multi-line derivation), follow the
    // whole chain instead of string-matching only their final line: every step
    // of a correct solution keeps the same answer, so we grade each line against
    // the posed answer and pinpoint the FIRST that breaks. This is what makes
    // multi-step practice both grade correctly and get taught precisely.
    const chain = verifyDerivation(rawText, context.pinnedProblemTex, problemInfo.correctAnswer);
    if (chain.verifiable) {
      // The final line is the answer; `valid` (whole chain) feeds
      // demonstratedReasoning below, never correctness.
      isCorrect = chain.answerCorrect;
      correctAnswer = problemInfo.correctAnswer;
      verificationSource = 'derivation';
      derivation = chain;
    } else {
      const verification = verifyAnswer(studentAnswer, problemInfo.correctAnswer);
      isCorrect = verification.isCorrect;
      correctAnswer = problemInfo.correctAnswer;
      verificationSource = 'solver';
    }
  }

  // Override: if the student's own arithmetic is provably correct but the
  // solver-based verification says wrong, trust the student's math.
  // The solver likely misinterpreted the posed problem (e.g. "x-8" without
  // substitution context).
  //
  // Gated to when the arithmetic RESULT is actually the student's answer — a
  // true but incidental calculation inside a longer explanation must not flip a
  // genuinely wrong final answer to "correct" (a false-correct source).
  if (isCorrect === false && arithmeticMatchesAnswer(arithmeticResult, studentAnswer)) {
    console.log(`[Diagnose] Arithmetic override: student's "${rawText}" is mathematically correct — overriding solver mismatch`);
    isCorrect = true;
    correctAnswer = studentAnswer;
    verificationSource = 'arithmetic_override';
  }

  // ── Step 2a.2: The answer belongs to an EARLIER problem ──
  // A tutor who parks a student's problem to work a parallel one leaves two
  // problems open, and the newest is the grading target. Student audit,
  // 2026-10-15: the student asked about (2x+3)(x+1); the tutor switched to
  // (2x+4)(x+2); the student answered both ("for my original I get 2x²+5x+3")
  // and the original's correct answer was graded against the parallel's key —
  // stamped incorrect twice, and the tutor invented a "constant term" error.
  //
  // When the answer is wrong for the newest target but right for an earlier
  // problem in this conversation: if the student or the latest tutor turn
  // points back at it ("my original", "your original problem"), it is correct
  // for THAT problem. Without the pointer it is ambiguous — it could be a
  // student reusing an old answer by mistake — so emit no verdict rather than
  // a wrong one, and let the verifier that sees the conversation decide.
  if (isCorrect === false && problemInfo && (verificationSource === 'solver' || verificationSource === 'derivation')) {
    const earlier = findEarlierProblem(studentAnswer, problemInfo, recentAI);
    if (earlier) {
      const pointsBack = REFERS_BACK.test(rawText) || REFERS_BACK.test(latestTurn?.content || '');
      if (pointsBack) {
        console.log(`[Diagnose] Answer "${studentAnswer}" is correct for an earlier problem (${earlier.correctAnswer}) the turn points back to`);
        problemInfo = earlier;
        isCorrect = true;
        correctAnswer = earlier.correctAnswer;
        verificationSource = 'earlier_problem';
      } else {
        console.log(`[Diagnose] Answer "${studentAnswer}" matches an earlier problem, not the newest — deferring`);
        problemInfo = null;
        isCorrect = null;
        correctAnswer = null;
        verificationSource = null;
      }
      derivation = null;
    }
  } else if (isCorrect === null && !problemInfo && observation.answer) {
    // No current target at all (the newest tutor turn parsed to nothing), but
    // the turn points back at an earlier problem and the answer solves it:
    // that is the problem being answered. Same pointer rule as above — without
    // one, this stays undecided.
    const pointsBack = REFERS_BACK.test(rawText) || REFERS_BACK.test(latestTurn?.content || '');
    const earlier = pointsBack ? findEarlierProblem(studentAnswer, { correctAnswer: null }, recentAI) : null;
    if (earlier) {
      console.log(`[Diagnose] No current target; answer "${studentAnswer}" solves the earlier problem the turn points back to`);
      problemInfo = earlier;
      isCorrect = true;
      correctAnswer = earlier.correctAnswer;
      verificationSource = 'earlier_problem';
    }
  }

  // ── Step 2a.4: Multi-line shown work with NO solvable posed problem ──
  // The chain can still verify itself (each line resolves to the same value,
  // ending on the stated answer). Before multi-line messages carried an
  // extractable answer, these turns took the transformation path and got
  // exactly this internal-consistency check — keep that coverage here so a
  // chat-only session with an unparseable/absent pin doesn't regress to
  // unverifiable (or worse, a guess).
  if (isCorrect === null && multiRoot === null && /\n/.test(rawText)) {
    const chain = verifyDerivation(rawText, context.pinnedProblemTex);
    if (chain.verifiable) {
      isCorrect = chain.answerCorrect;
      verificationSource = 'derivation';
      derivation = chain;
      console.log(`[Diagnose] Internal chain: ${chain.valid ? 'consistent' : `broke at "${chain.firstBadStep}"`}`);
    }
  }

  // ── Step 2a.5: SYMBOLIC verification (deterministic, before the LLM) ──
  // Differentiate an integral answer back to the integrand, or numerically
  // compare an expression to the known answer — resolving the algebra/calculus
  // the solver can't parse (multi-term integrals, un-simplified forms, factored
  // vs expanded). This is where the tutor was getting isCorrect=null and then
  // guessing/false-flagging correct work. Deterministic and high-confidence;
  // it only ever ADDS a verdict — unparseable/undecidable stays null and falls
  // through to the LLM fallback, never a manufactured verdict.
  if (isCorrect === null && multiRoot === null) {
    try {
      const sym = symbolicVerify({
        studentAnswer,
        correctAnswer: problemInfo && problemInfo.correctAnswer,
        problemTex: context.pinnedProblemTex,
      });
      if (sym.isCorrect !== null) {
        isCorrect = sym.isCorrect;
        if (sym.isCorrect && correctAnswer == null) correctAnswer = studentAnswer;
        verificationSource = 'symbolic:' + sym.method;
        console.log(`[Diagnose] Symbolic ${sym.method}: ${isCorrect ? 'correct' : 'incorrect'}`);
      }

      // Bare answer to a conversational arithmetic sub-question the tutor just
      // posed ("what's 50 × 3?" -> "150"). These are never the pinned problem,
      // so they went unverified and the tutor guessed / fumbled the arithmetic.
      // Verify the student's bare number against the tutor's last message.
      // Conservative: purely-numeric arithmetic vs a single-number answer only.
      if (isCorrect === null && recentAI.length) {
        const lastTutor = recentAI[recentAI.length - 1] && recentAI[recentAI.length - 1].content;
        const posed = detectPosedArithmetic(lastTutor);
        const ans = bareNumericAnswer(studentAnswer != null ? studentAnswer : rawText);
        if (posed && ans != null) {
          const r = equivalent(posed, ans);
          if (r !== null) {
            isCorrect = r;
            if (r && correctAnswer == null) correctAnswer = ans;
            verificationSource = 'symbolic:arithmetic';
            console.log(`[Diagnose] Arithmetic check: "${posed}" vs "${ans}" -> ${isCorrect ? 'correct' : 'incorrect'}`);
          }
        }

        // Second pass, AFFIRM-ONLY: the tutor wrote the computation with a
        // variable still attached to its last number — "we have 0.8 × 1.25P,
        // now multiply those two numbers together" — which the strict scan
        // discards whole. The student's correct "1" then had no target, and the
        // tutor spent four turns insisting it was wrong, finally asserting 0.8
        // is "10/8 or 5/4" (owner transcript, 2026-09-20).
        //
        // A relaxed candidate is a weaker read of what was asked ("2 + 3x" also
        // yields "2+3"), so it may CONFIRM a match and must never reject: a
        // mismatch here means the student answered a different question, not a
        // wrong one, and leaving it undecided keeps the tutor asking.
        if (isCorrect === null && ans != null) {
          const loose = detectPosedArithmetic(lastTutor, { allowTrailingVariable: true });
          if (loose && loose !== posed && equivalent(loose, ans) === true) {
            isCorrect = true;
            if (correctAnswer == null) correctAnswer = ans;
            verificationSource = 'symbolic:arithmetic_coefficient';
            console.log(`[Diagnose] Arithmetic check (coefficient form): "${loose}" vs "${ans}" -> correct`);
          }
        }
      }
    } catch (_) { /* never break diagnosis */ }
  }

  // ── Step 2a.5b: A comparison of the posed pair ──
  if (isCorrect === null && multiRoot === null) {
    const compared = gradeComparison(studentAnswer, latestTurn?.content);
    if (compared !== null) {
      isCorrect = compared;
      correctAnswer = compared ? studentAnswer : null;
      verificationSource = 'symbolic:comparison';
      console.log(`[Diagnose] Comparison "${studentAnswer}" of the posed pair -> ${compared ? 'correct' : 'incorrect'}`);
    }
  }

  // ── Step 2a.6: A closed arithmetic claim the student wrote out ──
  // "0.8(1.25)=1" — true or false on its own terms, whatever the pipeline did
  // or didn't resolve as the posed problem. Last of the deterministic tiers and
  // AFFIRM-ONLY, so it can only rescue a correct student from an undecided turn;
  // a false claim returns null and falls through to the LLM verifier unchanged.
  if (isCorrect === null && multiRoot === null) {
    const statedTrue = trueArithmeticStatement(rawText);
    if (statedTrue !== null) {
      isCorrect = true;
      if (correctAnswer == null) correctAnswer = statedTrue;
      verificationSource = 'symbolic:arithmetic_statement';
      console.log(`[Diagnose] Student stated a TRUE arithmetic fact: "${rawText}"`);
    }
  }

  // ── Step 2b: LLM verification fallback ──
  // The deterministic solver handles arithmetic and basic algebra, but fails on
  // derivatives, factored polynomials, trig identities, proofs, and word
  // problems. When the solver couldn't parse the posed problem (no problemInfo)
  // OR couldn't verify it (isCorrect stayed null), fall back to the parallel
  // LLM verdict fired at the start of the pipeline. Only trust high-confidence
  // verdicts — low-confidence stays unverifiable and the existing "compute
  // the answer yourself before responding" directives handle it.
  if (isCorrect === null && multiRoot === null && context.llmVerificationPromise) {
    try {
      const verdict = await context.llmVerificationPromise;
      if (verdict && verdict.isCorrect !== null) {
        isCorrect = verdict.isCorrect;
        correctAnswer = verdict.modelAnswer || correctAnswer;
        verificationSource = 'llm';
        console.log(`[Diagnose] LLM fallback: ${isCorrect ? 'correct' : 'incorrect'} (confidence: ${verdict.confidence.toFixed(2)}, modelAnswer: ${verdict.modelAnswer})`);
      }
    } catch (err) {
      console.error('[Diagnose] LLM verification await failed:', err.message);
    }
  }

  // ── Step 2c: Method audit — right answer, suspect rule ──
  // Correctness verification blesses the VALUE; nothing above audits the RULE
  // the student says they used. The butterfly-method failure (production eval
  // matrix, 2026-08-07): "10/24" is a verified-correct sum, but "add the
  // denominators for the numerator, multiply them for the denominator" is a
  // wrong generalization that happened to work — and with no audited signal,
  // the tutor was left to improvise the tension between affirming the answer
  // and heading off the bad rule, which it kept resolving as doubt-first.
  //
  // Two signals, deterministic first:
  //   a) shown symbolic work whose chain BROKE while the final answer is right
  //      (verifyDerivation already computed this — free), or
  //   b) a prose-articulated method on a correct answer, audited by a small
  //      fresh-context LLM call (gated by articulatesMethod, so bare answers
  //      never pay the latency; suspect only at high confidence).
  // decide() turns a suspect method into AFFIRM_THEN_PROBE: confirm the answer
  // FIRST (fast-correct policy), then probe the rule with the counterexample.
  let methodAudit = null;
  if (isCorrect === true) {
    if (derivation && derivation.verifiable && derivation.valid === false) {
      methodAudit = {
        suspect: true,
        source: 'derivation',
        flaw: `the shown work breaks at "${derivation.firstBadStep}" even though the final answer is right`,
        counterexample: null,
      };
    } else if (articulatesMethod(rawText)) {
      const problemText = problemInfo?.content || context.pinnedProblemTex || null;
      if (problemText) {
        try {
          const audit = await llmVerifyMethod(problemText, rawText);
          if (audit.suspect) {
            methodAudit = {
              suspect: true,
              source: 'llm',
              flaw: audit.flaw,
              counterexample: audit.counterexample,
              confidence: audit.confidence,
            };
            console.log(`[Diagnose] Method audit: correct answer, SUSPECT rule (${audit.confidence.toFixed(2)}) — ${audit.flaw || 'no flaw text'}`);
          }
        } catch (err) {
          console.error('[Diagnose] Method audit failed (non-fatal):', err.message);
        }
      }
    }
  }

  // ── Step 3: If incorrect, detect misconception ──
  let misconception = null;

  if (isCorrect === false && context.activeSkill) {
    // First try deterministic library match
    const knownMisconception = findKnownMisconception(
      context.activeSkill.skillId,
      `Student answered ${studentAnswer} instead of ${correctAnswer}`
    );

    if (knownMisconception) {
      misconception = {
        source: 'library',
        id: knownMisconception.id,
        name: knownMisconception.name,
        description: knownMisconception.description,
        fix: knownMisconception.fix,
        testQuestion: knownMisconception.testQuestion,
        severity: 'medium',
        confidence: 0.8,
      };
    } else {
      // Fall back to AI analysis (more expensive, but catches novel errors)
      try {
        // The pinned board problem, when there is one: problemInfo.content is
        // the WHOLE tutor message, so the analysis read every problem in it and
        // wrote cards like "combined the rates of the pumps and introduced an
        // unrelated polynomial" for a polynomial answer (QA handoff §2.4).
        const aiAnalysis = await analyzeError(
          { content: context.pinnedProblemTex || problemInfo?.content || 'Unknown problem', answer: correctAnswer },
          studentAnswer,
          context.activeSkill
        );

        misconception = {
          source: 'ai_analysis',
          id: null,
          name: aiAnalysis.misconceptionName,
          description: aiAnalysis.errorDescription,
          fix: null, // No predefined fix for novel misconceptions
          testQuestion: null,
          severity: aiAnalysis.severity,
          confidence: 0.6,
          rootCause: aiAnalysis.rootCause,
        };
      } catch (err) {
        console.error('[Diagnose] AI misconception analysis failed:', err.message);
        // Non-fatal: we still know the answer is wrong
      }
    }
  }

  // ── Step 4: Build evidence record ──
  const evidence = {
    isCorrect,
    independenceLevel: estimateIndependence(observation, context),
    misconceptionHit: misconception ? misconception.name : null,
    responseTimeCategory: null, // Will be set by caller if responseTime available
    problemContext: observation.problemContext,
    timestamp: new Date(),
  };

  // ── Step 5: Flag demonstrated reasoning ──
  // When a student provides both a correct answer AND shows their work/reasoning,
  // that's strong evidence of understanding. The decide stage uses this to skip
  // unnecessary scaffolding steps and affirm immediately.
  // A verified multi-step chain IS shown reasoning by definition — the student
  // laid out every step and each one checks out. So it counts as demonstrated
  // reasoning even if the observe stage didn't separately flag it. This is what
  // tells decide to affirm the work and move on — NOT ask "how did you do it?"
  // A suspect method vetoes the flag: observe's demonstratedReasoning is a
  // surface read ("they wrote prose alongside the answer"), and the audit just
  // determined that prose describes an invalid rule. Without the veto, decide
  // would stack "valid reasoning — affirm and advance, never probe" on the
  // exact turn the method needs probing.
  // Shown arithmetic counts too: a correct answer stated alongside true
  // sub-computations ("4 × 8 + 3 = 35, so 4 3/8 = 35/8") or written several
  // equivalent ways ("five tenths, 0.5, 5/10"). Without it decide's fallback
  // was "can you teach me how you did it?" — re-asking for the work on screen,
  // and the turn after it became the false miss (course audit, 2026-10-18..23).
  const shownArithmetic = observation.answer?.hasExplanation === true
    && (observation.answer.multipleForms === true || isTrueArithmeticFact(rawText));
  const demonstratedReasoning = isCorrect === true
    && !(methodAudit && methodAudit.suspect)
    && (observation.demonstratedReasoning === true
      || (derivation != null && derivation.valid === true)
      || shownArithmetic);
  const hasExplanation = observation.answer?.hasExplanation === true;

  // A partial multi-root answer is "correct but incomplete" — its own type so
  // the decide stage affirms + asks for the rest, never the wrong-answer ladder.
  let type;
  if (multiRoot && multiRoot.partial) {
    type = 'correct_partial';
  } else {
    type = isCorrect === null ? 'unverifiable' : (isCorrect ? 'correct' : 'incorrect');
  }

  // Undecided, but the message ends in ONE rewritten equation — "oh wait 3
  // times 4 is 12 so 3x - 12 = 2x + 5". observe pulled the "12" out as the
  // answer, the answer path graded it against the problem's solution and could
  // not decide, and the self-correction — the thing to affirm — went
  // unjudged (owner session, 2026-10-25). Same grader the transformation path
  // uses; a final-form line never reaches it.
  if (isCorrect === null && !multiRoot) {
    const eqStep = gradeEquationStep(rawText, observation, context);
    if (eqStep) {
      console.log(`[Diagnose] Equation step "${eqStep.answer}" (answer path fallback) is ${eqStep.isCorrect ? 'equivalent to' : 'NOT equivalent to'} the pinned problem`);
      return eqStep;
    }
  }

  return {
    type,
    isCorrect,
    answer: studentAnswer,
    correctAnswer,
    misconception,
    evidence,
    demonstratedReasoning,  // true = student gave correct answer + valid reasoning
    hasExplanation,         // true = answer was embedded in explanatory text
    verificationSource,     // 'solver' | 'arithmetic_override' | 'derivation' | 'earlier_problem' | 'llm' | 'root_set' | 'batch' | null
    // Right answer, suspect rule — present only when the answer verified correct
    // AND the articulated method was judged an invalid generalization. decide()
    // routes this to AFFIRM_THEN_PROBE (confirm first, then probe the rule).
    methodAudit,
    // Multi-step chain result — present only when the student showed their work.
    // firstBadStep is the exact line the reasoning broke on (null when valid), so
    // decide/generate can point right at it instead of grading the whole thing wrong.
    derivation: derivation ? {
      valid: derivation.valid,
      firstBadStep: derivation.firstBadStep,
      finalAnswer: derivation.finalAnswer,
    } : null,
    // Multi-root progress — present only while a solution set is being filled in.
    // foundRoots feeds the persist stage's cross-turn accumulator. rootsRemaining
    // is a COUNT only — never the unsaid root value (#1 anti-cheat rule).
    multiRoot: multiRoot ? {
      foundRoots: multiRoot.foundRoots,
      totalCount: multiRoot.totalCount,
      remainingCount: multiRoot.remainingCount,
      matchedThisTurn: multiRoot.matchedThisTurn,
    } : null,
    problemInfo: problemInfo ? {
      type: problemInfo.problemType,
      correctAnswer: problemInfo.correctAnswer,
      roots: problemInfo.roots || null,
    } : null,
  };
}

/**
 * Grade a student message against a known multi-root solution set, accumulating
 * which roots have been supplied across turns.
 *
 * @param {string} rawText - the student's raw message
 * @param {number[]} roots - the full solution set, e.g. [3, 2]
 * @param {Object|null} lastProblemState - persisted state; may carry foundRoots[]
 * @returns {{
 *   isCorrect: (true|false|null), partial: boolean, foundRoots: number[],
 *   matchedThisTurn: number[], remainingCount: number, totalCount: number
 * }}
 *   isCorrect: true = all roots now supplied; false = named nothing in the set;
 *   null = named a correct root but the set is still incomplete (partial).
 */
function gradeRootSet(rawText, roots, lastProblemState) {
  const TOL = 0.01;
  const priorFound = Array.isArray(lastProblemState?.foundRoots)
    ? lastProblemState.foundRoots
    : [];
  const matchedThisTurn = matchRootsInText(rawText, roots, TOL);

  // Union prior + this-turn matches, deduped within tolerance and kept in root order.
  const foundRoots = [];
  for (const root of roots) {
    const named = priorFound.some(f => Math.abs(f - root) <= TOL)
      || matchedThisTurn.some(m => Math.abs(m - root) <= TOL);
    if (named) foundRoots.push(root);
  }
  const remainingCount = roots.length - foundRoots.length;

  let isCorrect;
  let partial = false;
  if (matchedThisTurn.length === 0) {
    isCorrect = false;              // named no root in the set this turn
  } else if (remainingCount === 0) {
    isCorrect = true;               // every root supplied (possibly across turns)
  } else {
    isCorrect = null;               // correct root named, set still incomplete
    partial = true;
  }

  return {
    isCorrect,
    partial,
    foundRoots,
    matchedThisTurn,
    remainingCount,
    totalCount: roots.length,
  };
}

/**
 * Estimate independence level based on recent conversation signals.
 * Used for the independence pillar of 4-pillar mastery.
 *
 * @returns {'independent' | 'hint_assisted' | 'heavily_scaffolded'}
 */
function estimateIndependence(observation, context) {
  const recentUser = context.recentUserMessages || [];
  const lastFew = recentUser.slice(-4);

  const hintRequests = lastFew.filter(msg =>
    /\b(hint|help|stuck|don'?t\s*(understand|get\s*it)|idk|confused)\b/i.test(msg.content)
  ).length;

  if (hintRequests === 0) return 'independent';
  if (hintRequests <= 1) return 'hint_assisted';
  return 'heavily_scaffolded';
}

/**
 * Quick synchronous check: does this skill have known misconceptions?
 * Used by the decide stage to determine if misconception-specific
 * reteaching is available.
 */
function hasLibraryMisconceptions(skillId) {
  return skillId in MISCONCEPTION_LIBRARY;
}

module.exports = {
  gradeComparison,
  diagnose,
  gradeRootSet,
  estimateIndependence,
  hasLibraryMisconceptions,
  arithmeticMatchesAnswer,
  // Exported for testing
  diagnoseConceptual,
  diagnoseTransformation,
  extractBareExpression,
  resolveProblemExpression,
};
