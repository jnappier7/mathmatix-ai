#!/usr/bin/env bash
# Nightly tutor-quality eval: run the live LLM eval suites N times per model
# and aggregate pass rates. The live tier is nondeterministic by design, so a
# single run proves nothing — repeated runs separate stable regressions from
# model noise (see scripts/nightlyEvalSummary.js for the failure rule).
#
# Usage (locally):  set -a; source .env; set +a; bash scripts/nightly-tutor-eval.sh
# Env knobs:
#   MODELS          space-separated tutor models   (default: the prod model only)
#   RUNS_PER_MODEL  live-suite runs per model      (default: 5)
#   OUT_DIR         where per-run jest logs land   (default: eval-nightly-logs)
#
# The default deliberately names ONE model: the one prod runs (TUTOR_MODEL on
# Render, gpt-4o-mini since 2026-08-18). It used to also run claude-sonnet-5
# "as the prod model" after prod had already left it, and that half cost
# ~$5.50 a night in 20K-token eval turns for a model no student was talking
# to. Evaluate a candidate model by passing MODELS explicitly (or the
# workflow_dispatch input), not by widening this default.
set -uo pipefail

MODELS=${MODELS:-"gpt-4o-mini"}
RUNS_PER_MODEL=${RUNS_PER_MODEL:-5}
OUT_DIR=${OUT_DIR:-eval-nightly-logs}

if [ -z "${OPENAI_API_KEY:-}" ]; then
  echo "ERROR: OPENAI_API_KEY is not set — the live eval and its judges need it." >&2
  exit 2
fi
case " $MODELS " in
  *" claude"*)
    if [ -z "${ANTHROPIC_API_KEY:-}" ]; then
      echo "ERROR: ANTHROPIC_API_KEY is not set but MODELS includes a claude model." >&2
      exit 2
    fi ;;
esac

mkdir -p "$OUT_DIR"

for model in $MODELS; do
  for run in $(seq 1 "$RUNS_PER_MODEL"); do
    log="$OUT_DIR/${model}-run${run}.log"
    echo "=== $model run $run/$RUNS_PER_MODEL ==="
    # Jest exits non-zero on any test failure; that's data here, not an abort.
    TUTOR_MODEL="$model" RUN_LLM_EVAL=1 npx jest \
      --testPathPattern='tests/eval/(liveEval|livePersonaEval)' \
      --verbose > "$log" 2>&1 || true
    grep -E '^Tests:' "$log" || echo "WARNING: no jest summary in $log (crash?)"
  done
done

node scripts/nightlyEvalSummary.js "$OUT_DIR"
