# Mathmatix AI — Patent Potential Assessment

**Date:** March 7, 2026
**Status:** Initial assessment — consult patent attorney before filing

---

## Summary

Mathmatix AI contains **3 strong patent candidates** and **2 moderate candidates** based on novelty, technical specificity, and defensibility.

---

## Priority 1 — Strong Patent Candidates

### 1. Computerized Adaptive Testing with IRT & Multi-Criteria Convergence

**Key files:** `utils/irt.js`, `utils/catConfig.js`, `utils/catConvergence.js`, `utils/skillSelector.js`

**What's novel:**
- 2-Parameter Logistic IRT model with Newton-Raphson MLE for ability estimation
- Multi-criteria stopping rules (SE threshold, confidence interval width, information gain plateau, theta stability, alternating response pattern detection)
- Horizontal skill probing: requires testing 3+ different skills within a difficulty bin before advancing to the next tier
- LRU problem exclusion window (last 150 problems) for O(1) query performance instead of excluding full history
- Bayesian prior with tuned SD (1.25 logit units) allowing student data to dominate quickly

**Why it matters:** Most CAT systems use simple stopping rules and 1D difficulty progression. This system ensures breadth before depth and uses multiple independent convergence signals.

**Recommended filing:** Utility patent (US)

---

### 2. Anti-Cheat Visual Teaching Mode with Auto-Enforcement

**Key files:** `utils/antiCheatSafeguards.js`, `utils/visualCommandEnforcer.js`, `utils/visualTeachingParser.js`

**What's novel:**
- Multi-signal cheat detection (regex patterns + context window analysis + rapid-fire detection)
- Auto-injection of teaching mode (partial/example/full) based on cheat risk level
- Procedural step gating: renders setup + first steps of a procedure without showing the final answer
- System redirects to teaching rather than blocking — positive design pattern

**Why it matters:** Every AI tutor faces the "homework solver" problem. This system provides a defensible technical solution with broad market applicability.

**Recommended filing:** Utility patent (US)

---

### 3. Multi-Pillar Mastery Badge Framework with Strategy Detection

**Key files:** `utils/patternBadges.js`, `utils/habitBadges.js`, `utils/strategyBadges.js`, `utils/badgeAwarder.js`

**What's novel:**
- 4-pillar mastery measurement: accuracy, independence, transfer, and retention — each tracked separately
- 4-tier badge progression (Bronze → Silver → Gold → Diamond) with escalating criteria per pillar
- Pattern badges with tier upgrades (same badge ID evolves K-12, e.g., Equivalence: balance scales → symbolic equations → formal proofs)
- Strategy badges that detect and reward problem-solving methods, not just correct answers
- Counter-example probes to distinguish genuine understanding from parroting

**Why it matters:** Goes far beyond typical gamification. Pedagogically grounded and specific enough to defend.

**Recommended filing:** Utility patent (method) + Design patent (badge visual upgrade system)

---

## Priority 2 — Moderate Patent Candidates

### 4. Dynamic Prompt Compression for LLM Cost Optimization

**Key files:** `utils/promptCompact.js`, `utils/prompt.js`, `utils/llmGateway.js`

**What's novel:**
- Static/dynamic prompt separation for cache optimization (~45K tokens → ~3-4K tokens)
- Pedagogical knowledge distillation: replacing example-heavy prompts with rule-based instructions
- Dynamic detail tiers based on user maturity (onboarding → building → developing → fluent)

**Risk:** Prompt engineering techniques are evolving rapidly; harder to defend long-term.

### 5. Misconception Detection with Targeted Reteaching

**Key files:** `utils/misconceptionDetector.js`, `utils/hintSystem.js`, `utils/alternativeReasoning.js`

**What's novel:**
- Error type classification library with specific remediation per misconception
- Counter-example probes to detect mimicry vs. understanding
- Progressive hint system tied to misconception type

**Risk:** Similar concepts exist in ALEKS and other platforms; specific implementation adds some novelty.

---

## Not Recommended for Patenting

| Technology | Reason |
|-----------|--------|
| Clever SSO / Roster Sync | Implementation-specific, tied to third-party API |
| Dual-mode AI switching | Too incremental, prior art in LLM persona systems |
| General session/email management | Standard implementations |

---

## Action Items

1. **Consult a patent attorney** — especially one experienced in software/ed-tech patents
2. **Check disclosure timeline** — if any features were publicly demonstrated, the US 1-year grace period applies from first public disclosure
3. **Document design decisions** — keep records of why each algorithm choice was made
4. **Gather performance data** — A/B test results, cost savings metrics, and retention improvements strengthen patent claims
5. **Prior art search** — analyze Khan Academy, Brilliant.org, IXL, ALEKS for overlapping implementations
