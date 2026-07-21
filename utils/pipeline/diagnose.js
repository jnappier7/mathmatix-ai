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

const { parseCleanProblem, verifyAnswer, matchRootsInText } = require('../mathSolver');
const { symbolicVerify, equivalent, detectPosedArithmetic, bareNumericAnswer } = require('./symbolicVerifier');
const { analyzeError, findKnownMisconception, MISCONCEPTION_LIBRARY } = require('../misconceptionDetector');
const { hasMathematicalContent } = require('./verificationState');

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
async function diagnoseTransformation(observation, context) {
  const rawText = observation.raw || '';

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
        };
      }
    } catch (err) {
      console.error('[Diagnose] Step LLM verification failed:', err.message);
    }
  }

  return { ...noVerdict, answer: studentExpr, isTransformation: true };
}

async function diagnose(observation, context = {}) {
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
  let problemInfo = null;
  for (let i = recentAI.length - 1; i >= 0; i--) {
    const msg = recentAI[i];

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
    const verification = verifyAnswer(studentAnswer, problemInfo.correctAnswer);
    isCorrect = verification.isCorrect;
    correctAnswer = problemInfo.correctAnswer;
    verificationSource = 'solver';
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
      }
    } catch (_) { /* never break diagnosis */ }
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
        const aiAnalysis = await analyzeError(
          { content: problemInfo?.content || 'Unknown problem', answer: correctAnswer },
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
  const demonstratedReasoning = isCorrect === true && observation.demonstratedReasoning === true;
  const hasExplanation = observation.answer?.hasExplanation === true;

  // A partial multi-root answer is "correct but incomplete" — its own type so
  // the decide stage affirms + asks for the rest, never the wrong-answer ladder.
  let type;
  if (multiRoot && multiRoot.partial) {
    type = 'correct_partial';
  } else {
    type = isCorrect === null ? 'unverifiable' : (isCorrect ? 'correct' : 'incorrect');
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
    verificationSource,     // 'solver' | 'arithmetic_override' | 'llm' | 'root_set' | null
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
  diagnose,
  gradeRootSet,
  estimateIndependence,
  hasLibraryMisconceptions,
  arithmeticMatchesAnswer,
  // Exported for testing
  diagnoseTransformation,
  extractBareExpression,
  resolveProblemExpression,
};
