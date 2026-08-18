/**
 * Credential guard for the LIVE eval suites.
 *
 * `tests/setup.js` stamps placeholder API keys so that module-load-time SDK
 * construction doesn't throw in unit tests. That makes `!!process.env.OPENAI_API_KEY`
 * a *useless* gate for a live eval: the var is always set, so the suite ran with
 * the literal string `test_openai_key`, every call 401'd, and nine scenarios
 * reported as behavioral failures. A missing key must SKIP, loudly — it must never
 * masquerade as the tutor giving bad answers.
 *
 * Keep PLACEHOLDERS in sync with tests/setup.js.
 */

const PLACEHOLDERS = new Set([
  'test_openai_key',
  'test_anthropic_key',
  'test_mathpix_id',
  'test_mathpix_key',
]);

function isRealKey(value) {
  return typeof value === 'string' && value.trim() !== '' && !PLACEHOLDERS.has(value.trim());
}

/**
 * Should a live eval suite run, and if not, why not?
 * @param {string} [envVar] credential the suite needs — defaults to the model's
 *   provider, inferred from TUTOR_MODEL so a Claude run checks the Claude key.
 * @returns {{run: boolean, reason: string|null, model: string}}
 */
function liveEvalGate(envVar) {
  const model = process.env.TUTOR_MODEL || 'gpt-4o-mini';
  const needed = envVar
    || (model.toLowerCase().startsWith('claude') ? 'ANTHROPIC_API_KEY' : 'OPENAI_API_KEY');

  if (process.env.RUN_LLM_EVAL !== '1') {
    return { run: false, reason: 'RUN_LLM_EVAL is not 1 (live evals are opt-in)', model };
  }
  if (!isRealKey(process.env[needed])) {
    return {
      run: false,
      model,
      reason: `${needed} is missing or is a test placeholder. The live eval needs a real key `
        + `for ${model}. Put it in .env (loaded automatically for live runs) or export it.`,
    };
  }
  return { run: true, reason: null, model };
}

/** Print the skip reason once, so an opted-in run that can't proceed says so. */
function warnIfBlocked(gate) {
  if (!gate.run && process.env.RUN_LLM_EVAL === '1') {
    console.warn(`\n[live-eval] SKIPPED — ${gate.reason}\n`);
  }
}

/**
 * Relabel a transport/billing/auth failure so it can never be read as a tutor
 * quality regression.
 *
 * This has now bitten three times: a placeholder API key (401), an exhausted
 * Anthropic credit balance (400), and a stale TUTOR_MODEL pointing at an
 * unfunded provider. Each surfaced as "9 behavioral scenarios failed" — which
 * looks exactly like the tutor started giving bad answers, and is instead a
 * pipe that never carried a reply. An eval that cannot reach the model has no
 * opinion about the model; it must say so in those words.
 *
 * Deliberately NOT swallowed into a pass. The run is still red, because you
 * asked for an eval and didn't get one — only the label changes.
 */
function asInfraError(err, model) {
  const status = err?.status ?? err?.response?.status;
  const body = err?.error?.error?.message || err?.message || String(err);
  const isProviderFailure = typeof status === 'number' || /credit balance|API key|quota|billing/i.test(body);
  if (!isProviderFailure) return err;

  const hint = /credit balance/i.test(body)
    ? `The ${model} provider account is out of credit. Fund it, or point TUTOR_MODEL at a funded provider.`
    : /API key/i.test(body)
      ? 'Check the provider key in .env.'
      : `Provider returned ${status}.`;

  const relabelled = new Error(
    `LIVE EVAL BLOCKED — this is INFRASTRUCTURE, not tutor quality. `
    + `No reply was ever generated for ${model}, so nothing was judged. ${hint}\n`
    + `  Provider said: ${body}`,
  );
  relabelled.cause = err;
  relabelled.isInfrastructure = true;
  return relabelled;
}

module.exports = { liveEvalGate, warnIfBlocked, isRealKey, asInfraError, PLACEHOLDERS };
